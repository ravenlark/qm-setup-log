import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteCachedParsedTelemetryJson,
  getCachedParsedTelemetryJson,
  putCachedParsedTelemetryJson,
} from "./telemetryCache";

export const TELEMETRY_CHANGED_EVENT = "session-telemetry:changed";

export type SessionTelemetryFile = {
  id: string;
  user_id: string;
  session_id: string;
  original_filename: string;
  file_sha256: string;
  file_size_bytes: number;
  original_storage_path: string;
  parsed_storage_path: string;
  recording_started_at: string | null;
  recording_duration_seconds: number | null;
  parser_version: string;
  parse_status: "pending" | "parsed" | "failed";
  parse_error: string | null;
  metadata: Record<string, unknown>;
  derived: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ParsedTelemetryLap = {
  durationSeconds?: number | null;
  endSeconds?: number | null;
  index?: number;
  lapNumber?: number | string | null;
  startSeconds?: number | null;
};

export type ParsedTelemetryPayload = {
  derived?: Record<string, unknown> & {
    recordingDurationSeconds?: number | null;
  };
  file?: {
    originalName?: string;
    sha256?: string;
    sizeBytes?: number;
  };
  laps?: ParsedTelemetryLap[];
  metadata?: Record<string, unknown>;
};

const telemetryBucket = "telemetry-imports";
const parserVersion = "libxrk-0.12.0/mysetuplog-parser-1";
const parserUrl = import.meta.env.DEV
  ? "http://127.0.0.1:3015/api/telemetry/parse?includeSamples=true&maxSamples=5000"
  : "/api/telemetry/parse?includeSamples=true&maxSamples=5000";

const telemetryFileFields = [
  "id",
  "user_id",
  "session_id",
  "original_filename",
  "file_sha256",
  "file_size_bytes",
  "original_storage_path",
  "parsed_storage_path",
  "recording_started_at",
  "recording_duration_seconds",
  "parser_version",
  "parse_status",
  "parse_error",
  "metadata",
  "derived",
  "created_at",
  "updated_at",
].join(", ");

export async function fetchSessionTelemetryFiles(
  supabase: SupabaseClient,
  userId: string,
): Promise<SessionTelemetryFile[]> {
  const { data, error } = await supabase
    .from("session_telemetry_files")
    .select(telemetryFileFields)
    .eq("user_id", userId)
    .order("recording_started_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as SessionTelemetryFile[];
}

export async function importSessionTelemetryFile({
  file,
  sessionId,
  supabase,
  userId,
}: {
  file: File;
  sessionId: string;
  supabase: SupabaseClient;
  userId: string;
}): Promise<SessionTelemetryFile> {
  const parsed = await parseTelemetryFile(file);
  const fileSha256 = parsed.file?.sha256;
  if (!fileSha256) throw new Error("Parser did not return a file hash.");

  const { data: existing, error: existingError } = await supabase
    .from("session_telemetry_files")
    .select("id")
    .eq("session_id", sessionId)
    .eq("file_sha256", fileSha256)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) throw new Error(`${file.name} is already attached to this session.`);

  const telemetryFileId = crypto.randomUUID();
  const originalPath = `${userId}/${sessionId}/${telemetryFileId}/original${fileExtension(file.name)}`;
  const parsedPath = `${userId}/${sessionId}/${telemetryFileId}/parsed.json`;

  const { error: originalUploadError } = await supabase.storage
    .from(telemetryBucket)
    .upload(originalPath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (originalUploadError) throw originalUploadError;

  const parsedBlob = new Blob([JSON.stringify(parsed)], {
    type: "application/json",
  });
  const { error: parsedUploadError } = await supabase.storage
    .from(telemetryBucket)
    .upload(parsedPath, parsedBlob, {
      contentType: "application/json",
      upsert: false,
    });

  if (parsedUploadError) throw parsedUploadError;

  const payload = {
    id: telemetryFileId,
    user_id: userId,
    session_id: sessionId,
    original_filename: file.name,
    file_sha256: fileSha256,
    file_size_bytes: parsed.file?.sizeBytes ?? file.size,
    original_storage_path: originalPath,
    parsed_storage_path: parsedPath,
    recording_started_at: recordingStartedAt(parsed.metadata),
    recording_duration_seconds: recordingDurationSeconds(parsed),
    parser_version: parserVersion,
    parse_status: "parsed",
    parse_error: null,
    metadata: parsed.metadata ?? {},
    derived: parsed.derived ?? {},
  };

  const { data, error } = await supabase
    .from("session_telemetry_files")
    .insert(payload)
    .select(telemetryFileFields)
    .single();

  if (error) throw error;

  const laps = telemetryLapRows({
    laps: parsed.laps ?? [],
    sessionId,
    telemetryFileId,
    userId,
  });

  if (laps.length) {
    const { error: lapsError } = await supabase
      .from("session_telemetry_laps")
      .insert(laps);

    if (lapsError) throw lapsError;
  }

  const telemetryFile = data as unknown as SessionTelemetryFile;
  putCachedParsedTelemetryJson(telemetryFile, parsed).catch(() => undefined);

  return telemetryFile;
}

export async function fetchParsedTelemetryJson(
  supabase: SupabaseClient,
  storagePath: string,
): Promise<ParsedTelemetryPayload> {
  const { data, error } = await supabase.storage
    .from(telemetryBucket)
    .download(storagePath);

  if (error) throw error;
  return JSON.parse(await data.text()) as ParsedTelemetryPayload;
}

export async function fetchCachedParsedTelemetryJson(
  supabase: SupabaseClient,
  file: SessionTelemetryFile,
): Promise<ParsedTelemetryPayload> {
  const cached = await getCachedParsedTelemetryJson(file).catch(() => null);
  if (cached) return cached;

  const parsed = await fetchParsedTelemetryJson(
    supabase,
    file.parsed_storage_path,
  );
  putCachedParsedTelemetryJson(file, parsed).catch(() => undefined);
  return parsed;
}

export async function deleteSessionTelemetryFile({
  file,
  supabase,
}: {
  file: SessionTelemetryFile;
  supabase: SupabaseClient;
}) {
  const storagePaths = [
    file.original_storage_path,
    file.parsed_storage_path,
  ].filter(Boolean);

  if (storagePaths.length) {
    const { error: storageError } = await supabase.storage
      .from(telemetryBucket)
      .remove(storagePaths);

    if (storageError) throw storageError;
  }

  const { error } = await supabase
    .from("session_telemetry_files")
    .delete()
    .eq("id", file.id)
    .eq("session_id", file.session_id);

  if (error) throw error;
  deleteCachedParsedTelemetryJson(file.id).catch(() => undefined);
}

async function parseTelemetryFile(file: File): Promise<ParsedTelemetryPayload> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(parserUrl, {
    method: "POST",
    body: formData,
  });
  const text = await response.text();
  const payload = JSON.parse(text) as ParsedTelemetryPayload & {
    error?: string;
    detail?: string;
  };

  if (!response.ok) {
    throw new Error(payload.detail || payload.error || `Parser returned ${response.status}.`);
  }

  return payload;
}

function telemetryLapRows({
  laps,
  sessionId,
  telemetryFileId,
  userId,
}: {
  laps: ParsedTelemetryLap[];
  sessionId: string;
  telemetryFileId: string;
  userId: string;
}) {
  const lastLapIndex = laps.length - 1;

  return laps.flatMap((lap, index) => {
    const startSeconds = lap.startSeconds;
    const endSeconds = lap.endSeconds;
    const durationSeconds = lap.durationSeconds;

    if (
      typeof startSeconds !== "number" ||
      typeof endSeconds !== "number" ||
      typeof durationSeconds !== "number"
    ) {
      return [];
    }

    return [
      {
        user_id: userId,
        session_id: sessionId,
        telemetry_file_id: telemetryFileId,
        file_lap_index: lap.index ?? index,
        file_lap_number:
          lap.lapNumber === null || lap.lapNumber === undefined
            ? null
            : String(lap.lapNumber),
        global_lap_number: null,
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        duration_seconds: durationSeconds,
        is_partial: index === 0 || index === lastLapIndex,
      },
    ];
  });
}

function recordingStartedAt(metadata: Record<string, unknown> | undefined) {
  const logDate = typeof metadata?.["Log Date"] === "string" ? metadata["Log Date"] : "";
  const logTime = typeof metadata?.["Log Time"] === "string" ? metadata["Log Time"] : "";
  const dateMatch = logDate.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const timeMatch = logTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!dateMatch || !timeMatch) return null;

  const [, month, day, year] = dateMatch;
  const [, hour, minute, second = "0"] = timeMatch;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function recordingDurationSeconds(parsed: ParsedTelemetryPayload) {
  const derivedDuration = parsed.derived?.recordingDurationSeconds;
  if (typeof derivedDuration === "number" && Number.isFinite(derivedDuration)) {
    return derivedDuration;
  }

  return Math.max(
    0,
    ...(parsed.laps ?? [])
      .map((lap) => lap.endSeconds)
      .filter((value): value is number => typeof value === "number"),
  );
}

function fileExtension(filename: string) {
  const match = filename.match(/\.[a-z0-9]+$/i);
  return match?.[0].toLowerCase() ?? ".xrk";
}

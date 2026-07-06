import type { SupabaseClient } from "@supabase/supabase-js";
import {
  coerceFieldValue,
  emptyPayloads,
  payloadValueToInput,
  setupFieldsForCarType,
  type SetupFieldValue,
  type SetupValuePayload,
} from "./setupFields/index";

export type SetupSession = {
  id: string;
  user_id: string;
  car_id: string;
  engine_id: string | null;
  track_id: string;
  session_date: string;
  session_time: string | null;
  session_type: string;
  driver: string | null;
  is_baseline: boolean;
  setup_values: SetupValuePayload;
  result_values: SetupValuePayload;
  note_values: SetupValuePayload;
  air_temp: number | null;
  humidity: number | null;
  track_temp: number | null;
  track_condition: string | null;
};

export type SetupSessionInput = Record<string, string>;

export type SetupSessionInputField = string;

const commonNumericFields = new Set<string>([
  "air_temp",
  "humidity",
  "track_temp",
]);

const commonFields = new Set<string>([
  "car_id",
  "engine_id",
  "track_id",
  "session_date",
  "session_time",
  "session_type",
  "driver",
  "air_temp",
  "humidity",
  "track_temp",
  "track_condition",
]);

const sessionFields = [
  "id",
  "user_id",
  "car_id",
  "engine_id",
  "track_id",
  "session_date",
  "session_time",
  "session_type",
  "driver",
  "is_baseline",
  "setup_values",
  "result_values",
  "note_values",
  "air_temp",
  "humidity",
  "track_temp",
  "track_condition",
].join(", ");

export async function fetchSessions(
  supabase: SupabaseClient,
  userId: string,
): Promise<SetupSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select(sessionFields)
    .eq("user_id", userId)
    .order("session_date", { ascending: false })
    .order("session_time", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as unknown as SetupSession[];
}

export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  input: SetupSessionInput,
  carTypeSlug?: string | null,
): Promise<SetupSession> {
  const payload = sessionPayload(userId, input, carTypeSlug, { is_baseline: false });

  const { data, error } = await supabase
    .from("sessions")
    .insert(payload)
    .select(sessionFields)
    .single();

  if (error) throw error;
  return data as unknown as SetupSession;
}

export async function updateSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string,
  input: SetupSessionInput,
  carTypeSlug?: string | null,
): Promise<SetupSession> {
  const payload = sessionPayload(userId, input, carTypeSlug);

  const { data, error } = await supabase
    .from("sessions")
    .update(payload)
    .eq("id", sessionId)
    .select(sessionFields)
    .single();

  if (error) throw error;
  return data as unknown as SetupSession;
}

export async function toggleSessionBaseline(
  supabase: SupabaseClient,
  session: SetupSession,
): Promise<SetupSession> {
  if (session.is_baseline) {
    const { data, error } = await supabase
      .from("sessions")
      .update({ is_baseline: false })
      .eq("id", session.id)
      .select(sessionFields)
      .single();

    if (error) throw error;
    return data as unknown as SetupSession;
  }

  const { error: clearError } = await supabase
    .from("sessions")
    .update({ is_baseline: false })
    .eq("user_id", session.user_id)
    .eq("car_id", session.car_id)
    .eq("track_id", session.track_id);

  if (clearError) throw clearError;

  const { data, error } = await supabase
    .from("sessions")
    .update({ is_baseline: true })
    .eq("id", session.id)
    .select(sessionFields)
    .single();

  if (error) throw error;
  return data as unknown as SetupSession;
}

export async function deleteSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<void> {
  const { error } = await supabase.from("sessions").delete().eq("id", sessionId);

  if (error) throw error;
}

function sessionPayload(
  userId: string,
  input: SetupSessionInput,
  carTypeSlug?: string | null,
  extras: Record<string, string | number | null | boolean> = {},
) {
  const payloads = emptyPayloads();
  const fields = setupFieldsForCarType(carTypeSlug);
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));

  const payload: Record<
    string,
    string | number | null | boolean | SetupValuePayload
  > = {
    user_id: userId,
    car_id: input.car_id,
    engine_id: cleanUuid(input.engine_id),
    track_id: input.track_id,
    session_date: input.session_date,
    session_time: cleanOptional(input.session_time),
    session_type: input.session_type,
    ...extras,
  };

  for (const [field, value] of Object.entries(input)) {
    if (commonFields.has(field)) {
      continue;
    }

    const definition = fieldByKey.get(field);
    if (!definition) {
      continue;
    }

    const coerced = coerceFieldValue(definition, value);
    payloads[definition.scope][field] = coerced;
  }

  for (const field of commonFields) {
    if (!(field in input)) continue;
    if (["car_id", "engine_id", "track_id", "session_date"].includes(field)) {
      continue;
    }

    if (commonNumericFields.has(field)) {
      payload[field] = cleanDecimal(input[field]);
    } else {
      payload[field] = cleanOptional(input[field]);
    }
  }

  if (!hasRacePositions(input.session_type)) {
    payloads.result_values.start_position = null;
    payloads.result_values.end_position = null;
  }

  payload.setup_values = payloads.setup_values;
  payload.result_values = payloads.result_values;
  payload.note_values = payloads.note_values;

  return payload;
}

export function sessionValueForInput(
  session: SetupSession,
  field: SetupSessionInputField,
): string {
  return payloadValueToInput(sessionPayloadValue(session, field));
}

export function sessionPayloadValue(
  session: SetupSession,
  field: SetupSessionInputField,
): SetupFieldValue | undefined {
  const payloadValue =
    session.setup_values?.[field] ??
    session.result_values?.[field] ??
    session.note_values?.[field];
  if (payloadValue !== undefined) return payloadValue;

  if (commonFields.has(field)) {
    const value = session[field as keyof SetupSession];
    if (
      value === null ||
      value === undefined ||
      typeof value === "object"
    ) {
      return null;
    }
    return value;
  }

  return undefined;
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanUuid(value: string): string | null {
  return value || null;
}

function cleanDecimal(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number(trimmed);
}

function hasRacePositions(sessionType: string) {
  return sessionType === "Heat" || sessionType === "Main";
}

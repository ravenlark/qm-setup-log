import type { SupabaseClient } from "@supabase/supabase-js";

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
  air_temp: number | null;
  humidity: number | null;
  track_temp: number | null;
  track_condition: string | null;
  lr_hub: string | null;
  lf_tire_compound: string | null;
  rf_tire_compound: string | null;
  lr_tire_compound: string | null;
  rr_tire_compound: string | null;
  lf_psi: number | null;
  rf_psi: number | null;
  lr_psi: number | null;
  rr_psi: number | null;
  lf_offset: number | null;
  rf_offset: number | null;
  lr_offset: number | null;
  rr_offset: number | null;
  lf_spring_rate: number | null;
  rf_spring_rate: number | null;
  lr_spring_rate: number | null;
  rr_spring_rate: number | null;
  lf_shock_valving: string | null;
  rf_shock_valving: string | null;
  lr_shock_valving: string | null;
  rr_shock_valving: string | null;
  stagger: number | null;
  tire_notes: string | null;
  lf_weight: number | null;
  rf_weight: number | null;
  lr_weight: number | null;
  rr_weight: number | null;
  lf_ride_height: number | null;
  rf_ride_height: number | null;
  lr_ride_height: number | null;
  rr_ride_height: number | null;
  lf_camber: number | null;
  rf_camber: number | null;
  lf_caster: number | null;
  rf_caster: number | null;
  lf_panhard_holes: number | null;
  rf_panhard_holes: number | null;
  lr_panhard_holes: number | null;
  rr_panhard_holes: number | null;
  left_wheelbase: number | null;
  right_wheelbase: number | null;
  engine_gear: number | null;
  axle_gear: number | null;
  lap_time: number | null;
  total_laps: number | null;
  average_rpm: number | null;
  average_drops: number | null;
  start_position: number | null;
  end_position: number | null;
  lf_tire_temp: number | null;
  rf_tire_temp: number | null;
  lr_tire_temp: number | null;
  rr_tire_temp: number | null;
  handling: string | null;
  changes: string | null;
  next_time: string | null;
};

export type SetupSessionInput = Record<SetupSessionInputField, string>;

export type SetupSessionInputField =
  | "car_id"
  | "engine_id"
  | "track_id"
  | "session_date"
  | "session_time"
  | "session_type"
  | "driver"
  | "air_temp"
  | "humidity"
  | "track_temp"
  | "track_condition"
  | "lr_hub"
  | "lf_tire_compound"
  | "rf_tire_compound"
  | "lr_tire_compound"
  | "rr_tire_compound"
  | "lf_psi"
  | "rf_psi"
  | "lr_psi"
  | "rr_psi"
  | "lf_offset"
  | "rf_offset"
  | "lr_offset"
  | "rr_offset"
  | "lf_spring_rate"
  | "rf_spring_rate"
  | "lr_spring_rate"
  | "rr_spring_rate"
  | "lf_shock_valving"
  | "rf_shock_valving"
  | "lr_shock_valving"
  | "rr_shock_valving"
  | "stagger"
  | "tire_notes"
  | "lf_weight"
  | "rf_weight"
  | "lr_weight"
  | "rr_weight"
  | "lf_ride_height"
  | "rf_ride_height"
  | "lr_ride_height"
  | "rr_ride_height"
  | "lf_camber"
  | "rf_camber"
  | "lf_caster"
  | "rf_caster"
  | "lf_panhard_holes"
  | "rf_panhard_holes"
  | "lr_panhard_holes"
  | "rr_panhard_holes"
  | "left_wheelbase"
  | "right_wheelbase"
  | "engine_gear"
  | "axle_gear"
  | "lap_time"
  | "total_laps"
  | "average_rpm"
  | "average_drops"
  | "start_position"
  | "end_position"
  | "lf_tire_temp"
  | "rf_tire_temp"
  | "lr_tire_temp"
  | "rr_tire_temp"
  | "handling"
  | "changes"
  | "next_time";

const numericFields = new Set<SetupSessionInputField>([
  "air_temp",
  "humidity",
  "track_temp",
  "lf_psi",
  "rf_psi",
  "lr_psi",
  "rr_psi",
  "lf_offset",
  "rf_offset",
  "lr_offset",
  "rr_offset",
  "stagger",
  "lf_weight",
  "rf_weight",
  "lr_weight",
  "rr_weight",
  "lf_ride_height",
  "rf_ride_height",
  "lr_ride_height",
  "rr_ride_height",
  "lf_camber",
  "rf_camber",
  "lf_caster",
  "rf_caster",
  "left_wheelbase",
  "right_wheelbase",
  "lap_time",
]);

const integerFields = new Set<SetupSessionInputField>([
  "lf_spring_rate",
  "rf_spring_rate",
  "lr_spring_rate",
  "rr_spring_rate",
  "lf_panhard_holes",
  "rf_panhard_holes",
  "lr_panhard_holes",
  "rr_panhard_holes",
  "engine_gear",
  "axle_gear",
  "total_laps",
  "average_rpm",
  "average_drops",
  "start_position",
  "end_position",
  "lf_tire_temp",
  "rf_tire_temp",
  "lr_tire_temp",
  "rr_tire_temp",
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
  "air_temp",
  "humidity",
  "track_temp",
  "track_condition",
  "lr_hub",
  "lf_tire_compound",
  "rf_tire_compound",
  "lr_tire_compound",
  "rr_tire_compound",
  "lf_psi",
  "rf_psi",
  "lr_psi",
  "rr_psi",
  "lf_offset",
  "rf_offset",
  "lr_offset",
  "rr_offset",
  "lf_spring_rate",
  "rf_spring_rate",
  "lr_spring_rate",
  "rr_spring_rate",
  "lf_shock_valving",
  "rf_shock_valving",
  "lr_shock_valving",
  "rr_shock_valving",
  "stagger",
  "tire_notes",
  "lf_weight",
  "rf_weight",
  "lr_weight",
  "rr_weight",
  "lf_ride_height",
  "rf_ride_height",
  "lr_ride_height",
  "rr_ride_height",
  "lf_camber",
  "rf_camber",
  "lf_caster",
  "rf_caster",
  "lf_panhard_holes",
  "rf_panhard_holes",
  "lr_panhard_holes",
  "rr_panhard_holes",
  "left_wheelbase",
  "right_wheelbase",
  "engine_gear",
  "axle_gear",
  "lap_time",
  "total_laps",
  "average_rpm",
  "average_drops",
  "start_position",
  "end_position",
  "lf_tire_temp",
  "rf_tire_temp",
  "lr_tire_temp",
  "rr_tire_temp",
  "handling",
  "changes",
  "next_time",
].join(", ");

export async function fetchSessions(
  supabase: SupabaseClient,
): Promise<SetupSession[]> {
  const { data, error } = await supabase
    .from("sessions")
    .select(sessionFields)
    .order("session_date", { ascending: false })
    .order("session_time", { ascending: false, nullsFirst: false });

  if (error) throw error;
  return (data ?? []) as unknown as SetupSession[];
}

export async function createSession(
  supabase: SupabaseClient,
  userId: string,
  input: SetupSessionInput,
): Promise<SetupSession> {
  const payload = sessionPayload(userId, input, { is_baseline: false });

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
): Promise<SetupSession> {
  const payload = sessionPayload(userId, input);

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
  extras: Record<string, string | number | null | boolean> = {},
) {
  const payload: Record<string, string | number | null | boolean> = {
    user_id: userId,
    car_id: input.car_id,
    engine_id: cleanUuid(input.engine_id),
    track_id: input.track_id,
    session_date: input.session_date,
    session_time: cleanOptional(input.session_time),
    session_type: input.session_type,
    ...extras,
  };

  for (const [field, value] of Object.entries(input) as [
    SetupSessionInputField,
    string,
  ][]) {
    if (["car_id", "engine_id", "track_id", "session_date"].includes(field)) {
      continue;
    }

    if (numericFields.has(field)) {
      payload[field] = cleanDecimal(value);
    } else if (integerFields.has(field)) {
      payload[field] = cleanInteger(value);
    } else {
      payload[field] = cleanOptional(value);
    }
  }

  if (!hasRacePositions(input.session_type)) {
    payload.start_position = null;
    payload.end_position = null;
  }

  return payload;
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

function cleanInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.parseInt(trimmed, 10);
}

function hasRacePositions(sessionType: string) {
  return sessionType === "Heat" || sessionType === "Main";
}

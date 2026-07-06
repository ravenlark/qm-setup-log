import type { SupabaseClient } from "@supabase/supabase-js";
import {
  coerceFieldValue,
  payloadValueToInput,
  setupFieldsForCarType,
  type SetupValuePayload,
} from "./setupFields/index";
import type { CarType } from "./cars";
import type { SetupSession, SetupSessionInput } from "./sessions";

export const FAVORITE_SETUPS_CHANGED_EVENT = "favorite-setups:changed";

export type FavoriteSetup = {
  id: string;
  user_id: string;
  car_type_id: string;
  name: string;
  notes: string | null;
  source_session_id: string | null;
  setup_values: SetupValuePayload;
  carType?: CarType | null;
};

export type FavoriteSetupInput = {
  car_type_id: string;
  name: string;
  notes: string;
  setup_values: SetupSessionInput;
  carTypeSlug?: string | null;
  source_session_id?: string | null;
};

const favoriteSetupSelect =
  "id, user_id, car_type_id, name, notes, source_session_id, setup_values";

export async function fetchFavoriteSetups(
  supabase: SupabaseClient,
): Promise<FavoriteSetup[]> {
  const { data, error } = await supabase
    .from("favorite_setups")
    .select(`${favoriteSetupSelect}, carType:car_types(id, slug, name)`)
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown[]).map(normalizeFavoriteSetup);
}

export async function createFavoriteSetup(
  supabase: SupabaseClient,
  userId: string,
  input: FavoriteSetupInput,
): Promise<FavoriteSetup> {
  const { data, error } = await supabase
    .from("favorite_setups")
    .insert(favoriteSetupPayload(userId, input))
    .select(`${favoriteSetupSelect}, carType:car_types(id, slug, name)`)
    .single();

  if (error) throw error;
  return normalizeFavoriteSetup(data as unknown);
}

export async function updateFavoriteSetup(
  supabase: SupabaseClient,
  setupId: string,
  input: FavoriteSetupInput,
): Promise<FavoriteSetup> {
  const { data, error } = await supabase
    .from("favorite_setups")
    .update(favoriteSetupPayload(undefined, input))
    .eq("id", setupId)
    .select(`${favoriteSetupSelect}, carType:car_types(id, slug, name)`)
    .single();

  if (error) throw error;
  return normalizeFavoriteSetup(data as unknown);
}

export async function deleteFavoriteSetup(
  supabase: SupabaseClient,
  setupId: string,
): Promise<void> {
  const { error } = await supabase
    .from("favorite_setups")
    .delete()
    .eq("id", setupId);

  if (error) throw error;
}

export function favoriteSetupToInput(setup: FavoriteSetup): SetupSessionInput {
  const input: SetupSessionInput = {};

  for (const [field, value] of Object.entries(setup.setup_values ?? {})) {
    input[field] = payloadValueToInput(value);
  }

  return input;
}

export function setupInputFromSession(session: SetupSession): SetupSessionInput {
  const input: SetupSessionInput = {};

  for (const [field, value] of Object.entries(session.setup_values ?? {})) {
    input[field] = payloadValueToInput(value);
  }

  return input;
}

function favoriteSetupPayload(
  userId: string | undefined,
  input: FavoriteSetupInput,
) {
  const payload: Record<string, string | null | SetupValuePayload> = {
    car_type_id: input.car_type_id,
    name: input.name.trim(),
    notes: cleanOptional(input.notes),
    source_session_id: input.source_session_id ?? null,
    setup_values: setupPayload(input.setup_values, input.carTypeSlug),
  };

  if (userId) payload.user_id = userId;

  return payload;
}

function setupPayload(
  input: SetupSessionInput,
  carTypeSlug?: string | null,
): SetupValuePayload {
  const payload: SetupValuePayload = {};
  const fields = setupFieldsForCarType(carTypeSlug);
  const fieldByKey = new Map(fields.map((field) => [field.key, field]));

  for (const [field, value] of Object.entries(input)) {
    const definition = fieldByKey.get(field);
    if (!definition || definition.scope !== "setup_values") continue;

    const coerced = coerceFieldValue(definition, value);
    if (coerced !== null && coerced !== "") {
      payload[field] = coerced;
    }
  }

  return payload;
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeFavoriteSetup(value: unknown): FavoriteSetup {
  const setup = value as FavoriteSetup & { carType?: CarType | CarType[] | null };
  const carType = Array.isArray(setup.carType)
    ? setup.carType[0] ?? null
    : setup.carType ?? null;
  return { ...setup, carType };
}

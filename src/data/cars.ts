import type { SupabaseClient } from "@supabase/supabase-js";

export type RaceCar = {
  id: string;
  user_id: string;
  name: string;
  model: string | null;
  year: number | null;
  notes: string | null;
};

export type RaceCarInput = {
  name: string;
  model: string;
  year: string;
  notes: string;
};

export async function fetchCars(
  supabase: SupabaseClient,
): Promise<RaceCar[]> {
  const { data, error } = await supabase
    .from("cars")
    .select("id, user_id, name, model, year, notes")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as RaceCar[];
}

export async function createCar(
  supabase: SupabaseClient,
  userId: string,
  input: RaceCarInput,
): Promise<RaceCar> {
  const { data, error } = await supabase
    .from("cars")
    .insert({
      user_id: userId,
      name: input.name.trim(),
      model: cleanOptional(input.model),
      year: cleanInteger(input.year),
      notes: cleanOptional(input.notes),
    })
    .select("id, user_id, name, model, year, notes")
    .single();

  if (error) throw error;
  return data as RaceCar;
}

export async function updateCar(
  supabase: SupabaseClient,
  carId: string,
  input: RaceCarInput,
): Promise<RaceCar> {
  const { data, error } = await supabase
    .from("cars")
    .update({
      name: input.name.trim(),
      model: cleanOptional(input.model),
      year: cleanInteger(input.year),
      notes: cleanOptional(input.notes),
    })
    .eq("id", carId)
    .select("id, user_id, name, model, year, notes")
    .single();

  if (error) throw error;
  return data as RaceCar;
}

export async function deleteCar(
  supabase: SupabaseClient,
  carId: string,
): Promise<void> {
  const { error } = await supabase.from("cars").delete().eq("id", carId);

  if (error) throw error;
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.parseInt(trimmed, 10);
}

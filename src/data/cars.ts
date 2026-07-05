import type { SupabaseClient } from "@supabase/supabase-js";

export type RaceCar = {
  id: string;
  user_id: string;
  car_type_id: string | null;
  name: string;
  model: string | null;
  year: number | null;
  notes: string | null;
  carType?: CarType | null;
};

export type RaceCarInput = {
  car_type_id: string;
  name: string;
  model: string;
  year: string;
  notes: string;
};

export type CarType = {
  id: string;
  slug: string;
  name: string;
};

const carSelect = "id, user_id, car_type_id, name, model, year, notes";

export async function fetchCars(
  supabase: SupabaseClient,
): Promise<RaceCar[]> {
  const { data, error } = await supabase
    .from("cars")
    .select(`${carSelect}, carType:car_types(id, slug, name)`)
    .order("name", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown[]).map(normalizeCar);
}

export async function fetchCarTypes(
  supabase: SupabaseClient,
): Promise<CarType[]> {
  const { data, error } = await supabase
    .from("car_types")
    .select("id, slug, name")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as CarType[];
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
      car_type_id: cleanUuid(input.car_type_id),
      name: input.name.trim(),
      model: cleanOptional(input.model),
      year: cleanInteger(input.year),
      notes: cleanOptional(input.notes),
    })
    .select(`${carSelect}, carType:car_types(id, slug, name)`)
    .single();

  if (error) throw error;
  return normalizeCar(data as unknown);
}

export async function updateCar(
  supabase: SupabaseClient,
  carId: string,
  input: RaceCarInput,
): Promise<RaceCar> {
  const { data, error } = await supabase
    .from("cars")
    .update({
      car_type_id: cleanUuid(input.car_type_id),
      name: input.name.trim(),
      model: cleanOptional(input.model),
      year: cleanInteger(input.year),
      notes: cleanOptional(input.notes),
    })
    .eq("id", carId)
    .select(`${carSelect}, carType:car_types(id, slug, name)`)
    .single();

  if (error) throw error;
  return normalizeCar(data as unknown);
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

function cleanUuid(value: string): string | null {
  return value || null;
}

function cleanInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number.parseInt(trimmed, 10);
}

function normalizeCar(value: unknown): RaceCar {
  const car = value as RaceCar & { carType?: CarType | CarType[] | null };
  const carType = Array.isArray(car.carType) ? car.carType[0] ?? null : car.carType ?? null;
  return { ...car, carType };
}

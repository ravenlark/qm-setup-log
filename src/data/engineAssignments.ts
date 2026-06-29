import type { SupabaseClient } from "@supabase/supabase-js";

export type EngineAssignment = {
  id: string;
  user_id: string;
  car_id: string;
  engine_id: string;
  installed_at: string;
  removed_at: string | null;
  notes: string | null;
};

export async function fetchActiveEngineAssignments(
  supabase: SupabaseClient,
): Promise<EngineAssignment[]> {
  const { data, error } = await supabase
    .from("car_engine_assignments")
    .select("id, user_id, car_id, engine_id, installed_at, removed_at, notes")
    .is("removed_at", null)
    .order("installed_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as EngineAssignment[];
}

export async function assignEngineToCar(
  supabase: SupabaseClient,
  userId: string,
  carId: string,
  engineId: string,
): Promise<EngineAssignment> {
  const removedAt = new Date().toISOString();

  const { error: carRemovalError } = await supabase
    .from("car_engine_assignments")
    .update({ removed_at: removedAt })
    .eq("user_id", userId)
    .eq("car_id", carId)
    .is("removed_at", null);

  if (carRemovalError) throw carRemovalError;

  const { error: engineRemovalError } = await supabase
    .from("car_engine_assignments")
    .update({ removed_at: removedAt })
    .eq("user_id", userId)
    .eq("engine_id", engineId)
    .is("removed_at", null);

  if (engineRemovalError) throw engineRemovalError;

  const { data, error } = await supabase
    .from("car_engine_assignments")
    .insert({
      user_id: userId,
      car_id: carId,
      engine_id: engineId,
    })
    .select("id, user_id, car_id, engine_id, installed_at, removed_at, notes")
    .single();

  if (error) throw error;
  return data as EngineAssignment;
}

export async function removeEngineAssignment(
  supabase: SupabaseClient,
  assignmentId: string,
): Promise<void> {
  const { error } = await supabase
    .from("car_engine_assignments")
    .update({ removed_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .is("removed_at", null);

  if (error) throw error;
}

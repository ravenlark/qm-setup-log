import type { SupabaseClient } from "@supabase/supabase-js";
import { cached } from "./cache";

export type EngineType = {
  id: string;
  name: string;
  gearbox_ratio: number;
};

export type Engine = {
  id: string;
  user_id: string;
  engine_type_id: string;
  name: string;
  serial: string | null;
  notes: string | null;
};

export type EngineWithType = Engine & {
  engineType: EngineType | null;
};

export type EngineInput = {
  engine_type_id: string;
  name: string;
  serial: string;
  notes: string;
};

export type MaintenanceType = {
  id: string;
  name: string;
};

export type EngineMaintenance = {
  id: string;
  user_id: string;
  engine_id: string;
  maintenance_type_id: string;
  maintenance_date: string;
  performed_by: string | null;
  cost: number | null;
  notes: string | null;
};

export type EngineMaintenanceWithType = EngineMaintenance & {
  maintenanceType: MaintenanceType | null;
};

export type EngineMaintenanceInput = {
  maintenance_type_id: string;
  maintenance_date: string;
  performed_by: string;
  cost: string;
  notes: string;
};

export async function fetchEngineTypes(
  supabase: SupabaseClient,
): Promise<EngineType[]> {
  return cached("engine-types", 5 * 60 * 1000, async () => {
    const { data, error } = await supabase
      .from("engine_types")
      .select("id, name, gearbox_ratio")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    return (data ?? []) as EngineType[];
  });
}

export async function fetchMaintenanceTypes(
  supabase: SupabaseClient,
): Promise<MaintenanceType[]> {
  return cached("maintenance-types", 5 * 60 * 1000, async () => {
    const { data, error } = await supabase
      .from("maintenance_types")
      .select("id, name")
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) throw error;
    return (data ?? []) as MaintenanceType[];
  });
}

export async function fetchEngines(
  supabase: SupabaseClient,
  userId: string,
): Promise<EngineWithType[]> {
  const { data, error } = await supabase
    .from("engines")
    .select("id, user_id, engine_type_id, name, serial, notes, engine_types(id, name, gearbox_ratio)")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((engine) => ({
    id: engine.id,
    user_id: engine.user_id,
    engine_type_id: engine.engine_type_id,
    name: engine.name,
    serial: engine.serial,
    notes: engine.notes,
    engineType: Array.isArray(engine.engine_types)
      ? (engine.engine_types[0] as EngineType | undefined) ?? null
      : (engine.engine_types as EngineType | null),
  }));
}

export async function createEngine(
  supabase: SupabaseClient,
  userId: string,
  input: EngineInput,
): Promise<Engine> {
  const { data, error } = await supabase
    .from("engines")
    .insert({
      user_id: userId,
      engine_type_id: input.engine_type_id,
      name: input.name.trim(),
      serial: cleanOptional(input.serial),
      notes: cleanOptional(input.notes),
    })
    .select("id, user_id, engine_type_id, name, serial, notes")
    .single();

  if (error) throw error;
  return data as Engine;
}

export async function updateEngine(
  supabase: SupabaseClient,
  engineId: string,
  input: EngineInput,
): Promise<Engine> {
  const { data, error } = await supabase
    .from("engines")
    .update({
      engine_type_id: input.engine_type_id,
      name: input.name.trim(),
      serial: cleanOptional(input.serial),
      notes: cleanOptional(input.notes),
    })
    .eq("id", engineId)
    .select("id, user_id, engine_type_id, name, serial, notes")
    .single();

  if (error) throw error;
  return data as Engine;
}

export async function deleteEngine(
  supabase: SupabaseClient,
  engineId: string,
): Promise<void> {
  const { error } = await supabase.from("engines").delete().eq("id", engineId);

  if (error) throw error;
}

export async function fetchEngineMaintenance(
  supabase: SupabaseClient,
  userId: string,
  engineId: string,
): Promise<EngineMaintenanceWithType[]> {
  return fetchEngineMaintenanceForEngines(supabase, userId, [engineId]);
}

export async function fetchEngineMaintenanceForEngines(
  supabase: SupabaseClient,
  userId: string,
  engineIds: string[],
): Promise<EngineMaintenanceWithType[]> {
  const uniqueEngineIds = Array.from(new Set(engineIds.filter(Boolean)));
  if (!uniqueEngineIds.length) return [];

  const { data, error } = await supabase
    .from("engine_maintenance")
    .select(
      "id, user_id, engine_id, maintenance_type_id, maintenance_date, performed_by, cost, notes, maintenance_types(id, name)",
    )
    .eq("user_id", userId)
    .in("engine_id", uniqueEngineIds)
    .order("maintenance_date", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((entry) => ({
    id: entry.id,
    user_id: entry.user_id,
    engine_id: entry.engine_id,
    maintenance_type_id: entry.maintenance_type_id,
    maintenance_date: entry.maintenance_date,
    performed_by: entry.performed_by,
    cost: entry.cost,
    notes: entry.notes,
    maintenanceType: Array.isArray(entry.maintenance_types)
      ? (entry.maintenance_types[0] as MaintenanceType | undefined) ?? null
      : (entry.maintenance_types as MaintenanceType | null),
  }));
}

export async function createEngineMaintenance(
  supabase: SupabaseClient,
  userId: string,
  engineId: string,
  input: EngineMaintenanceInput,
): Promise<EngineMaintenance> {
  const { data, error } = await supabase
    .from("engine_maintenance")
    .insert({
      user_id: userId,
      engine_id: engineId,
      maintenance_type_id: input.maintenance_type_id,
      maintenance_date: input.maintenance_date,
      performed_by: cleanOptional(input.performed_by),
      cost: cleanMoney(input.cost),
      notes: cleanOptional(input.notes),
    })
    .select(
      "id, user_id, engine_id, maintenance_type_id, maintenance_date, performed_by, cost, notes",
    )
    .single();

  if (error) throw error;
  return data as EngineMaintenance;
}

export async function updateEngineMaintenance(
  supabase: SupabaseClient,
  entryId: string,
  input: EngineMaintenanceInput,
): Promise<EngineMaintenance> {
  const { data, error } = await supabase
    .from("engine_maintenance")
    .update({
      maintenance_type_id: input.maintenance_type_id,
      maintenance_date: input.maintenance_date,
      performed_by: cleanOptional(input.performed_by),
      cost: cleanMoney(input.cost),
      notes: cleanOptional(input.notes),
    })
    .eq("id", entryId)
    .select(
      "id, user_id, engine_id, maintenance_type_id, maintenance_date, performed_by, cost, notes",
    )
    .single();

  if (error) throw error;
  return data as EngineMaintenance;
}

export async function deleteEngineMaintenance(
  supabase: SupabaseClient,
  entryId: string,
): Promise<void> {
  const { error } = await supabase
    .from("engine_maintenance")
    .delete()
    .eq("id", entryId);

  if (error) throw error;
}

function cleanOptional(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanMoney(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return Number(trimmed);
}

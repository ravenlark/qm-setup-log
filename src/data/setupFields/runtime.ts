import type { SupabaseClient } from "@supabase/supabase-js";
import type { CarTypeSetupDefinition, SetupFieldDefinition, SetupSectionDefinition } from "./types";
import { setupDefinitionForCarType } from "./index";

export type RuntimeSetupDefinitionMap = Record<string, CarTypeSetupDefinition>;

type RuntimeTemplateRow = {
  car_type_id: string;
  fields: unknown;
  sections: unknown;
  carType?: { slug?: string | null } | { slug?: string | null }[] | null;
};

export async function fetchRuntimeSetupDefinitions(
  supabase: SupabaseClient,
): Promise<RuntimeSetupDefinitionMap> {
  const { data, error } = await supabase
    .from("car_type_setup_templates")
    .select("car_type_id, fields, sections, carType:car_types(slug)")
    .eq("is_active", true);

  if (error) return {};

  const definitions: RuntimeSetupDefinitionMap = {};
  for (const row of (data ?? []) as RuntimeTemplateRow[]) {
    const carType = Array.isArray(row.carType) ? row.carType[0] : row.carType;
    const slug = carType?.slug;
    if (!slug || !isSetupFields(row.fields) || !isSetupSections(row.sections)) {
      continue;
    }
    definitions[slug] = {
      slug,
      fields: row.fields,
      sections: row.sections,
    };
  }

  return definitions;
}

export function setupDefinitionForCarTypeWithRuntime(
  slug: string | null | undefined,
  runtimeDefinitions: RuntimeSetupDefinitionMap,
) {
  const fallback = setupDefinitionForCarType(slug);
  return runtimeDefinitions[slug || fallback.slug] ?? fallback;
}

export function setupFieldsForCarTypeWithRuntime(
  slug: string | null | undefined,
  runtimeDefinitions: RuntimeSetupDefinitionMap,
) {
  return setupDefinitionForCarTypeWithRuntime(slug, runtimeDefinitions).fields;
}

export function setupSectionsForCarTypeWithRuntime(
  slug: string | null | undefined,
  runtimeDefinitions: RuntimeSetupDefinitionMap,
) {
  return setupDefinitionForCarTypeWithRuntime(slug, runtimeDefinitions).sections;
}

function isSetupFields(value: unknown): value is SetupFieldDefinition[] {
  return (
    Array.isArray(value) &&
    value.every(
      (field) =>
        field &&
        typeof field === "object" &&
        typeof (field as SetupFieldDefinition).key === "string" &&
        typeof (field as SetupFieldDefinition).label === "string" &&
        typeof (field as SetupFieldDefinition).group === "string" &&
        typeof (field as SetupFieldDefinition).scope === "string" &&
        typeof (field as SetupFieldDefinition).type === "string",
    )
  );
}

function isSetupSections(value: unknown): value is SetupSectionDefinition[] {
  return (
    Array.isArray(value) &&
    value.every(
      (section) =>
        section &&
        typeof section === "object" &&
        typeof (section as SetupSectionDefinition).id === "string" &&
        typeof (section as SetupSectionDefinition).title === "string" &&
        Array.isArray((section as SetupSectionDefinition).blocks),
    )
  );
}

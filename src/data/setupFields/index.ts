import { legendDefinition } from "./legend";
import { quarterMidgetDefinition } from "./quarterMidget";
import type { CarTypeSetupDefinition } from "./types";

export * from "./helpers";
export * from "./types";

export const defaultCarTypeSlug = "quarter_midget";

const definitionsByCarType: Record<string, CarTypeSetupDefinition> = {
  [defaultCarTypeSlug]: quarterMidgetDefinition,
  legend: legendDefinition,
};

export function setupDefinitionForCarType(slug: string | null | undefined) {
  return definitionsByCarType[slug || defaultCarTypeSlug] ?? quarterMidgetDefinition;
}

export function setupFieldsForCarType(slug: string | null | undefined) {
  return setupDefinitionForCarType(slug).fields;
}

export function setupSectionsForCarType(slug: string | null | undefined) {
  return setupDefinitionForCarType(slug).sections;
}

import type {
  SetupFieldDefinition,
  SetupFieldValue,
  SetupValuePayloads,
} from "./types";

export function emptyPayloads(): SetupValuePayloads {
  return {
    setup_values: {},
    result_values: {},
    note_values: {},
  };
}

export function coerceFieldValue(
  field: SetupFieldDefinition,
  value: string,
): SetupFieldValue {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (field.type === "number") return Number(trimmed);
  if (field.type === "integer") return Number.parseInt(trimmed, 10);
  return trimmed;
}

export function payloadValueToInput(value: SetupFieldValue | undefined) {
  return value === null || value === undefined ? "" : String(value);
}


import type { SetupFieldDefinition, SetupSectionDefinition } from "./types";

export const sessionOutcomeFields: SetupFieldDefinition[] = [
  {
    key: "lap_time",
    label: "Best Lap (sec)",
    group: "Result",
    scope: "result_values",
    type: "number",
    min: "0",
    step: "0.001",
    placeholder: "8.742",
  },
  {
    key: "total_laps",
    label: "Total Laps",
    group: "Result",
    scope: "result_values",
    type: "integer",
    min: "0",
    step: "1",
  },
  {
    key: "average_rpm",
    label: "Average RPM",
    group: "Result",
    scope: "result_values",
    type: "integer",
    min: "0",
    step: "1",
  },
  {
    key: "average_drops",
    label: "Average Drops (RPM)",
    group: "Result",
    scope: "result_values",
    type: "integer",
    min: "0",
    step: "1",
  },
  {
    key: "start_position",
    label: "Start Position",
    group: "Result",
    scope: "result_values",
    type: "integer",
    min: "1",
    step: "1",
  },
  {
    key: "end_position",
    label: "End Position",
    group: "Result",
    scope: "result_values",
    type: "integer",
    min: "1",
    step: "1",
  },
  ...(["lf", "rf", "lr", "rr"] as const).map(
    (corner) =>
      ({
        key: `${corner}_tire_temp`,
        label: `${corner.toUpperCase()} Tire Temp (F)`,
        group: "Result",
        scope: "result_values",
        type: "integer",
        min: "0",
        step: "1",
      }) satisfies SetupFieldDefinition,
  ),
  {
    key: "handling",
    label: "Handling",
    group: "Notes",
    scope: "note_values",
    type: "textarea",
    placeholder: "Tight center, free off, snaps loose on entry",
  },
  {
    key: "changes",
    label: "Changes Made",
    group: "Notes",
    scope: "note_values",
    type: "textarea",
    placeholder: "Dropped RF .5 psi, adjusted corner weight",
  },
  {
    key: "next_time",
    label: "Next Time",
    group: "Notes",
    scope: "note_values",
    type: "textarea",
    placeholder: "Try earlier throttle pickup",
  },
];

export const sessionOutcomeSections: SetupSectionDefinition[] = [
  {
    id: "session_result",
    title: "Results",
    blocks: [
      {
        type: "fields",
        fieldKeys: [
          "lap_time",
          "total_laps",
          "average_rpm",
          "average_drops",
          "start_position",
          "end_position",
        ],
        className: "form-grid result-pair-grid",
      },
      {
        type: "corners",
        corners: [
          { corner: "lf", fieldKeys: ["lf_tire_temp"] },
          { corner: "rf", fieldKeys: ["rf_tire_temp"] },
          { corner: "lr", fieldKeys: ["lr_tire_temp"] },
          { corner: "rr", fieldKeys: ["rr_tire_temp"] },
        ],
        className: "corner-grid setup-corner-grid",
      },
    ],
  },
  {
    id: "session_notes",
    title: "Notes",
    blocks: [
      {
        type: "fields",
        fieldKeys: ["handling", "changes", "next_time"],
        className: "form-grid single",
      },
    ],
  },
];

export type SetupPayloadScope = "setup_values" | "result_values" | "note_values";

export type SetupFieldType =
  | "text"
  | "number"
  | "integer"
  | "textarea"
  | "select"
  | "radio";

export type SetupFieldDefinition = {
  key: string;
  label: string;
  group: string;
  scope: SetupPayloadScope;
  type: SetupFieldType;
  min?: string;
  max?: string;
  step?: string;
  placeholder?: string;
  options?: string[];
};

export type SetupLayoutBlock =
  | {
      type: "fields";
      fieldKeys: string[];
      className?: string;
    }
  | {
      type: "corners";
      corners: Array<{
        corner: string;
        fieldKeys: string[];
      }>;
      className?: string;
    }
  | {
      type: "computed";
      computed: "weight_percentages" | "gear_ratio";
      className?: string;
    };

export type SetupSectionDefinition = {
  id: string;
  title: string;
  blocks: SetupLayoutBlock[];
};

export type CarTypeSetupDefinition = {
  slug: string;
  fields: SetupFieldDefinition[];
  sections: SetupSectionDefinition[];
};

export type SetupFieldValue = string | number | boolean | null;
export type SetupValuePayload = Record<string, SetupFieldValue>;
export type SetupValuePayloads = Record<SetupPayloadScope, SetupValuePayload>;

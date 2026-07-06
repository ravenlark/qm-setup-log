import {
  type SetupPayloadScope,
  type SetupFieldDefinition,
  type SetupSectionDefinition,
} from "../data/setupFields/index";
import type {
  SetupSessionInput,
  SetupSessionInputField,
} from "../data/sessions";

type SetupFieldsEditorProps = {
  fieldByKey: Map<string, SetupFieldDefinition>;
  form: SetupSessionInput;
  gearRatio?: string;
  allowedScopes?: SetupPayloadScope[];
  sections: SetupSectionDefinition[];
  showsPositionFields?: boolean;
  onChange: (field: SetupSessionInputField, value: string) => void;
};

export function SetupFieldsEditor({
  allowedScopes,
  fieldByKey,
  form,
  gearRatio = "--",
  onChange,
  sections,
  showsPositionFields = false,
}: SetupFieldsEditorProps) {
  const weightStats = calculateWeightStats(form);

  return (
    <>
      {sections.map((section) => {
        const blocks = section.blocks
          .map((block, index) => (
            <SetupLayoutBlock
              block={block}
              allowedScopes={allowedScopes}
              fieldByKey={fieldByKey}
              form={form}
              gearRatio={gearRatio}
              key={`${section.id}-${index}`}
              showsPositionFields={showsPositionFields}
              weightStats={weightStats}
              onChange={onChange}
            />
          ))
          .filter(Boolean);

        if (!blocks.length) return null;

        return (
          <fieldset className="session-card" key={section.id}>
            <legend>{section.title}</legend>
            {blocks}
          </fieldset>
        );
      })}
    </>
  );
}

export function calculateWeightStats(form: SetupSessionInput) {
  const lf = Number(form.lf_weight);
  const rf = Number(form.rf_weight);
  const lr = Number(form.lr_weight);
  const rr = Number(form.rr_weight);
  const total = lf + rf + lr + rr;

  if (!total) {
    return {
      front: "--",
      left: "--",
      right: "--",
      rear: "--",
      cross: "--",
    };
  }

  return {
    front: percent(lf + rf, total),
    left: percent(lf + lr, total),
    right: percent(rf + rr, total),
    rear: percent(lr + rr, total),
    cross: percent(rf + lr, total),
  };
}

function SetupLayoutBlock({
  block,
  allowedScopes,
  fieldByKey,
  form,
  gearRatio,
  onChange,
  showsPositionFields,
  weightStats,
}: {
  block: SetupSectionDefinition["blocks"][number];
  allowedScopes?: SetupPayloadScope[];
  fieldByKey: Map<string, SetupFieldDefinition>;
  form: SetupSessionInput;
  gearRatio: string;
  onChange: (field: SetupSessionInputField, value: string) => void;
  showsPositionFields: boolean;
  weightStats: ReturnType<typeof calculateWeightStats>;
}) {
  if (block.type === "computed") {
    if (block.computed === "weight_percentages") {
      return (
        <div className={block.className ?? "calculated-grid"}>
          <CalcStat label="Front" value={weightStats.front} />
          <CalcStat label="Left" value={weightStats.left} />
          <CalcStat label="Right" value={weightStats.right} />
          <CalcStat label="Rear" value={weightStats.rear} />
          <CalcStat label="Cross" value={weightStats.cross} />
        </div>
      );
    }

    return (
      <div className={block.className ?? "calculated-grid centered"}>
        <CalcStat label="Calculated Gear Ratio" value={gearRatio} />
      </div>
    );
  }

  if (block.type === "corners") {
    const corners = block.corners
      .map(({ corner, fieldKeys }) => {
        const fields = fieldKeys
          .map((key) => fieldByKey.get(key))
          .filter(isVisibleField(showsPositionFields, allowedScopes));

        return fields.length ? { corner, fields } : null;
      })
      .filter(Boolean) as Array<{
        corner: string;
        fields: SetupFieldDefinition[];
      }>;

    if (!corners.length) return null;

    if (corners.every(({ fields }) => fields.length === 1)) {
      return (
        <div className={block.className ?? "corner-grid"}>
          {corners.flatMap(({ fields }) =>
            fields.map((field) => (
              <SetupInputField
                field={field}
                key={field.key}
                value={form[field.key] ?? ""}
                onChange={(value) => onChange(field.key, value)}
              />
            )),
          )}
        </div>
      );
    }

    return (
      <div className={block.className ?? "corner-grid"}>
        {corners.map(({ corner, fields }) => (
          <div className="corner-box" key={corner}>
            <h3>{corner.toUpperCase()}</h3>
            {fields.map((field) => (
              <SetupInputField
                field={field}
                key={field.key}
                value={form[field.key] ?? ""}
                onChange={(value) => onChange(field.key, value)}
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  const fields = block.fieldKeys
    .map((key) => fieldByKey.get(key))
    .filter(isVisibleField(showsPositionFields, allowedScopes));

  if (!fields.length) return null;

  return (
    <div className={block.className ?? "form-grid result-pair-grid"}>
      {fields.map((field) => (
        <SetupInputField
          field={field}
          key={field.key}
          value={form[field.key] ?? ""}
          onChange={(value) => onChange(field.key, value)}
        />
      ))}
    </div>
  );
}

function TextField({
  label,
  onChange,
  placeholder,
  value,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label>
      {label}
      <input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function NumberField({
  label,
  max,
  min,
  onChange,
  placeholder,
  required,
  step,
  type = "number",
  value,
}: {
  label: string;
  max?: string;
  min?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  step?: string;
  type?: "date" | "number" | "time";
}) {
  return (
    <label>
      {label}
      <input
        max={max}
        min={min}
        placeholder={placeholder}
        required={required}
        step={step}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function CalcStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="calc-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SetupInputField({
  field,
  onChange,
  value,
}: {
  field: SetupFieldDefinition;
  onChange: (value: string) => void;
  value: string;
}) {
  if (field.type === "textarea") {
    return (
      <label>
        {field.label}
        <textarea
          placeholder={field.placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
    );
  }

  if (field.type === "radio") {
    return (
      <div className="radio-field">
        <span>{field.label}</span>
        <div className="segmented-radio" role="radiogroup" aria-label={field.label}>
          {(field.options ?? []).map((option) => (
            <label key={option}>
              <input
                checked={value === option}
                name={field.key}
                type="radio"
                value={option}
                onChange={(event) => onChange(event.target.value)}
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <label>
        {field.label}
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choose option</option>
          {(field.options ?? []).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      </label>
    );
  }

  if (field.type === "number" || field.type === "integer") {
    return (
      <NumberField
        label={field.label}
        max={field.max}
        min={field.min}
        placeholder={field.placeholder}
        step={field.step}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <TextField
      label={field.label}
      placeholder={field.placeholder}
      value={value}
      onChange={onChange}
    />
  );
}

function isVisibleField(
  showsPositionFields: boolean,
  allowedScopes?: SetupPayloadScope[],
) {
  return (field: SetupFieldDefinition | undefined): field is SetupFieldDefinition =>
    Boolean(
      field &&
        (!allowedScopes || allowedScopes.includes(field.scope)) &&
        (showsPositionFields ||
          (field.key !== "start_position" && field.key !== "end_position")),
    );
}

function percent(value: number, total: number) {
  return `${((value / total) * 100).toFixed(1)}%`;
}

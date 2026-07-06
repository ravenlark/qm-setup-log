import { useEffect, useMemo, useState, type DragEvent, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Check,
  ClipboardList,
  KeyRound,
  Layers,
  Plus,
  Save,
  Search,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import {
  archiveAdminCarTypeSetupTemplate,
  assignAdminUserPlan,
  createAdminCarTypeSetupTemplate,
  fetchAdminFeatures,
  fetchAdminMe,
  fetchAdminPlans,
  fetchAdminSetupTemplates,
  fetchAdminUsers,
  saveAdminFeature,
  saveAdminPlan,
  saveAdminSetupTemplate,
  toggleAdminPlanFeature,
  type AdminCarType,
  type AdminFeature,
  type AdminPlan,
  type AdminPlanFeature,
  type AdminSetupTemplate,
  type AdminUser,
} from "../data/admin";
import { setupDefinitionForCarType } from "../data/setupFields/index";
import type {
  CarTypeSetupDefinition,
  SetupFieldDefinition,
  SetupFieldType,
  SetupLayoutBlock,
  SetupSectionDefinition,
} from "../data/setupFields/types";

type AdminViewProps = {
  supabase: SupabaseClient;
};

type FieldPlacement = {
  blockIndex: number;
  cornerIndex?: number;
  insertIndex?: number;
  sectionIndex: number;
};

type DraggedTemplateField = {
  fieldKey: string;
  source?: FieldPlacement;
};

const adminTabs = [
  { icon: Users, label: "Users", path: "/admin/users" },
  { icon: ClipboardList, label: "Plans", path: "/admin/plans" },
  { icon: KeyRound, label: "Features", path: "/admin/features" },
  { icon: Layers, label: "Setup Templates", path: "/admin/setup-templates" },
];

const fieldTypes: SetupFieldType[] = [
  "text",
  "number",
  "integer",
  "textarea",
  "select",
  "radio",
];

export function AdminView({ supabase }: AdminViewProps) {
  const [adminStatus, setAdminStatus] = useState<
    "loading" | "authorized" | "denied"
  >("loading");

  useEffect(() => {
    let isCurrent = true;
    fetchAdminMe(supabase)
      .then((result) => {
        if (!isCurrent) return;
        setAdminStatus(result.isAdmin ? "authorized" : "denied");
      })
      .catch(() => {
        if (!isCurrent) return;
        setAdminStatus("denied");
      });

    return () => {
      isCurrent = false;
    };
  }, [supabase]);

  if (adminStatus === "loading") {
    return <div className="panel loading-panel">Checking admin access...</div>;
  }

  if (adminStatus === "denied") {
    return <Navigate to="/" replace />;
  }

  return (
    <section className="admin-layout">
      <div className="panel admin-heading-panel">
        <div>
          <span className="eyebrow">Admin</span>
          <h2>Administrative Console</h2>
        </div>
        <Shield size={22} />
      </div>

      <nav className="tabs admin-tabs" aria-label="Admin views">
        {adminTabs.map(({ icon: Icon, label, path }) => (
          <NavLink
            className={({ isActive }) => (isActive ? "tab active" : "tab")}
            key={path}
            to={path}
          >
            <Icon size={17} />
            {label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="/" element={<Navigate to="/admin/users" replace />} />
        <Route path="/users" element={<AdminUsers supabase={supabase} />} />
        <Route path="/plans" element={<AdminPlans supabase={supabase} />} />
        <Route path="/features" element={<AdminFeatures supabase={supabase} />} />
        <Route
          path="/setup-templates"
          element={<AdminSetupTemplates supabase={supabase} />}
        />
        <Route path="*" element={<Navigate to="/admin/users" replace />} />
      </Routes>
    </section>
  );
}

function AdminUsers({ supabase }: AdminViewProps) {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">(
    "loading",
  );
  const [message, setMessage] = useState("");

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    Promise.all([fetchAdminUsers(supabase, search), fetchAdminPlans(supabase)])
      .then(([userResult, planResult]) => {
        if (!isCurrent) return;
        setUsers(userResult.users);
        setPlans(planResult.plans);
        setStatus("ready");
        setMessage("");
      })
      .catch((error: Error) => {
        if (!isCurrent) return;
        setMessage(error.message);
        setStatus("ready");
      });
    return () => {
      isCurrent = false;
    };
  }, [supabase]);

  async function runSearch(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setStatus("loading");
    setMessage("");
    try {
      const result = await fetchAdminUsers(supabase, search);
      setUsers(result.users);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "User search failed.");
    } finally {
      setStatus("ready");
    }
  }

  async function assignPlan(userId: string, planId: string) {
    setStatus("saving");
    setMessage("");
    try {
      await assignAdminUserPlan(supabase, userId, planId);
      const result = await fetchAdminUsers(supabase, search);
      setUsers(result.users);
      setMessage("Plan assigned.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan assignment failed.");
    } finally {
      setStatus("ready");
    }
  }

  return (
    <section className="panel admin-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Users</span>
          <h2>Accounts</h2>
        </div>
        <span className="count-pill">{users.length}</span>
      </div>
      <form className="admin-search" onSubmit={runSearch}>
        <label className="session-search-field">
          <Search size={18} />
          <input
            aria-label="Search users"
            placeholder="Search email, team, or user id"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={status === "loading"}>
          Search
        </button>
      </form>
      {message ? <div className="inline-message">{message}</div> : null}
      <div className="admin-table-wrap">
        <table className="report-table admin-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Plan</th>
              <th>Usage</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <th scope="row">
                  <strong>{user.email ?? "No email"}</strong>
                  <span>{user.teamName || user.id}</span>
                </th>
                <td>
                  <select
                    value={user.subscription?.plan?.id ?? ""}
                    onChange={(event) => assignPlan(user.id, event.target.value)}
                  >
                    <option value="">Choose plan</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.display_name ?? plan.name}
                      </option>
                    ))}
                  </select>
                  <small>
                    {user.subscription?.provider ?? "none"} /{" "}
                    {user.subscription?.status ?? "none"}
                  </small>
                </td>
                <td>
                  {user.usage.cars} cars, {user.usage.engines} engines,{" "}
                  {user.usage.sessions} sessions
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {status === "loading" ? <div className="empty-state">Loading users...</div> : null}
    </section>
  );
}

function AdminPlans({ supabase }: AdminViewProps) {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState(planToForm(null));
  const [message, setMessage] = useState("");

  useEffect(() => {
    refreshPlans();
  }, [supabase]);

  async function refreshPlans() {
    try {
      const result = await fetchAdminPlans(supabase);
      setPlans(result.plans);
      setEditingPlan(planToForm(result.plans[0] ?? null));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plans could not load.");
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      await saveAdminPlan(supabase, {
        ...editingPlan,
        maxCars: numberOrNull(editingPlan.maxCars),
        maxEngines: numberOrNull(editingPlan.maxEngines),
        priceCents: numberOrNull(editingPlan.priceCents),
      });
      await refreshPlans();
      setMessage("Plan saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Plan save failed.");
    }
  }

  return (
    <section className="admin-two-column">
      <div className="panel admin-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Plans</span>
            <h2>Plan Catalog</h2>
          </div>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setEditingPlan(planToForm(null))}
          >
            New Plan
          </button>
        </div>
        <div className="admin-list">
          {plans.map((plan) => (
            <button
              className="track-row"
              key={plan.id}
              type="button"
              onClick={() => setEditingPlan(planToForm(plan))}
            >
              <span>
                <strong>{plan.display_name ?? plan.name}</strong>
                <small>{plan.is_active ? "Active" : "Archived"}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <form className="panel admin-panel admin-form" onSubmit={handleSave}>
        <span className="eyebrow">Edit Plan</span>
        <div className="form-grid result-pair-grid">
          <TextInput label="Name" value={editingPlan.name} onChange={(name) => setEditingPlan({ ...editingPlan, name })} />
          <TextInput label="Display Name" value={editingPlan.displayName} onChange={(displayName) => setEditingPlan({ ...editingPlan, displayName })} />
          <TextInput label="Max Cars" value={editingPlan.maxCars} onChange={(maxCars) => setEditingPlan({ ...editingPlan, maxCars })} />
          <TextInput label="Max Engines" value={editingPlan.maxEngines} onChange={(maxEngines) => setEditingPlan({ ...editingPlan, maxEngines })} />
          <TextInput label="Price Cents" value={editingPlan.priceCents} onChange={(priceCents) => setEditingPlan({ ...editingPlan, priceCents })} />
          <TextInput label="Currency" value={editingPlan.priceCurrency} onChange={(priceCurrency) => setEditingPlan({ ...editingPlan, priceCurrency })} />
          <TextInput label="Stripe Price ID" value={editingPlan.stripePriceId} onChange={(stripePriceId) => setEditingPlan({ ...editingPlan, stripePriceId })} />
          <label className="check-row">
            <input
              checked={editingPlan.isActive}
              type="checkbox"
              onChange={(event) => setEditingPlan({ ...editingPlan, isActive: event.target.checked })}
            />
            Active
          </label>
        </div>
        <button className="primary-button" type="submit">
          <Save size={18} />
          Save Plan
        </button>
        {message ? <div className="inline-message">{message}</div> : null}
      </form>
    </section>
  );
}

function AdminFeatures({ supabase }: AdminViewProps) {
  const [features, setFeatures] = useState<AdminFeature[]>([]);
  const [plans, setPlans] = useState<Array<Pick<AdminPlan, "id" | "name" | "display_name" | "is_active">>>([]);
  const [planFeatures, setPlanFeatures] = useState<AdminPlanFeature[]>([]);
  const [featureForm, setFeatureForm] = useState({
    description: "",
    displayName: "",
    isActive: true,
    key: "",
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    refreshFeatures();
  }, [supabase]);

  async function refreshFeatures() {
    try {
      const result = await fetchAdminFeatures(supabase);
      setFeatures(result.features);
      setPlans(result.plans);
      setPlanFeatures(result.planFeatures);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Features could not load.");
    }
  }

  async function handleSaveFeature(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await saveAdminFeature(supabase, featureForm);
      await refreshFeatures();
      setMessage("Feature saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feature save failed.");
    }
  }

  async function handleToggle(planId: string, featureKey: string, enabled: boolean) {
    try {
      await toggleAdminPlanFeature(supabase, planId, featureKey, enabled);
      await refreshFeatures();
      setMessage("Feature toggle saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feature toggle failed.");
    }
  }

  const enabledByKey = useMemo(
    () =>
      new Map(
        planFeatures.map((row) => [
          `${row.plan_id}:${row.feature_key}`,
          row.is_enabled,
        ]),
      ),
    [planFeatures],
  );

  return (
    <section className="admin-two-column">
      <div className="panel admin-panel">
        <span className="eyebrow">Features</span>
        <div className="admin-list">
          {features.map((feature) => (
            <button
              className="track-row"
              key={feature.key}
              type="button"
              onClick={() =>
                setFeatureForm({
                  description: feature.description ?? "",
                  displayName: feature.display_name,
                  isActive: feature.is_active,
                  key: feature.key,
                })
              }
            >
              <span>
                <strong>{feature.display_name}</strong>
                <small>{feature.key}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel admin-panel admin-form">
        <form onSubmit={handleSaveFeature}>
          <span className="eyebrow">Edit Feature</span>
          <div className="form-grid single">
            <TextInput label="Key" value={featureForm.key} onChange={(key) => setFeatureForm({ ...featureForm, key })} />
            <TextInput label="Display Name" value={featureForm.displayName} onChange={(displayName) => setFeatureForm({ ...featureForm, displayName })} />
            <label>
              Description
              <textarea
                value={featureForm.description}
                onChange={(event) => setFeatureForm({ ...featureForm, description: event.target.value })}
              />
            </label>
            <label className="check-row">
              <input
                checked={featureForm.isActive}
                type="checkbox"
                onChange={(event) => setFeatureForm({ ...featureForm, isActive: event.target.checked })}
              />
              Active
            </label>
          </div>
          <button className="primary-button" type="submit">
            <Save size={18} />
            Save Feature
          </button>
        </form>
        <div className="admin-matrix">
          {features.map((feature) => (
            <div className="admin-matrix-row" key={feature.key}>
              <strong>{feature.display_name}</strong>
              {plans.map((plan) => (
                <label className="check-row" key={plan.id}>
                  <input
                    checked={Boolean(enabledByKey.get(`${plan.id}:${feature.key}`))}
                    type="checkbox"
                    onChange={(event) =>
                      handleToggle(plan.id, feature.key, event.target.checked)
                    }
                  />
                  {plan.display_name ?? plan.name}
                </label>
              ))}
            </div>
          ))}
        </div>
        {message ? <div className="inline-message">{message}</div> : null}
      </div>
    </section>
  );
}

function AdminSetupTemplates({ supabase }: AdminViewProps) {
  const [carTypes, setCarTypes] = useState<AdminCarType[]>([]);
  const [templates, setTemplates] = useState<AdminSetupTemplate[]>([]);
  const [selectedCarTypeId, setSelectedCarTypeId] = useState("");
  const [definition, setDefinition] = useState<CarTypeSetupDefinition | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [selectedFieldIndex, setSelectedFieldIndex] = useState<number | null>(null);
  const [sectionIdTouched, setSectionIdTouched] = useState<Record<number, boolean>>({});
  const [draggedField, setDraggedField] = useState<DraggedTemplateField | null>(null);
  const [activeDropTarget, setActiveDropTarget] = useState("");
  const [newTemplateForm, setNewTemplateForm] = useState({
    name: "",
    slug: "",
    slugTouched: false,
    sortOrder: "100",
    sourceCarTypeId: "",
  });
  const [templateActionStatus, setTemplateActionStatus] = useState<
    "ready" | "saving"
  >("ready");
  const [templateSaveStatus, setTemplateSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const fieldByKey = useMemo(
    () => new Map((definition?.fields ?? []).map((field) => [field.key, field])),
    [definition?.fields],
  );
  const generatedJson = useMemo(
    () => (definition ? JSON.stringify(definition, null, 2) : ""),
    [definition],
  );
  const groupedFields = useMemo(() => {
    const groups = new Map<string, SetupFieldDefinition[]>();
    for (const field of definition?.fields ?? []) {
      const key = field.group || "General";
      groups.set(key, [...(groups.get(key) ?? []), field]);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [definition?.fields]);

  useEffect(() => {
    refreshTemplates();
  }, [supabase]);

  useEffect(() => {
    if (!selectedCarTypeId) return;
    loadTemplate(selectedCarTypeId);
  }, [selectedCarTypeId, templates, carTypes]);

  useEffect(() => {
    if (templateSaveStatus !== "saved") return;
    const timer = window.setTimeout(() => setTemplateSaveStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [templateSaveStatus]);

  async function refreshTemplates() {
    try {
      const result = await fetchAdminSetupTemplates(supabase);
      setCarTypes(result.carTypes);
      setTemplates(result.templates);
      if (
        selectedCarTypeId &&
        !result.carTypes.some((carType) => carType.id === selectedCarTypeId)
      ) {
        setSelectedCarTypeId("");
        setDefinition(null);
        setSelectedFieldIndex(null);
        setDraggedField(null);
        setActiveDropTarget("");
        setTemplateSaveStatus("idle");
      }
      setNewTemplateForm((current) => ({
        ...current,
        sourceCarTypeId: current.sourceCarTypeId,
      }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Templates could not load.");
    }
  }

  function loadTemplate(carTypeId: string) {
    loadTemplateFromData(carTypeId, carTypes, templates);
  }

  function loadTemplateFromData(
    carTypeId: string,
    nextCarTypes: AdminCarType[],
    nextTemplates: AdminSetupTemplate[],
  ) {
    const carType = nextCarTypes.find((item) => item.id === carTypeId);
    if (!carType) return;
    const template = nextTemplates.find((item) => item.car_type_id === carTypeId);
    const nextDefinition = normalizeSetupTemplateDefinition(
      template
      ? {
          fields: template.fields,
          sections: template.sections,
          slug: carType.slug,
        }
      : setupDefinitionForCarType(carType.slug),
    );
    setDefinition(nextDefinition);
    setSelectedFieldIndex(nextDefinition.fields.length ? 0 : null);
    setSectionIdTouched({});
    setDraggedField(null);
    setActiveDropTarget("");
    setTemplateSaveStatus("idle");
    setIsActive(carType.is_active ?? true);
    setSelectedCarTypeId(carTypeId);
  }

  function updateDefinition(updater: (current: CarTypeSetupDefinition) => CarTypeSetupDefinition) {
    setTemplateSaveStatus((current) => (current === "saving" ? current : "idle"));
    setDefinition((current) => (current ? updater(current) : current));
  }

  function updateField(index: number, patch: Partial<SetupFieldDefinition>) {
    const previousKey = definition?.fields[index]?.key;
    setDefinition((current) => {
      if (!current) return current;
      const fields = current.fields.map((field, fieldIndex) =>
        fieldIndex === index ? { ...field, ...patch } : field,
      );
      const nextKey = fields[index]?.key;
      const sections =
        previousKey && nextKey && previousKey !== nextKey
          ? replaceFieldReferences(current.sections, previousKey, nextKey)
          : current.sections;
      return { ...current, fields, sections };
    });
  }

  function addField() {
    const nextKey = uniqueFieldKey(definition?.fields ?? [], "new_field");
    updateDefinition((current) => ({
      ...current,
      fields: [
        ...current.fields,
        {
          group: "General",
          key: nextKey,
          label: "New Field",
          scope: "setup_values",
          type: "text",
        },
      ],
    }));
    setSelectedFieldIndex(definition?.fields.length ?? 0);
  }

  function deleteField(index: number) {
    const field = definition?.fields[index];
    if (!field) return;
    updateDefinition((current) => ({
      ...current,
      fields: current.fields.filter((_, fieldIndex) => fieldIndex !== index),
      sections: removeFieldReferences(current.sections, field.key),
    }));
    setSelectedFieldIndex(null);
  }

  function addSection() {
    updateDefinition((current) => ({
      ...current,
      sections: [
        ...current.sections,
        {
          blocks: [],
          id: uniqueSectionId(current.sections, "new_section"),
          title: "New Section",
        },
      ],
    }));
    setSectionIdTouched((current) => ({
      ...current,
      [definition?.sections.length ?? 0]: false,
    }));
  }

  function updateSection(sectionIndex: number, patch: Partial<SetupSectionDefinition>) {
    updateDefinition((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex ? { ...section, ...patch } : section,
      ),
    }));
  }

  function updateSectionTitle(sectionIndex: number, title: string) {
    updateDefinition((current) => ({
      ...current,
      sections: current.sections.map((section, index) => {
        if (index !== sectionIndex) return section;
        if (sectionIdTouched[sectionIndex]) {
          return { ...section, title };
        }
        return {
          ...section,
          id: uniqueSectionId(
            current.sections.filter((_, nextIndex) => nextIndex !== sectionIndex),
            normalizeSlug(title) || "section",
          ),
          title,
        };
      }),
    }));
  }

  function updateSectionId(sectionIndex: number, id: string) {
    setSectionIdTouched((current) => ({ ...current, [sectionIndex]: true }));
    updateSection(sectionIndex, { id: normalizeIdentifierInput(id) });
  }

  function moveSection(sectionIndex: number, direction: -1 | 1) {
    updateDefinition((current) => ({
      ...current,
      sections: moveItem(current.sections, sectionIndex, direction),
    }));
    setSectionIdTouched((current) => moveRecordFlag(current, sectionIndex, direction));
  }

  function deleteSection(sectionIndex: number) {
    updateDefinition((current) => ({
      ...current,
      sections: current.sections.filter((_, index) => index !== sectionIndex),
    }));
    setSectionIdTouched((current) => removeRecordFlag(current, sectionIndex));
  }

  function addBlock(sectionIndex: number, type: SetupLayoutBlock["type"]) {
    updateDefinition((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              blocks: [...section.blocks, defaultBlock(type)],
            }
          : section,
      ),
    }));
  }

  function updateBlock(
    sectionIndex: number,
    blockIndex: number,
    nextBlock: SetupLayoutBlock,
  ) {
    updateDefinition((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              blocks: section.blocks.map((block, nextIndex) =>
                nextIndex === blockIndex ? nextBlock : block,
              ),
            }
          : section,
      ),
    }));
  }

  function moveBlock(sectionIndex: number, blockIndex: number, direction: -1 | 1) {
    updateDefinition((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex
          ? { ...section, blocks: moveItem(section.blocks, blockIndex, direction) }
          : section,
      ),
    }));
  }

  function deleteBlock(sectionIndex: number, blockIndex: number) {
    updateDefinition((current) => ({
      ...current,
      sections: current.sections.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              blocks: section.blocks.filter((_, nextIndex) => nextIndex !== blockIndex),
            }
          : section,
      ),
    }));
  }

  function moveTemplateFieldToTarget(target: FieldPlacement) {
    if (!draggedField) return;
    const { fieldKey, source } = draggedField;
    if (
      source &&
      sameFieldPlacement(source, target) &&
      source.insertIndex === target.insertIndex
    ) {
      setDraggedField(null);
      setActiveDropTarget("");
      return;
    }

    updateDefinition((current) => ({
      ...current,
      sections: current.sections.map((section, sectionIndex) => ({
        ...section,
        blocks: section.blocks.map((block, blockIndex) => {
          let nextBlock = block;
          if (sourceMatchesPlacement(source, sectionIndex, blockIndex)) {
            nextBlock = removeFieldFromPlacement(nextBlock, source, fieldKey);
          }
          if (target.sectionIndex === sectionIndex && target.blockIndex === blockIndex) {
            nextBlock = addFieldToPlacement(nextBlock, target, fieldKey, source);
          }
          return nextBlock;
        }),
      })),
    }));
    setDraggedField(null);
    setActiveDropTarget("");
  }

  async function handleSaveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!definition || templateSaveStatus === "saving") return;
    try {
      setTemplateSaveStatus("saving");
      setMessage("Saving setup template...");
      validateTemplate(definition.fields, definition.sections);
      const normalizedDefinition = normalizeSetupTemplateDefinition(definition);
      const result = await saveAdminSetupTemplate(supabase, {
        carTypeId: selectedCarTypeId,
        definition: normalizedDefinition,
        isActive,
      });
      setDefinition(normalizedDefinition);
      setTemplates((current) => [
        result.template,
        ...current.filter((template) => template.car_type_id !== selectedCarTypeId),
      ]);
      setCarTypes((current) =>
        current.map((carType) =>
          carType.id === selectedCarTypeId
            ? { ...carType, is_active: isActive }
            : carType,
        ),
      );
      setTemplateSaveStatus("saved");
      setMessage("Setup template saved successfully.");
    } catch (error) {
      setTemplateSaveStatus("error");
      setMessage(error instanceof Error ? error.message : "Template save failed.");
    }
  }

  async function handleCreateTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (templateActionStatus === "saving") return;
    const name = newTemplateForm.name.trim();
    const slug = normalizeSlug(newTemplateForm.slug || name);
    if (!name || !slug) {
      setMessage("New templates need a name and slug.");
      return;
    }

    const sourceCarType = carTypes.find(
      (carType) => carType.id === newTemplateForm.sourceCarTypeId,
    );
    const sourceTemplate = sourceCarType
      ? templates.find((template) => template.car_type_id === sourceCarType.id)
      : null;
    const sourceDefinition: CarTypeSetupDefinition = normalizeSetupTemplateDefinition(
      sourceTemplate && sourceCarType
        ? {
            fields: sourceTemplate.fields,
            sections: sourceTemplate.sections,
            slug,
          }
        : {
            ...(sourceCarType
              ? setupDefinitionForCarType(sourceCarType.slug)
              : { fields: [], sections: [], slug }),
            slug,
          },
    );

    try {
      setTemplateActionStatus("saving");
      setTemplateSaveStatus("idle");
      setMessage("");
      await createAdminCarTypeSetupTemplate(supabase, {
        definition: sourceDefinition,
        name,
        slug,
        sortOrder: numberOrNull(newTemplateForm.sortOrder) ?? 100,
      });
      const refreshed = await fetchAdminSetupTemplates(supabase);
      setCarTypes(refreshed.carTypes);
      setTemplates(refreshed.templates);
      const createdCarType = refreshed.carTypes.find(
        (carType) => carType.slug === slug,
      );
      if (!createdCarType) {
        throw new Error(
          "Template create finished, but the new car type was not found after refresh. Redeploy admin-setup-templates and confirm car_types service_role grants.",
        );
      }
      setNewTemplateForm({
        name: "",
        slug: "",
        slugTouched: false,
        sortOrder: "100",
        sourceCarTypeId: "",
      });
      loadTemplateFromData(createdCarType.id, refreshed.carTypes, refreshed.templates);
      setMessage("Car type setup template added and loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not be added.");
    } finally {
      setTemplateActionStatus("ready");
    }
  }

  async function handleArchiveTemplate() {
    if (templateActionStatus === "saving") return;
    const carType = carTypes.find((item) => item.id === selectedCarTypeId);
    if (!carType) return;
    const confirmed = window.confirm(
      `Archive ${carType.name}? This removes it from active car type setup templates.`,
    );
    if (!confirmed) return;

    try {
      setTemplateActionStatus("saving");
      setTemplateSaveStatus("idle");
      setMessage("");
      await archiveAdminCarTypeSetupTemplate(supabase, selectedCarTypeId);
      const result = await fetchAdminSetupTemplates(supabase);
      setCarTypes(result.carTypes);
      setTemplates(result.templates);
      setSelectedCarTypeId("");
      setDefinition(null);
      setSelectedFieldIndex(null);
      setSectionIdTouched({});
      setDraggedField(null);
      setActiveDropTarget("");
      setTemplateSaveStatus("idle");
      setMessage("Car type setup template archived.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Template could not be archived.");
    } finally {
      setTemplateActionStatus("ready");
    }
  }

  return (
    <section className="panel admin-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Setup Templates</span>
          <h2>{selectedTemplateName(carTypes, selectedCarTypeId) ?? "Choose Template"}</h2>
        </div>
      </div>
      <form className="admin-create-template-form" onSubmit={handleCreateTemplate}>
        <TextInput
          label="New Template Name"
          value={newTemplateForm.name}
          onChange={(name) =>
            setNewTemplateForm((current) => ({
              ...current,
              name,
              slug: current.slugTouched ? current.slug : normalizeSlug(name),
            }))
          }
        />
        <TextInput
          label="Slug"
          value={newTemplateForm.slug}
          onChange={(slug) =>
            setNewTemplateForm((current) => ({
              ...current,
              slug: normalizeSlug(slug),
              slugTouched: true,
            }))
          }
        />
        <TextInput
          label="Sort Order"
          value={newTemplateForm.sortOrder}
          onChange={(sortOrder) =>
            setNewTemplateForm((current) => ({ ...current, sortOrder }))
          }
        />
        <label>
          Copy From
          <select
            value={newTemplateForm.sourceCarTypeId}
            onChange={(event) =>
              setNewTemplateForm((current) => ({
                ...current,
                sourceCarTypeId: event.target.value,
              }))
            }
          >
            <option value="">None</option>
            {carTypes.map((carType) => (
              <option key={carType.id} value={carType.id}>
                {carType.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="secondary-button"
          disabled={templateActionStatus === "saving"}
          type="submit"
        >
          <Plus size={18} />
          {templateActionStatus === "saving" ? "Adding..." : "Add Template"}
        </button>
      </form>
      {message ? <div className="inline-message">{message}</div> : null}
      <div className="admin-template-picker">
        {carTypes.map((carType) => {
          const hasRuntimeTemplate = templates.some(
            (template) => template.car_type_id === carType.id,
          );
          return (
            <button
              className={[
                "track-row",
                selectedCarTypeId === carType.id ? "active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={carType.id}
              type="button"
              onClick={() => loadTemplate(carType.id)}
            >
              <span>
                <strong>{carType.name}</strong>
                <small>
                  {carType.is_active ? "Active" : "Archived"} /{" "}
                  {hasRuntimeTemplate ? "Runtime template" : "Bundled fallback"}
                </small>
              </span>
            </button>
          );
        })}
      </div>
      {definition ? (
        <form className="admin-form" onSubmit={handleSaveTemplate}>
          <div className="template-builder">
            <aside className="template-builder-panel field-bank-panel">
              <div className="template-builder-panel-header">
                <div>
                  <span className="eyebrow">Field Bank</span>
                  <h3>{definition.fields.length} Fields</h3>
                </div>
                <button className="secondary-button" type="button" onClick={addField}>
                  <Plus size={16} />
                  Field
                </button>
              </div>
              {groupedFields.length ? (
                groupedFields.map(([group, fields]) => (
                  <div className="field-bank-group" key={group}>
                    <strong>{group}</strong>
                    {fields.map((field) => {
                      const fieldIndex = definition.fields.findIndex(
                        (item) => item.key === field.key,
                      );
                      return (
                        <button
                          className={[
                            "field-bank-pill",
                            selectedFieldIndex === fieldIndex ? "active" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                          key={field.key}
                          type="button"
                          draggable
                          onDragEnd={() => {
                            setDraggedField(null);
                            setActiveDropTarget("");
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "copy";
                            event.dataTransfer.setData("text/plain", field.key);
                            setDraggedField({ fieldKey: field.key });
                          }}
                          onClick={() => setSelectedFieldIndex(fieldIndex)}
                        >
                          <span>{field.label}</span>
                          <small>{field.key}</small>
                        </button>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="empty-state">No fields yet.</div>
              )}
            </aside>

            <section className="template-builder-canvas">
              <div className="template-builder-panel-header">
                <div>
                  <span className="eyebrow">Template Canvas</span>
                  <h3>{definition.sections.length} Sections</h3>
                </div>
                <button className="secondary-button" type="button" onClick={addSection}>
                  <Plus size={16} />
                  Section
                </button>
              </div>
              {definition.sections.length ? (
                definition.sections.map((section, sectionIndex) => (
                  <article
                    className="template-section-card"
                    key={`section-${sectionIndex}`}
                  >
                    <div className="template-section-header">
                      <div className="template-section-title-fields">
                        <label>
                          Section Title
                          <input
                            value={section.title}
                            onChange={(event) =>
                              updateSectionTitle(sectionIndex, event.target.value)
                            }
                          />
                        </label>
                        <label>
                          Section ID
                          <input
                            value={section.id}
                            onChange={(event) =>
                              updateSectionId(sectionIndex, event.target.value)
                            }
                          />
                        </label>
                      </div>
                      <div className="button-row">
                        <button
                          className="secondary-button"
                          disabled={sectionIndex === 0}
                          type="button"
                          onClick={() => moveSection(sectionIndex, -1)}
                        >
                          Up
                        </button>
                        <button
                          className="secondary-button"
                          disabled={sectionIndex === definition.sections.length - 1}
                          type="button"
                          onClick={() => moveSection(sectionIndex, 1)}
                        >
                          Down
                        </button>
                        <button
                          aria-label="Delete section"
                          className="danger-icon-button"
                          type="button"
                          onClick={() => deleteSection(sectionIndex)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="template-block-actions">
                      <button type="button" onClick={() => addBlock(sectionIndex, "fields")}>
                        <Plus size={15} />
                        Field Row
                      </button>
                      <button type="button" onClick={() => addBlock(sectionIndex, "corners")}>
                        <Plus size={15} />
                        Corner Grid
                      </button>
                      <button type="button" onClick={() => addBlock(sectionIndex, "computed")}>
                        <Plus size={15} />
                        Computed
                      </button>
                    </div>
                    <div className="template-block-list">
                      {section.blocks.map((block, blockIndex) => (
                        <TemplateBlockEditor
                          activeDropTarget={activeDropTarget}
                          block={block}
                          blockIndex={blockIndex}
                          draggedField={draggedField}
                          fieldByKey={fieldByKey}
                          fields={definition.fields}
                          key={`block-${sectionIndex}-${blockIndex}`}
                          sectionBlockCount={section.blocks.length}
                          sectionIndex={sectionIndex}
                          onDelete={() => deleteBlock(sectionIndex, blockIndex)}
                          onDropTargetChange={setActiveDropTarget}
                          onFieldDragEnd={() => {
                            setDraggedField(null);
                            setActiveDropTarget("");
                          }}
                          onFieldDragStart={setDraggedField}
                          onFieldDrop={moveTemplateFieldToTarget}
                          onMove={(direction) =>
                            moveBlock(sectionIndex, blockIndex, direction)
                          }
                          onUpdate={(nextBlock) =>
                            updateBlock(sectionIndex, blockIndex, nextBlock)
                          }
                        />
                      ))}
                      {!section.blocks.length ? (
                        <div className="empty-state">Add a block to this section.</div>
                      ) : null}
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty-state">Add a section to start building.</div>
              )}
            </section>

            <aside className="template-builder-panel inspector-panel">
              <div className="template-builder-panel-header">
                <div>
                  <span className="eyebrow">Inspector</span>
                  <h3>Field Details</h3>
                </div>
              </div>
              {selectedFieldIndex !== null && definition.fields[selectedFieldIndex] ? (
                <FieldInspector
                  field={definition.fields[selectedFieldIndex]}
                  onDelete={() => deleteField(selectedFieldIndex)}
                  onUpdate={(patch) => updateField(selectedFieldIndex, patch)}
                />
              ) : (
                <div className="empty-state">Choose a field or create one.</div>
              )}
              <details className="generated-json-preview">
                <summary>Generated JSON</summary>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(generatedJson)}
                >
                  Copy JSON
                </button>
                <pre>{generatedJson}</pre>
              </details>
            </aside>
          </div>
          <label className="check-row">
            <input
              checked={isActive}
              type="checkbox"
              onChange={(event) => setIsActive(event.target.checked)}
            />
            Active
          </label>
          <div className="button-row">
            <button
              className={[
                "primary-button",
                templateSaveStatus === "saved" ? "success-button" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={
                templateSaveStatus === "saving" ||
                templateActionStatus === "saving"
              }
              type="submit"
            >
              <Check size={18} />
              {templateSaveStatus === "saving"
                ? "Saving..."
                : templateSaveStatus === "saved"
                  ? "Saved"
                  : "Save Runtime Template"}
            </button>
            <button
              aria-label="Archive setup template"
              className="danger-icon-button"
              disabled={templateActionStatus === "saving"}
              type="button"
              onClick={handleArchiveTemplate}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </form>
      ) : (
        <div className="empty-state">Choose a car type to edit.</div>
      )}
    </section>
  );
}

function FieldInspector({
  field,
  onDelete,
  onUpdate,
}: {
  field: SetupFieldDefinition;
  onDelete: () => void;
  onUpdate: (patch: Partial<SetupFieldDefinition>) => void;
}) {
  const optionsText = field.options?.join(", ") ?? "";

  return (
    <div className="field-inspector">
      <TextInput label="Key" value={field.key} onChange={(key) => onUpdate({ key })} />
      <TextInput
        label="Label"
        value={field.label}
        onChange={(label) => onUpdate({ label })}
      />
      <TextInput
        label="Group"
        value={field.group}
        onChange={(group) => onUpdate({ group })}
      />
      <label>
        Type
        <select
          value={field.type}
          onChange={(event) =>
            onUpdate({ type: event.target.value as SetupFieldType })
          }
        >
          {fieldTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <div className="field-inspector-grid">
        <TextInput
          label="Min"
          value={field.min ?? ""}
          onChange={(min) => onUpdate({ min: emptyToUndefined(min) })}
        />
        <TextInput
          label="Max"
          value={field.max ?? ""}
          onChange={(max) => onUpdate({ max: emptyToUndefined(max) })}
        />
        <TextInput
          label="Step"
          value={field.step ?? ""}
          onChange={(step) => onUpdate({ step: emptyToUndefined(step) })}
        />
      </div>
      <TextInput
        label="Placeholder"
        value={field.placeholder ?? ""}
        onChange={(placeholder) =>
          onUpdate({ placeholder: emptyToUndefined(placeholder) })
        }
      />
      <label>
        Options
        <textarea
          rows={3}
          value={optionsText}
          placeholder="Soft, Medium, Hard"
          onChange={(event) =>
            onUpdate({
              options: splitOptions(event.target.value),
            })
          }
        />
      </label>
      <button className="danger-text-button" type="button" onClick={onDelete}>
        <Trash2 size={16} />
        Delete Field
      </button>
    </div>
  );
}

function TemplateBlockEditor({
  activeDropTarget,
  block,
  blockIndex,
  draggedField,
  fieldByKey,
  fields,
  onDelete,
  onDropTargetChange,
  onFieldDragEnd,
  onFieldDragStart,
  onFieldDrop,
  onMove,
  onUpdate,
  sectionBlockCount,
  sectionIndex,
}: {
  activeDropTarget: string;
  block: SetupLayoutBlock;
  blockIndex: number;
  draggedField: DraggedTemplateField | null;
  fieldByKey: Map<string, SetupFieldDefinition>;
  fields: SetupFieldDefinition[];
  onDelete: () => void;
  onDropTargetChange: (targetId: string) => void;
  onFieldDragEnd: () => void;
  onFieldDragStart: (field: DraggedTemplateField) => void;
  onFieldDrop: (target: FieldPlacement) => void;
  onMove: (direction: -1 | 1) => void;
  onUpdate: (block: SetupLayoutBlock) => void;
  sectionBlockCount: number;
  sectionIndex: number;
}) {
  return (
    <div className="template-block-card">
      <div className="template-block-header">
        <div>
          <strong>{blockTitle(block)}</strong>
          <small>{blockDescription(block)}</small>
        </div>
        <div className="button-row">
          <button
            className="secondary-button"
            disabled={blockIndex === 0}
            type="button"
            onClick={() => onMove(-1)}
          >
            Up
          </button>
          <button
            className="secondary-button"
            disabled={blockIndex === sectionBlockCount - 1}
            type="button"
            onClick={() => onMove(1)}
          >
            Down
          </button>
          <button
            aria-label="Delete block"
            className="danger-icon-button"
            type="button"
            onClick={onDelete}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {block.type === "fields" ? (
        <FieldRowBlockEditor
          activeDropTarget={activeDropTarget}
          block={block}
          blockIndex={blockIndex}
          draggedField={draggedField}
          fieldByKey={fieldByKey}
          fields={fields}
          sectionIndex={sectionIndex}
          onDropTargetChange={onDropTargetChange}
          onFieldDragEnd={onFieldDragEnd}
          onFieldDragStart={onFieldDragStart}
          onFieldDrop={onFieldDrop}
          onUpdate={onUpdate}
        />
      ) : null}
      {block.type === "corners" ? (
        <CornerBlockEditor
          activeDropTarget={activeDropTarget}
          block={block}
          blockIndex={blockIndex}
          draggedField={draggedField}
          fieldByKey={fieldByKey}
          fields={fields}
          sectionIndex={sectionIndex}
          onDropTargetChange={onDropTargetChange}
          onFieldDragEnd={onFieldDragEnd}
          onFieldDragStart={onFieldDragStart}
          onFieldDrop={onFieldDrop}
          onUpdate={onUpdate}
        />
      ) : null}
      {block.type === "computed" ? (
        <ComputedBlockEditor block={block} onUpdate={onUpdate} />
      ) : null}
    </div>
  );
}

function FieldRowBlockEditor({
  activeDropTarget,
  block,
  blockIndex,
  draggedField,
  fieldByKey,
  fields,
  onDropTargetChange,
  onFieldDragEnd,
  onFieldDragStart,
  onFieldDrop,
  onUpdate,
  sectionIndex,
}: {
  activeDropTarget: string;
  block: Extract<SetupLayoutBlock, { type: "fields" }>;
  blockIndex: number;
  draggedField: DraggedTemplateField | null;
  fieldByKey: Map<string, SetupFieldDefinition>;
  fields: SetupFieldDefinition[];
  onDropTargetChange: (targetId: string) => void;
  onFieldDragEnd: () => void;
  onFieldDragStart: (field: DraggedTemplateField) => void;
  onFieldDrop: (target: FieldPlacement) => void;
  onUpdate: (block: SetupLayoutBlock) => void;
  sectionIndex: number;
}) {
  const dropTarget = { blockIndex, sectionIndex };

  return (
    <div className="block-editor-body">
      <label>
        Layout
        <select
          value={fieldRowLayoutFromClass(block.className)}
          onChange={(event) =>
            onUpdate({
              ...block,
              className: fieldRowClassFromLayout(event.target.value),
            })
          }
        >
          <option value="single">Single column</option>
          <option value="pair">Two-column result pair</option>
          <option value="gear">Gear grid</option>
          <option value="default">Default grid</option>
        </select>
      </label>
      <FieldPicker
        fields={fields}
        label="Add Field"
        selectedKeys={block.fieldKeys}
        onPick={(fieldKey) =>
          onUpdate({
            ...block,
            fieldKeys: addUniqueFieldKey(block.fieldKeys, fieldKey),
          })
        }
      />
      <FieldKeyList
        activeDropTarget={activeDropTarget}
        draggedField={draggedField}
        dropTarget={dropTarget}
        fieldByKey={fieldByKey}
        fieldKeys={block.fieldKeys}
        onDropTargetChange={onDropTargetChange}
        onFieldDragEnd={onFieldDragEnd}
        onFieldDragStart={onFieldDragStart}
        onFieldDrop={onFieldDrop}
        onRemove={(fieldKey) =>
          onUpdate({
            ...block,
            fieldKeys: removeFieldKey(block.fieldKeys, fieldKey),
          })
        }
      />
    </div>
  );
}

function CornerBlockEditor({
  activeDropTarget,
  block,
  blockIndex,
  draggedField,
  fieldByKey,
  fields,
  onDropTargetChange,
  onFieldDragEnd,
  onFieldDragStart,
  onFieldDrop,
  onUpdate,
  sectionIndex,
}: {
  activeDropTarget: string;
  block: Extract<SetupLayoutBlock, { type: "corners" }>;
  blockIndex: number;
  draggedField: DraggedTemplateField | null;
  fieldByKey: Map<string, SetupFieldDefinition>;
  fields: SetupFieldDefinition[];
  onDropTargetChange: (targetId: string) => void;
  onFieldDragEnd: () => void;
  onFieldDragStart: (field: DraggedTemplateField) => void;
  onFieldDrop: (target: FieldPlacement) => void;
  onUpdate: (block: SetupLayoutBlock) => void;
  sectionIndex: number;
}) {
  const corners = block.corners.length ? block.corners : defaultCorners();

  function updateCorner(index: number, patch: Partial<(typeof corners)[number]>) {
    onUpdate({
      ...block,
      corners: corners.map((corner, cornerIndex) =>
        cornerIndex === index ? { ...corner, ...patch } : corner,
      ),
    });
  }

  return (
    <div className="block-editor-body">
      <label>
        Grid Style
        <select
          value={cornerLayoutFromClass(block.className)}
          onChange={(event) =>
            onUpdate({
              ...block,
              className: cornerClassFromLayout(event.target.value),
              corners,
            })
          }
        >
          <option value="setup">2x2 setup corners</option>
          <option value="tire">Tire grid</option>
          <option value="weight">Weight grid</option>
          <option value="default">Basic corner grid</option>
        </select>
      </label>
      <div className="corner-template-grid">
        {corners.map((corner, index) => (
          <div className="corner-template-cell" key={`${corner.corner}-${index}`}>
            <TextInput
              label="Corner"
              value={corner.corner}
              onChange={(cornerName) => updateCorner(index, { corner: cornerName })}
            />
            <FieldPicker
              fields={fields}
              label="Add Field"
              selectedKeys={corner.fieldKeys}
              onPick={(fieldKey) =>
                updateCorner(index, {
                  fieldKeys: addUniqueFieldKey(corner.fieldKeys, fieldKey),
                })
              }
            />
            <FieldKeyList
              activeDropTarget={activeDropTarget}
              draggedField={draggedField}
              dropTarget={{ blockIndex, cornerIndex: index, sectionIndex }}
              fieldByKey={fieldByKey}
              fieldKeys={corner.fieldKeys}
              onDropTargetChange={onDropTargetChange}
              onFieldDragEnd={onFieldDragEnd}
              onFieldDragStart={onFieldDragStart}
              onFieldDrop={onFieldDrop}
              onRemove={(fieldKey) =>
                updateCorner(index, {
                  fieldKeys: removeFieldKey(corner.fieldKeys, fieldKey),
                })
              }
            />
          </div>
        ))}
      </div>
      <button
        className="secondary-button"
        type="button"
        onClick={() =>
          onUpdate({
            ...block,
            corners: [...corners, { corner: "custom", fieldKeys: [] }],
          })
        }
      >
        <Plus size={15} />
        Corner
      </button>
    </div>
  );
}

function ComputedBlockEditor({
  block,
  onUpdate,
}: {
  block: Extract<SetupLayoutBlock, { type: "computed" }>;
  onUpdate: (block: SetupLayoutBlock) => void;
}) {
  return (
    <div className="block-editor-body">
      <label>
        Calculation
        <select
          value={block.computed}
          onChange={(event) => {
            const computed = event.target.value as "weight_percentages" | "gear_ratio";
            onUpdate({
              ...block,
              className: computedClassName(computed),
              computed,
            });
          }}
        >
          <option value="weight_percentages">Weight Percentages</option>
          <option value="gear_ratio">Gear Ratio</option>
        </select>
      </label>
    </div>
  );
}

function FieldPicker({
  fields,
  label,
  onPick,
  selectedKeys,
}: {
  fields: SetupFieldDefinition[];
  label: string;
  onPick: (fieldKey: string) => void;
  selectedKeys: string[];
}) {
  const availableFields = fields.filter((field) => !selectedKeys.includes(field.key));

  return (
    <label>
      {label}
      <select
        value=""
        onChange={(event) => {
          if (!event.target.value) return;
          onPick(event.target.value);
        }}
      >
        <option value="">Choose field...</option>
        {availableFields.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label} ({field.key})
          </option>
        ))}
      </select>
    </label>
  );
}

function FieldKeyList({
  activeDropTarget,
  draggedField,
  dropTarget,
  fieldByKey,
  fieldKeys,
  onDropTargetChange,
  onFieldDragEnd,
  onFieldDragStart,
  onFieldDrop,
  onRemove,
}: {
  activeDropTarget: string;
  draggedField: DraggedTemplateField | null;
  dropTarget: FieldPlacement;
  fieldByKey: Map<string, SetupFieldDefinition>;
  fieldKeys: string[];
  onDropTargetChange: (targetId: string) => void;
  onFieldDragEnd: () => void;
  onFieldDragStart: (field: DraggedTemplateField) => void;
  onFieldDrop: (target: FieldPlacement) => void;
  onRemove: (fieldKey: string) => void;
}) {
  const targetId = fieldPlacementId(dropTarget);
  const dropDisabled =
    draggedField?.source && sameFieldPlacement(draggedField.source, dropTarget);
  const listClassName = [
    "assigned-field-list",
    draggedField ? "drag-enabled" : "",
    activeDropTarget === targetId && !dropDisabled ? "drag-over" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggedField || dropDisabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = draggedField.source ? "move" : "copy";
    onDropTargetChange(targetId);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    if (!draggedField || dropDisabled) return;
    event.preventDefault();
    onFieldDrop(dropTarget);
  }

  if (!fieldKeys.length) {
    return (
      <div
        className={`${listClassName} empty-drop-zone`}
        onDragLeave={() => onDropTargetChange("")}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="empty-state compact-empty-state">Drop fields here.</div>
      </div>
    );
  }

  return (
    <div
      className={listClassName}
      onDragLeave={() => onDropTargetChange("")}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {fieldKeys.map((fieldKey, fieldIndex) => {
        const chipDropTarget = { ...dropTarget, insertIndex: fieldIndex };
        const chipTargetId = fieldPlacementId(chipDropTarget);
        const chipDropDisabled =
          draggedField?.source &&
          sameFieldPlacement(draggedField.source, chipDropTarget) &&
          (draggedField.source.insertIndex === fieldIndex ||
            draggedField.source.insertIndex === fieldIndex - 1);

        return (
        <span
          className={[
            fieldByKey.has(fieldKey) ? "assigned-field-chip" : "assigned-field-chip missing",
            activeDropTarget === chipTargetId && !chipDropDisabled
              ? "chip-drop-before"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
          draggable={fieldByKey.has(fieldKey)}
          key={fieldKey}
          onDragLeave={() => onDropTargetChange("")}
          onDragEnd={onFieldDragEnd}
          onDragOver={(event) => {
            if (!draggedField || chipDropDisabled) return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = draggedField.source ? "move" : "copy";
            onDropTargetChange(chipTargetId);
          }}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", fieldKey);
            onFieldDragStart({
              fieldKey,
              source: { ...dropTarget, insertIndex: fieldIndex },
            });
          }}
          onDrop={(event) => {
            if (!draggedField || chipDropDisabled) return;
            event.preventDefault();
            event.stopPropagation();
            onFieldDrop(chipDropTarget);
          }}
        >
          <span>{fieldLabel(fieldKey, fieldByKey)}</span>
          <button
            aria-label={`Remove ${fieldKey}`}
            type="button"
            onClick={() => onRemove(fieldKey)}
          >
            <Trash2 size={13} />
          </button>
        </span>
        );
      })}
    </div>
  );
}

function TextInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label>
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function planToForm(plan: AdminPlan | null) {
  return {
    displayName: plan?.display_name ?? "",
    id: plan?.id,
    isActive: plan?.is_active ?? true,
    maxCars: plan?.max_cars == null ? "" : String(plan.max_cars),
    maxEngines: plan?.max_engines == null ? "" : String(plan.max_engines),
    name: plan?.name ?? "",
    priceCents: plan?.price_cents == null ? "" : String(plan.price_cents),
    priceCurrency: plan?.price_currency ?? "usd",
    stripePriceId: plan?.stripe_price_id ?? "",
  };
}

function numberOrNull(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numberValue = Number(trimmed);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeIdentifierInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+/g, "");
}

function selectedTemplateName(carTypes: AdminCarType[], selectedCarTypeId: string) {
  return carTypes.find((carType) => carType.id === selectedCarTypeId)?.name;
}

function normalizeSetupTemplateDefinition(
  definition: CarTypeSetupDefinition,
): CarTypeSetupDefinition {
  return {
    ...definition,
    fields: definition.fields.map((field) => ({
      ...field,
      scope: "setup_values",
    })),
  };
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function splitOptions(value: string) {
  return value
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, item);
  return nextItems;
}

function uniqueFieldKey(fields: SetupFieldDefinition[], base: string) {
  const keys = new Set(fields.map((field) => field.key));
  let candidate = base;
  let suffix = 2;
  while (keys.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function uniqueSectionId(sections: SetupSectionDefinition[], base: string) {
  const ids = new Set(sections.map((section) => section.id));
  let candidate = base;
  let suffix = 2;
  while (ids.has(candidate)) {
    candidate = `${base}_${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function moveRecordFlag(
  flags: Record<number, boolean>,
  index: number,
  direction: -1 | 1,
) {
  const nextIndex = index + direction;
  if (nextIndex < 0) return flags;
  const nextFlags = { ...flags };
  const currentValue = nextFlags[index];
  const nextValue = nextFlags[nextIndex];
  if (nextValue === undefined) {
    delete nextFlags[index];
  } else {
    nextFlags[index] = nextValue;
  }
  if (currentValue === undefined) {
    delete nextFlags[nextIndex];
  } else {
    nextFlags[nextIndex] = currentValue;
  }
  return nextFlags;
}

function removeRecordFlag(flags: Record<number, boolean>, index: number) {
  return Object.entries(flags).reduce<Record<number, boolean>>(
    (nextFlags, [key, value]) => {
      const numericKey = Number(key);
      if (numericKey < index) {
        nextFlags[numericKey] = value;
      } else if (numericKey > index) {
        nextFlags[numericKey - 1] = value;
      }
      return nextFlags;
    },
    {},
  );
}

function replaceFieldReferences(
  sections: SetupSectionDefinition[],
  previousKey: string,
  nextKey: string,
) {
  return sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      if (block.type === "fields") {
        return {
          ...block,
          fieldKeys: block.fieldKeys.map((fieldKey) =>
            fieldKey === previousKey ? nextKey : fieldKey,
          ),
        };
      }
      if (block.type === "corners") {
        return {
          ...block,
          corners: block.corners.map((corner) => ({
            ...corner,
            fieldKeys: corner.fieldKeys.map((fieldKey) =>
              fieldKey === previousKey ? nextKey : fieldKey,
            ),
          })),
        };
      }
      return block;
    }),
  }));
}

function removeFieldReferences(sections: SetupSectionDefinition[], fieldKey: string) {
  return sections.map((section) => ({
    ...section,
    blocks: section.blocks.map((block) => {
      if (block.type === "fields") {
        return {
          ...block,
          fieldKeys: block.fieldKeys.filter((key) => key !== fieldKey),
        };
      }
      if (block.type === "corners") {
        return {
          ...block,
          corners: block.corners.map((corner) => ({
            ...corner,
            fieldKeys: corner.fieldKeys.filter((key) => key !== fieldKey),
          })),
        };
      }
      return block;
    }),
  }));
}

function defaultBlock(type: SetupLayoutBlock["type"]): SetupLayoutBlock {
  if (type === "corners") {
    return {
      className: "corner-grid setup-corner-grid",
      corners: defaultCorners(),
      type,
    };
  }
  if (type === "computed") {
    return {
      className: computedClassName("weight_percentages"),
      computed: "weight_percentages",
      type,
    };
  }
  return {
    className: "form-grid single",
    fieldKeys: [],
    type,
  };
}

function defaultCorners() {
  return [
    { corner: "lf", fieldKeys: [] },
    { corner: "rf", fieldKeys: [] },
    { corner: "lr", fieldKeys: [] },
    { corner: "rr", fieldKeys: [] },
  ];
}

function addUniqueFieldKey(fieldKeys: string[], fieldKey: string) {
  if (!fieldKey || fieldKeys.includes(fieldKey)) return fieldKeys;
  return [...fieldKeys, fieldKey];
}

function removeFieldKey(fieldKeys: string[], fieldKey: string) {
  return fieldKeys.filter((key) => key !== fieldKey);
}

function fieldPlacementId(placement: FieldPlacement) {
  return [
    placement.sectionIndex,
    placement.blockIndex,
    placement.cornerIndex ?? "fields",
    placement.insertIndex ?? "end",
  ].join(":");
}

function sameFieldPlacement(left: FieldPlacement, right: FieldPlacement) {
  return (
    left.sectionIndex === right.sectionIndex &&
    left.blockIndex === right.blockIndex &&
    left.cornerIndex === right.cornerIndex
  );
}

function sourceMatchesPlacement(
  source: FieldPlacement | undefined,
  sectionIndex: number,
  blockIndex: number,
) {
  return (
    source?.sectionIndex === sectionIndex &&
    source.blockIndex === blockIndex
  );
}

function removeFieldFromPlacement(
  block: SetupLayoutBlock,
  source: FieldPlacement | undefined,
  fieldKey: string,
): SetupLayoutBlock {
  if (!source) return block;
  if (block.type === "fields" && source.cornerIndex === undefined) {
    return { ...block, fieldKeys: removeFieldKey(block.fieldKeys, fieldKey) };
  }
  if (block.type === "corners" && source.cornerIndex !== undefined) {
    return {
      ...block,
      corners: block.corners.map((corner, index) =>
        index === source.cornerIndex
          ? { ...corner, fieldKeys: removeFieldKey(corner.fieldKeys, fieldKey) }
          : corner,
      ),
    };
  }
  return block;
}

function addFieldToPlacement(
  block: SetupLayoutBlock,
  target: FieldPlacement,
  fieldKey: string,
  source: FieldPlacement | undefined,
): SetupLayoutBlock {
  if (block.type === "fields" && target.cornerIndex === undefined) {
    return {
      ...block,
      fieldKeys: insertUniqueFieldKey(
        block.fieldKeys,
        fieldKey,
        adjustedInsertIndex(source, target),
      ),
    };
  }
  if (block.type === "corners" && target.cornerIndex !== undefined) {
    return {
      ...block,
      corners: block.corners.map((corner, index) =>
        index === target.cornerIndex
          ? {
              ...corner,
              fieldKeys: insertUniqueFieldKey(
                corner.fieldKeys,
                fieldKey,
                adjustedInsertIndex(source, target),
              ),
            }
          : corner,
      ),
    };
  }
  return block;
}

function insertUniqueFieldKey(
  fieldKeys: string[],
  fieldKey: string,
  insertIndex?: number,
) {
  if (!fieldKey || fieldKeys.includes(fieldKey)) return fieldKeys;
  if (insertIndex === undefined) return [...fieldKeys, fieldKey];
  const boundedIndex = Math.max(0, Math.min(insertIndex, fieldKeys.length));
  return [
    ...fieldKeys.slice(0, boundedIndex),
    fieldKey,
    ...fieldKeys.slice(boundedIndex),
  ];
}

function adjustedInsertIndex(
  source: FieldPlacement | undefined,
  target: FieldPlacement,
) {
  if (target.insertIndex === undefined) return undefined;
  if (
    source &&
    sameFieldPlacement(source, target) &&
    source.insertIndex !== undefined &&
    source.insertIndex < target.insertIndex
  ) {
    return target.insertIndex - 1;
  }
  return target.insertIndex;
}

function fieldRowLayoutFromClass(className = "") {
  if (className.includes("result-pair-grid")) return "pair";
  if (className.includes("gear-grid")) return "gear";
  if (className.includes("single")) return "single";
  return "default";
}

function fieldRowClassFromLayout(layout: string) {
  if (layout === "pair") return "form-grid result-pair-grid";
  if (layout === "gear") return "form-grid gear-grid";
  if (layout === "single") return "form-grid single";
  return "form-grid";
}

function cornerLayoutFromClass(className = "") {
  if (className.includes("tire-corner-grid")) return "tire";
  if (className.includes("weight-corner-grid")) return "weight";
  if (className.includes("setup-corner-grid")) return "setup";
  return "default";
}

function cornerClassFromLayout(layout: string) {
  if (layout === "tire") return "corner-grid tire-corner-grid";
  if (layout === "weight") return "corner-grid weight-corner-grid";
  if (layout === "setup") return "corner-grid setup-corner-grid";
  return "corner-grid";
}

function computedClassName(computed: "weight_percentages" | "gear_ratio") {
  return computed === "gear_ratio"
    ? "calculated-grid centered"
    : "calculated-grid weight-percent-grid";
}

function computedLabel(computed: "weight_percentages" | "gear_ratio") {
  return computed === "gear_ratio" ? "Gear Ratio" : "Weight Percentages";
}

function blockTitle(block: SetupLayoutBlock) {
  if (block.type === "corners") return "Corner Grid";
  if (block.type === "computed") return computedLabel(block.computed);
  return "Field Row";
}

function blockDescription(block: SetupLayoutBlock) {
  if (block.type === "corners") {
    return `${block.corners.length || 4} corners`;
  }
  if (block.type === "computed") {
    return "Calculated display";
  }
  return `${block.fieldKeys.length} fields`;
}

function fieldLabel(
  fieldKey: string,
  fieldByKey: Map<string, SetupFieldDefinition>,
) {
  const field = fieldByKey.get(fieldKey);
  return field ? `${field.label} (${field.key})` : `Missing: ${fieldKey}`;
}

function validateTemplate(
  fields: SetupFieldDefinition[],
  sections: SetupSectionDefinition[],
) {
  const keys = new Set<string>();
  for (const field of fields) {
    if (!field.key.trim()) throw new Error("Every field needs a key.");
    if (keys.has(field.key)) throw new Error(`Duplicate field key: ${field.key}`);
    keys.add(field.key);
    if (!field.label.trim()) throw new Error(`${field.key} needs a label.`);
    if ((field.type === "select" || field.type === "radio") && !field.options?.length) {
      throw new Error(`${field.key} needs options.`);
    }
  }

  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (!section.id || !section.title || !Array.isArray(section.blocks)) {
      throw new Error("Each section needs id, title, and blocks.");
    }
    if (sectionIds.has(section.id)) {
      throw new Error(`Duplicate section id: ${section.id}`);
    }
    sectionIds.add(section.id);
    for (const block of section.blocks) {
      if (block.type === "fields") {
        validateFieldKeys(keys, block.fieldKeys, section.title);
      } else if (block.type === "corners") {
        for (const corner of block.corners) {
          if (!corner.corner.trim()) {
            throw new Error(`${section.title} has a corner with no label.`);
          }
          validateFieldKeys(keys, corner.fieldKeys, `${section.title} ${corner.corner}`);
        }
      } else if (
        block.computed !== "weight_percentages" &&
        block.computed !== "gear_ratio"
      ) {
        throw new Error(`${section.title} has an unsupported computed block.`);
      }
    }
  }
}

function validateFieldKeys(
  validKeys: Set<string>,
  fieldKeys: string[],
  location: string,
) {
  for (const fieldKey of fieldKeys) {
    if (!validKeys.has(fieldKey)) {
      throw new Error(`${location} references missing field: ${fieldKey}`);
    }
  }
}

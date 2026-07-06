import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bookmark, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { fetchCarTypes, type CarType } from "../data/cars";
import {
  createFavoriteSetup,
  deleteFavoriteSetup,
  FAVORITE_SETUPS_CHANGED_EVENT,
  favoriteSetupToInput,
  fetchFavoriteSetups,
  updateFavoriteSetup,
  type FavoriteSetup,
} from "../data/favoriteSetups";
import { setupFieldsForCarType, setupSectionsForCarType } from "../data/setupFields/index";
import type { SetupSessionInput, SetupSessionInputField } from "../data/sessions";
import {
  calculateWeightStats,
  SetupFieldsEditor,
} from "./SetupFieldsEditor";

const emptyFavoriteForm = {
  car_type_id: "",
  name: "",
  notes: "",
  setup_values: {} as SetupSessionInput,
};

type FavoriteSetupForm = typeof emptyFavoriteForm;

type FavoriteSetupsViewProps = {
  supabase: SupabaseClient;
  userId: string;
};

export function FavoriteSetupsView({ supabase, userId }: FavoriteSetupsViewProps) {
  const [carTypes, setCarTypes] = useState<CarType[]>([]);
  const [favoriteSetups, setFavoriteSetups] = useState<FavoriteSetup[]>([]);
  const [favoriteForm, setFavoriteForm] =
    useState<FavoriteSetupForm>(emptyFavoriteForm);
  const [editingFavoriteId, setEditingFavoriteId] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [carTypeFilter, setCarTypeFilter] = useState("all");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">(
    "loading",
  );
  const [message, setMessage] = useState("");

  const refreshFavoriteSetups = useCallback(async () => {
    const nextSetups = await fetchFavoriteSetups(supabase);
    setFavoriteSetups(nextSetups);
  }, [supabase]);

  const carTypeById = useMemo(
    () => new Map(carTypes.map((carType) => [carType.id, carType])),
    [carTypes],
  );
  const selectedCarType = carTypeById.get(favoriteForm.car_type_id);
  const setupFieldDefinitions = useMemo(
    () => setupFieldsForCarType(selectedCarType?.slug),
    [selectedCarType?.slug],
  );
  const setupFieldByKey = useMemo(
    () => new Map(setupFieldDefinitions.map((field) => [field.key, field])),
    [setupFieldDefinitions],
  );
  const setupSections = useMemo(
    () =>
      setupSectionsForCarType(selectedCarType?.slug).filter(
        (section) => section.id !== "result" && section.id !== "notes",
      ),
    [selectedCarType?.slug],
  );
  const visibleSetups = useMemo(() => {
    const query = search.trim().toLowerCase();
    return favoriteSetups.filter((setup) => {
      const matchesType =
        carTypeFilter === "all" || setup.car_type_id === carTypeFilter;
      const matchesSearch =
        !query ||
        [
          setup.name,
          setup.notes,
          setup.carType?.name,
          setup.setup_values.tire_notes,
          setup.setup_values.lr_hub,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query);
      return matchesType && matchesSearch;
    });
  }, [carTypeFilter, favoriteSetups, search]);

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    setMessage("");

    Promise.all([fetchCarTypes(supabase), fetchFavoriteSetups(supabase)])
      .then(([nextCarTypes, nextSetups]) => {
        if (!isCurrent) return;
        setCarTypes(nextCarTypes);
        setFavoriteSetups(nextSetups);
        setFavoriteForm((current) => ({
          ...current,
          car_type_id: current.car_type_id || nextCarTypes[0]?.id || "",
        }));
        setStatus("ready");
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

  useEffect(() => {
    let isCurrent = true;

    function handleFavoriteSetupsChanged(event: Event) {
      const source = (event as CustomEvent<{ source?: string }>).detail?.source;
      if (source === "setups") return;

      refreshFavoriteSetups()
        .then(() => {
          if (!isCurrent) return;
          setMessage("");
        })
        .catch((error: Error) => {
          if (!isCurrent) return;
          setMessage(error.message);
        });
    }

    window.addEventListener(
      FAVORITE_SETUPS_CHANGED_EVENT,
      handleFavoriteSetupsChanged,
    );

    return () => {
      isCurrent = false;
      window.removeEventListener(
        FAVORITE_SETUPS_CHANGED_EVENT,
        handleFavoriteSetupsChanged,
      );
    };
  }, [refreshFavoriteSetups]);

  function updateSetupField(field: SetupSessionInputField, value: string) {
    setFavoriteForm((current) => ({
      ...current,
      setup_values: { ...current.setup_values, [field]: value },
    }));
  }

  function startAddFavorite() {
    setEditingFavoriteId("");
    setFavoriteForm({
      ...emptyFavoriteForm,
      car_type_id: carTypes[0]?.id || "",
      setup_values: {},
    });
    setMessage("");
    setIsModalOpen(true);
  }

  function startEditFavorite(setup: FavoriteSetup) {
    setEditingFavoriteId(setup.id);
    setFavoriteForm({
      car_type_id: setup.car_type_id,
      name: setup.name,
      notes: setup.notes ?? "",
      setup_values: favoriteSetupToInput(setup),
    });
    setMessage("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setEditingFavoriteId("");
    setFavoriteForm({
      ...emptyFavoriteForm,
      car_type_id: favoriteForm.car_type_id || carTypes[0]?.id || "",
      setup_values: {},
    });
    setIsModalOpen(false);
  }

  async function handleSaveFavorite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const carType = carTypeById.get(favoriteForm.car_type_id);
    if (!favoriteForm.name.trim()) {
      setMessage("Favorite setup name is required.");
      return;
    }
    if (!carType) {
      setMessage("Choose a car type.");
      return;
    }

    setStatus("saving");
    setMessage("");
    try {
      const input = {
        ...favoriteForm,
        carTypeSlug: carType.slug,
      };
      const saved = editingFavoriteId
        ? await updateFavoriteSetup(supabase, editingFavoriteId, input)
        : await createFavoriteSetup(supabase, userId, input);
      setFavoriteSetups((current) =>
        [saved, ...current.filter((setup) => setup.id !== saved.id)].sort(
          sortFavoriteSetups,
        ),
      );
      window.dispatchEvent(
        new CustomEvent(FAVORITE_SETUPS_CHANGED_EVENT, {
          detail: { source: "setups" },
        }),
      );
      closeModal();
      setMessage(editingFavoriteId ? "Favorite setup updated." : "Favorite setup saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Favorite setup could not be saved.",
      );
    } finally {
      setStatus("ready");
    }
  }

  async function handleDeleteFavorite(setup: FavoriteSetup) {
    const confirmed = window.confirm(`Remove "${setup.name}"?`);
    if (!confirmed) return;

    setStatus("saving");
    setMessage("");
    try {
      await deleteFavoriteSetup(supabase, setup.id);
      setFavoriteSetups((current) =>
        current.filter((favorite) => favorite.id !== setup.id),
      );
      window.dispatchEvent(
        new CustomEvent(FAVORITE_SETUPS_CHANGED_EVENT, {
          detail: { source: "setups" },
        }),
      );
      if (editingFavoriteId === setup.id) closeModal();
      setMessage("Favorite setup removed.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Favorite setup could not be removed.",
      );
    } finally {
      setStatus("ready");
    }
  }

  return (
    <section className="favorite-setups-layout">
      <div className="panel track-list-panel favorite-setups-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Setups</span>
            <h2>Favorite Setups</h2>
          </div>
          <div className="panel-actions">
            <span className="count-pill">{visibleSetups.length}</span>
            <button
              className="primary-button"
              disabled={status === "saving"}
              type="button"
              onClick={startAddFavorite}
            >
              <Plus size={18} />
              New Setup
            </button>
          </div>
        </div>

        <div className="session-history-filters">
          <label className="session-search-field">
            <Search size={18} />
            <input
              aria-label="Search favorite setups"
              placeholder="Search name, car type, notes"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Car Type
            <select
              value={carTypeFilter}
              onChange={(event) => setCarTypeFilter(event.target.value)}
            >
              <option value="all">All Types</option>
              {carTypes.map((carType) => (
                <option key={carType.id} value={carType.id}>
                  {carType.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {status === "loading" ? (
          <div className="empty-state">Loading favorite setups...</div>
        ) : visibleSetups.length ? (
          <div className="favorite-setup-grid">
            {visibleSetups.map((setup) => (
              <FavoriteSetupCard
                key={setup.id}
                setup={setup}
                status={status}
                onDelete={handleDeleteFavorite}
                onEdit={startEditFavorite}
              />
            ))}
          </div>
        ) : favoriteSetups.length ? (
          <div className="empty-state">No favorite setups match your filters.</div>
        ) : (
          <div className="empty-state">No favorite setups yet.</div>
        )}

        {message ? <div className="inline-message">{message}</div> : null}
      </div>

      {isModalOpen ? (
        <Modal
          eyebrow={editingFavoriteId ? "Edit Favorite" : "New Favorite"}
          icon={editingFavoriteId ? <Save size={20} /> : <Bookmark size={20} />}
          title={`Favorite Setup - ${selectedCarType?.name ?? "Choose car type"}`}
          onClose={closeModal}
        >
          <form className="session-form session-modal-form" onSubmit={handleSaveFavorite}>
            <div className="form-panel">
              <fieldset className="session-card">
                <legend>Setup Details</legend>
                <div
                  className={
                    editingFavoriteId
                      ? "form-grid single"
                      : "form-grid result-pair-grid"
                  }
                >
                  <label>
                    Name
                    <input
                      required
                      value={favoriteForm.name}
                      onChange={(event) =>
                        setFavoriteForm({
                          ...favoriteForm,
                          name: event.target.value,
                        })
                      }
                      placeholder="Cold weather at Little Wheels"
                    />
                  </label>
                  {editingFavoriteId ? null : (
                    <label>
                      Car Type
                      <select
                        required
                        value={favoriteForm.car_type_id}
                        onChange={(event) =>
                          setFavoriteForm({
                            ...favoriteForm,
                            car_type_id: event.target.value,
                            setup_values: {},
                          })
                        }
                      >
                        <option value="">Choose type</option>
                        {carTypes.map((carType) => (
                          <option key={carType.id} value={carType.id}>
                            {carType.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <div className="form-grid notes-grid single">
                  <label>
                    Notes
                    <textarea
                      value={favoriteForm.notes}
                      onChange={(event) =>
                        setFavoriteForm({
                          ...favoriteForm,
                          notes: event.target.value,
                        })
                      }
                      placeholder="When this setup works, track condition, tire reminders"
                    />
                  </label>
                </div>
              </fieldset>

              <SetupFieldsEditor
                allowedScopes={["setup_values"]}
                fieldByKey={setupFieldByKey}
                form={favoriteForm.setup_values}
                sections={setupSections}
                onChange={updateSetupField}
              />

              <div className="button-row">
                <button
                  className="secondary-button"
                  disabled={status === "saving"}
                  type="button"
                  onClick={closeModal}
                >
                  Cancel
                </button>
                <button
                  className="primary-button"
                  disabled={status === "saving"}
                  type="submit"
                >
                  {editingFavoriteId ? <Save size={18} /> : <Plus size={18} />}
                  {editingFavoriteId ? "Save Setup" : "Add Setup"}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function FavoriteSetupCard({
  onDelete,
  onEdit,
  setup,
  status,
}: {
  setup: FavoriteSetup;
  status: "loading" | "ready" | "saving";
  onDelete: (setup: FavoriteSetup) => void;
  onEdit: (setup: FavoriteSetup) => void;
}) {
  const form = favoriteSetupToInput(setup);
  const stats = calculateWeightStats(form);
  const summary = favoriteSetupSummary(form);

  return (
    <article className="favorite-setup-card">
      <div className="garage-card-heading">
        <div>
          <h3>{setup.name}</h3>
          <p>{setup.carType?.name ?? "Unknown car type"}</p>
          {setup.notes ? <p>{setup.notes}</p> : null}
        </div>
        <Bookmark size={18} />
      </div>

      <div className="garage-stat-grid">
        <FavoriteSetupStat label="Cross" value={stats.cross} />
        <FavoriteSetupStat label="Stagger" value={form.stagger || "--"} />
        <FavoriteSetupStat label="Gear" value={summary.gear} />
        <FavoriteSetupStat label="LR Hub" value={form.lr_hub || "--"} />
      </div>

      <div className="garage-card-actions">
        <button
          aria-label={`Edit ${setup.name}`}
          className="icon-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onEdit(setup)}
        >
          <Pencil size={18} />
        </button>
        <button
          aria-label={`Remove ${setup.name}`}
          className="danger-icon-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onDelete(setup)}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </article>
  );
}

function FavoriteSetupStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="garage-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Modal({
  children,
  eyebrow,
  icon,
  onClose,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  icon: ReactNode;
  onClose: () => void;
  title: string;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-modal="true"
        className="modal-panel session-modal-panel"
        role="dialog"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="panel-header">
          <div>
            <span className="eyebrow">{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <div className="panel-actions">
            {icon}
            <button
              aria-label="Close dialog"
              className="icon-button"
              type="button"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>
        {children}
      </section>
    </div>
  );
}

function favoriteSetupSummary(form: SetupSessionInput) {
  const engineGear = form.engine_gear;
  const axleGear = form.axle_gear;

  return {
    gear: engineGear && axleGear ? `${engineGear}/${axleGear}` : "--",
  };
}

function sortFavoriteSetups(a: FavoriteSetup, b: FavoriteSetup) {
  return a.name.localeCompare(b.name);
}

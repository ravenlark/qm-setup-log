import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Car, ChevronDown, Pencil, Plus, Save, Trash2, Wrench, X } from "lucide-react";
import {
  createCar,
  deleteCar,
  fetchCars,
  updateCar,
  type RaceCar,
  type RaceCarInput,
} from "../data/cars";
import {
  fetchActiveEngineAssignments,
  type EngineAssignment,
} from "../data/engineAssignments";
import {
  createEngine,
  createEngineMaintenance,
  deleteEngine,
  deleteEngineMaintenance,
  fetchEngineMaintenance,
  fetchEngineTypes,
  fetchEngines,
  fetchMaintenanceTypes,
  updateEngine,
  updateEngineMaintenance,
  type EngineInput,
  type EngineMaintenanceInput,
  type EngineMaintenanceWithType,
  type EngineType,
  type EngineWithType,
  type MaintenanceType,
} from "../data/engines";
import { fetchSessions, type SetupSession } from "../data/sessions";

const emptyEngineForm: EngineInput = {
  engine_type_id: "",
  name: "",
  serial: "",
  notes: "",
};

const emptyCarForm: RaceCarInput = {
  name: "",
  model: "",
  year: "",
  notes: "",
};

const emptyMaintenanceForm: EngineMaintenanceInput = {
  maintenance_type_id: "",
  maintenance_date: localDateValue(),
  performed_by: "",
  cost: "",
  notes: "",
};

type GarageViewProps = {
  supabase: SupabaseClient;
  userId: string;
};

type GarageModal = "car" | "engine" | "maintenance" | null;

type EngineStats = {
  lastRefresh: EngineMaintenanceWithType | null;
  lastService: EngineMaintenanceWithType | null;
  sinceRefresh: number;
  totalLaps: number;
};

export function GarageView({ supabase, userId }: GarageViewProps) {
  const [cars, setCars] = useState<RaceCar[]>([]);
  const [engineTypes, setEngineTypes] = useState<EngineType[]>([]);
  const [maintenanceTypes, setMaintenanceTypes] = useState<MaintenanceType[]>([]);
  const [engines, setEngines] = useState<EngineWithType[]>([]);
  const [engineAssignments, setEngineAssignments] = useState<EngineAssignment[]>([]);
  const [sessions, setSessions] = useState<SetupSession[]>([]);
  const [maintenanceEntries, setMaintenanceEntries] = useState<
    EngineMaintenanceWithType[]
  >([]);
  const [editingCarId, setEditingCarId] = useState("");
  const [editingEngineId, setEditingEngineId] = useState("");
  const [editingMaintenanceId, setEditingMaintenanceId] = useState("");
  const [activeModal, setActiveModal] = useState<GarageModal>(null);
  const [maintenanceEngineId, setMaintenanceEngineId] = useState("");
  const [carForm, setCarForm] = useState(emptyCarForm);
  const [engineForm, setEngineForm] = useState(emptyEngineForm);
  const [maintenanceForm, setMaintenanceForm] = useState(emptyMaintenanceForm);
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [message, setMessage] = useState("");

  const carById = useMemo(
    () => new Map(cars.map((car) => [car.id, car])),
    [cars],
  );

  const engineById = useMemo(
    () => new Map(engines.map((engine) => [engine.id, engine])),
    [engines],
  );

  const maintenanceByEngineId = useMemo(() => {
    const grouped = new Map<string, EngineMaintenanceWithType[]>();
    for (const entry of maintenanceEntries) {
      const entries = grouped.get(entry.engine_id) ?? [];
      entries.push(entry);
      grouped.set(entry.engine_id, entries);
    }

    for (const entries of grouped.values()) {
      entries.sort(sortMaintenanceEntries);
    }
    return grouped;
  }, [maintenanceEntries]);

  const engineStatsById = useMemo(() => {
    const stats = new Map<string, EngineStats>();

    for (const engine of engines) {
      const maintenance = maintenanceByEngineId.get(engine.id) ?? [];
      const lastService = maintenance[0] ?? null;
      const lastRefresh =
        maintenance.find((entry) =>
          entry.maintenanceType?.name.toLowerCase().includes("refresh"),
        ) ?? null;
      const engineSessions = sessions.filter(
        (session) => session.engine_id === engine.id,
      );
      const totalLaps = sumLaps(engineSessions);
      const sinceRefresh = lastRefresh
        ? sumLaps(
            engineSessions.filter(
              (session) => session.session_date >= lastRefresh.maintenance_date,
            ),
          )
        : totalLaps;

      stats.set(engine.id, {
        lastRefresh,
        lastService,
        sinceRefresh,
        totalLaps,
      });
    }

    return stats;
  }, [engines, maintenanceByEngineId, sessions]);

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    setMessage("");

    Promise.all([
      fetchCars(supabase),
      fetchActiveEngineAssignments(supabase),
      fetchEngineTypes(supabase),
      fetchMaintenanceTypes(supabase),
      fetchEngines(supabase),
      fetchSessions(supabase),
    ])
      .then(
        async ([
          nextCars,
          nextAssignments,
          nextTypes,
          nextMaintenanceTypes,
          nextEngines,
          nextSessions,
        ]) => {
          const nextMaintenanceEntries = (
            await Promise.all(
              nextEngines.map((engine) => fetchEngineMaintenance(supabase, engine.id)),
            )
          ).flat();

          if (!isCurrent) return;
          setCars(nextCars);
          setEngineAssignments(nextAssignments);
          setEngineTypes(nextTypes);
          setMaintenanceTypes(nextMaintenanceTypes);
          setEngines(nextEngines);
          setSessions(nextSessions);
          setMaintenanceEntries(nextMaintenanceEntries);
          setEngineForm((current) => ({
            ...current,
            engine_type_id: current.engine_type_id || nextTypes[0]?.id || "",
          }));
          setMaintenanceForm((current) => ({
            ...current,
            maintenance_type_id:
              current.maintenance_type_id || nextMaintenanceTypes[0]?.id || "",
          }));
          setStatus("ready");
        },
      )
      .catch((error: Error) => {
        if (!isCurrent) return;
        setMessage(error.message);
        setStatus("ready");
      });

    return () => {
      isCurrent = false;
    };
  }, [supabase]);

  function startCarAdd() {
    setEditingCarId("");
    setCarForm(emptyCarForm);
    setActiveModal("car");
  }

  function startCarEdit(car: RaceCar) {
    setEditingCarId(car.id);
    setCarForm({
      name: car.name,
      model: car.model ?? "",
      year: car.year === null ? "" : String(car.year),
      notes: car.notes ?? "",
    });
    setMessage("");
    setActiveModal("car");
  }

  function resetCarForm() {
    setEditingCarId("");
    setCarForm(emptyCarForm);
    setActiveModal((current) => (current === "car" ? null : current));
  }

  function startEngineAdd() {
    setEditingEngineId("");
    setEngineForm({
      ...emptyEngineForm,
      engine_type_id: engineTypes[0]?.id || "",
    });
    setActiveModal("engine");
  }

  function startEngineEdit(engine: EngineWithType) {
    setEditingEngineId(engine.id);
    setEngineForm({
      engine_type_id: engine.engine_type_id,
      name: engine.name,
      serial: engine.serial ?? "",
      notes: engine.notes ?? "",
    });
    setMessage("");
    setActiveModal("engine");
  }

  function resetEngineForm() {
    setEditingEngineId("");
    setEngineForm({
      ...emptyEngineForm,
      engine_type_id: engineTypes[0]?.id || "",
    });
    setActiveModal((current) => (current === "engine" ? null : current));
  }

  function startMaintenanceAdd(engine: EngineWithType) {
    setEditingMaintenanceId("");
    setMaintenanceEngineId(engine.id);
    setMaintenanceForm({
      ...emptyMaintenanceForm,
      maintenance_date: localDateValue(),
      maintenance_type_id: maintenanceTypes[0]?.id || "",
    });
    setMessage("");
    setActiveModal("maintenance");
  }

  function startMaintenanceEdit(entry: EngineMaintenanceWithType) {
    setEditingMaintenanceId(entry.id);
    setMaintenanceEngineId(entry.engine_id);
    setMaintenanceForm({
      maintenance_type_id: entry.maintenance_type_id,
      maintenance_date: entry.maintenance_date,
      performed_by: entry.performed_by ?? "",
      cost: entry.cost === null ? "" : String(entry.cost),
      notes: entry.notes ?? "",
    });
    setMessage("");
    setActiveModal("maintenance");
  }

  function resetMaintenanceForm() {
    setEditingMaintenanceId("");
    setMaintenanceEngineId("");
    setMaintenanceForm({
      ...emptyMaintenanceForm,
      maintenance_date: localDateValue(),
      maintenance_type_id: maintenanceTypes[0]?.id || "",
    });
    setActiveModal((current) => (current === "maintenance" ? null : current));
  }

  async function handleSaveCar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!carForm.name.trim()) {
      setMessage("Car name is required.");
      return;
    }

    setStatus("saving");
    setMessage("");
    try {
      const saved = editingCarId
        ? await updateCar(supabase, editingCarId, carForm)
        : await createCar(supabase, userId, carForm);
      setCars((current) => {
        const withoutSaved = current.filter((car) => car.id !== saved.id);
        return [...withoutSaved, saved].sort(sortCars);
      });
      resetCarForm();
      setMessage(editingCarId ? "Car updated." : "Car added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Car could not be saved.");
    } finally {
      setStatus("ready");
    }
  }

  async function handleDeleteCar(car: RaceCar) {
    const confirmed = window.confirm(
      `Remove "${car.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setStatus("saving");
    setMessage("");
    try {
      await deleteCar(supabase, car.id);
      setCars((current) => current.filter((item) => item.id !== car.id));
      setEngineAssignments((current) =>
        current.filter((assignment) => assignment.car_id !== car.id),
      );
      if (editingCarId === car.id) resetCarForm();
      setMessage("Car removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Car could not be removed.");
    } finally {
      setStatus("ready");
    }
  }

  async function handleSaveEngine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!engineForm.name.trim()) {
      setMessage("Engine name is required.");
      return;
    }
    if (!engineForm.engine_type_id) {
      setMessage("Choose an engine type.");
      return;
    }

    setStatus("saving");
    setMessage("");
    try {
      const saved = editingEngineId
        ? await updateEngine(supabase, editingEngineId, engineForm)
        : await createEngine(supabase, userId, engineForm);
      const savedWithType = {
        ...saved,
        engineType:
          engineTypes.find((engineType) => engineType.id === saved.engine_type_id) ??
          null,
      };
      setEngines((current) => {
        const withoutSaved = current.filter((engine) => engine.id !== saved.id);
        return [...withoutSaved, savedWithType].sort(sortEngines);
      });
      resetEngineForm();
      setMessage(editingEngineId ? "Engine updated." : "Engine added.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Engine could not be saved.");
    } finally {
      setStatus("ready");
    }
  }

  async function handleDeleteEngine(engine: EngineWithType) {
    const confirmed = window.confirm(
      `Remove "${engine.name}"? This cannot be undone.`,
    );
    if (!confirmed) return;

    setStatus("saving");
    setMessage("");
    try {
      await deleteEngine(supabase, engine.id);
      setEngines((current) => current.filter((item) => item.id !== engine.id));
      setEngineAssignments((current) =>
        current.filter((assignment) => assignment.engine_id !== engine.id),
      );
      setMaintenanceEntries((current) =>
        current.filter((entry) => entry.engine_id !== engine.id),
      );
      if (editingEngineId === engine.id) resetEngineForm();
      setMessage("Engine removed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Engine could not be removed.",
      );
    } finally {
      setStatus("ready");
    }
  }

  async function handleSaveMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const engine = engineById.get(maintenanceEngineId);
    if (!engine) {
      setMessage("Select an engine before adding maintenance.");
      return;
    }
    if (!maintenanceForm.maintenance_type_id) {
      setMessage("Choose a maintenance type.");
      return;
    }
    if (!maintenanceForm.maintenance_date) {
      setMessage("Maintenance date is required.");
      return;
    }

    setStatus("saving");
    setMessage("");
    try {
      const saved = editingMaintenanceId
        ? await updateEngineMaintenance(
            supabase,
            editingMaintenanceId,
            maintenanceForm,
          )
        : await createEngineMaintenance(
            supabase,
            userId,
            engine.id,
            maintenanceForm,
          );
      const savedWithType = {
        ...saved,
        maintenanceType:
          maintenanceTypes.find(
            (maintenanceType) =>
              maintenanceType.id === saved.maintenance_type_id,
          ) ?? null,
      };
      setMaintenanceEntries((current) => {
        const withoutSaved = current.filter((entry) => entry.id !== saved.id);
        return [...withoutSaved, savedWithType].sort(sortMaintenanceEntries);
      });
      resetMaintenanceForm();
      setMessage(editingMaintenanceId ? "Maintenance updated." : "Maintenance logged.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Maintenance could not be saved.",
      );
    } finally {
      setStatus("ready");
    }
  }

  async function handleDeleteMaintenance(entry: EngineMaintenanceWithType) {
    const confirmed = window.confirm(
      `Remove ${entry.maintenanceType?.name ?? "maintenance"} from ${formatDate(
        entry.maintenance_date,
      )}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setStatus("saving");
    setMessage("");
    try {
      await deleteEngineMaintenance(supabase, entry.id);
      setMaintenanceEntries((current) =>
        current.filter((item) => item.id !== entry.id),
      );
      if (editingMaintenanceId === entry.id) resetMaintenanceForm();
      setMessage("Maintenance removed.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Maintenance could not be removed.",
      );
    } finally {
      setStatus("ready");
    }
  }

  return (
    <section className="garage-card-layout">
      <div className="panel track-list-panel">
        <div className="panel-header">
          <div>
            <h2>Engines</h2>
          </div>
          <div className="panel-actions">
            <span className="count-pill">{engines.length}</span>
            <button
              aria-label="Add engine"
              className="icon-button"
              disabled={status === "saving"}
              type="button"
              onClick={startEngineAdd}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {status === "loading" ? (
          <div className="empty-state">Loading engines...</div>
        ) : engines.length ? (
          <div className="garage-card-list">
            {engines.map((engine) => (
              <EngineCard
                carName={carNameForEngine(engine.id, engineAssignments, carById)}
                engine={engine}
                key={engine.id}
                maintenanceEntries={maintenanceByEngineId.get(engine.id) ?? []}
                stats={engineStatsById.get(engine.id)}
                status={status}
                onAddMaintenance={startMaintenanceAdd}
                onDelete={handleDeleteEngine}
                onDeleteMaintenance={handleDeleteMaintenance}
                onEdit={startEngineEdit}
                onEditMaintenance={startMaintenanceEdit}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">No engines yet.</div>
        )}
      </div>

      <div className="panel track-list-panel">
        <div className="panel-header">
          <div>
            <h2>Cars</h2>
          </div>
          <div className="panel-actions">
            <span className="count-pill">{cars.length}</span>
            <button
              aria-label="Add car"
              className="icon-button"
              disabled={status === "saving"}
              type="button"
              onClick={startCarAdd}
            >
              <Plus size={18} />
            </button>
          </div>
        </div>

        {status === "loading" ? (
          <div className="empty-state">Loading cars...</div>
        ) : cars.length ? (
          <div className="garage-card-list">
            {cars.map((car) => (
              <CarCard
                car={car}
                engineName={engineNameForCar(car.id, engineAssignments, engines)}
                key={car.id}
                sessionCount={
                  sessions.filter((session) => session.car_id === car.id).length
                }
                status={status}
                onDelete={handleDeleteCar}
                onEdit={startCarEdit}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">No cars yet.</div>
        )}
      </div>

      {message ? <div className="inline-message garage-message">{message}</div> : null}

      {activeModal === "car" ? (
        <Modal
          eyebrow={editingCarId ? "Edit Car" : "Add Car"}
          icon={<Car size={20} />}
          title={editingCarId ? carForm.name || "Car" : "Car Details"}
          onClose={resetCarForm}
        >
          <form onSubmit={handleSaveCar}>
            <div className="form-grid">
              <label>
                Name
                <input
                  required
                  value={carForm.name}
                  onChange={(event) =>
                    setCarForm({ ...carForm, name: event.target.value })
                  }
                  placeholder="Blue car"
                />
              </label>
              <label>
                Model
                <input
                  value={carForm.model}
                  onChange={(event) =>
                    setCarForm({ ...carForm, model: event.target.value })
                  }
                  placeholder="Nervo Coggin"
                />
              </label>
              <label>
                Year
                <input
                  max="2100"
                  min="1900"
                  step="1"
                  type="number"
                  value={carForm.year}
                  onChange={(event) =>
                    setCarForm({ ...carForm, year: event.target.value })
                  }
                  placeholder="2024"
                />
              </label>
            </div>
            <div className="form-grid notes-grid single">
              <label>
                Notes
                <textarea
                  value={carForm.notes}
                  onChange={(event) =>
                    setCarForm({ ...carForm, notes: event.target.value })
                  }
                  placeholder="Chassis notes, owner, serial number, baseline reminders"
                />
              </label>
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={resetCarForm}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={status === "saving"}
                type="submit"
              >
                {editingCarId ? <Save size={18} /> : <Plus size={18} />}
                {editingCarId ? "Save Car" : "Add Car"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === "engine" ? (
        <Modal
          eyebrow={editingEngineId ? "Edit Engine" : "Add Engine"}
          icon={<Wrench size={20} />}
          title={editingEngineId ? engineForm.name || "Engine" : "Engine Details"}
          onClose={resetEngineForm}
        >
          <form onSubmit={handleSaveEngine}>
            <div className="form-grid">
              <label>
                Name
                <input
                  required
                  value={engineForm.name}
                  onChange={(event) =>
                    setEngineForm({ ...engineForm, name: event.target.value })
                  }
                  placeholder="Honda A"
                />
              </label>
              <label>
                Type
                <select
                  required
                  value={engineForm.engine_type_id}
                  onChange={(event) =>
                    setEngineForm({
                      ...engineForm,
                      engine_type_id: event.target.value,
                    })
                  }
                >
                  <option value="">Choose type</option>
                  {engineTypes.map((engineType) => (
                    <option key={engineType.id} value={engineType.id}>
                      {engineType.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Serial / ID
                <input
                  value={engineForm.serial}
                  onChange={(event) =>
                    setEngineForm({ ...engineForm, serial: event.target.value })
                  }
                  placeholder="HX-120-A"
                />
              </label>
            </div>
            <div className="form-grid notes-grid single">
              <label>
                Notes
                <textarea
                  value={engineForm.notes}
                  onChange={(event) =>
                    setEngineForm({ ...engineForm, notes: event.target.value })
                  }
                  placeholder="Refresh history, builder notes, backup engine status"
                />
              </label>
            </div>
            <div className="button-row">
              <button className="secondary-button" type="button" onClick={resetEngineForm}>
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={status === "saving"}
                type="submit"
              >
                {editingEngineId ? <Save size={18} /> : <Plus size={18} />}
                {editingEngineId ? "Save Engine" : "Add Engine"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {activeModal === "maintenance" ? (
        <Modal
          eyebrow={editingMaintenanceId ? "Edit Maintenance" : "Engine Maintenance"}
          icon={<Wrench size={20} />}
          title={
            editingMaintenanceId
              ? "Update Log Entry"
              : `Log Maintenance${
                  engineById.get(maintenanceEngineId)
                    ? `: ${engineById.get(maintenanceEngineId)?.name}`
                    : ""
                }`
          }
          onClose={resetMaintenanceForm}
        >
          <form onSubmit={handleSaveMaintenance}>
            <div className="form-grid">
              <label>
                Type
                <select
                  required
                  value={maintenanceForm.maintenance_type_id}
                  onChange={(event) =>
                    setMaintenanceForm({
                      ...maintenanceForm,
                      maintenance_type_id: event.target.value,
                    })
                  }
                >
                  <option value="">Choose type</option>
                  {maintenanceTypes.map((maintenanceType) => (
                    <option key={maintenanceType.id} value={maintenanceType.id}>
                      {maintenanceType.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input
                  required
                  type="date"
                  value={maintenanceForm.maintenance_date}
                  onChange={(event) =>
                    setMaintenanceForm({
                      ...maintenanceForm,
                      maintenance_date: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                Performed By
                <input
                  value={maintenanceForm.performed_by}
                  onChange={(event) =>
                    setMaintenanceForm({
                      ...maintenanceForm,
                      performed_by: event.target.value,
                    })
                  }
                  placeholder="Builder, shop, or person"
                />
              </label>
              <label>
                Cost
                <input
                  min="0"
                  step="0.01"
                  type="number"
                  value={maintenanceForm.cost}
                  onChange={(event) =>
                    setMaintenanceForm({
                      ...maintenanceForm,
                      cost: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </label>
            </div>
            <div className="form-grid notes-grid single">
              <label>
                Notes
                <textarea
                  value={maintenanceForm.notes}
                  onChange={(event) =>
                    setMaintenanceForm({
                      ...maintenanceForm,
                      notes: event.target.value,
                    })
                  }
                  placeholder="Oil type, parts changed, builder notes, repair details"
                />
              </label>
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={resetMaintenanceForm}
              >
                Cancel
              </button>
              <button
                className="primary-button"
                disabled={status === "saving"}
                type="submit"
              >
                {editingMaintenanceId ? <Save size={18} /> : <Plus size={18} />}
                {editingMaintenanceId ? "Save Entry" : "Log Maintenance"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}

function CarCard({
  car,
  engineName,
  onDelete,
  onEdit,
  sessionCount,
  status,
}: {
  car: RaceCar;
  engineName: string;
  onDelete: (car: RaceCar) => void;
  onEdit: (car: RaceCar) => void;
  sessionCount: number;
  status: "loading" | "ready" | "saving";
}) {
  return (
    <article className="garage-card">
      <div className="garage-card-heading">
        <div>
          <h3>{car.name}</h3>
          <p>{carSummary(car, engineName, sessionCount)}</p>
          {car.notes ? <p>{car.notes}</p> : null}
        </div>
        <span className="garage-kind">Car</span>
      </div>
      <div className="garage-card-actions">
        <button
          aria-label={`Edit ${car.name}`}
          className="icon-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onEdit(car)}
        >
          <Pencil size={18} />
        </button>
        <button
          aria-label={`Remove ${car.name}`}
          className="danger-icon-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onDelete(car)}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </article>
  );
}

function EngineCard({
  carName,
  engine,
  maintenanceEntries,
  onAddMaintenance,
  onDelete,
  onDeleteMaintenance,
  onEdit,
  onEditMaintenance,
  stats,
  status,
}: {
  carName: string;
  engine: EngineWithType;
  maintenanceEntries: EngineMaintenanceWithType[];
  onAddMaintenance: (engine: EngineWithType) => void;
  onDelete: (engine: EngineWithType) => void;
  onDeleteMaintenance: (entry: EngineMaintenanceWithType) => void;
  onEdit: (engine: EngineWithType) => void;
  onEditMaintenance: (entry: EngineMaintenanceWithType) => void;
  stats: EngineStats | undefined;
  status: "loading" | "ready" | "saving";
}) {
  return (
    <article className="garage-card">
      <div className="garage-card-heading">
        <div>
          <h3>{engine.name}</h3>
          <p>{engineSummary(engine, carName, stats?.totalLaps ?? 0)}</p>
        </div>
        <span className="garage-kind">Engine</span>
      </div>

      <div className="garage-stat-grid">
        <GarageStat label="Total Laps" value={String(stats?.totalLaps ?? 0)} />
        <GarageStat label="Since Refresh" value={String(stats?.sinceRefresh ?? 0)} />
        <GarageStat
          label="Last Service"
          value={stats?.lastService ? formatDate(stats.lastService.maintenance_date) : "--"}
        />
        <GarageStat
          label="Last Refresh"
          value={stats?.lastRefresh ? formatDate(stats.lastRefresh.maintenance_date) : "--"}
        />
      </div>

      {engine.notes ? <p className="garage-notes">{engine.notes}</p> : null}

      <details className="garage-maintenance">
        <summary>
          <span>Maintenance ({maintenanceEntries.length})</span>
          <ChevronDown size={17} />
        </summary>
        {maintenanceEntries.length ? (
          <div className="maintenance-list">
            {maintenanceEntries.map((entry) => (
              <div className="maintenance-row compact" key={entry.id}>
                <div>
                  <strong>{entry.maintenanceType?.name ?? "Maintenance"}</strong>
                  <small>{maintenanceMeta(entry)}</small>
                  {entry.notes ? <p>{entry.notes}</p> : null}
                </div>
                <div className="panel-actions">
                  <button
                    aria-label="Edit maintenance"
                    className="icon-button"
                    disabled={status === "saving"}
                    type="button"
                    onClick={() => onEditMaintenance(entry)}
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    aria-label="Remove maintenance"
                    className="danger-icon-button"
                    disabled={status === "saving"}
                    type="button"
                    onClick={() => onDeleteMaintenance(entry)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">No maintenance logged.</div>
        )}
      </details>

      <div className="garage-card-actions">
        <button
          className="secondary-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onAddMaintenance(engine)}
        >
          Add Maintenance
        </button>
        <button
          aria-label={`Edit ${engine.name}`}
          className="icon-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onEdit(engine)}
        >
          <Pencil size={18} />
        </button>
        <button
          aria-label={`Remove ${engine.name}`}
          className="danger-icon-button"
          disabled={status === "saving"}
          type="button"
          onClick={() => onDelete(engine)}
        >
          <Trash2 size={18} />
        </button>
      </div>
    </article>
  );
}

function GarageStat({ label, value }: { label: string; value: string }) {
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
        className="modal-panel"
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

function engineSummary(engine: EngineWithType, carName: string, totalLaps: number) {
  return [
    engine.serial ? `ID ${engine.serial}` : "",
    engine.engineType?.name,
    carName === "Not installed" ? "" : `Installed in ${carName}`,
    `${totalLaps} laps`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function carSummary(car: RaceCar, engineName: string, sessionCount: number) {
  return [
    car.year,
    car.model,
    engineName === "Not installed" ? "" : engineName,
    `${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`,
  ]
    .filter(Boolean)
    .join(" - ");
}

function engineNameForCar(
  carId: string,
  assignments: EngineAssignment[],
  engines: EngineWithType[],
) {
  const assignment = assignments.find((item) => item.car_id === carId);
  if (!assignment) return "Not installed";
  return engines.find((engine) => engine.id === assignment.engine_id)?.name ?? "Unknown engine";
}

function carNameForEngine(
  engineId: string,
  assignments: EngineAssignment[],
  cars: Map<string, RaceCar>,
) {
  const assignment = assignments.find((item) => item.engine_id === engineId);
  if (!assignment) return "Not installed";
  return cars.get(assignment.car_id)?.name ?? "Unknown car";
}

function sortCars(a: RaceCar, b: RaceCar) {
  return a.name.localeCompare(b.name);
}

function sortEngines(a: EngineWithType, b: EngineWithType) {
  return a.name.localeCompare(b.name);
}

function sortMaintenanceEntries(
  a: EngineMaintenanceWithType,
  b: EngineMaintenanceWithType,
) {
  return b.maintenance_date.localeCompare(a.maintenance_date);
}

function sumLaps(sessions: SetupSession[]) {
  return sessions.reduce((total, session) => total + (session.total_laps ?? 0), 0);
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function maintenanceMeta(entry: EngineMaintenanceWithType) {
  return [
    formatDate(entry.maintenance_date),
    entry.performed_by,
    entry.cost === null ? "" : `$${entry.cost.toFixed(2)}`,
  ]
    .filter(Boolean)
    .join(" - ");
}

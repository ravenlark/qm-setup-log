import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Copy, Pencil, Plus, Save, Search, Star, Trash2, X } from "lucide-react";
import { fetchCars, type RaceCar } from "../data/cars";
import {
  fetchActiveEngineAssignments,
  type EngineAssignment,
} from "../data/engineAssignments";
import { fetchEngines, type EngineWithType } from "../data/engines";
import {
  createSession,
  deleteSession,
  fetchSessions,
  type SetupSession,
  type SetupSessionInput,
  type SetupSessionInputField,
  toggleSessionBaseline,
  updateSession,
} from "../data/sessions";
import { fetchTracks, type TrackWithNotes } from "../data/tracks";

const sessionTypes = ["Practice", "Qualifying", "Heat", "Main"];
const lrHubOptions = ["Locked", "Unlocked", "Ratchet"];
const corners = ["lf", "rf", "lr", "rr"] as const;

const emptySessionForm: SetupSessionInput = {
  car_id: "",
  engine_id: "",
  track_id: "",
  session_date: localDateValue(),
  session_time: "",
  session_type: "Practice",
  driver: "",
  air_temp: "",
  humidity: "",
  track_temp: "",
  track_condition: "",
  lr_hub: "Locked",
  lf_tire_compound: "",
  rf_tire_compound: "",
  lr_tire_compound: "",
  rr_tire_compound: "",
  lf_psi: "",
  rf_psi: "",
  lr_psi: "",
  rr_psi: "",
  lf_offset: "",
  rf_offset: "",
  lr_offset: "",
  rr_offset: "",
  lf_spring_rate: "",
  rf_spring_rate: "",
  lr_spring_rate: "",
  rr_spring_rate: "",
  lf_shock_valving: "",
  rf_shock_valving: "",
  lr_shock_valving: "",
  rr_shock_valving: "",
  stagger: "",
  tire_notes: "",
  lf_weight: "",
  rf_weight: "",
  lr_weight: "",
  rr_weight: "",
  lf_ride_height: "",
  rf_ride_height: "",
  lr_ride_height: "",
  rr_ride_height: "",
  lf_camber: "",
  rf_camber: "",
  lf_caster: "",
  rf_caster: "",
  lf_panhard_holes: "",
  rf_panhard_holes: "",
  lr_panhard_holes: "",
  rr_panhard_holes: "",
  left_wheelbase: "",
  right_wheelbase: "",
  engine_gear: "",
  axle_gear: "",
  lap_time: "",
  total_laps: "",
  average_rpm: "",
  average_drops: "",
  start_position: "",
  end_position: "",
  lf_tire_temp: "",
  rf_tire_temp: "",
  lr_tire_temp: "",
  rr_tire_temp: "",
  handling: "",
  changes: "",
  next_time: "",
};

type SessionsViewProps = {
  supabase: SupabaseClient;
  userId: string;
};

export function SessionsView({ supabase, userId }: SessionsViewProps) {
  const [cars, setCars] = useState<RaceCar[]>([]);
  const [engines, setEngines] = useState<EngineWithType[]>([]);
  const [tracks, setTracks] = useState<TrackWithNotes[]>([]);
  const [assignments, setAssignments] = useState<EngineAssignment[]>([]);
  const [sessions, setSessions] = useState<SetupSession[]>([]);
  const [sessionForm, setSessionForm] = useState(emptySessionForm);
  const [editingSessionId, setEditingSessionId] = useState("");
  const [expandedSessionId, setExpandedSessionId] = useState("");
  const [sessionFormNotice, setSessionFormNotice] = useState("");
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [sessionSearch, setSessionSearch] = useState("");
  const [sessionCarFilter, setSessionCarFilter] = useState("all");
  const [sessionTypeFilter, setSessionTypeFilter] = useState("all");
  const [status, setStatus] = useState<"loading" | "ready" | "saving">(
    "loading",
  );
  const [message, setMessage] = useState("");

  const carById = useMemo(
    () => new Map(cars.map((car) => [car.id, car])),
    [cars],
  );
  const engineById = useMemo(
    () => new Map(engines.map((engine) => [engine.id, engine])),
    [engines],
  );
  const trackById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const trackOptions = useMemo(() => selectableTracks(tracks), [tracks]);

  const weightStats = useMemo(() => calculateWeightStats(sessionForm), [
    sessionForm,
  ]);
  const gearRatio = useMemo(() => {
    const engine = engineById.get(sessionForm.engine_id);
    const engineGear = Number(sessionForm.engine_gear);
    const axleGear = Number(sessionForm.axle_gear);
    const gearboxRatio = engine?.engineType?.gearbox_ratio;

    if (!gearboxRatio || !engineGear || !axleGear) return "--";
    return ((axleGear / engineGear) * gearboxRatio).toFixed(2);
  }, [engineById, sessionForm.axle_gear, sessionForm.engine_gear, sessionForm.engine_id]);
  const showsPositionFields = hasRacePositions(sessionForm.session_type);
  const visibleSessions = useMemo(() => {
    const search = sessionSearch.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesCar =
        sessionCarFilter === "all" || session.car_id === sessionCarFilter;
      const matchesType =
        sessionTypeFilter === "all" || session.session_type === sessionTypeFilter;
      const matchesSearch =
        !search ||
        searchableSessionText(
          session,
          carById.get(session.car_id)?.name ?? "",
          engineById.get(session.engine_id ?? "")?.name ?? "",
          trackById.get(session.track_id)?.name ?? "",
        )
          .toLowerCase()
          .includes(search);
      return matchesCar && matchesType && matchesSearch;
    });
  }, [
    carById,
    engineById,
    sessionCarFilter,
    sessionSearch,
    sessions,
    sessionTypeFilter,
    trackById,
  ]);

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    setMessage("");

    Promise.all([
      fetchCars(supabase),
      fetchEngines(supabase),
      fetchTracks(supabase, userId, { includeArchived: true }),
      fetchActiveEngineAssignments(supabase),
      fetchSessions(supabase),
    ])
      .then(([nextCars, nextEngines, nextTracks, nextAssignments, nextSessions]) => {
        if (!isCurrent) return;
        setCars(nextCars);
        setEngines(nextEngines);
        setTracks(nextTracks);
        setAssignments(nextAssignments);
        setSessions(nextSessions);
        setSessionForm((current) => {
          const carId = current.car_id || nextCars[0]?.id || "";
          const engineId =
            current.engine_id ||
            nextAssignments.find((assignment) => assignment.car_id === carId)
              ?.engine_id ||
            "";
          return {
            ...current,
            car_id: carId,
            engine_id: engineId,
            track_id: current.track_id || defaultTrackId(nextTracks),
          };
        });
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
  }, [supabase, userId]);

  function updateField(field: SetupSessionInputField, value: string) {
    setSessionForm((current) => ({ ...current, [field]: value }));
  }

  function updateSessionType(sessionType: string) {
    setSessionForm((current) => ({
      ...current,
      session_type: sessionType,
      start_position: hasRacePositions(sessionType) ? current.start_position : "",
      end_position: hasRacePositions(sessionType) ? current.end_position : "",
    }));
  }

  function updateCar(carId: string) {
    const installedEngineId =
      assignments.find((assignment) => assignment.car_id === carId)?.engine_id ||
      "";
    setSessionForm((current) => ({
      ...current,
      car_id: carId,
      engine_id: installedEngineId,
    }));
  }

  async function handleSaveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sessionForm.car_id) {
      setMessage("Choose a car.");
      return;
    }
    if (!sessionForm.track_id) {
      setMessage("Choose a track.");
      return;
    }

    setStatus("saving");
    setMessage("");
    try {
      const saved = editingSessionId
        ? await updateSession(supabase, userId, editingSessionId, sessionForm)
        : await createSession(supabase, userId, sessionForm);
      setSessions((current) =>
        [saved, ...current.filter((session) => session.id !== saved.id)].sort(
          sortSessions,
        ),
      );
      setEditingSessionId("");
      setSessionFormNotice("");
      setIsSessionModalOpen(false);
      setSessionForm({
        ...emptySessionForm,
        car_id: sessionForm.car_id,
        engine_id: sessionForm.engine_id,
        track_id: sessionForm.track_id,
        driver: sessionForm.driver,
      });
      setMessage(editingSessionId ? "Session updated." : "Session saved.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Session could not be saved.",
      );
    } finally {
      setStatus("ready");
    }
  }

  function handleEditSession(session: SetupSession) {
    setEditingSessionId(session.id);
    setSessionForm(sessionToInput(session));
    setSessionFormNotice("Session loaded for editing.");
    setIsSessionModalOpen(true);
    setMessage("Editing session.");
  }

  function handleCopySession(session: SetupSession) {
    setEditingSessionId("");
    setSessionForm(sessionToInput(session));
    setSessionFormNotice("Session copied into a new entry.");
    setIsSessionModalOpen(true);
    setMessage("Session copied into a new entry.");
  }

  async function refreshTracksForSelection(preferredTrackId: string) {
    const nextTracks = await fetchTracks(supabase, userId, { includeArchived: true });
    setTracks(nextTracks);

    const nextTrackOptions = selectableTracks(nextTracks);
    return nextTrackOptions.some((track) => track.id === preferredTrackId)
      ? preferredTrackId
      : nextTrackOptions[0]?.id ?? "";
  }

  async function startNewSession() {
    setEditingSessionId("");
    setSessionFormNotice("");
    setMessage("");

    try {
      const trackId = await refreshTracksForSelection(sessionForm.track_id);
      setSessionForm({
        ...emptySessionForm,
        car_id: sessionForm.car_id,
        engine_id: sessionForm.engine_id,
        track_id: trackId,
        driver: sessionForm.driver,
      });
      setIsSessionModalOpen(true);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Tracks could not be refreshed.",
      );
    }
  }

  function closeSessionModal() {
    setEditingSessionId("");
    setSessionFormNotice("");
    setSessionForm({
      ...emptySessionForm,
      car_id: sessionForm.car_id,
      engine_id: sessionForm.engine_id,
      track_id: sessionForm.track_id,
      driver: sessionForm.driver,
    });
    setMessage("");
    setIsSessionModalOpen(false);
  }

  async function handleToggleBaseline(session: SetupSession) {
    setStatus("saving");
    setMessage("");
    try {
      const baseline = await toggleSessionBaseline(supabase, session);
      setSessions((current) =>
        current
          .map((item) => {
            if (item.id === baseline.id) return baseline;
            if (
              baseline.is_baseline &&
              item.car_id === baseline.car_id &&
              item.track_id === baseline.track_id
            ) {
              return { ...item, is_baseline: false };
            }
            return item;
          })
          .sort(sortSessions),
      );
      setMessage(baseline.is_baseline ? "Baseline set." : "Baseline cleared.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Baseline could not be updated.",
      );
    } finally {
      setStatus("ready");
    }
  }

  async function handleDeleteSession(session: SetupSession) {
    const confirmed = window.confirm(
      `Remove ${session.session_type} at ${
        trackById.get(session.track_id)?.name ?? "this track"
      } on ${formatDate(session.session_date)}?`,
    );
    if (!confirmed) return;

    setStatus("saving");
    setMessage("");
    try {
      await deleteSession(supabase, session.id);
      setSessions((current) => current.filter((item) => item.id !== session.id));
      if (editingSessionId === session.id) closeSessionModal();
      if (expandedSessionId === session.id) setExpandedSessionId("");
      setMessage("Session removed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Session could not be removed.",
      );
    } finally {
      setStatus("ready");
    }
  }

  return (
    <section className="sessions-layout">
      <div className="panel track-list-panel session-history-panel">
        <div className="panel-header">
          <div>
            <span className="eyebrow">Sessions</span>
            <h2>Session History</h2>
          </div>
          <div className="panel-actions">
            <span className="count-pill">{visibleSessions.length}</span>
            <button
              className="primary-button"
              disabled={status === "saving"}
              type="button"
              onClick={startNewSession}
            >
              <Plus size={18} />
              New Session
            </button>
          </div>
        </div>

        <div className="session-history-filters">
          <label className="session-search-field">
            <Search size={18} />
            <input
              aria-label="Search session history"
              placeholder="Search track, engine, driver, notes"
              type="search"
              value={sessionSearch}
              onChange={(event) => setSessionSearch(event.target.value)}
            />
          </label>
          <label>
            Car
            <select
              value={sessionCarFilter}
              onChange={(event) => setSessionCarFilter(event.target.value)}
            >
              <option value="all">All Cars</option>
              {cars.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Type
            <select
              value={sessionTypeFilter}
              onChange={(event) => setSessionTypeFilter(event.target.value)}
            >
              <option value="all">All Types</option>
              {sessionTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
        </div>

        {status === "loading" ? (
          <div className="empty-state">Loading sessions...</div>
        ) : visibleSessions.length ? (
          <div className="session-history-list">
            {visibleSessions.map((session) => (
              <SessionHistoryCard
                carName={carById.get(session.car_id)?.name ?? "Unknown car"}
                engine={engineById.get(session.engine_id ?? "")}
                expanded={expandedSessionId === session.id}
                key={session.id}
                session={session}
                status={status}
                trackName={trackById.get(session.track_id)?.name ?? "Unknown track"}
                onCopy={handleCopySession}
                onDelete={handleDeleteSession}
                onEdit={handleEditSession}
                onToggleBaseline={handleToggleBaseline}
                onToggle={() =>
                  setExpandedSessionId((current) =>
                    current === session.id ? "" : session.id,
                  )
                }
              />
            ))}
          </div>
        ) : sessions.length ? (
          <div className="empty-state">No sessions match your filters.</div>
        ) : (
          <div className="empty-state">No sessions yet.</div>
        )}
      </div>

      {isSessionModalOpen ? (
        <Modal
          eyebrow={editingSessionId ? "Edit Session" : "New Session"}
          icon={editingSessionId ? <Save size={20} /> : <Plus size={20} />}
          title={editingSessionId ? "Update Entry" : "Setup Entry"}
          onClose={closeSessionModal}
        >
          <form className="session-form session-modal-form" onSubmit={handleSaveSession}>
        <div className="form-panel">
          {sessionFormNotice ? (
            <div className="form-populated-banner">{sessionFormNotice}</div>
          ) : null}

          <fieldset className="session-card">
            <legend>Session Setup</legend>
            <div className="form-grid single">
              <label>
                Track
                <select
                  required
                  value={sessionForm.track_id}
                  onChange={(event) => updateField("track_id", event.target.value)}
                >
                  <option value="">Choose track</option>
                  {trackOptions.map((track) => (
                    <option key={track.id} value={track.id}>
                      {trackOptionLabel(track)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid result-pair-grid">
              <label>
                Car
                <select
                  required
                  value={sessionForm.car_id}
                  onChange={(event) => updateCar(event.target.value)}
                >
                  <option value="">Choose car</option>
                  {cars.map((car) => (
                    <option key={car.id} value={car.id}>
                      {car.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Installed Engine
                <select
                  value={sessionForm.engine_id}
                  onChange={(event) =>
                    updateField("engine_id", event.target.value)
                  }
                >
                  <option value="">No engine selected</option>
                  {engines.map((engine) => (
                    <option key={engine.id} value={engine.id}>
                      {engine.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-grid result-pair-grid">
              <label>
                Driver
                <input
                  value={sessionForm.driver}
                  onChange={(event) => updateField("driver", event.target.value)}
                  placeholder="Driver name"
                />
              </label>
              <label>
                Session Type
                <select
                  value={sessionForm.session_type}
                  onChange={(event) => updateSessionType(event.target.value)}
                >
                  {sessionTypes.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
            </div>
          </fieldset>

          <fieldset className="session-card">
            <legend>Conditions</legend>
            <div className="form-grid result-pair-grid">
              <NumberField
                label="Date"
                type="date"
                value={sessionForm.session_date}
                onChange={(value) => updateField("session_date", value)}
                required
              />
              <NumberField
                label="Time"
                type="time"
                value={sessionForm.session_time}
                onChange={(value) => updateField("session_time", value)}
              />
            </div>
            <div className="form-grid result-pair-grid">
              <NumberField
                label="Air Temp (F)"
                value={sessionForm.air_temp}
                onChange={(value) => updateField("air_temp", value)}
                step="0.1"
                placeholder="72"
              />
              <NumberField
                label="Humidity (%)"
                value={sessionForm.humidity}
                onChange={(value) => updateField("humidity", value)}
                min="0"
                max="100"
                step="0.1"
                placeholder="45"
              />
            </div>
            <div className="form-grid result-pair-grid">
              <NumberField
                label="Track Temp (F)"
                value={sessionForm.track_temp}
                onChange={(value) => updateField("track_temp", value)}
                step="0.1"
                placeholder="93"
              />
              <label>
                Track Condition
                <input
                  value={sessionForm.track_condition}
                  onChange={(event) =>
                    updateField("track_condition", event.target.value)
                  }
                  placeholder="Green, rubbered, dusty"
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="session-card">
            <legend>Tires & Suspension</legend>
            <div className="radio-field">
              <span>LR Hub</span>
              <div className="segmented-radio" role="radiogroup" aria-label="LR Hub">
                {lrHubOptions.map((option) => (
                  <label key={option}>
                    <input
                      checked={sessionForm.lr_hub === option}
                      name="lr_hub"
                      type="radio"
                      value={option}
                      onChange={(event) =>
                        updateField("lr_hub", event.target.value)
                      }
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="corner-grid tire-corner-grid">
              {corners.map((corner) => (
                <div className="corner-box" key={corner}>
                  <h3>{corner.toUpperCase()}</h3>
                  <NumberField
                    label="PSI"
                    value={sessionForm[`${corner}_psi`]}
                    onChange={(value) => updateField(`${corner}_psi`, value)}
                    min="0"
                    step="0.1"
                  />
                  <TextField
                    label="Tire Compound"
                    value={sessionForm[`${corner}_tire_compound`]}
                    onChange={(value) =>
                      updateField(`${corner}_tire_compound`, value)
                    }
                  />
                  <NumberField
                    label="Offset (in)"
                    value={sessionForm[`${corner}_offset`]}
                    onChange={(value) => updateField(`${corner}_offset`, value)}
                    min="0"
                    step="0.01"
                  />
                  <NumberField
                    label="Spring Rate"
                    value={sessionForm[`${corner}_spring_rate`]}
                    onChange={(value) =>
                      updateField(`${corner}_spring_rate`, value)
                    }
                    min="0"
                    step="1"
                  />
                  <TextField
                    label="Shock Valving"
                    value={sessionForm[`${corner}_shock_valving`]}
                    onChange={(value) =>
                      updateField(`${corner}_shock_valving`, value)
                    }
                    placeholder="3 / 5"
                  />
                </div>
              ))}
            </div>
            <div className="form-grid result-pair-grid">
              <NumberField
                label="Stagger (in)"
                value={sessionForm.stagger}
                onChange={(value) => updateField("stagger", value)}
                min="0"
                step="0.001"
                placeholder="1.750"
              />
              <TextField
                label="Tire Notes"
                value={sessionForm.tire_notes}
                onChange={(value) => updateField("tire_notes", value)}
                placeholder="Prep, age, wear, pressure timing"
              />
            </div>
          </fieldset>

          <fieldset className="session-card">
            <legend>Chassis</legend>
            <div className="corner-grid weight-corner-grid">
              {corners.map((corner) => (
                <NumberField
                  key={`${corner}_weight`}
                  label={`${corner.toUpperCase()} Weight (lb)`}
                  value={sessionForm[`${corner}_weight`]}
                  onChange={(value) => updateField(`${corner}_weight`, value)}
                  min="0"
                  step="0.1"
                />
              ))}
            </div>
            <div className="calculated-grid weight-percent-grid">
              <CalcStat label="Front" value={weightStats.front} />
              <CalcStat label="Left" value={weightStats.left} />
              <CalcStat label="Right" value={weightStats.right} />
              <CalcStat label="Rear" value={weightStats.rear} />
              <CalcStat label="Cross" value={weightStats.cross} />
            </div>
            <hr className="section-rule" />
            <div className="corner-grid setup-corner-grid">
              {corners.map((corner) => (
                <NumberField
                  key={`${corner}_ride_height`}
                  label={`${corner.toUpperCase()} Ride Height (in)`}
                  value={sessionForm[`${corner}_ride_height`]}
                  onChange={(value) =>
                    updateField(`${corner}_ride_height`, value)
                  }
                  min="0"
                  step="0.01"
                />
              ))}
            </div>
            <hr className="section-rule" />
            <div className="corner-grid setup-corner-grid">
              <NumberField
                label="LF Camber (deg)"
                value={sessionForm.lf_camber}
                onChange={(value) => updateField("lf_camber", value)}
                step="0.1"
              />
              <NumberField
                label="RF Camber (deg)"
                value={sessionForm.rf_camber}
                onChange={(value) => updateField("rf_camber", value)}
                step="0.1"
              />
              <NumberField
                label="LF Caster (deg)"
                value={sessionForm.lf_caster}
                onChange={(value) => updateField("lf_caster", value)}
                step="0.1"
              />
              <NumberField
                label="RF Caster (deg)"
                value={sessionForm.rf_caster}
                onChange={(value) => updateField("rf_caster", value)}
                step="0.1"
              />
            </div>
            <hr className="section-rule" />
            <div className="corner-grid setup-corner-grid">
              {corners.map((corner) => (
                <NumberField
                  key={`${corner}_panhard_holes`}
                  label={`${corner.toUpperCase()} Panhard (holes down)`}
                  value={sessionForm[`${corner}_panhard_holes`]}
                  onChange={(value) =>
                    updateField(`${corner}_panhard_holes`, value)
                  }
                  min="0"
                  step="1"
                />
              ))}
            </div>
            <hr className="section-rule" />
            <div className="form-grid result-pair-grid">
              <NumberField
                label="Left Wheelbase (in)"
                value={sessionForm.left_wheelbase}
                onChange={(value) => updateField("left_wheelbase", value)}
                min="0"
                step="0.001"
              />
              <NumberField
                label="Right Wheelbase (in)"
                value={sessionForm.right_wheelbase}
                onChange={(value) => updateField("right_wheelbase", value)}
                min="0"
                step="0.001"
              />
            </div>
          </fieldset>

          <fieldset className="session-card">
            <legend>Drivetrain</legend>
            <div className="form-grid gear-grid">
              <NumberField
                label="Engine Gear (teeth)"
                value={sessionForm.engine_gear}
                onChange={(value) => updateField("engine_gear", value)}
                min="1"
                step="1"
              />
              <NumberField
                label="Axle Gear (teeth)"
                value={sessionForm.axle_gear}
                onChange={(value) => updateField("axle_gear", value)}
                min="1"
                step="1"
              />
            </div>
            <div className="calculated-grid centered">
              <CalcStat label="Calculated Gear Ratio" value={gearRatio} />
            </div>
          </fieldset>

          <fieldset className="session-card">
            <legend>Result</legend>
            <div className="form-grid result-pair-grid">
              <NumberField
                label="Best Lap (sec)"
                value={sessionForm.lap_time}
                onChange={(value) => updateField("lap_time", value)}
                min="0"
                step="0.001"
                placeholder="8.742"
              />
              <NumberField
                label="Total Laps"
                value={sessionForm.total_laps}
                onChange={(value) => updateField("total_laps", value)}
                min="0"
                step="1"
              />
            </div>
            <div className="form-grid result-pair-grid">
              <NumberField
                label="Average RPM"
                value={sessionForm.average_rpm}
                onChange={(value) => updateField("average_rpm", value)}
                min="0"
                step="1"
              />
              <NumberField
                label="Average Drops (RPM)"
                value={sessionForm.average_drops}
                onChange={(value) => updateField("average_drops", value)}
                min="0"
                step="1"
              />
            </div>
            {showsPositionFields ? (
              <div className="form-grid result-pair-grid">
                <NumberField
                  label="Start Position"
                  value={sessionForm.start_position}
                  onChange={(value) => updateField("start_position", value)}
                  min="1"
                  step="1"
                />
                <NumberField
                  label="End Position"
                  value={sessionForm.end_position}
                  onChange={(value) => updateField("end_position", value)}
                  min="1"
                  step="1"
                />
              </div>
            ) : null}
            <div className="corner-grid setup-corner-grid">
              {corners.map((corner) => (
                <NumberField
                  key={`${corner}_tire_temp`}
                  label={`${corner.toUpperCase()} Tire Temp (F)`}
                  value={sessionForm[`${corner}_tire_temp`]}
                  onChange={(value) => updateField(`${corner}_tire_temp`, value)}
                  min="0"
                  step="1"
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="session-card">
            <legend>Notes</legend>
            <div className="form-grid single">
              <label>
                Handling
                <textarea
                  value={sessionForm.handling}
                  onChange={(event) => updateField("handling", event.target.value)}
                  placeholder="Tight center, free off, snaps loose on entry"
                />
              </label>
              <label>
                Changes Made
                <textarea
                  value={sessionForm.changes}
                  onChange={(event) => updateField("changes", event.target.value)}
                  placeholder="Dropped RF .5 psi, adjusted corner weight"
                />
              </label>
              <label>
                Next Time
                <textarea
                  value={sessionForm.next_time}
                  onChange={(event) => updateField("next_time", event.target.value)}
                  placeholder="Try earlier throttle pickup"
                />
              </label>
            </div>
          </fieldset>

          <div className="button-row">
            <button
              className="secondary-button"
              disabled={status === "saving"}
              type="button"
              onClick={closeSessionModal}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              disabled={status === "saving"}
              type="submit"
            >
              {editingSessionId ? <Save size={18} /> : <Plus size={18} />}
              {editingSessionId ? "Save Changes" : "Save Session"}
            </button>
          </div>

          {message ? <div className="inline-message">{message}</div> : null}
        </div>
      </form>
        </Modal>
      ) : null}
    </section>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

function TextField({ label, value, onChange, placeholder }: TextFieldProps) {
  return (
    <label>
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

type NumberFieldProps = TextFieldProps & {
  max?: string;
  min?: string;
  required?: boolean;
  step?: string;
  type?: "date" | "number" | "time";
};

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
}: NumberFieldProps) {
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

function SessionHistoryCard({
  carName,
  engine,
  expanded,
  onCopy,
  onDelete,
  onEdit,
  onToggleBaseline,
  onToggle,
  session,
  status,
  trackName,
}: {
  carName: string;
  engine: EngineWithType | undefined;
  expanded: boolean;
  onCopy: (session: SetupSession) => void;
  onDelete: (session: SetupSession) => void;
  onEdit: (session: SetupSession) => void;
  onToggleBaseline: (session: SetupSession) => void;
  onToggle: () => void;
  session: SetupSession;
  status: "loading" | "ready" | "saving";
  trackName: string;
}) {
  const stats = calculateWeightStats(sessionToInput(session));
  const gearPill = formatSessionGear(session, engine?.engineType?.gearbox_ratio);
  const sessionNotes = [
    { label: "Handling", value: session.handling },
    { label: "Changes", value: session.changes },
    { label: "Next Time", value: session.next_time },
  ].filter((note) => Boolean(note.value?.trim()));

  return (
    <article
      className={[
        "session-history-card",
        `session-type-${session.session_type.toLowerCase()}`,
        session.is_baseline ? "session-history-card-baseline" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        aria-expanded={expanded}
        className="session-history-summary"
        type="button"
        onClick={onToggle}
      >
        <div className="session-history-main">
          <div className="session-history-title">
            <strong>
              {[formatShortDateTime(session), session.session_type, carName]
                .filter(Boolean)
                .join(" - ")}
            </strong>
            <span>{trackName}</span>
          </div>
          <div className="session-history-pills">
            {session.lap_time !== null ? (
              <span className="session-pill">Lap {session.lap_time.toFixed(3)}</span>
            ) : null}
            {session.total_laps !== null ? (
              <span className="session-pill">{session.total_laps} laps</span>
            ) : null}
            {gearPill ? <span className="session-pill">{gearPill}</span> : null}
          </div>
        </div>
      </button>

      {expanded ? (
        <div className="session-history-detail">
          <div className="session-history-stats">
            <SessionMiniStat label="Cross" value={stats.cross} />
            <SessionMiniStat
              label="Stagger"
              value={formatOptionalNumber(session.stagger, 2)}
            />
            <SessionMiniStat
              label="RPM"
              value={formatOptionalNumber(session.average_rpm, 0)}
            />
            <SessionMiniStat
              label="Drops"
              value={formatOptionalNumber(session.average_drops, 0)}
            />
          </div>

          {sessionNotes.length ? (
            <div className="session-history-notes">
              {sessionNotes.map((note) => (
                <p key={note.label}>
                  <strong>{note.label}:</strong> {note.value}
                </p>
              ))}
            </div>
          ) : null}

          <div className="session-history-actions">
            <button
              aria-label="Edit session"
              className="icon-button"
              disabled={status === "saving"}
              type="button"
              onClick={() => onEdit(session)}
            >
              <Pencil size={18} />
            </button>
            <button
              aria-label="Copy session to new entry"
              className="icon-button"
              disabled={status === "saving"}
              type="button"
              onClick={() => onCopy(session)}
            >
              <Copy size={18} />
            </button>
            <button
              aria-label={
                session.is_baseline
                  ? "Clear session baseline"
                  : "Mark session as baseline"
              }
              className="icon-button"
              disabled={status === "saving"}
              type="button"
              onClick={() => onToggleBaseline(session)}
            >
              <Star size={18} />
            </button>
            <button
              aria-label="Remove session"
              className="danger-icon-button"
              disabled={status === "saving"}
              type="button"
              onClick={() => onDelete(session)}
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function SessionMiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="session-mini-stat">
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

function calculateWeightStats(form: SetupSessionInput) {
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

function percent(value: number, total: number) {
  return `${((value / total) * 100).toFixed(1)}%`;
}

function hasRacePositions(sessionType: string) {
  return sessionType === "Heat" || sessionType === "Main";
}

function sortSessions(a: SetupSession, b: SetupSession) {
  return (
    b.session_date.localeCompare(a.session_date) ||
    (b.session_time ?? "").localeCompare(a.session_time ?? "")
  );
}

function sessionToInput(session: SetupSession): SetupSessionInput {
  const input = { ...emptySessionForm };
  for (const field of Object.keys(input) as SetupSessionInputField[]) {
    const value = session[field as keyof SetupSession];
    input[field] = value === null || value === undefined ? "" : String(value);
  }

  if (input.session_time.length > 5) {
    input.session_time = input.session_time.slice(0, 5);
  }

  if (!hasRacePositions(input.session_type)) {
    input.start_position = "";
    input.end_position = "";
  }

  return input;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatShortDateTime(session: SetupSession) {
  const date = new Date(`${session.session_date}T12:00:00`);
  const shortDate = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  return [shortDate, formatShortTime(session.session_time)].filter(Boolean).join(" ");
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortTime(value: string | null) {
  return value ? value.slice(0, 5) : "";
}

function formatOptionalNumber(value: number | null, digits: number) {
  return value === null ? "--" : value.toFixed(digits);
}

function searchableSessionText(
  session: SetupSession,
  carName: string,
  engineName: string,
  trackName: string,
) {
  return [
    carName,
    engineName,
    trackName,
    session.session_type,
    session.driver,
    session.track_condition,
    session.handling,
    session.changes,
    session.next_time,
    session.tire_notes,
    session.lf_tire_compound,
    session.rf_tire_compound,
    session.lr_tire_compound,
    session.rr_tire_compound,
  ]
    .filter(Boolean)
    .join(" ");
}

function selectableTracks(tracks: TrackWithNotes[]) {
  return tracks.filter(isSelectableTrack).sort(sortTracksByName);
}

function isSelectableTrack(track: TrackWithNotes) {
  if (track.archived_at) return false;
  return !track.is_system || track.is_favorite;
}

function defaultTrackId(tracks: TrackWithNotes[]) {
  return selectableTracks(tracks)[0]?.id ?? "";
}

function sortTracksByName(a: TrackWithNotes, b: TrackWithNotes) {
  return a.name.localeCompare(b.name);
}

function trackOptionLabel(track: TrackWithNotes) {
  const location = [track.city, track.state].filter(Boolean).join(", ") || track.location;
  return [track.name, location].filter(Boolean).join(" - ");
}

function formatSessionGear(
  session: SetupSession,
  gearboxRatio: number | null | undefined,
) {
  if (session.engine_gear === null || session.axle_gear === null) return "";

  const combo = `${session.engine_gear}/${session.axle_gear}`;
  if (!gearboxRatio || !session.engine_gear) return combo;

  const ratio = ((session.axle_gear / session.engine_gear) * gearboxRatio).toFixed(2);
  return `${combo} (${ratio})`;
}

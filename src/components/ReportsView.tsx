import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCars, type RaceCar } from "../data/cars";
import { fetchEngines, type EngineWithType } from "../data/engines";
import { fetchSessions, type SetupSession } from "../data/sessions";
import { fetchTracks, type TrackWithNotes } from "../data/tracks";

type ReportsViewProps = {
  supabase: SupabaseClient;
  userId: string;
};

type DiffCategory = "Setup" | "Conditions" | "Results";

type DiffField = {
  category: DiffCategory;
  key: keyof SetupSession | "gear_ratio";
  label: string;
  format?: (value: unknown, session: SetupSession) => string;
};

type DiffRow = {
  category: DiffCategory;
  label: string;
  valueA: string;
  valueB: string;
  changed: boolean;
};

const setupFields: DiffField[] = [
  { category: "Setup", key: "lr_hub", label: "LR Hub" },
  { category: "Setup", key: "lf_tire_compound", label: "LF Tire Compound" },
  { category: "Setup", key: "rf_tire_compound", label: "RF Tire Compound" },
  { category: "Setup", key: "lr_tire_compound", label: "LR Tire Compound" },
  { category: "Setup", key: "rr_tire_compound", label: "RR Tire Compound" },
  { category: "Setup", key: "lf_psi", label: "LF PSI" },
  { category: "Setup", key: "rf_psi", label: "RF PSI" },
  { category: "Setup", key: "lr_psi", label: "LR PSI" },
  { category: "Setup", key: "rr_psi", label: "RR PSI" },
  { category: "Setup", key: "lf_offset", label: "LF Offset" },
  { category: "Setup", key: "rf_offset", label: "RF Offset" },
  { category: "Setup", key: "lr_offset", label: "LR Offset" },
  { category: "Setup", key: "rr_offset", label: "RR Offset" },
  { category: "Setup", key: "lf_spring_rate", label: "LF Spring" },
  { category: "Setup", key: "rf_spring_rate", label: "RF Spring" },
  { category: "Setup", key: "lr_spring_rate", label: "LR Spring" },
  { category: "Setup", key: "rr_spring_rate", label: "RR Spring" },
  { category: "Setup", key: "lf_shock_valving", label: "LF Shock" },
  { category: "Setup", key: "rf_shock_valving", label: "RF Shock" },
  { category: "Setup", key: "lr_shock_valving", label: "LR Shock" },
  { category: "Setup", key: "rr_shock_valving", label: "RR Shock" },
  { category: "Setup", key: "stagger", label: "Stagger" },
  { category: "Setup", key: "lf_weight", label: "LF Weight" },
  { category: "Setup", key: "rf_weight", label: "RF Weight" },
  { category: "Setup", key: "lr_weight", label: "LR Weight" },
  { category: "Setup", key: "rr_weight", label: "RR Weight" },
  { category: "Setup", key: "lf_ride_height", label: "LF Ride Height" },
  { category: "Setup", key: "rf_ride_height", label: "RF Ride Height" },
  { category: "Setup", key: "lr_ride_height", label: "LR Ride Height" },
  { category: "Setup", key: "rr_ride_height", label: "RR Ride Height" },
  { category: "Setup", key: "lf_camber", label: "LF Camber" },
  { category: "Setup", key: "rf_camber", label: "RF Camber" },
  { category: "Setup", key: "lf_caster", label: "LF Caster" },
  { category: "Setup", key: "rf_caster", label: "RF Caster" },
  { category: "Setup", key: "lf_panhard_holes", label: "LF Panhard" },
  { category: "Setup", key: "rf_panhard_holes", label: "RF Panhard" },
  { category: "Setup", key: "lr_panhard_holes", label: "LR Panhard" },
  { category: "Setup", key: "rr_panhard_holes", label: "RR Panhard" },
  { category: "Setup", key: "left_wheelbase", label: "Left Wheelbase" },
  { category: "Setup", key: "right_wheelbase", label: "Right Wheelbase" },
  { category: "Setup", key: "engine_gear", label: "Engine Gear" },
  { category: "Setup", key: "axle_gear", label: "Axle Gear" },
  { category: "Setup", key: "gear_ratio", label: "Gear Ratio" },
];

const conditionFields: DiffField[] = [
  { category: "Conditions", key: "track_id", label: "Track" },
  { category: "Conditions", key: "driver", label: "Driver" },
  { category: "Conditions", key: "air_temp", label: "Air Temp" },
  { category: "Conditions", key: "humidity", label: "Humidity" },
  { category: "Conditions", key: "track_temp", label: "Track Temp" },
  { category: "Conditions", key: "track_condition", label: "Track Condition" },
  { category: "Conditions", key: "engine_id", label: "Engine" },
];

const resultFields: DiffField[] = [
  { category: "Results", key: "lap_time", label: "Best Lap" },
  { category: "Results", key: "start_position", label: "Start Position" },
  { category: "Results", key: "end_position", label: "End Position" },
  { category: "Results", key: "average_rpm", label: "Average RPM" },
  { category: "Results", key: "average_drops", label: "Average Drops" },
  { category: "Results", key: "total_laps", label: "Total Laps" },
  { category: "Results", key: "lf_tire_temp", label: "LF Tire Temp" },
  { category: "Results", key: "rf_tire_temp", label: "RF Tire Temp" },
  { category: "Results", key: "lr_tire_temp", label: "LR Tire Temp" },
  { category: "Results", key: "rr_tire_temp", label: "RR Tire Temp" },
];

const allDiffFields = [...resultFields, ...conditionFields, ...setupFields];

export function ReportsView({ supabase, userId }: ReportsViewProps) {
  const [cars, setCars] = useState<RaceCar[]>([]);
  const [engines, setEngines] = useState<EngineWithType[]>([]);
  const [tracks, setTracks] = useState<TrackWithNotes[]>([]);
  const [sessions, setSessions] = useState<SetupSession[]>([]);
  const [selectedCarId, setSelectedCarId] = useState("");
  const [runAId, setRunAId] = useState("");
  const [runBId, setRunBId] = useState("");
  const [status, setStatus] = useState<"loading" | "ready">("loading");
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
  const sessionsForCar = useMemo(
    () => sessions.filter((session) => session.car_id === selectedCarId),
    [selectedCarId, sessions],
  );
  const runA = sessionsForCar.find((session) => session.id === runAId) ?? null;
  const runB = sessionsForCar.find((session) => session.id === runBId) ?? null;
  const selectedCar = carById.get(selectedCarId);

  const setupDiffs = useMemo(
    () =>
      runA && runB
        ? buildDiffRows(setupFields, runA, runB, trackById, engineById).filter(
            (row) => row.changed,
          )
        : [],
    [engineById, runA, runB, trackById],
  );
  const fullRows = useMemo(
    () =>
      runA && runB
        ? buildDiffRows(allDiffFields, runA, runB, trackById, engineById)
        : [],
    [engineById, runA, runB, trackById],
  );

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    setMessage("");

    Promise.all([
      fetchCars(supabase),
      fetchEngines(supabase),
      fetchTracks(supabase, userId),
      fetchSessions(supabase),
    ])
      .then(([nextCars, nextEngines, nextTracks, nextSessions]) => {
        if (!isCurrent) return;
        setCars(nextCars);
        setEngines(nextEngines);
        setTracks(nextTracks);
        setSessions(nextSessions);

        const initialCarId = nextCars[0]?.id ?? "";
        const initialSessions = nextSessions.filter(
          (session) => session.car_id === initialCarId,
        );
        setSelectedCarId(initialCarId);
        setRunAId(initialSessions[0]?.id ?? "");
        setRunBId(initialSessions[1]?.id ?? initialSessions[0]?.id ?? "");
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

  function updateSelectedCar(carId: string) {
    const nextSessions = sessions.filter((session) => session.car_id === carId);
    setSelectedCarId(carId);
    setRunAId(nextSessions[0]?.id ?? "");
    setRunBId(nextSessions[1]?.id ?? nextSessions[0]?.id ?? "");
  }

  return (
    <section className="panel reports-panel">
      <div className="panel-header">
        <div>
          <span className="eyebrow">Reports</span>
          <h2>{selectedCar ? `${selectedCar.name} Comparison` : "Session Comparison"}</h2>
        </div>
      </div>

      {status === "loading" ? (
        <div className="empty-state">Loading report data...</div>
      ) : message ? (
        <div className="auth-error">{message}</div>
      ) : cars.length ? (
        <>
          <div className="report-selectors">
            <label className="report-wide-field">
              Car
              <select
                value={selectedCarId}
                onChange={(event) => updateSelectedCar(event.target.value)}
              >
                {cars.map((car) => (
                  <option key={car.id} value={car.id}>
                    {car.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Run A
              <select
                value={runAId}
                onChange={(event) => setRunAId(event.target.value)}
              >
                {sessionsForCar.map((session) => (
                  <option key={session.id} value={session.id}>
                    {sessionLabel(session, trackById)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Run B
              <select
                value={runBId}
                onChange={(event) => setRunBId(event.target.value)}
              >
                {sessionsForCar.map((session) => (
                  <option key={session.id} value={session.id}>
                    {sessionLabel(session, trackById)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {runA && runB ? (
            <>
              <p className="report-run-meta">
                Run A: {formatDateTime(runA)} - Run B: {formatDateTime(runB)}
              </p>

              <section className="report-summary">
                <h3>Setup Diff Summary</h3>
                <p>
                  {setupDiffs.length} setup{" "}
                  {setupDiffs.length === 1 ? "change" : "changes"} from Run A to Run B.
                </p>
                {setupDiffs.length ? (
                  <div className="report-diff-chips">
                    {setupDiffs.slice(0, 10).map((row) => (
                      <span key={row.label}>
                        {row.label}: {row.valueA} -&gt; {row.valueB}
                      </span>
                    ))}
                    {setupDiffs.length > 10 ? (
                      <span>+{setupDiffs.length - 10} more in the detail rows</span>
                    ) : null}
                  </div>
                ) : (
                  <div className="empty-state">No setup differences found.</div>
                )}
              </section>

              <section className="report-table-section">
                {fullRows.length ? (
                  <table className="report-table">
                    <thead>
                      <tr>
                        <th>Data Point</th>
                        <th>Run A</th>
                        <th>Run B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fullRows.map((row) => (
                        <tr
                          className={row.changed ? "changed" : undefined}
                          key={`${row.category}-${row.label}`}
                        >
                          <th scope="row">
                            {row.label}
                          </th>
                          <td>{row.valueA}</td>
                          <td>{row.valueB}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-state">No differences found.</div>
                )}
              </section>
            </>
          ) : (
            <div className="empty-state">Choose two sessions to compare.</div>
          )}
        </>
      ) : (
        <div className="empty-state">Add cars and sessions before running reports.</div>
      )}
    </section>
  );
}

function buildDiffRows(
  fields: DiffField[],
  runA: SetupSession,
  runB: SetupSession,
  trackById: Map<string, TrackWithNotes>,
  engineById: Map<string, EngineWithType>,
): DiffRow[] {
  return fields
    .map((field) => {
      const valueA = fieldValue(field, runA, trackById, engineById);
      const valueB = fieldValue(field, runB, trackById, engineById);
      return {
        category: field.category,
        label: field.label,
        valueA,
        valueB,
        changed: valueA !== valueB,
      };
    });
}

function fieldValue(
  field: DiffField,
  session: SetupSession,
  trackById: Map<string, TrackWithNotes>,
  engineById: Map<string, EngineWithType>,
) {
  if (field.format) return field.format(undefined, session);
  if (field.key === "gear_ratio") {
    return gearRatioFor(session, engineById);
  }
  if (field.key === "track_id") {
    return trackById.get(session.track_id)?.name ?? "--";
  }
  if (field.key === "engine_id") {
    return session.engine_id
      ? engineById.get(session.engine_id)?.name ?? "Unknown engine"
      : "--";
  }
  return formatValue(session[field.key as keyof SetupSession]);
}

function gearRatioFor(
  session: SetupSession,
  engineById: Map<string, EngineWithType>,
) {
  const gearboxRatio = session.engine_id
    ? engineById.get(session.engine_id)?.engineType?.gearbox_ratio
    : null;
  if (!session.engine_gear || !session.axle_gear || !gearboxRatio) {
    return "--";
  }
  return ((session.axle_gear / session.engine_gear) * gearboxRatio).toFixed(2);
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "--";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function sessionLabel(
  session: SetupSession,
  trackById: Map<string, TrackWithNotes>,
) {
  return [
    formatDateTime(session),
    session.session_type,
    trackById.get(session.track_id)?.name ?? "Unknown track",
  ]
    .filter(Boolean)
    .join(" - ");
}

function formatDateTime(session: SetupSession) {
  return [formatDate(session.session_date), formatTime(session.session_time)]
    .filter(Boolean)
    .join(" ");
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(value: string | null) {
  if (!value) return "";
  const [hours = "0", minutes = "0"] = value.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

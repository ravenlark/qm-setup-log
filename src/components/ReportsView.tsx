import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCars, type RaceCar } from "../data/cars";
import { fetchEngines, type EngineWithType } from "../data/engines";
import {
  fetchSessions,
  SESSIONS_CHANGED_EVENT,
  sessionPayloadValue,
  type SetupSession,
} from "../data/sessions";
import {
  type SetupFieldDefinition,
} from "../data/setupFields/index";
import {
  fetchRuntimeSetupDefinitions,
  setupFieldsForCarTypeWithRuntime,
  type RuntimeSetupDefinitionMap,
} from "../data/setupFields/runtime";
import { fetchTracksByIds, type TrackWithNotes } from "../data/tracks";

type ReportsViewProps = {
  supabase: SupabaseClient;
  userId: string;
};

type DiffCategory = "Setup" | "Conditions" | "Results";

type DiffField = {
  category: DiffCategory;
  key: string;
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

const conditionFields: DiffField[] = [
  { category: "Conditions", key: "track_id", label: "Track" },
  { category: "Conditions", key: "driver", label: "Driver" },
  { category: "Conditions", key: "air_temp", label: "Air Temp" },
  { category: "Conditions", key: "humidity", label: "Humidity" },
  { category: "Conditions", key: "track_temp", label: "Track Temp" },
  { category: "Conditions", key: "track_condition", label: "Track Condition" },
  { category: "Conditions", key: "engine_id", label: "Engine" },
];

export function ReportsView({ supabase, userId }: ReportsViewProps) {
  const [cars, setCars] = useState<RaceCar[]>([]);
  const [engines, setEngines] = useState<EngineWithType[]>([]);
  const [tracks, setTracks] = useState<TrackWithNotes[]>([]);
  const [sessions, setSessions] = useState<SetupSession[]>([]);
  const [setupDefinitions, setSetupDefinitions] =
    useState<RuntimeSetupDefinitionMap>({});
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
  const carTypeFields = useMemo(
    () =>
      setupFieldsForCarTypeWithRuntime(
        selectedCar?.carType?.slug,
        setupDefinitions,
      ),
    [selectedCar?.carType?.slug, setupDefinitions],
  );
  const setupFields = useMemo(() => buildDynamicDiffFields(carTypeFields, "Setup"), [
    carTypeFields,
  ]);
  const resultFields = useMemo(
    () => buildDynamicDiffFields(carTypeFields, "Results"),
    [carTypeFields],
  );
  const allDiffFields = useMemo(
    () => [...resultFields, ...conditionFields, ...setupFields],
    [resultFields, setupFields],
  );

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
      fetchCars(supabase, userId),
      fetchEngines(supabase, userId),
      fetchSessions(supabase, userId),
      fetchRuntimeSetupDefinitions(supabase),
    ])
      .then(async ([
        nextCars,
        nextEngines,
        nextSessions,
        nextSetupDefinitions,
      ]) => {
        const nextTracks = await fetchTracksByIds(
          supabase,
          userId,
          uniqueSessionTrackIds(nextSessions),
          { includeArchived: true },
        );
        return {
          nextCars,
          nextEngines,
          nextSessions,
          nextSetupDefinitions,
          nextTracks,
        };
      })
      .then(({
        nextCars,
        nextEngines,
        nextTracks,
        nextSessions,
        nextSetupDefinitions,
      }) => {
        if (!isCurrent) return;
        setCars(nextCars);
        setEngines(nextEngines);
        setTracks(nextTracks);
        setSessions(nextSessions);
        setSetupDefinitions(nextSetupDefinitions);

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

  useEffect(() => {
    let isCurrent = true;

    function handleSessionsChanged() {
      refreshReportSessions().catch((error: Error) => {
        if (!isCurrent) return;
        setMessage(error.message);
      });
    }

    async function refreshReportSessions() {
      const nextSessions = await fetchSessions(supabase, userId);
      const nextTracks = await fetchTracksByIds(
        supabase,
        userId,
        uniqueSessionTrackIds(nextSessions),
        { includeArchived: true },
      );
      if (!isCurrent) return;

      setTracks(nextTracks);
      setSessions(nextSessions);
      setSelectedCarId((currentCarId) => {
        const carId =
          currentCarId && nextSessions.some((session) => session.car_id === currentCarId)
            ? currentCarId
            : nextSessions[0]?.car_id ?? cars[0]?.id ?? "";
        const nextSessionsForCar = nextSessions.filter(
          (session) => session.car_id === carId,
        );

        setRunAId((currentRunAId) =>
          nextSessionsForCar.some((session) => session.id === currentRunAId)
            ? currentRunAId
            : nextSessionsForCar[0]?.id ?? "",
        );
        setRunBId((currentRunBId) =>
          nextSessionsForCar.some((session) => session.id === currentRunBId)
            ? currentRunBId
            : nextSessionsForCar[1]?.id ?? nextSessionsForCar[0]?.id ?? "",
        );

        return carId;
      });
    }

    window.addEventListener(SESSIONS_CHANGED_EVENT, handleSessionsChanged);

    return () => {
      isCurrent = false;
      window.removeEventListener(SESSIONS_CHANGED_EVENT, handleSessionsChanged);
    };
  }, [cars, supabase, userId]);

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
  return formatValue(sessionFieldValue(session, field.key));
}

function buildDynamicDiffFields(
  fields: SetupFieldDefinition[],
  category: DiffCategory,
): DiffField[] {
  const scope = category === "Setup" ? "setup_values" : "result_values";
  const dynamicFields = fields
    .filter((field) => field.scope === scope)
    .map((field) => ({
      category,
      key: field.key,
      label: field.label,
    }));

  if (
    category === "Setup" &&
    dynamicFields.some((field) => field.key === "engine_gear") &&
    dynamicFields.some((field) => field.key === "axle_gear")
  ) {
    dynamicFields.push({ category, key: "gear_ratio", label: "Gear Ratio" });
  }

  return dynamicFields;
}

function sessionFieldValue(session: SetupSession, key: string) {
  const payloadValue = sessionPayloadValue(session, key);
  if (payloadValue !== undefined) return payloadValue;
  return session[key as keyof SetupSession];
}

function gearRatioFor(
  session: SetupSession,
  engineById: Map<string, EngineWithType>,
) {
  const gearboxRatio = session.engine_id
    ? engineById.get(session.engine_id)?.engineType?.gearbox_ratio
    : null;
  const engineGear = Number(sessionFieldValue(session, "engine_gear"));
  const axleGear = Number(sessionFieldValue(session, "axle_gear"));
  if (!engineGear || !axleGear || !gearboxRatio) {
    return "--";
  }
  return ((axleGear / engineGear) * gearboxRatio).toFixed(2);
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
    session.is_baseline ? "(Baseline)" : "",
  ]
    .filter(Boolean)
    .join(" - ");
}

function uniqueSessionTrackIds(sessions: SetupSession[]) {
  return Array.from(new Set(sessions.map((session) => session.track_id)));
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

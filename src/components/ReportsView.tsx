import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Bar,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  BarChart,
} from "recharts";
import { fetchCars, type RaceCar } from "../data/cars";
import { fetchEngines, type EngineWithType } from "../data/engines";
import {
  fetchSessions,
  SESSIONS_CHANGED_EVENT,
  sessionPayloadValue,
  type SetupSession,
} from "../data/sessions";
import {
  type TelemetryChartSeries,
  TelemetryLineChart,
} from "./telemetry/TelemetryLineChart";
import {
  buildTelemetrySeriesForLapRefs,
  convertGpsSpeedToMph,
  telemetryChannelUnits,
  type TelemetryLapRef,
  type XrkLap,
} from "./telemetry/telemetrySeries";
import type { XrkParseResult } from "./telemetry/TelemetryReportView";
import {
  fetchCachedParsedTelemetryJson,
  fetchSessionTelemetryFiles,
  TELEMETRY_CHANGED_EVENT,
  type SessionTelemetryFile,
} from "../data/sessionTelemetry";
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

type SessionTelemetryComparison = {
  averageCompleteLapSeconds: number | null;
  bestCompleteLapSeconds: number | null;
  fileCount: number;
  lapCount: number;
  lapRows: ComparisonLap[];
  parsedFileCount: number;
  recordingDurationSeconds: number | null;
};

type ComparisonLap = {
  durationSeconds: number;
  label: string;
  lap: XrkLap;
  payload: XrkParseResult;
};

type ComparisonLapRow = {
  deltaSeconds: number | null;
  lapNumber: number;
  runA: number | null;
  runB: number | null;
};

type TelemetryComparisonState =
  | { status: "idle"; runA: null; runB: null; message: "" }
  | { status: "loading"; runA: null; runB: null; message: "" }
  | {
      status: "ready";
      runA: SessionTelemetryComparison;
      runB: SessionTelemetryComparison;
      message: "";
    }
  | { status: "error"; runA: null; runB: null; message: string };

const conditionFields: DiffField[] = [
  { category: "Conditions", key: "track_id", label: "Track" },
  { category: "Conditions", key: "driver", label: "Driver" },
  { category: "Conditions", key: "air_temp", label: "Air Temp" },
  { category: "Conditions", key: "humidity", label: "Humidity" },
  { category: "Conditions", key: "track_temp", label: "Track Temp" },
  { category: "Conditions", key: "track_condition", label: "Track Condition" },
  { category: "Conditions", key: "engine_id", label: "Engine" },
];

const smoothingOptions = [
  { label: "Raw", value: 1 },
  { label: "Light", value: 9 },
  { label: "Medium", value: 17 },
  { label: "Heavy", value: 31 },
];

export function ReportsView({ supabase, userId }: ReportsViewProps) {
  const [cars, setCars] = useState<RaceCar[]>([]);
  const [engines, setEngines] = useState<EngineWithType[]>([]);
  const [tracks, setTracks] = useState<TrackWithNotes[]>([]);
  const [sessions, setSessions] = useState<SetupSession[]>([]);
  const [telemetryFiles, setTelemetryFiles] = useState<SessionTelemetryFile[]>([]);
  const [setupDefinitions, setSetupDefinitions] =
    useState<RuntimeSetupDefinitionMap>({});
  const [selectedCarId, setSelectedCarId] = useState("");
  const [runAId, setRunAId] = useState("");
  const [runBId, setRunBId] = useState("");
  const [selectedComparisonLapNumber, setSelectedComparisonLapNumber] =
    useState(1);
  const [gpsSpeedSmoothingWindow, setGpsSpeedSmoothingWindow] = useState(1);
  const [inlineAccelerationSmoothingWindow, setInlineAccelerationSmoothingWindow] =
    useState(17);
  const [lateralGripSmoothingWindow, setLateralGripSmoothingWindow] =
    useState(17);
  const [lateralAccelerationSmoothingWindow, setLateralAccelerationSmoothingWindow] =
    useState(17);
  const [status, setStatus] = useState<"loading" | "ready">("loading");
  const [message, setMessage] = useState("");
  const [telemetryComparison, setTelemetryComparison] =
    useState<TelemetryComparisonState>({
      status: "idle",
      runA: null,
      runB: null,
      message: "",
    });

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
  const telemetryFilesBySessionId = useMemo(() => {
    const bySessionId = new Map<string, SessionTelemetryFile[]>();
    for (const file of telemetryFiles) {
      const files = bySessionId.get(file.session_id) ?? [];
      files.push(file);
      bySessionId.set(file.session_id, files);
    }
    return bySessionId;
  }, [telemetryFiles]);
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
  const sharedLapRows = useMemo(
    () =>
      telemetryComparison.status === "ready"
        ? sharedComparisonLapRows(
            telemetryComparison.runA.lapRows,
            telemetryComparison.runB.lapRows,
          )
        : [],
    [telemetryComparison],
  );
  const gpsSpeedOverlaySeries = useMemo(
    () =>
      telemetryComparison.status === "ready"
        ? buildChannelOverlaySeries(
            telemetryComparison.runA.lapRows,
            telemetryComparison.runB.lapRows,
            selectedComparisonLapNumber,
            "GPS Speed",
            convertGpsSpeedToMph,
            gpsSpeedSmoothingWindow,
          )
        : [],
    [gpsSpeedSmoothingWindow, selectedComparisonLapNumber, telemetryComparison],
  );
  const inlineAccelerationOverlaySeries = useMemo(
    () =>
      telemetryComparison.status === "ready"
        ? buildChannelOverlaySeries(
            telemetryComparison.runA.lapRows,
            telemetryComparison.runB.lapRows,
            selectedComparisonLapNumber,
            "GPS_InlineAcc",
            undefined,
            inlineAccelerationSmoothingWindow,
          )
        : [],
    [
      inlineAccelerationSmoothingWindow,
      selectedComparisonLapNumber,
      telemetryComparison,
    ],
  );
  const lateralAccelerationOverlaySeries = useMemo(
    () =>
      telemetryComparison.status === "ready"
        ? buildChannelOverlaySeries(
            telemetryComparison.runA.lapRows,
            telemetryComparison.runB.lapRows,
            selectedComparisonLapNumber,
            "GPS_LateralAcc",
            undefined,
            lateralAccelerationSmoothingWindow,
          )
        : [],
    [
      lateralAccelerationSmoothingWindow,
      selectedComparisonLapNumber,
      telemetryComparison,
    ],
  );
  const lateralGripOverlaySeries = useMemo(
    () =>
      telemetryComparison.status === "ready"
        ? buildChannelOverlaySeries(
            telemetryComparison.runA.lapRows,
            telemetryComparison.runB.lapRows,
            selectedComparisonLapNumber,
            "Lateral Grip",
            undefined,
            lateralGripSmoothingWindow,
          )
        : [],
    [lateralGripSmoothingWindow, selectedComparisonLapNumber, telemetryComparison],
  );

  useEffect(() => {
    let isCurrent = true;
    setStatus("loading");
    setMessage("");

    Promise.all([
      fetchCars(supabase, userId),
      fetchEngines(supabase, userId),
      fetchSessions(supabase, userId),
      fetchSessionTelemetryFiles(supabase, userId),
      fetchRuntimeSetupDefinitions(supabase),
    ])
      .then(async ([
        nextCars,
        nextEngines,
        nextSessions,
        nextTelemetryFiles,
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
          nextTelemetryFiles,
          nextSetupDefinitions,
          nextTracks,
        };
      })
      .then(({
        nextCars,
        nextEngines,
        nextTracks,
        nextSessions,
        nextTelemetryFiles,
        nextSetupDefinitions,
      }) => {
        if (!isCurrent) return;
        setCars(nextCars);
        setEngines(nextEngines);
        setTracks(nextTracks);
        setSessions(nextSessions);
        setTelemetryFiles(nextTelemetryFiles);
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

  useEffect(() => {
    let isCurrent = true;

    function handleTelemetryChanged() {
      fetchSessionTelemetryFiles(supabase, userId)
        .then((nextTelemetryFiles) => {
          if (!isCurrent) return;
          setTelemetryFiles(nextTelemetryFiles);
        })
        .catch((error: Error) => {
          if (!isCurrent) return;
          setMessage(error.message);
        });
    }

    window.addEventListener(TELEMETRY_CHANGED_EVENT, handleTelemetryChanged);

    return () => {
      isCurrent = false;
      window.removeEventListener(TELEMETRY_CHANGED_EVENT, handleTelemetryChanged);
    };
  }, [supabase, userId]);

  useEffect(() => {
    let isCurrent = true;

    if (!runA || !runB) {
      setTelemetryComparison({
        status: "idle",
        runA: null,
        runB: null,
        message: "",
      });
      return () => {
        isCurrent = false;
      };
    }

    setTelemetryComparison({
      status: "loading",
      runA: null,
      runB: null,
      message: "",
    });

    Promise.all([
      buildSessionTelemetryComparison(
        supabase,
        telemetryFilesBySessionId.get(runA.id) ?? [],
      ),
      buildSessionTelemetryComparison(
        supabase,
        telemetryFilesBySessionId.get(runB.id) ?? [],
      ),
    ])
      .then(([runATelemetry, runBTelemetry]) => {
        if (!isCurrent) return;
        setTelemetryComparison({
          status: "ready",
          runA: runATelemetry,
          runB: runBTelemetry,
          message: "",
        });
      })
      .catch((error: Error) => {
        if (!isCurrent) return;
        setTelemetryComparison({
          status: "error",
          runA: null,
          runB: null,
          message: error.message,
        });
      });

    return () => {
      isCurrent = false;
    };
  }, [runA, runB, supabase, telemetryFilesBySessionId]);

  useEffect(() => {
    if (!sharedLapRows.length) {
      setSelectedComparisonLapNumber(1);
      return;
    }

    setSelectedComparisonLapNumber((current) =>
      Math.min(Math.max(current, 1), sharedLapRows.length),
    );
  }, [sharedLapRows.length]);

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
          <span className="eyebrow">Reporting</span>
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
                <h3>Telemetry Outcome</h3>
                {telemetryComparison.status === "loading" ? (
                  <div className="empty-state">Loading telemetry comparison...</div>
                ) : telemetryComparison.status === "error" ? (
                  <div className="auth-error">
                    {telemetryComparison.message ||
                      "Telemetry comparison could not be loaded."}
                  </div>
                ) : telemetryComparison.status === "ready" ? (
                  <TelemetryOutcomeCards
                    runA={telemetryComparison.runA}
                    runB={telemetryComparison.runB}
                  />
                ) : (
                  <div className="empty-state">
                    Choose two sessions to compare telemetry.
                  </div>
                )}
              </section>

              {telemetryComparison.status === "ready" ? (
                <section className="report-chart-panel">
                  <div className="telemetry-chart-heading telemetry-chart-heading-single">
                    <div className="telemetry-chart-heading-copy">
                      <h3>Lap Time Comparison</h3>
                      <p className="telemetry-chart-note">
                        Compare imported laps from each selected session side by
                        side. Run B deltas are measured against Run A for the same
                        lap number.
                      </p>
                    </div>
                  </div>
                  <ComparisonLapTimesChart
                    runALapCount={telemetryComparison.runA.lapRows.length}
                    runBLapCount={telemetryComparison.runB.lapRows.length}
                    rows={sharedLapRows}
                    selectedLapNumber={selectedComparisonLapNumber}
                    onSelectLap={setSelectedComparisonLapNumber}
                  />
                </section>
              ) : null}

              {telemetryComparison.status === "ready" ? (
                <>
                  <TelemetryOverlayPanel
                    description="Compare speed traces for the same shared lap in each session. This shows where Run B gained or lost speed against Run A."
                    emptyMessage="No GPS speed samples were found for the selected shared lap."
                    finePrint="Displayed as mph. Traces are aligned by time into lap."
                    series={gpsSpeedOverlaySeries}
                    smoothingWindow={gpsSpeedSmoothingWindow}
                    title="GPS Speed Overlay"
                    tooltipLabel={`Lap ${selectedComparisonLapNumber} GPS speed`}
                    units="mph"
                    onSmoothingChange={setGpsSpeedSmoothingWindow}
                  />
                  <TelemetryOverlayPanel
                    description="Compare acceleration and braking traces for the same shared lap in each session. This helps show where Run B picked up speed or gave it back."
                    emptyMessage="No inline acceleration samples were found for the selected shared lap."
                    finePrint="Traces are aligned by time into lap."
                    series={inlineAccelerationOverlaySeries}
                    smoothingWindow={inlineAccelerationSmoothingWindow}
                    title="Inline Acceleration Overlay"
                    tooltipLabel={`Lap ${selectedComparisonLapNumber} inline acceleration`}
                    units={channelUnitsForComparison(
                      telemetryComparison.runA.lapRows,
                      telemetryComparison.runB.lapRows,
                      "GPS_InlineAcc",
                    )}
                    onSmoothingChange={setInlineAccelerationSmoothingWindow}
                  />
                  <TelemetryOverlayPanel
                    description="Compare lateral grip demand for the same shared lap in each session. This helps show how hard the car is working through corners."
                    emptyMessage="No lateral grip samples were found for the selected shared lap."
                    finePrint="Traces are aligned by time into lap."
                    series={lateralGripOverlaySeries}
                    smoothingWindow={lateralGripSmoothingWindow}
                    title="Lateral Grip Overlay"
                    tooltipLabel={`Lap ${selectedComparisonLapNumber} lateral grip`}
                    units={channelUnitsForComparison(
                      telemetryComparison.runA.lapRows,
                      telemetryComparison.runB.lapRows,
                      "Lateral Grip",
                    )}
                    onSmoothingChange={setLateralGripSmoothingWindow}
                  />
                  <TelemetryOverlayPanel
                    description="Compare side-to-side acceleration for the same shared lap in each session. This helps show differences in cornering load and direction changes."
                    emptyMessage="No lateral acceleration samples were found for the selected shared lap."
                    finePrint="Traces are aligned by time into lap."
                    series={lateralAccelerationOverlaySeries}
                    smoothingWindow={lateralAccelerationSmoothingWindow}
                    title="Lateral Acceleration Overlay"
                    tooltipLabel={`Lap ${selectedComparisonLapNumber} lateral acceleration`}
                    units={channelUnitsForComparison(
                      telemetryComparison.runA.lapRows,
                      telemetryComparison.runB.lapRows,
                      "GPS_LateralAcc",
                    )}
                    onSmoothingChange={setLateralAccelerationSmoothingWindow}
                  />
                </>
              ) : null}

              <section className="report-summary">
                <h3>Setup Changes</h3>
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

function TelemetryOutcomeCards({
  runA,
  runB,
}: {
  runA: SessionTelemetryComparison;
  runB: SessionTelemetryComparison;
}) {
  const hasTelemetry = runA.fileCount > 0 || runB.fileCount > 0;

  if (!hasTelemetry) {
    return (
      <div className="empty-state">
        Neither selected session has telemetry files attached yet.
      </div>
    );
  }

  return (
    <div className="report-outcome-grid">
      <OutcomeCard
        delta={formatSecondsDelta(
          runA.bestCompleteLapSeconds,
          runB.bestCompleteLapSeconds,
        )}
        label="Best Complete Lap"
        runA={formatSeconds(runA.bestCompleteLapSeconds)}
        runB={formatSeconds(runB.bestCompleteLapSeconds)}
      />
      <OutcomeCard
        delta={formatSecondsDelta(
          runA.averageCompleteLapSeconds,
          runB.averageCompleteLapSeconds,
        )}
        label="Avg Complete Lap"
        runA={formatSeconds(runA.averageCompleteLapSeconds)}
        runB={formatSeconds(runB.averageCompleteLapSeconds)}
      />
      <OutcomeCard
        delta={formatNumberDelta(runA.lapCount, runB.lapCount, "laps")}
        label="Laps Imported"
        runA={`${runA.lapCount} laps`}
        runB={`${runB.lapCount} laps`}
      />
      <OutcomeCard
        delta={formatNumberDelta(runA.fileCount, runB.fileCount, "files")}
        label="Telemetry Files"
        runA={`${runA.parsedFileCount}/${runA.fileCount} parsed`}
        runB={`${runB.parsedFileCount}/${runB.fileCount} parsed`}
      />
      <OutcomeCard
        delta={formatSecondsDelta(
          runA.recordingDurationSeconds,
          runB.recordingDurationSeconds,
        )}
        label="Recording Time"
        runA={formatDuration(runA.recordingDurationSeconds)}
        runB={formatDuration(runB.recordingDurationSeconds)}
      />
    </div>
  );
}

function OutcomeCard({
  delta,
  label,
  runA,
  runB,
}: {
  delta: string;
  label: string;
  runA: string;
  runB: string;
}) {
  return (
    <div className="report-outcome-card">
      <span>{label}</span>
      <strong>{delta}</strong>
      <small>
        Run A {runA} / Run B {runB}
      </small>
    </div>
  );
}

function ComparisonLapTimesChart({
  onSelectLap,
  rows,
  runALapCount,
  runBLapCount,
  selectedLapNumber,
}: {
  onSelectLap: (lapNumber: number) => void;
  rows: ComparisonLapRow[];
  runALapCount: number;
  runBLapCount: number;
  selectedLapNumber: number;
}) {
  const hasRows = rows.some(
    (row) => typeof row.runA === "number" || typeof row.runB === "number",
  );
  const sharedLapCount = Math.min(runALapCount, runBLapCount);
  const runAExtraLaps = Math.max(0, runALapCount - sharedLapCount);
  const runBExtraLaps = Math.max(0, runBLapCount - sharedLapCount);

  if (!hasRows) {
    return <div className="empty-state">No imported lap times to compare.</div>;
  }

  return (
    <div className="report-lap-comparison-chart">
      <ResponsiveContainer width="100%" height={320}>
        <BarChart
          barCategoryGap="18%"
          data={rows}
          margin={{ top: 22, right: 18, bottom: 8, left: 0 }}
        >
          <CartesianGrid stroke="#d8e1d6" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="lapNumber"
            interval={0}
            minTickGap={8}
            tick={{ fill: "#405343", fontSize: 12, fontWeight: 750 }}
            tickLine={false}
          />
          <YAxis
            domain={lapComparisonDomain(rows)}
            tick={{ fill: "#647268", fontSize: 12, fontWeight: 650 }}
            tickFormatter={(value) => `${Number(value).toFixed(1)}s`}
            tickLine={false}
            width={58}
          />
          <Tooltip
            cursor={{ fill: "rgb(40 122 62 / 0.08)" }}
            content={<ComparisonLapTooltip />}
          />
          <Bar
            dataKey="runA"
            fill="#287a3e"
            maxBarSize={32}
            name="Run A"
            onClick={(_, index) => onSelectLap(rows[index].lapNumber)}
            radius={[5, 5, 0, 0]}
          >
            <LabelList
              dataKey="runA"
              formatter={(value: unknown) =>
                typeof value === "number" ? value.toFixed(3) : ""
              }
              position="top"
              className="lap-chart-label"
            />
            {rows.map((row) => (
              <Cell
                className="lap-chart-bar"
                fill="#287a3e"
                key={`run-a-${row.lapNumber}`}
                stroke={row.lapNumber === selectedLapNumber ? "#111827" : "none"}
                strokeWidth={row.lapNumber === selectedLapNumber ? 1 : 0}
              />
            ))}
          </Bar>
          <Bar
            dataKey="runB"
            fill="#2563eb"
            maxBarSize={32}
            name="Run B"
            onClick={(_, index) => onSelectLap(rows[index].lapNumber)}
            radius={[5, 5, 0, 0]}
          >
            <LabelList
              dataKey="runB"
              formatter={(value: unknown) =>
                typeof value === "number" ? value.toFixed(3) : ""
              }
              position="top"
              className="lap-chart-label"
            />
            {rows.map((row) => (
              <Cell
                className="lap-chart-bar"
                fill="#2563eb"
                key={`run-b-${row.lapNumber}`}
                stroke={row.lapNumber === selectedLapNumber ? "#111827" : "none"}
                strokeWidth={row.lapNumber === selectedLapNumber ? 1 : 0}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="lap-chart-legend">
        <span>
          <i className="lap-chart-swatch report-run-a-swatch" />
          Run A
        </span>
        <span>
          <i className="lap-chart-swatch report-run-b-swatch" />
          Run B
        </span>
      </div>
      <p className="report-chart-note">
        Selected Lap {selectedLapNumber}. Click a lap bar to update the telemetry
        overlays below.
      </p>
      {runAExtraLaps || runBExtraLaps ? (
        <p className="report-chart-note">
          Showing {sharedLapCount} shared {sharedLapCount === 1 ? "lap" : "laps"}.
          {runAExtraLaps
            ? ` Run A has ${runAExtraLaps} additional ${runAExtraLaps === 1 ? "lap" : "laps"} not shown.`
            : ""}
          {runBExtraLaps
            ? ` Run B has ${runBExtraLaps} additional ${runBExtraLaps === 1 ? "lap" : "laps"} not shown.`
            : ""}
        </p>
      ) : null}
    </div>
  );
}

function TelemetryOverlayPanel({
  description,
  emptyMessage,
  finePrint,
  onSmoothingChange,
  series,
  smoothingWindow,
  title,
  tooltipLabel,
  units,
}: {
  description: string;
  emptyMessage: string;
  finePrint: string;
  onSmoothingChange: (smoothingWindow: number) => void;
  series: TelemetryChartSeries[];
  smoothingWindow: number;
  title: string;
  tooltipLabel: string;
  units: string;
}) {
  return (
    <section className="report-chart-panel">
      <div className="telemetry-chart-heading">
        <div className="telemetry-chart-heading-copy">
          <h3>{title}</h3>
          <p className="telemetry-chart-note">{description}</p>
          <p className="telemetry-chart-fine-print">{finePrint}</p>
        </div>
        <div className="telemetry-chart-controls">
          <label>
            Smoothing
            <select
              value={smoothingWindow}
              onChange={(event) => onSmoothingChange(Number(event.target.value))}
            >
              {smoothingOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <TelemetryLineChart
        emptyMessage={emptyMessage}
        series={series}
        tooltipLabel={tooltipLabel}
        units={units}
      />
    </section>
  );
}

function ComparisonLapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ComparisonLapRow }>;
}) {
  if (!active || !payload?.length) return null;

  const row = payload[0].payload;
  return (
    <div className="lap-chart-tooltip">
      <strong>Lap {row.lapNumber}</strong>
      <span>Run A {formatSeconds(row.runA)}</span>
      <span>Run B {formatSeconds(row.runB)}</span>
      <small>{formatSecondsDelta(row.runA, row.runB)}</small>
    </div>
  );
}

async function buildSessionTelemetryComparison(
  supabase: SupabaseClient,
  files: SessionTelemetryFile[],
): Promise<SessionTelemetryComparison> {
  const parsedFiles = files.filter((file) => file.parse_status === "parsed");
  const payloads = await Promise.all(
    parsedFiles.map(async (file) =>
      (await fetchCachedParsedTelemetryJson(supabase, file)) as XrkParseResult,
    ),
  );
  const completeLapDurations = payloads.flatMap((payload) =>
    completeLapDurationsFor(payload),
  );
  const lapRows = payloads.flatMap((payload) => importedLapsFor(payload));
  const recordingDurationSeconds = sumKnownValues(
    files.map((file) => file.recording_duration_seconds),
  );

  return {
    averageCompleteLapSeconds: average(completeLapDurations),
    bestCompleteLapSeconds: completeLapDurations.length
      ? Math.min(...completeLapDurations)
      : null,
    fileCount: files.length,
    lapCount: payloads.reduce(
      (sum, payload) => sum + countImportedLaps(payload),
      0,
    ),
    lapRows,
    parsedFileCount: parsedFiles.length,
    recordingDurationSeconds,
  };
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

function completeLapDurationsFor(payload: XrkParseResult) {
  const laps = payload.laps ?? [];
  const lastLapIndex = laps.length - 1;

  return laps
    .filter((lap, index) => index > 0 && index < lastLapIndex)
    .map((lap) => lap.durationSeconds)
    .filter(
      (duration): duration is number =>
      typeof duration === "number" && Number.isFinite(duration),
    );
}

function importedLapsFor(payload: XrkParseResult): ComparisonLap[] {
  return (payload.laps ?? [])
    .map((lap, index) => {
      const durationSeconds = lap.durationSeconds;
      if (
        typeof durationSeconds !== "number" ||
        !Number.isFinite(durationSeconds)
      ) {
        return null;
      }

      return {
        durationSeconds,
        label: String(lap.lapNumber ?? index + 1),
        lap,
        payload,
      };
    })
    .filter((lap): lap is ComparisonLap => Boolean(lap));
}

function sharedComparisonLapRows(
  runALaps: ComparisonLap[],
  runBLaps: ComparisonLap[],
): ComparisonLapRow[] {
  const rowCount = Math.min(runALaps.length, runBLaps.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const runA = runALaps[index].durationSeconds;
    const runB = runBLaps[index].durationSeconds;

    return {
      deltaSeconds: runB - runA,
      lapNumber: index + 1,
      runA,
      runB,
    };
  });
}

function buildChannelOverlaySeries(
  runALaps: ComparisonLap[],
  runBLaps: ComparisonLap[],
  selectedLapNumber: number,
  channelName: string,
  convertValue: (value: number) => number = (value) => value,
  smoothingWindow = 1,
): TelemetryChartSeries[] {
  const runALap = runALaps[selectedLapNumber - 1] ?? null;
  const runBLap = runBLaps[selectedLapNumber - 1] ?? null;
  const lapRefs = [
    runALap ? comparisonLapRef(runALap, "run-a", "Run A", "#287a3e") : null,
    runBLap ? comparisonLapRef(runBLap, "run-b", "Run B", "#2563eb") : null,
  ].filter((lapRef): lapRef is TelemetryLapRef => Boolean(lapRef));

  return buildTelemetrySeriesForLapRefs({
    channelName,
    convertValue,
    lapRefs,
    smoothingWindow,
  });
}

function channelUnitsForComparison(
  runALaps: ComparisonLap[],
  runBLaps: ComparisonLap[],
  channelName: string,
) {
  const lapRefs = [...runALaps, ...runBLaps].map((comparisonLap, index) =>
    comparisonLapRef(comparisonLap, `lap-${index}`, comparisonLap.label),
  );
  return telemetryChannelUnits(lapRefs, channelName);
}

function comparisonLapRef(
  comparisonLap: ComparisonLap,
  id: string,
  label: string,
  color?: string,
): TelemetryLapRef {
  return {
    color,
    id,
    label,
    lap: comparisonLap.lap,
    payload: comparisonLap.payload,
  };
}

function lapComparisonDomain(rows: ComparisonLapRow[]): [number, number] {
  const durations = rows.flatMap((row) => [row.runA, row.runB]).filter(
    (duration): duration is number =>
      typeof duration === "number" && Number.isFinite(duration),
  );

  if (!durations.length) return [0, 1];

  return [
    Math.max(0, Math.min(...durations) - 0.25),
    Math.max(...durations) + 0.25,
  ];
}

function countImportedLaps(payload: XrkParseResult) {
  return (payload.laps ?? []).filter(
    (lap) =>
      typeof lap.durationSeconds === "number" &&
      Number.isFinite(lap.durationSeconds),
  ).length;
}

function sumKnownValues(values: Array<number | null | undefined>) {
  const knownValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  return knownValues.length
    ? knownValues.reduce((sum, value) => sum + value, 0)
    : null;
}

function average(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

function formatSeconds(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? `${value.toFixed(3)}s`
    : "--";
}

function formatDuration(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";

  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

function formatSecondsDelta(
  valueA: number | null | undefined,
  valueB: number | null | undefined,
) {
  if (
    typeof valueA !== "number" ||
    typeof valueB !== "number" ||
    !Number.isFinite(valueA) ||
    !Number.isFinite(valueB)
  ) {
    return "--";
  }

  const delta = valueB - valueA;
  if (Math.abs(delta) < 0.0005) return "No change";
  return `${delta > 0 ? "+" : ""}${delta.toFixed(3)}s ${delta < 0 ? "faster" : "slower"}`;
}

function formatNumberDelta(valueA: number, valueB: number, units: string) {
  const delta = valueB - valueA;
  if (delta === 0) return "No change";
  return `${delta > 0 ? "+" : ""}${delta} ${units}`;
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

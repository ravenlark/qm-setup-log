const STORAGE_KEY = "raceSetupLog.sessions.v1";
const CARS_KEY = "raceSetupLog.cars.v1";
const ENGINES_KEY = "raceSetupLog.engines.v1";
const MAINTENANCE_KEY = "raceSetupLog.engineMaintenance.v1";
const TRACKS_KEY = "raceSetupLog.tracks.v1";
const BASELINES_KEY = "raceSetupLog.baselines.v1";
const DRAFT_KEY = "raceSetupLog.sessionDraft.v1";
const $ = (id) => document.getElementById(id);
const GEARBOX_RATIOS = {
  "Honda 120": 6.14,
  "Honda 160": 6.14,
  "Briggs & Stratton Animal": 6.07,
  "Briggs & Stratton World Formula": 6.07,
  "DECO": 5.73
};

const fields = [
  "track", "trackId", "airTemp", "humidity", "trackTemp", "condition", "date", "sessionTime", "type", "engineId", "driver", "carId",
  "lfPsi", "lfOffset", "lfSpringRate", "lfShockValving", "rfPsi", "rfOffset", "rfSpringRate", "rfShockValving",
  "lrPsi", "lrOffset", "lrSpringRate", "lrShockValving", "lrHub", "rrPsi", "rrOffset", "rrSpringRate", "rrShockValving",
  "stagger", "tireNotes", "lfWeight", "rfWeight", "lrWeight", "rrWeight", "lfRideHeight",
  "rfRideHeight", "lrRideHeight", "rrRideHeight", "lfCamber", "rfCamber", "lfCaster",
  "rfCaster", "lfPanhardHoles", "rfPanhardHoles", "lrPanhardHoles", "rrPanhardHoles",
  "leftWheelbase", "rightWheelbase", "engineGear", "axleGear", "gearRatio", "lapTime",
  "startPosition", "endPosition", "averageRpm", "averageDrops", "totalLaps", "lfTireTemp",
  "rfTireTemp", "lrTireTemp", "rrTireTemp", "handling", "changes", "nextTime"
];
const decimalNumericFields = [
  "airTemp", "humidity", "trackTemp", "lfPsi", "rfPsi", "lrPsi", "rrPsi", "lfOffset",
  "rfOffset", "lrOffset", "rrOffset", "stagger",
  "lfWeight", "rfWeight", "lrWeight", "rrWeight", "lfRideHeight", "rfRideHeight", "maintenanceCost",
  "lrRideHeight", "rrRideHeight", "leftWheelbase", "rightWheelbase", "lapTime"
];
const signedDecimalNumericFields = [
  "lfCamber", "rfCamber", "lfCaster", "rfCaster"
];
const integerNumericFields = [
  "lfSpringRate", "rfSpringRate", "lrSpringRate", "rrSpringRate", "lfPanhardHoles",
  "rfPanhardHoles", "lrPanhardHoles", "rrPanhardHoles", "engineGear", "axleGear",
  "totalLaps", "averageRpm", "averageDrops", "startPosition", "endPosition",
  "lfTireTemp", "rfTireTemp", "lrTireTemp", "rrTireTemp", "carYear"
];

let cars = loadCars();
let engines = loadEngines();
let maintenanceEntries = loadMaintenanceEntries();
let tracks = loadTracks();
let baselines = loadBaselines();
migrateEngineAssignments();
let sessions = loadSessions();
let activeTab = "sessions";
let compareCarId = "";
let compareCurrentId = "";
let comparePreviousId = "";
let suppressDraftSave = false;

function loadCars() {
  try {
    const loaded = JSON.parse(localStorage.getItem(CARS_KEY) || "[]");
    return Array.isArray(loaded) ? loaded.map(normalizeCar) : [];
  } catch {
    return [];
  }
}

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(normalizeSession);
  } catch {
    return [];
  }
}

function loadEngines() {
  try {
    const loaded = JSON.parse(localStorage.getItem(ENGINES_KEY) || "[]");
    return Array.isArray(loaded) ? loaded.map(normalizeEngine) : [];
  } catch {
    return [];
  }
}

function loadMaintenanceEntries() {
  try {
    const loaded = JSON.parse(localStorage.getItem(MAINTENANCE_KEY) || "[]");
    return Array.isArray(loaded) ? loaded.map(normalizeMaintenanceEntry) : [];
  } catch {
    return [];
  }
}

function loadTracks() {
  try {
    const loaded = JSON.parse(localStorage.getItem(TRACKS_KEY) || "[]");
    return Array.isArray(loaded) ? loaded.map(normalizeTrack) : [];
  } catch {
    return [];
  }
}

function loadBaselines() {
  try {
    const loaded = JSON.parse(localStorage.getItem(BASELINES_KEY) || "{}");
    return loaded && typeof loaded === "object" && !Array.isArray(loaded) ? loaded : {};
  } catch {
    return {};
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
}

function saveCars() {
  localStorage.setItem(CARS_KEY, JSON.stringify(cars));
}

function saveEngines() {
  localStorage.setItem(ENGINES_KEY, JSON.stringify(engines));
}

function saveMaintenanceEntries() {
  localStorage.setItem(MAINTENANCE_KEY, JSON.stringify(maintenanceEntries));
}

function saveTracks() {
  localStorage.setItem(TRACKS_KEY, JSON.stringify(tracks));
}

function saveBaselines() {
  localStorage.setItem(BASELINES_KEY, JSON.stringify(baselines));
}

function migrateEngineAssignments() {
  let changed = false;
  try {
    const rawEngines = JSON.parse(localStorage.getItem(ENGINES_KEY) || "[]");
    rawEngines.forEach((rawEngine) => {
      if (!rawEngine?.carId) return;
      const car = cars.find((item) => item.id === rawEngine.carId);
      const engine = engines.find((item) => item.id === rawEngine.id);
      if (car && engine && !car.currentEngineId) {
        car.currentEngineId = engine.id;
        changed = true;
      }
    });
  } catch {
    return;
  }
  if (changed) saveCars();
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((registration) => {
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            showToast("Offline update ready. Refresh to use the latest version.");
          }
        });
      });
    }).catch(() => {
      showToast("Offline mode could not be enabled on this browser.");
    });
  });
}

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
  $(`${tab}Panel`).classList.add("active");
}

function sortedSessions() {
  return [...sessions].sort((a, b) => {
    const dateSort = sessionDateTime(b) - sessionDateTime(a);
    return dateSort || (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

function sortedCars() {
  return [...cars].sort((a, b) => a.name.localeCompare(b.name));
}

function sortedEngines() {
  return [...engines].sort((a, b) => a.name.localeCompare(b.name));
}

function sortedMaintenanceEntries(engineId = "") {
  return maintenanceEntries
    .filter((entry) => !engineId || entry.engineId === engineId)
    .sort((a, b) => {
      const dateSort = maintenanceDate(b) - maintenanceDate(a);
      return dateSort || (b.createdAt || "").localeCompare(a.createdAt || "");
    });
}

function normalizeCar(car = {}) {
  return {
    id: car.id || crypto.randomUUID(),
    name: String(car.name || "Default Car").trim() || "Default Car",
    model: String(car.model || "").trim(),
    year: String(car.year || "").trim(),
    currentEngineId: car.currentEngineId || "",
    notes: String(car.notes || "").trim()
  };
}

function normalizeEngine(engine = {}) {
  const type = normalizeEngineType(engine.type || engine.engine);
  return {
    id: engine.id || crypto.randomUUID(),
    name: String(engine.name || "Engine").trim() || "Engine",
    type,
    serial: String(engine.serial || "").trim(),
    lastMaintenance: String(engine.lastMaintenance || "").trim(),
    notes: String(engine.notes || "").trim()
  };
}

function normalizeMaintenanceEntry(entry = {}) {
  return {
    id: entry.id || crypto.randomUUID(),
    engineId: entry.engineId || "",
    date: entry.date || localDateValue(),
    type: normalizeMaintenanceType(entry.type),
    performedBy: String(entry.performedBy || "").trim(),
    cost: String(entry.cost || "").trim(),
    notes: String(entry.notes || "").trim(),
    createdAt: entry.createdAt || new Date().toISOString()
  };
}

function normalizeTrack(track = {}) {
  return {
    id: track.id || crypto.randomUUID(),
    name: String(track.name || track.track || "Track").trim() || "Track",
    location: String(track.location || "").trim(),
    surface: String(track.surface || "").trim(),
    length: String(track.length || "").trim(),
    banking: String(track.banking || "").trim(),
    layoutNotes: String(track.layoutNotes || "").trim(),
    lineNotes: String(track.lineNotes || "").trim(),
    surfaceNotes: String(track.surfaceNotes || "").trim(),
    tireNotes: String(track.tireNotes || "").trim(),
    facilityNotes: String(track.facilityNotes || "").trim(),
    notes: String(track.notes || "").trim()
  };
}

function normalizeEngineType(type = "") {
  if (type === "Honda 120/160") return "Honda 120";
  if (type === "Briggs & Stratton") return "Briggs & Stratton Animal";
  return GEARBOX_RATIOS[type] ? type : "Honda 120";
}

function normalizeMaintenanceType(type = "") {
  const cleanType = String(type || "").trim();
  return [
    "Oil Change",
    "Spark Plug",
    "Gasket",
    "Valve Adjustment",
    "Cleaning / Inspection",
    "Repair",
    "Full Refresh",
    "Other"
  ].includes(cleanType) ? cleanType : "Other";
}

function sortedTracks() {
  return [...tracks].sort((a, b) => a.name.localeCompare(b.name));
}

function getOrCreateTrack(name = "") {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  const existing = tracks.find((track) => track.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return existing;
  const track = normalizeTrack({ name: cleanName });
  tracks.push(track);
  saveTracks();
  return track;
}

function trackName(trackId, fallback = "") {
  return tracks.find((track) => track.id === trackId)?.name || fallback || "Untitled track";
}

function baselineKey(carId, trackId, track = "") {
  const trackPart = trackId || String(track || "").trim().toLowerCase();
  return carId && trackPart ? `${carId}|${trackPart}` : "";
}

function sessionBaselineKey(session) {
  return baselineKey(session.carId, session.trackId, session.track);
}

function baselineForSession(session) {
  return baselines[sessionBaselineKey(session)] || "";
}

function isBaselineSession(session) {
  return Boolean(session?.id && baselineForSession(session) === session.id);
}

function currentTrackMemorySessions() {
  const carId = $("carId")?.value || "";
  const trackId = $("trackId")?.value || "";
  const trackValue = trackName(trackId, $("track")?.value || "");
  const entryId = $("entryId")?.value || "";
  if (!carId || !trackId) return [];
  return sortedSessions().filter((session) => {
    const sameTrackId = session.trackId && session.trackId === trackId;
    const sameTrackName = !session.trackId && session.track && session.track.toLowerCase() === trackValue.toLowerCase();
    return session.id !== entryId && session.carId === carId && (sameTrackId || sameTrackName);
  });
}

function bestLapMemorySession(memorySessions = []) {
  return memorySessions
    .filter((session) => parseNumber(session.lapTime) > 0)
    .sort((a, b) => parseNumber(a.lapTime) - parseNumber(b.lapTime) || sessionDateTime(b) - sessionDateTime(a))[0] || null;
}

function bestFinishMemorySession(memorySessions = []) {
  return memorySessions
    .filter((session) => parseNumber(session.endPosition) > 0)
    .sort((a, b) => parseNumber(a.endPosition) - parseNumber(b.endPosition) || sessionDateTime(b) - sessionDateTime(a))[0] || null;
}

function baselineMemorySession(memorySessions = []) {
  const key = baselineKey($("carId")?.value || "", $("trackId")?.value || "", $("track")?.value || "");
  const baselineId = baselines[key] || "";
  return memorySessions.find((session) => session.id === baselineId) || null;
}

function getOrCreateCar(name = "Default Car") {
  const cleanName = String(name || "").trim() || "Default Car";
  const existing = cars.find((car) => car.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return existing;
  const car = normalizeCar({ name: cleanName });
  cars.push(car);
  saveCars();
  return car;
}

function carName(carId) {
  return cars.find((car) => car.id === carId)?.name || "Unknown car";
}

function carLabel(car) {
  return [car.name, car.year, car.model].filter(Boolean).join(" - ");
}

function engineName(engineId) {
  return engines.find((engine) => engine.id === engineId)?.name || "Unknown engine";
}

function engineLabel(engine) {
  return [engine.name, engine.type, engine.serial].filter(Boolean).join(" - ");
}

function getOrCreateEngine(name = "Primary Engine", type = "Honda 120") {
  const cleanName = String(name || "").trim() || "Primary Engine";
  const existing = engines.find((engine) => engine.name.toLowerCase() === cleanName.toLowerCase());
  if (existing) return existing;
  const engine = normalizeEngine({ name: cleanName, type });
  engines.push(engine);
  saveEngines();
  return engine;
}

function renderCarOptions(selectedId = $("carId")?.value || "") {
  if (!cars.length) {
    $("carId").innerHTML = `<option value="">Add a car in My Garage</option>`;
    $("carId").value = "";
    renderSessionFilters();
    renderCarEngineOptions();
    renderEngineOptions();
    return;
  }
  const options = sortedCars().map((car) => `<option value="${car.id}">${escapeHtml(carLabel(car))}</option>`).join("");
  $("carId").innerHTML = options;
  $("carId").value = cars.some((car) => car.id === selectedId) ? selectedId : sortedCars()[0]?.id || "";
  renderSessionFilters();
  renderCarEngineOptions();
  renderEngineOptions();
}

function renderCarEngineOptions(selectedId = $("carCurrentEngineId")?.value || "") {
  const options = [`<option value="">No engine installed</option>`, ...sortedEngines().map((engine) => `<option value="${engine.id}">${escapeHtml(engineLabel(engine))}</option>`)].join("");
  $("carCurrentEngineId").innerHTML = options;
  $("carCurrentEngineId").value = engines.some((engine) => engine.id === selectedId) ? selectedId : "";
}

function renderTrackOptions() {
  const selected = $("trackId")?.value || "";
  if (!tracks.length) {
    $("trackId").innerHTML = `<option value="">Add a track in Tracks</option>`;
    $("trackId").value = "";
    $("track").value = "";
    return;
  }
  $("trackId").innerHTML = sortedTracks().map((track) => `<option value="${track.id}">${escapeHtml(track.name)}</option>`).join("");
  $("trackId").value = tracks.some((track) => track.id === selected) ? selected : sortedTracks()[0]?.id || "";
  $("track").value = trackName($("trackId").value, "");
}

function renderEngineOptions(selectedId = $("engineId")?.value || "") {
  if (!engines.length) {
    $("engineId").innerHTML = `<option value="">Add an engine in My Garage</option>`;
    $("engineId").value = "";
    syncEngineTypeFromInstalled();
    return;
  }
  const carId = $("carId")?.value || "";
  const car = cars.find((item) => item.id === carId);
  const assigned = engines.find((engine) => engine.id === car?.currentEngineId);
  const available = sortedEngines();
  const selectedExists = available.some((engine) => engine.id === selectedId);
  const preferredId = selectedExists ? selectedId : assigned?.id || available[0]?.id || "";
  $("engineId").innerHTML = available.map((engine) => `<option value="${engine.id}">${escapeHtml(engineLabel(engine))}</option>`).join("");
  $("engineId").value = available.some((engine) => engine.id === preferredId) ? preferredId : available[0]?.id || "";
  syncEngineTypeFromInstalled();
}

function renderSessionFilters() {
  const selected = $("sessionCarFilter")?.value || "";
  $("sessionCarFilter").innerHTML = [`<option value="">All Cars</option>`, ...sortedCars().map((car) => `<option value="${car.id}">${escapeHtml(carLabel(car))}</option>`)].join("");
  $("sessionCarFilter").value = cars.some((car) => car.id === selected) ? selected : "";
}

function addCar() {
  clearCarForm();
  setTab("cars");
  document.querySelector("#carFormHost").appendChild($("carForm"));
  showCarForm();
  $("carNameInput").focus({ preventScroll: true });
}

function normalizeSession(session = {}) {
  const normalized = { ...session };
  if (normalized.type === "Race") normalized.type = "Main";
  const hadLegacyCar = Boolean(normalized.car);
  const hadLegacyEngine = Boolean(normalized.engine || normalized.className);
  if (!normalized.engine && normalized.className) {
    normalized.engine = normalized.className;
  }
  if ((!normalized.airTemp || !normalized.trackTemp) && normalized.temperature) {
    const [air, track] = String(normalized.temperature).split("/").map((part) => part.trim());
    normalized.airTemp = normalized.airTemp || air || "";
    normalized.trackTemp = normalized.trackTemp || track || "";
  }
  if (normalized.track) {
    const track = normalized.trackId ? tracks.find((item) => item.id === normalized.trackId) || getOrCreateTrack(normalized.track) : getOrCreateTrack(normalized.track);
    if (track) {
      normalized.trackId = track.id;
      normalized.track = track.name;
    }
  }
  normalized.engine = normalizeEngineType(normalized.engine);
  if (!normalized.carId && hadLegacyCar) normalized.carId = getOrCreateCar(normalized.car).id;
  if (!normalized.engineId) {
    const car = cars.find((item) => item.id === normalized.carId);
    normalized.engineId = car?.currentEngineId || (hadLegacyEngine ? getOrCreateEngine(`${normalized.engine} Primary`, normalized.engine).id : "");
  }
  const installedEngine = engines.find((engine) => engine.id === normalized.engineId);
  if (installedEngine) normalized.engine = installedEngine.type;

  if (!normalized.engineGear && normalized.gear) {
    const [engine, axle] = String(normalized.gear).split("/").map((part) => part.trim());
    normalized.engineGear = engine || "";
    normalized.axleGear = axle || "";
  }

  if (!normalized.leftWheelbase && normalized.wheelbase) {
    const [left, right] = String(normalized.wheelbase).split("/").map((part) => part.trim());
    normalized.leftWheelbase = left || "";
    normalized.rightWheelbase = right || "";
  }

  if (!normalized.lfRideHeight && normalized.rideHeight) {
    const [lf, rf, lr, rr] = String(normalized.rideHeight).split("/").map((part) => part.trim());
    normalized.lfRideHeight = lf || "";
    normalized.rfRideHeight = rf || "";
    normalized.lrRideHeight = lr || "";
    normalized.rrRideHeight = rr || "";
  }

  if ((!normalized.lfCamber || !normalized.rfCamber) && normalized.camber) {
    const [lf, rf] = splitPairValue(normalized.camber);
    normalized.lfCamber = normalized.lfCamber || lf;
    normalized.rfCamber = normalized.rfCamber || rf;
  }

  if ((!normalized.lfCaster || !normalized.rfCaster) && normalized.caster) {
    const [lf, rf] = splitPairValue(normalized.caster);
    normalized.lfCaster = normalized.lfCaster || lf;
    normalized.rfCaster = normalized.rfCaster || rf;
  }
  ["lfCamber", "rfCamber", "lfCaster", "rfCaster"].forEach((field) => {
    normalized[field] = normalizeSignedNumberText(normalized[field]);
  });
  normalized.lrHub = normalizeLrHub(normalized.lrHub);

  if (!normalized.startPosition && normalized.finish) normalized.endPosition = normalized.finish;
  if (!isPositionSession(normalized.type)) {
    normalized.startPosition = "";
    normalized.endPosition = "";
  }
  if (!normalized.gearRatio) normalized.gearRatio = calculateGearRatio(normalized);

  return normalized;
}

function sessionDateTime(session) {
  if (!session?.date) return new Date(0);
  return new Date(`${session.date}T${session.sessionTime || "00:00"}`);
}

function maintenanceDate(entry) {
  if (!entry?.date) return new Date(0);
  return new Date(`${entry.date}T00:00:00`);
}

function engineSessions(engineId) {
  return sessions.filter((session) => session.engineId === engineId);
}

function engineTotalLaps(engineId) {
  return engineSessions(engineId).reduce((total, session) => total + parseNumber(session.totalLaps), 0);
}

function latestEngineRefresh(engineId) {
  return sortedMaintenanceEntries(engineId).find((entry) => entry.type === "Full Refresh") || null;
}

function engineLapsSinceRefresh(engineId) {
  const refresh = latestEngineRefresh(engineId);
  if (!refresh) return engineTotalLaps(engineId);
  const refreshDate = maintenanceDate(refresh);
  return engineSessions(engineId)
    .filter((session) => sessionDateTime(session) >= refreshDate)
    .reduce((total, session) => total + parseNumber(session.totalLaps), 0);
}

function isPositionSession(type) {
  return type === "Heat" || type === "Main";
}

function splitPairValue(value = "") {
  return String(value).split("/").map((part) => part.trim());
}

function normalizeSignedNumberText(value = "") {
  return String(value || "").trim().replace(/^\+/, "");
}

function normalizeLrHub(value = "") {
  const cleanValue = String(value || "").trim().toLowerCase();
  if (cleanValue === "unlocked") return "Unlocked";
  if (cleanValue === "ratchet" || cleanValue === "ratchet hub") return "Ratchet";
  return "Locked";
}

function parseNumber(value) {
  const parsed = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function weightPercentages(session = readVisibleWeights()) {
  const lf = parseNumber(session.lfWeight);
  const rf = parseNumber(session.rfWeight);
  const lr = parseNumber(session.lrWeight);
  const rr = parseNumber(session.rrWeight);
  const total = lf + rf + lr + rr;
  if (!total) {
    return { front: "", left: "", right: "", rear: "", cross: "" };
  }

  const percent = (value) => `${((value / total) * 100).toFixed(1)}%`;
  return {
    front: percent(lf + rf),
    left: percent(lf + lr),
    right: percent(rf + rr),
    rear: percent(lr + rr),
    cross: percent(rf + lr)
  };
}

function readVisibleWeights() {
  return {
    lfWeight: $("lfWeight")?.value || "",
    rfWeight: $("rfWeight")?.value || "",
    lrWeight: $("lrWeight")?.value || "",
    rrWeight: $("rrWeight")?.value || ""
  };
}

function updateWeightCalculations() {
  const percentages = weightPercentages();
  $("frontPercent").textContent = percentages.front || "--";
  $("leftPercent").textContent = percentages.left || "--";
  $("rightPercent").textContent = percentages.right || "--";
  $("rearPercent").textContent = percentages.rear || "--";
  $("crossPercent").textContent = percentages.cross || "--";
}

function formatGear(session) {
  const gear = [session.engineGear, session.axleGear].filter(Boolean).join(" / ");
  if (gear && session.gearRatio) return `${gear} (${session.gearRatio})`;
  return gear || session.gearRatio || "--";
}

function compareLabel(session) {
  return `${formatDateTime(session)} - ${session.type || "Run"} - ${session.track || "Untitled track"}`;
}

function calculateGearRatio(session = readVisibleGears()) {
  const engineGear = parseNumber(session.engineGear);
  const axleGear = parseNumber(session.axleGear);
  const installedEngine = engines.find((engine) => engine.id === session.engineId);
  const engineType = installedEngine?.type || session.engine;
  const gearboxRatio = GEARBOX_RATIOS[engineType] || GEARBOX_RATIOS["Honda 120"];
  if (!engineGear || !axleGear) return "";
  return ((axleGear / engineGear) * gearboxRatio).toFixed(2);
}

function readVisibleGears() {
  return {
    engine: "Honda 120",
    engineId: $("engineId")?.value || "",
    engineGear: $("engineGear")?.value || "",
    axleGear: $("axleGear")?.value || ""
  };
}

function updateGearRatio() {
  const ratio = calculateGearRatio();
  $("gearRatio").value = ratio;
  $("gearRatioDisplay").textContent = ratio || "--";
}

function syncEngineTypeFromInstalled() {
  const installedEngine = engines.find((engine) => engine.id === $("engineId")?.value);
  updateGearRatio();
}

function syncLrHubFromRadios() {
  const selected = document.querySelector('input[name="lrHubChoice"]:checked');
  $("lrHub").value = normalizeLrHub(selected?.value);
}

function syncLrHubRadios() {
  const value = normalizeLrHub($("lrHub")?.value);
  $("lrHub").value = value;
  document.querySelectorAll('input[name="lrHubChoice"]').forEach((radio) => {
    radio.checked = radio.value === value;
  });
}

function valuesDiffer(current, prior) {
  return String(current || "").trim() !== String(prior || "").trim();
}

function comparisonRows(runA = {}, runB = {}) {
  const definitions = [
    ["Best Lap", "lapTime"],
    ["Start Position", "startPosition"],
    ["End Position", "endPosition"],
    ["Average RPM", "averageRpm"],
    ["Average Drops", "averageDrops"],
    ["Total Laps", "totalLaps"],
    ["LF Tire Temp", "lfTireTemp"],
    ["RF Tire Temp", "rfTireTemp"],
    ["LR Tire Temp", "lrTireTemp"],
    ["RR Tire Temp", "rrTireTemp"],
    ["Date", (session) => formatDate(session.date)],
    ["Time", "sessionTime"],
    ["Session Type", "type"],
    ["Track", (session) => trackName(session.trackId, session.track)],
    ["Installed Engine", (session) => engineName(session.engineId)],
    ["Driver", "driver"],
    ["Air Temp", "airTemp"],
    ["Humidity", "humidity"],
    ["Track Temp", "trackTemp"],
    ["Condition", "condition"],
    ["LF PSI", "lfPsi"],
    ["RF PSI", "rfPsi"],
    ["LR PSI", "lrPsi"],
    ["RR PSI", "rrPsi"],
    ["LF Offset", "lfOffset"],
    ["RF Offset", "rfOffset"],
    ["LR Offset", "lrOffset"],
    ["RR Offset", "rrOffset"],
    ["LF Spring", "lfSpringRate"],
    ["RF Spring", "rfSpringRate"],
    ["LR Spring", "lrSpringRate"],
    ["RR Spring", "rrSpringRate"],
    ["LF Shock", "lfShockValving"],
    ["RF Shock", "rfShockValving"],
    ["LR Shock", "lrShockValving"],
    ["LR Hub", "lrHub"],
    ["RR Shock", "rrShockValving"],
    ["Stagger", "stagger"],
    ["LF Weight", "lfWeight"],
    ["RF Weight", "rfWeight"],
    ["LR Weight", "lrWeight"],
    ["RR Weight", "rrWeight"],
    ["Front %", (session) => weightPercentages(session).front],
    ["Left %", (session) => weightPercentages(session).left],
    ["Right %", (session) => weightPercentages(session).right],
    ["Rear %", (session) => weightPercentages(session).rear],
    ["Cross %", (session) => weightPercentages(session).cross],
    ["LF Ride Height", "lfRideHeight"],
    ["RF Ride Height", "rfRideHeight"],
    ["LR Ride Height", "lrRideHeight"],
    ["RR Ride Height", "rrRideHeight"],
    ["LF Camber", "lfCamber"],
    ["RF Camber", "rfCamber"],
    ["LF Caster", "lfCaster"],
    ["RF Caster", "rfCaster"],
    ["LF Panhard", "lfPanhardHoles"],
    ["RF Panhard", "rfPanhardHoles"],
    ["LR Panhard", "lrPanhardHoles"],
    ["RR Panhard", "rrPanhardHoles"],
    ["Left Wheelbase", "leftWheelbase"],
    ["Right Wheelbase", "rightWheelbase"],
    ["Engine Gear", "engineGear"],
    ["Axle Gear", "axleGear"],
    ["Gear Ratio", "gearRatio"]
  ];

  return definitions.map(([label, accessor]) => {
    const runAValue = typeof accessor === "function" ? accessor(runA) : runA[accessor];
    const runBValue = typeof accessor === "function" ? accessor(runB) : runB[accessor];
    return { label, runA: runAValue || "", runB: runBValue || "" };
  });
}

function setupDiffItems(runA = {}, runB = {}) {
  return comparisonRows(runA, runB).filter((item) => valuesDiffer(item.runA, item.runB));
}

function diffValueText(value) {
  return String(value || "").trim() || "--";
}

function renderSetupDiffSummary(runA, runB) {
  const changes = setupDiffItems(runA, runB);
  if (!changes.length) {
    return `
      <div class="diff-summary">
        <h3>Setup Diff Summary</h3>
        <p>No data changes found between Run A and Run B.</p>
      </div>
    `;
  }

  const visibleChanges = changes.slice(0, 10);
  const remaining = changes.length - visibleChanges.length;
  return `
    <div class="diff-summary">
      <h3>Setup Diff Summary</h3>
      <p>${changes.length} ${changes.length === 1 ? "data change" : "data changes"} from Run A to Run B.</p>
      <ul class="diff-list">
        ${visibleChanges.map((change) => `
          <li>${escapeHtml(change.label)}: ${escapeHtml(diffValueText(change.runA))} -> ${escapeHtml(diffValueText(change.runB))}</li>
        `).join("")}
        ${remaining > 0 ? `<li>+${remaining} more in the detail rows</li>` : ""}
      </ul>
    </div>
  `;
}

function actionIcon(name) {
  const icons = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5-4.7-4.6 6.5-.9Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>'
  };
  return icons[name] || "";
}

function updatePositionVisibility() {
  const showPositions = isPositionSession($("type").value);
  $("startPositionField").classList.toggle("hidden", !showPositions);
  $("endPositionField").classList.toggle("hidden", !showPositions);
  if (!showPositions) {
    $("startPosition").value = "";
    $("endPosition").value = "";
  }
}

function cleanNumberValue(value, allowDecimal, allowNegative = false) {
  const raw = String(value);
  const sign = allowNegative && raw.trimStart().startsWith("-") ? "-" : "";
  if (allowDecimal) {
    const [whole, ...rest] = raw.replace(/,/g, ".").replace(/[^\d.]/g, "").split(".");
    return `${sign}${whole}${rest.length ? `.${rest.join("")}` : ""}`;
  }
  return `${sign}${raw.replace(/\D/g, "")}`;
}

function clampNumberInput(input) {
  if (input.value === "") return;
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    input.value = "";
    return;
  }
  const min = input.min === "" ? null : Number(input.min);
  const max = input.max === "" ? null : Number(input.max);
  if (min !== null && value < min) input.value = min;
  if (max !== null && value > max) input.value = max;
}

function constrainNumberInput(id, allowDecimal, allowNegative = false) {
  const input = $(id);
  if (!input) return;
  input.addEventListener("beforeinput", (event) => {
    if (!event.data) return;
    if (/[\d.,]/.test(event.data)) return;
    let cursorAtStart = input.value === "";
    try {
      cursorAtStart = input.selectionStart === 0;
    } catch {}
    if (allowNegative && event.data === "-" && !input.value.includes("-") && cursorAtStart) return;
    event.preventDefault();
  });
  input.addEventListener("input", () => {
    const cleaned = cleanNumberValue(input.value, allowDecimal, allowNegative);
    if (input.value !== cleaned) input.value = cleaned;
  });
  input.addEventListener("change", () => clampNumberInput(input));
}

function setupNumericInputs() {
  decimalNumericFields.forEach((id) => constrainNumberInput(id, true));
  signedDecimalNumericFields.forEach((id) => constrainNumberInput(id, true, true));
  integerNumericFields.forEach((id) => constrainNumberInput(id, false));
}

function setupCollapsibleSections() {
  document.querySelectorAll("#setupForm > fieldset").forEach((fieldset) => {
    const legend = fieldset.querySelector("legend");
    const title = legend?.textContent.trim() || "Section";
    legend?.remove();
    const section = document.createElement("details");
    section.className = "form-section";
    section.open = title !== "Start From Previous Setup";
    const summary = document.createElement("summary");
    summary.textContent = title;
    fieldset.before(section);
    section.append(summary, fieldset);
  });
}

function render() {
  renderCarOptions();
  renderTrackOptions();
  renderHistory();
  renderCars();
  renderEngines();
  renderTracks();
  renderCompare();
  renderTrackMemory();
}

function setInitialTab() {
  if (!cars.length || !engines.length) {
    setTab("cars");
    return;
  }
  setTab(tracks.length ? "sessions" : "tracks");
}

function renderHistory() {
  const term = $("searchInput").value.trim().toLowerCase();
  const carFilter = $("sessionCarFilter").value;
  const typeFilter = $("sessionTypeFilter").value;
  const list = $("sessionList");
  const filtered = sortedSessions().filter((session) => {
    const haystack = `${fields.map((field) => session[field]).join(" ")} ${carName(session.carId)} ${engineName(session.engineId)}`.toLowerCase();
    return haystack.includes(term) &&
      (!carFilter || session.carId === carFilter) &&
      (!typeFilter || session.type === typeFilter);
  });

  if (!filtered.length) {
    list.innerHTML = `<div class="empty">${sessions.length ? "No runs match that search." : "No setup entries yet. Add a sample or log your first run."}</div>`;
    return;
  }

  list.innerHTML = filtered.map((session) => {
    const baseline = isBaselineSession(session);
    return `
    <details class="session-card session-row ${escapeHtml(session.type || "").toLowerCase()} ${baseline ? "baseline" : ""}">
      <summary>
        <div class="session-line">
          <strong>${escapeHtml(formatDateShort(session))}</strong>
          <span>${escapeHtml(session.type || "Run")}</span>
          <span>${escapeHtml(carName(session.carId))}</span>
          <span>${escapeHtml(trackName(session.trackId, session.track))}${baseline ? " · Baseline" : ""}</span>
        </div>
        <div class="session-metrics">
          <span class="metric-pill">Lap ${escapeHtml(session.lapTime || "--")}</span>
          <span class="metric-pill">${escapeHtml(formatGear(session))}</span>
        </div>
      </summary>
      <div class="session-row-body">
        <p class="meta">${formatDateTime(session)} · ${escapeHtml(engineName(session.engineId))} · ${escapeHtml(session.driver || "Driver")}</p>
        <div class="card-grid">
          <div class="mini"><span>Cross</span><strong>${escapeHtml(weightPercentages(session).cross || "--")}</strong></div>
          <div class="mini"><span>Stagger</span><strong>${escapeHtml(session.stagger || "--")}</strong></div>
          <div class="mini"><span>RPM</span><strong>${escapeHtml(session.averageRpm || "--")}</strong></div>
          <div class="mini"><span>Drops</span><strong>${escapeHtml(session.averageDrops || "--")}</strong></div>
        </div>
        <p class="meta">${escapeHtml(session.handling || session.changes || "No handling notes yet.")}</p>
        <div class="card-actions">
          <button class="small-button" type="button" data-action="edit" data-id="${session.id}" aria-label="Edit session" title="Edit session">${actionIcon("edit")}</button>
          <button class="small-button" type="button" data-action="duplicate" data-id="${session.id}" aria-label="Duplicate session" title="Duplicate session">${actionIcon("copy")}</button>
          <button class="small-button ${baseline ? "active" : ""}" type="button" data-action="baseline" data-id="${session.id}" aria-label="${baseline ? "Baseline setup" : "Set baseline"}" title="${baseline ? "Baseline setup" : "Set baseline"}">${actionIcon("star")}</button>
          <button class="small-button" type="button" data-action="delete" data-id="${session.id}" aria-label="Delete session" title="Delete session">${actionIcon("trash")}</button>
        </div>
      </div>
    </details>
  `;
  }).join("");
}

function renderCars() {
  const list = $("carList");
  if (!cars.length) {
    list.innerHTML = `<div class="empty">No cars yet. Add one before logging sessions.</div>`;
    return;
  }

  list.innerHTML = sortedCars().map((car) => {
    const runCount = sessions.filter((session) => session.carId === car.id).length;
    return `
      <article class="session-card" data-car-card="${car.id}">
        <div class="session-head">
          <div>
            <h2 class="session-title">${escapeHtml(car.name)}</h2>
            <p class="meta">${escapeHtml([car.year, car.model].filter(Boolean).join(" · ") || "No model details")} · ${escapeHtml(car.currentEngineId ? engineName(car.currentEngineId) : "No engine installed")} · ${runCount} ${runCount === 1 ? "session" : "sessions"}</p>
          </div>
          <span class="pill">Car</span>
        </div>
        <p class="meta">${escapeHtml(car.notes || "No notes yet.")}</p>
        <div class="card-actions">
          <button class="small-button icon-only" type="button" data-car-action="edit" data-id="${car.id}" aria-label="Edit car" title="Edit car">${actionIcon("edit")}</button>
          <button class="small-button icon-only" type="button" data-car-action="delete" data-id="${car.id}" aria-label="Remove car" title="Remove car">${actionIcon("trash")}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderEngines() {
  const list = $("engineList");
  if (!engines.length) {
    list.innerHTML = `<div class="empty">No engines yet. Add one before logging sessions.</div>`;
    return;
  }

  list.innerHTML = sortedEngines().map((engine) => {
    const runCount = engineSessions(engine.id).length;
    const engineMaintenance = sortedMaintenanceEntries(engine.id);
    const latestMaintenance = engineMaintenance[0];
    const latestRefresh = latestEngineRefresh(engine.id);
    const totalLaps = engineTotalLaps(engine.id);
    const lapsSinceRefresh = engineLapsSinceRefresh(engine.id);
    const installedCar = cars.find((car) => car.currentEngineId === engine.id);
    return `
      <article class="session-card" data-engine-card="${engine.id}">
        <div class="session-head">
          <div>
            <h2 class="session-title">${escapeHtml(engine.name)}</h2>
            <p class="meta">${escapeHtml([engine.serial ? `ID ${engine.serial}` : "", engine.type, installedCar ? `Installed in ${installedCar.name}` : "Not installed", `${runCount} ${runCount === 1 ? "session" : "sessions"}`].filter(Boolean).join(" · "))}</p>
          </div>
          <span class="pill">Engine</span>
        </div>
        <div class="card-grid">
          <div class="mini"><span>Total Laps</span><strong>${escapeHtml(String(totalLaps))}</strong></div>
          <div class="mini"><span>Since Refresh</span><strong>${escapeHtml(String(lapsSinceRefresh))}</strong></div>
          <div class="mini"><span>Last Service</span><strong>${escapeHtml(latestMaintenance ? formatDate(latestMaintenance.date) : "--")}</strong></div>
          <div class="mini"><span>Last Refresh</span><strong>${escapeHtml(latestRefresh ? formatDate(latestRefresh.date) : "--")}</strong></div>
        </div>
        <p class="meta">${escapeHtml(engine.notes || "No notes yet.")}</p>
        <details class="maintenance-list">
          <summary>Maintenance (${engineMaintenance.length})</summary>
          ${engineMaintenance.length ? engineMaintenance.map((entry) => `
            <div class="maintenance-item">
              <div>
                <strong>${escapeHtml(entry.type)}</strong>
                <p>${escapeHtml(maintenanceMeta(entry))}</p>
                ${entry.notes ? `<p>${escapeHtml(entry.notes)}</p>` : ""}
              </div>
              <div class="card-actions">
                <button class="small-button icon-only" type="button" data-maintenance-action="edit" data-id="${entry.id}" aria-label="Edit maintenance" title="Edit maintenance">${actionIcon("edit")}</button>
                <button class="small-button icon-only" type="button" data-maintenance-action="delete" data-id="${entry.id}" aria-label="Remove maintenance" title="Remove maintenance">${actionIcon("trash")}</button>
              </div>
            </div>
          `).join("") : `<div class="empty">No maintenance entries yet.</div>`}
        </details>
        <div class="card-actions">
          <button class="small-button" type="button" data-engine-action="maintenance" data-id="${engine.id}">Add Maintenance</button>
          <button class="small-button icon-only" type="button" data-engine-action="edit" data-id="${engine.id}" aria-label="Edit engine" title="Edit engine">${actionIcon("edit")}</button>
          <button class="small-button icon-only" type="button" data-engine-action="delete" data-id="${engine.id}" aria-label="Remove engine" title="Remove engine">${actionIcon("trash")}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderTracks() {
  const list = $("trackList");
  if (!tracks.length) {
    list.innerHTML = `<div class="empty">No tracks yet. Add one or log a session with a new track.</div>`;
    return;
  }

  list.innerHTML = sortedTracks().map((track) => {
    const runCount = sessions.filter((session) => session.trackId === track.id || session.track === track.name).length;
    const details = [
      track.location,
      track.surface,
      track.length,
      track.banking
    ].filter(Boolean).join(" · ");
    const notes = [
      ["Layout", track.layoutNotes],
      ["Line", track.lineNotes],
      ["Surface", track.surfaceNotes],
      ["Tires/Stagger", track.tireNotes],
      ["Facility", track.facilityNotes],
      ["Notes", track.notes]
    ].filter(([, value]) => value);
    return `
      <article class="session-card" data-track-card="${track.id}">
        <div class="session-head">
          <div>
            <h2 class="session-title">${escapeHtml(track.name)}</h2>
            <p class="meta">${escapeHtml(details || "No profile details")} · ${runCount} ${runCount === 1 ? "session" : "sessions"}</p>
          </div>
          <span class="pill">Track</span>
        </div>
        <div class="engine-details meta">
          ${notes.length ? notes.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("") : `<p>No notes yet.</p>`}
        </div>
        <div class="card-actions">
          <button class="small-button icon-only" type="button" data-track-action="edit" data-id="${track.id}" aria-label="Edit track" title="Edit track">${actionIcon("edit")}</button>
          <button class="small-button icon-only" type="button" data-track-action="delete" data-id="${track.id}" aria-label="Remove track" title="Remove track">${actionIcon("trash")}</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderTrackMemory() {
  const content = $("trackMemoryContent");
  if (!content) return;

  const carId = $("carId")?.value || "";
  const trackId = $("trackId")?.value || "";
  const selectedTrack = trackName(trackId, $("track")?.value || "");
  if (!carId || !trackId) {
    content.className = "empty";
    content.innerHTML = "Choose a car and track to see prior setups.";
    return;
  }

  const memorySessions = currentTrackMemorySessions();
  if (!memorySessions.length) {
    content.className = "empty";
    content.innerHTML = `No prior setups to load for ${escapeHtml(carName(carId))} at ${escapeHtml(selectedTrack)}.`;
    return;
  }

  const baseline = baselineMemorySession(memorySessions);
  const fastest = bestLapMemorySession(memorySessions);
  const bestFinish = bestFinishMemorySession(memorySessions);
  const recent = memorySessions[0];
  content.className = "";
  content.innerHTML = `
    <div class="memory-grid">
      ${renderMemoryCard("Baseline", baseline, "Use Baseline", baseline ? `${formatDate(baseline.date)} - ${baseline.type || "Run"}` : "No baseline set")}
      ${renderMemoryCard("Fastest Lap", fastest, "Load Fastest", fastest ? `${fastest.lapTime}s` : "No lap time yet")}
      ${renderMemoryCard("Best Finish", bestFinish, "Load Finish", bestFinish ? `P${bestFinish.endPosition}` : "No finish yet")}
      ${renderMemoryCard("Most Recent", recent, "Load Recent", recent ? formatDate(recent.date) : "No run yet")}
    </div>
  `;
}

function renderMemoryCard(title, session, buttonLabel, value) {
  return `
    <div class="memory-card">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <strong>${escapeHtml(value || "--")}</strong>
        <p class="meta">${session ? escapeHtml(`${session.type || "Run"} - ${formatDate(session.date)}`) : "Not available"}</p>
      </div>
      <button class="small-button" type="button" data-memory-load="${session?.id || ""}" ${session ? "" : "disabled"}>${escapeHtml(buttonLabel)}</button>
    </div>
  `;
}

function renderCompare() {
  const box = $("compareBox");
  const carsWithRuns = sortedCars().filter((car) => sessions.some((session) => session.carId === car.id));
  if (!carsWithRuns.length) {
    box.innerHTML = `
      <div class="compare-card">
        <h2 class="session-title">Compare Runs</h2>
        <p class="meta">Add setup entries for a car to compare runs.</p>
      </div>
    `;
    return;
  }

  if (!carsWithRuns.some((car) => car.id === compareCarId)) compareCarId = carsWithRuns[0].id;
  const carRuns = sortedSessions().filter((session) => session.carId === compareCarId);
  const defaultRunBId = carRuns[0]?.id || "";
  const defaultBaselineId = defaultRunBId ? baselineForSession(carRuns[0]) : "";
  if (!carRuns.some((session) => session.id === compareCurrentId)) {
    compareCurrentId = carRuns.some((session) => session.id === defaultBaselineId) ? defaultBaselineId : defaultRunBId;
  }
  let currentIndex = carRuns.findIndex((session) => session.id === compareCurrentId);
  if (currentIndex < 0) currentIndex = 0;
  const runA = carRuns[currentIndex];
  const comparisonRuns = carRuns.filter((session) => session.id !== compareCurrentId);
  if (!comparisonRuns.some((session) => session.id === comparePreviousId)) {
    comparePreviousId = comparisonRuns.some((session) => session.id === defaultRunBId) ? defaultRunBId : comparisonRuns[0]?.id || "";
  }

  const runASelected = carRuns.find((session) => session.id === compareCurrentId);
  const runBSelected = carRuns.find((session) => session.id === comparePreviousId);
  const baselineId = runBSelected ? baselineForSession(runBSelected) : runA ? baselineForSession(runA) : "";
  const baselineSession = baselineId ? carRuns.find((session) => session.id === baselineId) : null;
  const compareHint = !runASelected ? "" :
    baselineSession && runASelected.id === baselineSession.id ? `Run A is the baseline for ${trackName(runBSelected?.trackId, runBSelected?.track || runASelected.track)}.` :
    baselineSession && runBSelected?.id === baselineSession.id ? "Run B is the baseline. Choose the baseline in Run A to use it as the anchor." :
    baselineSession ? `A baseline exists for ${trackName(runBSelected?.trackId, runBSelected?.track || runASelected.track)}. Choose the baseline option in Run A to use it.` :
    `No baseline is set for ${trackName(runASelected.trackId, runASelected.track)} with this car yet. Use the star button on a session to set one.`;
  const controls = `
    <div class="compare-controls">
      <label class="wide">Car
        <select id="compareCar">
          ${carsWithRuns.map((car) => `<option value="${car.id}" ${car.id === compareCarId ? "selected" : ""}>${escapeHtml(car.name)}</option>`).join("")}
        </select>
      </label>
      <label>Run A
        <select id="compareCurrent">
          ${carRuns.map((session) => `<option value="${session.id}" ${session.id === compareCurrentId ? "selected" : ""}>${escapeHtml(`${isBaselineSession(session) ? "Baseline - " : ""}${compareLabel(session)}`)}</option>`).join("")}
        </select>
      </label>
      <label>Run B
        <select id="comparePrevious">
          ${comparisonRuns.map((session) => `<option value="${session.id}" ${session.id === comparePreviousId ? "selected" : ""}>${escapeHtml(`${isBaselineSession(session) ? "Baseline - " : ""}${compareLabel(session)}`)}</option>`).join("")}
        </select>
      </label>
      <p class="compare-hint">${escapeHtml(compareHint)}</p>
    </div>
  `;

  if (!runASelected || !runBSelected) {
    box.innerHTML = `
      <div class="compare-card">
        <h2 class="session-title">Compare Runs</h2>
        ${controls}
        <p class="meta">This car needs at least two runs before comparison is useful.</p>
      </div>
    `;
    return;
  }

  const rows = comparisonRows(runASelected, runBSelected);

  box.innerHTML = `
    <div class="compare-card">
      <h2 class="session-title">${escapeHtml(carName(compareCarId))} Comparison</h2>
      ${controls}
      <p class="meta">Run A: ${formatDateTime(runASelected)} &middot; Run B: ${formatDateTime(runBSelected)}</p>
      ${renderSetupDiffSummary(runASelected, runBSelected)}
      <div class="compare-row compare-heading">
        <span>Data Point</span>
        <strong>Run A</strong>
        <strong>Run B</strong>
      </div>
      ${rows.map(({ label, runA, runB }) => `
        <div class="compare-row ${valuesDiffer(runA, runB) ? "changed" : ""}">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(runA || "--")}</strong>
          <strong>${escapeHtml(runB || "--")}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function fillForm(session = {}) {
  $("entryId").value = session.id || "";
  session = normalizeSession(session);
  renderEngineOptions(session.engineId);
  fields.forEach((field) => {
    $(field).value = session[field] || "";
  });
  syncLrHubRadios();
  renderTrackOptions();
  $("trackId").value = tracks.some((track) => track.id === session.trackId) ? session.trackId : "";
  $("track").value = trackName($("trackId").value, session.track);
  renderEngineOptions(session.engineId);
  if (!$("date").value) $("date").value = localDateValue();
  updateWeightCalculations();
  updateGearRatio();
  updatePositionVisibility();
  renderTrackMemory();
  saveSessionDraft();
}

function readForm() {
  syncEngineTypeFromInstalled();
  syncLrHubFromRadios();
  updateGearRatio();
  const session = {
    id: $("entryId").value || crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  fields.forEach((field) => {
    session[field] = $(field).value.trim();
  });
  session.trackId = $("trackId").value;
  session.track = trackName(session.trackId, "");
  return normalizeSession(session);
}

function draftValues() {
  const draft = {
    entryId: $("entryId").value || "",
    savedAt: new Date().toISOString()
  };
  fields.forEach((field) => {
    draft[field] = $(field).value || "";
  });
  return draft;
}

function isMeaningfulDraft(draft = {}) {
  const ignored = new Set(["savedAt", "date", "sessionTime", "type", "gearRatio"]);
  return Object.entries(draft).some(([key, value]) => !ignored.has(key) && String(value || "").trim());
}

function saveSessionDraft() {
  if (suppressDraftSave) return;
  const draft = draftValues();
  if (isMeaningfulDraft(draft)) {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } else {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function clearSessionDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

function restoreSessionDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!isMeaningfulDraft(draft)) return false;
    suppressDraftSave = true;
    $("entryId").value = draft.entryId || "";
    fields.forEach((field) => {
      $(field).value = draft[field] || "";
    });
    renderTrackOptions();
    $("trackId").value = tracks.some((track) => track.id === draft.trackId) ? draft.trackId : "";
    $("track").value = trackName($("trackId").value, draft.track);
    renderEngineOptions(draft.engineId || "");
    updateWeightCalculations();
    updateGearRatio();
    updatePositionVisibility();
    renderTrackMemory();
    suppressDraftSave = false;
    showToast("Restored unsaved setup draft.");
    return true;
  } catch {
    clearSessionDraft();
    suppressDraftSave = false;
    return false;
  }
}

function readSessionSetupContext() {
  return {
    trackId: $("trackId")?.value || "",
    carId: $("carId")?.value || "",
    engineId: $("engineId")?.value || "",
    driver: $("driver")?.value || "",
    type: $("type")?.value || "Practice"
  };
}

function restoreSessionSetupContext(context = {}) {
  if (tracks.some((track) => track.id === context.trackId)) {
    $("trackId").value = context.trackId;
  }
  $("track").value = trackName($("trackId").value, "");
  if (cars.some((car) => car.id === context.carId)) {
    $("carId").value = context.carId;
  }
  renderEngineOptions(context.engineId);
  $("driver").value = context.driver || "";
  $("type").value = ["Practice", "Qualifying", "Heat", "Main"].includes(context.type) ? context.type : "Practice";
}

function clearForm({ clearDraft = true } = {}) {
  const sessionSetup = readSessionSetupContext();
  suppressDraftSave = true;
  $("setupForm").reset();
  $("entryId").value = "";
  restoreSessionSetupContext(sessionSetup);
  $("lrHub").value = "Locked";
  syncLrHubRadios();
  $("date").value = localDateValue();
  $("sessionTime").value = new Date().toTimeString().slice(0, 5);
  updateWeightCalculations();
  updateGearRatio();
  updatePositionVisibility();
  renderTrackMemory();
  suppressDraftSave = false;
  if (clearDraft) clearSessionDraft();
}

function fillCarForm(car = {}) {
  $("carEditId").value = car.id || "";
  $("carNameInput").value = car.name || "";
  $("carModel").value = car.model || "";
  $("carYear").value = car.year || "";
  renderCarEngineOptions(car.currentEngineId || "");
  $("carNotes").value = car.notes || "";
}

function readCarForm() {
  return normalizeCar({
    id: $("carEditId").value || crypto.randomUUID(),
    name: $("carNameInput").value,
    model: $("carModel").value,
    year: $("carYear").value,
    currentEngineId: $("carCurrentEngineId").value,
    notes: $("carNotes").value
  });
}

function clearCarForm() {
  if ($("carFormHost") && $("carForm")) $("carFormHost").appendChild($("carForm"));
  $("carForm").reset();
  $("carEditId").value = "";
  $("carForm").classList.add("hidden");
}

function showCarForm() {
  $("carForm").classList.remove("hidden");
}

function editCar(id) {
  const car = cars.find((item) => item.id === id);
  if (!car) return;
  fillCarForm(car);
  setTab("cars");
  document.querySelector(`[data-car-card="${id}"]`)?.after($("carForm"));
  showCarForm();
  $("carNameInput").focus({ preventScroll: true });
}

function deleteCar(id) {
  const car = cars.find((item) => item.id === id);
  if (!car) return;
  const runCount = sessions.filter((session) => session.carId === id).length;
  if (runCount) {
    showToast("Cars with sessions cannot be removed.");
    return;
  }
  if (!confirm(`Remove ${car.name}?`)) return;
  cars = cars.filter((item) => item.id !== id);
  saveCars();
  clearCarForm();
  render();
  showToast("Car removed.");
}

function addEngine() {
  clearEngineForm();
  setTab("cars");
  document.querySelector("#engineFormHost").appendChild($("engineForm"));
  showEngineForm();
  $("engineNameInput").focus({ preventScroll: true });
}

function fillEngineForm(engine = {}) {
  $("engineEditId").value = engine.id || "";
  $("engineNameInput").value = engine.name || "";
  $("engineTypeInput").value = engine.type || "Honda 120";
  $("engineSerial").value = engine.serial || "";
  $("engineNotes").value = engine.notes || "";
}

function readEngineForm() {
  return normalizeEngine({
    id: $("engineEditId").value || crypto.randomUUID(),
    name: $("engineNameInput").value,
    type: $("engineTypeInput").value,
    serial: $("engineSerial").value,
    notes: $("engineNotes").value
  });
}

function clearEngineForm() {
  if ($("engineFormHost") && $("engineForm")) $("engineFormHost").appendChild($("engineForm"));
  $("engineForm").reset();
  $("engineEditId").value = "";
  $("engineForm").classList.add("hidden");
}

function showEngineForm() {
  $("engineForm").classList.remove("hidden");
}

function editEngine(id) {
  const engine = engines.find((item) => item.id === id);
  if (!engine) return;
  fillEngineForm(engine);
  setTab("cars");
  document.querySelector(`[data-engine-card="${id}"]`)?.after($("engineForm"));
  showEngineForm();
  $("engineNameInput").focus({ preventScroll: true });
}

function selectEngine(id) {
  const engine = engines.find((item) => item.id === id);
  if (!engine) return;
  renderEngineOptions(id);
  setTab("sessions");
  $("engineId").focus({ preventScroll: true });
}

function deleteEngine(id) {
  const engine = engines.find((item) => item.id === id);
  if (!engine) return;
  const runCount = sessions.filter((session) => session.engineId === id).length;
  const maintenanceCount = maintenanceEntries.filter((entry) => entry.engineId === id).length;
  const installedCar = cars.find((car) => car.currentEngineId === id);
  if (installedCar) {
    showToast(`Remove ${engine.name} from ${installedCar.name} before deleting it.`);
    return;
  }
  if (runCount) {
    showToast("Engines with sessions cannot be removed.");
    return;
  }
  if (maintenanceCount) {
    showToast("Engines with maintenance entries cannot be removed.");
    return;
  }
  if (!confirm(`Remove ${engine.name}?`)) return;
  engines = engines.filter((item) => item.id !== id);
  saveEngines();
  clearEngineForm();
  render();
  showToast("Engine removed.");
}

function addMaintenance(engineId) {
  const engine = engines.find((item) => item.id === engineId);
  if (!engine) return;
  clearMaintenanceForm();
  $("maintenanceEngineId").value = engine.id;
  $("maintenanceDate").value = localDateValue();
  setTab("cars");
  document.querySelector(`[data-engine-card="${engine.id}"]`)?.after($("maintenanceForm"));
  showMaintenanceForm();
  $("maintenanceType").focus({ preventScroll: true });
}

function fillMaintenanceForm(entry = {}) {
  $("maintenanceEditId").value = entry.id || "";
  $("maintenanceEngineId").value = entry.engineId || "";
  $("maintenanceDate").value = entry.date || localDateValue();
  $("maintenanceType").value = normalizeMaintenanceType(entry.type);
  $("maintenancePerformedBy").value = entry.performedBy || "";
  $("maintenanceCost").value = entry.cost || "";
  $("maintenanceNotes").value = entry.notes || "";
}

function readMaintenanceForm() {
  return normalizeMaintenanceEntry({
    id: $("maintenanceEditId").value || crypto.randomUUID(),
    engineId: $("maintenanceEngineId").value,
    date: $("maintenanceDate").value,
    type: $("maintenanceType").value,
    performedBy: $("maintenancePerformedBy").value,
    cost: $("maintenanceCost").value,
    notes: $("maintenanceNotes").value
  });
}

function clearMaintenanceForm() {
  if ($("maintenanceFormHost") && $("maintenanceForm")) $("maintenanceFormHost").appendChild($("maintenanceForm"));
  $("maintenanceForm").reset();
  $("maintenanceEditId").value = "";
  $("maintenanceEngineId").value = "";
  $("maintenanceDate").value = localDateValue();
  $("maintenanceType").value = "Oil Change";
  $("maintenanceForm").classList.add("hidden");
}

function showMaintenanceForm() {
  $("maintenanceForm").classList.remove("hidden");
}

function editMaintenance(id) {
  const entry = maintenanceEntries.find((item) => item.id === id);
  if (!entry) return;
  fillMaintenanceForm(entry);
  setTab("cars");
  document.querySelector(`[data-engine-card="${entry.engineId}"]`)?.after($("maintenanceForm"));
  showMaintenanceForm();
  $("maintenanceType").focus({ preventScroll: true });
}

function deleteMaintenance(id) {
  const entry = maintenanceEntries.find((item) => item.id === id);
  if (!entry) return;
  if (!confirm(`Remove ${entry.type} from ${formatDate(entry.date)}?`)) return;
  maintenanceEntries = maintenanceEntries.filter((item) => item.id !== id);
  saveMaintenanceEntries();
  clearMaintenanceForm();
  renderEngines();
  showToast("Maintenance entry removed.");
}

function addTrack() {
  clearTrackForm();
  setTab("tracks");
  document.querySelector("#trackFormHost").appendChild($("trackForm"));
  showTrackForm();
  $("trackNameInput").focus({ preventScroll: true });
}

function fillTrackForm(track = {}) {
  $("trackEditId").value = track.id || "";
  $("trackNameInput").value = track.name || "";
  $("trackLocation").value = track.location || "";
  $("trackSurface").value = track.surface || "";
  $("trackLength").value = track.length || "";
  $("trackBanking").value = track.banking || "";
  $("trackLayoutNotes").value = track.layoutNotes || "";
  $("trackLineNotes").value = track.lineNotes || "";
  $("trackSurfaceNotes").value = track.surfaceNotes || "";
  $("trackTireNotes").value = track.tireNotes || "";
  $("trackFacilityNotes").value = track.facilityNotes || "";
  $("trackNotes").value = track.notes || "";
}

function readTrackForm() {
  return normalizeTrack({
    id: $("trackEditId").value || crypto.randomUUID(),
    name: $("trackNameInput").value,
    location: $("trackLocation").value,
    surface: $("trackSurface").value,
    length: $("trackLength").value,
    banking: $("trackBanking").value,
    layoutNotes: $("trackLayoutNotes").value,
    lineNotes: $("trackLineNotes").value,
    surfaceNotes: $("trackSurfaceNotes").value,
    tireNotes: $("trackTireNotes").value,
    facilityNotes: $("trackFacilityNotes").value,
    notes: $("trackNotes").value
  });
}

function clearTrackForm() {
  if ($("trackFormHost") && $("trackForm")) $("trackFormHost").appendChild($("trackForm"));
  $("trackForm").reset();
  $("trackEditId").value = "";
  $("trackForm").classList.add("hidden");
}

function showTrackForm() {
  $("trackForm").classList.remove("hidden");
}

function editTrack(id) {
  const track = tracks.find((item) => item.id === id);
  if (!track) return;
  fillTrackForm(track);
  setTab("tracks");
  document.querySelector(`[data-track-card="${id}"]`)?.after($("trackForm"));
  showTrackForm();
  $("trackNameInput").focus({ preventScroll: true });
}

function deleteTrack(id) {
  const track = tracks.find((item) => item.id === id);
  if (!track) return;
  const runCount = sessions.filter((session) => session.trackId === id || session.track === track.name).length;
  if (runCount) {
    showToast("Tracks with sessions cannot be removed.");
    return;
  }
  if (!confirm(`Remove ${track.name}?`)) return;
  tracks = tracks.filter((item) => item.id !== id);
  saveTracks();
  clearTrackForm();
  render();
  showToast("Track removed.");
}

function editSession(id) {
  const session = sessions.find((item) => item.id === id);
  if (!session) return;
  fillForm(session);
  setTab("sessions");
  $("trackId").focus({ preventScroll: true });
}

function duplicateSession(id) {
  const session = sessions.find((item) => item.id === id);
  if (!session) return;
  startFromSession(session);
}

function startFromSession(session, toastMessage = "Copied setup into a new entry.") {
  fillForm({
    ...session,
    id: "",
    date: localDateValue(),
    sessionTime: new Date().toTimeString().slice(0, 5),
    type: "Practice",
    lapTime: "",
    startPosition: "",
    endPosition: "",
    averageRpm: "",
    averageDrops: "",
    totalLaps: "",
    handling: "",
    changes: "",
    nextTime: session.nextTime || ""
  });
  setTab("sessions");
  $("trackId").focus({ preventScroll: true });
  if (toastMessage) showToast(toastMessage);
}

function startFromTrackMemory(session) {
  const conditions = {
    date: $("date").value,
    sessionTime: $("sessionTime").value,
    airTemp: $("airTemp").value,
    humidity: $("humidity").value,
    trackTemp: $("trackTemp").value,
    condition: $("condition").value
  };
  startFromSession(session, "");
  Object.entries(conditions).forEach(([field, value]) => {
    $(field).value = value;
  });
  saveSessionDraft();
  showToast("Loaded track setup. Conditions were kept.");
}

function setBaselineSession(id) {
  const session = sessions.find((item) => item.id === id);
  if (!session) return;
  const key = sessionBaselineKey(session);
  if (!key) return showToast("Choose a car and track before setting a baseline.");
  baselines[key] = id;
  saveBaselines();
  renderHistory();
  renderCompare();
  renderTrackMemory();
  showToast("Baseline setup saved for this car and track.");
}

function deleteSession(id) {
  const session = sessions.find((item) => item.id === id);
  if (!session) return;
  const label = `${session.track || "this setup"} on ${formatDate(session.date)}`;
  if (!confirm(`Delete ${label}?`)) return;
  sessions = sessions.filter((item) => item.id !== id);
  Object.keys(baselines).forEach((key) => {
    if (baselines[key] === id) delete baselines[key];
  });
  saveSessions();
  saveBaselines();
  render();
  showToast("Setup deleted.");
}

function seedSamples() {
  if (sessions.length && !confirm("Add sample entries to your existing log?")) return;
  const carSeeds = [
    { name: "Blue 7", model: "Nervo Coggin", year: "2024", notes: "Baseline Honda car. Good neutral reference setup.", driver: "Riley", engine: "Honda 120", primaryEngine: "Honda A", backupEngine: "Honda Backup" },
    { name: "Red 21", model: "Bullrider", year: "2022", notes: "Backup chassis. Likes a little more stagger on hot tracks.", driver: "Avery", engine: "Briggs & Stratton Animal", primaryEngine: "Briggs Red", backupEngine: "Briggs Spare" },
    { name: "Silver 4", model: "Stanley", year: "2023", notes: "Newer DECO package. Watch entry balance with fresh right sides.", driver: "Jordan", engine: "DECO", primaryEngine: "DECO Silver", backupEngine: "DECO Backup" }
  ];
  const tracks = ["River Bend Speedway", "Canyon Rim QMA", "Oak Valley Raceway", "Blue Mountain"];
  const runTypes = ["Practice", "Qualifying", "Heat", "Main"];
  const sample = [];

  carSeeds.forEach((seed, carIndex) => {
    const car = getOrCreateCar(seed.name);
    car.model = seed.model;
    car.year = seed.year;
    car.notes = seed.notes;
    const primaryEngine = getOrCreateEngine(seed.primaryEngine, seed.engine);
    primaryEngine.serial = `${seed.name.replaceAll(" ", "")}-P`;
    primaryEngine.lastMaintenance = "2026-05-20";
    primaryEngine.notes = "Normal race engine. Oil changed after every race weekend.";
    const backupEngine = getOrCreateEngine(seed.backupEngine, seed.engine);
    backupEngine.serial = `${seed.name.replaceAll(" ", "")}-B`;
    backupEngine.lastMaintenance = "2026-04-28";
    backupEngine.notes = "Backup engine installed when diagnosing primary package.";
    car.currentEngineId = primaryEngine.id;
    [
      { engineId: primaryEngine.id, date: "2026-04-15", type: "Full Refresh", performedBy: "Builder", cost: "450", notes: "Fresh builder refresh before spring races." },
      { engineId: primaryEngine.id, date: primaryEngine.lastMaintenance, type: "Oil Change", performedBy: "Team", cost: "12", notes: "Oil changed and plug checked after race weekend." },
      { engineId: backupEngine.id, date: backupEngine.lastMaintenance, type: "Cleaning / Inspection", performedBy: "Team", cost: "", notes: "Backup engine inspected and staged for diagnosis runs." }
    ].forEach((entry) => {
      if (!maintenanceEntries.some((existing) => existing.engineId === entry.engineId && existing.date === entry.date && existing.type === entry.type)) {
        maintenanceEntries.push(normalizeMaintenanceEntry(entry));
      }
    });

    runTypes.forEach((type, runIndex) => {
      const installedEngine = runIndex === 2 ? backupEngine : primaryEngine;
      const date = new Date();
      date.setDate(date.getDate() - (16 - carIndex * 2 - runIndex * 3));
      const engineGear = 35 + carIndex;
      const axleGear = 28 + runIndex + carIndex;
      const ratio = ((axleGear / engineGear) * (GEARBOX_RATIOS[installedEngine.type] || 6.14)).toFixed(2);
      const isRace = isPositionSession(type);
      const track = getOrCreateTrack(tracks[(carIndex + runIndex) % tracks.length]);
      track.location = ["Riverside, CA", "Mesa, AZ", "Oak Valley, CA", "Bend, OR"][(carIndex + runIndex) % tracks.length];
      track.surface = ["Dirt", "Asphalt", "Concrete", "Dirt"][(carIndex + runIndex) % tracks.length];
      track.length = ["1/20 mile", "880 ft", "1/16 mile", "1/20 mile"][(carIndex + runIndex) % tracks.length];
      track.banking = ["Slight", "Medium", "Flat", "Slight"][(carIndex + runIndex) % tracks.length];
      track.layoutNotes ||= "Tight entry with a longer exit radius.";
      track.lineNotes ||= "Bottom is quickest early; middle comes in after heats.";
      track.surfaceNotes ||= "Track tends to slick off on exit as the day warms up.";
      track.tireNotes ||= "Watch right-side growth and stagger after longer runs.";
      track.facilityNotes ||= "Scales near tech. Staging backs up before mains.";
      const sampleSession = {
      id: crypto.randomUUID(),
      createdAt: new Date(Date.now() + sample.length * 1000).toISOString(),
      track: track.name,
      trackId: track.id,
      date: localDateValue(date),
      sessionTime: `${10 + runIndex}:${runIndex % 2 ? "45" : "15"}`,
      type,
      engine: installedEngine.type,
      engineId: installedEngine.id,
      driver: seed.driver,
      carId: car.id,
      airTemp: String(74 + carIndex * 3 + runIndex),
      humidity: String(42 + carIndex * 4 + runIndex),
      trackTemp: String(90 + runIndex * 4),
      condition: ["Green early", "Rubbered bottom", "Dusty exit", "Fast middle"][(carIndex + runIndex) % 4],
      lfPsi: (9.5 + runIndex * 0.2).toFixed(1),
      lfOffset: (0.25 + carIndex * 0.02).toFixed(2),
      lfSpringRate: String(145 + carIndex * 5),
      lfShockValving: "3 / 5",
      rfPsi: (12.0 + runIndex * 0.3).toFixed(1),
      rfOffset: (0.38 + runIndex * 0.02).toFixed(2),
      rfSpringRate: String(170 + carIndex * 5),
      rfShockValving: runIndex > 1 ? "4 / 7" : "4 / 6",
      lrPsi: (10.0 + carIndex * 0.2).toFixed(1),
      lrOffset: (0.18 + carIndex * 0.02).toFixed(2),
      lrSpringRate: String(125 + carIndex * 5),
      lrShockValving: "3 / 4",
      lrHub: runIndex === 2 ? "Ratchet" : "Locked",
      rrPsi: (11.8 + runIndex * 0.2).toFixed(1),
      rrOffset: (0.32 + runIndex * 0.02).toFixed(2),
      rrSpringRate: String(150 + carIndex * 5),
      rrShockValving: "4 / 5",
      stagger: (1.35 + runIndex * 0.15 + carIndex * 0.05).toFixed(2),
      tireNotes: runIndex > 1 ? "Fresh right sides" : "Older practice set",
      lfWeight: String(70 + carIndex + runIndex),
      rfWeight: String(64 + carIndex),
      lrWeight: String(78 + runIndex),
      rrWeight: String(67 + carIndex),
      lfRideHeight: "3.00",
      rfRideHeight: "3.25",
      lrRideHeight: "3.00",
      rrRideHeight: "3.25",
      lfCamber: "1.0",
      rfCamber: "-2.5",
      lfCaster: "5.0",
      rfCaster: "7.0",
      lfPanhardHoles: String(2 + carIndex),
      rfPanhardHoles: String(2 + runIndex % 2),
      lrPanhardHoles: String(3 + carIndex),
      rrPanhardHoles: String(3 + runIndex % 2),
      leftWheelbase: (41.20 + carIndex * 0.05).toFixed(2),
      rightWheelbase: (41.00 + runIndex * 0.02).toFixed(2),
      engineGear: String(engineGear),
      axleGear: String(axleGear),
      gearRatio: ratio,
      lapTime: (8.95 - carIndex * 0.07 - runIndex * 0.06).toFixed(3),
      startPosition: isRace ? String(4 - Math.min(runIndex, 3)) : "",
      endPosition: isRace ? String(Math.max(1, 4 - runIndex - carIndex)) : "",
      averageRpm: String(5920 + carIndex * 80 + runIndex * 70),
      averageDrops: String(430 - runIndex * 15 - carIndex * 10),
      totalLaps: String(type === "Main" ? 30 : type === "Heat" ? 20 : type === "Qualifying" ? 6 : 16),
      lfTireTemp: String(96 + carIndex * 2 + runIndex * 3),
      rfTireTemp: String(103 + carIndex * 2 + runIndex * 4),
      lrTireTemp: String(94 + carIndex * 2 + runIndex * 3),
      rrTireTemp: String(101 + carIndex * 2 + runIndex * 4),
      handling: ["Tight center, good drive off.", "Free on entry, rotates well.", "Balanced through center.", "Slight push late in run."][(carIndex + runIndex) % 4],
      changes: runIndex === 2 ? "Backup engine installed; adjusted stagger and checked gear ratio." : runIndex ? "Adjusted stagger and checked gear ratio." : "Baseline setup for the day.",
      nextTime: runIndex === 3 ? "Save as current baseline." : "Watch entry balance and tire growth."
      };
      if (runIndex === 0) baselines[sessionBaselineKey(sampleSession)] = sampleSession.id;
      sample.push(sampleSession);
    });
  });
  saveCars();
  saveEngines();
  saveMaintenanceEntries();
  saveTracks();
  saveBaselines();
  sessions = [...sessions, ...sample];
  saveSessions();
  render();
  showToast("Sample garage and 12 sessions added.");
}

function exportJson() {
  download(`setup-log-${dateStamp()}.json`, JSON.stringify({ cars, engines, maintenanceEntries, tracks, baselines, sessions }, null, 2), "application/json");
}

function exportCsv() {
  const header = fields.map((field) => field === "carId" ? "car" : field === "engineId" ? "installedEngine" : field === "trackId" ? "trackEntity" : field);
  const rows = sessions.map((session) => fields.map((field) => {
    if (field === "engineId") return csvCell(engineName(session.engineId));
    if (field === "trackId") return csvCell(trackName(session.trackId, session.track));
    return csvCell(field === "carId" ? carName(session.carId) : session[field]);
  }).join(","));
  download(`setup-log-${dateStamp()}.csv`, [header.join(","), ...rows].join("\n"), "text/csv");
}

function importJson(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      const importedSessions = Array.isArray(imported) ? imported : imported.sessions;
      if (!Array.isArray(importedSessions)) throw new Error("Expected setup sessions");
      if (Array.isArray(imported.cars)) {
        imported.cars.forEach((car) => {
          if (!car?.name) return;
          if (!cars.some((existing) => existing.id === car.id || existing.name.toLowerCase() === car.name.toLowerCase())) {
            cars.push(normalizeCar(car));
          }
        });
        saveCars();
      }
      if (Array.isArray(imported.engines)) {
        imported.engines.forEach((engine) => {
          if (!engine?.name) return;
          if (!engines.some((existing) => existing.id === engine.id || existing.name.toLowerCase() === engine.name.toLowerCase())) {
            engines.push(normalizeEngine(engine));
          }
        });
        saveEngines();
      }
      const importedMaintenance = Array.isArray(imported.maintenanceEntries) ? imported.maintenanceEntries : Array.isArray(imported.engineMaintenance) ? imported.engineMaintenance : [];
      importedMaintenance.forEach((entry) => {
        const normalized = normalizeMaintenanceEntry(entry);
        if (!normalized.engineId) return;
        if (!maintenanceEntries.some((existing) => existing.id === normalized.id)) {
          maintenanceEntries.push(normalized);
        }
      });
      if (importedMaintenance.length) saveMaintenanceEntries();
      if (Array.isArray(imported.tracks)) {
        imported.tracks.forEach((track) => {
          if (!track?.name) return;
          if (!tracks.some((existing) => existing.id === track.id || existing.name.toLowerCase() === track.name.toLowerCase())) {
            tracks.push(normalizeTrack(track));
          }
        });
        saveTracks();
      }
      if (imported.baselines && typeof imported.baselines === "object" && !Array.isArray(imported.baselines)) {
        baselines = { ...baselines, ...imported.baselines };
        saveBaselines();
      }
      sessions = importedSessions.map((session) => normalizeSession({
        ...session,
        id: session.id || crypto.randomUUID(),
        createdAt: session.createdAt || new Date().toISOString()
      }));
      saveSessions();
      render();
      showToast("Setup log imported.");
    } catch {
      showToast("That JSON file was not a setup log.");
    }
  };
  reader.readAsText(file);
}

function wipeLog() {
  if (!sessions.length && !cars.length && !engines.length) return showToast("The log is already empty.");
  if (!confirm("Wipe all cars and setup entries from this browser? Export first if you need a backup.")) return;
  sessions = [];
  cars = [];
  engines = [];
  maintenanceEntries = [];
  tracks = [];
  baselines = {};
  saveSessions();
  saveCars();
  saveEngines();
  saveMaintenanceEntries();
  saveTracks();
  saveBaselines();
  render();
  clearForm();
  showToast("Setup log wiped.");
}

function download(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value = "") {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function formatDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function maintenanceMeta(entry) {
  return [
    formatDate(entry.date),
    entry.performedBy,
    entry.cost ? `$${entry.cost}` : ""
  ].filter(Boolean).join(" - ");
}

function formatDateTime(session) {
  const date = formatDate(session.date);
  if (!session.sessionTime) return date;
  const time = new Date(`${session.date || dateStamp()}T${session.sessionTime}`).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit"
  });
  return `${date} ${time}`;
}

function formatDateShort(session) {
  if (!session.date) return "No date";
  const date = new Date(`${session.date}T12:00:00`);
  const day = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return session.sessionTime ? `${day} ${session.sessionTime}` : day;
}

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateStamp() {
  return localDateValue();
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

$("searchInput").addEventListener("input", renderHistory);
$("sessionCarFilter").addEventListener("change", renderHistory);
$("sessionTypeFilter").addEventListener("change", renderHistory);
$("setupForm").addEventListener("input", saveSessionDraft);
$("setupForm").addEventListener("change", saveSessionDraft);
$("trackId").addEventListener("change", () => {
  $("track").value = trackName($("trackId").value, "");
  renderTrackMemory();
});
$("seedButton").addEventListener("click", seedSamples);
$("showCarFormButton").addEventListener("click", addCar);
$("showEngineFormButton").addEventListener("click", addEngine);
$("showTrackFormButton").addEventListener("click", addTrack);
$("clearButton").addEventListener("click", clearForm);
$("clearCarButton").addEventListener("click", clearCarForm);
$("clearEngineButton").addEventListener("click", clearEngineForm);
$("clearMaintenanceButton").addEventListener("click", clearMaintenanceForm);
$("clearTrackButton").addEventListener("click", clearTrackForm);
$("type").addEventListener("change", updatePositionVisibility);
document.querySelectorAll('input[name="lrHubChoice"]').forEach((radio) => {
  radio.addEventListener("change", syncLrHubFromRadios);
});
$("exportJson").addEventListener("click", exportJson);
$("exportCsv").addEventListener("click", exportCsv);
$("importButton").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (event) => importJson(event.target.files[0]));
$("wipeButton").addEventListener("click", wipeLog);
$("compareBox").addEventListener("change", (event) => {
  if (event.target.id === "compareCar") {
    compareCarId = event.target.value;
    compareCurrentId = "";
    comparePreviousId = "";
    renderCompare();
  }
  if (event.target.id === "compareCurrent") {
    compareCurrentId = event.target.value;
    comparePreviousId = "";
    renderCompare();
  }
  if (event.target.id === "comparePrevious") {
    comparePreviousId = event.target.value;
    renderCompare();
  }
});
$("carList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-car-action]");
  if (!button) return;
  const { carAction, id } = button.dataset;
  if (carAction === "edit") editCar(id);
  if (carAction === "delete") deleteCar(id);
});
$("engineList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-engine-action]");
  const maintenanceButton = event.target.closest("button[data-maintenance-action]");
  if (maintenanceButton) {
    const { maintenanceAction, id } = maintenanceButton.dataset;
    if (maintenanceAction === "edit") editMaintenance(id);
    if (maintenanceAction === "delete") deleteMaintenance(id);
    return;
  }
  if (!button) return;
  const { engineAction, id } = button.dataset;
  if (engineAction === "edit") editEngine(id);
  if (engineAction === "maintenance") addMaintenance(id);
  if (engineAction === "select") selectEngine(id);
  if (engineAction === "delete") deleteEngine(id);
});
$("trackMemoryPanel").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-memory-load]");
  if (!button?.dataset.memoryLoad) return;
  const session = sessions.find((item) => item.id === button.dataset.memoryLoad);
  if (session) startFromTrackMemory(session);
});
$("trackList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-track-action]");
  if (!button) return;
  const { trackAction, id } = button.dataset;
  if (trackAction === "edit") editTrack(id);
  if (trackAction === "delete") deleteTrack(id);
});
["lfWeight", "rfWeight", "lrWeight", "rrWeight"].forEach((field) => {
  $(field).addEventListener("input", updateWeightCalculations);
});
["engineGear", "axleGear"].forEach((field) => {
  $(field).addEventListener("input", updateGearRatio);
  $(field).addEventListener("change", updateGearRatio);
});
$("carId").addEventListener("change", () => {
  renderEngineOptions("");
  renderTrackMemory();
});
$("engineId").addEventListener("change", syncEngineTypeFromInstalled);

$("sessionList").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "edit") editSession(id);
  if (action === "duplicate") duplicateSession(id);
  if (action === "baseline") setBaselineSession(id);
  if (action === "delete") deleteSession(id);
});

$("setupForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const session = readForm();
  const existing = sessions.findIndex((item) => item.id === session.id);
  if (existing >= 0) {
    session.createdAt = sessions[existing].createdAt;
    sessions[existing] = session;
  } else {
    sessions.push(session);
  }
  saveSessions();
  render();
  clearForm();
  setTab("sessions");
  showToast("Setup saved.");
});

$("carForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const car = readCarForm();
  if (car.currentEngineId) {
    cars.forEach((item) => {
      if (item.id !== car.id && item.currentEngineId === car.currentEngineId) item.currentEngineId = "";
    });
  }
  const existing = cars.findIndex((item) => item.id === car.id);
  if (existing >= 0) {
    cars[existing] = car;
  } else {
    cars.push(car);
  }
  saveCars();
  clearCarForm();
  render();
  renderCarOptions(car.id);
  showToast("Car saved.");
});

$("engineForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const engine = readEngineForm();
  const existing = engines.findIndex((item) => item.id === engine.id);
  if (existing >= 0) {
    engines[existing] = engine;
  } else {
    engines.push(engine);
  }
  saveEngines();
  clearEngineForm();
  render();
  renderEngineOptions(engine.id);
  showToast("Engine saved.");
});

$("maintenanceForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = readMaintenanceForm();
  if (!engines.some((engine) => engine.id === entry.engineId)) {
    showToast("Choose an engine before saving maintenance.");
    return;
  }
  const existing = maintenanceEntries.findIndex((item) => item.id === entry.id);
  if (existing >= 0) {
    entry.createdAt = maintenanceEntries[existing].createdAt;
    maintenanceEntries[existing] = entry;
  } else {
    maintenanceEntries.push(entry);
  }
  saveMaintenanceEntries();
  clearMaintenanceForm();
  renderEngines();
  showToast(entry.type === "Full Refresh" ? "Full refresh logged. Laps since refresh updated." : "Maintenance saved.");
});

$("trackForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const track = readTrackForm();
  const existing = tracks.findIndex((item) => item.id === track.id);
  if (existing >= 0) {
    const oldName = tracks[existing].name;
    tracks[existing] = track;
    sessions.forEach((session) => {
      if (session.trackId === track.id || session.track === oldName) {
        session.trackId = track.id;
        session.track = track.name;
      }
    });
    saveSessions();
  } else {
    tracks.push(track);
  }
  saveTracks();
  clearTrackForm();
  render();
  showToast("Track saved.");
});

setupCollapsibleSections();
setupNumericInputs();
registerServiceWorker();
clearForm({ clearDraft: false });
render();
const restoredDraft = restoreSessionDraft();
setInitialTab();
if (restoredDraft) setTab("sessions");

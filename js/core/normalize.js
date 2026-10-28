/**
 * NORMALIZATION LAYER
 *
 * Converts whatever a source delivers (simulator, static JSON, Raspberry Pi
 * API, …) into the one normalized model the dashboard understands.
 *
 * Rules:
 *  - Every field of the normalized model is always present.
 *  - Missing or invalid values become `null` — never `undefined` or NaN.
 *  - Timestamps become epoch milliseconds (numbers).
 *  - Unknown extra fields are ignored.
 *
 * The full format is documented in docs/DATA_FORMAT.md.
 */

// ---------------------------------------------------------------------------
// Primitive coercion
// ---------------------------------------------------------------------------

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const obj = (v) => (isObject(v) ? v : {});

/** Finite number or null. Accepts numeric strings, including "21,4". */
export function num(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const TRUE_WORDS = new Set(['1', 'true', 'on', 'an', 'ein', 'active', 'aktiv', 'yes', 'ja', 'running']);
const FALSE_WORDS = new Set(['0', 'false', 'off', 'aus', 'inactive', 'inaktiv', 'no', 'nein', 'idle', 'stopped']);

/** true / false / null. Accepts booleans, 0/1 and common on/off words. */
export function bool(value) {
  if (typeof value === 'boolean') return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (TRUE_WORDS.has(s)) return true;
    if (FALSE_WORDS.has(s)) return false;
  }
  return null;
}

/** Epoch milliseconds or null. Accepts ISO 8601, epoch seconds and epoch ms. */
export function timestamp(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  const s = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return timestamp(Number(s));
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : null;
}

/** Short plain-text string or null. */
export function text(value, maxLength = 120) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return s ? s.slice(0, maxLength) : null;
}

/** Number within [min, max] or null (implausible values are discarded). */
export function plausible(value, min, max) {
  const n = num(value);
  return n !== null && n >= min && n <= max ? n : null;
}

const round = (v, digits) => (v === null ? null : Math.round(v * 10 ** digits) / 10 ** digits);

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const SEVERITIES = Object.freeze(['normal', 'warning', 'critical']);

/** Normalized reported severity or null. */
export function severity(value) {
  const s = text(value, 20)?.toLowerCase();
  if (!s) return null;
  if (['ok', 'normal', 'good', 'healthy'].includes(s)) return 'normal';
  if (['warn', 'warning', 'hinweis', 'degraded'].includes(s)) return 'warning';
  if (['crit', 'critical', 'error', 'alarm', 'fault', 'kritisch'].includes(s)) return 'critical';
  return null;
}

/** Weather conditions understood by the dashboard. */
export const WEATHER_CONDITIONS = Object.freeze(['clear', 'partly-cloudy', 'cloudy', 'fog', 'rain', 'snow']);

const CONDITION_ALIASES = {
  clear: 'clear', sunny: 'clear', fair: 'clear', klar: 'clear', sonnig: 'clear', night: 'clear',
  'partly-cloudy': 'partly-cloudy', 'partly cloudy': 'partly-cloudy', partlycloudy: 'partly-cloudy',
  'mostly-clear': 'partly-cloudy', 'leicht bewölkt': 'partly-cloudy',
  cloudy: 'cloudy', overcast: 'cloudy', clouds: 'cloudy', bewölkt: 'cloudy', bedeckt: 'cloudy',
  fog: 'fog', mist: 'fog', haze: 'fog', nebel: 'fog',
  rain: 'rain', drizzle: 'rain', showers: 'rain', thunderstorm: 'rain', storm: 'rain', regen: 'rain',
  snow: 'snow', sleet: 'snow', hail: 'snow', schnee: 'snow',
};

/** Map provider-specific weather words onto WEATHER_CONDITIONS (or null). */
export function normalizeCondition(value) {
  const s = text(value, 40)?.toLowerCase().replace(/_/g, '-');
  if (!s) return null;
  return CONDITION_ALIASES[s] ?? CONDITION_ALIASES[s.replace(/-/g, ' ')] ?? null;
}

// ---------------------------------------------------------------------------
// Current state
// ---------------------------------------------------------------------------

/**
 * @typedef {object} RoomConfig
 * @property {string} id
 * @property {string} name
 * @property {string} [icon]
 * @property {number} [target]  Display-only comfort target.
 */

/**
 * Normalize outdoor conditions (sensor + weather).
 * @param {object} raw
 */
export function normalizeOutside(raw) {
  const o = obj(raw);
  const rawWeather = text(o.weather ?? o.condition, 40);
  let isDay = bool(o.isDay ?? o.is_day);
  if (isDay === null && rawWeather?.toLowerCase() === 'night') isDay = false;
  return {
    temperature: round(plausible(o.temperature, -50, 60), 1),
    weather: normalizeCondition(rawWeather),
    humidity: round(plausible(o.humidity, 0, 100), 0),
    min: round(plausible(o.min ?? o.temperatureMin, -50, 60), 1),
    max: round(plausible(o.max ?? o.temperatureMax, -50, 60), 1),
    sunrise: timestamp(o.sunrise),
    sunset: timestamp(o.sunset),
    isDay,
  };
}

/**
 * Normalize one room. `config` supplies name/icon/target fallbacks.
 * @param {object} raw
 * @param {RoomConfig} [config]
 */
export function normalizeRoom(raw, config = {}) {
  const r = obj(raw);
  const id = text(r.id ?? config.id, 60) ?? 'room';
  return {
    id,
    name: text(r.name, 40) ?? config.name ?? id,
    icon: text(config.icon ?? r.icon, 20) ?? 'room',
    temperature: round(plausible(r.temperature, -40, 85), 1),
    target: round(plausible(r.target ?? config.target, 5, 35), 1),
    humidity: round(plausible(r.humidity, 0, 100), 0),
    battery: round(plausible(r.battery, 0, 100), 0),
    signal: round(plausible(r.signal, 0, 100), 0),
    lastUpdate: timestamp(r.lastUpdate ?? r.last_seen),
    expected: Boolean(config.id),
  };
}

/**
 * Rooms come from the data. Configured rooms provide order, names and icons;
 * configured rooms that are absent from the data stay visible as "no data".
 *
 * @param {unknown} rawRooms
 * @param {RoomConfig[]} roomConfigs
 */
export function normalizeRooms(rawRooms, roomConfigs = []) {
  const list = Array.isArray(rawRooms) ? rawRooms.filter(isObject) : [];
  const byId = new Map();
  for (const raw of list) {
    const id = text(raw.id, 60);
    if (id && !byId.has(id)) byId.set(id, raw);
  }
  const rooms = [];
  for (const cfg of roomConfigs) {
    rooms.push(normalizeRoom(byId.get(cfg.id) ?? { id: cfg.id }, cfg));
    byId.delete(cfg.id);
  }
  for (const raw of byId.values()) rooms.push(normalizeRoom(raw));
  return rooms;
}

/**
 * Normalize a complete current-state document.
 *
 * @param {unknown} raw  Source document (see docs/DATA_FORMAT.md).
 * @param {{rooms?: RoomConfig[]}} [options]
 * @returns {CurrentState}
 */
export function normalizeCurrentState(raw, { rooms = [] } = {}) {
  const r = obj(raw);
  const system = obj(r.system);
  const boiler = obj(r.boiler);
  const heating = obj(r.heating);
  const hotWater = obj(r.hotWater);

  const communication = bool(system.communication);
  const burner = bool(boiler.burner);

  /** @typedef {ReturnType<typeof normalizeCurrentState>} CurrentState */
  return {
    timestamp: timestamp(r.timestamp),
    source: text(r.source, 40),
    isDemo: bool(r.demo) === true,
    system: {
      reportedStatus: severity(system.status),
      message: text(system.message, 160),
      communication,
      optolink: bool(system.optolink) ?? communication,
      zigbee: bool(system.zigbee),
      // Read-only Vitotronic operating mode; supplied by Pi API when available.
      operatingMode: text(system.operatingMode ?? system.operating_mode ?? boiler.operatingMode ?? boiler.operating_mode, 32),
    },
    boiler: {
      temperature: round(plausible(boiler.temperature, -20, 120), 1),
      burner,
      burnerRuntimeMinutes: round(plausible(boiler.burnerRuntimeMinutes, 0, 100000), 0),
      burnerSince: timestamp(boiler.burnerSince),
      modulation: round(plausible(boiler.modulation, 0, 100), 0),
    },
    heating: {
      supplyTemperature: round(plausible(heating.supplyTemperature, -20, 120), 1),
      returnTemperature: round(plausible(heating.returnTemperature, -20, 120), 1),
      pressure: round(plausible(heating.pressure, 0, 6), 2),
      pump: bool(heating.pump),
    },
    hotWater: {
      temperature: round(plausible(hotWater.temperature, -10, 100), 1),
      target: round(plausible(hotWater.target, 20, 80), 1),
    },
    outside: normalizeOutside(r.outside),
    rooms: normalizeRooms(r.rooms, rooms),
  };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** Series keys of the normalized history. */
export const HISTORY_SERIES = Object.freeze([
  'boilerTemperature',
  'supplyTemperature',
  'returnTemperature',
  'hotWaterTemperature',
  'outsideTemperature',
  'pressure',
  'burnerActive',
]);

const SERIES_LIMITS = {
  boilerTemperature: [-20, 120],
  supplyTemperature: [-20, 120],
  returnTemperature: [-20, 120],
  hotWaterTemperature: [-10, 100],
  outsideTemperature: [-50, 60],
  pressure: [0, 6],
  burnerActive: [0, 1],
};

/** An empty, valid history for the given period. */
export function emptyHistory(period = null) {
  return {
    period: period?.id ?? null,
    from: null,
    to: null,
    resolutionMinutes: period?.resolutionMinutes ?? null,
    timestamps: [],
    series: Object.fromEntries(HISTORY_SERIES.map((k) => [k, []])),
    rooms: {},
    length: 0,
  };
}

/**
 * Normalize a history document. Accepts the column format
 * `{ timestamps: [...], series: {...}, rooms: {...} }` and the row format
 * `{ points: [{ t, boilerTemperature, ..., rooms: { id: value } }] }`.
 *
 * @param {unknown} raw
 * @param {{period?: {id: string, resolutionMinutes: number}}} [options]
 */
export function normalizeHistory(raw, { period = null } = {}) {
  const r = obj(raw);
  const out = emptyHistory(period);

  let times;
  let columns = {};
  let roomColumns = {};
  if (Array.isArray(r.points)) {
    const points = r.points.filter(isObject);
    times = points.map((p) => timestamp(p.t ?? p.timestamp));
    for (const key of HISTORY_SERIES) columns[key] = points.map((p) => p[key]);
    const ids = new Set();
    points.forEach((p) => Object.keys(obj(p.rooms)).forEach((id) => ids.add(id)));
    for (const id of ids) roomColumns[id] = points.map((p) => obj(p.rooms)[id]);
  } else {
    times = Array.isArray(r.timestamps) ? r.timestamps.map(timestamp) : [];
    columns = obj(r.series);
    roomColumns = obj(r.rooms);
  }

  // Keep only valid timestamps, sorted ascending.
  const order = times
    .map((t, i) => [t, i])
    .filter(([t]) => t !== null)
    .sort((a, b) => a[0] - b[0])
    .map(([, i]) => i);

  out.timestamps = order.map((i) => times[i]);
  out.length = out.timestamps.length;

  const column = (values, [min, max]) => {
    const arr = Array.isArray(values) ? values : [];
    return order.map((i) => plausible(arr[i], min, max));
  };
  for (const key of HISTORY_SERIES) {
    let values = columns[key];
    // Accept boolean burner columns.
    if (key === 'burnerActive' && Array.isArray(values)) {
      values = values.map((v) => (typeof v === 'boolean' ? Number(v) : v));
    }
    out.series[key] = column(values, SERIES_LIMITS[key]);
  }
  for (const [id, values] of Object.entries(roomColumns)) {
    const safeId = text(id, 60);
    if (safeId) out.rooms[safeId] = column(values, [-40, 85]);
  }

  out.period = text(r.period, 10) ?? period?.id ?? null;
  out.from = timestamp(r.from) ?? out.timestamps[0] ?? null;
  out.to = timestamp(r.to) ?? out.timestamps[out.length - 1] ?? null;
  out.resolutionMinutes = num(r.resolutionMinutes) ?? period?.resolutionMinutes ?? inferResolution(out.timestamps);
  return out;
}

function inferResolution(times) {
  if (times.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < Math.min(times.length, 50); i++) diffs.push(times[i] - times[i - 1]);
  diffs.sort((a, b) => a - b);
  return Math.max(1, Math.round(diffs[diffs.length >> 1] / 60000));
}

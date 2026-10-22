/**
 * DEMO SIMULATOR
 *
 * A small, deterministic physical model of a gas boiler heating circuit,
 * hot-water tank, five rooms and the outdoor weather.
 *
 *  - Deterministic: the same clock time always produces the same values
 *    (seeded value noise, fixed day-aligned simulation anchor). Reloading the
 *    page does not produce "random chaos".
 *  - Continuous: one minute-step simulation runs forward from an anchor
 *    ~33 days in the past; history and current state come from the same run,
 *    so they are always consistent.
 *  - Output = SOURCE DOCUMENTS in the wire format of docs/DATA_FORMAT.md.
 *    They go through the same normalization as real Raspberry Pi data.
 *
 * The simulator knows nothing about the UI.
 */
import { createTimeZone, MINUTE, HOUR, DAY } from '../core/time.js';

const BASE_RES_MIN = 5;
const BASE_MS = BASE_RES_MIN * MINUTE;
const SPAN_DAYS = 31;
const WARMUP_DAYS = 2;

// ---------------------------------------------------------------------------
// Deterministic noise
// ---------------------------------------------------------------------------

function hash01(i, seed) {
  let h = Math.imul(i | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
function noise(x, seed) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash01(i, seed) * (1 - u) + hash01(i + 1, seed) * u;
}
const snoise = (x, seed) => noise(x, seed) * 2 - 1;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;

/** −1 at 06:00, +1 at 15:00, smooth in between. */
function diurnal(h) {
  const tMin = 6;
  const tMax = 15;
  if (h >= tMin && h < tMax) return -Math.cos((Math.PI * (h - tMin)) / (tMax - tMin));
  const span = 24 - (tMax - tMin);
  const x = h >= tMax ? h - tMax : h + 24 - tMax;
  return Math.cos((Math.PI * x) / span);
}

// ---------------------------------------------------------------------------
// Room profiles (demo only)
// schedule: [[fromHour, targetC], …]  gains: [[fromHour, toHour, °C/min], …]
// ---------------------------------------------------------------------------

const ROOM_PROFILES = {
  'living-room': { schedule: [[0, 18], [5.5, 21], [22.5, 18]], bias: 0.35, radiator: 0.001, loss: 0.0009, solar: 1.0, gains: [[18, 22.5, 0.0035]], battery: 92, signal: 88, humidity: 47 },
  kitchen: { schedule: [[0, 17.5], [5.5, 20], [21.5, 17.5]], bias: 0.15, radiator: 0.001, loss: 0.001, solar: 0.3, gains: [[6.5, 7.3, 0.01], [12, 12.75, 0.008], [18, 19.5, 0.012]], battery: 81, signal: 74, humidity: 52 },
  bedroom: { schedule: [[0, 18]], bias: 0.25, radiator: 0.0009, loss: 0.0009, solar: 0.2, gains: [[22.5, 24, 0.002], [0, 6.5, 0.002]], battery: 88, signal: 69, humidity: 50 },
  office: { schedule: [[0, 17], [6.5, 19], [18.5, 17]], weekdaysOnly: true, bias: 0.4, radiator: 0.0011, loss: 0.001, solar: 0.8, gains: [[8, 17.5, 0.0025]], battery: 64, signal: 58, humidity: 44 },
  bathroom: { schedule: [[0, 20], [5.5, 22], [8.5, 20], [18, 22], [22, 20]], bias: 0.15, radiator: 0.0016, loss: 0.0012, solar: 0.1, gains: [[6.3, 6.8, 0.03], [20, 20.4, 0.022]], battery: 76, signal: 81, humidity: 58, shower: true },
};

function genericProfile(room, index, seed) {
  const target = Number.isFinite(room.target) ? room.target : 20;
  return {
    schedule: [[0, target - 1.5], [6, target], [22, target - 1.5]],
    bias: 0.2, radiator: 0.001, loss: 0.001, solar: 0.4, gains: [],
    battery: Math.round(70 + hash01(index, seed + 90) * 28),
    signal: Math.round(50 + hash01(index, seed + 91) * 45),
    humidity: 50,
  };
}

function targetAt(profile, hour, weekday) {
  if (profile.weekdaysOnly && (weekday === 0 || weekday === 6)) return profile.schedule[0][1];
  let target = profile.schedule[0][1];
  for (const [from, t] of profile.schedule) if (hour >= from) target = t;
  return target;
}

function gainAt(gains, hour) {
  let g = 0;
  for (const [from, to, rate] of gains) if (hour >= from && hour < to) g += rate;
  return g;
}

// ---------------------------------------------------------------------------
// Simulator
// ---------------------------------------------------------------------------

/**
 * @param {object} options
 * @param {number} [options.seed]
 * @param {Array<{id:string,name:string,target?:number}>} options.rooms
 * @param {string} [options.timeZone]
 * @param {{latitude:number, longitude:number}} [options.location]
 * @param {string} [options.scenario]  Demo scenario, see config.DEMO_SCENARIOS.
 * @param {{outside?:number|null, weather?:string|null}} [options.overrides]
 * @param {number} [options.now]  Reference time for scenarios and the anchor.
 */
export function createSimulator(options = {}) {
  const seed = options.seed ?? 20261022;
  const tz = createTimeZone(options.timeZone || 'Europe/Luxembourg');
  const location = options.location ?? { latitude: 49.61, longitude: 6.13 };
  const scenario = options.scenario ?? 'normal';
  const overrides = options.overrides ?? {};
  const createdAt = options.now ?? Date.now();

  const rooms = (options.rooms ?? []).map((room, i) => ({
    id: room.id,
    name: room.name,
    profile: ROOM_PROFILES[room.id] ?? genericProfile(room, i, seed),
  }));

  // ----- outdoor ----------------------------------------------------------

  const sunCache = new Map();
  function sunTimes(t) {
    const day = tz.dayIndex(t);
    let s = sunCache.get(day);
    if (s) return s;
    const rad = Math.PI / 180;
    const doy = tz.dayOfYear(t);
    const B = (2 * Math.PI * (doy - 81)) / 364;
    const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
    const decl = 23.45 * Math.sin((2 * Math.PI * (284 + doy)) / 365);
    const lat = location.latitude * rad;
    const cosH = (Math.sin(-0.833 * rad) - Math.sin(lat) * Math.sin(decl * rad)) / (Math.cos(lat) * Math.cos(decl * rad));
    const H = Math.acos(clamp(cosH, -1, 1)) / rad;
    const noonUtcMin = 720 - 4 * location.longitude - eot;
    const utcMidnight = Math.floor(tz.wall(t) / DAY) * DAY; // UTC midnight of the local date
    s = {
      sunrise: utcMidnight + (noonUtcMin - 4 * H) * MINUTE,
      sunset: utcMidnight + (noonUtcMin + 4 * H) * MINUTE,
    };
    if (sunCache.size > 60) sunCache.clear();
    sunCache.set(day, s);
    return s;
  }

  function outdoorAt(t) {
    const h = tz.hour(t);
    const doy = tz.dayOfYear(t);
    const seasonal = 9.6 + 8.4 * Math.cos((2 * Math.PI * (doy - 201)) / 365.25);
    const synoptic = 4.2 * snoise(t / (42 * HOUR), seed + 1) + 1.6 * snoise(t / (13 * HOUR), seed + 2);
    const cloud = clamp(0.5 + 0.55 * snoise(t / (10 * HOUR), seed + 3) + 0.2 * snoise(t / (3 * HOUR), seed + 4), 0, 1);
    const hasOverride = Number.isFinite(overrides.outside);
    const baseline = hasOverride ? overrides.outside : seasonal + synoptic;
    const amplitude = (hasOverride ? 1.2 : 3.6) * (1 - 0.45 * cloud);
    const temperature = baseline + amplitude * diurnal(h) + 0.25 * snoise(t / (1.5 * HOUR), seed + 5);
    const precipitating = cloud > 0.62 && noise(t / (6 * HOUR), seed + 6) > 0.66;
    const dayShare = (diurnal(h) + 1) / 2;
    const humidity = clamp(
      Math.round(64 + 20 * (1 - dayShare) + 10 * cloud + (precipitating ? 8 : 0) + 4 * snoise(t / (7 * HOUR), seed + 8)),
      30, 99,
    );
    const foggy = !precipitating && humidity >= 88 && h >= 4 && h < 10.5 && hash01(tz.dayIndex(t), seed + 7) > 0.6;
    let condition = precipitating
      ? (temperature < 1 ? 'snow' : 'rain')
      : foggy ? 'fog' : cloud > 0.66 ? 'cloudy' : cloud > 0.38 ? 'partly-cloudy' : 'clear';
    if (overrides.weather) condition = overrides.weather;
    return { temperature, baseline, cloud, humidity, condition, hour: h };
  }

  function sunFactor(t) {
    const { sunrise, sunset } = sunTimes(t);
    if (t <= sunrise || t >= sunset) return 0;
    return Math.sin((Math.PI * (t - sunrise)) / (sunset - sunrise));
  }

  // ----- heating model ----------------------------------------------------

  function initialState(t) {
    const h = tz.hour(t);
    const wd = tz.weekday(t);
    return {
      t,
      boiler: 52,
      supply: 46,
      ret: 38,
      dhw: 52,
      burner: false,
      burnerChangedAt: t - 20 * MINUTE,
      dhwHeating: false,
      rooms: rooms.map((r) => targetAt(r.profile, h, wd) + 0.2),
    };
  }

  /** Advance the state by one minute, using conditions at s.t. */
  function step(s, wx) {
    const t = s.t;
    const h = wx.hour;
    const wd = tz.weekday(t);
    const out = wx.temperature;
    const heatingActive = wx.baseline < 15.5;
    const night = h >= 22.5 || h < 5.25;
    const roomAvg = s.rooms.length ? s.rooms.reduce((a, b) => a + b, 0) / s.rooms.length : 20;
    const baseDemand = clamp((19 - out) / 20, 0.12, 1);
    const demand = heatingActive ? baseDemand * (night ? 0.55 : 1) : 0;
    const curve = clamp(33 + 2.2 * (20 - out), 34, 72) - (night ? 10 : 0);

    // Hot-water tank: losses, tapping, reheating.
    let draw = 0;
    if (h >= 6.5 && h < 7.17) draw += 0.11;
    if (h >= 19.5 && h < 20.5) draw += 0.07;
    if (h >= 7 && h < 22 && hash01(Math.floor(t / (15 * MINUTE)), seed + 31) > 0.9) draw += 0.06;
    s.dhw -= 0.008 + draw;
    if (!s.dhwHeating && s.dhw < 47 && h >= 5 && h < 22) s.dhwHeating = true;
    if (s.dhwHeating) {
      s.dhw += 0.3;
      if (s.dhw >= 55) s.dhwHeating = false;
    }

    // Burner: hysteresis around the heating curve, anti-cycling minimum times.
    const sinceChange = (t - s.burnerChangedAt) / MINUTE;
    let want = s.burner;
    if (s.dhwHeating) want = true;
    else if (heatingActive) {
      if (s.burner && s.boiler > curve + 5 && sinceChange >= 8) want = false;
      if (!s.burner && s.boiler < curve - 6 && sinceChange >= 6) want = true;
    } else if (s.burner && sinceChange >= 5) want = false;
    if (want !== s.burner) {
      s.burner = want;
      s.burnerChangedAt = t;
    }

    // Boiler water temperature.
    const load = 0.012 * demand * Math.max(0, s.boiler - roomAvg) + (s.dhwHeating ? 0.22 : 0) + 0.0025 * Math.max(0, s.boiler - 18);
    const power = s.burner ? (s.dhwHeating ? 1.0 : 0.45 + 0.5 * demand) : 0;
    s.boiler = clamp(s.boiler + power - load, 15, 78);

    // Supply / return.
    if (heatingActive) {
      const supplyTarget = s.dhwHeating ? s.ret + 4 : s.boiler - 2.5;
      s.supply += (supplyTarget - s.supply) * 0.22;
      const retTarget = roomAvg + (s.supply - roomAvg) * (0.8 - 0.26 * baseDemand);
      s.ret += (retTarget - s.ret) * 0.1;
    } else {
      s.supply += (roomAvg + 3 - s.supply) * 0.01;
      s.ret += (roomAvg + 1 - s.ret) * 0.01;
    }

    // Rooms: radiator with proportional valve, losses, sun, internal gains.
    const sun = sunFactor(t) * (1 - 0.8 * wx.cloud);
    const supplyForRooms = heatingActive && !s.dhwHeating ? s.supply : null;
    for (let i = 0; i < rooms.length; i++) {
      const p = rooms[i].profile;
      const T = s.rooms[i];
      const target = targetAt(p, h, wd);
      let dT = -p.loss * (T - out);
      if (supplyForRooms !== null) {
        const valve = clamp((target + p.bias - T + 0.4) / 0.9, 0, 1);
        dT += p.radiator * Math.max(0, supplyForRooms - T) * valve;
      }
      dT += p.solar * 0.0035 * sun + gainAt(p.gains, h);
      s.rooms[i] = T + dT;
    }

    s.t = t + MINUTE;
  }

  // ----- scenario effects -------------------------------------------------

  function pressureAt(t, s) {
    let p = 1.435 + 0.0021 * ((s.supply + s.ret) / 2 - 20) + 0.006 * snoise(t / (5 * HOUR), seed + 21);
    const days = clamp((t - (createdAt - 7 * DAY)) / DAY, 0, 10);
    if (scenario === 'pressure-low') p -= 0.05 * days;
    if (scenario === 'pressure-critical') p -= 0.08 * days + 0.3 * clamp((t - (createdAt - 10 * HOUR)) / (10 * HOUR), 0, 1);
    return p;
  }

  /** Cut-off times after which a series has no data (scenario simulation). */
  const masks = {};
  const maskAll = (keys, from) => keys.forEach((k) => { masks[k] = from; });
  const HEATING_KEYS = ['boiler', 'supply', 'ret', 'dhw', 'pressure', 'burner'];
  const roomKeys = rooms.map((r) => `room:${r.id}`);
  if (scenario === 'optolink-offline') maskAll(HEATING_KEYS, createdAt - 35 * MINUTE);
  if (scenario === 'stale') maskAll([...HEATING_KEYS, 'outside', ...roomKeys], createdAt - 17 * MINUTE);
  if (scenario === 'sensor-offline' && rooms.some((r) => r.id === 'office')) masks['room:office'] = createdAt - 134 * MINUTE;
  if (scenario === 'zigbee-offline') maskAll(roomKeys, createdAt - 72 * MINUTE);
  if (scenario === 'missing') maskAll(['dhw', 'pressure'], -Infinity);
  const masked = (key, t) => masks[key] !== undefined && t > masks[key];

  // ----- continuous run with 5-minute buckets ------------------------------

  const anchor = Math.floor((createdAt - (SPAN_DAYS + WARMUP_DAYS + 1) * DAY) / DAY) * DAY;
  const state = initialState(anchor);
  const store = {
    t: [], boiler: [], supply: [], ret: [], dhw: [], outside: [], pressure: [], burner: [],
    rooms: rooms.map(() => []),
  };
  let acc = null;
  const maxBuckets = Math.ceil(((SPAN_DAYS + WARMUP_DAYS + 2) * DAY) / BASE_MS);

  function accumulate(s, wx) {
    if (!acc) {
      acc = { n: 0, boiler: 0, supply: 0, ret: 0, dhw: 0, outside: 0, pressure: 0, burner: 0, rooms: rooms.map(() => 0) };
    }
    acc.n++;
    acc.boiler += s.boiler;
    acc.supply += s.supply;
    acc.ret += s.ret;
    acc.dhw += s.dhw;
    acc.outside += wx.temperature;
    acc.pressure += pressureAt(s.t, s);
    acc.burner += s.burner ? 1 : 0;
    for (let i = 0; i < rooms.length; i++) acc.rooms[i] += s.rooms[i];
    if (acc.n === BASE_RES_MIN) {
      const n = acc.n;
      store.t.push(s.t + MINUTE); // bucket end
      store.boiler.push(acc.boiler / n);
      store.supply.push(acc.supply / n);
      store.ret.push(acc.ret / n);
      store.dhw.push(acc.dhw / n);
      store.outside.push(acc.outside / n);
      store.pressure.push(acc.pressure / n);
      store.burner.push(acc.burner / n);
      for (let i = 0; i < rooms.length; i++) store.rooms[i].push(acc.rooms[i] / n);
      acc = null;
      if (store.t.length > maxBuckets + 500) trim(500);
    }
  }

  function trim(count) {
    for (const key of ['t', 'boiler', 'supply', 'ret', 'dhw', 'outside', 'pressure', 'burner']) store[key].splice(0, count);
    for (const arr of store.rooms) arr.splice(0, count);
  }

  function advanceTo(now) {
    const target = Math.floor(now / MINUTE) * MINUTE;
    while (state.t < target) {
      const wx = outdoorAt(state.t);
      accumulate(state, wx);
      step(state, wx);
    }
  }

  // ----- public API -------------------------------------------------------

  const dailyRangeCache = new Map();
  function dailyRange(t) {
    const day = tz.dayIndex(t);
    let range = dailyRangeCache.get(day);
    if (!range) {
      const start = tz.startOfDay(t);
      let min = Infinity;
      let max = -Infinity;
      for (let k = 0; k < 48; k++) {
        const v = outdoorAt(start + k * 30 * MINUTE).temperature;
        min = Math.min(min, v);
        max = Math.max(max, v);
      }
      range = { min, max };
      if (dailyRangeCache.size > 40) dailyRangeCache.clear();
      dailyRangeCache.set(day, range);
    }
    return range;
  }

  /**
   * Current-state source document (wire format).
   * @param {number} now
   */
  function getCurrent(now = Date.now()) {
    advanceTo(now);
    const s = state;
    const t = s.t;
    const wx = outdoorAt(t);
    const sun = sunTimes(t);
    const range = dailyRange(t);
    const h = wx.hour;
    const wd = tz.weekday(t);
    let ts = Math.floor(now / (30 * 1000)) * 30 * 1000;
    if (scenario === 'stale') ts = Math.floor((createdAt - 17 * MINUTE) / 1000) * 1000;

    // In the "stale" scenario the whole document is simply old, not partially missing.
    const currentMasked = (key) => scenario !== 'stale' && masked(key, t);
    const heatingMissing = currentMasked('boiler');
    const doc = {
      timestamp: tz.toIso(ts),
      source: 'demo-simulator',
      demo: true,
      system: {
        status: 'normal',
        communication: !heatingMissing,
        optolink: !heatingMissing,
        zigbee: scenario !== 'zigbee-offline',
      },
      boiler: heatingMissing ? {} : {
        temperature: r1(scenario === 'overheat' ? Math.max(s.boiler, 89.4) : s.boiler),
        burner: s.burner,
        burnerRuntimeMinutes: s.burner ? Math.max(0, Math.round((ts - s.burnerChangedAt) / MINUTE)) : 0,
        burnerSince: tz.toIso(s.burnerChangedAt),
        modulation: s.burner ? Math.round(clamp(35 + 60 * (s.dhwHeating ? 1 : 0.5), 0, 100)) : 0,
      },
      heating: heatingMissing ? {} : {
        supplyTemperature: r1(scenario === 'overheat' ? Math.max(s.supply, 86.2) : s.supply),
        returnTemperature: r1(s.ret),
        pressure: currentMasked('pressure') ? null : r2(pressureAt(t, s)),
        pump: wx.baseline < 15.5,
      },
      hotWater: heatingMissing || currentMasked('dhw') ? {} : { temperature: r1(s.dhw), target: 55 },
      outside: {
        temperature: r1(wx.temperature),
        weather: wx.condition,
        humidity: scenario === 'missing' ? null : wx.humidity,
        min: r1(range.min),
        max: r1(range.max),
        sunrise: tz.toIso(sun.sunrise),
        sunset: tz.toIso(sun.sunset),
        isDay: t >= sun.sunrise && t < sun.sunset,
      },
      rooms: rooms.map((room, i) => {
        const p = room.profile;
        const key = `room:${room.id}`;
        const offline = masked(key, t);
        const lastSeen = offline
          ? masks[key]
          : ts - 5000 - Math.floor(hash01(Math.floor(t / (2 * MINUTE)), seed + 70 + i) * 170) * 1000;
        const showerBoost = p.shower && gainAt(p.gains, h) > 0 ? 18 : 0;
        let battery = p.battery;
        if (scenario === 'low-battery' && room.id === 'office') battery = 12;
        const doc = {
          id: room.id,
          name: room.name,
          temperature: r1(offline ? valueAtOrBefore(store.rooms[i], masks[key]) ?? s.rooms[i] : s.rooms[i]),
          target: targetAt(p, h, wd),
          humidity: clamp(Math.round(p.humidity + 6 * snoise(t / (5 * HOUR), seed + 60 + i) + showerBoost), 25, 95),
          battery,
          signal: offline ? null : clamp(Math.round(p.signal + 6 * snoise(t / (40 * MINUTE), seed + 50 + i)), 5, 100),
          lastUpdate: tz.toIso(lastSeen),
        };
        if (scenario === 'missing' && room.id === 'kitchen') { doc.battery = null; doc.signal = null; }
        if (scenario === 'missing' && room.id === 'bathroom') doc.target = null;
        return doc;
      }),
    };
    return doc;
  }

  function valueAtOrBefore(series, time) {
    const i0 = store.t.length ? Math.floor((time - store.t[0]) / BASE_MS) : -1;
    if (i0 < 0 || i0 >= series.length) return null;
    return series[i0];
  }

  /**
   * History source document (column wire format).
   * @param {{id:string, durationMs:number, resolutionMinutes:number}} period
   * @param {number} now
   */
  function getHistory(period, now = Date.now()) {
    advanceTo(now);
    const resMs = Math.max(BASE_RES_MIN, period.resolutionMinutes) * MINUTE;
    const factor = Math.round(resMs / BASE_MS);
    const to = Math.floor(now / resMs) * resMs;
    const from = to - period.durationMs;
    const count = Math.round(period.durationMs / resMs);
    const t0 = store.t[0];

    const keys = ['boiler', 'supply', 'ret', 'dhw', 'outside', 'pressure', 'burner'];
    const cols = Object.fromEntries(keys.map((k) => [k, []]));
    const roomCols = rooms.map(() => []);
    const timestamps = [];

    const agg = (arr, endIdx) => {
      let sum = 0;
      let n = 0;
      for (let j = endIdx - factor + 1; j <= endIdx; j++) {
        if (j >= 0 && j < arr.length) { sum += arr[j]; n++; }
      }
      return n === factor ? sum / n : null;
    };

    for (let k = 1; k <= count; k++) {
      const end = from + k * resMs;
      const idx = Math.round((end - t0) / BASE_MS);
      timestamps.push(tz.toIso(end));
      for (const key of keys) {
        const v = masked(key, end) ? null : agg(store[key], idx);
        cols[key].push(v === null ? null : key === 'pressure' || key === 'burner' ? r2(v) : r1(v));
      }
      rooms.forEach((room, i) => {
        const v = masked(`room:${room.id}`, end) ? null : agg(store.rooms[i], idx);
        roomCols[i].push(v === null ? null : r2(v));
      });
    }

    return {
      period: period.id,
      from: tz.toIso(from),
      to: tz.toIso(to),
      resolutionMinutes: resMs / MINUTE,
      timestamps,
      series: {
        boilerTemperature: cols.boiler,
        supplyTemperature: cols.supply,
        returnTemperature: cols.ret,
        hotWaterTemperature: cols.dhw,
        outsideTemperature: cols.outside,
        pressure: cols.pressure,
        burnerActive: cols.burner,
      },
      rooms: Object.fromEntries(rooms.map((room, i) => [room.id, roomCols[i]])),
    };
  }

  return Object.freeze({ getCurrent, getHistory, scenario });
}

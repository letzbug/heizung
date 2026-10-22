/**
 * CAMERON INSIGHT — analysis layer
 *
 * Version 1: deterministic local rules. No external AI is called.
 *
 *   generateInsights(currentState, history, options) → Insight[]
 *
 * Insight shape (also the contract for a future AI/agent, docs/AI_ANALYSIS.md):
 *   {
 *     id: "burner-runtime",
 *     severity: "info" | "positive" | "warning" | "critical",
 *     title: "Brennerlaufzeit",
 *     message: "Brennerlaufzeit +18 % gegenüber vergleichbaren Tagen.",
 *     metric: "+18 %",
 *     highlight: "+18 %",          // substring of message to emphasise (optional)
 *     confidence: 0.82,            // 0 … 1
 *     category: "burner",
 *     source: "cameron-local" | "agent",
 *     priority: 60                 // ordering hint
 *   }
 *
 * The panel that displays insights does not compute anything; it renders
 * whatever list it receives.
 */
import { createTimeZone } from '../core/time.js';
import {
  fmtKelvin, fmtMinuteOfDay, fmtNumber, fmtSignedPercent, fmtSinceDays, fmtTemp,
} from '../core/format.js';
import { text, num } from '../core/normalize.js';
import {
  clamp, coverage, dailyWindows, isNum, mean, median, seriesTrend, sliceOf, sum,
} from './stats.js';
import { SEVERITY_RANK } from './status.js';

const MINUS = '\u2212';

/**
 * @param {object|null} currentState normalized current state
 * @param {object|null} history normalized analysis history (ideally 7 days)
 * @param {object} options
 * @param {object} options.config
 * @param {number} [options.now]
 * @param {object|null} [options.recent] normalized 24 h history (fine resolution)
 * @param {object|null} [options.status] result of evaluateSystemStatus()
 * @returns {object[]} insights sorted by importance
 */
export function generateInsights(currentState, history, { config, now = Date.now(), recent = null, status = null } = {}) {
  const ctx = {
    current: currentState,
    history: history?.length ? history : null,
    recent: recent?.length ? recent : null,
    status,
    config,
    now,
    tz: createTimeZone(config.TIME_ZONE),
  };
  const analyzers = [
    analyzeSensors,
    analyzePressure,
    analyzeBurnerRuntime,
    analyzeHeatUp,
    analyzeReturnTemperature,
    analyzeBurnerCycling,
    analyzeHotWater,
    analyzeMissingData,
  ];
  const results = [];
  for (const analyze of analyzers) {
    try {
      const out = analyze(ctx);
      if (out) results.push(...(Array.isArray(out) ? out : [out]));
    } catch (err) {
      // A failing rule must never break the dashboard.
      console.warn('[insights] rule failed', analyze.name, err);
    }
  }
  return sortInsights(results.map((i) => ({ source: 'cameron-local', ...i })));
}

/** Sort by severity, then priority, then confidence. */
export function sortInsights(list) {
  const rank = (s) => (s === 'positive' ? 0.5 : SEVERITY_RANK[s] ?? 0);
  return [...list].sort(
    (a, b) => rank(b.severity) - rank(a.severity) || (b.priority ?? 0) - (a.priority ?? 0) || (b.confidence ?? 0) - (a.confidence ?? 0),
  );
}

/**
 * Validate an insight produced outside this module (e.g. by an AI agent via
 * GET /api/insights). Unknown fields are dropped, text is length-limited.
 */
export function normalizeInsight(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const message = text(raw.message, 280);
  if (!message) return null;
  const severity = ['info', 'positive', 'warning', 'critical'].includes(raw.severity) ? raw.severity : 'info';
  const confidence = num(raw.confidence);
  return {
    id: text(raw.id, 60) ?? `agent-${message.slice(0, 24)}`,
    severity,
    title: text(raw.title, 60) ?? 'Analyse',
    message,
    metric: text(raw.metric, 24),
    highlight: text(raw.highlight, 120),
    confidence: confidence === null ? null : clamp(confidence, 0, 1),
    category: text(raw.category, 30) ?? 'agent',
    source: 'agent',
    priority: num(raw.priority) ?? 50,
  };
}

/** Merge local and external insights, de-duplicated by id. */
export function combineInsights(local, external = []) {
  const seen = new Set();
  const all = [];
  for (const insight of [...external.map(normalizeInsight).filter(Boolean), ...local]) {
    if (seen.has(insight.id)) continue;
    seen.add(insight.id);
    all.push(insight);
  }
  return sortInsights(all);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

/** Windows of 24 h with burner runtime, outside mean and return mean. */
function windowStats(history) {
  const res = history.resolutionMinutes;
  return dailyWindows(history, 7).map((w) => {
    const burner = sliceOf(history.series.burnerActive, w);
    return {
      runtime: sum(burner) * res,
      cov: coverage(burner),
      out: mean(sliceOf(history.series.outsideTemperature, w)),
      ret: mean(sliceOf(history.series.returnTemperature, w)),
    };
  });
}

/** Days with similar outdoor temperature (falls back to all previous days). */
function comparable(last, previous, tolerance = 2.5) {
  const similar = isNum(last.out) ? previous.filter((s) => isNum(s.out) && Math.abs(s.out - last.out) <= tolerance) : [];
  return similar.length >= 2 ? { days: similar, similar: true } : { days: previous, similar: false };
}

function analyzeBurnerRuntime({ history, config }) {
  if (!history) return null;
  const stats = windowStats(history);
  if (stats.length < 3 || stats[0].cov < 0.8) return null;
  const previous = stats.slice(1).filter((s) => s.cov >= 0.8);
  if (previous.length < 2) return null;
  const { days, similar } = comparable(stats[0], previous);
  const base = mean(days.map((s) => s.runtime));
  if (!isNum(base) || base < 20) return null; // practically no heating (summer)
  const pct = ((stats[0].runtime - base) / base) * 100;
  const metric = fmtSignedPercent(pct);
  const ref = similar ? 'vergleichbaren Tagen' : 'den Vortagen';
  const severity = pct >= config.ANALYSIS.burnerRuntimeWarnPct ? 'warning' : 'info';
  return {
    id: 'burner-runtime',
    category: 'burner',
    severity,
    title: 'Brennerlaufzeit',
    message: Math.abs(pct) < 5 ? `Brennerlaufzeit entspricht ${ref} (${metric}).` : `Brennerlaufzeit ${metric} gegenüber ${ref}.`,
    metric,
    highlight: metric,
    confidence: round2(clamp(0.45 + 0.07 * days.length + (similar ? 0.12 : 0) + 0.1 * stats[0].cov, 0, 0.95)),
    priority: severity === 'warning' ? 80 : Math.abs(pct) >= 10 ? 62 : 30,
    details: { runtimeMinutes: Math.round(stats[0].runtime), baselineMinutes: Math.round(base), comparableDays: days.length },
  };
}

function analyzeHeatUp({ history, current, config, tz, now }) {
  if (!history) return null;
  const roomId = config.ANALYSIS.heatUpRoom ?? config.CHART_ROOM;
  const series = history.rooms[roomId];
  if (!series) return null;
  const roomCfg = config.ROOMS.find((r) => r.id === roomId);
  const room = current?.rooms.find((r) => r.id === roomId);
  const target = roomCfg?.target ?? room?.target;
  if (!isNum(target)) return null;
  const threshold = target - (config.ANALYSIS.heatUpTolerance ?? 0.3);
  const name = roomCfg?.name ?? room?.name ?? 'Raum';

  // First morning crossing of the threshold per local day (04:00–12:00).
  const crossing = new Map();
  const ts = history.timestamps;
  for (let i = 1; i < ts.length; i++) {
    const a = series[i - 1];
    const b = series[i];
    if (!isNum(a) || !isNum(b) || !(a < threshold && b >= threshold)) continue;
    const t = ts[i - 1] + ((ts[i] - ts[i - 1]) * (threshold - a)) / (b - a);
    const hour = tz.hour(t);
    if (hour < 4 || hour > 12) continue;
    const day = tz.dayIndex(t);
    if (!crossing.has(day)) crossing.set(day, hour * 60);
  }
  const today = tz.dayIndex(now);
  const previous = [...crossing].filter(([day]) => day < today).map(([, minutes]) => minutes);
  if (previous.length < 3) return null;
  const usual = median(previous);
  const confidence = round2(clamp(0.5 + 0.06 * previous.length, 0, 0.9));
  const todayMinutes = crossing.get(today);

  if (todayMinutes === undefined) {
    const nowMinutes = tz.hour(now) * 60;
    if (nowMinutes > usual + 20 && nowMinutes < 12 * 60 && isNum(room?.temperature) && room.temperature < threshold) {
      const late = Math.round(nowMinutes - usual);
      return {
        id: 'heat-up', category: 'comfort', severity: 'info', title: 'Aufheizen',
        message: `${name} hat den Sollbereich noch nicht erreicht – üblich gegen ${fmtMinuteOfDay(usual)} Uhr.`,
        metric: `+${late} Min.`, highlight: 'noch nicht erreicht', confidence, priority: 58,
      };
    }
    return null;
  }

  const diff = Math.round(todayMinutes - usual);
  if (Math.abs(diff) < 10) {
    return {
      id: 'heat-up', category: 'comfort', severity: 'positive', title: 'Aufheizzeit',
      message: `${name} hat den Sollbereich zur üblichen Zeit erreicht (${fmtMinuteOfDay(todayMinutes)} Uhr).`,
      metric: fmtMinuteOfDay(todayMinutes), highlight: 'zur üblichen Zeit', confidence, priority: 22,
    };
  }
  const later = diff > 0;
  const phrase = `Sollbereich ${Math.abs(diff)} Minuten ${later ? 'später' : 'früher'} als üblich`;
  return {
    id: 'heat-up', category: 'comfort', severity: 'info', title: 'Aufheizzeit',
    message: `${name} erreicht den ${phrase}.`,
    metric: `${later ? '+' : MINUS}${Math.abs(diff)} Min.`, highlight: phrase, confidence,
    priority: later ? 55 : 32,
  };
}

function analyzePressure({ history, config }) {
  const trend = seriesTrend(history, 'pressure');
  if (!trend || trend.slopePerDay === null) return null;
  const T = config.THRESHOLDS.pressure;
  const days = Math.max(1, Math.round(trend.spanDays));
  if (trend.slopePerDay <= -T.dropPerDayWarning && trend.range >= 0.1) {
    const rate = `${MINUS}${fmtNumber(Math.abs(trend.slopePerDay), 2)} bar/Tag`;
    return {
      id: 'pressure-trend', category: 'pressure', severity: 'warning', title: 'Anlagendruck',
      message: `Anlagendruck sinkt ${fmtSinceDays(days)} (${rate}). Möglicher Druckverlust – Anlage prüfen lassen.`,
      metric: rate, highlight: `sinkt ${fmtSinceDays(days)}`, confidence: 0.85, priority: 90,
    };
  }
  if (trend.range <= T.stableRange) {
    const metric = `${fmtNumber(trend.min, 2)}–${fmtNumber(trend.max, 2)} bar`;
    return {
      id: 'pressure-trend', category: 'pressure', severity: 'positive', title: 'Anlagendruck',
      message: `Anlagendruck ${fmtSinceDays(days)} stabil.`,
      metric, highlight: 'stabil', confidence: 0.9, priority: 26,
    };
  }
  return {
    id: 'pressure-trend', category: 'pressure', severity: 'info', title: 'Anlagendruck',
    message: `Anlagendruck schwankt zwischen ${fmtNumber(trend.min, 2)} und ${fmtNumber(trend.max, 2)} bar.`,
    metric: `${fmtNumber(trend.range, 2)} bar`, confidence: 0.75, priority: 40,
  };
}

function analyzeReturnTemperature({ history, config }) {
  if (!history) return null;
  const stats = windowStats(history);
  if (stats.length < 3 || !isNum(stats[0].ret)) return null;
  const previous = stats.slice(1).filter((s) => isNum(s.ret) && s.cov >= 0.8);
  if (previous.length < 2) return null;
  const { days, similar } = comparable(stats[0], previous);
  const base = mean(days.map((s) => s.ret));
  const diff = stats[0].ret - base;
  const limit = config.ANALYSIS.returnDeviationK;
  if (Math.abs(diff) < limit) return null;
  const metric = fmtKelvin(diff);
  const higher = diff > 0;
  return {
    id: 'return-temperature', category: 'efficiency', severity: higher ? 'info' : 'positive', title: 'Rücklauf',
    message: higher
      ? `Rücklauftemperatur liegt höher als im üblichen Bereich (${metric}).`
      : `Rücklauftemperatur niedriger als üblich (${metric}) – günstig für die Brennwertnutzung.`,
    metric, highlight: higher ? 'höher als im üblichen Bereich' : 'niedriger als üblich',
    confidence: round2(clamp(0.5 + 0.07 * days.length + (similar ? 0.1 : 0), 0, 0.9)),
    priority: higher ? 52 : 28,
  };
}

function analyzeBurnerCycling({ recent, history, config }) {
  const source = recent ?? history;
  if (!source) return null;
  const per = Math.round(1440 / source.resolutionMinutes);
  const values = source.series.burnerActive.slice(-per);
  if (coverage(values) < 0.8 || source.resolutionMinutes > 15) return null;
  let starts = 0;
  for (let i = 1; i < values.length; i++) if (isNum(values[i - 1]) && isNum(values[i]) && values[i - 1] < 0.5 && values[i] >= 0.5) starts++;
  const runtime = sum(values) * source.resolutionMinutes;
  const avgRun = starts ? runtime / starts : null;
  const max = config.ANALYSIS.maxBurnerStartsPerDay;
  if (starts > max) {
    return {
      id: 'burner-cycling', category: 'burner', severity: 'warning', title: 'Brennertakt',
      message: `Brenner taktet häufig: ${starts} Starts in 24 Stunden.`,
      metric: `${starts} Starts`, highlight: 'taktet häufig', confidence: 0.8, priority: 75,
    };
  }
  return {
    id: 'burner-cycling', category: 'burner', severity: 'info', title: 'Brennertakt',
    message: `${starts} Brennerstarts in 24 Stunden${isNum(avgRun) ? `, im Mittel ${Math.round(avgRun)} Minuten Laufzeit` : ''}.`,
    metric: `${starts} Starts`, confidence: 0.7, priority: 12,
  };
}

function analyzeSensors({ current, status }) {
  if (!current || !status?.rooms) return null;
  const offline = current.rooms.filter((r) => status.rooms[r.id] && !status.rooms[r.id].online);
  const lowBattery = current.rooms.filter((r) => status.rooms[r.id]?.lowBattery);
  const out = [];
  if (offline.length) {
    const names = offline.map((r) => r.name).join(', ');
    out.push({
      id: 'sensor-offline', category: 'sensors', severity: 'warning', title: 'Raumsensoren',
      message: offline.length === 1 ? `Sensor ${names} meldet sich nicht. Batterie und Funkverbindung prüfen.` : `${offline.length} Sensoren melden sich nicht: ${names}.`,
      metric: `${offline.length} offline`, highlight: offline.length === 1 ? 'meldet sich nicht' : `${offline.length} Sensoren`,
      confidence: 0.95, priority: 85,
    });
  }
  if (lowBattery.length) {
    const r = lowBattery[0];
    out.push({
      id: 'sensor-battery', category: 'sensors', severity: 'warning', title: 'Batterie',
      message: `Batterie Sensor ${r.name} bei ${Math.round(r.battery)} % – bald wechseln.`,
      metric: `${Math.round(r.battery)} %`, highlight: `${Math.round(r.battery)} %`, confidence: 0.95, priority: 70,
    });
  }
  return out;
}

function analyzeHotWater({ current, config }) {
  const t = current?.hotWater.temperature;
  if (!isNum(t) || t >= config.THRESHOLDS.hotWater.infoLow) return null;
  return {
    id: 'hot-water', category: 'hot-water', severity: 'info', title: 'Warmwasser',
    message: `Warmwasser aktuell ${fmtTemp(t, 1)} – unter ${fmtTemp(config.THRESHOLDS.hotWater.infoLow, 0)}.`,
    metric: fmtTemp(t, 0), confidence: 0.9, priority: 45,
  };
}

function analyzeMissingData({ current }) {
  if (!current || current.system.optolink === false) return null;
  const checks = [
    ['Kessel', current.boiler.temperature],
    ['Vorlauf', current.heating.supplyTemperature],
    ['Rücklauf', current.heating.returnTemperature],
    ['Druck', current.heating.pressure],
    ['Warmwasser', current.hotWater.temperature],
    ['Außen', current.outside.temperature],
  ];
  const missing = checks.filter(([, v]) => !isNum(v)).map(([label]) => label);
  if (!missing.length) return null;
  return {
    id: 'missing-data', category: 'data', severity: 'info', title: 'Datenqualität',
    message: `Fehlende Messwerte: ${missing.join(', ')}.`,
    metric: `${missing.length} fehlen`, confidence: 1, priority: 44,
  };
}

const round2 = (v) => Math.round(v * 100) / 100;

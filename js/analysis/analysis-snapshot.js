/**
 * SANITIZED ANALYSIS SNAPSHOT
 *
 * Builds the read-only export an AI agent (e.g. a Grok bot) may analyse.
 * See docs/AI_ANALYSIS.md.
 *
 * Contains: normalized measurements, sensor health, history statistics,
 * derived events and the current insights.
 * Never contains: credentials, tokens, network addresses, location
 * coordinates, device identifiers or personal data.
 */
import { createTimeZone, MINUTE } from '../core/time.js';
import { coverage, isNum, mean, minMax, seriesTrend, sum } from './stats.js';

export const SNAPSHOT_SCHEMA = 'frank-cameron.heating-monitor.analysis-snapshot/v1';

const r = (v, d = 1) => (isNum(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

function seriesSummary(values, digits = 1) {
  const { min, max } = minMax(values);
  return { min: r(min, digits), max: r(max, digits), mean: r(mean(values), digits), coverage: r(coverage(values), 2) };
}

/** Statistics of a normalized history. */
export function summarizeHistory(history) {
  if (!history?.length) return null;
  const s = history.series;
  const res = history.resolutionMinutes;
  let starts = 0;
  for (let i = 1; i < s.burnerActive.length; i++) {
    const a = s.burnerActive[i - 1];
    const b = s.burnerActive[i];
    if (isNum(a) && isNum(b) && a < 0.5 && b >= 0.5) starts++;
  }
  const runtimeMinutes = sum(s.burnerActive) * res;
  const trend = seriesTrend(history, 'pressure');
  return {
    period: history.period,
    from: new Date(history.from).toISOString(),
    to: new Date(history.to).toISOString(),
    resolutionMinutes: res,
    points: history.length,
    boilerTemperature: seriesSummary(s.boilerTemperature),
    supplyTemperature: seriesSummary(s.supplyTemperature),
    returnTemperature: seriesSummary(s.returnTemperature),
    hotWaterTemperature: seriesSummary(s.hotWaterTemperature),
    outsideTemperature: seriesSummary(s.outsideTemperature),
    pressure: { ...seriesSummary(s.pressure, 2), trendBarPerDay: r(trend?.slopePerDay, 3) },
    burner: {
      runtimeHours: r(runtimeMinutes / 60, 1),
      dutyPercent: r((runtimeMinutes / (history.length * res)) * 100, 1),
      starts: res <= 15 ? starts : null,
    },
    rooms: Object.fromEntries(Object.entries(history.rooms).map(([id, values]) => [id, seriesSummary(values)])),
  };
}

/** Burner runs in the last 24 h plus current status issues. */
export function deriveEvents(history, status, now = Date.now(), timeZone) {
  const tz = createTimeZone(timeZone);
  const events = [];
  if (history?.length && history.resolutionMinutes <= 15) {
    const res = history.resolutionMinutes * MINUTE;
    const since = now - 24 * 60 * MINUTE;
    let runStart = null;
    history.series.burnerActive.forEach((v, i) => {
      const end = history.timestamps[i];
      const on = isNum(v) && v >= 0.5;
      if (on && runStart === null) runStart = end - res;
      if (!on && runStart !== null) {
        if (runStart >= since) events.push({ type: 'burner-run', start: tz.toIso(runStart), end: tz.toIso(end - res), minutes: Math.round((end - res - runStart) / MINUTE) });
        runStart = null;
      }
    });
    if (runStart !== null) events.push({ type: 'burner-run', start: tz.toIso(runStart), end: null, minutes: null, ongoing: true });
  }
  for (const issue of status?.issues ?? []) {
    events.push({ type: 'status', severity: issue.severity, code: issue.code, message: issue.message, at: tz.toIso(now) });
  }
  return events;
}

/**
 * @param {object} input
 * @param {object} input.current normalized current state
 * @param {object} input.history normalized history (24 h or 7 d)
 * @param {object} input.status evaluateSystemStatus() result
 * @param {object[]} input.insights
 * @param {object} input.config
 * @param {number} [input.now]
 */
export function buildAnalysisSnapshot({ current, history, status, insights = [], config, now = Date.now() }) {
  const tz = createTimeZone(config.TIME_ZONE);
  const iso = (ms) => (isNum(ms) ? tz.toIso(ms) : null);
  return {
    schema: SNAPSHOT_SCHEMA,
    generatedAt: iso(now),
    readOnly: true,
    dataMode: current?.isDemo ? 'demo' : 'live',
    system: {
      status: status?.severity ?? 'unknown',
      headline: status?.headline ?? null,
      measuredAt: iso(current?.timestamp),
      stale: status?.freshness?.stale ?? null,
      communication: {
        optolink: current?.system.optolink ?? null,
        zigbeeSensorsOnline: status ? Object.values(status.rooms).filter((x) => x.online).length : null,
        zigbeeSensorsTotal: current?.rooms.length ?? null,
      },
      boiler: {
        temperature: current?.boiler.temperature ?? null,
        burner: current?.boiler.burner ?? null,
        burnerRuntimeMinutes: current?.boiler.burnerRuntimeMinutes ?? null,
      },
      heating: {
        supplyTemperature: current?.heating.supplyTemperature ?? null,
        returnTemperature: current?.heating.returnTemperature ?? null,
        pressure: current?.heating.pressure ?? null,
      },
      hotWater: { temperature: current?.hotWater.temperature ?? null },
      outside: {
        temperature: current?.outside.temperature ?? null,
        weather: current?.outside.weather ?? null,
        humidity: current?.outside.humidity ?? null,
      },
    },
    rooms: (current?.rooms ?? []).map((room) => ({
      id: room.id,
      name: room.name,
      temperature: room.temperature,
      target: room.target,
      humidity: room.humidity,
      battery: room.battery,
      signal: room.signal,
      lastUpdate: iso(room.lastUpdate),
      online: status?.rooms?.[room.id]?.online ?? null,
    })),
    historySummary: summarizeHistory(history),
    events: deriveEvents(history, status, now, config.TIME_ZONE),
    insights: insights.map(({ id, severity, title, message, metric, confidence, source }) => ({ id, severity, title, message, metric, confidence, source })),
    privacy: {
      containsCredentials: false,
      containsLocation: false,
      containsPersonalData: false,
      note: 'Sanitized export for read-only analysis. No secrets, no addresses, no coordinates, no device identifiers.',
    },
  };
}

/**
 * DATA PROVIDER — the single interface between data sources and the UI.
 *
 *   SOURCE (demo | json | api)  →  NORMALIZATION  →  DATA PROVIDER  →  DASHBOARD / ANALYSIS
 *
 * The dashboard only ever talks to the object returned by createDataProvider().
 * It never knows whether data comes from the simulator, static files or the
 * Raspberry Pi. Switching CONFIG.DATA_MODE from "demo" to "api" is the whole
 * migration — nothing above this layer changes.
 *
 * Interface (all methods are read-only and return normalized data):
 *   getCurrentState()          → CurrentState
 *   getHistory(periodId)       → History
 *   getRooms()                 → Room[]
 *   getSystemStatus()          → CurrentState['system']
 *   getOutdoorConditions()     → CurrentState['outside']
 *   getExternalInsights()      → raw insight objects from a future agent (or [])
 */
import { normalizeCurrentState, normalizeHistory, normalizeRooms, emptyHistory } from '../core/normalize.js';
import { getPeriod } from '../core/periods.js';
import { createDemoSource } from './providers/demo-provider.js';
import { createJsonSource } from './providers/json-provider.js';
import { createApiSource } from './providers/api-provider.js';
import { createWeatherProvider } from './providers/weather-provider.js';
import { normalizeWeather, mergeOutdoorConditions } from './adapters/weather-adapter.js';

/** Methods every provider exposes. Nothing here can write. */
export const PROVIDER_INTERFACE = Object.freeze([
  'getCurrentState', 'getHistory', 'getRooms', 'getSystemStatus', 'getOutdoorConditions', 'getExternalInsights',
]);

function createSource(config) {
  switch (config.DATA_MODE) {
    case 'api':
      return createApiSource(config);
    case 'json':
      return createJsonSource(config);
    case 'demo':
    default:
      return createDemoSource(config);
  }
}

/**
 * @param {object} config resolved runtime configuration (see config.js)
 */
export function createDataProvider(config) {
  const source = createSource(config);
  const weather = createWeatherProvider(config);
  const roomConfig = config.ROOMS;

  async function getCurrentState() {
    const [raw, wx] = await Promise.all([
      source.fetchCurrent(),
      weather.fetchConditions().catch(() => null),
    ]);
    const state = normalizeCurrentState(raw, { rooms: roomConfig });
    if (wx) state.outside = mergeOutdoorConditions(state.outside, normalizeWeather(wx));
    state.source = state.source ?? source.id;
    state.isDemo = state.isDemo || source.isDemo;
    return state;
  }

  /** @param {'24h'|'7d'|'30d'} periodId */
  async function getHistory(periodId) {
    const period = getPeriod(periodId);
    const raw = await source.fetchHistory(period);
    return raw ? normalizeHistory(raw, { period }) : emptyHistory(period);
  }

  async function getRooms() {
    if (source.fetchRooms) {
      const raw = await source.fetchRooms();
      return normalizeRooms(Array.isArray(raw) ? raw : raw?.rooms, roomConfig);
    }
    return (await getCurrentState()).rooms;
  }

  async function getSystemStatus() {
    if (source.fetchStatus) {
      const raw = await source.fetchStatus();
      return normalizeCurrentState({ system: raw?.system ?? raw }).system;
    }
    return (await getCurrentState()).system;
  }

  async function getOutdoorConditions() {
    return (await getCurrentState()).outside;
  }

  async function getExternalInsights() {
    if (!source.fetchInsights) return [];
    const raw = await source.fetchInsights().catch(() => null);
    return Array.isArray(raw) ? raw : Array.isArray(raw?.insights) ? raw.insights : [];
  }

  return Object.freeze({
    id: source.id,
    label: source.label,
    isDemo: source.isDemo,
    getCurrentState,
    getHistory,
    getRooms,
    getSystemStatus,
    getOutdoorConditions,
    getExternalInsights,
  });
}

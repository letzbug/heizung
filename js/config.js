/**
 * Frank & Cameron – Heating Monitor · configuration
 *
 * This file is committed to the repository. It must NEVER contain secrets:
 * no tokens, passwords, MQTT credentials, API keys or service-role keys.
 * Secrets belong on the Raspberry Pi / backend (see docs/SECURITY.md).
 */

const deepFreeze = (o) => {
  Object.values(o).forEach((v) => v && typeof v === 'object' && deepFreeze(v));
  return Object.freeze(o);
};

export const CONFIG = deepFreeze({
  APP: {
    name: 'Frank & Cameron – Heating Monitor',
    version: '0.1.0',
  },

  /**
   * Where data comes from:
   *  "demo" – deterministic in-browser simulator (version 1 default)
   *  "json" – static files in JSON_BASE_URL (data/demo-current.json, data/demo-history.json)
   *  "api"  – read-only Raspberry Pi API at API_BASE_URL (GET only)
   */
  DATA_MODE: 'demo',

  /**
   * Weather source:
   *  "source" – weather is part of the current-state document (demo, or Pi merges it)
   *  "api"    – separate read-only GET {API_BASE_URL}/weather on the Pi
   */
  WEATHER_MODE: 'source',

  API_BASE_URL: '/api',
  JSON_BASE_URL: 'data',
  /** Shift timestamps of the static demo JSON files to "now" so they don't look stale. */
  JSON_REBASE_TO_NOW: true,

  SHOW_DEMO_BADGE: true,
  /** Disables continuous animations (useful for a Raspberry Pi kiosk display). */
  LOW_POWER: false,

  DECIMAL_SEPARATOR: '.',
  TIME_ZONE: 'Europe/Luxembourg',
  /** Approximate location, used ONLY by the demo simulator for sunrise/sunset. Never exported. */
  LOCATION: { latitude: 49.61, longitude: 6.13 },

  POLLING: {
    currentMs: 30_000,
    historyMs: 300_000,
    statusTickMs: 15_000,
    requestTimeoutMs: 10_000,
  },

  FRESHNESS: {
    /** Current state older than this is marked stale. */
    staleAfterSeconds: 300,
    /** A room sensor without report for this long counts as offline. */
    sensorOfflineAfterSeconds: 3600,
  },

  /** Assumed limits — verify against the real installation and the installer's documentation. */
  THRESHOLDS: {
    pressure: {
      criticalLow: 0.9,
      warningLow: 1.2,
      warningHigh: 2.2,
      criticalHigh: 2.6,
      /** bar/day; a sustained drop beyond this is reported as "Druck fällt". */
      dropPerDayWarning: 0.04,
      /** max−min (bar) within the analysis window that still counts as stable. */
      stableRange: 0.15,
    },
    boiler: { warning: 82, critical: 88 },
    hotWater: { infoLow: 45 },
    sensor: { batteryWarning: 20, signalWarning: 25 },
  },

  /** Display-only nominal pressure shown on the pressure card. */
  PRESSURE_NOMINAL_BAR: 1.5,

  DEFAULT_PERIOD: '24h',

  ANALYSIS: {
    /** History period used for Cameron Insight and trend checks. */
    period: '7d',
    heatUpRoom: 'living-room',
    heatUpTolerance: 0.3,
    burnerRuntimeWarnPct: 30,
    maxBurnerStartsPerDay: 30,
    returnDeviationK: 3,
    maxVisible: 3,
  },

  /**
   * Rooms: order, names, icons and display-only comfort targets.
   * `zigbee` maps a Zigbee2MQTT device to the room (see docs/ZIGBEE.md).
   * Targets are INFORMATION ONLY and never editable.
   */
  ROOMS: [
    { id: 'living-room', name: 'Wohnzimmer', icon: 'sofa', target: 21.0, zigbee: { friendlyName: 'sensor_wohnzimmer' } },
    { id: 'kitchen', name: 'Küche', icon: 'kitchen', target: 20.0, zigbee: { friendlyName: 'sensor_kueche' } },
    { id: 'bedroom', name: 'Schlafzimmer', icon: 'bed', target: 18.0, zigbee: { friendlyName: 'sensor_schlafzimmer' } },
    { id: 'office', name: 'Büro', icon: 'office', target: 19.0, zigbee: { friendlyName: 'sensor_buero' } },
    { id: 'bathroom', name: 'Bad', icon: 'bath', target: 22.0, zigbee: { friendlyName: 'sensor_bad' } },
  ],

  /** Rooms shown as headline metric cards. */
  HEADLINE_ROOMS: ['living-room', 'bedroom'],
  /** Room plotted in the temperature chart. */
  CHART_ROOM: 'living-room',

  DEMO: {
    seed: 20261022,
  },
});

const MODES = ['demo', 'json', 'api'];
export const DEMO_SCENARIOS = Object.freeze([
  'normal', 'stale', 'optolink-offline', 'sensor-offline', 'zigbee-offline', 'low-battery',
  'pressure-low', 'pressure-critical', 'overheat', 'missing', 'offline',
]);
const WEATHER_OVERRIDES = ['clear', 'partly-cloudy', 'cloudy', 'fog', 'rain', 'snow'];

/**
 * Apply URL overrides for previews and testing. Overrides only change what
 * is displayed — there is nothing to control.
 *
 *   ?mode=demo|json|api
 *   ?scenario=stale|optolink-offline|sensor-offline|zigbee-offline|low-battery|
 *             pressure-low|pressure-critical|overheat|missing|offline   (demo only)
 *   ?outside=-4&weather=snow     (demo only, preview outdoor scenes)
 *   ?delay=2500                  (demo only, preview the loading state)
 *   ?lowpower=1   ?demobadge=0
 *
 * @param {typeof CONFIG} base
 * @param {string} [search] location.search
 */
export function resolveRuntimeConfig(base, search = '') {
  const params = new URLSearchParams(search);
  const mode = params.get('mode');
  const scenario = params.get('scenario');
  const weather = params.get('weather');
  const outside = Number(params.get('outside'));
  const delay = Number(params.get('delay'));

  return {
    ...base,
    DATA_MODE: MODES.includes(mode) ? mode : base.DATA_MODE,
    LOW_POWER: params.get('lowpower') === '1' ? true : base.LOW_POWER,
    SHOW_DEMO_BADGE: params.get('demobadge') === '0' ? false : base.SHOW_DEMO_BADGE,
    RUNTIME: Object.freeze({
      scenario: DEMO_SCENARIOS.includes(scenario) ? scenario : 'normal',
      overrides: Object.freeze({
        weather: WEATHER_OVERRIDES.includes(weather) ? weather : null,
        outside: params.has('outside') && Number.isFinite(outside) ? Math.max(-30, Math.min(40, outside)) : null,
      }),
      delayMs: Number.isFinite(delay) ? Math.max(0, Math.min(10_000, delay)) : 0,
    }),
  };
}

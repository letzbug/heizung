/**
 * OPTOLINK ADAPTER — conceptual placeholder
 *
 * Path:  Viessmann → Optolink → Raspberry Pi → THIS ADAPTER → normalized data → dashboard API
 *
 * Intended to run ON THE RASPBERRY PI (Node) or to be ported 1:1 to the Pi's
 * language of choice. It is a pure function with no DOM and no network access.
 *
 * IMPORTANT: Exact Optolink datapoints will be added after reading the real
 * installation. The `raw.*` names below are conceptual placeholders, NOT real
 * Viessmann datapoint addresses.
 *
 * This adapter only READS. It never writes datapoints.
 */
import { bool, plausible } from '../../core/normalize.js';

/**
 * Conceptual raw field → normalized path.
 * Replace the left side once the real datapoints are known.
 */
export const OPTOLINK_FIELD_MAP = Object.freeze({
  'raw.boilerTemperature': 'boiler.temperature',
  'raw.supplyTemperature': 'heating.supplyTemperature',
  'raw.returnTemperature': 'heating.returnTemperature',
  'raw.hotWaterTemperature': 'hotWater.temperature',
  'raw.burnerState': 'boiler.burner',
  'raw.systemPressure': 'heating.pressure',
  'raw.outsideTemperature': 'outside.temperature', // optional: boiler's own outdoor sensor
});

/** Plausibility limits; implausible readings become null and are reported. */
const LIMITS = {
  boilerTemperature: [0, 110],
  supplyTemperature: [0, 110],
  returnTemperature: [0, 110],
  hotWaterTemperature: [0, 95],
  systemPressure: [0, 4],
  outsideTemperature: [-45, 55],
};

/**
 * Convert one Optolink reading into a PARTIAL normalized current-state document.
 *
 * @param {Record<string, unknown>} raw  e.g. { boilerTemperature: 61.2, burnerState: 1, systemPressure: 1.48, ... }
 * @param {{connected?: boolean}} [options]
 * @returns {{system: object, boiler: object, heating: object, hotWater: object, outside: object, quality: {rejected: string[]}}}
 */
export function normalizeOptolinkReading(raw, { connected = true } = {}) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const rejected = [];
  const read = (key) => {
    if (r[key] === undefined || r[key] === null) return null;
    const [min, max] = LIMITS[key];
    const value = plausible(r[key], min, max);
    if (value === null) rejected.push(key);
    return value === null ? null : Math.round(value * 100) / 100;
  };

  if (!connected) {
    return { system: { optolink: false, communication: false }, boiler: {}, heating: {}, hotWater: {}, outside: {}, quality: { rejected } };
  }

  return {
    system: { optolink: true, communication: true },
    boiler: {
      temperature: read('boilerTemperature'),
      burner: bool(r.burnerState),
    },
    heating: {
      supplyTemperature: read('supplyTemperature'),
      returnTemperature: read('returnTemperature'),
      pressure: read('systemPressure'),
    },
    hotWater: { temperature: read('hotWaterTemperature') },
    outside: { temperature: read('outsideTemperature') },
    quality: { rejected },
  };
}

/**
 * Track burner state changes between readings so the API can expose
 * `burnerSince` and `burnerRuntimeMinutes`.
 *
 * @param {{burner: boolean|null, since: number|null}} previous
 * @param {boolean|null} burner current burner state
 * @param {number} now epoch ms
 */
export function trackBurnerState(previous, burner, now) {
  if (burner === null) return { burner: null, since: null, runtimeMinutes: null };
  const since = previous?.burner === burner && previous?.since ? previous.since : now;
  return { burner, since, runtimeMinutes: burner ? Math.round((now - since) / 60000) : 0 };
}

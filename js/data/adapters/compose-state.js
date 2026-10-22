/**
 * COMPOSE STATE — reference for the Pi-side aggregator
 *
 * Shows how the Pi combines independent read-only sources into ONE current
 * state document (docs/DATA_FORMAT.md) before serving GET /api/current:
 *
 *   Optolink reading ─┐
 *   Zigbee rooms ─────┼─> composeCurrentState() ─> /api/current
 *   Weather ──────────┘
 */
import { normalizeOptolinkReading } from './optolink-adapter.js';

/**
 * @param {object} parts
 * @param {ReturnType<typeof normalizeOptolinkReading>} [parts.optolink]
 * @param {object[]} [parts.rooms]  results of normalizeZigbeeSensor()
 * @param {object} [parts.weather]  normalized outside block
 * @param {{burner: boolean|null, since: number|null, runtimeMinutes: number|null}} [parts.burner]
 * @param {boolean} [parts.zigbeeOnline]
 * @param {number} [parts.now]
 */
export function composeCurrentState({ optolink, rooms = [], weather = null, burner = null, zigbeeOnline = null, now = Date.now() }) {
  const o = optolink ?? normalizeOptolinkReading(null, { connected: false });
  return {
    timestamp: new Date(now).toISOString(),
    source: 'raspberry-pi',
    system: {
      communication: o.system.communication,
      optolink: o.system.optolink,
      zigbee: zigbeeOnline,
    },
    boiler: {
      ...o.boiler,
      burnerSince: burner?.since ? new Date(burner.since).toISOString() : null,
      burnerRuntimeMinutes: burner?.runtimeMinutes ?? null,
    },
    heating: o.heating,
    hotWater: o.hotWater,
    outside: { ...(weather ?? {}), temperature: o.outside.temperature ?? weather?.temperature ?? null },
    rooms,
  };
}

/**
 * RASPBERRY PI API SOURCE  (DATA_MODE = "api")
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ This is where the Raspberry Pi connects.                              │
 * │ Expected read-only endpoints (see docs/PI_INTEGRATION.md):            │
 * │   GET {API_BASE_URL}/current                                          │
 * │   GET {API_BASE_URL}/history?period=24h|7d|30d                        │
 * │   GET {API_BASE_URL}/status                                           │
 * │   GET {API_BASE_URL}/rooms                                            │
 * │   GET {API_BASE_URL}/insights   (optional)                            │
 * │ No write endpoints exist and none may be added.                       │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * The Pi should already return normalized documents (docs/DATA_FORMAT.md).
 * The frontend normalizes again defensively in data-provider.js.
 */
import { createReadOnlyClient } from './read-only-client.js';

/** @param {object} config */
export function createApiSource(config) {
  const client = createReadOnlyClient({
    baseUrl: config.API_BASE_URL,
    timeoutMs: config.POLLING.requestTimeoutMs,
  });

  return Object.freeze({
    id: 'api',
    label: 'Raspberry Pi',
    isDemo: false,
    fetchCurrent: () => client.get('current'),
    fetchHistory: (period) => client.get('history', { period: period.id }),
    fetchRooms: () => client.get('rooms'),
    fetchStatus: () => client.get('status'),
    fetchInsights: () => client.get('insights', {}, { optional: true }),
  });
}

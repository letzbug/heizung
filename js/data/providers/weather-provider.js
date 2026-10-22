/**
 * WEATHER PROVIDER BOUNDARY
 *
 * Weather is isolated from heating data and from the UI.
 *
 *  "source" – the current-state document already contains `outside`
 *             (demo simulator, or the Pi merges weather server-side).
 *  "api"    – read-only GET {API_BASE_URL}/weather on the Pi.
 *
 * A third-party weather API must be called by the Pi, not by the browser,
 * so that API keys never reach the frontend (docs/SECURITY.md).
 */
import { createReadOnlyClient } from './read-only-client.js';

/** @param {object} config */
export function createWeatherProvider(config) {
  if (config.WEATHER_MODE === 'api' && config.DATA_MODE === 'api') {
    const client = createReadOnlyClient({ baseUrl: config.API_BASE_URL, timeoutMs: config.POLLING.requestTimeoutMs });
    return Object.freeze({
      id: 'api',
      fetchConditions: () => client.get('weather', {}, { optional: true }),
    });
  }
  return Object.freeze({
    id: 'source',
    fetchConditions: async () => null,
  });
}

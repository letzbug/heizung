import { DAY } from './time.js';

/**
 * History periods supported by the dashboard and the provider interface.
 *
 * `resolutionMinutes` is the bucket size a provider SHOULD deliver. Providers
 * may deliver a different resolution; the normalized history always carries
 * the actual value in `resolutionMinutes`.
 */
export const HISTORY_PERIODS = Object.freeze({
  '24h': Object.freeze({ id: '24h', label: '24 Stunden', tab: '24 h', durationMs: DAY, resolutionMinutes: 5 }),
  '7d': Object.freeze({ id: '7d', label: '7 Tage', tab: '7 Tage', durationMs: 7 * DAY, resolutionMinutes: 15 }),
  '30d': Object.freeze({ id: '30d', label: '30 Tage', tab: '30 Tage', durationMs: 30 * DAY, resolutionMinutes: 60 }),
});

/**
 * @param {string} id
 * @returns {typeof HISTORY_PERIODS['24h']}
 */
export function getPeriod(id) {
  const period = HISTORY_PERIODS[id];
  if (!period) throw new RangeError(`Unbekannter Zeitraum: ${id}`);
  return period;
}

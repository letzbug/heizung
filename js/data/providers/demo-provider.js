/**
 * DEMO SOURCE (version 1 default)
 *
 * Wraps the deterministic simulator. Returns raw source documents in the
 * wire format; normalization happens in data-provider.js — exactly like
 * for the Raspberry Pi API.
 */
import { createSimulator } from '../simulator.js';
import { ProviderError } from './read-only-client.js';

/** @param {object} config resolved runtime configuration */
export function createDemoSource(config) {
  const runtime = config.RUNTIME ?? {};
  const simulator = createSimulator({
    seed: config.DEMO.seed,
    rooms: config.ROOMS,
    timeZone: config.TIME_ZONE,
    location: config.LOCATION,
    scenario: runtime.scenario,
    overrides: runtime.overrides,
    now: Date.now(),
  });

  let firstRequest = true;
  async function guard() {
    if (firstRequest && runtime.delayMs > 0) await new Promise((resolve) => setTimeout(resolve, runtime.delayMs));
    firstRequest = false;
    if (runtime.scenario === 'offline') throw new ProviderError('Datenquelle nicht erreichbar (Demo-Szenario „offline“)');
  }

  return Object.freeze({
    id: 'demo',
    label: 'Demo-Simulator',
    isDemo: true,
    async fetchCurrent() {
      await guard();
      return simulator.getCurrent(Date.now());
    },
    async fetchHistory(period) {
      await guard();
      return simulator.getHistory(period, Date.now());
    },
  });
}

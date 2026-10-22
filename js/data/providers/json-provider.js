/**
 * STATIC JSON SOURCE
 *
 * Reads data/demo-current.json and data/demo-history.json. Useful for
 * testing with fixed snapshots, or for a Pi that writes JSON files into a
 * local web folder (never into the Git repository — see docs/SECURITY.md).
 */
import { timestamp } from '../../core/normalize.js';
import { ProviderError } from './read-only-client.js';

const TIME_KEYS = new Set(['timestamp', 'lastUpdate', 'last_seen', 'burnerSince', 'sunrise', 'sunset', 'from', 'to']);

/** Shift all known timestamp fields by `delta` ms (keeps demo files looking live). */
function rebase(value, delta, key = '') {
  if (Array.isArray(value)) {
    return key === 'timestamps'
      ? value.map((t) => { const ms = timestamp(t); return ms === null ? t : new Date(ms + delta).toISOString(); })
      : value.map((v) => rebase(v, delta));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rebase(v, delta, k)]));
  }
  if (TIME_KEYS.has(key)) {
    const ms = timestamp(value);
    return ms === null ? value : new Date(ms + delta).toISOString();
  }
  return value;
}

/** @param {object} config */
export function createJsonSource(config) {
  const base = String(config.JSON_BASE_URL || 'data').replace(/\/+$/, '');
  let delta = null;

  async function load(file) {
    let response;
    try {
      response = await fetch(`${base}/${file}`, { method: 'GET', cache: 'no-store' });
    } catch (cause) {
      throw new ProviderError(`${file} nicht erreichbar`, { cause });
    }
    if (!response.ok) throw new ProviderError(`${file}: HTTP ${response.status}`, { status: response.status });
    return response.json();
  }

  async function current() {
    const doc = await load('demo-current.json');
    if (!config.JSON_REBASE_TO_NOW) return doc;
    if (delta === null) {
      const ts = timestamp(doc?.timestamp);
      delta = ts === null ? 0 : Date.now() - ts;
    }
    return rebase(doc, delta);
  }

  return Object.freeze({
    id: 'json',
    label: 'Statische JSON-Dateien',
    isDemo: true,
    fetchCurrent: current,
    async fetchHistory(period) {
      if (period.id !== '24h') return null; // the static files contain 24 hours only
      if (config.JSON_REBASE_TO_NOW && delta === null) await current();
      const doc = await load('demo-history.json');
      return config.JSON_REBASE_TO_NOW ? rebase(doc, delta ?? 0) : doc;
    },
  });
}

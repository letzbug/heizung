/**
 * READ-ONLY HTTP CLIENT
 *
 * The only place in the frontend that performs network requests to the
 * Raspberry Pi. It is deliberately incapable of writing:
 *
 *  - The HTTP method is hard-coded to GET.
 *  - Only allowlisted endpoint names can be requested.
 *  - No credentials, tokens or API keys are sent from the browser.
 *
 * There is no code path that could change a heating parameter.
 */

/** Allowlisted read-only endpoints (relative to API_BASE_URL). */
export const READ_ONLY_ENDPOINTS = Object.freeze({
  current: '/current',
  history: '/history',
  status: '/status',
  rooms: '/rooms',
  weather: '/weather', // optional
  insights: '/insights', // optional, future AI/agent results
});

export class ProviderError extends Error {
  constructor(message, { status = null, cause = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    if (cause) this.cause = cause;
  }
}

/**
 * @param {{baseUrl: string, timeoutMs?: number}} options
 */
export function createReadOnlyClient({ baseUrl, timeoutMs = 10_000 }) {
  const base = String(baseUrl || '/api').replace(/\/+$/, '');
  const origin = globalThis.location?.href ?? 'http://localhost/';

  /**
   * GET an allowlisted endpoint and parse JSON.
   * @param {keyof READ_ONLY_ENDPOINTS} endpoint
   * @param {Record<string, string>} [params]
   * @param {{optional?: boolean}} [options] optional → 404 resolves to null
   */
  async function get(endpoint, params = {}, { optional = false } = {}) {
    const path = READ_ONLY_ENDPOINTS[endpoint];
    if (!path) throw new ProviderError(`Endpunkt nicht freigegeben: ${String(endpoint)}`);

    const url = new URL(base + path, origin);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        signal: controller.signal,
      });
    } catch (cause) {
      throw new ProviderError(
        cause?.name === 'AbortError' ? 'Zeitüberschreitung beim Abruf der Daten' : 'Datenquelle nicht erreichbar',
        { cause },
      );
    } finally {
      clearTimeout(timer);
    }

    if (optional && response.status === 404) return null;
    if (!response.ok) throw new ProviderError(`Datenquelle antwortet mit HTTP ${response.status}`, { status: response.status });
    try {
      return await response.json();
    } catch (cause) {
      throw new ProviderError('Antwort der Datenquelle ist kein gültiges JSON', { cause });
    }
  }

  return Object.freeze({ get });
}

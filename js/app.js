/**
 * Frank & Cameron – Heating Monitor · application entry point
 *
 * Flow:  provider (normalized data) → status + insights (analysis) → dashboard (render)
 *
 * READ-ONLY MONITORING. This application cannot control the heating system.
 */
import { CONFIG, resolveRuntimeConfig } from './config.js';
import { configureFormat } from './core/format.js';
import { createDataProvider } from './data/data-provider.js';
import { evaluateSystemStatus } from './analysis/status.js';
import { generateInsights, combineInsights } from './analysis/insights.js';
import { buildAnalysisSnapshot } from './analysis/analysis-snapshot.js';
import { createDashboard } from './ui/dashboard.js';

const config = resolveRuntimeConfig(CONFIG, window.location.search);
configureFormat({ decimalSeparator: config.DECIMAL_SEPARATOR, timeZone: config.TIME_ZONE });
document.documentElement.classList.toggle('low-power', Boolean(config.LOW_POWER));

const provider = createDataProvider(config);

const state = {
  current: null,
  currentError: null,
  status: null,
  period: config.DEFAULT_PERIOD,
  histories: new Map(), // periodId → { data, loadedAt }
  insights: [],
  externalInsights: [],
};

const dashboard = createDashboard(config, { onPeriodChange: selectPeriod });

// ---------------------------------------------------------------------------
// History cache
// ---------------------------------------------------------------------------

async function loadHistory(periodId, { force = false } = {}) {
  const cached = state.histories.get(periodId);
  if (!force && cached && Date.now() - cached.loadedAt < config.POLLING.historyMs) return cached.data;
  try {
    const data = await provider.getHistory(periodId);
    state.histories.set(periodId, { data, loadedAt: Date.now() });
    return data;
  } catch (err) {
    console.warn(`[history] ${periodId} nicht verfügbar:`, err.message);
    return cached?.data ?? null;
  }
}

const historyFor = (id) => state.histories.get(id)?.data ?? null;

// ---------------------------------------------------------------------------
// Refresh cycles
// ---------------------------------------------------------------------------

async function refreshCurrent() {
  try {
    state.current = await provider.getCurrentState();
    state.currentError = null;
  } catch (err) {
    state.currentError = err;
    console.warn('[current] Abruf fehlgeschlagen:', err.message);
  }
  render();
}

async function refreshHistory({ force = false } = {}) {
  const ids = new Set([state.period, config.ANALYSIS.period, '24h']);
  await Promise.all([...ids].map((id) => loadHistory(id, { force })));
  state.externalInsights = await provider.getExternalInsights().catch(() => []);
  dashboard.renderHistory(historyFor(state.period));
  render();
}

async function selectPeriod(periodId) {
  state.period = periodId;
  dashboard.renderHistory(historyFor(periodId));
  const data = await loadHistory(periodId);
  if (state.period === periodId) dashboard.renderHistory(data);
}

function evaluate(now = Date.now()) {
  state.status = evaluateSystemStatus(state.current, {
    config,
    now,
    history: historyFor(config.ANALYSIS.period),
    error: state.currentError,
  });
}

function render() {
  const now = Date.now();
  evaluate(now);
  dashboard.renderState({
    current: state.current,
    status: state.status,
    now,
    providerLabel: provider.label,
    isDemo: provider.isDemo || Boolean(state.current?.isDemo),
  });
  const local = state.current
    ? generateInsights(state.current, historyFor(config.ANALYSIS.period), {
      config, now, recent: historyFor('24h'), status: state.status,
    })
    : [];
  state.insights = combineInsights(local, state.externalInsights);
  dashboard.renderInsights(state.insights, {
    basis: state.externalInsights.length ? 'Regelanalyse + Agent' : 'Lokale Regelanalyse · 7-Tage-Verlauf',
  });
}

// ---------------------------------------------------------------------------
// Scheduling (pauses while the tab is hidden)
// ---------------------------------------------------------------------------

function loop(task, intervalMs) {
  let timer = null;
  const run = async () => {
    clearTimeout(timer);
    if (!document.hidden) await task();
    timer = setTimeout(run, intervalMs);
  };
  timer = setTimeout(run, intervalMs);
  return run;
}

async function start() {
  dashboard.setPhase('loading');
  await refreshHistory();
  await refreshCurrent();
  dashboard.setPhase(state.current ? 'ready' : 'error');

  const runCurrent = loop(async () => {
    await refreshCurrent();
    dashboard.setPhase(state.current ? 'ready' : 'error');
  }, config.POLLING.currentMs);
  const runHistory = loop(() => refreshHistory({ force: true }), config.POLLING.historyMs);

  // Clock: local only, no polling.
  setInterval(() => {
    if (!document.hidden) dashboard.tick(Date.now(), state.current, state.status);
  }, 1000);
  // Re-evaluate staleness without fetching.
  setInterval(() => { if (!document.hidden) render(); }, config.POLLING.statusTickMs);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    runCurrent();
    const loadedAt = state.histories.get(state.period)?.loadedAt ?? 0;
    if (Date.now() - loadedAt > config.POLLING.historyMs) runHistory();
  });
}

// Read-only debugging handle (no setters).
Object.defineProperty(window, 'heatingMonitor', {
  value: Object.freeze({
    version: config.APP.version,
    mode: config.DATA_MODE,
    /** Sanitized snapshot for analysis (same shape as data/analysis-snapshot.json). */
    analysisSnapshot: () => buildAnalysisSnapshot({
      current: state.current,
      history: historyFor(config.ANALYSIS.period),
      status: state.status,
      insights: state.insights,
      config,
    }),
  }),
});

start();

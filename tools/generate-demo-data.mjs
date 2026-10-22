#!/usr/bin/env node
/**
 * Regenerates the static demo files from the deterministic simulator:
 *   data/demo-current.json     current-state document (wire format)
 *   data/demo-history.json     24-hour history (wire format)
 *   data/analysis-snapshot.json  sanitized export for AI analysis
 *
 * Usage: node tools/generate-demo-data.mjs [ISO-timestamp]
 * Default timestamp: 2026-10-22T07:42:18+02:00 (reproducible output)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONFIG, resolveRuntimeConfig } from '../js/config.js';
import { createSimulator } from '../js/data/simulator.js';
import { HISTORY_PERIODS } from '../js/core/periods.js';
import { normalizeCurrentState, normalizeHistory } from '../js/core/normalize.js';
import { evaluateSystemStatus } from '../js/analysis/status.js';
import { generateInsights } from '../js/analysis/insights.js';
import { buildAnalysisSnapshot } from '../js/analysis/analysis-snapshot.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const at = Date.parse(process.argv[2] ?? '2026-10-22T07:42:18+02:00');
if (!Number.isFinite(at)) {
  console.error('Invalid timestamp');
  process.exit(1);
}

const config = resolveRuntimeConfig(CONFIG, '');
const sim = createSimulator({
  seed: config.DEMO.seed, rooms: config.ROOMS, timeZone: config.TIME_ZONE, location: config.LOCATION, now: at,
});

const currentDoc = sim.getCurrent(at);
const historyDoc = sim.getHistory(HISTORY_PERIODS['24h'], at);
const history7 = normalizeHistory(sim.getHistory(HISTORY_PERIODS['7d'], at), { period: HISTORY_PERIODS['7d'] });
const history24 = normalizeHistory(historyDoc, { period: HISTORY_PERIODS['24h'] });
const current = normalizeCurrentState(currentDoc, { rooms: config.ROOMS });
const status = evaluateSystemStatus(current, { config, now: at, history: history7 });
const insights = generateInsights(current, history7, { config, now: at, recent: history24, status });
const snapshot = buildAnalysisSnapshot({ current, history: history7, status, insights, config, now: at });

const write = (file, data, compact = false) => {
  writeFileSync(join(root, 'data', file), `${JSON.stringify(data, null, compact ? 0 : 2)}\n`);
  console.log(`wrote data/${file}`);
};
write('demo-current.json', currentDoc);
write('demo-history.json', historyDoc, true);
write('analysis-snapshot.json', snapshot);
console.log(`status: ${status.headline} · insights: ${insights.length}`);

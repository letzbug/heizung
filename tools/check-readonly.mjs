#!/usr/bin/env node
/**
 * READ-ONLY GUARD
 * Fails (exit 1) if the frontend contains anything that could write to the
 * heating system, or if secrets appear in committed files.
 * Usage: node tools/check-readonly.mjs
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const CODE_DIRS = ['js'];
const SECRET_SCAN_DIRS = ['js', 'data', 'css', 'assets', 'index.html', 'package.json'];

const CODE_RULES = [
  [/method\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/i, 'write HTTP method'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest (use the read-only client)'],
  [/\bsendBeacon\b/, 'navigator.sendBeacon'],
  [/\bnew\s+WebSocket\b/, 'WebSocket (bidirectional channel needs review)'],
  [/\.publish\s*\(/, 'MQTT-style publish()'],
  [/\b(set|write|toggle|change)(Boiler|Burner|Pump|Valve|Setpoint|Schedule|HeatingCurve|OperatingMode|HotWater|RoomTemperature|Temperature)\w*\s*\(/, 'heating control function'],
  [/['"`]\/(api\/)?(setTemperature|burner|pump|schedule|setpoint|mode)['"`]/i, 'control endpoint path'],
];

const SECRET_RULES = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/service_role/i, 'Supabase service-role reference'],
  [/\bsk-[A-Za-z0-9]{20,}/, 'API secret key'],
  [/\bghp_[A-Za-z0-9]{20,}/, 'GitHub token'],
  [/\bxai-[A-Za-z0-9]{20,}/, 'xAI key'],
  [/(password|passwd|token|secret|api[_-]?key)\s*[:=]\s*['"][^'"\s]{6,}['"]/i, 'hard-coded credential'],
];

function files(path) {
  const abs = join(root, path);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [abs];
  return readdirSync(abs).flatMap((name) => files(join(path, name)));
}

const problems = [];
for (const file of CODE_DIRS.flatMap(files).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const [re, label] of CODE_RULES) if (re.test(line)) problems.push(`${relative(root, file)}:${i + 1}  ${label}`);
  });
}
for (const file of SECRET_SCAN_DIRS.flatMap(files).filter((f) => /\.(js|json|html|css|svg|md)$/.test(f))) {
  const text = readFileSync(file, 'utf8');
  for (const [re, label] of SECRET_RULES) if (re.test(text)) problems.push(`${relative(root, file)}  possible secret: ${label}`);
}
if (existsSync(join(root, '.env'))) problems.push('.env exists in the repository folder – secrets belong on the Pi, not in Git');

const client = readFileSync(join(root, 'js/data/providers/read-only-client.js'), 'utf8');
if (!/method:\s*'GET'/.test(client)) problems.push('read-only-client.js: GET method no longer hard-coded');

if (problems.length) {
  console.error('READ-ONLY CHECK FAILED\n' + problems.map((p) => `  ✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log('READ-ONLY CHECK PASSED – no write paths, no control endpoints, no secrets found.');

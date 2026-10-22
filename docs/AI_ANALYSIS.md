# AI / agent analysis (e.g. Grok bot)

## Role

**Read and analyse only.** An agent may look at measurements and suggest; it never acts on
the heating system, the Pi, MQTT or the repository's protected branches.

May analyse: normalized current measurements, historical measurements, sensor health,
system events, derived statistics.

Does **not** need and must not receive: heating control, MQTT write access, Pi administration,
credentials, Supabase service keys, network passwords.

## Input: sanitized snapshot

`data/analysis-snapshot.json` (demo) is built by `buildAnalysisSnapshot()` in
`js/analysis/analysis-snapshot.js`. In the browser: `window.heatingMonitor.analysisSnapshot()`.

```json
{
  "schema": "frank-cameron.heating-monitor.analysis-snapshot/v1",
  "generatedAt": "2026-10-22T07:42:18+02:00",
  "readOnly": true,
  "dataMode": "demo",
  "system": { "status": "normal", "boiler": {}, "heating": {}, "hotWater": {}, "outside": {} },
  "rooms": [ { "id": "living-room", "temperature": 21.2, "online": true } ],
  "historySummary": { "period": "7d", "burner": { "runtimeHours": 0, "starts": 0 }, "pressure": { "trendBarPerDay": 0 } },
  "events": [ { "type": "burner-run", "start": "…", "end": "…", "minutes": 28 } ],
  "insights": [],
  "privacy": { "containsCredentials": false, "containsLocation": false, "containsPersonalData": false }
}
```

Excluded on purpose: coordinates, addresses, IPs, device IEEE addresses, MQTT topics,
tokens, person names.

## Output: insights

The agent returns insights in the same shape as Cameron Insight (`docs/DATA_FORMAT.md`).
The Pi serves them read-only at `GET /api/insights`. The frontend merges them with local rules:

```
local rules  generateInsights(current, history, …)   ─┐
agent        GET /api/insights → normalizeInsight()  ─┼→ combineInsights() → insight panel
```

Agent text is validated, length-limited and rendered as plain text (no HTML).

## Where it connects

- Input: snapshot export (Pi generates it periodically, or the agent reads the GET API).
- Output: `getExternalInsights()` in `js/data/data-provider.js` → `combineInsights()` in
  `js/analysis/insights.js` → `js/ui/insight-panel.js`.

## Current local rules (v1, deterministic)

| Rule | Basis |
|---|---|
| Burner runtime vs comparable days | last 24 h vs previous 24-h windows with similar outdoor temperature (±2.5 K) |
| Living-room heat-up time | first morning crossing of target − 0.3 K vs median of previous days |
| Pressure stability / loss | 7-day range and linear trend (bar/day) |
| Return temperature | 24-h mean vs comparable days (±3 K) |
| Burner cycling | starts per 24 h (warning above 30) |
| Sensor health | offline sensors, low battery |
| Hot water | below 45 °C |
| Data quality | missing key values |

## Repository access

See `BOT_RULES.md`. Recommended: a read-only token scoped to this repository, no
`contents:write`, no secrets access, no deployment rights.

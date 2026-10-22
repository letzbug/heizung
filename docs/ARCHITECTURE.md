# Architecture

## Principle

```
SENSORS / DATA SOURCE        simulator · static JSON · Raspberry Pi API
        ↓
NORMALIZATION                js/core/normalize.js  (+ adapters on the Pi)
        ↓
DATA PROVIDER                js/data/data-provider.js   ← the only interface the UI uses
        ↓
DASHBOARD                    js/ui/*                    (render only)
        ↓
ANALYSIS                     js/analysis/*              (status, Cameron Insight, snapshot)
```

The UI never sees raw data. Switching `CONFIG.DATA_MODE` from `"demo"` to `"api"` changes the
source; everything above the provider stays untouched.

**Read-only by construction:** the only network code is `read-only-client.js` (GET hard-coded,
endpoint allowlist). No module contains a write path. `tools/check-readonly.mjs` enforces this.

## Modules

| Layer | File | Responsibility |
|---|---|---|
| Bootstrap | `js/app.js` | polling, caching, wiring provider → analysis → dashboard |
| Config | `js/config.js` | data mode, polling, thresholds, rooms, URL preview overrides |
| Core | `js/core/time.js` | time-zone aware helpers (Europe/Luxembourg) |
| | `js/core/format.js` | display formatting; never prints `undefined`/`NaN`/`null` |
| | `js/core/normalize.js` | the normalized model and defensive normalization |
| | `js/core/periods.js` | history periods 24h / 7d / 30d |
| Data | `js/data/data-provider.js` | provider facade (interface below) |
| | `js/data/simulator.js` | deterministic demo model |
| | `js/data/providers/demo-provider.js` | demo source (v1 default) |
| | `js/data/providers/json-provider.js` | static JSON source |
| | `js/data/providers/api-provider.js` | **Raspberry Pi source** |
| | `js/data/providers/weather-provider.js` | weather boundary |
| | `js/data/providers/read-only-client.js` | the only HTTP client (GET only) |
| | `js/data/adapters/optolink-adapter.js` | **Optolink → normalized** (runs on the Pi) |
| | `js/data/adapters/zigbee-adapter.js` | **Zigbee payload → room** (runs on the Pi) |
| | `js/data/adapters/weather-adapter.js` | weather payload → `outside` |
| | `js/data/adapters/compose-state.js` | reference: Pi combines parts into `/api/current` |
| Analysis | `js/analysis/status.js` | severity + status panel items |
| | `js/analysis/insights.js` | Cameron Insight rules + agent insight contract |
| | `js/analysis/analysis-snapshot.js` | sanitized export for AI agents |
| | `js/analysis/stats.js` | statistics helpers |
| UI | `js/ui/dashboard.js` | DOM orchestration |
| | `js/ui/metric-cards.js` | data-driven top cards |
| | `js/ui/flow-diagram.js` | heating flow SVG |
| | `js/ui/weather-scenes.js` | `selectOutdoorScene()` + scene renderer |
| | `js/ui/charts.js` | SVG time-series charts |
| | `js/ui/room-cards.js`, `status-panel.js`, `insight-panel.js`, `weather-card.js` | panels |

## Provider interface

```js
const provider = createDataProvider(config);
await provider.getCurrentState();       // CurrentState
await provider.getHistory('24h');       // History ('24h' | '7d' | '30d')
await provider.getRooms();              // Room[]
await provider.getSystemStatus();       // CurrentState.system
await provider.getOutdoorConditions();  // CurrentState.outside
await provider.getExternalInsights();   // raw agent insights or []
```

A source implements `fetchCurrent()` and `fetchHistory(period)`; optionally `fetchRooms()`,
`fetchStatus()`, `fetchInsights()`. Normalization happens once, in the facade.

## Demo data flow

1. `demo-provider.js` creates the simulator with the configured seed.
2. The simulator runs a minute-step model from a day-aligned anchor ~33 days back and keeps
   5-minute buckets. History and current state come from the same run → always consistent.
3. It returns **wire-format documents** (identical to what the Pi API will return).
4. `data-provider.js` normalizes them → dashboard and analysis.

Same clock time = same values (seeded noise, no `Math.random`). Reloading does not reshuffle.

## Weather

Weather is isolated in `weather-provider.js` + `weather-adapter.js`. In `"source"` mode the
current-state document carries `outside`; in `"api"` mode the Pi serves `GET /api/weather`.
Third-party weather APIs are called by the Pi, never by the browser (no keys in the frontend).

## Outdoor scenes

`selectOutdoorScene(outside, now)` in `js/ui/weather-scenes.js` is the single rule:
temperature band (winter < 0 · cold 0–8 · cool 8–15 · mild 15–25 · summer > 25), weather
override (snow → winter), day/night from sunrise/sunset. The renderer draws procedural SVG
or a registered image (`assets/weather/README.md`).

## Performance

No framework, no dependencies, ~4,500 lines of JS. Current state every 30 s, history every 5 min,
clock updated locally. Polling pauses while the tab is hidden. Animations are CSS-only, run only
while the burner is active, and are disabled by `prefers-reduced-motion` or `LOW_POWER`.

## Preview URLs (demo only)

`?scenario=stale|optolink-offline|sensor-offline|zigbee-offline|low-battery|pressure-low|pressure-critical|overheat|missing|offline`
`?outside=-4&weather=snow` · `?delay=2500` (loading state) · `?mode=json` · `?lowpower=1` · `?demobadge=0`

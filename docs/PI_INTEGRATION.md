# Raspberry Pi integration

## Target

```
Viessmann ──Optolink──┐
Zigbee sensors ──Z2M──┼──> Raspberry Pi: collectors → adapters → store → read-only HTTP API
Weather API ──────────┘                                                  │
                                                                         ▼
                                                       Browser: api-provider.js → dashboard
```

## Where the Pi connects in the frontend

**`js/data/providers/api-provider.js`** — activated with

```js
// js/config.js
DATA_MODE: 'api',
API_BASE_URL: '/api',   // same origin recommended (see CSP below)
```

Nothing else in the frontend changes. Requests go through `read-only-client.js`
(GET only, allowlisted endpoints, 10 s timeout, no credentials).

## Read-only endpoints (the only ones that may exist)

| Method | Path | Response |
|---|---|---|
| GET | `/api/current` | current state (`docs/DATA_FORMAT.md`) |
| GET | `/api/history?period=24h\|7d\|30d` | history, column format |
| GET | `/api/status` | `{ system: {...} }` (optional) |
| GET | `/api/rooms` | rooms array (optional) |
| GET | `/api/weather` | outside block (optional, `WEATHER_MODE: 'api'`) |
| GET | `/api/insights` | agent insights (optional, 404 = none) |

## Forbidden — never implement

```
POST /setTemperature   POST /burner   POST /pump   POST /schedule
PUT/PATCH/DELETE on anything
any endpoint that writes an Optolink datapoint or publishes to MQTT */set topics
```

The Pi service should not even hold code that can write datapoints. If a library offers
write functions, wrap it so only read functions are reachable.

## Suggested Pi layout (not part of this repo)

```
/opt/heating-monitor/
  collector-optolink    reads datapoints every 30–60 s → normalizeOptolinkReading()
  collector-zigbee      subscribes zigbee2mqtt/# (read) → normalizeZigbeeSensor()
  collector-weather     fetches weather (API key stays here) → normalizeWeather()
  store                 SQLite / time-series, 5-min buckets, retention ≥ 35 days
  api                   GET-only HTTP server, serves static frontend + /api/*
  .env                  secrets (never in Git)
```

The adapters in `js/data/adapters/` are dependency-free ES modules and run unchanged in Node
on the Pi. `compose-state.js` shows how the parts become one `/api/current` document.

## Polling and load

- Frontend: current state every 30 s, history every 5 min (`CONFIG.POLLING`), paused while hidden.
- Pi: cache `/api/history` responses for at least 60 s.
- Enable `LOW_POWER: true` for a kiosk display on the Pi itself (no continuous animation).

## Hosting

- Serve the frontend from the Pi (same origin as `/api`) — simplest and the CSP already allows it.
- Different origin: add it to `connect-src` in the CSP meta tag of `index.html` and enable
  CORS for GET only on the Pi.
- Access from outside the home network: VPN (e.g. WireGuard) or an authenticated reverse proxy
  on the Pi. Do not put tokens into the frontend.

## Privacy

Live measurements are served by the Pi. They are **not** committed to Git. `data/` in this
repository contains only generated demo data.

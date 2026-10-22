# Data format

The Raspberry Pi API, the simulator and the static JSON files all deliver this **wire format**.
The frontend normalizes it again defensively (`js/core/normalize.js`).

General rules

- Any field may be missing or `null`. Missing values are shown as `—` / `Keine Daten`.
- Timestamps: ISO 8601 with offset (`2026-10-22T07:42:18+02:00`); epoch ms/s are accepted.
- Temperatures °C, pressure bar, percentages 0–100.
- Implausible values are discarded (e.g. pressure outside 0–6 bar → `null`).
- Unknown fields are ignored.

## Current state — `GET /api/current`

```json
{
  "timestamp": "2026-10-22T07:42:18+02:00",
  "source": "raspberry-pi",
  "system": {
    "status": "normal",
    "message": null,
    "communication": true,
    "optolink": true,
    "zigbee": true
  },
  "boiler": {
    "temperature": 61.0,
    "burner": true,
    "burnerSince": "2026-10-22T07:05:00+02:00",
    "burnerRuntimeMinutes": 37,
    "modulation": 65
  },
  "heating": {
    "supplyTemperature": 58.0,
    "returnTemperature": 44.0,
    "pressure": 1.48,
    "pump": true
  },
  "hotWater": { "temperature": 53.0, "target": 55 },
  "outside": {
    "temperature": 7.8,
    "weather": "cloudy",
    "humidity": 87,
    "min": 4.1,
    "max": 9.2,
    "sunrise": "2026-10-22T08:12:00+02:00",
    "sunset": "2026-10-22T18:26:00+02:00",
    "isDay": false
  },
  "rooms": [
    {
      "id": "living-room",
      "name": "Wohnzimmer",
      "temperature": 21.4,
      "target": 21.0,
      "humidity": 47,
      "battery": 92,
      "signal": 88,
      "lastUpdate": "2026-10-22T07:41:30+02:00"
    }
  ]
}
```

| Field | Notes |
|---|---|
| `system.status` | optional status reported by the source: `normal` / `warning` / `critical`. The dashboard evaluates its own status and takes the worse of both. |
| `system.optolink` | `false` → "Optolink getrennt", boiler values shown as missing |
| `system.zigbee` | `false` → Zigbee network unreachable |
| `boiler.burner` | boolean (also accepts `1/0`, `"on"/"off"`) |
| `boiler.burnerSince` | time of the last burner state change; enables a live "Seit … Minuten" |
| `boiler.burnerRuntimeMinutes` | runtime of the current run; `0` when off |
| `outside.weather` | `clear`, `partly-cloudy`, `cloudy`, `fog`, `rain`, `snow` (synonyms such as `overcast`, `mist`, `drizzle` are mapped) |
| `outside.isDay` | optional; otherwise derived from sunrise/sunset |
| `rooms[].target` | **display only** — never editable |
| `rooms[].signal` | 0–100 %. Zigbee `linkquality` 0–255 is converted by the Zigbee adapter |
| `rooms[].lastUpdate` | sensor considered offline after `FRESHNESS.sensorOfflineAfterSeconds` (default 1 h) |

Rooms are generated from the data. `CONFIG.ROOMS` supplies order, names, icons and a fallback
target; configured rooms missing from the data stay visible as "Keine Daten".

## History — `GET /api/history?period=24h|7d|30d`

Column format (compact, preferred):

```json
{
  "period": "24h",
  "from": "2026-10-21T07:40:00+02:00",
  "to": "2026-10-22T07:40:00+02:00",
  "resolutionMinutes": 5,
  "timestamps": ["2026-10-21T07:45:00+02:00", "…"],
  "series": {
    "boilerTemperature":   [62.1, "…"],
    "supplyTemperature":   [58.4, "…"],
    "returnTemperature":   [44.0, "…"],
    "hotWaterTemperature": [52.3, "…"],
    "outsideTemperature":  [7.9, "…"],
    "pressure":            [1.48, "…"],
    "burnerActive":        [1, "…"]
  },
  "rooms": { "living-room": [20.66, "…"] }
}
```

- Each value describes the bucket **ending** at its timestamp.
- `burnerActive` is the share of the bucket the burner was on (0…1). At ≤ 10 min resolution
  it is drawn as on/off steps, at coarser resolution as runtime share.
- Gaps: `null`. Charts break the line instead of interpolating.
- Recommended resolutions: 24h → 5 min, 7d → 15 min, 30d → 60 min.

Row format is also accepted: `{ "points": [ { "t": "…", "boilerTemperature": 62.1, "rooms": { "living-room": 20.7 } } ] }`.

## Status — `GET /api/status` (optional)

`{ "system": { …same as current.system… } }`

## Rooms — `GET /api/rooms` (optional)

`[ …same as current.rooms… ]`

## Insights — `GET /api/insights` (optional, future agent)

```json
[
  {
    "id": "burner-runtime",
    "severity": "info",
    "title": "Brennerlaufzeit",
    "message": "Brennerlaufzeit +18 % gegenüber vergleichbaren Tagen.",
    "metric": "+18%",
    "highlight": "+18%",
    "confidence": 0.82,
    "category": "burner"
  }
]
```

Validated by `normalizeInsight()`; text is length-limited and rendered as plain text.

## Analysis snapshot

See `docs/AI_ANALYSIS.md` and `data/analysis-snapshot.json`.

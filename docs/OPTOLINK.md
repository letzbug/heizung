# Optolink

## Path

```
Viessmann boiler
   ↓  optical interface (Optolink)
Raspberry Pi  (USB Optolink adapter)
   ↓  read-only collector
Optolink adapter   js/data/adapters/optolink-adapter.js → normalizeOptolinkReading()
   ↓
normalized data  (boiler, heating, hotWater, outside)
   ↓
dashboard API    GET /api/current, /api/history
```

## Normalization point

**`normalizeOptolinkReading(raw, { connected })`** in `js/data/adapters/optolink-adapter.js`
converts one reading into the normalized blocks, applies plausibility limits and reports
rejected values. `trackBurnerState()` derives `burnerSince` / `burnerRuntimeMinutes`.

## Conceptual placeholders

> **Exact Optolink datapoints will be added after reading the real installation.**

No real Viessmann datapoint addresses are used or invented in this repository.

| Placeholder | Normalized field |
|---|---|
| `raw.boilerTemperature` | `boiler.temperature` |
| `raw.supplyTemperature` | `heating.supplyTemperature` |
| `raw.returnTemperature` | `heating.returnTemperature` |
| `raw.hotWaterTemperature` | `hotWater.temperature` |
| `raw.burnerState` | `boiler.burner` |
| `raw.systemPressure` | `heating.pressure` |
| `raw.outsideTemperature` (optional) | `outside.temperature` |

## Steps once the hardware is available

1. Identify the boiler model, controller and protocol variant (KW / P300).
2. List the readable datapoints of this installation (document them in this file).
3. Check which values exist at all — not every installation reports return temperature or
   system pressure electronically.
4. Map them in `OPTOLINK_FIELD_MAP`; keep the normalized names unchanged.
5. Verify units and scaling against the boiler display.
6. Confirm the collector opens the interface **read-only**.

## Rules

- Read only. No datapoint is ever written — not even "harmless" ones.
- If the interface is unavailable, report `system.optolink: false` and omit values; the
  dashboard shows "Optolink getrennt".
- Never guess values. Missing stays missing.

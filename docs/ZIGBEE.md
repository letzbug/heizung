# Zigbee room sensors

## Path

```
Zigbee temperature sensor → coordinator (USB stick) → Zigbee2MQTT → MQTT broker (on the Pi)
   → collector (subscribe, read only) → normalizeZigbeeSensor() → rooms[] in /api/current
```

## Normalization point

**`normalizeZigbeeSensor(payload, roomConfig, { receivedAt })`** in
`js/data/adapters/zigbee-adapter.js`. Manufacturer-neutral: it looks for common field names.

| Normalized | Accepted payload fields (first match wins) |
|---|---|
| `temperature` | `temperature`, `local_temperature`, `temp`, `measured_temperature`, `currentTemperature` |
| `humidity` | `humidity`, `relative_humidity`, `rh` |
| `battery` | `battery`, `battery_percentage`, `batteryPercentage`, `battery_level` |
| `signal` | `linkquality`, `link_quality`, `lqi` → converted 0–255 → 0–100 % |
| `lastUpdate` | `last_seen`, `lastSeen`, `last_update`, `time`, `timestamp` (else receive time) |
| `target` | room config target, else `occupied_heating_setpoint` / `current_heating_setpoint` (display only) |

Example:

```js
normalizeZigbeeSensor(
  { temperature: 21.37, humidity: 47, battery: 92, linkquality: 224, last_seen: '2026-10-22T07:41:30+02:00' },
  { id: 'living-room', name: 'Wohnzimmer', target: 21 },
);
// → { id: 'living-room', name: 'Wohnzimmer', temperature: 21.4, target: 21, humidity: 47,
//     battery: 92, signal: 88, lastUpdate: '2026-10-22T05:41:30.000Z' }
```

## Room mapping

`CONFIG.ROOMS[].zigbee` maps devices to rooms:

```js
{ id: 'living-room', name: 'Wohnzimmer', icon: 'sofa', target: 21.0,
  zigbee: { friendlyName: 'sensor_wohnzimmer',
            fields: { temperature: 'local_temperature' },   // optional override
            temperatureScale: 0.01,                         // optional, for centi-degrees
            linkqualityMax: 255 } }                         // optional
```

`findRoomForTopic('zigbee2mqtt/sensor_wohnzimmer', CONFIG.ROOMS)` returns the room.

## Zigbee2MQTT notes

- Enable `last_seen` (ISO format) in Zigbee2MQTT so offline detection works.
- Battery sensors may report only on change; the offline threshold is 1 h
  (`FRESHNESS.sensorOfflineAfterSeconds`). Adjust to the sensor's reporting interval.
- The collector **subscribes only**. It never publishes to `zigbee2mqtt/*/set` — thermostatic
  valves must not be controlled by this project.
- MQTT credentials live in the Pi's `.env`, never in this repository.

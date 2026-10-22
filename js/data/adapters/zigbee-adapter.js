/**
 * ZIGBEE ADAPTER — vendor-neutral room sensor normalization
 *
 * Path: Zigbee sensor → coordinator → Zigbee2MQTT (or similar) → Pi → THIS ADAPTER → normalized room
 *
 * Pure function, no MQTT access, no DOM. Intended to run on the Pi; it is
 * also usable in the browser for tests. It only READS sensor payloads.
 */
import { num, timestamp } from '../../core/normalize.js';

/** Common field names across manufacturers / converters. First match wins. */
export const ZIGBEE_FIELD_ALIASES = Object.freeze({
  temperature: ['temperature', 'local_temperature', 'temp', 'measured_temperature', 'currentTemperature'],
  humidity: ['humidity', 'relative_humidity', 'rh'],
  battery: ['battery', 'battery_percentage', 'batteryPercentage', 'battery_level'],
  linkquality: ['linkquality', 'link_quality', 'lqi'],
  lastSeen: ['last_seen', 'lastSeen', 'last_update', 'time', 'timestamp'],
  // Thermostatic valves may report a setpoint. Shown as information only.
  target: ['occupied_heating_setpoint', 'current_heating_setpoint', 'setpoint'],
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Normalize one Zigbee sensor payload into the room model.
 *
 * @param {Record<string, unknown>} payload  e.g. Zigbee2MQTT state message
 * @param {{id: string, name: string, target?: number, zigbee?: {
 *   fields?: Record<string,string>, temperatureScale?: number, linkqualityMax?: number
 * }}} roomConfig
 * @param {{receivedAt?: number}} [options]
 */
export function normalizeZigbeeSensor(payload, roomConfig, { receivedAt = Date.now() } = {}) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const z = roomConfig?.zigbee ?? {};

  const pick = (field) => {
    const keys = [z.fields?.[field], ...ZIGBEE_FIELD_ALIASES[field]].filter(Boolean);
    for (const key of keys) if (p[key] !== undefined && p[key] !== null) return p[key];
    return null;
  };

  let temperature = num(pick('temperature'));
  if (temperature !== null && Number.isFinite(z.temperatureScale)) temperature *= z.temperatureScale;
  if (temperature !== null && (temperature < -40 || temperature > 85)) temperature = null;

  const humidity = num(pick('humidity'));
  const battery = num(pick('battery'));
  const lq = num(pick('linkquality'));
  const lqMax = Number.isFinite(z.linkqualityMax) ? z.linkqualityMax : 255;
  const lastSeen = timestamp(pick('lastSeen')) ?? receivedAt;
  const sensorTarget = num(pick('target'));

  return {
    id: roomConfig.id,
    name: roomConfig.name,
    temperature: temperature === null ? null : Math.round(temperature * 10) / 10,
    target: Number.isFinite(roomConfig.target) ? roomConfig.target : sensorTarget, // display only
    humidity: humidity === null ? null : clamp(Math.round(humidity), 0, 100),
    battery: battery === null ? null : clamp(Math.round(battery), 0, 100),
    signal: lq === null ? null : clamp(Math.round((lq / lqMax) * 100), 0, 100),
    lastUpdate: new Date(lastSeen).toISOString(),
  };
}

/**
 * Find the room config for a Zigbee2MQTT topic like "zigbee2mqtt/sensor_wohnzimmer".
 * @param {string} topic
 * @param {Array<{zigbee?: {friendlyName?: string, ieee?: string}}>} rooms
 */
export function findRoomForTopic(topic, rooms) {
  const name = String(topic ?? '').split('/').pop();
  return rooms.find((r) => r.zigbee?.friendlyName === name || r.zigbee?.ieee === name) ?? null;
}

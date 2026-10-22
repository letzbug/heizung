/**
 * WEATHER ADAPTER
 *
 * Maps external weather payloads onto the normalized `outside` block and
 * merges them with the measured outdoor temperature.
 * No network access here — fetching happens on the Pi or in weather-provider.js.
 */
import { normalizeCondition, normalizeOutside, num } from '../../core/normalize.js';

/** WMO weather interpretation codes (used by e.g. Open-Meteo) → condition. */
export function wmoCodeToCondition(code) {
  const c = num(code);
  if (c === null) return null;
  if (c === 0) return 'clear';
  if (c === 1 || c === 2) return 'partly-cloudy';
  if (c === 3) return 'cloudy';
  if (c === 45 || c === 48) return 'fog';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95) return 'rain';
  return null;
}

/**
 * Normalize a weather payload. Accepts the normalized `outside` shape plus
 * `weatherCode` (WMO) as an alternative to `weather`.
 * @param {object} raw
 */
export function normalizeWeather(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const weather = normalizeCondition(raw.weather ?? raw.condition) ?? wmoCodeToCondition(raw.weatherCode ?? raw.weather_code);
  return normalizeOutside({ ...raw, weather });
}

/**
 * Merge measured outdoor data with weather data. The measured temperature
 * (e.g. the boiler's outdoor sensor) wins; weather fills the rest.
 */
export function mergeOutdoorConditions(measured, weather) {
  if (!weather) return measured;
  const pick = (a, b) => (a === null || a === undefined ? b : a);
  return {
    temperature: pick(measured?.temperature, weather.temperature),
    weather: pick(measured?.weather, weather.weather),
    humidity: pick(measured?.humidity, weather.humidity),
    min: pick(measured?.min, weather.min),
    max: pick(measured?.max, weather.max),
    sunrise: pick(measured?.sunrise, weather.sunrise),
    sunset: pick(measured?.sunset, weather.sunset),
    isDay: pick(measured?.isDay, weather.isDay),
  };
}

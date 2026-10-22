/**
 * Time helpers bound to an IANA time zone (default: Europe/Luxembourg).
 *
 * Pure functions without DOM access, so they work in the browser and in
 * Node (see tools/generate-demo-data.mjs).
 */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

const zoneCache = new Map();

/**
 * Create (or reuse) a time-zone helper.
 *
 * @param {string} [timeZone] IANA zone such as "Europe/Luxembourg".
 *   Falls back to the runtime's local zone when missing or unsupported.
 * @returns {TimeZone}
 */
export function createTimeZone(timeZone) {
  const key = timeZone || '__local__';
  if (zoneCache.has(key)) return zoneCache.get(key);

  let formatter = null;
  if (timeZone) {
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      formatter = null;
    }
  }

  const offsets = new Map();

  /** Offset (local wall clock minus UTC) in ms at the given instant. */
  function offsetMs(ms) {
    if (!formatter) return -new Date(ms).getTimezoneOffset() * MINUTE;
    const hourKey = Math.floor(ms / HOUR);
    let offset = offsets.get(hourKey);
    if (offset === undefined) {
      const at = hourKey * HOUR;
      const p = {};
      for (const part of formatter.formatToParts(new Date(at))) p[part.type] = part.value;
      const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      offset = wall - at;
      if (offsets.size > 5000) offsets.clear();
      offsets.set(hourKey, offset);
    }
    return offset;
  }

  const wall = (ms) => ms + offsetMs(ms);

  /** @typedef {ReturnType<typeof createTimeZone>} TimeZone */
  const zone = {
    timeZone: timeZone || null,
    offsetMs,
    /** Wall-clock milliseconds: local time expressed as if it were UTC. */
    wall,
    /** Convert a wall-clock value back to a real instant. */
    fromWall(wallMs) {
      const guess = wallMs - offsetMs(wallMs);
      return wallMs - offsetMs(guess);
    },
    /** Local hour as a float, 0 ≤ h < 24. */
    hour(ms) {
      const w = wall(ms);
      return (((w % DAY) + DAY) % DAY) / HOUR;
    },
    /** Monotonic local day number (days since 1970-01-01 local). */
    dayIndex(ms) {
      return Math.floor(wall(ms) / DAY);
    },
    /** 0 = Sunday … 6 = Saturday (local). */
    weekday(ms) {
      return new Date(wall(ms)).getUTCDay();
    },
    /** Day of year, 1 … 366 (local). */
    dayOfYear(ms) {
      const d = new Date(wall(ms));
      return Math.floor((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
    },
    /** Instant of local midnight for the day containing `ms`. */
    startOfDay(ms) {
      return zone.fromWall(Math.floor(wall(ms) / DAY) * DAY);
    },
    /** Local calendar parts. */
    parts(ms) {
      const d = new Date(wall(ms));
      return {
        year: d.getUTCFullYear(),
        month: d.getUTCMonth() + 1,
        day: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        second: d.getUTCSeconds(),
        weekday: d.getUTCDay(),
      };
    },
    /** ISO 8601 string with the zone's offset, e.g. 2026-10-22T07:42:18+02:00. */
    toIso(ms) {
      const off = Math.round(offsetMs(ms) / MINUTE);
      const p = zone.parts(ms);
      const pad = (n) => String(n).padStart(2, '0');
      const sign = off >= 0 ? '+' : '-';
      const abs = Math.abs(off);
      return (
        `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` +
        `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
      );
    },
  };

  zoneCache.set(key, zone);
  return zone;
}

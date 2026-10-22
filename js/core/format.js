/**
 * Display formatting. Every function returns a printable string and falls
 * back to MISSING ("—") for absent values, so the UI never shows
 * "undefined", "NaN" or "null".
 */
import { createTimeZone } from './time.js';

export const MISSING = '—';
export const NO_DATA = 'Keine Daten';

const NBSP = '\u00A0';
const MINUS = '\u2212';

const settings = {
  decimal: '.',
  zone: createTimeZone('Europe/Luxembourg'),
};

/**
 * Configure formatting once at startup.
 * @param {{decimalSeparator?: string, timeZone?: string}} options
 */
export function configureFormat({ decimalSeparator, timeZone } = {}) {
  if (decimalSeparator === ',' || decimalSeparator === '.') settings.decimal = decimalSeparator;
  if (timeZone) settings.zone = createTimeZone(timeZone);
}

/** The time zone used for all displayed times. */
export function displayZone() {
  return settings.zone;
}

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Fixed-digit number with configurable decimal separator and a real minus sign. */
export function fmtNumber(value, digits = 1) {
  if (!isNum(value)) return MISSING;
  let s = value.toFixed(digits);
  if (/^-0(\.0+)?$/.test(s)) s = s.slice(1);
  if (settings.decimal !== '.') s = s.replace('.', settings.decimal);
  return s.replace('-', MINUS);
}

export function fmtTemp(value, digits = 1) {
  return isNum(value) ? `${fmtNumber(value, digits)}${NBSP}°C` : MISSING;
}

export function fmtPressure(value, digits = 2) {
  return isNum(value) ? `${fmtNumber(value, digits)}${NBSP}bar` : MISSING;
}

export function fmtPercent(value) {
  return isNum(value) ? `${Math.round(value)}${NBSP}%` : MISSING;
}

export function fmtKelvin(value, digits = 1) {
  if (!isNum(value)) return MISSING;
  const sign = value > 0 ? '+' : '';
  return `${sign}${fmtNumber(value, digits)}${NBSP}K`;
}

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

/** "Do, 22. Okt. 2026" */
export function fmtDateLong(ms) {
  if (!isNum(ms)) return MISSING;
  const p = settings.zone.parts(ms);
  return `${WEEKDAYS[p.weekday]}, ${p.day}. ${MONTHS[p.month - 1]} ${p.year}`;
}

/** "07:42" or "07:42:18" */
export function fmtClock(ms, withSeconds = false) {
  if (!isNum(ms)) return MISSING;
  const p = settings.zone.parts(ms);
  return withSeconds ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : `${pad(p.hour)}:${pad(p.minute)}`;
}

/** "Mo 19.10." */
export function fmtDayShort(ms) {
  if (!isNum(ms)) return MISSING;
  const p = settings.zone.parts(ms);
  return `${WEEKDAYS[p.weekday]} ${pad(p.day)}.${pad(p.month)}.`;
}

/** "19.10." */
export function fmtDateShort(ms) {
  if (!isNum(ms)) return MISSING;
  const p = settings.zone.parts(ms);
  return `${pad(p.day)}.${pad(p.month)}.`;
}

/** "Mo 19.10. 07:40" */
export function fmtDateTimeShort(ms) {
  if (!isNum(ms)) return MISSING;
  return `${fmtDayShort(ms)} ${fmtClock(ms)}`;
}

/** Minutes of the day → "07:15" */
export function fmtMinuteOfDay(minutes) {
  if (!isNum(minutes)) return MISSING;
  const m = Math.round(minutes);
  return `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
}

/** "37 Minuten", "1 Std. 12 Min.", "3 Tage" */
export function fmtDuration(minutes) {
  if (!isNum(minutes) || minutes < 0) return MISSING;
  const m = Math.round(minutes);
  if (m < 1) return 'weniger als 1 Minute';
  if (m === 1) return '1 Minute';
  if (m < 120) return `${m} Minuten`;
  if (m < 48 * 60) {
    const h = Math.floor(m / 60);
    const rest = m % 60;
    return rest ? `${h} Std. ${rest} Min.` : `${h} Stunden`;
  }
  return `${Math.round(m / 1440)} Tage`;
}

/** "Seit 37 Minuten" */
export function fmtSince(minutes) {
  const d = fmtDuration(minutes);
  return d === MISSING ? MISSING : `Seit ${d}`;
}

/** Compact "since" for small cards: "Seit 37 Minuten", "Seit 2 h 8 min", "Seit 3 Tagen" */
export function fmtSinceShort(minutes) {
  if (!isNum(minutes) || minutes < 0) return MISSING;
  const m = Math.round(minutes);
  if (m < 1) return 'Seit gerade eben';
  if (m === 1) return 'Seit 1 Minute';
  if (m < 100) return `Seit ${m} Minuten`;
  if (m < 48 * 60) return `Seit ${Math.floor(m / 60)} h ${m % 60} min`;
  return `Seit ${Math.round(m / 1440)} Tagen`;
}

/** Relative age: "gerade eben", "vor 3 Min.", "vor 2 Std.", "vor 3 Tagen" */
export function fmtAge(seconds) {
  if (!isNum(seconds)) return MISSING;
  const s = Math.max(0, seconds);
  if (s < 20) return 'gerade eben';
  if (s < 60) return `vor ${Math.round(s)} Sek.`;
  if (s < 3600) return `vor ${Math.round(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

/** German number words for the dative after "seit" (1 … 12). */
const DATIVE_DAYS = ['', 'einem Tag', 'zwei Tagen', 'drei Tagen', 'vier Tagen', 'fünf Tagen', 'sechs Tagen',
  'sieben Tagen', 'acht Tagen', 'neun Tagen', 'zehn Tagen', 'elf Tagen', 'zwölf Tagen'];

/** "seit sieben Tagen" */
export function fmtSinceDays(days) {
  if (!isNum(days) || days < 1) return 'seit heute';
  const d = Math.round(days);
  return d < DATIVE_DAYS.length ? `seit ${DATIVE_DAYS[d]}` : `seit ${d} Tagen`;
}

/** Signed percentage with real minus sign: "+18 %", "−6 %", "±0 %" */
export function fmtSignedPercent(value) {
  if (!isNum(value)) return MISSING;
  const v = Math.round(value);
  if (v === 0) return `±0${NBSP}%`;
  return `${v > 0 ? '+' : MINUS}${Math.abs(v)}${NBSP}%`;
}

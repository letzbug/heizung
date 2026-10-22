/**
 * Small statistics helpers for analysis. All functions ignore null values
 * and return null instead of NaN when there is not enough data.
 */
import { DAY } from '../core/time.js';

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const finite = (arr) => (Array.isArray(arr) ? arr.filter(isNum) : []);
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function sum(arr) {
  return finite(arr).reduce((a, b) => a + b, 0);
}

export function mean(arr) {
  const a = finite(arr);
  return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
}

export function median(arr) {
  const a = finite(arr).sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

export function minMax(arr) {
  const a = finite(arr);
  if (!a.length) return { min: null, max: null };
  return { min: Math.min(...a), max: Math.max(...a) };
}

/** Share of non-null values, 0 … 1. */
export function coverage(arr) {
  return Array.isArray(arr) && arr.length ? finite(arr).length / arr.length : 0;
}

/** Least-squares slope of ys over xs (pairs with nulls are skipped). */
export function linearSlope(xs, ys) {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    if (!isNum(x) || !isNum(y)) continue;
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  if (n < 3) return null;
  const d = n * sxx - sx * sx;
  return d === 0 ? null : (n * sxy - sx * sy) / d;
}

/** Pressure trend over a history: slope (bar/day), range and span. */
export function seriesTrend(history, key) {
  if (!history?.length) return null;
  const values = history.series[key];
  if (coverage(values) < 0.5) return null;
  const slope = linearSlope(history.timestamps.map((t) => t / DAY), values);
  const { min, max } = minMax(values);
  const spanDays = (history.timestamps[history.length - 1] - history.timestamps[0]) / DAY;
  return { slopePerDay: slope, min, max, range: max - min, spanDays };
}

/**
 * Consecutive 24-hour windows counted back from the end of the history.
 * windows[0] is the most recent 24 hours.
 */
export function dailyWindows(history, count = 7) {
  const res = history?.resolutionMinutes;
  if (!history?.length || !res) return [];
  const per = Math.round(1440 / res);
  const windows = [];
  for (let k = 0; k < count; k++) {
    const end = history.length - k * per;
    const start = end - per;
    if (start < 0) break;
    windows.push({ start, end });
  }
  return windows;
}

export const sliceOf = (arr, w) => (Array.isArray(arr) ? arr.slice(w.start, w.end) : []);

/**
 * TIME-SERIES CHART (SVG, no dependencies)
 *
 * Renders at the container's real pixel size (re-rendered on resize), so text
 * stays crisp and readable on every screen. Charts know nothing about where
 * data comes from: they receive { from, to, resolutionMinutes, timestamps, values }.
 *
 * Series types:
 *   "line"  – polyline with gaps for missing values
 *   "step"  – on/off steps (burner at fine resolution)
 *   "area"  – stepped filled area for fractions 0…1 (burner duty at coarse resolution)
 */
import { HOUR, DAY } from '../core/time.js';
import { displayZone, fmtClock, fmtDateShort, fmtDayShort, fmtDateTimeShort, isNum } from '../core/format.js';
import { h, s } from './dom.js';

function niceStep(raw) {
  const exp = 10 ** Math.floor(Math.log10(raw));
  const f = raw / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

/** Nice axis domain [min, max, step] from data and axis options. */
function niceDomain(values, axis) {
  const data = values.filter(isNum);
  if (axis.domain) {
    let [lo, hi] = axis.domain;
    const step = axis.step ?? niceStep((hi - lo) / 4);
    if (data.length) {
      lo = Math.min(lo, Math.floor(Math.min(...data) / step) * step);
      hi = Math.max(hi, Math.ceil(Math.max(...data) / step) * step);
    }
    return [lo, hi, step];
  }
  if (!data.length) return [0, 1, 0.25];
  let min = Math.min(...data);
  let max = Math.max(...data);
  if (max - min < 1) { min -= 1; max += 1; }
  const range = max - min;
  const step = niceStep(range / (axis.ticks ?? 4));
  return [Math.floor((min - range * 0.03) / step) * step, Math.ceil((max + range * 0.03) / step) * step, step];
}

/** Time ticks aligned to local hours / midnights. */
function timeTicks(x0, x1, widthPx) {
  const tz = displayZone();
  const span = x1 - x0;
  const maxTicks = Math.max(2, Math.floor(widthPx / 64));
  const steps = [HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 3 * DAY, 5 * DAY, 7 * DAY, 14 * DAY];
  const step = steps.find((st) => span / st <= maxTicks) ?? 14 * DAY;
  const align = step >= DAY ? DAY : step;
  const ticks = [];
  for (let w = Math.ceil(tz.wall(x0) / align) * align; ticks.length < 80; w += step) {
    const t = tz.fromWall(w);
    if (t > x1) break;
    if (t >= x0) ticks.push(t);
  }
  const label = step < DAY ? (t) => fmtClock(t) : span <= 8 * DAY ? fmtDayShort : fmtDateShort;
  return { ticks, label };
}

function linePath(ts, values, xs, ys) {
  let d = '';
  let pen = false;
  for (let i = 0; i < ts.length; i++) {
    const v = values[i];
    if (!isNum(v)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${xs(ts[i]).toFixed(1)} ${ys(v).toFixed(1)}`;
    pen = true;
  }
  return d;
}

/** Steps: each value covers (t − res, t]. `binary` thresholds at 0.5. */
function stepPath(ts, values, xs, ys, resMs, binary) {
  let d = '';
  let pen = false;
  for (let i = 0; i < ts.length; i++) {
    let v = values[i];
    if (!isNum(v)) { pen = false; continue; }
    if (binary) v = v >= 0.5 ? 1 : 0;
    const xa = xs(ts[i] - resMs).toFixed(1);
    const xb = xs(ts[i]).toFixed(1);
    const y = ys(v).toFixed(1);
    d += pen ? `L${xa} ${y}L${xb} ${y}` : `M${xa} ${y}L${xb} ${y}`;
    pen = true;
  }
  return d;
}

function areaPath(ts, values, xs, ys, resMs) {
  let d = '';
  let open = false;
  let lastX = null;
  const base = ys(0).toFixed(1);
  for (let i = 0; i < ts.length; i++) {
    const v = values[i];
    if (!isNum(v)) {
      if (open) { d += `L${lastX} ${base}Z`; open = false; }
      continue;
    }
    const xa = xs(ts[i] - resMs).toFixed(1);
    const xb = xs(ts[i]).toFixed(1);
    const y = ys(v).toFixed(1);
    d += open ? `L${xa} ${y}L${xb} ${y}` : `M${xa} ${base}L${xa} ${y}L${xb} ${y}`;
    open = true;
    lastX = xb;
  }
  if (open) d += `L${lastX} ${base}Z`;
  return d;
}

function bisect(ts, t) {
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (ts[mid] < t) lo = mid; else hi = mid;
  }
  return Math.abs(ts[lo] - t) <= Math.abs(ts[hi] - t) ? lo : hi;
}

/**
 * @param {HTMLElement} root
 * @param {object} options
 * @param {Array<{key:string,label:string,color:string,type?:string|((data)=>string),axis?:'left'|'right',width?:number,format?:(v:number,data:object)=>string}>} options.series
 * @param {{left: object, right?: object}} options.axes
 *   left:  { format(v), domain?, step?, ticks? }
 *   right: { band: [fromFraction, toFraction], domain: [0, 1], ticks(data) → [{v, label}] }
 * @param {string} [options.emptyText]
 * @param {string} [options.ariaLabel]
 */
export function createTimeSeriesChart(root, options) {
  const opts = { emptyText: 'Keine Verlaufsdaten für diesen Zeitraum', ...options };
  root.classList.add('ts-chart');
  const svg = s('svg', { class: 'ts-svg', role: 'img', 'aria-label': opts.ariaLabel ?? 'Verlaufsdiagramm' });
  const tip = h('div', { class: 'ts-tip', hidden: true, 'aria-hidden': 'true' });
  const empty = h('div', { class: 'ts-empty', hidden: true }, opts.emptyText);
  root.append(svg, tip, empty);

  let data = null;
  let geo = null;
  let frame = 0;

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(root);
  else window.addEventListener('resize', schedule);

  function render() {
    const W = Math.round(root.clientWidth);
    const H = Math.round(root.clientHeight);
    if (W < 60 || H < 60) return;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('width', String(W));
    svg.setAttribute('height', String(H));
    svg.replaceChildren();
    tip.hidden = true;
    geo = null;

    const ts = data?.timestamps ?? [];
    const hasData = opts.series.some((ser) => (data?.values?.[ser.key] ?? []).some(isNum));
    const x0 = data?.from ?? ts[0];
    const x1 = data?.to ?? ts[ts.length - 1];
    root.classList.toggle('is-empty', !hasData);
    empty.hidden = hasData;

    const narrow = W < 420;
    const m = { top: 10, right: opts.axes.right ? (narrow ? 34 : 40) : 12, bottom: 24, left: narrow ? 34 : 40 };
    const pw = W - m.left - m.right;
    const ph = H - m.top - m.bottom;
    if (pw < 20 || ph < 20) return;

    const leftSeries = opts.series.filter((ser) => ser.axis !== 'right');
    const leftValues = hasData ? leftSeries.flatMap((ser) => data.values[ser.key] ?? []) : [];
    const [lmin, lmax, lstep] = niceDomain(leftValues, opts.axes.left);
    const yL = (v) => m.top + ph - ((v - lmin) / (lmax - lmin)) * ph;
    const R = opts.axes.right;
    const yR = R ? (v) => m.top + ph - (R.band[0] + ((v - R.domain[0]) / (R.domain[1] - R.domain[0])) * (R.band[1] - R.band[0])) * ph : null;

    const grid = s('g', { class: 'ts-grid' });
    for (let v = lmin, n = 0; v <= lmax + lstep * 0.001 && n < 20; v += lstep, n++) {
      const y = yL(v).toFixed(1);
      grid.append(s('line', { x1: m.left, x2: W - m.right, y1: y, y2: y }));
      grid.append(s('text', { x: m.left - 8, y, class: 'ts-axis ts-axis--left', 'text-anchor': 'end', 'dominant-baseline': 'middle' }, opts.axes.left.format(v)));
    }
    if (R) {
      for (const tick of R.ticks(data)) {
        grid.append(s('text', { x: W - m.right + 8, y: yR(tick.v).toFixed(1), class: 'ts-axis ts-axis--right', 'dominant-baseline': 'middle' }, tick.label));
      }
    }
    svg.append(grid);

    if (!(x1 > x0)) return;
    const xs = (t) => m.left + ((t - x0) / (x1 - x0)) * pw;

    const { ticks, label } = timeTicks(x0, x1, pw);
    const xAxis = s('g', { class: 'ts-xaxis' });
    for (const t of ticks) {
      const x = xs(t).toFixed(1);
      xAxis.append(s('line', { x1: x, x2: x, y1: m.top, y2: m.top + ph, class: 'ts-vline' }));
      xAxis.append(s('text', { x, y: H - 6, class: 'ts-axis', 'text-anchor': 'middle' }, label(t)));
    }
    svg.append(xAxis);
    if (!hasData) return;

    const resMs = (data.resolutionMinutes ?? 5) * 60000;
    const plot = s('g', { class: 'ts-plot' });
    for (const ser of opts.series) {
      const values = data.values[ser.key];
      if (!values?.some(isNum)) continue;
      const ys = ser.axis === 'right' ? yR : yL;
      const type = typeof ser.type === 'function' ? ser.type(data) : ser.type ?? 'line';
      if (type === 'area') {
        plot.append(s('path', { d: areaPath(ts, values, xs, ys, resMs), class: 'ts-area', fill: ser.color }));
        plot.append(s('path', { d: stepPath(ts, values, xs, ys, resMs, false), class: 'ts-line ts-line--thin', stroke: ser.color }));
        continue;
      }
      const d = type === 'step' ? stepPath(ts, values, xs, ys, resMs, true) : linePath(ts, values, xs, ys);
      plot.append(s('path', { d, class: 'ts-glow', stroke: ser.color }));
      plot.append(s('path', { d, class: 'ts-line', stroke: ser.color, 'stroke-width': ser.width ?? 1.8 }));
    }
    svg.append(plot);

    const cross = s('g', { class: 'ts-cross', visibility: 'hidden' });
    cross.append(s('line', { y1: m.top, y2: m.top + ph, class: 'ts-cross-line' }));
    const dots = opts.series.map((ser) => {
      const dot = s('circle', { r: 3.5, fill: ser.color, class: 'ts-dot' });
      cross.append(dot);
      return dot;
    });
    svg.append(cross);

    geo = { m, pw, ph, W, xs, yL, yR, x0, x1, ts, cross, dots };
  }

  function showTip(clientX) {
    if (!geo || !data?.timestamps?.length) return;
    const rect = svg.getBoundingClientRect();
    const px = clientX - rect.left;
    if (px < geo.m.left - 4 || px > geo.m.left + geo.pw + 4) { hideTip(); return; }
    const t = geo.x0 + ((px - geo.m.left) / geo.pw) * (geo.x1 - geo.x0);
    const i = bisect(geo.ts, t);
    const x = geo.xs(geo.ts[i]);
    const line = geo.cross.firstChild;
    line.setAttribute('x1', x.toFixed(1));
    line.setAttribute('x2', x.toFixed(1));
    geo.cross.setAttribute('visibility', 'visible');

    const rows = [];
    opts.series.forEach((ser, k) => {
      const v = data.values[ser.key]?.[i];
      const dot = geo.dots[k];
      const type = typeof ser.type === 'function' ? ser.type(data) : ser.type ?? 'line';
      if (isNum(v)) {
        const ys = ser.axis === 'right' ? geo.yR : geo.yL;
        const shown = type === 'step' ? (v >= 0.5 ? 1 : 0) : v;
        dot.setAttribute('cx', x.toFixed(1));
        dot.setAttribute('cy', ys(shown).toFixed(1));
        dot.setAttribute('visibility', 'visible');
      } else {
        dot.setAttribute('visibility', 'hidden');
      }
      const text = isNum(v) ? (ser.format ? ser.format(v, data) : String(v)) : '—';
      rows.push(h('div', { class: 'ts-tip-row' },
        h('i', { class: 'ts-swatch', dataset: { color: ser.key } }),
        h('span', { class: 'ts-tip-label', text: ser.label }),
        h('b', { text })));
    });
    tip.replaceChildren(h('div', { class: 'ts-tip-time', text: fmtDateTimeShort(geo.ts[i]) }), ...rows);
    tip.querySelectorAll('.ts-swatch').forEach((el, k) => el.style.setProperty('--c', opts.series[k].color));
    tip.hidden = false;
    const tipW = tip.offsetWidth;
    const left = x + 14 + tipW > geo.W ? x - 14 - tipW : x + 14;
    tip.style.setProperty('--tx', `${Math.max(4, left).toFixed(0)}px`);
  }

  function hideTip() {
    tip.hidden = true;
    geo?.cross.setAttribute('visibility', 'hidden');
  }

  svg.addEventListener('pointermove', (e) => showTip(e.clientX));
  svg.addEventListener('pointerdown', (e) => showTip(e.clientX));
  svg.addEventListener('pointerleave', hideTip);

  return {
    /** @param {{from:number,to:number,resolutionMinutes:number,timestamps:number[],values:Record<string,(number|null)[]>}|null} next */
    setData(next) {
      data = next;
      schedule();
    },
  };
}

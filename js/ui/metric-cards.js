/**
 * TOP METRIC CARDS — data-driven definitions.
 * Each card is described once; values are read from the normalized state.
 * Display only: no card is interactive.
 */
import { fmtPressure, fmtSinceShort, fmtTemp, isNum } from '../core/format.js';
import { burnerInfo } from '../analysis/status.js';
import { icon } from './icons.js';
import { h, setData, setText } from './dom.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Comfort band colour for room temperatures (cool → comfortable → warm). */
export function roomTone(value) {
  if (!isNum(value)) return 'muted';
  if (value < 19) return 'cold';
  if (value >= 22) return 'heat';
  return 'ok';
}

function pressureTone(value, config) {
  if (!isNum(value)) return 'muted';
  const t = config.THRESHOLDS.pressure;
  if (value < t.criticalLow || value > t.criticalHigh) return 'crit';
  if (value < t.warningLow || value > t.warningHigh) return 'warn';
  return 'ok';
}

/** @param {object} config */
export function buildMetricDefinitions(config) {
  const rooms = (config.HEADLINE_ROOMS ?? []).map((id) => {
    const rc = config.ROOMS.find((r) => r.id === id) ?? { id, name: id, icon: 'room' };
    const room = (s) => s.rooms.find((r) => r.id === id);
    return {
      id: `room-${id}`,
      label: rc.name,
      short: rc.name,
      icon: rc.icon ?? 'room',
      iconTone: 'neutral',
      value: (s) => room(s)?.temperature ?? null,
      format: (v) => fmtTemp(v, 1),
      sub: (s) => (isNum(room(s)?.target) ? `Soll: ${fmtTemp(room(s).target, 1)}` : ''),
      bar: [14, 26],
      tone: (v) => roomTone(v),
    };
  });

  return [
    ...rooms,
    {
      id: 'outside', label: 'Außentemperatur', short: 'Außen', icon: 'cloud', iconTone: 'cold',
      value: (s) => s.outside.temperature, format: (v) => fmtTemp(v, 1),
      bar: [-15, 35], tone: (v) => (isNum(v) ? (v < 15 ? 'cold' : 'heat') : 'muted'),
    },
    {
      id: 'boiler', label: 'Kesseltemperatur', short: 'Kessel', icon: 'flame', iconTone: 'heat',
      value: (s) => s.boiler.temperature, format: (v) => fmtTemp(v, 0), bar: [20, 90], tone: () => 'heat',
    },
    {
      id: 'hot-water', label: 'Warmwasser', short: 'Warmwasser', icon: 'faucet', iconTone: 'neutral',
      value: (s) => s.hotWater.temperature, format: (v) => fmtTemp(v, 0), bar: [20, 70], tone: () => 'heat',
    },
    {
      id: 'pressure', label: 'Anlagendruck', short: 'Druck', icon: 'gauge', iconTone: 'neutral',
      value: (s) => s.heating.pressure, format: (v) => fmtPressure(v),
      sub: () => (isNum(config.PRESSURE_NOMINAL_BAR) ? `Soll: ${fmtPressure(config.PRESSURE_NOMINAL_BAR, 1)}` : ''),
      bar: [0, 2.5], tone: (v) => pressureTone(v, config),
    },
    {
      id: 'burner', label: 'Brennerstatus', short: 'Brenner', icon: 'flame', iconTone: 'heat', kind: 'state',
      value: (s) => s.boiler.burner,
      format: (v) => (v === true ? 'AKTIV' : v === false ? 'AUS' : '—'),
      sub: (s, now) => {
        if (s.boiler.burner === null) return 'Keine Daten';
        const info = burnerInfo(s, now);
        return isNum(info.minutes) ? fmtSinceShort(info.minutes) : info.text;
      },
      tone: (v) => (v === true ? 'active' : v === false ? 'idle' : 'muted'),
    },
    {
      id: 'supply', label: 'Vorlauf', short: 'Vorlauf', icon: 'arrow-right', iconTone: 'supply',
      value: (s) => s.heating.supplyTemperature, format: (v) => fmtTemp(v, 0), bar: [20, 80], tone: () => 'supply',
    },
    {
      id: 'return', label: 'Rücklauf', short: 'Rücklauf', icon: 'arrow-left', iconTone: 'return',
      value: (s) => s.heating.returnTemperature, format: (v) => fmtTemp(v, 0), bar: [20, 80], tone: () => 'return',
    },
  ];
}

/**
 * @param {HTMLElement} container
 * @param {object} config
 */
export function createMetricCards(container, config) {
  const defs = buildMetricDefinitions(config);
  const cards = defs.map((def) => {
    const value = h('div', { class: 'metric-val' }, '—');
    const sub = h('div', { class: 'metric-sub' });
    const fill = h('i');
    const bar = def.bar ? h('div', { class: 'metric-bar', 'aria-hidden': 'true' }, fill) : null;
    const el = h('article', { class: `metric metric--${def.id}${def.kind === 'state' ? ' metric--state' : ''}`, dataset: { metric: def.id } },
      h('header', { class: 'metric-hd' },
        h('span', { class: `metric-ic tone-${def.iconTone}`, trustedHtml: icon(def.icon) }),
        h('span', { class: 'metric-label', title: def.label },
          h('span', { class: 'label-long', text: def.label }),
          h('span', { class: 'label-short', text: def.short }))),
      value, sub, bar);
    container.append(el);
    return { def, el, value, sub, fill };
  });

  return {
    /**
     * @param {object} state normalized current state
     * @param {number} now
     * @param {boolean} stale
     */
    update(state, now, stale) {
      for (const { def, el, value, sub, fill } of cards) {
        const v = def.value(state);
        const text = def.format(v);
        setText(value, text);
        setText(sub, def.sub ? def.sub(state, now) || '\u00A0' : '\u00A0');
        const missing = v === null || v === undefined;
        setData(el, 'tone', def.tone(v));
        el.classList.toggle('is-missing', missing);
        el.classList.toggle('is-stale', Boolean(stale));
        el.setAttribute('aria-label', `${def.label}: ${missing ? 'keine Daten' : text}`);
        if (def.bar) {
          const [lo, hi] = def.bar;
          fill.style.setProperty('--fill', isNum(v) ? `${(0.04 + 0.96 * clamp01((v - lo) / (hi - lo))) * 100}%` : '0%');
        }
      }
    },
  };
}

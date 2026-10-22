/**
 * DASHBOARD
 *
 * Owns the DOM. Receives normalized state, evaluated status, histories and
 * insights — and renders them. It contains no data access, no analysis and
 * no controls for the heating system.
 */
import { fmtClock, fmtDateLong, fmtNumber, fmtPressure, fmtTemp, fmtAge, isNum } from '../core/format.js';
import { HISTORY_PERIODS } from '../core/periods.js';
import { createMetricCards } from './metric-cards.js';
import { createFlowDiagram } from './flow-diagram.js';
import { createSceneRenderer, selectOutdoorScene } from './weather-scenes.js';
import { createTimeSeriesChart } from './charts.js';
import { createRoomCards } from './room-cards.js';
import { createStatusPanel, createAlerts } from './status-panel.js';
import { createInsightPanel } from './insight-panel.js';
import { createWeatherCard } from './weather-card.js';
import { setData, setText } from './dom.js';

export const SERIES_COLORS = Object.freeze({
  boilerTemperature: '#ff4f3d',
  supplyTemperature: '#ff9f2e',
  returnTemperature: '#3cc8ff',
  room: '#8fe36a',
  outsideTemperature: '#d5deeb',
  pressure: '#3cc8ff',
  burnerActive: '#ff9f2e',
});

const byId = (id) => document.getElementById(id);

/**
 * @param {object} config resolved configuration
 * @param {{onPeriodChange?: (periodId: string) => void}} handlers
 */
export function createDashboard(config, { onPeriodChange } = {}) {
  const root = byId('app');
  const els = {
    date: byId('hdr-date'),
    time: byId('hdr-time'),
    updated: byId('hdr-updated'),
    statusBox: byId('hdr-status'),
    statusTitle: byId('hdr-status-title'),
    statusDetail: byId('hdr-status-detail'),
    demoBadge: byId('demo-badge'),
    source: byId('foot-source'),
    tempTitle: byId('temp-period'),
    pressureTitle: byId('pressure-period'),
    sceneCaption: byId('scene-caption'),
  };

  const roomName = config.ROOMS.find((r) => r.id === config.CHART_ROOM)?.name ?? 'Raum';
  byId('legend-room').textContent = roomName;

  const metrics = createMetricCards(byId('metrics'), config);
  const flow = createFlowDiagram(byId('flow'), { chartRoom: config.CHART_ROOM });
  const scene = createSceneRenderer(byId('scene'));
  const rooms = createRoomCards(byId('rooms'));
  const statusPanel = createStatusPanel(byId('status-list'));
  const alerts = createAlerts(byId('alerts'));
  const insightPanel = createInsightPanel(byId('insight-list'), byId('insight-meta'), { maxVisible: config.ANALYSIS.maxVisible });
  const weather = createWeatherCard(byId('weather'));

  const tempFormat = (v) => fmtTemp(v, 1);
  const tempChart = createTimeSeriesChart(byId('chart-temp'), {
    ariaLabel: 'Temperaturverlauf',
    series: [
      { key: 'boilerTemperature', label: 'Kessel', color: SERIES_COLORS.boilerTemperature, format: tempFormat },
      { key: 'supplyTemperature', label: 'Vorlauf', color: SERIES_COLORS.supplyTemperature, format: tempFormat },
      { key: 'returnTemperature', label: 'Rücklauf', color: SERIES_COLORS.returnTemperature, format: tempFormat },
      { key: 'room', label: roomName, color: SERIES_COLORS.room, format: tempFormat },
      { key: 'outsideTemperature', label: 'Außen', color: SERIES_COLORS.outsideTemperature, width: 1.5, format: tempFormat },
    ],
    axes: { left: { format: (v) => `${fmtNumber(v, 0)} °C`, ticks: 4 } },
  });

  const fineBurner = (data) => (data?.resolutionMinutes ?? 5) <= 10;
  const pressureChart = createTimeSeriesChart(byId('chart-pressure'), {
    ariaLabel: 'Anlagendruck und Brennerlaufzeit',
    series: [
      { key: 'pressure', label: 'Druck', color: SERIES_COLORS.pressure, format: (v) => fmtPressure(v) },
      {
        key: 'burnerActive', label: 'Brenner', color: SERIES_COLORS.burnerActive, axis: 'right', width: 1.6,
        type: (data) => (fineBurner(data) ? 'step' : 'area'),
        format: (v, data) => (fineBurner(data) ? (v >= 0.5 ? 'Ein' : 'Aus') : `${Math.round(v * 100)} % Laufzeit`),
      },
    ],
    axes: {
      left: { format: (v) => fmtNumber(v, 1), domain: [0, 2.5], step: 0.5 },
      right: {
        band: [0.04, 0.42],
        domain: [0, 1],
        ticks: (data) => (fineBurner(data) ? [{ v: 1, label: 'Ein' }, { v: 0, label: 'Aus' }] : [{ v: 1, label: '100 %' }, { v: 0, label: '0 %' }]),
      },
    },
  });

  // Period tabs (view selection only)
  const tabs = [...document.querySelectorAll('[data-period]')];
  tabs.forEach((tab) => tab.addEventListener('click', () => {
    const id = tab.dataset.period;
    if (!HISTORY_PERIODS[id] || tab.getAttribute('aria-selected') === 'true') return;
    setPeriod(id);
    onPeriodChange?.(id);
  }));

  function setPeriod(id) {
    tabs.forEach((tab) => tab.setAttribute('aria-selected', String(tab.dataset.period === id)));
    const label = HISTORY_PERIODS[id]?.label ?? '';
    setText(els.tempTitle, `(${label})`);
    setText(els.pressureTitle, `(${label})`);
  }
  setPeriod(config.DEFAULT_PERIOD);

  els.demoBadge.hidden = true;

  return {
    setPeriod,

    /** 'loading' | 'ready' | 'error' */
    setPhase(phase) {
      setData(root, 'state', phase);
      root.setAttribute('aria-busy', String(phase === 'loading'));
    },

    /**
     * @param {{current: object|null, status: object, now: number, providerLabel: string, isDemo: boolean}} view
     */
    renderState({ current, status, now, providerLabel, isDemo }) {
      // Header status
      setData(els.statusBox, 'severity', status.severity);
      setText(els.statusTitle, status.headline);
      setText(els.statusDetail, status.detail);
      els.demoBadge.hidden = !(isDemo && config.SHOW_DEMO_BADGE);
      setText(els.source, `Datenquelle: ${providerLabel}`);
      alerts.update(status);
      statusPanel.update(status);
      this.tick(now, current, status);
      if (!current) return;

      const stale = status.freshness.stale;
      root.classList.toggle('is-stale', stale);
      metrics.update(current, now, stale);
      flow.update(current, status);
      const sceneInfo = selectOutdoorScene(current.outside, now);
      scene.update(sceneInfo);
      setText(els.sceneCaption, `Außenszene: ${sceneInfo.label}`);
      weather.update(current.outside, sceneInfo);
      rooms.update(current.rooms, status.rooms, now);
    },

    /** Clock and data age — local, no polling. */
    tick(now, current, status) {
      setText(els.date, fmtDateLong(now));
      setText(els.time, fmtClock(now));
      els.time.setAttribute('datetime', new Date(now).toISOString());
      if (current && isNum(current.timestamp)) {
        const age = (now - current.timestamp) / 1000;
        const stale = status?.freshness?.stale;
        setText(els.updated, `Letztes Update: ${fmtClock(current.timestamp, true)}${stale ? ` (${fmtAge(age)})` : ''}`);
        els.updated.classList.toggle('is-stale', Boolean(stale));
      } else {
        setText(els.updated, 'Letztes Update: —');
      }
    },

    /**
     * @param {object|null} history normalized history (or null when unavailable)
     * @param {object} config
     */
    renderHistory(history) {
      if (!history) {
        tempChart.setData(null);
        pressureChart.setData(null);
        return;
      }
      const base = { from: history.from, to: history.to, resolutionMinutes: history.resolutionMinutes, timestamps: history.timestamps };
      tempChart.setData({
        ...base,
        values: {
          boilerTemperature: history.series.boilerTemperature,
          supplyTemperature: history.series.supplyTemperature,
          returnTemperature: history.series.returnTemperature,
          room: history.rooms[config.CHART_ROOM] ?? [],
          outsideTemperature: history.series.outsideTemperature,
        },
      });
      pressureChart.setData({
        ...base,
        values: { pressure: history.series.pressure, burnerActive: history.series.burnerActive },
      });
    },

    renderInsights(insights, info) {
      insightPanel.update(insights, info);
    },
  };
}

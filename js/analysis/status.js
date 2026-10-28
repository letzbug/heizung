/**
 * SYSTEM STATUS EVALUATION
 *
 * Derives severity (normal / warning / critical) and the status-panel items
 * from a normalized current state. Pure function: no DOM, no network.
 */
import { fmtAge, fmtClock, fmtDuration, fmtPressure, fmtSince, fmtTemp, isNum } from '../core/format.js';
import { seriesTrend } from './stats.js';

export const SEVERITY_RANK = Object.freeze({ unknown: 0, info: 1, normal: 1, positive: 1, warning: 2, critical: 3 });

const HEADLINES = {
  stale: 'DATEN VERALTET',
  'source-unreachable': 'KEINE VERBINDUNG',
  optolink: 'OPTOLINK GETRENNT',
  'sensor-offline': 'SENSOR OFFLINE',
  'zigbee-offline': 'ZIGBEE OFFLINE',
};

/**
 * Burner info with live runtime (computed from burnerSince when available).
 * @param {object} current normalized current state
 * @param {number} now
 */
export function burnerInfo(current, now = Date.now()) {
  const b = current?.boiler;
  if (!b || b.burner === null) return { active: null, minutes: null, text: 'Keine Daten' };
  const fromSince = isNum(b.burnerSince) ? Math.max(0, (now - b.burnerSince) / 60000) : null;
  if (b.burner) {
    const minutes = fromSince ?? b.burnerRuntimeMinutes;
    return { active: true, minutes, text: isNum(minutes) ? fmtSince(minutes) : 'Läuft' };
  }
  return { active: false, minutes: fromSince, text: isNum(fromSince) ? `Aus seit ${fmtDuration(fromSince)}` : 'Bereit' };
}

/**
 * @param {object|null} current normalized current state (or null)
 * @param {object} context
 * @param {object} context.config
 * @param {number} [context.now]
 * @param {object|null} [context.history] normalized history for trend checks
 * @param {Error|null} [context.error] last provider error
 */
export function evaluateSystemStatus(current, { config, now = Date.now(), history = null, error = null }) {
  const T = config.THRESHOLDS;
  const F = config.FRESHNESS;
  const issues = [];
  const add = (severity, code, message, target = null) => issues.push({ severity, code, message, target });

  if (!current) {
    if (error) add('warning', 'source-unreachable', 'Keine Verbindung zur Datenquelle. Nächster Versuch läuft automatisch.');
    return {
      severity: 'unknown',
      headline: error ? 'KEINE VERBINDUNG' : 'KEINE DATEN',
      detail: error ? 'Datenquelle nicht erreichbar' : 'Warte auf erste Messwerte …',
      issues,
      items: unknownItems(),
      freshness: { ageSeconds: null, stale: true },
      rooms: {},
    };
  }

  // Freshness
  const ageSeconds = isNum(current.timestamp) ? Math.max(0, (now - current.timestamp) / 1000) : null;
  const stale = ageSeconds === null || ageSeconds > F.staleAfterSeconds;
  if (error) add('warning', 'source-unreachable', 'Datenquelle derzeit nicht erreichbar – angezeigt werden die letzten bekannten Werte.');
  if (stale) add('warning', 'stale', ageSeconds === null ? 'Die Daten enthalten keinen Zeitstempel.' : sentence(`Daten veraltet – letzte Messung ${fmtAge(ageSeconds)}`));

  // Optolink / boiler communication
  const optolink = current.system.optolink;
  if (optolink === false) add('warning', 'optolink', 'Optolink getrennt – Kesselwerte sind nicht verfügbar.');

  // Pressure
  const p = current.heating.pressure;
  let pressureSeverity = 'unknown';
  let pressureLabel = 'DRUCK';
  if (isNum(p)) {
    if (p < T.pressure.criticalLow || p > T.pressure.criticalHigh) {
      pressureSeverity = 'critical';
      pressureLabel = 'DRUCK KRITISCH';
      add('critical', 'pressure', `Anlagendruck ${p < T.pressure.criticalLow ? 'kritisch niedrig' : 'kritisch hoch'} (${fmtPressure(p)}).`);
    } else if (p < T.pressure.warningLow || p > T.pressure.warningHigh) {
      pressureSeverity = 'warning';
      pressureLabel = p < T.pressure.warningLow ? 'DRUCK NIEDRIG' : 'DRUCK HOCH';
      add('warning', 'pressure', `Anlagendruck ${p < T.pressure.warningLow ? 'niedrig' : 'hoch'} (${fmtPressure(p)}).`);
    } else {
      const trend = seriesTrend(history, 'pressure');
      if (trend?.slopePerDay !== null && trend?.slopePerDay <= -T.pressure.dropPerDayWarning && trend.range >= 0.1) {
        pressureSeverity = 'warning';
        pressureLabel = 'DRUCK FÄLLT';
        add('warning', 'pressure-trend', `Anlagendruck sinkt um ca. ${Math.abs(trend.slopePerDay).toFixed(2)} bar pro Tag.`);
      } else {
        pressureSeverity = 'normal';
        pressureLabel = trend && trend.range <= T.pressure.stableRange ? 'DRUCK STABIL' : 'DRUCK OK';
      }
    }
  } else if (optolink !== false) {
    add('info', 'pressure-missing', 'Kein Druckwert verfügbar.');
  }

  // Boiler temperature
  const boiler = current.boiler.temperature;
  if (isNum(boiler) && boiler >= T.boiler.critical) add('critical', 'boiler', `Kesseltemperatur sehr hoch (${fmtTemp(boiler, 0)}).`);
  else if (isNum(boiler) && boiler >= T.boiler.warning) add('warning', 'boiler', `Kesseltemperatur erhöht (${fmtTemp(boiler, 0)}).`);

  // Rooms / Zigbee
  const rooms = {};
  let online = 0;
  const total = current.rooms.length;
  for (const r of current.rooms) {
    const age = isNum(r.lastUpdate) ? Math.max(0, (now - r.lastUpdate) / 1000) : null;
    const isOnline = age !== null && age <= F.sensorOfflineAfterSeconds && isNum(r.temperature);
    const lowBattery = isNum(r.battery) && r.battery < T.sensor.batteryWarning;
    const weakSignal = isNum(r.signal) && r.signal < T.sensor.signalWarning;
    if (isOnline) online++;
    rooms[r.id] = { online: isOnline, ageSeconds: age, lowBattery, weakSignal };
    if (lowBattery) add('warning', 'battery', `Batterie Sensor ${r.name}: ${Math.round(r.battery)} %.`, r.id);
    if (weakSignal && isOnline) add('info', 'signal', `Schwaches Funksignal Sensor ${r.name}.`, r.id);
  }
  const offline = current.rooms.filter((r) => !rooms[r.id].online);
  if (current.system.zigbee === false || (total > 0 && offline.length === total)) {
    add('warning', 'zigbee-offline', current.system.zigbee === false ? 'Zigbee-Netz nicht erreichbar – Raumwerte sind nicht aktuell.' : 'Keine Raumsensoren erreichbar.');
  } else {
    for (const r of offline) {
      const age = rooms[r.id].ageSeconds;
      add('warning', 'sensor-offline', `Sensor ${r.name} ${age === null ? 'liefert keine Daten' : `meldet sich nicht (letzte Meldung ${fmtAge(age)})`}.`, r.id);
    }
  }

  // Status reported by the source itself
  const reported = current.system.reportedStatus;
  if (reported === 'warning' || reported === 'critical') {
    add(reported, 'source-reported', current.system.message ?? 'Die Datenquelle meldet einen Fehlerzustand.');
  }

  // Overall
  const ranked = issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => SEVERITY_RANK[b.issue.severity] - SEVERITY_RANK[a.issue.severity] || a.index - b.index)
    .map((x) => x.issue);
  const top = ranked[0];
  const severity = top && SEVERITY_RANK[top.severity] >= 2 ? top.severity : 'normal';
  const relevant = ranked.filter((i) => SEVERITY_RANK[i.severity] >= 2);

  let headline = 'SYSTEM NORMAL';
  let detail = 'Alle Werte im erwarteten Bereich';
  if (severity !== 'normal') {
    headline = HEADLINES[top.code] ?? (severity === 'critical' ? 'SYSTEM KRITISCH' : 'SYSTEM WARNUNG');
    detail = top.message + (relevant.length > 1 ? ` (+${relevant.length - 1} weitere)` : '');
  }

  const burner = burnerInfo(current, now);
  // Only display an explicitly reported mode. Never infer it from temperatures.
  const modeRaw = current.system.operatingMode?.trim().toUpperCase();
  const modeText = modeRaw === 'WW' || modeRaw === '00' || modeRaw === '0'
    ? 'Warmwasser'
    : modeRaw === 'H+WW' || modeRaw === '03' || modeRaw === '3'
      ? 'Heizung + Warmwasser'
      : modeRaw === 'RED' ? 'Reduziert'
      : modeRaw === 'NORM' ? 'Normalbetrieb'
      : modeRaw === 'H+WW FS' ? 'Heizung + WW (Frostschutz)'
      : modeRaw === 'ABSCHALT' ? 'Abschaltbetrieb'
      : 'Nicht verfügbar';
  const items = [
    {
      id: 'system',
      label: severity === 'normal' ? 'SYSTEM NORMAL' : severity === 'critical' ? 'SYSTEM KRITISCH' : 'SYSTEM WARNUNG',
      value: severity === 'normal' ? 'Alle Systeme OK' : `${relevant.length} ${relevant.length === 1 ? 'Meldung' : 'Meldungen'}`,
      severity,
    },
    { id: 'operating-mode', label: 'BETRIEBSMODUS', value: stale || optolink !== true ? 'Nicht verfügbar' : modeText, severity: stale || optolink !== true || modeText === 'Nicht verfügbar' ? 'unknown' : 'normal' },
    { id: 'pressure', label: pressureLabel, value: fmtPressure(p), severity: pressureSeverity },
    {
      id: 'burner',
      label: burner.active === true ? 'BRENNER AKTIV' : burner.active === false ? 'BRENNER AUS' : 'BRENNER',
      value: burner.text,
      severity: burner.active === true ? 'active' : burner.active === false ? 'idle' : 'unknown',
    },
    {
      id: 'optolink',
      label: 'OPTOLINK',
      value: optolink === true ? 'Verbunden' : optolink === false ? 'Getrennt' : 'Unbekannt',
      severity: optolink === true ? 'normal' : optolink === false ? 'warning' : 'unknown',
    },
    {
      id: 'zigbee',
      label: 'ZIGBEE',
      value: total === 0 ? 'Keine Sensoren' : online === total ? `${total} Sensoren online` : `${online} von ${total} online`,
      severity: total === 0 ? 'unknown' : online === total ? 'normal' : 'warning',
    },
    {
      id: 'update',
      label: 'LETZTES UPDATE',
      value: isNum(current.timestamp) ? `${fmtClock(current.timestamp, true)}${stale ? ' · veraltet' : ''}` : 'Unbekannt',
      severity: stale ? 'warning' : 'normal',
    },
  ];

  return { severity, headline, detail, issues: ranked, items, freshness: { ageSeconds, stale }, rooms };
}

/** Ensure exactly one closing period. */
function sentence(s) {
  return s.endsWith('.') ? s : `${s}.`;
}

function unknownItems() {
  return [
    { id: 'system', label: 'SYSTEM', value: 'Keine Daten', severity: 'unknown' },
    { id: 'operating-mode', label: 'BETRIEBSMODUS', value: 'Nicht verfügbar', severity: 'unknown' },
    { id: 'pressure', label: 'DRUCK', value: 'Keine Daten', severity: 'unknown' },
    { id: 'burner', label: 'BRENNER', value: 'Keine Daten', severity: 'unknown' },
    { id: 'optolink', label: 'OPTOLINK', value: 'Unbekannt', severity: 'unknown' },
    { id: 'zigbee', label: 'ZIGBEE', value: 'Unbekannt', severity: 'unknown' },
    { id: 'update', label: 'LETZTES UPDATE', value: 'Keine Daten', severity: 'unknown' },
  ];
}

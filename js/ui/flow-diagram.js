/**
 * SYSTEM FLOW DIAGRAM
 *
 * AUSSEN → KESSEL → VORLAUF → HAUS → RÜCKLAUF → KESSEL
 *
 * Static SVG markup built once; updates only change text and data
 * attributes. Animation is CSS-only (stroke-dashoffset / small transforms),
 * runs only while the burner is active, and is disabled for
 * prefers-reduced-motion and LOW_POWER. The diagram is fully readable
 * without animation (arrows are static).
 */
import { fmtTemp, isNum } from '../core/format.js';
import { setText, setData } from './dom.js';

const chevron = (x, y, dir = 1) => `<path class="fd-chev" d="M${x - 5 * dir} ${y - 6}L${x + 3 * dir} ${y}L${x - 5 * dir} ${y + 6}"/>`;

const SUPPLY_D = 'M575 150 H958 Q980 150 980 172 V214 Q980 236 1002 236 H1014';
const RETURN_D = 'M1300 236 H1446 Q1472 236 1472 260 V262 Q1472 286 1448 286 H562 Q540 286 540 264 V258';
const INTAKE_D = 'M262 200 H386 Q410 200 410 224 V228 Q410 250 432 250 H442';

function pipe(d, kind) {
  return `<g class="fd-pipe fd-pipe--${kind}">
    <path class="fd-pipe-glow" d="${d}"/>
    <path class="fd-pipe-casing" d="${d}"/>
    <path class="fd-pipe-core" d="${d}" stroke="url(#fd-${kind})"/>
    <path class="fd-pipe-shine" d="${d}"/>
    <path class="fd-flow" d="${d}"/>
  </g>`;
}

const WIDE_SVG = `
<svg class="flow-wide" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="fd-title" focusable="false">
  <title id="fd-title">Wärmefluss: Außen, Kessel, Vorlauf, Haus, Rücklauf</title>
  <defs>
    <linearGradient id="fd-supply" gradientUnits="userSpaceOnUse" x1="575" y1="0" x2="1014" y2="0"><stop offset="0" stop-color="#ff8a2e"/><stop offset="1" stop-color="#ff3d2e"/></linearGradient>
    <linearGradient id="fd-return" gradientUnits="userSpaceOnUse" x1="1472" y1="0" x2="540" y2="0"><stop offset="0" stop-color="#3fd3ff"/><stop offset="1" stop-color="#2f7dff"/></linearGradient>
    <linearGradient id="fd-intake" gradientUnits="userSpaceOnUse" x1="262" y1="0" x2="442" y2="0"><stop offset="0" stop-color="#3fd3ff" stop-opacity=".5"/><stop offset="1" stop-color="#3fb8ff"/></linearGradient>
    <linearGradient id="fd-boiler" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b475b"/><stop offset=".42" stop-color="#1d2535"/><stop offset="1" stop-color="#0c111a"/></linearGradient>
    <linearGradient id="fd-boiler-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a9ab3" stop-opacity=".55"/><stop offset=".2" stop-color="#8a9ab3" stop-opacity="0"/><stop offset=".85" stop-color="#8a9ab3" stop-opacity="0"/><stop offset="1" stop-color="#8a9ab3" stop-opacity=".35"/></linearGradient>
    <radialGradient id="fd-fire" cx=".5" cy=".85" r=".8"><stop offset="0" stop-color="#fff0c4"/><stop offset=".22" stop-color="#ffb24a"/><stop offset=".55" stop-color="#ff5a1f" stop-opacity=".9"/><stop offset="1" stop-color="#5a1206" stop-opacity="0"/></radialGradient>
    <radialGradient id="fd-fire-glow"><stop offset="0" stop-color="#ff8a3c" stop-opacity=".5"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>
    <radialGradient id="fd-house-glow"><stop offset="0" stop-color="#ffb366" stop-opacity=".32"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient>
    <linearGradient id="fd-window" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd9a0"/><stop offset="1" stop-color="#ff9c47"/></linearGradient>
    <linearGradient id="fd-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f2a3d"/><stop offset="1" stop-color="#121a28"/></linearGradient>
    <linearGradient id="fd-roof" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3850"/><stop offset="1" stop-color="#151d2c"/></linearGradient>
    <clipPath id="fd-win-clip"><rect x="467" y="168" width="81" height="72" rx="8"/></clipPath>
  </defs>

  <line class="fd-ground" x1="0" y1="262" x2="1600" y2="262"/>

  <!-- AUSSEN -->
  <g class="fd-node fd-node--outside">
    <text class="fd-label fd-cold" x="200" y="150" text-anchor="middle">AUSSEN</text>
    <text class="fd-value fd-cold" x="200" y="186" text-anchor="middle" data-bind="outside">—</text>
  </g>
  ${pipe(INTAKE_D, 'intake')}

  <!-- RÜCKLAUF (drawn before the boiler so the boiler covers its end) -->
  ${pipe(RETURN_D, 'return')}
  <g class="fd-chevs fd-chevs--return">${chevron(1360, 236)}${chevron(1410, 236)}${chevron(1230, 286, -1)}${chevron(980, 286, -1)}${chevron(730, 286, -1)}</g>

  <!-- VORLAUF -->
  ${pipe(SUPPLY_D, 'supply')}
  <g class="fd-chevs fd-chevs--supply">${chevron(690, 150)}${chevron(735, 150)}${chevron(890, 150)}${chevron(935, 150)}</g>
  <g class="fd-node fd-node--supply">
    <text class="fd-label fd-hot" x="712" y="88" text-anchor="middle">VORLAUF</text>
    <text class="fd-value fd-hot" x="712" y="124" text-anchor="middle" data-bind="supply">—</text>
  </g>

  <!-- Pump -->
  <g class="fd-pump" transform="translate(812 150)">
    <circle r="22" class="fd-pump-body"/>
    <circle r="15" class="fd-pump-inner"/>
    <g class="fd-impeller"><path d="M0 -11 Q6 -6 0 0 Q-6 -6 0 -11Z M9.5 5.5 Q2 7 0 0 Q8 -1 9.5 5.5Z M-9.5 5.5 Q-8 -1 0 0 Q-2 7 -9.5 5.5Z"/></g>
    <circle r="2.6" class="fd-pump-hub"/>
  </g>

  <!-- KESSEL -->
  <g class="fd-boiler">
    <ellipse class="fd-fire-glow" cx="507" cy="214" rx="120" ry="80" fill="url(#fd-fire-glow)"/>
    <rect x="440" y="62" width="135" height="200" rx="12" fill="url(#fd-boiler)" class="fd-boiler-body"/>
    <rect x="440" y="62" width="135" height="200" rx="12" fill="url(#fd-boiler-side)"/>
    <path d="M452 63 H563" class="fd-boiler-edge"/>
    <rect x="462" y="82" width="92" height="18" rx="4" class="fd-display"/>
    <circle cx="473" cy="91" r="3" class="fd-led"/>
    <path d="M482 91 H510 M516 91 H540" class="fd-display-lines"/>
    <path d="M470 120 H546 M470 128 H546 M470 136 H546" class="fd-vents"/>
    <rect x="467" y="168" width="81" height="72" rx="8" class="fd-window-frame"/>
    <g clip-path="url(#fd-win-clip)" class="fd-fire">
      <rect x="467" y="168" width="81" height="72" fill="url(#fd-fire)"/>
      <path class="fd-flames" d="M474 240 C476 224 486 216 484 200 C493 210 497 217 495 228 C500 216 506 207 504 190 C515 204 522 216 518 240 Z M512 240 C515 228 523 221 522 210 C530 219 534 228 532 240 Z"/>
    </g>
    <rect x="436" y="258" width="143" height="8" rx="3" class="fd-plinth"/>
  </g>
  <g class="fd-node fd-node--boiler">
    <text class="fd-label fd-hot" x="600" y="214">KESSEL</text>
    <text class="fd-value fd-hot" x="600" y="250" data-bind="boiler">—</text>
  </g>

  <!-- HAUS -->
  <g class="fd-house">
    <ellipse cx="1156" cy="214" rx="230" ry="110" fill="url(#fd-house-glow)" class="fd-house-glow"/>
    <rect x="1140" y="76" width="15" height="34" class="fd-chimney"/>
    <rect x="1012" y="132" width="168" height="130" fill="url(#fd-wall)" class="fd-wall"/>
    <path d="M998 140 L1096 58 L1194 140 Z" fill="url(#fd-roof)" class="fd-roof"/>
    <path d="M998 140 L1096 58 L1194 140" class="fd-roof-edge"/>
    <rect x="1180" y="168" width="120" height="94" fill="url(#fd-wall)" class="fd-wall"/>
    <rect x="1174" y="160" width="132" height="10" rx="2" class="fd-slab"/>
    <g class="fd-windows" fill="url(#fd-window)">
      <circle cx="1096" cy="108" r="9"/>
      <rect x="1040" y="150" width="40" height="46" rx="2"/>
      <rect x="1112" y="150" width="40" height="46" rx="2"/>
      <rect x="1030" y="210" width="62" height="46" rx="2"/>
      <rect x="1106" y="210" width="60" height="46" rx="2"/>
      <rect x="1194" y="186" width="92" height="70" rx="2"/>
    </g>
    <path class="fd-mullions" d="M1060 150 V196 M1132 150 V196 M1061 210 V256 M1136 210 V256 M1225 186 V256 M1256 186 V256 M1194 206 H1286"/>
    <text class="fd-room-temp" x="1240" y="244" text-anchor="middle" data-bind="room">—</text>
  </g>
  <g class="fd-node fd-node--house">
    <text class="fd-label fd-house-label" x="1218" y="96">HAUS</text>
    <text class="fd-note" x="1218" y="120" data-bind="houseNote">—</text>
  </g>

  <g class="fd-node fd-node--return">
    <text class="fd-label fd-cold" x="1508" y="150" text-anchor="middle">RÜCKLAUF</text>
    <text class="fd-value fd-cold" x="1508" y="186" text-anchor="middle" data-bind="return">—</text>
  </g>
</svg>`;

const C_SUPPLY = 'M82 112 H226 Q240 112 240 126 V170 H252';
const C_RETURN = 'M340 182 H346 Q354 182 354 190 V206 Q354 214 346 214 H60 Q52 214 52 206 V196';

const COMPACT_SVG = `
<svg class="flow-compact" viewBox="0 0 360 270" role="img" aria-label="Wärmefluss der Heizungsanlage" focusable="false">
  <defs>
    <linearGradient id="fdc-supply" gradientUnits="userSpaceOnUse" x1="82" y1="0" x2="252" y2="0"><stop offset="0" stop-color="#ff8a2e"/><stop offset="1" stop-color="#ff3d2e"/></linearGradient>
    <linearGradient id="fdc-return" gradientUnits="userSpaceOnUse" x1="354" y1="0" x2="52" y2="0"><stop offset="0" stop-color="#3fd3ff"/><stop offset="1" stop-color="#2f7dff"/></linearGradient>
    <radialGradient id="fdc-fire" cx=".5" cy=".85" r=".8"><stop offset="0" stop-color="#fff0c4"/><stop offset=".3" stop-color="#ffb24a"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>
  </defs>
  <text class="fdc-label fd-cold" x="16" y="28">AUSSEN</text>
  <text class="fdc-value fd-cold" x="16" y="52" data-bind="outside">—</text>

  <g class="fd-pipe fd-pipe--return"><path class="fd-pipe-glow" d="${C_RETURN}"/><path class="fd-pipe-casing" d="${C_RETURN}"/><path class="fd-pipe-core" d="${C_RETURN}" stroke="url(#fdc-return)"/><path class="fd-flow" d="${C_RETURN}"/></g>
  <g class="fd-pipe fd-pipe--supply"><path class="fd-pipe-glow" d="${C_SUPPLY}"/><path class="fd-pipe-casing" d="${C_SUPPLY}"/><path class="fd-pipe-core" d="${C_SUPPLY}" stroke="url(#fdc-supply)"/><path class="fd-flow" d="${C_SUPPLY}"/></g>

  <text class="fdc-label fd-hot" x="150" y="78" text-anchor="middle">VORLAUF</text>
  <text class="fdc-value fd-hot" x="150" y="100" text-anchor="middle" data-bind="supply">—</text>

  <g class="fd-boiler">
    <rect x="22" y="88" width="60" height="108" rx="7" class="fd-boiler-body fdc-boiler"/>
    <rect x="31" y="100" width="42" height="9" rx="2" class="fd-display"/>
    <rect x="32" y="148" width="40" height="38" rx="4" class="fd-window-frame"/>
    <rect x="33" y="149" width="38" height="36" rx="3" fill="url(#fdc-fire)" class="fd-fire"/>
  </g>

  <g class="fd-house">
    <rect x="252" y="128" width="88" height="68" class="fd-wall fdc-wall"/>
    <path d="M244 132 L296 88 L348 132 Z" class="fd-roof fdc-roof"/>
    <g class="fd-windows fdc-windows">
      <rect x="262" y="140" width="24" height="20" rx="1.5"/><rect x="306" y="140" width="24" height="20" rx="1.5"/>
      <rect x="262" y="168" width="24" height="22" rx="1.5"/><rect x="306" y="168" width="24" height="22" rx="1.5"/>
    </g>
  </g>
  <text class="fdc-label fd-house-label" x="296" y="54" text-anchor="middle">HAUS</text>
  <text class="fdc-note" x="296" y="70" text-anchor="middle" data-bind="houseNote">—</text>

  <text class="fdc-label fd-hot" x="52" y="240" text-anchor="middle">KESSEL</text>
  <text class="fdc-value fd-hot" x="52" y="262" text-anchor="middle" data-bind="boiler">—</text>
  <text class="fdc-label fd-cold" x="232" y="240" text-anchor="middle">RÜCKLAUF</text>
  <text class="fdc-value fd-cold" x="232" y="262" text-anchor="middle" data-bind="return">—</text>
</svg>`;

/**
 * @param {HTMLElement} container
 * @param {{chartRoom?: string}} options
 */
export function createFlowDiagram(container, { chartRoom } = {}) {
  container.innerHTML = WIDE_SVG + COMPACT_SVG;
  const binds = (key) => container.querySelectorAll(`[data-bind="${key}"]`);
  const set = (key, value) => binds(key).forEach((el) => {
    setText(el, value);
    el.classList.toggle('is-missing', value === null || value === '—');
  });

  return {
    /**
     * @param {object} current normalized current state
     * @param {object} status evaluateSystemStatus() result
     */
    update(current, status) {
      const missing = (v) => (isNum(v) ? null : '—');
      set('outside', missing(current.outside.temperature) ?? fmtTemp(current.outside.temperature, 1));
      set('boiler', missing(current.boiler.temperature) ?? fmtTemp(current.boiler.temperature, 0));
      set('supply', missing(current.heating.supplyTemperature) ?? fmtTemp(current.heating.supplyTemperature, 0));
      set('return', missing(current.heating.returnTemperature) ?? fmtTemp(current.heating.returnTemperature, 0));
      const room = current.rooms.find((r) => r.id === chartRoom);
      set('room', isNum(room?.temperature) ? fmtTemp(room.temperature, 1) : '—');

      const burner = current.boiler.burner;
      const supply = current.heating.supplyTemperature;
      const heating = burner === true || current.heating.pump === true || (isNum(supply) && supply > 35);
      const note = current.system.optolink === false
        ? 'Kesseldaten nicht verfügbar'
        : heating ? 'Räume werden beheizt' : burner === false ? 'Heizung in Ruhe' : 'Keine Daten';
      set('houseNote', note);

      setData(container, 'burner', burner === true ? 'on' : burner === false ? 'off' : 'unknown');
      setData(container, 'flow', heating ? 'on' : 'off');
      setData(container, 'severity', status?.severity ?? 'unknown');
      const label = `Außen ${fmtTemp(current.outside.temperature)}, Kessel ${fmtTemp(current.boiler.temperature, 0)}, `
        + `Vorlauf ${fmtTemp(supply, 0)}, Rücklauf ${fmtTemp(current.heating.returnTemperature, 0)}, Brenner ${burner ? 'aktiv' : 'aus'}`;
      container.setAttribute('aria-label', label);
    },
  };
}

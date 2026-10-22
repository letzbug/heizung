/**
 * OUTDOOR SCENE SYSTEM
 *
 *   selectOutdoorScene(outside, now)  → scene descriptor   (pure, single source of truth)
 *   createSceneRenderer(container)    → renders the descriptor behind the system diagram
 *
 * No images are generated at runtime. Scenes are procedural SVG until real
 * images are registered in SCENE_ASSETS (see assets/weather/README.md).
 */
import { isNum } from '../core/format.js';

/** Temperature bands (°C). Upper bound exclusive except "mild" (≤ 25). */
export const SCENE_BANDS = Object.freeze([
  { id: 'winter', label: 'Winter', test: (t) => t < 0 },
  { id: 'cold', label: 'Kalt', test: (t) => t < 8 },
  { id: 'cool', label: 'Kühl', test: (t) => t < 15 },
  { id: 'mild', label: 'Mild', test: (t) => t <= 25 },
  { id: 'summer', label: 'Sommer', test: () => true },
]);

const WEATHER_LABELS = {
  clear: 'Klar', 'partly-cloudy': 'Leicht bewölkt', cloudy: 'Bewölkt', fog: 'Nebel', rain: 'Regen', snow: 'Schnee',
};

/**
 * Register real images here once they exist. Keys are tried in order:
 * "{base}-{weather}-{time}", "{base}-{time}", "{base}".
 * Example: 'winter-night': 'assets/weather/winter-night.webp'
 * Listing files explicitly avoids 404 probing on the Raspberry Pi.
 */
export const SCENE_ASSETS = Object.freeze({});

/** Human-readable weather label ("Leicht bewölkt"). */
export function weatherLabel(condition) {
  return WEATHER_LABELS[condition] ?? 'Keine Wetterdaten';
}

/**
 * THE central scene rule. Temperature picks the base; weather can override
 * (snow → winter); sunrise/sunset (or isDay) picks day or night.
 *
 * @param {object|null} outside normalized outside block
 * @param {number} [now]
 */
export function selectOutdoorScene(outside, now = Date.now()) {
  const t = outside?.temperature;
  let base = isNum(t) ? SCENE_BANDS.find((b) => b.test(t)).id : 'cool';
  const weather = outside?.weather ?? (isNum(t) ? 'clear' : 'cloudy');
  if (weather === 'snow') base = 'winter';

  let isDay = outside?.isDay;
  if (typeof isDay !== 'boolean') {
    if (isNum(outside?.sunrise) && isNum(outside?.sunset)) isDay = now >= outside.sunrise && now < outside.sunset;
    else {
      const h = new Date(now).getHours();
      isDay = h >= 7 && h < 19;
    }
  }
  const time = isDay ? 'day' : 'night';
  const bandLabel = SCENE_BANDS.find((b) => b.id === base).label;
  return {
    id: `${base}-${weather}-${time}`,
    base,
    weather,
    time,
    label: `${bandLabel} · ${weatherLabel(weather)} · ${isDay ? 'Tag' : 'Nacht'}`,
    asset: resolveAsset(base, weather, time),
  };
}

function resolveAsset(base, weather, time) {
  for (const key of [`${base}-${weather}-${time}`, `${base}-${time}`, base]) {
    if (SCENE_ASSETS[key]) return SCENE_ASSETS[key];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Procedural scene rendering
// ---------------------------------------------------------------------------

const PALETTES = {
  winter: {
    night: { sky: ['#050d1c', '#0f2342', '#1b3558'], ground: ['#7d93b2', '#2a3c58'], far: '#14294a', near: '#091425', cap: '#c9d8ec', capOpacity: 0.85 },
    day: { sky: ['#1a2d4a', '#3f5d84', '#6b88ab'], ground: ['#c3d2e4', '#7489a6'], far: '#2b4466', near: '#15253c', cap: '#e8f0fa', capOpacity: 0.9 },
  },
  cold: {
    night: { sky: ['#040b18', '#0b1d38', '#15304f'], ground: ['#1e2f47', '#0c1728'], far: '#112442', near: '#07111f', cap: '#6f87a8', capOpacity: 0.35 },
    day: { sky: ['#162740', '#33506f', '#56718f'], ground: ['#3a4c62', '#1b293b'], far: '#243b57', near: '#112033', cap: '#9fb4cc', capOpacity: 0.35 },
  },
  cool: {
    night: { sky: ['#050b16', '#0e1d33', '#182c45'], ground: ['#13201f', '#0a1312'], far: '#122321', near: '#08120f', cap: null, capOpacity: 0 },
    day: { sky: ['#15283d', '#2f4b66', '#4f6b86'], ground: ['#24352c', '#131f19'], far: '#20362f', near: '#0f1d17', cap: null, capOpacity: 0 },
  },
  mild: {
    night: { sky: ['#050b17', '#0d1f36', '#163048'], ground: ['#112319', '#08130d'], far: '#10281c', near: '#07150d', cap: null, capOpacity: 0 },
    day: { sky: ['#143052', '#2e5a82', '#5486ad'], ground: ['#1f4029', '#102414'], far: '#1c3f2b', near: '#0d2416', cap: null, capOpacity: 0 },
  },
  summer: {
    night: { sky: ['#070b18', '#161c38', '#2a2a48'], ground: ['#1f2414', '#10140a'], far: '#1b2a1a', near: '#0c160b', cap: null, capOpacity: 0 },
    day: { sky: ['#1a3355', '#3a6a93', '#c79a5c'], ground: ['#4a4a22', '#25260f'], far: '#2b4527', near: '#132512', cap: null, capOpacity: 0 },
  },
};

function hash(i, seed) {
  let x = Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(seed, 0x85ebca6b);
  x ^= x >>> 15;
  x = Math.imul(x, 0x2c1b3c6d);
  x ^= x >>> 12;
  return (x >>> 0) / 4294967296;
}

/** Pine tree silhouette path (+ optional snow cap path). */
function pine(x, base, h, w) {
  const tiers = [[1, 0.62, 0.32], [0.66, 0.32, 0.42], [0.36, 0, 0.5]]; // [top, bottom, halfWidth]
  let d = `M${x} ${base - h}`;
  const right = [];
  const left = [];
  for (const [, bottom, half] of tiers) {
    right.push(`L${(x + w * half).toFixed(1)} ${(base - h * bottom).toFixed(1)}`, `L${(x + w * half * 0.45).toFixed(1)} ${(base - h * bottom).toFixed(1)}`);
    left.unshift(`L${(x - w * half * 0.45).toFixed(1)} ${(base - h * bottom).toFixed(1)}`, `L${(x - w * half).toFixed(1)} ${(base - h * bottom).toFixed(1)}`);
  }
  right.pop();
  left.shift();
  d += right.join('') + `L${(x + w * 0.5).toFixed(1)} ${base}L${(x - w * 0.5).toFixed(1)} ${base}` + left.join('') + 'Z';
  const cap = `M${x} ${base - h}L${(x + w * 0.17).toFixed(1)} ${(base - h * 0.8).toFixed(1)}L${(x - w * 0.17).toFixed(1)} ${(base - h * 0.8).toFixed(1)}Z`
    + `M${(x + w * 0.3).toFixed(1)} ${(base - h * 0.62).toFixed(1)}L${(x + w * 0.12).toFixed(1)} ${(base - h * 0.6).toFixed(1)}L${(x + w * 0.2).toFixed(1)} ${(base - h * 0.66).toFixed(1)}Z`
    + `M${(x - w * 0.3).toFixed(1)} ${(base - h * 0.62).toFixed(1)}L${(x - w * 0.12).toFixed(1)} ${(base - h * 0.6).toFixed(1)}L${(x - w * 0.2).toFixed(1)} ${(base - h * 0.66).toFixed(1)}Z`;
  return { d, cap };
}

function forest(seed, ranges, count, minH, maxH, baseY) {
  let body = '';
  let caps = '';
  let k = 0;
  for (const [from, to] of ranges) {
    for (let i = 0; i < count; i++, k++) {
      const x = from + (to - from) * ((i + 0.5 + (hash(k, seed) - 0.5) * 0.8) / count);
      const h = minH + (maxH - minH) * hash(k, seed + 1);
      const base = baseY + hash(k, seed + 2) * 6;
      const tree = pine(Math.round(x), Math.round(base), Math.round(h), Math.round(h * 0.46));
      body += tree.d;
      caps += tree.cap;
    }
  }
  return { body, caps };
}

function sceneSvg(scene) {
  const pal = PALETTES[scene.base][scene.time];
  const night = scene.time === 'night';
  const w = scene.weather;
  const overcast = w === 'cloudy' || w === 'rain' || w === 'snow' || w === 'fog';
  const parts = [];

  parts.push(`<defs>
    <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${pal.sky[0]}"/><stop offset=".6" stop-color="${pal.sky[1]}"/><stop offset="1" stop-color="${pal.sky[2]}"/>
    </linearGradient>
    <linearGradient id="sc-ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${pal.ground[0]}"/><stop offset="1" stop-color="${pal.ground[1]}"/>
    </linearGradient>
    <radialGradient id="sc-orb-glow"><stop offset="0" stop-color="${night ? '#cfe0ff' : '#ffe2a8'}" stop-opacity=".45"/><stop offset="1" stop-color="${night ? '#cfe0ff' : '#ffe2a8'}" stop-opacity="0"/></radialGradient>
    <radialGradient id="sc-fog"><stop offset="0" stop-color="#c9d6e6" stop-opacity=".55"/><stop offset="1" stop-color="#c9d6e6" stop-opacity="0"/></radialGradient>
  </defs>`);
  parts.push('<rect width="1600" height="300" fill="url(#sc-sky)"/>');

  // Stars
  if (night && !overcast) {
    let stars = '';
    for (let i = 0; i < 70; i++) {
      const x = (hash(i, 11) * 1600).toFixed(0);
      const y = (hash(i, 12) * 170).toFixed(0);
      const r = (0.5 + hash(i, 13) * 1.1).toFixed(2);
      stars += `<circle cx="${x}" cy="${y}" r="${r}" opacity="${(0.25 + hash(i, 14) * 0.6).toFixed(2)}"/>`;
    }
    parts.push(`<g fill="#dfe8ff">${stars}</g>`);
  }

  // Moon / sun
  if (w !== 'fog' && w !== 'rain' && w !== 'snow') {
    const op = w === 'cloudy' ? 0.35 : 1;
    if (night) {
      parts.push(`<g opacity="${op}"><circle cx="1510" cy="64" r="58" fill="url(#sc-orb-glow)"/><circle cx="1510" cy="64" r="15" fill="#e8eefb"/><circle cx="1517" cy="59" r="13" fill="${pal.sky[0]}" opacity=".9"/></g>`);
    } else {
      parts.push(`<g opacity="${op}"><circle cx="1500" cy="66" r="80" fill="url(#sc-orb-glow)"/><circle cx="1500" cy="66" r="17" fill="#fff1cf"/></g>`);
    }
  }

  // Clouds
  if (w === 'partly-cloudy' || overcast) {
    const count = w === 'partly-cloudy' ? 4 : 9;
    const fill = night ? '#1d2c44' : '#8696ad';
    const op = w === 'partly-cloudy' ? 0.45 : 0.62;
    let clouds = '';
    for (let i = 0; i < count; i++) {
      const cx = 80 + ((i + hash(i, 21)) / count) * 1440;
      const cy = 30 + hash(i, 22) * 70;
      const s = 0.7 + hash(i, 23) * 0.9;
      clouds += `<g transform="translate(${cx.toFixed(0)} ${cy.toFixed(0)}) scale(${s.toFixed(2)})"><ellipse cx="0" cy="0" rx="90" ry="20"/><ellipse cx="-34" cy="-10" rx="40" ry="20"/><ellipse cx="22" cy="-16" rx="46" ry="26"/></g>`;
    }
    parts.push(`<g fill="${fill}" opacity="${op}">${clouds}</g>`);
  }

  // Far hills + far forest
  parts.push(`<path d="M0 214 C 180 196 360 210 540 200 S 900 186 1100 198 S 1450 190 1600 204 V300 H0Z" fill="${pal.far}" opacity=".9"/>`);
  const far = forest(7, [[0, 1600]], 46, 22, 46, 218);
  parts.push(`<path d="${far.body}" fill="${pal.far}"/>`);
  if (pal.cap) parts.push(`<path d="${far.caps}" fill="${pal.cap}" opacity="${(pal.capOpacity * 0.6).toFixed(2)}"/>`);

  // Fog behind the near layer
  if (w === 'fog') {
    parts.push('<g><ellipse cx="300" cy="222" rx="520" ry="46" fill="url(#sc-fog)"/><ellipse cx="1050" cy="230" rx="640" ry="52" fill="url(#sc-fog)"/><ellipse cx="1500" cy="214" rx="360" ry="40" fill="url(#sc-fog)"/></g>');
  }

  // Ground
  parts.push('<path d="M0 252 C 300 246 700 254 1000 250 S 1400 246 1600 254 V300 H0Z" fill="url(#sc-ground)"/>');

  // Near forest (left and right clusters, a few in between)
  const near = forest(3, [[-10, 400], [1330, 1610]], 9, 70, 140, 258);
  const mid = forest(5, [[640, 780]], 2, 44, 70, 252);
  parts.push(`<path d="${near.body}${mid.body}" fill="${pal.near}"/>`);
  if (pal.cap) parts.push(`<path d="${near.caps}${mid.caps}" fill="${pal.cap}" opacity="${pal.capOpacity}"/>`);

  // Precipitation (two stacked tiles for a seamless loop)
  if (w === 'rain' || w === 'snow') {
    let tile = '';
    for (let i = 0; i < (w === 'rain' ? 110 : 140); i++) {
      const x = (hash(i, 31) * 1640).toFixed(0);
      const y = (hash(i, 32) * 300).toFixed(0);
      tile += w === 'rain'
        ? `<path d="M${x} ${y}l-5 15"/>`
        : `<circle cx="${x}" cy="${y}" r="${(0.9 + hash(i, 33) * 1.6).toFixed(1)}"/>`;
    }
    const attrs = w === 'rain' ? 'stroke="#a9c6ff" stroke-opacity=".38" stroke-width="1.2" fill="none"' : 'fill="#eef4ff" fill-opacity=".8"';
    parts.push(`<g class="scene-precip scene-precip--${w}" ${attrs}><g>${tile}</g><g transform="translate(0 -300)">${tile}</g></g>`);
  }

  return `<svg class="scene-svg" viewBox="0 0 1600 300" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">${parts.join('')}</svg>`;
}

/**
 * Renders a scene into `container`; re-renders only when the scene id changes.
 * @param {HTMLElement} container
 */
export function createSceneRenderer(container) {
  let currentId = null;
  return {
    update(scene) {
      if (!scene || scene.id === currentId) return;
      currentId = scene.id;
      container.dataset.scene = scene.id;
      container.dataset.base = scene.base;
      container.dataset.weather = scene.weather;
      container.dataset.time = scene.time;
      // Procedural SVG is always rendered (also as fallback and precipitation layer).
      container.innerHTML = sceneSvg(scene);
      if (scene.asset) {
        const img = document.createElement('img');
        img.className = 'scene-img';
        img.alt = '';
        img.decoding = 'async';
        img.src = scene.asset;
        img.addEventListener('error', () => img.remove(), { once: true });
        container.prepend(img);
      }
    },
  };
}

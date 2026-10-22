/** OUTDOOR / WEATHER CARD */
import { fmtClock, fmtPercent, fmtTemp, isNum } from '../core/format.js';
import { weatherLabel } from './weather-scenes.js';
import { h, setText, setData } from './dom.js';

function illustration(weather, isDay) {
  const cloudy = weather !== 'clear';
  const orb = isDay
    ? '<circle cx="62" cy="34" r="30" fill="url(#wc-glow)"/><circle cx="62" cy="34" r="13" fill="#ffe7b0"/>'
    : '<circle cx="62" cy="34" r="30" fill="url(#wc-glow)"/><circle cx="62" cy="34" r="13" fill="#e6edfb" mask="url(#wc-moon)"/>';
  const cloud = cloudy ? '<path d="M26 66h44a12 12 0 0 0 1.5-23.9A17 17 0 0 0 40 40.5 13.5 13.5 0 0 0 26 66z" fill="#2a3b55" opacity=".95"/><path d="M26 66h44a12 12 0 0 0 1.5-23.9" fill="none" stroke="#9fb4d4" stroke-opacity=".35"/>' : '';
  let extra = '';
  if (weather === 'rain') extra = '<path d="M36 72l-3 8M48 72l-3 8M60 72l-3 8" stroke="#8fb6ff" stroke-width="2" stroke-linecap="round" opacity=".8"/>';
  if (weather === 'snow') extra = '<g fill="#eef4ff"><circle cx="36" cy="76" r="2"/><circle cx="48" cy="80" r="2"/><circle cx="60" cy="76" r="2"/></g>';
  if (weather === 'fog') extra = '<path d="M20 74h56M26 81h44" stroke="#a9b8cc" stroke-width="3" stroke-linecap="round" opacity=".6"/>';
  const showOrb = weather === 'clear' || weather === 'partly-cloudy' || weather === 'cloudy';
  return `<svg viewBox="0 0 96 90" aria-hidden="true" focusable="false"><defs><mask id="wc-moon"><rect width="96" height="90" fill="#fff"/><circle cx="69" cy="28" r="11.5" fill="#000"/></mask><radialGradient id="wc-glow"><stop offset="0" stop-color="${isDay ? '#ffd27a' : '#bcd2ff'}" stop-opacity=".45"/><stop offset="1" stop-color="${isDay ? '#ffd27a' : '#bcd2ff'}" stop-opacity="0"/></radialGradient></defs>${showOrb ? orb : ''}${cloud}${extra}</svg>`;
}

/** @param {HTMLElement} root */
export function createWeatherCard(root) {
  const q = (sel) => root.querySelector(sel);
  const els = {
    temp: q('[data-w="temp"]'), cond: q('[data-w="cond"]'), min: q('[data-w="min"]'), max: q('[data-w="max"]'),
    hum: q('[data-w="hum"]'), sun: q('[data-w="sun"]'), art: q('[data-w="art"]'),
  };
  let lastArt = null;
  return {
    update(outside, scene) {
      setText(els.temp, fmtTemp(outside.temperature, 1));
      setText(els.cond, outside.weather ? weatherLabel(outside.weather) : 'Keine Wetterdaten');
      setText(els.min, fmtTemp(outside.min, 1));
      setText(els.max, fmtTemp(outside.max, 1));
      setText(els.hum, fmtPercent(outside.humidity));
      setText(els.sun, isNum(outside.sunrise) && isNum(outside.sunset) ? `${fmtClock(outside.sunrise)} – ${fmtClock(outside.sunset)}` : '—');
      const key = `${scene.weather}-${scene.time}`;
      if (key !== lastArt) {
        lastArt = key;
        els.art.innerHTML = illustration(scene.weather, scene.time === 'day');
      }
      setData(root, 'scene', scene.base);
    },
  };
}

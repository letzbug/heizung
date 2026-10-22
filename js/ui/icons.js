/**
 * Inline SVG icons (static, trusted markup). 24×24, stroke = currentColor.
 */
const P = {
  flame: '<path d="M12 2.8c.7 3 2.7 4.7 4.2 6.7a7.4 7.4 0 0 1 1.8 4.9 6 6 0 0 1-12 0c0-2.5 1.2-4.4 2.7-5.8.1 1.8.8 3 2 3.6-.3-3.5.5-6.4 1.3-9.4z"/><path d="M12 20.4a2.6 2.6 0 0 1-2.6-2.6c0-1.4 1-2.4 1.8-3.3.3 1 .9 1.6 1.7 1.9.4-.8.6-1.6.6-2.6 1 1.1 1.6 2.4 1.6 3.8a3.1 3.1 0 0 1-3.1 2.8z"/>',
  home: '<path d="M3.5 11.2 12 4l8.5 7.2"/><path d="M5.8 9.5V20h12.4V9.5"/><path d="M10 20v-5.2h4V20"/>',
  sofa: '<path d="M5 11V8.6A2.6 2.6 0 0 1 7.6 6h8.8A2.6 2.6 0 0 1 19 8.6V11"/><path d="M3 12.6a1.6 1.6 0 0 1 3.2 0V15h11.6v-2.4a1.6 1.6 0 0 1 3.2 0V18H3z"/><path d="M5 18v2M19 18v2"/>',
  bed: '<path d="M3 18V6.5M3 14h18v4M21 18v-5.5A3.5 3.5 0 0 0 17.5 9H11v5"/><circle cx="6.8" cy="10.6" r="1.9"/>',
  kitchen: '<path d="M4 10.5h16M6 10.5v6.8A2.7 2.7 0 0 0 8.7 20h6.6a2.7 2.7 0 0 0 2.7-2.7v-6.8"/><path d="M9 7.2c0-1 .9-1.2.9-2.3M12 7.2c0-1 .9-1.2.9-2.3M15 7.2c0-1 .9-1.2.9-2.3"/>',
  office: '<rect x="3" y="4.5" width="18" height="12" rx="1.8"/><path d="M9 20h6M12 16.5V20"/>',
  bath: '<path d="M3.5 12h17v2.6a4.4 4.4 0 0 1-4.4 4.4H7.9a4.4 4.4 0 0 1-4.4-4.4z"/><path d="M6 12V6.2a2 2 0 0 1 3.6-1.2"/><path d="M7 19l-1 1.6M17 19l1 1.6"/>',
  room: '<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M4 13h16"/>',
  cloud: '<path d="M7.2 18.2h9.9a4 4 0 0 0 .5-8A5.6 5.6 0 0 0 6.9 9a4.6 4.6 0 0 0 .3 9.2z"/>',
  faucet: '<path d="M4 10.5h8.5a3.5 3.5 0 0 1 3.5 3.5v1"/><path d="M4 7.5v6M8 7.5V5.2M6 5.2h4"/><path d="M16 17.6c0-.9.8-1.7.8-1.7s.8.8.8 1.7a.8.8 0 0 1-1.6 0z"/>',
  gauge: '<path d="M4.6 17.4a8.6 8.6 0 1 1 14.8 0"/><path d="M12 13.4 15.6 9"/><circle cx="12" cy="13.4" r="1.4"/>',
  'arrow-right': '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19.5 12h-15M10.5 6l-6 6 6 6"/>',
  thermometer: '<path d="M14 14.6V4.8a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v7"/>',
  battery: '<rect x="2.8" y="7.5" width="16" height="9" rx="2"/><path d="M21.2 10.6v2.8"/><path d="M6 10.5v3M9 10.5v3M12 10.5v3"/>',
  signal: '<path d="M5 18.5v-2M9.5 18.5v-5M14 18.5v-8M18.5 18.5V7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.6V12l3 1.9"/>',
  link: '<path d="M9.6 14.4l4.8-4.8"/><path d="M8.2 11.3 6.4 13a3.4 3.4 0 0 0 4.8 4.8l1.7-1.8M15.8 12.7l1.8-1.7a3.4 3.4 0 0 0-4.8-4.8l-1.7 1.8"/>',
  radio: '<circle cx="12" cy="12" r="1.6"/><path d="M8.6 8.6a4.8 4.8 0 0 0 0 6.8M15.4 8.6a4.8 4.8 0 0 1 0 6.8M5.8 5.8a8.8 8.8 0 0 0 0 12.4M18.2 5.8a8.8 8.8 0 0 1 0 12.4"/>',
  insight: '<path d="M9.2 18.5h5.6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/><path d="M12 7v3l2 1.4"/>',
  bars: '<path d="M4 20h16"/><path d="M6.5 17v-4M10.5 17V9M14.5 17v-6M18.5 17V5.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4 7 7M17 17l1.6 1.6M5.4 18.6 7 17M17 7l1.6-1.6"/>',
  moon: '<path d="M19.5 14.6A7.8 7.8 0 0 1 9.4 4.5a7.8 7.8 0 1 0 10.1 10.1z"/>',
  rain: '<path d="M7.2 15.2h9.9a4 4 0 0 0 .5-8A5.6 5.6 0 0 0 6.9 6a4.6 4.6 0 0 0 .3 9.2z"/><path d="M8.5 18l-1 2.4M12.5 18l-1 2.4M16.5 18l-1 2.4"/>',
  snow: '<path d="M7.2 15.2h9.9a4 4 0 0 0 .5-8A5.6 5.6 0 0 0 6.9 6a4.6 4.6 0 0 0 .3 9.2z"/><path d="M8 19h.01M12 20.5h.01M16 19h.01"/>',
  fog: '<path d="M4 9.5h16M3 13.5h18M5 17.5h14"/>',
  alert: '<path d="M12 4.2 21 19.5H3z"/><path d="M12 10v4.2M12 16.9v.1"/>',
  check: '<path d="M5 12.5 9.5 17 19 7.5"/>',
  drop: '<path d="M12 3.6s5.8 6.1 5.8 10.1a5.8 5.8 0 0 1-11.6 0C6.2 9.7 12 3.6 12 3.6z"/>',
  sunrise: '<path d="M4 18h16M7 14.5a5 5 0 0 1 10 0M12 4v4M9.5 6.2 12 3.8l2.5 2.4"/>',
};

/** Static SVG markup for an icon. */
export function icon(name, className = 'ic') {
  const body = P[name] ?? P.room;
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/** Icon for a weather condition and time of day. */
export function weatherIconName(condition, isDay) {
  switch (condition) {
    case 'rain': return 'rain';
    case 'snow': return 'snow';
    case 'fog': return 'fog';
    case 'cloudy': return 'cloud';
    case 'partly-cloudy':
    case 'clear':
      return isDay === false ? 'moon' : 'sun';
    default:
      return 'cloud';
  }
}

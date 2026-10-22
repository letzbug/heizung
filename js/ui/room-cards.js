/**
 * ROOM CARDS — generated from the normalized room list.
 * Target temperatures are shown as information only.
 */
import { fmtAge, fmtPercent, fmtTemp, isNum } from '../core/format.js';
import { icon } from './icons.js';
import { h, setData, setText } from './dom.js';
import { roomTone } from './metric-cards.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** @param {HTMLElement} container */
export function createRoomCards(container) {
  const cards = new Map();

  function build(room) {
    const value = h('div', { class: 'room-val' }, '—');
    const fill = h('i');
    const target = h('div', { class: 'room-target' });
    const badge = h('span', { class: 'room-badge', hidden: true });
    const battery = h('span', { class: 'room-meta-v' });
    const signal = h('span', { class: 'room-meta-v' });
    const age = h('span', { class: 'room-meta-v' });
    const humidity = h('span', { class: 'room-meta-v' });
    const el = h('article', { class: 'room', dataset: { room: room.id } },
      h('header', { class: 'room-hd' },
        h('span', { class: 'room-ic', trustedHtml: icon(room.icon) }),
        h('span', { class: 'room-name', text: room.name }),
        badge),
      value,
      h('div', { class: 'metric-bar', 'aria-hidden': 'true' }, fill),
      target,
      h('footer', { class: 'room-meta' },
        h('span', { class: 'room-meta-i', title: 'Luftfeuchte' }, h('span', { trustedHtml: icon('drop', 'ic ic--xs') }), humidity),
        h('span', { class: 'room-meta-i', title: 'Batterie' }, h('span', { trustedHtml: icon('battery', 'ic ic--xs') }), battery),
        h('span', { class: 'room-meta-i', title: 'Zigbee-Signal' }, h('span', { trustedHtml: icon('signal', 'ic ic--xs') }), signal),
        h('span', { class: 'room-meta-i', title: 'Letzte Meldung' }, h('span', { trustedHtml: icon('clock', 'ic ic--xs') }), age)));
    return { el, value, fill, target, badge, battery, signal, age, humidity };
  }

  return {
    /**
     * @param {object[]} rooms normalized rooms
     * @param {object} roomStatus status.rooms map
     * @param {number} now
     */
    update(rooms, roomStatus = {}, now = Date.now()) {
      if (!rooms.length) {
        cards.clear();
        container.replaceChildren(h('p', { class: 'empty-note', text: 'Keine Raumsensoren in den Daten.' }));
        return;
      }
      const ids = new Set(rooms.map((r) => r.id));
      for (const [id, card] of cards) if (!ids.has(id)) { card.el.remove(); cards.delete(id); }
      if (container.querySelector('.empty-note')) container.replaceChildren();

      rooms.forEach((room) => {
        let card = cards.get(room.id);
        if (!card) {
          card = build(room);
          cards.set(room.id, card);
        }
        container.append(card.el); // keeps order
        const st = roomStatus[room.id] ?? {};
        const online = st.online !== false;
        setText(card.value, fmtTemp(room.temperature, 1));
        setText(card.target, isNum(room.target) ? `Soll: ${fmtTemp(room.target, 1)}` : 'Soll: —');
        setData(card.el, 'tone', roomTone(room.temperature));
        card.el.classList.toggle('is-offline', !online);
        card.el.classList.toggle('is-missing', !isNum(room.temperature));
        card.fill.style.setProperty('--fill', isNum(room.temperature) ? `${(0.04 + 0.96 * clamp01((room.temperature - 14) / 12)) * 100}%` : '0%');

        let badge = null;
        if (!isNum(room.temperature) && !isNum(room.lastUpdate)) badge = 'Keine Daten';
        else if (!online) badge = 'Offline';
        else if (st.lowBattery) badge = 'Batterie';
        card.badge.hidden = !badge;
        setText(card.badge, badge ?? '');
        setData(card.badge, 'kind', !online ? 'offline' : 'battery');

        setText(card.humidity, fmtPercent(room.humidity));
        setText(card.battery, fmtPercent(room.battery));
        card.battery.parentElement.classList.toggle('is-warn', Boolean(st.lowBattery));
        setText(card.signal, fmtPercent(room.signal));
        card.signal.parentElement.classList.toggle('is-warn', Boolean(st.weakSignal));
        setText(card.age, isNum(room.lastUpdate) ? fmtAge((now - room.lastUpdate) / 1000) : '—');
        card.el.setAttribute('aria-label', `${room.name}: ${fmtTemp(room.temperature, 1)}${isNum(room.target) ? `, Soll ${fmtTemp(room.target, 1)}` : ''}${online ? '' : ', Sensor offline'}`);
      });
    },
  };
}

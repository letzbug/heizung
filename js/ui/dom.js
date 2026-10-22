/**
 * Minimal DOM helpers. Data values are always written via textContent;
 * innerHTML is used ONLY for trusted, static SVG markup from icons.js and
 * the diagram templates (never for data).
 */
import { MISSING } from '../core/format.js';

export const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Create an element. `props.text` sets textContent, `props.class` the class
 * name, `props.trustedHtml` static markup; everything else becomes an attribute.
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  applyProps(el, props);
  appendChildren(el, children);
  return el;
}

/** Create an SVG element with attributes. */
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== null && value !== undefined && value !== false) el.setAttribute(key, String(value));
  }
  appendChildren(el, children);
  return el;
}

function applyProps(el, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = String(value);
    else if (key === 'trustedHtml') el.innerHTML = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? '' : String(value));
  }
}

function appendChildren(el, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Set text only when it changed; null/undefined become "—". */
export function setText(el, value) {
  if (!el) return;
  const str = value === null || value === undefined || value === '' ? MISSING : String(value);
  if (el.textContent !== str) el.textContent = str;
}

/** Toggle a data-attribute only when it changed. */
export function setData(el, key, value) {
  if (!el) return;
  const str = value === null || value === undefined ? '' : String(value);
  if (el.dataset[key] !== str) el.dataset[key] = str;
}

/**
 * Render `text` into `el`, wrapping the first occurrence of `highlight`
 * in <mark>. Safe: uses text nodes only.
 */
export function setHighlightedText(el, text, highlight, markClass = 'hl') {
  el.replaceChildren();
  const i = highlight ? text.indexOf(highlight) : -1;
  if (i < 0) {
    el.textContent = text;
    return;
  }
  el.append(text.slice(0, i), h('mark', { class: markClass, text: highlight }), text.slice(i + highlight.length));
}

/** SYSTEM STATUS PANEL — renders evaluateSystemStatus().items. */
import { h } from './dom.js';

/** @param {HTMLElement} list */
export function createStatusPanel(list) {
  return {
    update(status) {
      list.replaceChildren(...status.items.map((item) =>
        h('li', { class: 'status-row', dataset: { severity: item.severity, item: item.id } },
          h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'status-label', text: item.label }),
          h('span', { class: 'status-value', text: item.value }))));
    },
  };
}

/**
 * Alert strip below the header for warnings/critical issues.
 * @param {HTMLElement} container
 */
export function createAlerts(container) {
  return {
    update(status) {
      const relevant = status.issues.filter((i) => i.severity === 'warning' || i.severity === 'critical').slice(0, 3);
      container.replaceChildren(...relevant.map((issue) =>
        h('div', { class: 'alert', dataset: { severity: issue.severity } },
          h('span', { class: 'alert-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'alert-text', text: issue.message }))));
    },
  };
}

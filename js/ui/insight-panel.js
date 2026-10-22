/**
 * CAMERON INSIGHT PANEL — renders a list of insight objects.
 * It does not analyse anything; see js/analysis/insights.js.
 */
import { icon } from './icons.js';
import { h, setHighlightedText } from './dom.js';

const CATEGORY_ICON = {
  burner: 'bars', comfort: 'thermometer', pressure: 'gauge', efficiency: 'arrow-left',
  sensors: 'radio', 'hot-water': 'faucet', data: 'alert', agent: 'insight',
};

/**
 * @param {HTMLElement} list
 * @param {HTMLElement} meta
 * @param {{maxVisible?: number}} options
 */
export function createInsightPanel(list, meta, { maxVisible = 3 } = {}) {
  return {
    /**
     * @param {object[]} insights sorted insights
     * @param {{basis?: string}} [info]
     */
    update(insights, info = {}) {
      if (!insights.length) {
        list.replaceChildren(h('li', { class: 'insight insight--empty' },
          h('span', { class: 'insight-text', text: 'Für eine Analyse werden noch Verlaufsdaten gesammelt.' })));
      } else {
        list.replaceChildren(...insights.slice(0, maxVisible).map((ins) => {
          const textEl = h('span', { class: 'insight-text' });
          setHighlightedText(textEl, ins.message, ins.highlight ?? ins.metric);
          const conf = typeof ins.confidence === 'number' ? ` · Konfidenz ${Math.round(ins.confidence * 100)} %` : '';
          return h('li', { class: 'insight', dataset: { severity: ins.severity, source: ins.source ?? 'cameron-local' }, title: `${ins.title}${conf}` },
            h('span', { class: 'insight-ic', trustedHtml: icon(CATEGORY_ICON[ins.category] ?? 'insight') }),
            textEl);
        }));
      }
      const hidden = Math.max(0, insights.length - maxVisible);
      meta.textContent = `${info.basis ?? 'Lokale Regelanalyse'}${hidden ? ` · ${hidden} weitere` : ''}`;
    },
  };
}

(() => {
  'use strict';

  function pluralizeOperationsText(text) {
    const match = /^(\d+) operación\(es\) en esta empresa\.$/.exec(String(text || '').trim());
    if (!match) return null;
    const count = Number(match[1]);
    return `${count} ${count === 1 ? 'operación' : 'operaciones'} en esta empresa.`;
  }

  function normalize() {
    const orgSitesKpi = document.getElementById('orgSitesCount')?.closest('.kpi');
    const orgSitesLabel = orgSitesKpi?.querySelector('span');
    if (orgSitesLabel && orgSitesLabel.textContent !== 'Sitios / operaciones') {
      orgSitesLabel.textContent = 'Sitios / operaciones';
    }

    const globalSitesKpi = document.getElementById('kSites')?.closest('.kpi');
    const globalSitesLabel = globalSitesKpi?.querySelector('span');
    if (globalSitesLabel && globalSitesLabel.textContent !== 'Sitios / operaciones') {
      globalSitesLabel.textContent = 'Sitios / operaciones';
    }

    document.querySelectorAll('#tab-sites .subcard > p').forEach((paragraph) => {
      const replacement = pluralizeOperationsText(paragraph.textContent);
      if (replacement && paragraph.textContent !== replacement) {
        paragraph.textContent = replacement;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalize, { once: true });
  } else {
    normalize();
  }

  const observer = new MutationObserver(normalize);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
})();

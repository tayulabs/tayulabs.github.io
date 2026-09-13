(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const SECTOR_LABELS = {
    fincas: 'Fincas',
    camaroneras: 'Camaroneras',
    bananeras: 'Bananeras',
    ganaderia: 'Ganadería',
  };

  let activeOrgId = '';
  let routingSites = [];
  let loadingSites = null;
  let hooksInstalled = false;
  let observerInstalled = false;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  async function request(path, options = {}) {
    const kc = window.__tayuKeycloak;
    if (!kc?.authenticated || !kc?.token) {
      throw new Error('No hay una sesión administrativa activa.');
    }

    try { await kc.updateToken(30); } catch (_) {}

    const response = await fetch(API_URL + path, {
      cache: 'no-store',
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  }

  async function loadRoutingSites(force = false) {
    if (!activeOrgId) return [];
    if (!force && routingSites.length) return routingSites;
    if (!force && loadingSites) return loadingSites;

    loadingSites = request(
      `/admin/organization/site-routing?organization_id=${encodeURIComponent(activeOrgId)}`
    ).then(rows => {
      routingSites = Array.isArray(rows) ? rows : [];
      return routingSites;
    }).finally(() => {
      loadingSites = null;
    });

    return loadingSites;
  }

  function normalizeTypeFromForm(form) {
    const select = form?.elements?.site_type;
    if (select?.value) return String(select.value).toLowerCase();

    const text = form?.querySelector('.sa-site-type-readonly')?.textContent?.trim().toLowerCase() || '';
    if (text.includes('camaron')) return 'camaronera';
    if (text.includes('banan')) return 'bananera';
    if (text.includes('ganader')) return 'ganaderia';
    if (text.includes('finca')) return 'finca';
    if (text.includes('planta')) return 'planta';
    if (text.includes('bodega')) return 'bodega';
    if (text.includes('oficina')) return 'oficina';
    return 'other';
  }

  function defaultSector(siteType) {
    if (siteType === 'camaronera') return 'camaroneras';
    if (siteType === 'bananera') return 'bananeras';
    if (siteType === 'ganaderia') return 'ganaderia';
    if (siteType === 'finca') return 'fincas';
    return '';
  }

  function sectorOptions(siteType, selected = '') {
    const options = siteType === 'camaronera'
      ? [['camaroneras', 'Camaroneras']]
      : [
          ['', 'Sin sector'],
          ['fincas', 'Fincas'],
          ['bananeras', 'Bananeras'],
          ['ganaderia', 'Ganadería'],
        ];

    return options.map(([value, label]) =>
      `<option value="${esc(value)}" ${String(selected || '') === value ? 'selected' : ''}>${esc(label)}</option>`
    ).join('');
  }

  function siteForForm(form, sites) {
    const slug = String(form?.elements?.slug?.value || '').trim();
    if (!slug) return null;
    return sites.find(site => String(site.slug || '') === slug) || null;
  }

  function renderSectorSelect(select, siteType, selected, preserveTouched = false) {
    const touched = preserveTouched && select.dataset.touched === '1';
    const next = touched ? select.value : (selected || defaultSector(siteType));
    select.innerHTML = sectorOptions(siteType, next);
    if (siteType === 'camaronera') {
      select.value = 'camaroneras';
      select.disabled = true;
      select.title = 'Las Fincas Camaroneras pertenecen al sector Camaroneras.';
    } else {
      select.disabled = false;
      select.title = '';
      if ([...select.options].some(option => option.value === next)) select.value = next;
    }
  }

  async function ensureSectorField(force = false) {
    const host = document.getElementById('tab-sites');
    const form = document.getElementById('superSiteForm');
    if (!host?.classList.contains('active') || !form || !activeOrgId) return;

    let field = form.querySelector('[data-tayu-site-sector-field]');
    let select = form.elements.sector_key;

    if (!field) {
      field = document.createElement('div');
      field.className = 'field';
      field.dataset.tayuSiteSectorField = '1';
      field.innerHTML = `
        <label>Sector operativo</label>
        <select name="sector_key"></select>
        <small style="display:block;margin-top:6px;color:var(--muted);font-size:10.5px;line-height:1.35">
          Define en qué sector aparecerán los dispositivos asignados a este sitio.
        </small>`;

      const statusField = form.elements.administrative_status?.closest('.field');
      if (statusField?.parentNode) statusField.parentNode.insertBefore(field, statusField);
      else form.querySelector('.form-grid')?.appendChild(field);

      select = form.elements.sector_key;
      select?.addEventListener('change', () => { select.dataset.touched = '1'; });
    }

    const siteType = normalizeTypeFromForm(form);
    let selected = defaultSector(siteType);

    try {
      const sites = await loadRoutingSites(force);
      const currentSite = siteForForm(form, sites);
      if (currentSite) selected = currentSite.sector_key || selected;
    } catch (error) {
      console.warn('Cloud Admin site sector field:', error.message);
    }

    if (!form.isConnected || !select) return;
    renderSectorSelect(select, siteType, selected, true);

    const typeSelect = form.elements.site_type;
    if (typeSelect && typeSelect.dataset.tayuSectorBound !== '1') {
      typeSelect.dataset.tayuSectorBound = '1';
      typeSelect.addEventListener('change', () => {
        const current = form.elements.sector_key;
        if (!current) return;
        current.dataset.touched = '0';
        renderSectorSelect(current, normalizeTypeFromForm(form), defaultSector(normalizeTypeFromForm(form)), false);
      });
    }

    if (form.dataset.tayuSectorSubmitBound !== '1') {
      form.dataset.tayuSectorSubmitBound = '1';
      form.addEventListener('submit', captureSectorSave, true);
    }
  }

  async function waitForBaseSaveResult(startedAt) {
    const successBox = document.getElementById('orgSuccess');
    const errorBox = document.getElementById('orgError');
    let sawEmptySuccess = false;

    for (let i = 0; i < 50; i += 1) {
      await sleep(100);
      const successText = successBox?.textContent?.trim() || '';
      const errorText = errorBox?.classList.contains('show') ? (errorBox.textContent?.trim() || '') : '';

      if (!successText) sawEmptySuccess = true;
      if (errorText) return false;
      if (successText && (sawEmptySuccess || Date.now() - startedAt > 300)) return true;
    }

    return false;
  }

  async function persistSectorAfterSiteSave({ slug, sectorKey, startedAt }) {
    const saved = await waitForBaseSaveResult(startedAt);
    if (!saved || !activeOrgId) return;

    try {
      const sites = await loadRoutingSites(true);
      const site = sites.find(row => String(row.slug || '') === String(slug));
      if (!site) throw new Error('No se encontró el sitio recién guardado.');

      const finalSector = site.site_type === 'camaronera' ? 'camaroneras' : (sectorKey || null);
      await request('/admin/organization/site-sector', {
        method: 'POST',
        body: JSON.stringify({ site_id: site.id, sector_key: finalSector }),
      });

      routingSites = [];
      const success = document.getElementById('orgSuccess');
      if (success) success.innerHTML = '<div class="success">Operación y sector actualizados correctamente.</div>';

      await decorateSiteList(true);
      await ensureSectorField(true);
      document.dispatchEvent(new CustomEvent('tayu:site-sector-updated', {
        detail: { site_id: site.id, sector_key: finalSector }
      }));
    } catch (error) {
      const box = document.getElementById('orgError');
      if (box) {
        box.textContent = `La operación se guardó, pero el sector no pudo actualizarse: ${error.message}`;
        box.classList.add('show');
      }
    }
  }

  function captureSectorSave(event) {
    const form = event.currentTarget;
    const slug = String(form.elements.slug?.value || '').trim();
    const siteType = normalizeTypeFromForm(form);
    const select = form.elements.sector_key;
    const sectorKey = siteType === 'camaronera'
      ? 'camaroneras'
      : String(select?.value || '').trim();

    if (!slug) return;
    void persistSectorAfterSiteSave({ slug, sectorKey, startedAt: Date.now() });
  }

  async function decorateSiteList(force = false) {
    const host = document.getElementById('tab-sites');
    if (!host?.classList.contains('active') || !activeOrgId) return;

    try {
      const sites = await loadRoutingSites(force);
      const items = [...host.querySelectorAll('.list > .list-item')];

      items.forEach(item => {
        const meta = item.querySelector('.sa-site-meta, small');
        const metaText = meta?.textContent || '';
        const site = sites.find(row => row.slug && metaText.includes(String(row.slug)));
        if (!site) return;

        const actions = item.querySelector('.sa-site-actions') || item;

        let badge = actions.querySelector('.tayu-routing-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tayu-routing-badge';
          const editButton = actions.querySelector('[data-edit-super-site]');
          if (editButton) actions.insertBefore(badge, editButton);
          else actions.appendChild(badge);
        }
        badge.textContent = `Sector: ${SECTOR_LABELS[site.sector_key] || 'Sin sector'}`;

        if (!actions.querySelector('[data-routing-site]')) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn ghost small';
          button.dataset.routingSite = site.id;
          button.textContent = 'Sector';
          const editButton = actions.querySelector('[data-edit-super-site]');
          if (editButton) actions.insertBefore(button, editButton);
          else actions.appendChild(button);
        }
      });
    } catch (error) {
      console.warn('Cloud Admin site sector list:', error.message);
    }
  }

  function syncSitesView(force = false) {
    void ensureSectorField(force);
    void decorateSiteList(force);
  }

  function installObserver() {
    if (observerInstalled) return;
    const host = document.getElementById('tab-sites');
    if (!host) return;

    observerInstalled = true;
    const observer = new MutationObserver(() => {
      if (!activeOrgId || !host.classList.contains('active')) return;
      queueMicrotask(() => syncSitesView(false));
    });
    observer.observe(host, { childList: true, subtree: true });
  }

  function installHooks() {
    if (hooksInstalled || typeof window.openOrganization !== 'function') return false;
    hooksInstalled = true;

    const originalOpen = window.openOrganization;
    window.openOrganization = async function(id, ...rest) {
      activeOrgId = String(id || '');
      routingSites = [];
      const result = await originalOpen.call(this, id, ...rest);
      setTimeout(() => syncSitesView(true), 0);
      return result;
    };

    const originalClose = window.closeOrganizationModal;
    if (typeof originalClose === 'function') {
      window.closeOrganizationModal = function(...args) {
        activeOrgId = '';
        routingSites = [];
        return originalClose.apply(this, args);
      };
    }

    document.addEventListener('click', event => {
      const tab = event.target?.closest?.('#organizationModal .tabs button');
      if (!tab || !tab.textContent.toLowerCase().includes('sitios')) return;
      setTimeout(() => syncSitesView(true), 0);
    });

    return true;
  }

  function boot() {
    installObserver();
    if (installHooks()) return;

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      installObserver();
      if (installHooks() || tries >= 80) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

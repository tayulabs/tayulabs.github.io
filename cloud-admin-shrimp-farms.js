(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const state = {
    organizationId: null,
    sites: [],
    editingSiteId: null,
    pondSiteId: null,
    farm: null,
    ponds: [],
    editingPondId: null,
    loadingSites: null,
    renderingSites: false,
    observerInstalled: false,
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function getKeycloak() {
    for (let i = 0; i < 100; i += 1) {
      const kc = window.__tayuKeycloak;
      if (kc?.authenticated && kc?.token) return kc;
      await sleep(100);
    }
    throw new Error('No hay una sesión administrativa activa.');
  }

  async function request(path, options = {}) {
    const kc = await getKeycloak();
    try {
      await kc.updateToken(60);
    } catch {
      throw new Error('La sesión expiró. Vuelve a iniciar sesión.');
    }

    const response = await fetch(API_URL + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);
    return data;
  }

  const api = (path) => request(path);
  const post = (path, body) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function slugify(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function typeLabel(type) {
    return ({
      finca: 'Finca',
      camaronera: 'Finca Camaronera',
      bananera: 'Bananera',
      ganaderia: 'Ganadería',
      planta: 'Planta',
      bodega: 'Bodega',
      oficina: 'Oficina',
      other: 'Otro',
    })[type] || type || 'Otro';
  }

  function siteStatusLabel(status) {
    return status === 'active' ? 'Activo' : 'Inactivo';
  }

  function pondStatusLabel(status) {
    return ({
      active: 'Activa',
      maintenance: 'Mantenimiento',
      inactive: 'Inactiva',
      archived: 'Archivada',
    })[status] || status;
  }

  function pondStatusClass(status) {
    if (status === 'active') return '';
    if (status === 'maintenance') return 'warn';
    return 'off';
  }

  function finiteNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function ha(value) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${new Intl.NumberFormat('es-EC', { maximumFractionDigits: 3 }).format(n)} ha`;
  }

  function setOrgError(message = '') {
    const box = document.getElementById('orgError');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('show', Boolean(message));
  }

  function setOrgSuccess(message = '') {
    const box = document.getElementById('orgSuccess');
    if (!box) return;
    box.innerHTML = message ? `<div class="success">${esc(message)}</div>` : '';
  }

  function setPondError(message = '') {
    const box = document.getElementById('superShrimpPondError');
    if (!box) return;
    box.textContent = message;
    box.classList.toggle('show', Boolean(message));
  }

  function injectStyles() {
    if (document.getElementById('tayuSuperShrimpStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuSuperShrimpStyles';
    style.textContent = `
      .sa-site-type-readonly{padding:11px 12px;border:1px solid var(--border);border-radius:12px;background:var(--panel2);font-weight:800}
      .sa-shrimp-fields{grid-column:1/-1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;padding:13px;border:1px solid rgba(85,198,43,.25);background:rgba(85,198,43,.055);border-radius:14px}
      .sa-shrimp-fields.hidden{display:none!important}
      .sa-shrimp-fields .full{grid-column:1/-1}
      .sa-area-summary{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .sa-area-stat{padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--panel)}
      .sa-area-stat small{display:block;color:var(--muted);font-size:10px;font-weight:850;text-transform:uppercase}
      .sa-area-stat b{display:block;margin-top:4px;font-size:13px}
      .sa-site-meta{display:block;margin-top:4px;line-height:1.5}
      .sa-site-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
      .sa-pond-kpis{grid-template-columns:repeat(4,minmax(0,1fr));margin-bottom:14px}
      .sa-pond-kpis .card{box-shadow:none;padding:12px}
      .sa-pond-row{cursor:default!important}
      .sa-pond-notes{max-width:280px;white-space:normal;line-height:1.4}
      @media(max-width:760px){.sa-shrimp-fields,.sa-area-summary,.sa-pond-kpis{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectPondModals() {
    if (!document.getElementById('superShrimpPondsModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="superShrimpPondsModal" class="modal">
          <div class="modal-card">
            <div class="modal-head">
              <div>
                <h2 id="superShrimpPondsTitle">Piscinas de la Finca Camaronera</h2>
                <p id="superShrimpPondsSubtitle">—</p>
              </div>
              <button id="closeSuperShrimpPonds" class="close" type="button">×</button>
            </div>
            <div id="superShrimpPondsBody"></div>
          </div>
        </div>
      `);
      document.getElementById('closeSuperShrimpPonds')?.addEventListener('click', closePonds);
      document.getElementById('superShrimpPondsModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closePonds();
      });
    }

    if (!document.getElementById('superShrimpPondEditorModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="superShrimpPondEditorModal" class="modal">
          <div class="modal-card medium">
            <div class="modal-head">
              <div>
                <h2 id="superShrimpPondEditorTitle">Piscina</h2>
                <p id="superShrimpPondEditorSubtitle">—</p>
              </div>
              <button id="closeSuperShrimpPondEditor" class="close" type="button">×</button>
            </div>
            <div id="superShrimpPondError" class="error-box"></div>
            <div id="superShrimpPondEditorBody"></div>
          </div>
        </div>
      `);
      document.getElementById('closeSuperShrimpPondEditor')?.addEventListener('click', closePondEditor);
      document.getElementById('superShrimpPondEditorModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closePondEditor();
      });
    }
  }

  function cleanupLegacyLabels() {
    document.querySelectorAll('.nav button').forEach((button) => {
      if (button.textContent.includes('Usuarios · FASE 6')) button.textContent = '♙ Usuarios';
      if (button.textContent.includes('Dispositivos · FASE 7')) button.textContent = '◈ Dispositivos';
    });

    document.querySelectorAll('#organizationModal .tabs button').forEach((button) => {
      if (button.textContent.trim() === 'Sitios') button.textContent = 'Sitios y operaciones';
    });

    const sitesKpi = document.getElementById('kSites')?.closest('.kpi');
    const sitesLabel = sitesKpi?.querySelector('span');
    const sitesMeta = sitesKpi?.querySelector('small');
    if (sitesLabel) sitesLabel.textContent = 'Sitios / operaciones';
    if (sitesMeta) sitesMeta.textContent = 'Fincas, camaroneras y operaciones';
  }

  async function loadSites(force = false) {
    if (!state.organizationId) return [];
    if (!force && state.loadingSites) return state.loadingSites;

    state.loadingSites = (async () => {
      const q = `?organization_id=${encodeURIComponent(state.organizationId)}`;
      const rows = await api('/admin/organization/sites' + q);
      const sites = Array.isArray(rows) ? rows : [];

      await Promise.all(sites.map(async (site) => {
        if (site.site_type !== 'camaronera' || Number(site.ponds_count || 0) < 1) {
          site.active_ponds_count = Number(site.ponds_count || 0);
          site.archived_ponds_count = 0;
          return;
        }
        try {
          const params = new URLSearchParams({
            organization_id: state.organizationId,
            site_id: site.id,
          });
          const result = await api(`/admin/organization/shrimp-ponds?${params}`);
          site.active_ponds_count = Number(result?.farm?.active_ponds_count || 0);
          site.archived_ponds_count = Math.max(0, Number(result?.farm?.ponds_count || 0) - site.active_ponds_count);
        } catch {
          site.active_ponds_count = Number(site.ponds_count || 0);
          site.archived_ponds_count = 0;
        }
      }));

      state.sites = sites;
      renderSitesWorkspace();
      return sites;
    })().finally(() => {
      state.loadingSites = null;
    });

    return state.loadingSites;
  }

  function siteTypeOptions(selected = 'finca') {
    const options = [
      ['finca', 'Finca'],
      ['camaronera', 'Finca Camaronera'],
      ['bananera', 'Bananera'],
      ['ganaderia', 'Ganadería'],
      ['planta', 'Planta'],
      ['bodega', 'Bodega'],
      ['oficina', 'Oficina'],
      ['other', 'Otro'],
    ];
    return options.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }

  function renderSitesWorkspace() {
    const host = document.getElementById('tab-sites');
    if (!host || !state.organizationId) return;

    const editing = state.editingSiteId
      ? state.sites.find((site) => String(site.id) === String(state.editingSiteId))
      : null;

    if (state.editingSiteId && !editing) state.editingSiteId = null;

    const selectedType = editing?.site_type || 'finca';
    const usedArea = finiteNumber(editing?.ponds_area_hectares, 0);
    const totalArea = editing?.total_area_hectares == null ? null : finiteNumber(editing.total_area_hectares, 0);
    const freeArea = totalArea == null ? null : Math.max(0, totalArea - usedArea);

    state.renderingSites = true;
    host.innerHTML = `
      <div data-super-shrimp-ui="1" class="split">
        <div class="subcard ${editing ? 'site-editing' : ''}">
          <h3>${editing ? 'Editar sitio / operación' : 'Nuevo sitio / operación'}</h3>
          <p>${editing ? 'El tipo de operación queda protegido después de crearla.' : 'Registra una finca, Finca Camaronera, planta u otra operación.'}</p>
          <form id="superSiteForm">
            <div class="form-grid">
              <div class="field">
                <label>Nombre *</label>
                <input name="name" required maxlength="200" value="${esc(editing?.name || '')}">
              </div>
              <div class="field">
                <label>Slug *</label>
                <input name="slug" required maxlength="100" value="${esc(editing?.slug || '')}">
              </div>
              <div class="field">
                <label>Tipo</label>
                ${editing
                  ? `<div class="sa-site-type-readonly">${esc(typeLabel(editing.site_type))}</div>`
                  : `<select name="site_type">${siteTypeOptions(selectedType)}</select>`}
              </div>
              <div class="field">
                <label>Estado</label>
                <select name="administrative_status">
                  <option value="active" ${!editing || editing.administrative_status === 'active' ? 'selected' : ''}>Activo</option>
                  <option value="inactive" ${editing?.administrative_status === 'inactive' ? 'selected' : ''}>Inactivo</option>
                </select>
              </div>
              <div class="field full">
                <label>Dirección</label>
                <input name="address" value="${esc(editing?.address || '')}">
              </div>
              <div class="field">
                <label>Latitud</label>
                <input name="latitude" type="number" step="any" min="-90" max="90" value="${editing?.latitude ?? ''}">
              </div>
              <div class="field">
                <label>Longitud</label>
                <input name="longitude" type="number" step="any" min="-180" max="180" value="${editing?.longitude ?? ''}">
              </div>
              <div class="field full">
                <label>Zona horaria</label>
                <input name="timezone" maxlength="100" value="${esc(editing?.timezone || 'America/Guayaquil')}">
              </div>

              <div id="superShrimpFields" class="sa-shrimp-fields ${selectedType === 'camaronera' ? '' : 'hidden'}">
                ${editing?.site_type === 'camaronera' ? `
                  <div class="sa-area-summary">
                    <div class="sa-area-stat"><small>Área total</small><b>${esc(ha(editing.total_area_hectares))}</b></div>
                    <div class="sa-area-stat"><small>Área utilizada</small><b>${esc(ha(usedArea))}</b></div>
                    <div class="sa-area-stat"><small>Área libre</small><b>${esc(ha(freeArea))}</b></div>
                    <div class="sa-area-stat"><small>Piscinas activas</small><b>${Number(editing.active_ponds_count || 0)}</b></div>
                  </div>
                ` : ''}
                <div class="field">
                  <label>Área total de la Finca Camaronera (ha)</label>
                  <input name="total_area_hectares" type="number" step="any" min="0" value="${editing?.site_type === 'camaronera' && editing.total_area_hectares != null ? esc(editing.total_area_hectares) : ''}">
                </div>
                <div class="field full">
                  <label>Notas de la Finca Camaronera</label>
                  <textarea name="shrimp_farm_notes">${editing?.site_type === 'camaronera' ? esc(editing.shrimp_farm_notes || '') : ''}</textarea>
                </div>
              </div>
            </div>
            <div class="form-actions">
              ${editing ? '<button id="cancelSuperSiteEdit" type="button" class="btn ghost">Cancelar edición</button>' : ''}
              <button class="btn" type="submit">${editing ? 'Guardar operación' : '＋ Crear operación'}</button>
            </div>
          </form>
        </div>

        <div class="subcard">
          <h3>Sitios y operaciones registrados</h3>
          <p>${state.sites.length} operación(es) en esta empresa.</p>
          <div class="list">
            ${state.sites.length ? state.sites.map((site) => {
              const isShrimp = site.site_type === 'camaronera';
              const used = finiteNumber(site.ponds_area_hectares, 0);
              const total = site.total_area_hectares == null ? null : finiteNumber(site.total_area_hectares, 0);
              const free = total == null ? null : Math.max(0, total - used);
              const active = Number(site.active_ponds_count ?? site.ponds_count ?? 0);
              const archived = Number(site.archived_ponds_count || 0);
              const shrimpMeta = isShrimp
                ? `<br>Área total: ${esc(ha(total))} · Usadas: ${esc(ha(used))} · Libres: ${esc(ha(free))}<br>${active} piscina(s) activa(s)${archived ? ` · ${archived} archivada(s)` : ''}`
                : '';
              return `
                <div class="list-item">
                  <div>
                    <b>${esc(site.name)}</b>
                    <small class="sa-site-meta">${esc(typeLabel(site.site_type))} · ${esc(site.slug)}<br>${Number(site.devices_count || 0)} dispositivos · ${Number(site.restricted_users_count || 0)} usuarios restringidos${site.address ? ` · ${esc(site.address)}` : ''}${shrimpMeta}</small>
                  </div>
                  <div class="sa-site-actions">
                    <span class="pill ${site.administrative_status === 'active' ? '' : 'off'}">${esc(siteStatusLabel(site.administrative_status))}</span>
                    <button class="btn ghost small" type="button" data-edit-super-site="${esc(site.id)}">Editar</button>
                    ${isShrimp ? `<button class="btn small" type="button" data-open-ponds="${esc(site.id)}">Piscinas</button>` : ''}
                  </div>
                </div>
              `;
            }).join('') : '<div class="empty">Aún no hay sitios u operaciones registrados.</div>'}
          </div>
        </div>
      </div>
    `;
    state.renderingSites = false;

    const form = document.getElementById('superSiteForm');
    form?.addEventListener('submit', saveSite);

    if (!editing) {
      const nameInput = form?.elements?.name;
      const slugInput = form?.elements?.slug;
      nameInput?.addEventListener('input', () => {
        if (slugInput && slugInput.dataset.touched !== '1') slugInput.value = slugify(nameInput.value);
      });
      slugInput?.addEventListener('input', () => { slugInput.dataset.touched = '1'; });
      form?.elements?.site_type?.addEventListener('change', (event) => {
        document.getElementById('superShrimpFields')?.classList.toggle('hidden', event.target.value !== 'camaronera');
      });
    }

    document.getElementById('cancelSuperSiteEdit')?.addEventListener('click', () => {
      state.editingSiteId = null;
      renderSitesWorkspace();
    });

    host.querySelectorAll('[data-edit-super-site]').forEach((button) => {
      button.addEventListener('click', () => {
        state.editingSiteId = button.dataset.editSuperSite;
        renderSitesWorkspace();
        document.getElementById('superSiteForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    host.querySelectorAll('[data-open-ponds]').forEach((button) => {
      button.addEventListener('click', () => openPonds(button.dataset.openPonds));
    });
  }

  async function saveSite(event) {
    event.preventDefault();
    setOrgError('');
    setOrgSuccess('');

    if (!state.organizationId) {
      setOrgError('No se pudo determinar la empresa seleccionada.');
      return;
    }

    const form = event.currentTarget;
    const editing = state.editingSiteId
      ? state.sites.find((site) => String(site.id) === String(state.editingSiteId))
      : null;
    const submit = form.querySelector('button[type="submit"]');
    const siteType = editing?.site_type || form.elements.site_type?.value || 'other';

    const body = {
      organization_id: state.organizationId,
      name: form.elements.name.value.trim(),
      slug: slugify(form.elements.slug.value),
      administrative_status: form.elements.administrative_status.value,
      address: form.elements.address.value.trim() || null,
      latitude: form.elements.latitude.value === '' ? null : Number(form.elements.latitude.value),
      longitude: form.elements.longitude.value === '' ? null : Number(form.elements.longitude.value),
      timezone: form.elements.timezone.value.trim() || 'America/Guayaquil',
    };

    if (!editing) body.site_type = siteType;
    if (siteType === 'camaronera') {
      body.total_area_hectares = form.elements.total_area_hectares.value === ''
        ? null
        : Number(form.elements.total_area_hectares.value);
      body.shrimp_farm_notes = form.elements.shrimp_farm_notes.value.trim() || null;
    }
    if (editing) body.site_id = editing.id;

    const previous = submit?.textContent || '';
    if (submit) {
      submit.disabled = true;
      submit.textContent = editing ? 'Guardando…' : 'Creando…';
    }

    try {
      await post(
        editing ? '/admin/organization/site' : '/admin/organization/sites',
        body
      );
      state.editingSiteId = null;
      if (typeof window.openOrganization === 'function') {
        await window.openOrganization(state.organizationId);
      } else {
        await loadSites(true);
      }
      setOrgSuccess(editing ? 'Operación actualizada correctamente.' : 'Operación creada correctamente.');
    } catch (error) {
      setOrgError(error.message);
    } finally {
      if (submit?.isConnected) {
        submit.disabled = false;
        submit.textContent = previous;
      }
    }
  }

  async function openPonds(siteId) {
    state.pondSiteId = siteId;
    state.editingPondId = null;
    document.getElementById('superShrimpPondsModal')?.classList.add('open');
    await loadPonds();
  }

  function closePonds() {
    state.pondSiteId = null;
    state.farm = null;
    state.ponds = [];
    document.getElementById('superShrimpPondsModal')?.classList.remove('open');
  }

  async function loadPonds() {
    const body = document.getElementById('superShrimpPondsBody');
    if (body) body.innerHTML = '<div class="empty">Cargando piscinas…</div>';

    try {
      const params = new URLSearchParams({
        organization_id: state.organizationId,
        site_id: state.pondSiteId,
      });
      const result = await api(`/admin/organization/shrimp-ponds?${params}`);
      state.farm = result?.farm || null;
      state.ponds = Array.isArray(result?.ponds) ? result.ponds : [];
      renderPonds();
    } catch (error) {
      if (body) body.innerHTML = `<div class="error-box show">${esc(error.message)}</div>`;
    }
  }

  function renderPonds() {
    const body = document.getElementById('superShrimpPondsBody');
    if (!body || !state.farm) return;

    const total = state.farm.total_area_hectares == null ? null : finiteNumber(state.farm.total_area_hectares, 0);
    const used = finiteNumber(state.farm.ponds_area_hectares, 0);
    const free = total == null ? null : Math.max(0, total - used);
    const active = Number(state.farm.active_ponds_count || 0);
    const archived = Math.max(0, Number(state.farm.ponds_count || 0) - active);

    document.getElementById('superShrimpPondsTitle').textContent = 'Piscinas de la Finca Camaronera';
    document.getElementById('superShrimpPondsSubtitle').textContent = state.farm.name || 'Finca Camaronera';

    body.innerHTML = `
      <div class="grid sa-pond-kpis">
        <div class="card kpi"><span>Área total</span><strong style="font-size:20px">${esc(ha(total))}</strong></div>
        <div class="card kpi"><span>Área utilizada</span><strong style="font-size:20px">${esc(ha(used))}</strong></div>
        <div class="card kpi"><span>Área libre</span><strong style="font-size:20px">${esc(ha(free))}</strong></div>
        <div class="card kpi"><span>Piscinas activas</span><strong style="font-size:20px">${active}</strong><small>${archived ? `${archived} archivada(s)` : 'Sin archivadas'}</small></div>
      </div>
      <div class="section-head">
        <div><h3>Piscinas</h3><p>Administra código, nombre, superficie y estado.</p></div>
        <button id="newSuperShrimpPond" class="btn" type="button">＋ Nueva piscina</button>
      </div>
      ${state.ponds.length ? `
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Área</th><th>Estado</th><th>Notas</th><th>Acción</th></tr></thead>
            <tbody>
              ${state.ponds.map((pond) => `
                <tr class="sa-pond-row">
                  <td><b>${esc(pond.code)}</b></td>
                  <td>${esc(pond.name)}</td>
                  <td>${esc(ha(pond.area_hectares))}</td>
                  <td><span class="pill ${pondStatusClass(pond.status)}">${esc(pondStatusLabel(pond.status))}</span></td>
                  <td class="muted sa-pond-notes">${esc(pond.notes || '—')}</td>
                  <td><button class="btn ghost small" type="button" data-edit-pond="${esc(pond.id)}">Editar</button></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<div class="empty">Esta Finca Camaronera todavía no tiene piscinas.</div>'}
    `;

    document.getElementById('newSuperShrimpPond')?.addEventListener('click', () => openPondEditor());
    body.querySelectorAll('[data-edit-pond]').forEach((button) => {
      button.addEventListener('click', () => openPondEditor(button.dataset.editPond));
    });
  }

  function openPondEditor(pondId = null) {
    const editing = pondId
      ? state.ponds.find((pond) => String(pond.id) === String(pondId))
      : null;
    if (pondId && !editing) return;

    state.editingPondId = editing?.id || null;
    setPondError('');

    document.getElementById('superShrimpPondEditorTitle').textContent = editing ? 'Editar piscina' : 'Nueva piscina';
    document.getElementById('superShrimpPondEditorSubtitle').textContent = state.farm?.name || 'Finca Camaronera';

    const total = state.farm?.total_area_hectares == null ? null : finiteNumber(state.farm.total_area_hectares, 0);
    const used = finiteNumber(state.farm?.ponds_area_hectares, 0);
    const free = total == null ? null : Math.max(0, total - used);

    document.getElementById('superShrimpPondEditorBody').innerHTML = `
      <form id="superShrimpPondForm">
        <div class="notice" style="margin-bottom:14px">Área libre actual: <b>${esc(ha(free))}</b>. Las piscinas archivadas no consumen superficie productiva.</div>
        <div class="form-grid">
          <div class="field"><label>Código *</label><input name="code" required maxlength="100" value="${esc(editing?.code || '')}" placeholder="PISC-001"></div>
          <div class="field"><label>Nombre *</label><input name="name" required maxlength="200" value="${esc(editing?.name || '')}" placeholder="Piscina 01"></div>
          <div class="field"><label>Área (ha)</label><input name="area_hectares" type="number" step="any" min="0" value="${editing?.area_hectares ?? ''}"></div>
          <div class="field"><label>Estado</label><select name="status">
            ${['active','maintenance','inactive','archived'].map((status) => `<option value="${status}" ${(editing?.status || 'active') === status ? 'selected' : ''}>${pondStatusLabel(status)}</option>`).join('')}
          </select></div>
          <div class="field full"><label>Notas</label><textarea name="notes">${esc(editing?.notes || '')}</textarea></div>
        </div>
        <div class="form-actions">
          <button id="cancelSuperShrimpPond" type="button" class="btn ghost">Cancelar</button>
          <button type="submit" class="btn">${editing ? 'Guardar piscina' : 'Crear piscina'}</button>
        </div>
      </form>
    `;

    document.getElementById('superShrimpPondForm')?.addEventListener('submit', savePond);
    document.getElementById('cancelSuperShrimpPond')?.addEventListener('click', closePondEditor);
    document.getElementById('superShrimpPondEditorModal')?.classList.add('open');
  }

  function closePondEditor() {
    state.editingPondId = null;
    setPondError('');
    document.getElementById('superShrimpPondEditorModal')?.classList.remove('open');
  }

  async function savePond(event) {
    event.preventDefault();
    setPondError('');
    const form = event.currentTarget;
    const editing = state.editingPondId
      ? state.ponds.find((pond) => String(pond.id) === String(state.editingPondId))
      : null;
    const submit = form.querySelector('button[type="submit"]');

    const body = {
      organization_id: state.organizationId,
      code: form.elements.code.value.trim(),
      name: form.elements.name.value.trim(),
      area_hectares: form.elements.area_hectares.value === '' ? null : Number(form.elements.area_hectares.value),
      status: form.elements.status.value,
      notes: form.elements.notes.value.trim() || null,
    };

    if (editing) {
      body.pond_id = editing.id;
    } else {
      body.site_id = state.pondSiteId;
    }

    const previous = submit?.textContent || '';
    if (submit) {
      submit.disabled = true;
      submit.textContent = editing ? 'Guardando…' : 'Creando…';
    }

    try {
      await post(
        editing ? '/admin/organization/shrimp-pond' : '/admin/organization/shrimp-ponds',
        body
      );
      closePondEditor();
      await loadPonds();
      await loadSites(true);
    } catch (error) {
      setPondError(error.message);
    } finally {
      if (submit?.isConnected) {
        submit.disabled = false;
        submit.textContent = previous;
      }
    }
  }

  function installSitesObserver() {
    if (state.observerInstalled) return;
    const host = document.getElementById('tab-sites');
    if (!host) return;

    state.observerInstalled = true;
    const observer = new MutationObserver(() => {
      if (state.renderingSites || !state.organizationId) return;
      if (!host.querySelector('[data-super-shrimp-ui="1"]')) {
        queueMicrotask(() => loadSites(true).catch((error) => console.warn('TAYULABS Super Admin shrimp sites:', error)));
      }
      cleanupLegacyLabels();
    });
    observer.observe(host, { childList: true });
  }

  function wrapOpenOrganization() {
    const original = window.openOrganization;
    if (typeof original !== 'function' || original.__tayuSuperShrimpWrapped) return false;

    const wrapped = async function (id, ...rest) {
      state.organizationId = String(id || '');
      state.editingSiteId = null;
      const result = await original.call(this, id, ...rest);
      cleanupLegacyLabels();
      await loadSites(true).catch((error) => {
        console.warn('TAYULABS Super Admin shrimp sites:', error);
      });
      return result;
    };
    wrapped.__tayuSuperShrimpWrapped = true;
    window.openOrganization = wrapped;
    return true;
  }

  function wrapCloseOrganization() {
    const original = window.closeOrganizationModal;
    if (typeof original !== 'function' || original.__tayuSuperShrimpWrapped) return false;

    const wrapped = function (...args) {
      state.organizationId = null;
      state.sites = [];
      state.editingSiteId = null;
      closePondEditor();
      closePonds();
      return original.apply(this, args);
    };
    wrapped.__tayuSuperShrimpWrapped = true;
    window.closeOrganizationModal = wrapped;
    return true;
  }

  function boot() {
    injectStyles();
    injectPondModals();
    installSitesObserver();
    cleanupLegacyLabels();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      injectStyles();
      injectPondModals();
      installSitesObserver();
      cleanupLegacyLabels();
      wrapOpenOrganization();
      wrapCloseOrganization();
      if (attempts >= 160 || (
        typeof window.openOrganization === 'function' &&
        window.openOrganization.__tayuSuperShrimpWrapped &&
        typeof window.closeOrganizationModal === 'function' &&
        window.closeOrganizationModal.__tayuSuperShrimpWrapped
      )) {
        clearInterval(timer);
      }
    }, 100);
  }

  boot();
})();

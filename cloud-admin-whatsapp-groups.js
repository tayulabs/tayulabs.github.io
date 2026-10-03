(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';

  const state = {
    organizations: [],
    groups: [],
    organizationId: '',
    loading: false,
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
    await kc.updateToken(30);

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

  function injectStyles() {
    if (document.getElementById('tayuAdminWhatsappGroupsStyles')) return;

    const style = document.createElement('style');
    style.id = 'tayuAdminWhatsappGroupsStyles';
    style.textContent = `
      .wa-admin-toolbar{display:grid;grid-template-columns:minmax(260px,.8fr) minmax(240px,1.2fr) auto;gap:10px;align-items:end;margin-bottom:16px}
      .wa-admin-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .wa-admin-stat{padding:14px;border:1px solid var(--border);border-radius:15px;background:var(--panel2)}
      .wa-admin-stat span{display:block;color:var(--muted);font-size:11px;font-weight:850}
      .wa-admin-stat strong{display:block;font-size:24px;margin-top:7px}
      .wa-group-name{display:flex;align-items:center;gap:9px}.wa-mark{width:10px;height:10px;border-radius:50%;background:#25D366;flex:0 0 auto}
      .wa-group-id{display:block;color:var(--muted);font-size:10.5px;margin-top:3px;overflow-wrap:anywhere}
      .wa-assignment{display:grid;gap:3px}.wa-assignment b{font-size:12px}.wa-assignment small{color:var(--muted)}
      .wa-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
      .wa-inline-select{min-width:210px;border:1px solid var(--border);background:var(--panel2);color:var(--text);padding:8px 10px;border-radius:11px}
      .wa-unassigned{color:var(--warn);font-weight:850}
      .wa-assigned{color:var(--brand-dark);font-weight:850}
      .wa-admin-note{margin-bottom:16px;padding:12px 14px;border:1px solid rgba(37,99,235,.18);background:rgba(37,99,235,.055);border-radius:14px;color:var(--muted);font-size:12px;line-height:1.5}
      @media(max-width:900px){.wa-admin-toolbar{grid-template-columns:1fr 1fr}.wa-admin-toolbar .btn{grid-column:1/-1}.wa-admin-summary{grid-template-columns:1fr 1fr}}
      @media(max-width:620px){.wa-admin-toolbar,.wa-admin-summary{grid-template-columns:1fr}.wa-inline-select{min-width:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function injectUI() {
    injectStyles();

    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('[data-view="whatsapp-groups"]')) {
      const button = document.createElement('button');
      button.dataset.view = 'whatsapp-groups';
      button.textContent = '◉ WhatsApp';
      button.addEventListener('click', () => openView(button));

      const organizationsButton = nav.querySelector('[data-view="organizations"]');
      if (organizationsButton?.nextSibling) {
        nav.insertBefore(button, organizationsButton.nextSibling);
      } else {
        nav.appendChild(button);
      }
    }

    const main = document.querySelector('main.main');
    if (main && !document.getElementById('whatsapp-groups')) {
      main.insertAdjacentHTML('beforeend', `
        <section id="whatsapp-groups" class="view">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Grupos de WhatsApp</h2>
                <p>Asigna los grupos del WhatsApp conectado a cada empresa.</p>
              </div>
              <button id="waGroupsReload" class="btn ghost" type="button">↻ Actualizar grupos</button>
            </div>

            <div class="wa-admin-note">
              <b>Aislamiento multiempresa:</b> los clientes solo pueden ver y utilizar los grupos que les asignes aquí.
              Un grupo asignado a una empresa no debe quedar disponible para otra.
            </div>

            <div class="wa-admin-toolbar">
              <div class="field">
                <label>Filtrar por empresa</label>
                <select id="waGroupsOrganizationFilter">
                  <option value="">Todas las empresas</option>
                </select>
              </div>
              <div class="field">
                <label>Buscar grupo</label>
                <input id="waGroupsSearch" placeholder="Nombre del grupo">
              </div>
              <button id="waGroupsClear" class="btn ghost" type="button">Limpiar filtros</button>
            </div>

            <div class="wa-admin-summary">
              <div class="wa-admin-stat"><span>Grupos detectados</span><strong id="waGroupsTotal">—</strong></div>
              <div class="wa-admin-stat"><span>Asignados</span><strong id="waGroupsAssigned">—</strong></div>
              <div class="wa-admin-stat"><span>Sin asignar</span><strong id="waGroupsUnassigned">—</strong></div>
            </div>

            <div id="waGroupsSuccess"></div>
            <div id="waGroupsError" class="error-box"></div>
            <div id="waGroupsHost"><div class="empty">Cargando grupos…</div></div>
          </div>
        </section>
      `);

      document.getElementById('waGroupsReload')?.addEventListener('click', loadWorkspace);
      document.getElementById('waGroupsOrganizationFilter')?.addEventListener('change', renderGroups);
      document.getElementById('waGroupsSearch')?.addEventListener('input', renderGroups);
      document.getElementById('waGroupsClear')?.addEventListener('click', () => {
        const org = document.getElementById('waGroupsOrganizationFilter');
        const search = document.getElementById('waGroupsSearch');
        if (org) org.value = '';
        if (search) search.value = '';
        renderGroups();
      });
    }
  }

  function setError(message = '') {
    const el = document.getElementById('waGroupsError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
  }

  function setSuccess(message = '') {
    const el = document.getElementById('waGroupsSuccess');
    if (!el) return;
    el.innerHTML = message ? `<div class="success">${esc(message)}</div>` : '';
  }

  function organizationName(id) {
    return state.organizations.find((org) => String(org.id) === String(id))?.name || '';
  }

  function organizationOptions(selected = '') {
    return state.organizations
      .map((org) => `<option value="${esc(org.id)}" ${String(org.id) === String(selected) ? 'selected' : ''}>${esc(org.name)}</option>`)
      .join('');
  }

  function normalizeGroups(payload) {
    const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.groups) ? payload.groups : []);
    return rows.map((row) => ({
      id: String(row.id || row.group_id || '').trim(),
      name: String(row.name || row.group_name || row.id || row.group_id || '').trim(),
      organization_id: row.organization_id || null,
      organization_name: row.organization_name || null,
      enabled: row.enabled !== false,
    })).filter((row) => row.id && row.name);
  }

  async function loadWorkspace() {
    if (state.loading) return;
    state.loading = true;
    setError('');
    setSuccess('');

    const host = document.getElementById('waGroupsHost');
    if (host) host.innerHTML = '<div class="empty">Consultando WhatsApp y asignaciones…</div>';

    try {
      const [organizations, groupsPayload] = await Promise.all([
        api('/admin/organizations'),
        api('/admin/whatsapp-groups'),
      ]);

      state.organizations = Array.isArray(organizations) ? organizations : [];
      state.groups = normalizeGroups(groupsPayload);

      const filter = document.getElementById('waGroupsOrganizationFilter');
      if (filter) {
        const previous = filter.value;
        filter.innerHTML = '<option value="">Todas las empresas</option>' + organizationOptions(previous);
        if (previous && state.organizations.some((org) => String(org.id) === previous)) {
          filter.value = previous;
        }
      }

      renderGroups();
    } catch (error) {
      setError(error.message);
      if (host) host.innerHTML = '<div class="empty">No se pudieron cargar los grupos de WhatsApp.</div>';
    } finally {
      state.loading = false;
    }
  }

  function renderGroups() {
    const host = document.getElementById('waGroupsHost');
    if (!host) return;

    const orgFilter = document.getElementById('waGroupsOrganizationFilter')?.value || '';
    const query = (document.getElementById('waGroupsSearch')?.value || '').trim().toLowerCase();

    const assigned = state.groups.filter((group) => group.organization_id).length;
    const unassigned = state.groups.length - assigned;

    const totalEl = document.getElementById('waGroupsTotal');
    const assignedEl = document.getElementById('waGroupsAssigned');
    const unassignedEl = document.getElementById('waGroupsUnassigned');
    if (totalEl) totalEl.textContent = state.groups.length;
    if (assignedEl) assignedEl.textContent = assigned;
    if (unassignedEl) unassignedEl.textContent = unassigned;

    const rows = state.groups.filter((group) => {
      if (orgFilter && String(group.organization_id || '') !== orgFilter) return false;
      if (query && !`${group.name} ${group.id} ${group.organization_name || ''}`.toLowerCase().includes(query)) return false;
      return true;
    });

    if (!rows.length) {
      host.innerHTML = '<div class="empty">No hay grupos que coincidan con los filtros.</div>';
      return;
    }

    host.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Grupo de WhatsApp</th>
              <th>Asignación actual</th>
              <th>Empresa</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((group) => {
              const currentName = group.organization_name || organizationName(group.organization_id);
              return `
                <tr style="cursor:default">
                  <td>
                    <div class="wa-group-name"><span class="wa-mark"></span><b>${esc(group.name)}</b></div>
                    <span class="wa-group-id">${esc(group.id)}</span>
                  </td>
                  <td>
                    ${group.organization_id
                      ? `<div class="wa-assignment"><span class="wa-assigned">Asignado</span><b>${esc(currentName || group.organization_id)}</b></div>`
                      : '<span class="wa-unassigned">Sin asignar</span>'}
                  </td>
                  <td>
                    <select class="wa-inline-select" data-wa-org-for="${esc(group.id)}">
                      <option value="">Selecciona una empresa</option>
                      ${organizationOptions(group.organization_id || '')}
                    </select>
                  </td>
                  <td>
                    <div class="wa-actions">
                      <button class="btn small" type="button" data-wa-assign="${esc(group.id)}">Asignar</button>
                      ${group.organization_id ? `<button class="btn ghost small" type="button" data-wa-unassign="${esc(group.id)}">Quitar</button>` : ''}
                    </div>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    host.querySelectorAll('[data-wa-assign]').forEach((button) => {
      button.addEventListener('click', () => assignGroup(button.dataset.waAssign));
    });
    host.querySelectorAll('[data-wa-unassign]').forEach((button) => {
      button.addEventListener('click', () => unassignGroup(button.dataset.waUnassign));
    });
  }

  async function assignGroup(groupId) {
    const group = state.groups.find((item) => item.id === groupId);
    const select = document.querySelector(`[data-wa-org-for="${CSS.escape(groupId)}"]`);
    const organizationId = select?.value || '';

    if (!group || !organizationId) {
      setError('Selecciona la empresa a la que quieres asignar este grupo.');
      return;
    }

    const organization = state.organizations.find((org) => String(org.id) === organizationId);
    const previousOrganizationId = group.organization_id;

    if (
      previousOrganizationId &&
      String(previousOrganizationId) !== String(organizationId) &&
      !window.confirm(`Este grupo ya está asignado a ${group.organization_name || organizationName(previousOrganizationId) || 'otra empresa'}. ¿Quieres moverlo a ${organization?.name || 'la empresa seleccionada'}?`)
    ) {
      return;
    }

    setError('');
    setSuccess('');

    try {
      await post('/admin/whatsapp-groups/assign', {
        organization_id: organizationId,
        group_id: group.id,
        group_name: group.name,
      });
      setSuccess(`${group.name} fue asignado a ${organization?.name || 'la empresa seleccionada'}.`);
      await loadWorkspace();
    } catch (error) {
      setError(error.message);
    }
  }

  async function unassignGroup(groupId) {
    const group = state.groups.find((item) => item.id === groupId);
    if (!group?.organization_id) return;

    const currentName = group.organization_name || organizationName(group.organization_id) || 'esta empresa';
    if (!window.confirm(`¿Quitar "${group.name}" de ${currentName}?`)) return;

    setError('');
    setSuccess('');

    try {
      await post('/admin/whatsapp-groups/unassign', {
        organization_id: group.organization_id,
        group_id: group.id,
      });
      setSuccess(`${group.name} quedó sin empresa asignada.`);
      await loadWorkspace();
    } catch (error) {
      setError(error.message);
    }
  }

  function openView(button) {
    injectUI();

    document.querySelectorAll('.view').forEach((view) => {
      view.classList.toggle('active', view.id === 'whatsapp-groups');
    });
    document.querySelectorAll('.nav button[data-view]').forEach((item) => {
      item.classList.toggle('active', item.dataset.view === 'whatsapp-groups');
    });

    document.getElementById('sidebar')?.classList.remove('open');

    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = 'Grupos de WhatsApp';
    if (subtitle) subtitle.textContent = 'Asigna cada grupo a la empresa que debe utilizarlo.';

    loadWorkspace();
  }

  function boot() {
    injectUI();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      injectUI();
      if (attempts >= 80 || document.querySelector('.nav [data-view="whatsapp-groups"]')) {
        clearInterval(timer);
      }
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
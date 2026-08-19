(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const state = {
    organizations: [],
    organizationId: '',
    users: [],
    sites: [],
    editingUserId: null,
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
    if (document.getElementById('tayuUsersStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuUsersStyles';
    style.textContent = `
      .users-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) minmax(220px,1fr) auto;gap:10px;align-items:end;margin-bottom:14px}
      .users-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .users-sites{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
      .users-site-option{display:flex;gap:9px;align-items:flex-start;padding:10px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}
      .users-site-option input{width:auto;margin-top:2px}
      .users-site-option span{min-width:0}
      .users-site-option b,.users-site-option small{display:block}
      .users-site-option small{color:var(--muted);margin-top:2px}
      .user-identity-readonly{padding:11px 12px;border:1px solid var(--border);border-radius:12px;background:var(--panel2);color:var(--muted);overflow-wrap:anywhere}
      .user-password-note{margin-top:7px;color:var(--muted);font-size:11px;line-height:1.45}
      .user-table-row{cursor:default!important}
      @media(max-width:760px){.users-toolbar,.users-sites{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUI() {
    injectStyles();

    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('[data-view="users"]')) {
      const old = [...nav.querySelectorAll('button')]
        .find((button) => button.textContent.includes('Usuarios'));
      if (old) {
        const button = document.createElement('button');
        button.dataset.view = 'users';
        button.textContent = '♙ Usuarios';
        button.addEventListener('click', () => window.goUsersView(button));
        old.replaceWith(button);
      }
    }

    const main = document.querySelector('main.main');
    if (main && !document.getElementById('users')) {
      main.insertAdjacentHTML('beforeend', `
        <section id="users" class="view">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Usuarios</h2>
                <p>Crea y administra usuarios, roles, vigencia y acceso por sitio.</p>
              </div>
              <button id="newUserButton" class="btn" type="button">＋ Nuevo usuario</button>
            </div>
            <div class="users-toolbar">
              <div class="field">
                <label>Empresa</label>
                <select id="usersOrganization"></select>
              </div>
              <div class="field">
                <label>Buscar</label>
                <input id="usersSearch" placeholder="Nombre o correo">
              </div>
              <button id="reloadUsersButton" class="btn ghost" type="button">↻ Recargar</button>
            </div>
            <div id="usersViewSuccess"></div>
            <div id="usersViewError" class="error-box"></div>
            <div id="usersHost"><div class="empty">Selecciona una empresa.</div></div>
          </div>
        </section>
      `);

      document.getElementById('usersOrganization')?.addEventListener('change', async (event) => {
        state.organizationId = event.target.value || '';
        await loadUsersForSelectedOrganization();
      });
      document.getElementById('usersSearch')?.addEventListener('input', renderUsersView);
      document.getElementById('reloadUsersButton')?.addEventListener('click', loadUsersWorkspace);
      document.getElementById('newUserButton')?.addEventListener('click', () => openUserEditor());
    }

    if (!document.getElementById('userAdminModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="userAdminModal" class="modal">
          <div class="modal-card medium">
            <div class="modal-head">
              <div>
                <h2 id="userAdminTitle">Usuario</h2>
                <p id="userAdminSubtitle">—</p>
              </div>
              <button id="closeUserAdmin" class="close" type="button">×</button>
            </div>
            <div id="userAdminError" class="error-box"></div>
            <div id="userAdminBody"></div>
          </div>
        </div>
      `);
      document.getElementById('closeUserAdmin')?.addEventListener('click', closeUserEditor);
      document.getElementById('userAdminModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeUserEditor();
      });
    }

    enhanceOrganizationUsersTab();
  }

  function setViewError(message = '') {
    const el = document.getElementById('usersViewError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
  }

  function setViewSuccess(message = '') {
    const el = document.getElementById('usersViewSuccess');
    if (!el) return;
    el.innerHTML = message ? `<div class="success">${esc(message)}</div>` : '';
  }

  function setModalError(message = '') {
    const el = document.getElementById('userAdminError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
  }

  function formatDateTime(value) {
    if (!value) return 'Sin límite';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-EC');
  }

  function toDateTimeLocal(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  function toIsoOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
  }

  function roleLabel(role) {
    return ({ owner: 'Owner', admin: 'Admin', operator: 'Operator', viewer: 'Viewer' })[role] || role;
  }

  function statusLabel(status) {
    return ({ active: 'Activo', suspended: 'Suspendido', disabled: 'Deshabilitado' })[status] || status;
  }

  function statusClass(status) {
    if (status === 'active') return '';
    if (status === 'suspended') return 'warn';
    return 'off';
  }

  async function loadOrganizations() {
    state.organizations = await api('/admin/organizations');
    const select = document.getElementById('usersOrganization');
    if (!select) return;

    const previous = state.organizationId || select.value;
    select.innerHTML = state.organizations.length
      ? state.organizations.map((org) => `<option value="${esc(org.id)}">${esc(org.name)}</option>`).join('')
      : '<option value="">Sin empresas</option>';

    if (previous && state.organizations.some((org) => org.id === previous)) {
      select.value = previous;
    }

    state.organizationId = select.value || '';
  }

  async function loadUsersForSelectedOrganization() {
    setViewError('');
    setViewSuccess('');
    const host = document.getElementById('usersHost');
    if (!state.organizationId) {
      state.users = [];
      state.sites = [];
      if (host) host.innerHTML = '<div class="empty">No hay una empresa seleccionada.</div>';
      return;
    }

    if (host) host.innerHTML = '<div class="empty">Cargando usuarios…</div>';

    try {
      const q = `?organization_id=${encodeURIComponent(state.organizationId)}`;
      const [users, sites] = await Promise.all([
        api('/admin/organization/users' + q),
        api('/admin/organization/sites' + q),
      ]);
      state.users = Array.isArray(users) ? users : [];
      state.sites = Array.isArray(sites) ? sites : [];
      renderUsersView();
    } catch (error) {
      setViewError(error.message);
      if (host) host.innerHTML = '<div class="empty">No se pudieron cargar los usuarios.</div>';
    }
  }

  async function loadUsersWorkspace() {
    setViewError('');
    try {
      await loadOrganizations();
      await loadUsersForSelectedOrganization();
    } catch (error) {
      setViewError(error.message);
    }
  }

  function renderUsersView() {
    const host = document.getElementById('usersHost');
    if (!host) return;
    const q = (document.getElementById('usersSearch')?.value || '').trim().toLowerCase();
    const rows = state.users.filter((user) => !q || `${user.display_name || ''} ${user.email || ''} ${user.role || ''}`.toLowerCase().includes(q));

    if (!rows.length) {
      host.innerHTML = '<div class="empty">No hay usuarios que coincidan.</div>';
      return;
    }

    host.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Usuario</th>
              <th>Rol</th>
              <th>Estado</th>
              <th>Vigencia</th>
              <th>Sitios</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((user) => `
              <tr class="user-table-row">
                <td><b>${esc(user.display_name)}</b><br><span class="muted">${esc(user.email)}</span></td>
                <td><span class="pill blue">${esc(roleLabel(user.role))}</span></td>
                <td><span class="pill ${statusClass(user.administrative_status)}">${esc(statusLabel(user.administrative_status))}</span></td>
                <td><span class="muted">Desde: ${esc(formatDateTime(user.access_starts_at))}<br>Hasta: ${esc(formatDateTime(user.access_ends_at))}</span></td>
                <td>${user.site_access_mode === 'all_sites' ? 'Todos los sitios' : `${Number(user.sites_restricted_count || user.site_ids?.length || 0)} sitio(s)`}</td>
                <td><button class="btn ghost small" type="button" data-edit-user="${esc(user.id)}">Editar</button></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    host.querySelectorAll('[data-edit-user]').forEach((button) => {
      button.addEventListener('click', () => openUserEditor(button.dataset.editUser));
    });
  }

  function siteOptions(selectedIds = []) {
    const selected = new Set((selectedIds || []).map(String));
    if (!state.sites.length) {
      return '<div class="notice">Esta empresa todavía no tiene sitios. Usa “Todos los sitios”.</div>';
    }
    return `<div class="users-sites">${state.sites.map((site) => `
      <label class="users-site-option">
        <input type="checkbox" name="site_id" value="${esc(site.id)}" ${selected.has(String(site.id)) ? 'checked' : ''}>
        <span><b>${esc(site.name)}</b><small>${esc(site.site_type || 'sitio')} · ${esc(site.slug || '')}</small></span>
      </label>
    `).join('')}</div>`;
  }

  function toggleSiteMode() {
    const form = document.getElementById('userAdminForm');
    if (!form) return;
    const box = document.getElementById('userSitesBox');
    if (box) box.classList.toggle('hidden', form.site_mode.value !== 'restricted');
  }

  function openUserEditor(userId = null) {
    setModalError('');
    setViewSuccess('');

    if (!state.organizationId) {
      setViewError('Selecciona una empresa antes de crear un usuario.');
      return;
    }

    const editing = userId ? state.users.find((user) => String(user.id) === String(userId)) : null;
    if (userId && !editing) {
      setViewError('No se encontró el usuario seleccionado.');
      return;
    }

    state.editingUserId = editing?.id || null;
    const org = state.organizations.find((item) => item.id === state.organizationId);
    const restricted = editing?.site_access_mode === 'restricted';

    document.getElementById('userAdminTitle').textContent = editing ? 'Editar usuario' : 'Nuevo usuario';
    document.getElementById('userAdminSubtitle').textContent = org?.name || 'Empresa';

    const body = document.getElementById('userAdminBody');
    body.innerHTML = `
      <form id="userAdminForm">
        <div class="form-grid">
          <div class="field">
            <label>Empresa</label>
            <div class="user-identity-readonly">${esc(org?.name || state.organizationId)}</div>
          </div>
          <div class="field">
            <label>Correo</label>
            ${editing
              ? `<div class="user-identity-readonly">${esc(editing.email)}</div>`
              : '<input name="email" type="email" required maxlength="254" autocomplete="off" placeholder="usuario@empresa.com">'}
          </div>
          <div class="field">
            <label>Nombre visible *</label>
            <input name="display_name" required maxlength="200" value="${esc(editing?.display_name || '')}">
          </div>
          <div class="field">
            <label>Rol *</label>
            <select name="role">
              ${['owner','admin','operator','viewer'].map((role) => `<option value="${role}" ${(editing?.role || 'viewer') === role ? 'selected' : ''}>${roleLabel(role)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Estado *</label>
            <select name="administrative_status">
              ${['active','suspended','disabled'].map((status) => `<option value="${status}" ${(editing?.administrative_status || 'active') === status ? 'selected' : ''}>${statusLabel(status)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Acceso a sitios</label>
            <select name="site_mode">
              <option value="all" ${restricted ? '' : 'selected'}>Todos los sitios</option>
              <option value="restricted" ${restricted ? 'selected' : ''}>Solo sitios seleccionados</option>
            </select>
          </div>
          <div class="field">
            <label>Acceso desde</label>
            <input name="access_starts_at" type="datetime-local" value="${esc(toDateTimeLocal(editing?.access_starts_at))}">
          </div>
          <div class="field">
            <label>Acceso hasta</label>
            <input name="access_ends_at" type="datetime-local" value="${esc(toDateTimeLocal(editing?.access_ends_at))}">
          </div>
          ${editing ? '' : `
            <div class="field full">
              <label>Contraseña temporal *</label>
              <input name="temporary_password" type="password" minlength="12" maxlength="128" required autocomplete="new-password">
              <div class="user-password-note">Debe tener al menos 12 caracteres. Keycloak obligará al usuario a cambiarla en su primer ingreso. TAYULABS Cloud no la guarda ni la muestra después de crear el usuario.</div>
            </div>
          `}
          <div id="userSitesBox" class="field full ${restricted ? '' : 'hidden'}">
            <label>Sitios permitidos *</label>
            ${siteOptions(editing?.site_ids || [])}
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn ghost" id="cancelUserAdmin">Cancelar</button>
          <button type="submit" class="btn">${editing ? 'Guardar usuario' : 'Crear usuario'}</button>
        </div>
      </form>
    `;

    const form = document.getElementById('userAdminForm');
    form.site_mode.addEventListener('change', toggleSiteMode);
    form.addEventListener('submit', saveUser);
    document.getElementById('cancelUserAdmin')?.addEventListener('click', closeUserEditor);
    document.getElementById('userAdminModal').classList.add('open');
  }

  function closeUserEditor() {
    const form = document.getElementById('userAdminForm');
    if (form?.temporary_password) form.temporary_password.value = '';
    state.editingUserId = null;
    setModalError('');
    document.getElementById('userAdminModal')?.classList.remove('open');
  }

  async function saveUser(event) {
    event.preventDefault();
    setModalError('');

    const form = event.currentTarget;
    const starts = toIsoOrNull(form.access_starts_at.value);
    const ends = toIsoOrNull(form.access_ends_at.value);

    if (starts === undefined || ends === undefined) {
      setModalError('Revisa las fechas de vigencia.');
      return;
    }

    if (starts && ends && new Date(ends) <= new Date(starts)) {
      setModalError('La fecha final debe ser posterior a la fecha inicial.');
      return;
    }

    const restricted = form.site_mode.value === 'restricted';
    const siteIds = restricted
      ? [...form.querySelectorAll('input[name="site_id"]:checked')].map((input) => input.value)
      : [];

    if (restricted && !siteIds.length) {
      setModalError('Selecciona al menos un sitio o usa “Todos los sitios”.');
      return;
    }

    const common = {
      organization_id: state.organizationId,
      display_name: form.display_name.value.trim(),
      role: form.role.value,
      administrative_status: form.administrative_status.value,
      access_starts_at: starts,
      access_ends_at: ends,
      site_ids: siteIds,
    };

    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = true;

    try {
      if (state.editingUserId) {
        await post('/admin/organization/user', {
          ...common,
          user_id: state.editingUserId,
        });
        closeUserEditor();
        await loadUsersForSelectedOrganization();
        setViewSuccess('Usuario actualizado correctamente.');
      } else {
        const email = form.email.value.trim().toLowerCase();
        const temporaryPassword = form.temporary_password.value;
        await post('/admin/organization/users', {
          ...common,
          email,
          temporary_password: temporaryPassword,
        });
        form.temporary_password.value = '';
        closeUserEditor();
        await loadUsersForSelectedOrganization();
        setViewSuccess('Usuario creado. La contraseña temporal deberá cambiarse en el primer ingreso.');
        if (typeof window.refreshAll === 'function') window.refreshAll();
      }
    } catch (error) {
      setModalError(error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  function enhanceOrganizationUsersTab() {
    const tab = document.getElementById('tab-users');
    if (!tab || tab.dataset.usersEnhancer === '1') return;
    tab.dataset.usersEnhancer = '1';

    const observer = new MutationObserver(() => {
      if (!tab.innerHTML || tab.querySelector('[data-manage-users]')) return;
      const bar = document.createElement('div');
      bar.className = 'section-head';
      bar.dataset.manageUsers = '1';
      bar.innerHTML = `
        <div><h3>Usuarios de la empresa</h3><p>La creación y edición completa se administra desde la sección Usuarios.</p></div>
        <button class="btn small" type="button">Administrar usuarios</button>
      `;
      bar.querySelector('button').addEventListener('click', async () => {
        try {
          if (!state.organizations.length) await loadOrganizations();
          const slug = document.getElementById('orgModalSubtitle')?.textContent?.trim();
          const org = state.organizations.find((item) => item.slug === slug);
          if (org) state.organizationId = org.id;
          if (typeof window.closeOrganizationModal === 'function') window.closeOrganizationModal();
          const button = document.querySelector('.nav [data-view="users"]');
          window.goUsersView(button);
        } catch (error) {
          setViewError(error.message);
        }
      });
      tab.prepend(bar);
    });

    observer.observe(tab, { childList: true });
  }

  window.goUsersView = async (button) => {
    injectUI();
    if (typeof window.goView === 'function') window.goView('users', button);
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = 'Usuarios';
    if (subtitle) subtitle.textContent = 'Roles, vigencia y acceso por sitio.';
    await loadUsersWorkspace();
  };

  window.openTayuUserEditor = openUserEditor;

  function boot() {
    injectUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

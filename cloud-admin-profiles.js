(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const state = {
    profiles: [],
    editingKey: null,
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

  function injectStyles() {
    if (document.getElementById('tayuProfilesStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuProfilesStyles';
    style.textContent = `
      .profiles-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) 190px auto;gap:10px;align-items:end;margin-bottom:14px}
      .profile-key{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
      .profile-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
      .profile-description{max-width:360px;line-height:1.45}
      .profile-json{min-height:190px!important;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.45;white-space:pre}
      .profile-help{margin-top:6px;color:var(--muted);font-size:11px;line-height:1.45}
      @media(max-width:760px){.profiles-toolbar{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function injectUI() {
    injectStyles();

    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('[data-view="profiles-admin"]')) {
      const button = document.createElement('button');
      button.dataset.view = 'profiles-admin';
      button.textContent = '▤ Perfiles';
      button.addEventListener('click', () => window.goProfilesView(button));

      const devicesButton = nav.querySelector('[data-view="devices-admin"]');
      if (devicesButton) {
        devicesButton.insertAdjacentElement('afterend', button);
      } else {
        nav.appendChild(button);
      }
    }

    const main = document.querySelector('main.main');
    if (main && !document.getElementById('profiles-admin')) {
      main.insertAdjacentHTML('beforeend', `
        <section id="profiles-admin" class="view">
          <div class="card">
            <div class="section-head">
              <div>
                <h2>Perfiles de dispositivos</h2>
                <p>Catálogo global de familias de hardware disponibles en TAYULABS Cloud.</p>
              </div>
              <button id="newProfileButton" class="btn" type="button">＋ Nuevo perfil</button>
            </div>

            <div class="profiles-toolbar">
              <div class="field">
                <label>Buscar</label>
                <input id="profilesSearch" placeholder="Nombre o profile key">
              </div>
              <div class="field">
                <label>Estado</label>
                <select id="profilesStatus">
                  <option value="all">Todos</option>
                  <option value="active">Activos</option>
                  <option value="inactive">Inactivos / legacy</option>
                </select>
              </div>
              <button id="reloadProfilesButton" class="btn ghost" type="button">↻ Recargar</button>
            </div>

            <div class="notice" style="margin-bottom:14px">Los perfiles son globales. Un perfil inactivo se conserva para los dispositivos históricos, pero no puede utilizarse al crear dispositivos nuevos.</div>
            <div id="profilesSuccess"></div>
            <div id="profilesError" class="error-box"></div>
            <div id="profilesHost"><div class="empty">Cargando perfiles…</div></div>
          </div>
        </section>
      `);

      document.getElementById('profilesSearch')?.addEventListener('input', renderProfiles);
      document.getElementById('profilesStatus')?.addEventListener('change', renderProfiles);
      document.getElementById('reloadProfilesButton')?.addEventListener('click', loadProfiles);
      document.getElementById('newProfileButton')?.addEventListener('click', () => openProfileEditor());
    }

    if (!document.getElementById('profileAdminModal')) {
      document.body.insertAdjacentHTML('beforeend', `
        <div id="profileAdminModal" class="modal">
          <div class="modal-card medium">
            <div class="modal-head">
              <div>
                <h2 id="profileAdminTitle">Perfil de dispositivo</h2>
                <p id="profileAdminSubtitle">Catálogo global TAYULABS</p>
              </div>
              <button id="closeProfileAdmin" class="close" type="button">×</button>
            </div>
            <div id="profileAdminError" class="error-box"></div>
            <div id="profileAdminBody"></div>
          </div>
        </div>
      `);

      document.getElementById('closeProfileAdmin')?.addEventListener('click', closeProfileEditor);
      document.getElementById('profileAdminModal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) closeProfileEditor();
      });
    }
  }

  function setError(message = '') {
    const el = document.getElementById('profilesError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
  }

  function setSuccess(message = '') {
    const el = document.getElementById('profilesSuccess');
    if (!el) return;
    el.innerHTML = message ? `<div class="success">${esc(message)}</div>` : '';
  }

  function setModalError(message = '') {
    const el = document.getElementById('profileAdminError');
    if (!el) return;
    el.textContent = message;
    el.classList.toggle('show', Boolean(message));
  }

  function statusClass(status) {
    return status === 'active' ? '' : 'off';
  }

  function statusLabel(status) {
    return status === 'active' ? 'Activo' : 'Inactivo';
  }

  function categoryLabel(profile) {
    const category = profile?.capabilities?.category;
    if (!category) return '—';
    return String(category).replace(/_/g, ' ');
  }

  function makeProfileKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  async function loadProfiles() {
    injectUI();
    setError('');
    setSuccess('');
    const host = document.getElementById('profilesHost');
    if (host) host.innerHTML = '<div class="empty">Cargando perfiles…</div>';

    try {
      const rows = await api('/admin/device-profiles?include_inactive=true');
      state.profiles = Array.isArray(rows) ? rows : [];
      renderProfiles();
    } catch (error) {
      setError(error.message);
      if (host) host.innerHTML = '<div class="empty">No se pudieron cargar los perfiles.</div>';
    }
  }

  function renderProfiles() {
    const host = document.getElementById('profilesHost');
    if (!host) return;

    const q = (document.getElementById('profilesSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('profilesStatus')?.value || 'all';

    const rows = state.profiles.filter((profile) => {
      if (status !== 'all' && profile.administrative_status !== status) return false;
      if (!q) return true;
      return `${profile.display_name || ''} ${profile.profile_key || ''} ${profile.description || ''}`
        .toLowerCase()
        .includes(q);
    });

    if (!rows.length) {
      host.innerHTML = '<div class="empty">No hay perfiles que coincidan.</div>';
      return;
    }

    host.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Perfil</th>
              <th>Categoría</th>
              <th>Descripción</th>
              <th>Dispositivos</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((profile) => `
              <tr style="cursor:default">
                <td><b>${esc(profile.display_name)}</b><br><span class="muted profile-key">${esc(profile.profile_key)}</span></td>
                <td>${esc(categoryLabel(profile))}</td>
                <td class="profile-description"><span class="muted">${esc(profile.description || 'Sin descripción')}</span></td>
                <td><b>${Number(profile.devices_count || 0)}</b></td>
                <td><span class="pill ${statusClass(profile.administrative_status)}">${esc(statusLabel(profile.administrative_status))}</span></td>
                <td>
                  <div class="profile-actions">
                    <button class="btn ghost small" type="button" data-edit-profile="${esc(profile.profile_key)}">Editar</button>
                    <button class="btn ${profile.administrative_status === 'active' ? 'ghost' : ''} small" type="button" data-toggle-profile="${esc(profile.profile_key)}">
                      ${profile.administrative_status === 'active' ? 'Inactivar' : 'Activar'}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    host.querySelectorAll('[data-edit-profile]').forEach((button) => {
      button.addEventListener('click', () => openProfileEditor(button.dataset.editProfile));
    });

    host.querySelectorAll('[data-toggle-profile]').forEach((button) => {
      button.addEventListener('click', () => toggleProfile(button.dataset.toggleProfile, button));
    });
  }

  function openProfileEditor(profileKey = null) {
    injectUI();
    setModalError('');
    setSuccess('');

    const editing = profileKey
      ? state.profiles.find((profile) => profile.profile_key === profileKey)
      : null;

    if (profileKey && !editing) {
      setError('No se encontró el perfil seleccionado.');
      return;
    }

    state.editingKey = editing?.profile_key || null;

    document.getElementById('profileAdminTitle').textContent = editing ? 'Editar perfil' : 'Nuevo perfil';
    document.getElementById('profileAdminSubtitle').textContent = editing
      ? editing.profile_key
      : 'Catálogo global TAYULABS';

    let capabilitiesText = '{}';
    try {
      capabilitiesText = JSON.stringify(editing?.capabilities || {}, null, 2);
    } catch {
      capabilitiesText = '{}';
    }

    const body = document.getElementById('profileAdminBody');
    body.innerHTML = `
      <form id="profileAdminForm">
        <div class="form-grid">
          <div class="field">
            <label>Nombre visible *</label>
            <input name="display_name" required maxlength="200" value="${esc(editing?.display_name || '')}" placeholder="Ej: NOVA EDGE PRO">
          </div>

          <div class="field">
            <label>Profile key *</label>
            ${editing
              ? `<div class="user-identity-readonly profile-key">${esc(editing.profile_key)}</div>`
              : '<input name="profile_key" required maxlength="100" pattern="[a-z0-9][a-z0-9_-]*" placeholder="nova_edge_pro" autocomplete="off">'}
            <div class="profile-help">Identificador interno. Después de crear el perfil no se modifica.</div>
          </div>

          <div class="field">
            <label>Estado *</label>
            <select name="administrative_status">
              <option value="active" ${(editing?.administrative_status || 'active') === 'active' ? 'selected' : ''}>Activo</option>
              <option value="inactive" ${editing?.administrative_status === 'inactive' ? 'selected' : ''}>Inactivo</option>
            </select>
          </div>

          <div class="field">
            <label>Dispositivos asociados</label>
            <div class="user-identity-readonly">${editing ? Number(editing.devices_count || 0) : 0}</div>
          </div>

          <div class="field full">
            <label>Descripción</label>
            <textarea name="description" maxlength="1000" placeholder="Describe la familia de hardware y su uso.">${esc(editing?.description || '')}</textarea>
          </div>

          <div class="field full">
            <label>Capacidades JSON</label>
            <textarea name="capabilities" class="profile-json" spellcheck="false">${esc(capabilitiesText)}</textarea>
            <div class="profile-help">Configuración avanzada del perfil. Debe ser un objeto JSON válido. Si no necesitas capacidades especiales, usa { }.</div>
          </div>
        </div>

        <div class="form-actions">
          <button id="cancelProfileAdmin" type="button" class="btn ghost">Cancelar</button>
          <button type="submit" class="btn">${editing ? 'Guardar perfil' : 'Crear perfil'}</button>
        </div>
      </form>
    `;

    const form = document.getElementById('profileAdminForm');

    if (!editing) {
      let keyTouched = false;
      form.profile_key.addEventListener('input', () => { keyTouched = true; });
      form.display_name.addEventListener('input', () => {
        if (!keyTouched) form.profile_key.value = makeProfileKey(form.display_name.value);
      });
    }

    form.addEventListener('submit', saveProfile);
    document.getElementById('cancelProfileAdmin')?.addEventListener('click', closeProfileEditor);
    document.getElementById('profileAdminModal').classList.add('open');
  }

  function closeProfileEditor() {
    state.editingKey = null;
    setModalError('');
    const body = document.getElementById('profileAdminBody');
    if (body) body.innerHTML = '';
    document.getElementById('profileAdminModal')?.classList.remove('open');
  }

  async function saveProfile(event) {
    event.preventDefault();
    setModalError('');

    const form = event.currentTarget;
    const submitButton = form.querySelector('button[type="submit"]');

    let capabilities;
    try {
      capabilities = JSON.parse(form.capabilities.value || '{}');
    } catch {
      setModalError('El campo Capacidades JSON no contiene un JSON válido.');
      return;
    }

    if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
      setModalError('Capacidades JSON debe ser un objeto JSON.');
      return;
    }

    const body = {
      profile_key: state.editingKey || form.profile_key.value.trim().toLowerCase(),
      display_name: form.display_name.value.trim(),
      description: form.description.value.trim() || null,
      administrative_status: form.administrative_status.value,
      capabilities,
    };

    if (submitButton) submitButton.disabled = true;

    try {
      if (state.editingKey) {
        await post('/admin/device-profile', body);
        closeProfileEditor();
        await loadProfiles();
        setSuccess(`Perfil ${body.display_name} actualizado correctamente.`);
      } else {
        await post('/admin/device-profiles', body);
        closeProfileEditor();
        await loadProfiles();
        setSuccess(`Perfil ${body.display_name} creado correctamente.`);
      }
    } catch (error) {
      setModalError(error.message);
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  }

  async function toggleProfile(profileKey, button) {
    const profile = state.profiles.find((item) => item.profile_key === profileKey);
    if (!profile) return;

    const nextStatus = profile.administrative_status === 'active' ? 'inactive' : 'active';
    const count = Number(profile.devices_count || 0);

    const message = nextStatus === 'inactive'
      ? `¿Inactivar ${profile.display_name}?\n\n${count ? `Tiene ${count} dispositivo(s) asociado(s). Seguirán conservando su perfil histórico, pero este perfil dejará de aparecer para dispositivos nuevos.` : 'Dejará de aparecer para dispositivos nuevos.'}`
      : `¿Activar ${profile.display_name}?\n\nVolverá a estar disponible al crear dispositivos nuevos.`;

    if (!window.confirm(message)) return;

    const previous = button.textContent;
    button.disabled = true;
    button.textContent = nextStatus === 'inactive' ? 'Inactivando…' : 'Activando…';
    setError('');
    setSuccess('');

    try {
      await post('/admin/device-profile', {
        profile_key: profile.profile_key,
        administrative_status: nextStatus,
      });
      await loadProfiles();
      setSuccess(`${profile.display_name} ahora está ${nextStatus === 'active' ? 'activo' : 'inactivo'}.`);
    } catch (error) {
      setError(error.message);
      button.disabled = false;
      button.textContent = previous;
    }
  }

  window.goProfilesView = async (button) => {
    injectUI();
    if (typeof window.goView === 'function') window.goView('profiles-admin', button);
    const title = document.getElementById('pageTitle');
    const subtitle = document.getElementById('pageSubtitle');
    if (title) title.textContent = 'Perfiles de dispositivos';
    if (subtitle) subtitle.textContent = 'Familias de hardware y capacidades globales.';
    await loadProfiles();
  };

  function boot() {
    injectUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
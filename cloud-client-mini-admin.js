(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  let access = null;
  let users = [];
  let sites = [];
  let ponds = [];
  let currentPondSite = null;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const num = value => value == null || value === '' ? null : Number(value);
  const slugify = value => String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const isManager = role => ['owner','admin'].includes(String(role || '').toLowerCase());

  function installStyles() {
    if ($('tayu-mini-admin-styles')) return;
    const style = document.createElement('style');
    style.id = 'tayu-mini-admin-styles';
    style.textContent = `
      #client-admin .tca-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
      #client-admin .tca-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:18px 0}
      #client-admin .tca-summary .card{box-shadow:none}
      #client-admin .tca-summary span{display:block;color:var(--muted);font-size:12px;font-weight:850}
      #client-admin .tca-summary b{display:block;font-size:28px;margin-top:8px}
      #client-admin .tca-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
      #client-admin .tca-tab{border:1px solid var(--border);background:var(--panel2);color:var(--text);padding:10px 14px;border-radius:14px;font-weight:850;cursor:pointer}
      #client-admin .tca-tab.active{background:var(--brand);border-color:var(--brand);color:#fff}
      #client-admin .tca-panel{display:none}
      #client-admin .tca-panel.active{display:block}
      #client-admin .tca-table td,#client-admin .tca-table th{vertical-align:middle}
      #client-admin .tca-actions{display:flex;gap:7px;flex-wrap:wrap}
      #client-admin .tca-actions .btn{padding:8px 10px;border-radius:12px;font-size:12px}
      #client-admin .tca-muted{color:var(--muted);font-size:12px}
      #client-admin .tca-site-title{font-weight:900}
      #client-admin .tca-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);font-size:11px;font-weight:850}
      #client-admin .tca-badge.green{color:var(--brand);background:rgba(85,198,43,.10);border-color:rgba(85,198,43,.25)}
      #client-admin .tca-badge.warn{color:var(--warning);background:rgba(245,158,11,.10);border-color:rgba(245,158,11,.25)}
      #client-admin .tca-badge.red{color:var(--danger);background:rgba(239,68,68,.10);border-color:rgba(239,68,68,.25)}
      .tca-modal{display:none;position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.42);padding:24px;align-items:center;justify-content:center}
      .tca-modal.open{display:flex}
      .tca-modal-card{width:min(860px,100%);max-height:88vh;overflow:auto;background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:26px;padding:20px;box-shadow:var(--shadow)}
      .tca-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .tca-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .tca-form-grid .full{grid-column:1/-1}
      .tca-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}
      .tca-check{display:flex;gap:8px;align-items:center;font-size:13px}
      .tca-check input{width:auto}
      .tca-msg{min-height:20px;margin-top:10px;font-size:12px;color:var(--muted)}
      .tca-msg.error{color:var(--danger);font-weight:800}
      .tca-modal-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
      .tca-pond-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .tca-pond-summary>div{background:var(--panel2);border:1px solid var(--border);border-radius:14px;padding:12px}
      .tca-pond-summary span{display:block;color:var(--muted);font-size:11px;font-weight:850}
      .tca-pond-summary b{display:block;font-size:20px;margin-top:5px}
      @media(max-width:900px){#client-admin .tca-summary{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:760px){#client-admin .tca-summary,.tca-form-grid,.tca-checks,.tca-pond-summary{grid-template-columns:1fr}.tca-form-grid .full{grid-column:auto}.tca-modal{padding:10px;align-items:flex-start;padding-top:62px}.tca-modal-card{max-height:82vh;border-radius:20px}}
    `;
    document.head.appendChild(style);
  }

  async function api(path, options = {}) {
    const keycloak = window.__tayuEntryKeycloak;
    if (!keycloak?.authenticated) throw new Error('Sesión segura no disponible');
    try { await keycloak.updateToken(30); } catch (_) {}
    const response = await fetch(API_URL + path, {
      cache: 'no-store',
      ...options,
      headers: {
        Authorization: `Bearer ${keycloak.token}`,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });
    let body = null;
    try { body = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(body?.error || `HTTP ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function normalizeCamaroneraTerminology() {
    const btn = document.querySelector('.nav button[data-view="camaroneras"] .nav-label');
    if (btn) btn.textContent = 'Fincas Camaroneras';
    const title = document.querySelector('#camaroneras .module-header h3');
    if (title) title.textContent = '🦐 Fincas Camaroneras';
    const hint = document.querySelector('#camaroneras .module-header .hint');
    if (hint) hint.textContent = 'Operación de Fincas Camaroneras: alimentadores, aireadores, sensores, temporizadores y ubicación GPS.';
  }

  function ensureView() {
    if ($('client-admin')) return;
    const main = document.querySelector('main.main');
    if (!main) return;

    const section = document.createElement('section');
    section.id = 'client-admin';
    section.className = 'view';
    section.innerHTML = `
      <div class="card">
        <div class="tca-toolbar">
          <div>
            <h3 style="margin:0">Administración de la empresa</h3>
            <p class="hint" style="margin:6px 0 0">Gestiona usuarios, sitios, Fincas Camaroneras y piscinas dentro de tu organización.</p>
          </div>
          <button class="btn ghost" id="tcaRefreshBtn">Actualizar</button>
        </div>
      </div>
      <div class="tca-summary">
        <div class="card"><span>Usuarios visibles</span><b id="tcaUsersCount">0</b></div>
        <div class="card"><span>Sitios</span><b id="tcaSitesCount">0</b></div>
        <div class="card"><span>Fincas Camaroneras</span><b id="tcaShrimpFarmsCount">0</b></div>
        <div class="card"><span>Piscinas</span><b id="tcaPondsCount">0</b></div>
      </div>
      <div class="card">
        <div class="tca-tabs">
          <button class="tca-tab active" data-tca-tab="users">Usuarios</button>
          <button class="tca-tab" data-tca-tab="sites">Sitios y Fincas Camaroneras</button>
        </div>
        <div id="tcaPanelUsers" class="tca-panel active"></div>
        <div id="tcaPanelSites" class="tca-panel"></div>
      </div>
    `;
    main.appendChild(section);

    section.querySelectorAll('[data-tca-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        section.querySelectorAll('.tca-tab').forEach(x => x.classList.remove('active'));
        section.querySelectorAll('.tca-panel').forEach(x => x.classList.remove('active'));
        btn.classList.add('active');
        $(`tcaPanel${btn.dataset.tcaTab === 'users' ? 'Users' : 'Sites'}`)?.classList.add('active');
      });
    });
    $('tcaRefreshBtn')?.addEventListener('click', refreshAll);
  }

  function ensureNav() {
    if ($('clientAdminNavButton')) return;
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return;
    const button = document.createElement('button');
    button.id = 'clientAdminNavButton';
    button.dataset.view = 'client-admin';
    button.innerHTML = `<span class="nav-icon"><img class="tayu-nav-img icon-color" src="imagenes/icons/configuracion-color.png" alt=""><img class="tayu-nav-img icon-white" src="imagenes/icons/configuracion-white.png" alt="" aria-hidden="true"></span><span class="nav-label">Administración</span>`;
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav button').forEach(x => x.classList.remove('active'));
      document.querySelectorAll('.view').forEach(x => x.classList.remove('active'));
      button.classList.add('active');
      $('client-admin')?.classList.add('active');
      const title = $('pageTitle');
      if (title) title.textContent = 'Administración';
      $('sidebar')?.classList.remove('open');
      refreshAll();
    });
    nav.appendChild(button);
  }

  function installModals() {
    if ($('tcaModal')) return;
    const root = document.createElement('div');
    root.innerHTML = `
      <div class="tca-modal" id="tcaModal"><div class="tca-modal-card"><div id="tcaModalBody"></div></div></div>
      <div class="tca-modal" id="tcaPondModal"><div class="tca-modal-card"><div id="tcaPondModalBody"></div></div></div>
    `;
    document.body.append(...root.children);
    ['tcaModal','tcaPondModal'].forEach(id => {
      $(id)?.addEventListener('click', event => {
        if (event.target.id === id) event.currentTarget.classList.remove('open');
      });
    });
  }

  function openModal(html) {
    $('tcaModalBody').innerHTML = html;
    $('tcaModal').classList.add('open');
  }
  function closeModal() { $('tcaModal')?.classList.remove('open'); }
  function closePondModal() { $('tcaPondModal')?.classList.remove('open'); }

  function statusBadge(status) {
    const s = String(status || '').toLowerCase();
    const cls = s === 'active' ? 'green' : s === 'maintenance' ? 'warn' : 'red';
    return `<span class="tca-badge ${cls}">${esc(status || '—')}</span>`;
  }

  function renderUsers() {
    const panel = $('tcaPanelUsers');
    if (!panel) return;
    const rows = users.map(user => {
      const siteLabel = user.site_access_mode === 'all_sites' ? 'Todos los sitios' : `${Number(user.sites_restricted_count || user.site_ids?.length || 0)} sitio(s)`;
      const own = String(user.id) === String(access?.user_id);
      const targetRole = String(user.role || '').toLowerCase();
      const canEdit = !own && targetRole !== 'owner' && !(String(access?.role).toLowerCase() === 'admin' && targetRole === 'admin');
      return `<tr>
        <td><b>${esc(user.display_name || user.email)}</b><br><span class="tca-muted">${esc(user.email)}</span></td>
        <td>${esc(user.role)}</td>
        <td>${statusBadge(user.administrative_status)}</td>
        <td>${esc(siteLabel)}</td>
        <td>${user.access_ends_at ? esc(new Date(user.access_ends_at).toLocaleString()) : '<span class="tca-muted">Sin vencimiento</span>'}</td>
        <td><div class="tca-actions">${canEdit ? `<button class="btn ghost" data-user-edit="${esc(user.id)}">Editar</button>` : '<span class="tca-muted">Protegido</span>'}</div></td>
      </tr>`;
    }).join('');
    panel.innerHTML = `
      <div class="tca-toolbar">
        <div><h3 style="margin:0">Usuarios</h3><p class="hint">Roles, estado, fechas de acceso y sitios autorizados.</p></div>
        <button class="btn" id="tcaAddUser">＋ Agregar usuario</button>
      </div>
      <div class="table-wrap" style="margin-top:14px"><table class="table tca-table">
        <thead><tr><th>Usuario</th><th>Rol</th><th>Estado</th><th>Sitios</th><th>Acceso hasta</th><th>Acciones</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6" class="tca-muted">No hay usuarios visibles.</td></tr>'}</tbody>
      </table></div>`;
    $('tcaAddUser')?.addEventListener('click', () => openUserForm());
    panel.querySelectorAll('[data-user-edit]').forEach(btn => btn.addEventListener('click', () => openUserForm(users.find(u => String(u.id) === btn.dataset.userEdit))));
  }

  function siteChecks(selected = []) {
    const chosen = new Set((selected || []).map(String));
    return sites.map(site => `<label class="tca-check"><input type="checkbox" name="tca-site" value="${esc(site.id)}" ${chosen.has(String(site.id)) ? 'checked' : ''}> <span>${esc(site.name)} <small class="tca-muted">${site.site_type === 'camaronera' ? 'Finca Camaronera' : 'Finca'}</small></span></label>`).join('');
  }

  function inputDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0,16);
  }

  function openUserForm(user = null) {
    const creating = !user;
    const actorRole = String(access?.role || '').toLowerCase();
    const roles = actorRole === 'owner' ? ['admin','operator','viewer'] : ['operator','viewer'];
    const defaultSites = access?.site_restricted ? (access.site_ids || []) : [];
    openModal(`
      <div class="tca-modal-head"><div><h3 style="margin:0">${creating ? 'Agregar usuario' : 'Editar usuario'}</h3><p class="hint">${creating ? 'La contraseña temporal deberá cambiarse al iniciar sesión.' : 'El correo y la identidad de Keycloak no se modifican aquí.'}</p></div><button class="btn ghost" id="tcaCloseModal">Cerrar</button></div>
      <form id="tcaUserForm">
        <div class="tca-form-grid">
          ${creating ? `<div><label>Correo</label><input id="tcaUserEmail" type="email" required></div><div><label>Nombre</label><input id="tcaUserName" required></div><div class="full"><label>Contraseña temporal</label><input id="tcaUserPassword" type="password" minlength="12" required placeholder="Mínimo 12 caracteres"></div>` : `<div><label>Correo</label><input value="${esc(user.email)}" disabled></div><div><label>Nombre</label><input id="tcaUserName" value="${esc(user.display_name || '')}" required></div>`}
          <div><label>Rol</label><select id="tcaUserRole">${roles.map(r => `<option value="${r}" ${user?.role === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
          <div><label>Estado</label><select id="tcaUserStatus"><option value="active" ${user?.administrative_status !== 'suspended' ? 'selected' : ''}>Activo</option><option value="suspended" ${user?.administrative_status === 'suspended' ? 'selected' : ''}>Suspendido</option></select></div>
          <div><label>Acceso desde</label><input id="tcaUserStart" type="datetime-local" value="${esc(inputDate(user?.access_starts_at))}"></div>
          <div><label>Acceso hasta</label><input id="tcaUserEnd" type="datetime-local" value="${esc(inputDate(user?.access_ends_at))}"></div>
          <div class="full"><label>Sitios autorizados</label><div class="tca-checks">${siteChecks(user ? user.site_ids : defaultSites)}</div><p class="hint">${access?.site_restricted ? 'Tu cuenta tiene alcance restringido: el usuario debe quedar asignado a uno o más de tus sitios.' : 'Si no seleccionas sitios, el usuario tendrá acceso a todos los sitios de la organización.'}</p></div>
        </div>
        <div id="tcaFormMsg" class="tca-msg"></div>
        <div class="tca-modal-actions"><button type="button" class="btn ghost" id="tcaCancelModal">Cancelar</button><button class="btn" type="submit">Guardar</button></div>
      </form>`);
    $('tcaCloseModal').onclick = closeModal;
    $('tcaCancelModal').onclick = closeModal;
    $('tcaUserForm').onsubmit = async event => {
      event.preventDefault();
      const msg = $('tcaFormMsg');
      msg.className = 'tca-msg'; msg.textContent = 'Guardando…';
      const selected = [...document.querySelectorAll('input[name="tca-site"]:checked')].map(x => x.value);
      if (access?.site_restricted && !selected.length) { msg.className = 'tca-msg error'; msg.textContent = 'Selecciona al menos un sitio.'; return; }
      const body = {
        display_name: $('tcaUserName').value.trim(),
        role: $('tcaUserRole').value,
        administrative_status: $('tcaUserStatus').value,
        access_starts_at: $('tcaUserStart').value ? new Date($('tcaUserStart').value).toISOString() : null,
        access_ends_at: $('tcaUserEnd').value ? new Date($('tcaUserEnd').value).toISOString() : null,
        site_ids: selected
      };
      if (creating) { body.email = $('tcaUserEmail').value.trim(); body.temporary_password = $('tcaUserPassword').value; }
      else body.user_id = user.id;
      try {
        await api(creating ? '/client-admin/users' : '/client-admin/user', {method:'POST', body:JSON.stringify(body)});
        closeModal();
        await refreshUsers();
      } catch (error) { msg.className = 'tca-msg error'; msg.textContent = error.message; }
    };
  }

  function renderSites() {
    const panel = $('tcaPanelSites');
    if (!panel) return;
    const canCreate = !(String(access?.role).toLowerCase() === 'admin' && access?.site_restricted);
    const rows = sites.map(site => {
      const shrimp = site.site_type === 'camaronera';
      const total = num(site.total_area_hectares);
      const used = Number(site.ponds_area_hectares || 0);
      const available = total == null ? null : Math.max(0, total - used);
      return `<tr>
        <td><span class="tca-site-title">${esc(site.name)}</span><br><span class="tca-muted">${esc(site.slug)}</span></td>
        <td>${shrimp ? '<span class="tca-badge green">Finca Camaronera</span>' : '<span class="tca-badge">Finca</span>'}</td>
        <td>${statusBadge(site.administrative_status)}</td>
        <td>${shrimp ? `${total == null ? '—' : esc(total)} ha<br><span class="tca-muted">Usadas ${used} ha${available == null ? '' : ` · Libres ${available} ha`}</span>` : '<span class="tca-muted">No aplica</span>'}</td>
        <td>${shrimp ? esc(site.ponds_count || 0) : '—'}</td>
        <td><div class="tca-actions"><button class="btn ghost" data-site-edit="${esc(site.id)}">Editar</button>${shrimp ? `<button class="btn" data-site-ponds="${esc(site.id)}">Piscinas</button>` : ''}</div></td>
      </tr>`;
    }).join('');
    panel.innerHTML = `
      <div class="tca-toolbar"><div><h3 style="margin:0">Sitios y Fincas Camaroneras</h3><p class="hint">Las piscinas son entidades internas de cada Finca Camaronera.</p></div>${canCreate ? '<button class="btn" id="tcaAddSite">＋ Agregar sitio</button>' : ''}</div>
      <div class="table-wrap" style="margin-top:14px"><table class="table tca-table"><thead><tr><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Área</th><th>Piscinas</th><th>Acciones</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="tca-muted">No hay sitios visibles.</td></tr>'}</tbody></table></div>`;
    $('tcaAddSite')?.addEventListener('click', () => openSiteForm());
    panel.querySelectorAll('[data-site-edit]').forEach(btn => btn.addEventListener('click', () => openSiteForm(sites.find(s => String(s.id) === btn.dataset.siteEdit))));
    panel.querySelectorAll('[data-site-ponds]').forEach(btn => btn.addEventListener('click', () => openPonds(sites.find(s => String(s.id) === btn.dataset.sitePonds))));
  }

  function openSiteForm(site = null) {
    const creating = !site;
    const isShrimp = site?.site_type === 'camaronera';
    openModal(`
      <div class="tca-modal-head"><div><h3 style="margin:0">${creating ? 'Agregar sitio' : 'Editar sitio'}</h3><p class="hint">${creating ? 'Para acuicultura usa el tipo Finca Camaronera.' : 'El tipo de sitio no puede cambiarse después de crearlo.'}</p></div><button class="btn ghost" id="tcaCloseModal">Cerrar</button></div>
      <form id="tcaSiteForm"><div class="tca-form-grid">
        <div><label>Nombre</label><input id="tcaSiteName" value="${esc(site?.name || '')}" required></div>
        <div><label>Slug</label><input id="tcaSiteSlug" value="${esc(site?.slug || '')}" required></div>
        ${creating ? `<div><label>Tipo</label><select id="tcaSiteType"><option value="finca">Finca</option><option value="camaronera">Finca Camaronera</option></select></div>` : `<div><label>Tipo</label><input value="${isShrimp ? 'Finca Camaronera' : 'Finca'}" disabled></div>`}
        <div><label>Estado</label><select id="tcaSiteStatus"><option value="active" ${site?.administrative_status !== 'inactive' ? 'selected' : ''}>Activo</option><option value="inactive" ${site?.administrative_status === 'inactive' ? 'selected' : ''}>Inactivo</option></select></div>
        <div class="full"><label>Dirección</label><input id="tcaSiteAddress" value="${esc(site?.address || '')}"></div>
        <div><label>Latitud</label><input id="tcaSiteLat" type="number" step="any" value="${esc(site?.latitude ?? '')}"></div>
        <div><label>Longitud</label><input id="tcaSiteLon" type="number" step="any" value="${esc(site?.longitude ?? '')}"></div>
        <div><label>Zona horaria</label><input id="tcaSiteTimezone" value="${esc(site?.timezone || 'America/Guayaquil')}"></div>
        <div id="tcaFarmAreaWrap" style="${creating ? 'display:none' : isShrimp ? '' : 'display:none'}"><label>Área total de la Finca Camaronera (ha)</label><input id="tcaFarmArea" type="number" min="0" step="any" value="${esc(site?.total_area_hectares ?? '')}"></div>
        <div class="full" id="tcaFarmNotesWrap" style="${creating ? 'display:none' : isShrimp ? '' : 'display:none'}"><label>Notas de la Finca Camaronera</label><input id="tcaFarmNotes" value="${esc(site?.shrimp_farm_notes || '')}"></div>
      </div><div id="tcaFormMsg" class="tca-msg"></div><div class="tca-modal-actions"><button type="button" class="btn ghost" id="tcaCancelModal">Cancelar</button><button class="btn" type="submit">Guardar</button></div></form>`);
    $('tcaCloseModal').onclick = closeModal;
    $('tcaCancelModal').onclick = closeModal;
    if (creating) {
      $('tcaSiteName').addEventListener('input', () => { if (!$('tcaSiteSlug').dataset.manual) $('tcaSiteSlug').value = slugify($('tcaSiteName').value); });
      $('tcaSiteSlug').addEventListener('input', () => $('tcaSiteSlug').dataset.manual = '1');
      $('tcaSiteType').addEventListener('change', () => {
        const show = $('tcaSiteType').value === 'camaronera';
        $('tcaFarmAreaWrap').style.display = show ? '' : 'none';
        $('tcaFarmNotesWrap').style.display = show ? '' : 'none';
      });
    }
    $('tcaSiteForm').onsubmit = async event => {
      event.preventDefault();
      const msg = $('tcaFormMsg'); msg.className = 'tca-msg'; msg.textContent = 'Guardando…';
      const type = creating ? $('tcaSiteType').value : site.site_type;
      const body = {
        name: $('tcaSiteName').value.trim(), slug: $('tcaSiteSlug').value.trim(), administrative_status: $('tcaSiteStatus').value,
        address: $('tcaSiteAddress').value.trim() || null, latitude: $('tcaSiteLat').value === '' ? null : Number($('tcaSiteLat').value), longitude: $('tcaSiteLon').value === '' ? null : Number($('tcaSiteLon').value), timezone: $('tcaSiteTimezone').value.trim() || 'America/Guayaquil'
      };
      if (creating) body.site_type = type; else body.site_id = site.id;
      if (type === 'camaronera') { body.total_area_hectares = $('tcaFarmArea').value === '' ? null : Number($('tcaFarmArea').value); body.shrimp_farm_notes = $('tcaFarmNotes').value.trim() || null; }
      try {
        await api(creating ? '/client-admin/sites' : '/client-admin/site', {method:'POST', body:JSON.stringify(body)});
        closeModal(); await refreshSites();
      } catch (error) { msg.className = 'tca-msg error'; msg.textContent = error.message; }
    };
  }

  async function openPonds(site) {
    currentPondSite = site;
    $('tcaPondModal').classList.add('open');
    $('tcaPondModalBody').innerHTML = '<p class="hint">Cargando piscinas…</p>';
    try {
      const data = await api(`/client-admin/shrimp-ponds?site_id=${encodeURIComponent(site.id)}`);
      ponds = Array.isArray(data?.ponds) ? data.ponds : [];
      renderPonds(data?.farm || site);
    } catch (error) { $('tcaPondModalBody').innerHTML = `<p style="color:var(--danger)">${esc(error.message)}</p>`; }
  }

  function renderPonds(farm) {
    const total = Number(farm?.total_area_hectares ?? currentPondSite?.total_area_hectares ?? 0);
    const used = ponds.filter(p => p.status !== 'archived').reduce((sum,p) => sum + Number(p.area_hectares || 0), 0);
    const rows = ponds.map(p => `<tr><td><b>${esc(p.code)}</b></td><td>${esc(p.name)}</td><td>${p.area_hectares == null ? '—' : `${esc(p.area_hectares)} ha`}</td><td>${statusBadge(p.status)}</td><td><button class="btn ghost" data-pond-edit="${esc(p.id)}">Editar</button></td></tr>`).join('');
    $('tcaPondModalBody').innerHTML = `
      <div class="tca-modal-head"><div><h3 style="margin:0">Piscinas · ${esc(currentPondSite?.name)}</h3><p class="hint">Gestión interna de la Finca Camaronera.</p></div><button class="btn ghost" id="tcaClosePonds">Cerrar</button></div>
      <div class="tca-pond-summary"><div><span>Área total</span><b>${total || 0} ha</b></div><div><span>Área en piscinas</span><b>${used} ha</b></div><div><span>Área disponible</span><b>${Math.max(0,total-used)} ha</b></div></div>
      <div class="tca-toolbar"><div><b>${ponds.length} piscina(s)</b></div><button class="btn" id="tcaAddPond">＋ Agregar piscina</button></div>
      <div class="table-wrap" style="margin-top:12px"><table class="table"><thead><tr><th>Código</th><th>Nombre</th><th>Área</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="tca-muted">No hay piscinas registradas.</td></tr>'}</tbody></table></div>`;
    $('tcaClosePonds').onclick = closePondModal;
    $('tcaAddPond').onclick = () => openPondForm();
    document.querySelectorAll('[data-pond-edit]').forEach(btn => btn.addEventListener('click', () => openPondForm(ponds.find(p => String(p.id) === btn.dataset.pondEdit))));
  }

  function openPondForm(pond = null) {
    const creating = !pond;
    const old = $('tcaPondModalBody').innerHTML;
    $('tcaPondModalBody').innerHTML = `
      <div class="tca-modal-head"><div><h3 style="margin:0">${creating ? 'Agregar piscina' : 'Editar piscina'}</h3><p class="hint">${esc(currentPondSite?.name)}</p></div><button class="btn ghost" id="tcaBackPonds">Volver</button></div>
      <form id="tcaPondForm"><div class="tca-form-grid"><div><label>Código</label><input id="tcaPondCode" value="${esc(pond?.code || '')}" required></div><div><label>Nombre</label><input id="tcaPondName" value="${esc(pond?.name || '')}" required></div><div><label>Área (ha)</label><input id="tcaPondArea" type="number" min="0" step="any" value="${esc(pond?.area_hectares ?? '')}"></div><div><label>Estado</label><select id="tcaPondStatus">${['active','maintenance','inactive','archived'].map(s => `<option value="${s}" ${pond?.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="full"><label>Notas</label><input id="tcaPondNotes" value="${esc(pond?.notes || '')}"></div></div><div id="tcaPondMsg" class="tca-msg"></div><div class="tca-modal-actions"><button class="btn" type="submit">Guardar</button></div></form>`;
    $('tcaBackPonds').onclick = () => { $('tcaPondModalBody').innerHTML = old; openPonds(currentPondSite); };
    $('tcaPondForm').onsubmit = async event => {
      event.preventDefault();
      const msg = $('tcaPondMsg'); msg.className = 'tca-msg'; msg.textContent = 'Guardando…';
      const body = { code:$('tcaPondCode').value.trim(), name:$('tcaPondName').value.trim(), area_hectares:$('tcaPondArea').value === '' ? null : Number($('tcaPondArea').value), status:$('tcaPondStatus').value, notes:$('tcaPondNotes').value.trim() || null };
      if (creating) body.site_id = currentPondSite.id; else body.pond_id = pond.id;
      try { await api(creating ? '/client-admin/shrimp-ponds' : '/client-admin/shrimp-pond', {method:'POST', body:JSON.stringify(body)}); await refreshSites(); await openPonds(currentPondSite); }
      catch (error) { msg.className = 'tca-msg error'; msg.textContent = error.message; }
    };
  }

  async function refreshUsers() {
    users = await api('/client-admin/users');
    renderUsers();
    if ($('tcaUsersCount')) $('tcaUsersCount').textContent = users.length;
  }
  async function refreshSites() {
    sites = await api('/client-admin/sites');
    renderSites();
    if ($('tcaSitesCount')) $('tcaSitesCount').textContent = sites.length;
    if ($('tcaShrimpFarmsCount')) $('tcaShrimpFarmsCount').textContent = sites.filter(s => s.site_type === 'camaronera').length;
    if ($('tcaPondsCount')) $('tcaPondsCount').textContent = sites.reduce((sum,s) => sum + Number(s.ponds_count || 0), 0);
  }
  async function refreshAll() {
    try { await Promise.all([refreshUsers(), refreshSites()]); }
    catch (error) { console.error('TAYULABS Mini Cloud Admin:', error); }
  }

  function boot(resolvedAccess) {
    access = resolvedAccess || window.__tayuClientAccess || null;
    if (!isManager(access?.role)) return;
    installStyles();
    normalizeCamaroneraTerminology();
    ensureView();
    ensureNav();
    installModals();
    refreshAll();
  }

  window.addEventListener('tayu:client-access-ready', event => boot(event.detail), {once:true});
  if (window.__tayuClientAccess) boot(window.__tayuClientAccess);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => normalizeCamaroneraTerminology(), {once:true});
})();

(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const sectorNames = {
    fincas: 'Fincas',
    camaroneras: 'Camaroneras',
    bananeras: 'Bananeras',
    ganaderia: 'Ganadería',
  };

  let siteCache = new Map();
  let deviceCache = [];
  let lastOrgId = '';
  let busy = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  const sectorLabel = key => sectorNames[String(key || '').toLowerCase()] || 'Sin sector';

  async function request(path, options = {}) {
    const kc = window.__tayuKeycloak;
    if (!kc?.authenticated) throw new Error('No hay una sesión administrativa activa.');
    try { await kc.updateToken(30); } catch (_) {}
    const response = await fetch(API_URL + path, {
      cache: 'no-store',
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        ...(options.headers || {})
      }
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error || `HTTP ${response.status}`);
    return body;
  }

  function installStyles() {
    if (document.getElementById('tayuAdminRoutingStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuAdminRoutingStyles';
    style.textContent = `
      .tayu-routing-badge{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;border:1px solid rgba(85,198,43,.24);background:rgba(85,198,43,.08);color:var(--brand-dark);font-size:10px;font-weight:900;white-space:nowrap}
      .tayu-routing-meta{display:block;margin-top:4px;color:var(--muted);font-size:10px;font-weight:800}
      .tayu-routing-modal{display:none;position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.42);padding:24px;align-items:center;justify-content:center}
      .tayu-routing-modal.open{display:flex}
      .tayu-routing-card{width:min(620px,100%);background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:22px;padding:18px;box-shadow:var(--shadow)}
      .tayu-routing-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .tayu-routing-head h3{margin:0}.tayu-routing-head p{margin:5px 0 0;color:var(--muted);font-size:12px}
      .tayu-routing-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.tayu-routing-msg{min-height:18px;margin-top:8px;font-size:12px;color:var(--muted)}
      @media(max-width:760px){.tayu-routing-modal{padding:10px;align-items:flex-start;padding-top:62px}.tayu-routing-actions{flex-direction:column}.tayu-routing-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureModal() {
    installStyles();
    let modal = document.getElementById('tayuAdminRoutingModal');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'tayuAdminRoutingModal';
    modal.className = 'tayu-routing-modal';
    modal.innerHTML = '<div class="tayu-routing-card" id="tayuAdminRoutingCard"></div>';
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    document.getElementById('tayuAdminRoutingModal')?.classList.remove('open');
  }

  async function loadSitesForOrg(orgId, force = false) {
    if (!orgId) return [];
    if (!force && orgId === lastOrgId && siteCache.size) return [...siteCache.values()];
    const rows = await request(`/admin/organization/site-routing?organization_id=${encodeURIComponent(orgId)}`);
    const list = Array.isArray(rows) ? rows : [];
    siteCache = new Map(list.map(site => [String(site.id), site]));
    lastOrgId = orgId;
    return list;
  }

  async function loadSite(siteId, force = false) {
    if (!force && siteCache.has(String(siteId))) return siteCache.get(String(siteId));
    const site = await request(`/admin/organization/site-routing?site_id=${encodeURIComponent(siteId)}`);
    if (site?.id) siteCache.set(String(site.id), site);
    return site;
  }

  async function loadDevicesForOrg(orgId) {
    const rows = await request(`/admin/organization/devices?organization_id=${encodeURIComponent(orgId)}`);
    deviceCache = Array.isArray(rows) ? rows : [];
    return deviceCache;
  }

  function sectorOptions(site, selected) {
    const values = site?.site_type === 'camaronera'
      ? [['camaroneras','Camaroneras']]
      : [['','Sin sector'],['fincas','Fincas'],['bananeras','Bananeras'],['ganaderia','Ganadería']];
    return values.map(([value,label]) => `<option value="${esc(value)}" ${String(selected || '') === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  async function openSiteSector(siteId) {
    const modal = ensureModal();
    const card = document.getElementById('tayuAdminRoutingCard');
    card.innerHTML = '<p class="muted">Cargando sitio…</p>';
    modal.classList.add('open');
    try {
      const site = await loadSite(siteId, true);
      card.innerHTML = `
        <div class="tayu-routing-head"><div><h3>Sector operativo</h3><p>${esc(site.name)} · ${esc(site.site_type || 'sitio')}</p></div><button type="button" class="close" data-routing-close>×</button></div>
        <div class="field"><label>Sector</label><select id="tayuRoutingSector">${sectorOptions(site, site.sector_key)}</select></div>
        <div class="notice" style="margin-top:12px">Los dispositivos asignados a este sitio heredarán este sector en la plataforma del cliente.</div>
        <div id="tayuRoutingMsg" class="tayu-routing-msg"></div>
        <div class="tayu-routing-actions"><button type="button" class="btn ghost" data-routing-close>Cancelar</button><button type="button" class="btn" id="tayuSaveSiteSector">Guardar sector</button></div>`;
      card.querySelectorAll('[data-routing-close]').forEach(b => b.onclick = closeModal);
      document.getElementById('tayuSaveSiteSector').onclick = async () => {
        const msg = document.getElementById('tayuRoutingMsg');
        const button = document.getElementById('tayuSaveSiteSector');
        try {
          button.disabled = true; msg.textContent = 'Guardando…';
          const value = document.getElementById('tayuRoutingSector').value || null;
          const updated = await request('/admin/organization/site-sector', {method:'POST', body:JSON.stringify({site_id:site.id, sector_key:value})});
          siteCache.set(String(updated.id), updated);
          msg.textContent = 'Sector actualizado.';
          setTimeout(() => { closeModal(); decorateSiteList(); decorateDeviceRows(true); }, 250);
        } catch (error) { msg.textContent = error.message; msg.style.color = 'var(--danger)'; }
        finally { button.disabled = false; }
      };
    } catch (error) {
      card.innerHTML = `<h3>Sector operativo</h3><p style="color:var(--danger)">${esc(error.message)}</p>`;
    }
  }

  async function openDeviceSite(deviceId, orgId) {
    const modal = ensureModal();
    const card = document.getElementById('tayuAdminRoutingCard');
    card.innerHTML = '<p class="muted">Cargando asignación…</p>';
    modal.classList.add('open');
    try {
      const [sites, devices] = await Promise.all([loadSitesForOrg(orgId, true), loadDevicesForOrg(orgId)]);
      const device = devices.find(d => String(d.id) === String(deviceId));
      if (!device) throw new Error('Dispositivo no encontrado.');
      const options = ['<option value="">Sin sitio</option>', ...sites.map(site => `<option value="${esc(site.id)}" ${String(device.site_id || '') === String(site.id) ? 'selected' : ''}>${esc(site.name)} · ${esc(sectorLabel(site.sector_key))}</option>`)].join('');
      card.innerHTML = `
        <div class="tayu-routing-head"><div><h3>Asignar sitio</h3><p>${esc(device.name)} · ${esc(device.device_key)}</p></div><button type="button" class="close" data-routing-close>×</button></div>
        <div class="field"><label>Sitio</label><select id="tayuRoutingDeviceSite">${options}</select></div>
        <div class="notice" style="margin-top:12px">El dispositivo heredará el sector operativo del sitio seleccionado. El perfil físico del equipo no cambia.</div>
        <div id="tayuRoutingMsg" class="tayu-routing-msg"></div>
        <div class="tayu-routing-actions"><button type="button" class="btn ghost" data-routing-close>Cancelar</button><button type="button" class="btn" id="tayuSaveDeviceSite">Guardar asignación</button></div>`;
      card.querySelectorAll('[data-routing-close]').forEach(b => b.onclick = closeModal);
      document.getElementById('tayuSaveDeviceSite').onclick = async () => {
        const msg = document.getElementById('tayuRoutingMsg');
        const button = document.getElementById('tayuSaveDeviceSite');
        try {
          button.disabled = true; msg.textContent = 'Guardando…';
          const value = document.getElementById('tayuRoutingDeviceSite').value || null;
          await request('/admin/organization/device-site', {method:'POST', body:JSON.stringify({device_id:device.id, site_id:value})});
          msg.textContent = 'Asignación actualizada.';
          setTimeout(() => { closeModal(); document.getElementById('reloadDevicesButton')?.click(); }, 250);
        } catch (error) { msg.textContent = error.message; msg.style.color = 'var(--danger)'; }
        finally { button.disabled = false; }
      };
    } catch (error) {
      card.innerHTML = `<h3>Asignar sitio</h3><p style="color:var(--danger)">${esc(error.message)}</p>`;
    }
  }

  async function decorateSiteList() {
    const buttons = [...document.querySelectorAll('#tab-sites [data-edit-super-site]')];
    if (!buttons.length || busy) return;
    busy = true;
    try {
      await Promise.all(buttons.map(async button => {
        const siteId = button.dataset.editSuperSite;
        const actions = button.closest('.sa-site-actions');
        if (!siteId || !actions) return;
        let site;
        try { site = await loadSite(siteId); } catch (_) { return; }
        let badge = actions.querySelector('.tayu-routing-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tayu-routing-badge';
          actions.prepend(badge);
        }
        badge.textContent = `Sector: ${sectorLabel(site?.sector_key)}`;
        let sectorButton = actions.querySelector('[data-routing-site]');
        if (!sectorButton) {
          sectorButton = document.createElement('button');
          sectorButton.type = 'button';
          sectorButton.className = 'btn ghost small';
          sectorButton.dataset.routingSite = siteId;
          sectorButton.textContent = 'Sector';
          actions.insertBefore(sectorButton, button);
        }
      }));
    } finally { busy = false; }
  }

  async function decorateDeviceRows(force = false) {
    const host = document.getElementById('devicesHost');
    const orgId = document.getElementById('devicesOrganization')?.value || '';
    const rows = [...(host?.querySelectorAll('.device-row') || [])];
    if (!orgId || !rows.length) return;
    try {
      const [sites, devices] = await Promise.all([loadSitesForOrg(orgId, force), loadDevicesForOrg(orgId)]);
      const sitesById = new Map(sites.map(site => [String(site.id), site]));
      rows.forEach(row => {
        const key = row.querySelector('td:first-child .muted')?.textContent?.trim();
        const device = devices.find(d => String(d.device_key) === String(key));
        if (!device) return;
        const site = device.site_id ? sitesById.get(String(device.site_id)) : null;
        const siteCell = row.children[2];
        if (siteCell) {
          let meta = siteCell.querySelector('.tayu-routing-meta');
          if (!meta) { meta = document.createElement('small'); meta.className = 'tayu-routing-meta'; siteCell.appendChild(meta); }
          meta.textContent = `Sector: ${sectorLabel(site?.sector_key || device.site_sector)}`;
        }
        const actionCell = row.children[row.children.length - 1];
        if (actionCell && !actionCell.querySelector('[data-routing-device]')) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn ghost small';
          button.dataset.routingDevice = device.id;
          button.dataset.routingOrg = orgId;
          button.textContent = 'Asignar sitio';
          if (actionCell.textContent.trim() && actionCell.textContent.trim() !== '—') actionCell.append(' ');
          else actionCell.textContent = '';
          actionCell.appendChild(button);
        }
      });
    } catch (error) {
      console.warn('Cloud Admin routing:', error.message);
    }
  }

  document.addEventListener('click', event => {
    const siteButton = event.target?.closest?.('[data-routing-site]');
    if (siteButton) { event.preventDefault(); openSiteSector(siteButton.dataset.routingSite); return; }
    const deviceButton = event.target?.closest?.('[data-routing-device]');
    if (deviceButton) { event.preventDefault(); openDeviceSite(deviceButton.dataset.routingDevice, deviceButton.dataset.routingOrg); return; }
    const nav = event.target?.closest?.('.nav button');
    if (nav?.dataset?.view === 'devices-admin') setTimeout(() => decorateDeviceRows(true), 300);
    const tabButton = event.target?.closest?.('#organizationModal .tabs button');
    if (tabButton?.textContent?.includes('Sitios')) setTimeout(decorateSiteList, 300);
  }, true);

  const observer = new MutationObserver(() => {
    if (document.getElementById('devices-admin')?.classList.contains('active')) setTimeout(() => decorateDeviceRows(false), 80);
    if (document.getElementById('tab-sites')?.classList.contains('active')) setTimeout(decorateSiteList, 80);
  });

  function boot() {
    installStyles();
    ensureModal();
    observer.observe(document.body, {subtree:true, childList:true});
    setInterval(() => {
      if (document.getElementById('devices-admin')?.classList.contains('active')) decorateDeviceRows(false);
      if (document.getElementById('tab-sites')?.classList.contains('active')) decorateSiteList();
    }, 2500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true});
  else boot();
})();
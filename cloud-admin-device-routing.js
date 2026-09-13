(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const sectorNames = {
    fincas: 'Fincas',
    camaroneras: 'Camaroneras',
    bananeras: 'Bananeras',
    ganaderia: 'Ganadería',
  };

  let activeOrgId = '';
  let siteCache = [];
  let deviceCache = [];
  let hooksInstalled = false;

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const sectorLabel = key =>
    sectorNames[String(key || '').toLowerCase()] || 'Sin sector';

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

  function installStyles() {
    if (document.getElementById('tayuAdminRoutingStyles')) return;

    const style = document.createElement('style');
    style.id = 'tayuAdminRoutingStyles';
    style.textContent = `
      .tayu-routing-inline-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}
      .tayu-routing-badge{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;border:1px solid rgba(85,198,43,.24);background:rgba(85,198,43,.08);color:var(--brand-dark);font-size:10px;font-weight:900;white-space:nowrap}
      .tayu-routing-meta{display:block;margin-top:4px;color:var(--muted);font-size:10px;font-weight:800;line-height:1.35}
      .tayu-routing-device-action{display:inline-flex;margin-top:7px}
      .tayu-routing-modal{display:none;position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.42);padding:24px;align-items:center;justify-content:center}
      .tayu-routing-modal.open{display:flex}
      .tayu-routing-card{width:min(620px,100%);background:var(--panel);color:var(--text);border:1px solid var(--border);border-radius:22px;padding:18px;box-shadow:var(--shadow)}
      .tayu-routing-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:14px}
      .tayu-routing-head h3{margin:0}.tayu-routing-head p{margin:5px 0 0;color:var(--muted);font-size:12px}
      .tayu-routing-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
      .tayu-routing-msg{min-height:18px;margin-top:8px;font-size:12px;color:var(--muted)}
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
    modal.addEventListener('click', event => {
      if (event.target === modal) modal.classList.remove('open');
    });
    document.body.appendChild(modal);
    return modal;
  }

  function closeModal() {
    document.getElementById('tayuAdminRoutingModal')?.classList.remove('open');
  }

  async function loadSites(force = false) {
    if (!activeOrgId) return [];
    if (!force && siteCache.length) return siteCache;

    const rows = await request(
      `/admin/organization/site-routing?organization_id=${encodeURIComponent(activeOrgId)}`
    );
    siteCache = Array.isArray(rows) ? rows : [];
    return siteCache;
  }

  async function loadDevices(force = false) {
    if (!activeOrgId) return [];
    if (!force && deviceCache.length) return deviceCache;

    const rows = await request(
      `/admin/organization/devices?organization_id=${encodeURIComponent(activeOrgId)}`
    );
    deviceCache = Array.isArray(rows) ? rows : [];
    return deviceCache;
  }

  function sectorOptions(site, selected) {
    const values = site?.site_type === 'camaronera'
      ? [['camaroneras', 'Camaroneras']]
      : [
          ['', 'Sin sector'],
          ['fincas', 'Fincas'],
          ['bananeras', 'Bananeras'],
          ['ganaderia', 'Ganadería'],
        ];

    return values.map(([value, label]) =>
      `<option value="${esc(value)}" ${String(selected || '') === value ? 'selected' : ''}>${esc(label)}</option>`
    ).join('');
  }

  async function decorateSites(force = false) {
    if (!activeOrgId || !document.getElementById('tab-sites')?.classList.contains('active')) return;

    try {
      const sites = await loadSites(force);
      const items = [...document.querySelectorAll('#tab-sites .list > .list-item')];

      items.forEach(item => {
        const metaText = item.querySelector('small')?.textContent || '';
        const site = sites.find(row => metaText.includes(` · ${row.slug} · `));
        if (!site) return;

        let actions = item.querySelector('.tayu-routing-inline-actions');
        if (!actions) {
          actions = document.createElement('div');
          actions.className = 'tayu-routing-inline-actions';
          const status = item.querySelector(':scope > .pill');
          if (status) actions.appendChild(status);
          item.appendChild(actions);
        }

        let badge = actions.querySelector('.tayu-routing-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tayu-routing-badge';
          actions.appendChild(badge);
        }
        badge.textContent = `Sector: ${sectorLabel(site.sector_key)}`;

        let button = actions.querySelector('[data-routing-site]');
        if (!button) {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn ghost small';
          button.dataset.routingSite = site.id;
          button.textContent = 'Sector';
          actions.appendChild(button);
        }
      });
    } catch (error) {
      console.warn('Cloud Admin sector:', error.message);
    }
  }

  async function decorateDevices(force = false) {
    if (!activeOrgId || !document.getElementById('tab-devices')?.classList.contains('active')) return;

    try {
      const [sites, devices] = await Promise.all([
        loadSites(force),
        loadDevices(force),
      ]);
      const siteMap = new Map(sites.map(site => [String(site.id), site]));
      const rows = [...document.querySelectorAll('#tab-devices tbody tr')];

      rows.forEach(row => {
        const deviceKey = row.querySelector('td:first-child .muted')?.textContent?.trim();
        const device = devices.find(item => String(item.device_key) === String(deviceKey));
        if (!device) return;

        const site = device.site_id ? siteMap.get(String(device.site_id)) : null;
        const siteCell = row.children[2];
        if (siteCell) {
          siteCell.textContent = device.site_name || 'Sin asignar';
          const meta = document.createElement('small');
          meta.className = 'tayu-routing-meta';
          meta.textContent = `Sector: ${sectorLabel(site?.sector_key || device.site_sector)}`;
          siteCell.appendChild(meta);
        }

        const adminCell = row.children[4];
        const deviceId = device.id || device.device_id;
        if (adminCell && deviceId && !adminCell.querySelector('[data-routing-device]')) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'btn ghost small tayu-routing-device-action';
          button.dataset.routingDevice = deviceId;
          button.textContent = 'Asignar sitio';
          adminCell.appendChild(document.createElement('br'));
          adminCell.appendChild(button);
        }
      });
    } catch (error) {
      console.warn('Cloud Admin device routing:', error.message);
    }
  }

  async function openSiteSector(siteId) {
    const modal = ensureModal();
    const card = document.getElementById('tayuAdminRoutingCard');
    card.innerHTML = '<p class="muted">Cargando sitio…</p>';
    modal.classList.add('open');

    try {
      const sites = await loadSites(true);
      const site = sites.find(row => String(row.id) === String(siteId));
      if (!site) throw new Error('Sitio no encontrado.');

      card.innerHTML = `
        <div class="tayu-routing-head">
          <div><h3>Sector operativo</h3><p>${esc(site.name)} · ${esc(site.site_type || 'sitio')}</p></div>
          <button type="button" class="close" data-routing-close>×</button>
        </div>
        <div class="field"><label>Sector</label><select id="tayuRoutingSector">${sectorOptions(site, site.sector_key)}</select></div>
        <div class="notice" style="margin-top:12px">Los dispositivos asignados a este sitio heredarán este sector en la plataforma del cliente.</div>
        <div id="tayuRoutingMsg" class="tayu-routing-msg"></div>
        <div class="tayu-routing-actions">
          <button type="button" class="btn ghost" data-routing-close>Cancelar</button>
          <button type="button" class="btn" id="tayuSaveSiteSector">Guardar sector</button>
        </div>`;

      card.querySelectorAll('[data-routing-close]').forEach(button => {
        button.onclick = closeModal;
      });

      document.getElementById('tayuSaveSiteSector').onclick = async () => {
        const button = document.getElementById('tayuSaveSiteSector');
        const message = document.getElementById('tayuRoutingMsg');
        try {
          button.disabled = true;
          message.textContent = 'Guardando…';
          const sectorKey = document.getElementById('tayuRoutingSector').value || null;
          await request('/admin/organization/site-sector', {
            method: 'POST',
            body: JSON.stringify({ site_id: site.id, sector_key: sectorKey }),
          });
          siteCache = [];
          deviceCache = [];
          message.textContent = 'Sector actualizado.';
          setTimeout(async () => {
            closeModal();
            await decorateSites(true);
            if (document.getElementById('tab-devices')?.classList.contains('active')) {
              await decorateDevices(true);
            }
          }, 250);
        } catch (error) {
          message.textContent = error.message;
          message.style.color = 'var(--danger)';
        } finally {
          button.disabled = false;
        }
      };
    } catch (error) {
      card.innerHTML = `<h3>Sector operativo</h3><p style="color:var(--danger)">${esc(error.message)}</p>`;
    }
  }

  async function openDeviceSite(deviceId) {
    const modal = ensureModal();
    const card = document.getElementById('tayuAdminRoutingCard');
    card.innerHTML = '<p class="muted">Cargando asignación…</p>';
    modal.classList.add('open');

    try {
      const [sites, devices] = await Promise.all([loadSites(true), loadDevices(true)]);
      const device = devices.find(item => String(item.id || item.device_id) === String(deviceId));
      if (!device) throw new Error('Dispositivo no encontrado.');

      const options = [
        '<option value="">Sin sitio</option>',
        ...sites.map(site =>
          `<option value="${esc(site.id)}" ${String(device.site_id || '') === String(site.id) ? 'selected' : ''}>${esc(site.name)} · ${esc(sectorLabel(site.sector_key))}</option>`
        ),
      ].join('');

      card.innerHTML = `
        <div class="tayu-routing-head">
          <div><h3>Asignar sitio</h3><p>${esc(device.name)} · ${esc(device.device_key)}</p></div>
          <button type="button" class="close" data-routing-close>×</button>
        </div>
        <div class="field"><label>Sitio</label><select id="tayuRoutingDeviceSite">${options}</select></div>
        <div class="notice" style="margin-top:12px">El dispositivo heredará el sector operativo del sitio seleccionado. Su perfil físico no cambia.</div>
        <div id="tayuRoutingMsg" class="tayu-routing-msg"></div>
        <div class="tayu-routing-actions">
          <button type="button" class="btn ghost" data-routing-close>Cancelar</button>
          <button type="button" class="btn" id="tayuSaveDeviceSite">Guardar asignación</button>
        </div>`;

      card.querySelectorAll('[data-routing-close]').forEach(button => {
        button.onclick = closeModal;
      });

      document.getElementById('tayuSaveDeviceSite').onclick = async () => {
        const button = document.getElementById('tayuSaveDeviceSite');
        const message = document.getElementById('tayuRoutingMsg');
        try {
          button.disabled = true;
          message.textContent = 'Guardando…';
          const siteId = document.getElementById('tayuRoutingDeviceSite').value || null;
          await request('/admin/organization/device-site', {
            method: 'POST',
            body: JSON.stringify({ device_id: device.id || device.device_id, site_id: siteId }),
          });
          deviceCache = [];
          siteCache = [];
          message.textContent = 'Asignación actualizada.';
          setTimeout(async () => {
            closeModal();
            await decorateDevices(true);
          }, 250);
        } catch (error) {
          message.textContent = error.message;
          message.style.color = 'var(--danger)';
        } finally {
          button.disabled = false;
        }
      };
    } catch (error) {
      card.innerHTML = `<h3>Asignar sitio</h3><p style="color:var(--danger)">${esc(error.message)}</p>`;
    }
  }

  function installHooks() {
    if (hooksInstalled || typeof window.openOrganization !== 'function') return false;
    hooksInstalled = true;

    const originalOpenOrganization = window.openOrganization;
    window.openOrganization = async function(id, ...rest) {
      activeOrgId = String(id || '');
      siteCache = [];
      deviceCache = [];
      return originalOpenOrganization.call(this, id, ...rest);
    };

    const originalCloseOrganization = window.closeOrganizationModal;
    if (typeof originalCloseOrganization === 'function') {
      window.closeOrganizationModal = function(...args) {
        activeOrgId = '';
        siteCache = [];
        deviceCache = [];
        return originalCloseOrganization.apply(this, args);
      };
    }

    document.addEventListener('click', event => {
      const siteButton = event.target?.closest?.('[data-routing-site]');
      if (siteButton) {
        event.preventDefault();
        event.stopPropagation();
        openSiteSector(siteButton.dataset.routingSite);
        return;
      }

      const deviceButton = event.target?.closest?.('[data-routing-device]');
      if (deviceButton) {
        event.preventDefault();
        event.stopPropagation();
        openDeviceSite(deviceButton.dataset.routingDevice);
        return;
      }

      const tabButton = event.target?.closest?.('#organizationModal .tabs button');
      if (!tabButton) return;

      const label = tabButton.textContent.trim().toLowerCase();
      if (label.includes('sitios')) {
        setTimeout(() => decorateSites(true), 0);
      } else if (label.includes('dispositivos')) {
        setTimeout(() => decorateDevices(true), 0);
      }
    });

    return true;
  }

  function boot() {
    installStyles();
    if (installHooks()) return;

    window.addEventListener('load', () => {
      installHooks();
    }, { once: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const DEFAULT_COLOR = '#55C62B';
  const state = {
    organizationId: null,
    branding: null,
    pendingLogoDataUrl: null,
    removeLogo: false,
    previewObjectUrl: null,
    wrapped: false,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));

  async function getKeycloak() {
    for (let i = 0; i < 100; i += 1) {
      const kc = window.__tayuKeycloak;
      if (kc?.authenticated && kc?.token) return kc;
      await sleep(100);
    }
    throw new Error('No hay una sesión de Super Admin activa.');
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
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `API ${response.status}`);
      return data;
    }
    if (!response.ok) throw new Error(`API ${response.status}`);
    return response;
  }

  const api = (path) => request(path);
  const post = (path, body) => request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  function normalizeColor(value) {
    const color = String(value || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
  }

  function injectStyles() {
    if (document.getElementById('tayuAdminBrandingStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuAdminBrandingStyles';
    style.textContent = `
      .sa-brand-grid{display:grid;grid-template-columns:minmax(320px,.9fr) minmax(360px,1.1fr);gap:16px}
      .sa-brand-panel{border:1px solid var(--border);background:var(--panel2);border-radius:16px;padding:16px}
      .sa-brand-panel h3{margin:0 0 5px}.sa-brand-panel>p{margin:0 0 14px;color:var(--muted);font-size:12px;line-height:1.45}
      .sa-brand-color-row{display:grid;grid-template-columns:64px 1fr;gap:10px;align-items:end}
      .sa-brand-color-row input[type=color]{height:46px;padding:4px;cursor:pointer}
      .sa-brand-logo-box{min-height:150px;display:grid;place-items:center;border:1px dashed var(--border);background:var(--panel);border-radius:15px;padding:16px;margin-top:10px;text-align:center}
      .sa-brand-logo-box img{display:block;max-width:220px;max-height:105px;object-fit:contain;margin:auto}
      .sa-brand-logo-placeholder{color:var(--muted);font-size:12px;font-weight:800}
      .sa-brand-file-meta{margin-top:7px;color:var(--muted);font-size:11px;line-height:1.4}
      .sa-brand-preview{border:1px solid var(--border);border-radius:18px;overflow:hidden;background:var(--panel)}
      .sa-brand-preview-sidebar{width:170px;min-height:330px;padding:18px;background:var(--panel);border-right:1px solid var(--border)}
      .sa-brand-preview-layout{display:flex;min-height:330px}
      .sa-brand-preview-logo{min-height:80px;display:grid;place-items:center;margin-bottom:18px}
      .sa-brand-preview-logo img{max-width:125px;max-height:65px;object-fit:contain}
      .sa-brand-preview-name{font-weight:900;text-align:center;line-height:1.2;margin-bottom:18px;overflow-wrap:anywhere}
      .sa-brand-preview-nav{display:grid;gap:7px}.sa-brand-preview-nav div{padding:10px 11px;border-radius:12px;color:var(--muted);font-size:12px;font-weight:800}.sa-brand-preview-nav .active{color:var(--text)}
      .sa-brand-preview-main{flex:1;padding:20px;min-width:0;background:var(--bg)}
      .sa-brand-preview-main h3{margin:0 0 5px}.sa-brand-preview-main p{margin:0 0 18px;color:var(--muted);font-size:12px}
      .sa-brand-preview-card{border:1px solid var(--border);background:var(--panel);border-radius:16px;padding:15px}.sa-brand-preview-button{display:inline-block;border:0;border-radius:12px;padding:10px 14px;color:#fff;font-weight:850;margin-top:12px}
      .sa-brand-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
      .sa-brand-status{min-height:18px;margin-top:10px;font-size:12px;font-weight:800}.sa-brand-status.ok{color:var(--brand-dark)}.sa-brand-status.error{color:var(--danger)}
      @media(max-width:900px){.sa-brand-grid{grid-template-columns:1fr}.sa-brand-preview-layout{display:block}.sa-brand-preview-sidebar{width:auto;min-height:auto;border-right:0;border-bottom:1px solid var(--border)}}
    `;
    document.head.appendChild(style);
  }

  function ensureTab() {
    const modal = document.getElementById('organizationModal');
    if (!modal) return false;
    const tabs = modal.querySelector('.tabs');
    if (!tabs) return false;

    let button = tabs.querySelector('[data-tayu-branding-tab="1"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.tayuBrandingTab = '1';
      button.textContent = 'Marca';
      button.addEventListener('click', () => {
        modal.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
        modal.querySelectorAll('.tabs button').forEach((btn) => btn.classList.remove('active'));
        const panel = document.getElementById('tab-branding');
        if (panel) panel.classList.add('active');
        button.classList.add('active');
        loadBranding().catch((error) => renderError(error.message));
      });
      tabs.appendChild(button);
    }

    let panel = document.getElementById('tab-branding');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'tab-branding';
      panel.className = 'tab';
      panel.innerHTML = '<div class="empty">Selecciona la pestaña Marca para cargar el White Label.</div>';
      const tabsContainer = tabs.parentElement;
      tabsContainer.appendChild(panel);
    }
    return true;
  }

  function setStatus(message = '', type = '') {
    const el = document.getElementById('saBrandStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `sa-brand-status ${type}`.trim();
  }

  function renderError(message) {
    const panel = document.getElementById('tab-branding');
    if (!panel) return;
    panel.innerHTML = `<div class="error-box show">${esc(message)}</div>`;
  }

  async function loadCustomLogoUrl(branding) {
    if (state.previewObjectUrl) {
      URL.revokeObjectURL(state.previewObjectUrl);
      state.previewObjectUrl = null;
    }
    if (!branding?.has_custom_logo || !state.organizationId) return null;
    const path = `/admin/organization/branding/logo?organization_id=${encodeURIComponent(state.organizationId)}`;
    const response = await request(path);
    const blob = await response.blob();
    state.previewObjectUrl = URL.createObjectURL(blob);
    return state.previewObjectUrl;
  }

  function previewLogoSrc() {
    if (state.pendingLogoDataUrl) return state.pendingLogoDataUrl;
    if (state.removeLogo) return 'imagenes/LOGO-COLOR.jpg';
    if (state.previewObjectUrl) return state.previewObjectUrl;
    return 'imagenes/LOGO-COLOR.jpg';
  }

  function updatePreview() {
    const nameInput = document.getElementById('saBrandDisplayName');
    const colorText = document.getElementById('saBrandColorText');
    const name = String(nameInput?.value || state.branding?.organization_name || 'Empresa').trim() || state.branding?.organization_name || 'Empresa';
    const color = normalizeColor(colorText?.value || DEFAULT_COLOR);
    const previewName = document.getElementById('saBrandPreviewName');
    const previewLogo = document.getElementById('saBrandPreviewLogo');
    const previewButton = document.getElementById('saBrandPreviewButton');
    const previewActive = document.getElementById('saBrandPreviewActive');
    const colorPicker = document.getElementById('saBrandColorPicker');
    if (previewName) previewName.textContent = name;
    if (previewLogo) previewLogo.src = previewLogoSrc();
    if (previewLogo) previewLogo.alt = name;
    if (previewButton) previewButton.style.background = color;
    if (previewActive) previewActive.style.background = hexToRgba(color, .12);
    if (colorPicker && colorPicker.value.toUpperCase() !== color) colorPicker.value = color;
  }

  function hexToRgba(hex, alpha) {
    const value = normalizeColor(hex).slice(1);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  async function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('No se pudo leer el logo.'));
      reader.readAsDataURL(file);
    });
  }

  async function onLogoSelected(event) {
    setStatus('');
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      event.target.value = '';
      setStatus('El logo debe ser un archivo PNG.', 'error');
      return;
    }
    if (file.size > 512 * 1024) {
      event.target.value = '';
      setStatus('El logo debe pesar 512 KB o menos.', 'error');
      return;
    }
    state.pendingLogoDataUrl = await fileToDataUrl(file);
    state.removeLogo = false;
    const meta = document.getElementById('saBrandFileMeta');
    if (meta) meta.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · pendiente de guardar`;
    updatePreview();
  }

  function removeLogo() {
    state.pendingLogoDataUrl = null;
    state.removeLogo = true;
    const input = document.getElementById('saBrandLogoInput');
    if (input) input.value = '';
    const meta = document.getElementById('saBrandFileMeta');
    if (meta) meta.textContent = 'Se restaurará el logo de TAYULABS al guardar.';
    updatePreview();
  }

  async function saveBranding(event) {
    event.preventDefault();
    setStatus('Guardando…');
    const displayName = String(document.getElementById('saBrandDisplayName')?.value || '').trim();
    const primaryColor = normalizeColor(document.getElementById('saBrandColorText')?.value || DEFAULT_COLOR);
    const body = {
      organization_id: state.organizationId,
      display_name: displayName || null,
      primary_color: primaryColor,
    };
    if (state.pendingLogoDataUrl) body.logo_base64 = state.pendingLogoDataUrl;
    if (state.removeLogo) body.remove_logo = true;

    try {
      const result = await post('/admin/organization/branding', body);
      state.branding = result;
      state.pendingLogoDataUrl = null;
      state.removeLogo = false;
      await loadCustomLogoUrl(result).catch(() => null);
      renderBranding(result);
      setStatus('Marca guardada correctamente.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function resetBranding() {
    if (!state.organizationId) return;
    if (!window.confirm('¿Restablecer nombre, color y logo a la identidad predeterminada de TAYULABS?')) return;
    setStatus('Restableciendo…');
    try {
      const result = await post('/admin/organization/branding', {
        organization_id: state.organizationId,
        reset: true,
      });
      state.branding = result;
      state.pendingLogoDataUrl = null;
      state.removeLogo = false;
      if (state.previewObjectUrl) {
        URL.revokeObjectURL(state.previewObjectUrl);
        state.previewObjectUrl = null;
      }
      renderBranding(result);
      setStatus('White Label restablecido a TAYULABS.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  function renderBranding(branding) {
    const panel = document.getElementById('tab-branding');
    if (!panel) return;
    const displayName = branding.display_name || branding.organization_name || '';
    const color = normalizeColor(branding.primary_color);
    const hasLogo = Boolean(branding.has_custom_logo);

    panel.innerHTML = `
      <div class="sa-brand-grid">
        <div class="sa-brand-panel">
          <h3>Marca / White Label</h3>
          <p>Personaliza la identidad visual que verá esta empresa dentro de TAYULABS Cloud.</p>
          <form id="saBrandForm">
            <div class="field">
              <label>Nombre visible</label>
              <input id="saBrandDisplayName" maxlength="200" value="${esc(displayName)}" placeholder="${esc(branding.organization_name || 'Empresa')}">
            </div>
            <div class="sa-brand-color-row">
              <div class="field">
                <label>Color</label>
                <input id="saBrandColorPicker" type="color" value="${esc(color)}">
              </div>
              <div class="field">
                <label>Color principal · #RRGGBB</label>
                <input id="saBrandColorText" value="${esc(color)}" maxlength="7" pattern="^#[0-9A-Fa-f]{6}$">
              </div>
            </div>
            <div class="field">
              <label>Logo PNG · máximo 512 KB</label>
              <input id="saBrandLogoInput" type="file" accept="image/png,.png">
              <div id="saBrandFileMeta" class="sa-brand-file-meta">${hasLogo ? 'Logo personalizado configurado.' : 'Actualmente usa el logo predeterminado de TAYULABS.'}</div>
            </div>
            <div class="sa-brand-logo-box">
              <div>
                <img id="saBrandLogoPreviewSmall" src="${esc(previewLogoSrc())}" alt="${esc(displayName || 'Logo')}">
                <div class="sa-brand-file-meta">Vista previa del logo</div>
              </div>
            </div>
            <div class="sa-brand-actions">
              ${hasLogo ? '<button class="btn ghost" id="saBrandRemoveLogo" type="button">Quitar logo personalizado</button>' : ''}
              <button class="btn ghost" id="saBrandReset" type="button">Restablecer TAYULABS</button>
              <button class="btn" type="submit">Guardar marca</button>
            </div>
            <div id="saBrandStatus" class="sa-brand-status"></div>
          </form>
        </div>

        <div class="sa-brand-panel">
          <h3>Vista previa</h3>
          <p>Referencia de cómo se verá la identidad dentro de la plataforma del cliente.</p>
          <div class="sa-brand-preview">
            <div class="sa-brand-preview-layout">
              <aside class="sa-brand-preview-sidebar">
                <div class="sa-brand-preview-logo"><img id="saBrandPreviewLogo" src="${esc(previewLogoSrc())}" alt="${esc(displayName || 'Logo')}"></div>
                <div id="saBrandPreviewName" class="sa-brand-preview-name">${esc(displayName)}</div>
                <div class="sa-brand-preview-nav">
                  <div id="saBrandPreviewActive" class="active" style="background:${esc(hexToRgba(color,.12))}">Dashboard</div>
                  <div>Fincas</div><div>Sensores</div><div>Dispositivos</div>
                </div>
              </aside>
              <main class="sa-brand-preview-main">
                <h3>Dashboard</h3>
                <p>Gestión de activos IoT por finca y zona.</p>
                <div class="sa-brand-preview-card">
                  <b>Dashboard personalizable</b>
                  <div><button id="saBrandPreviewButton" class="sa-brand-preview-button" type="button" style="background:${esc(color)}">＋ Agregar widget</button></div>
                </div>
              </main>
            </div>
          </div>
        </div>
      </div>`;

    const form = document.getElementById('saBrandForm');
    const picker = document.getElementById('saBrandColorPicker');
    const text = document.getElementById('saBrandColorText');
    const logoInput = document.getElementById('saBrandLogoInput');
    form?.addEventListener('submit', saveBranding);
    picker?.addEventListener('input', () => { if (text) text.value = picker.value.toUpperCase(); updatePreview(); });
    text?.addEventListener('input', () => updatePreview());
    document.getElementById('saBrandDisplayName')?.addEventListener('input', updatePreview);
    logoInput?.addEventListener('change', (event) => onLogoSelected(event).catch((error) => setStatus(error.message, 'error')));
    document.getElementById('saBrandRemoveLogo')?.addEventListener('click', removeLogo);
    document.getElementById('saBrandReset')?.addEventListener('click', resetBranding);
  }

  async function loadBranding() {
    if (!state.organizationId) throw new Error('No hay una empresa seleccionada.');
    const panel = document.getElementById('tab-branding');
    if (panel) panel.innerHTML = '<div class="empty">Cargando marca…</div>';
    const branding = await api(`/admin/organization/branding?organization_id=${encodeURIComponent(state.organizationId)}`);
    state.branding = branding;
    state.pendingLogoDataUrl = null;
    state.removeLogo = false;
    await loadCustomLogoUrl(branding).catch(() => null);
    renderBranding(branding);
  }

  function wrapOrganizationFunctions() {
    if (state.wrapped || typeof window.openOrganization !== 'function') return;
    const originalOpen = window.openOrganization;
    window.openOrganization = async function (id, ...rest) {
      state.organizationId = String(id || '');
      state.branding = null;
      state.pendingLogoDataUrl = null;
      state.removeLogo = false;
      const result = await originalOpen.call(this, id, ...rest);
      ensureTab();
      return result;
    };

    const originalClose = window.closeOrganizationModal;
    if (typeof originalClose === 'function') {
      window.closeOrganizationModal = function (...args) {
        state.organizationId = null;
        state.branding = null;
        state.pendingLogoDataUrl = null;
        state.removeLogo = false;
        if (state.previewObjectUrl) {
          URL.revokeObjectURL(state.previewObjectUrl);
          state.previewObjectUrl = null;
        }
        return originalClose.apply(this, args);
      };
    }
    state.wrapped = true;
  }

  function boot() {
    injectStyles();
    ensureTab();
    wrapOrganizationFunctions();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      injectStyles();
      ensureTab();
      wrapOrganizationFunctions();
      if (state.wrapped || attempts >= 160) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();

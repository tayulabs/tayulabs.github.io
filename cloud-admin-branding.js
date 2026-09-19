(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const DEFAULT_COLOR = '#55C62B';
  const DEFAULT_LOGO_LIGHT = 'imagenes/AmeliaCloud-color.png';
  const DEFAULT_LOGO_DARK = 'imagenes/AmeliaCloud-white.png';

  const state = {
    organizationId: null,
    branding: null,
    pendingLogoDataUrl: null,
    removeLogo: false,
    previewObjectUrl: null,
    pendingLogoDarkDataUrl: null,
    removeLogoDark: false,
    previewDarkObjectUrl: null,
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
      .sa-brand-logo-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}
      .sa-brand-logo-card{border:1px solid var(--border);border-radius:15px;padding:12px;background:var(--panel)}
      .sa-brand-logo-card h4{margin:0 0 3px;font-size:13px}.sa-brand-logo-card>p{margin:0 0 10px;color:var(--muted);font-size:11px;line-height:1.4}
      .sa-brand-logo-box{min-height:135px;display:grid;place-items:center;border:1px dashed var(--border);background:#fff;border-radius:13px;padding:14px;text-align:center}
      .sa-brand-logo-box.dark{background:#0f172a;border-color:#334155}
      .sa-brand-logo-box img{display:block;max-width:210px;max-height:92px;object-fit:contain;margin:auto}
      .sa-brand-file-meta{margin-top:7px;color:var(--muted);font-size:11px;line-height:1.4}
      .sa-brand-logo-card .sa-brand-actions{justify-content:flex-start;margin-top:10px}
      .sa-brand-preview-stack{display:grid;gap:12px}
      .sa-brand-preview{border:1px solid var(--border);border-radius:18px;overflow:hidden;background:var(--panel)}
      .sa-brand-preview-label{padding:8px 12px;border-bottom:1px solid var(--border);font-size:11px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
      .sa-brand-preview-layout{display:flex;min-height:285px}
      .sa-brand-preview-sidebar{width:170px;min-height:285px;padding:18px;background:#fff;border-right:1px solid #e5e7eb;color:#111827}
      .sa-brand-preview-logo{min-height:72px;display:grid;place-items:center;margin-bottom:14px}
      .sa-brand-preview-logo img{max-width:125px;max-height:62px;object-fit:contain}
      .sa-brand-preview-name{font-weight:900;text-align:center;line-height:1.2;margin-bottom:16px;overflow-wrap:anywhere}
      .sa-brand-preview-nav{display:grid;gap:7px}.sa-brand-preview-nav div{padding:9px 10px;border-radius:12px;color:#64748b;font-size:12px;font-weight:800}.sa-brand-preview-nav .active{color:#0f172a}
      .sa-brand-preview-main{flex:1;padding:20px;min-width:0;background:#f8fafc;color:#0f172a}
      .sa-brand-preview-main h3{margin:0 0 5px}.sa-brand-preview-main p{margin:0 0 18px;color:#64748b;font-size:12px}
      .sa-brand-preview-card{border:1px solid #e5e7eb;background:#fff;border-radius:16px;padding:15px}
      .sa-brand-preview-button{display:inline-block;border:0;border-radius:12px;padding:10px 14px;color:#fff;font-weight:850;margin-top:12px}
      .sa-brand-preview.dark{border-color:#334155;background:#0b1120}
      .sa-brand-preview.dark .sa-brand-preview-label{border-color:#334155;color:#94a3b8;background:#0b1120}
      .sa-brand-preview.dark .sa-brand-preview-sidebar{background:#0f172a;border-color:#334155;color:#f8fafc}
      .sa-brand-preview.dark .sa-brand-preview-nav div{color:#94a3b8}.sa-brand-preview.dark .sa-brand-preview-nav .active{color:#f8fafc}
      .sa-brand-preview.dark .sa-brand-preview-main{background:#020617;color:#f8fafc}
      .sa-brand-preview.dark .sa-brand-preview-main p{color:#94a3b8}
      .sa-brand-preview.dark .sa-brand-preview-card{background:#0f172a;border-color:#334155}
      .sa-brand-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}
      .sa-brand-status{min-height:18px;margin-top:10px;font-size:12px;font-weight:800}.sa-brand-status.ok{color:var(--brand-dark)}.sa-brand-status.error{color:var(--danger)}
      @media(max-width:1050px){.sa-brand-logo-grid{grid-template-columns:1fr}}
      @media(max-width:900px){.sa-brand-grid{grid-template-columns:1fr}.sa-brand-preview-layout{display:block}.sa-brand-preview-sidebar{width:auto;min-height:auto;border-right:0;border-bottom:1px solid #e5e7eb}.sa-brand-preview.dark .sa-brand-preview-sidebar{border-bottom-color:#334155}}
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

  function revokeObjectUrl(key) {
    if (!state[key]) return;
    URL.revokeObjectURL(state[key]);
    state[key] = null;
  }

  function clearPreviewObjectUrls() {
    revokeObjectUrl('previewObjectUrl');
    revokeObjectUrl('previewDarkObjectUrl');
  }

  async function loadBlobUrl(path, stateKey) {
    const response = await request(path);
    const blob = await response.blob();
    state[stateKey] = URL.createObjectURL(blob);
    return state[stateKey];
  }

  async function loadCustomLogoUrls(branding) {
    clearPreviewObjectUrls();
    if (!state.organizationId) return;

    const organizationId = encodeURIComponent(state.organizationId);
    const jobs = [];

    if (branding?.has_custom_logo) {
      jobs.push(
        loadBlobUrl(
          `/admin/organization/branding/logo?organization_id=${organizationId}`,
          'previewObjectUrl'
        ).catch(() => null)
      );
    }

    if (branding?.has_custom_logo_dark || branding?.has_custom_logo) {
      jobs.push(
        loadBlobUrl(
          `/admin/organization/branding/logo-dark?organization_id=${organizationId}`,
          'previewDarkObjectUrl'
        ).catch(() => null)
      );
    }

    await Promise.all(jobs);
  }

  function previewLogoSrc() {
    if (state.pendingLogoDataUrl) return state.pendingLogoDataUrl;
    if (state.removeLogo) return DEFAULT_LOGO_LIGHT;
    if (state.previewObjectUrl) return state.previewObjectUrl;
    return DEFAULT_LOGO_LIGHT;
  }

  function hasEffectiveCustomLightLogo() {
    return Boolean(
      state.pendingLogoDataUrl ||
      (!state.removeLogo && (state.previewObjectUrl || state.branding?.has_custom_logo))
    );
  }

  function previewLogoDarkSrc() {
    if (state.pendingLogoDarkDataUrl) return state.pendingLogoDarkDataUrl;

    if (state.removeLogoDark) {
      return hasEffectiveCustomLightLogo() ? previewLogoSrc() : DEFAULT_LOGO_DARK;
    }

    if (state.previewDarkObjectUrl) return state.previewDarkObjectUrl;

    if (hasEffectiveCustomLightLogo()) return previewLogoSrc();

    return DEFAULT_LOGO_DARK;
  }

  function updatePreview() {
    const nameInput = document.getElementById('saBrandDisplayName');
    const colorText = document.getElementById('saBrandColorText');
    const name = String(
      nameInput?.value ||
      state.branding?.organization_name ||
      'Empresa'
    ).trim() || state.branding?.organization_name || 'Empresa';
    const color = normalizeColor(colorText?.value || DEFAULT_COLOR);
    const colorPicker = document.getElementById('saBrandColorPicker');

    [
      ['saBrandPreviewName', name],
      ['saBrandPreviewNameDark', name],
    ].forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    });

    [
      ['saBrandPreviewLogo', previewLogoSrc()],
      ['saBrandLogoPreviewSmall', previewLogoSrc()],
      ['saBrandPreviewLogoDark', previewLogoDarkSrc()],
      ['saBrandLogoDarkPreviewSmall', previewLogoDarkSrc()],
    ].forEach(([id, src]) => {
      const img = document.getElementById(id);
      if (img) {
        img.src = src;
        img.alt = name;
      }
    });

    ['saBrandPreviewButton', 'saBrandPreviewButtonDark'].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.style.background = color;
    });

    ['saBrandPreviewActive', 'saBrandPreviewActiveDark'].forEach((id) => {
      const active = document.getElementById(id);
      if (active) active.style.background = hexToRgba(color, .12);
    });

    if (colorPicker && colorPicker.value.toUpperCase() !== color) {
      colorPicker.value = color;
    }
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

  function validateLogoFile(file, input) {
    if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) {
      input.value = '';
      setStatus('El logo debe ser un archivo PNG.', 'error');
      return false;
    }

    if (file.size > 512 * 1024) {
      input.value = '';
      setStatus('El logo debe pesar 512 KB o menos.', 'error');
      return false;
    }

    return true;
  }

  async function onLogoSelected(event) {
    setStatus('');
    const file = event.target.files?.[0];
    if (!file || !validateLogoFile(file, event.target)) return;

    state.pendingLogoDataUrl = await fileToDataUrl(file);
    state.removeLogo = false;

    const meta = document.getElementById('saBrandFileMeta');
    if (meta) {
      meta.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · pendiente de guardar`;
    }

    updatePreview();
  }

  async function onLogoDarkSelected(event) {
    setStatus('');
    const file = event.target.files?.[0];
    if (!file || !validateLogoFile(file, event.target)) return;

    state.pendingLogoDarkDataUrl = await fileToDataUrl(file);
    state.removeLogoDark = false;

    const meta = document.getElementById('saBrandDarkFileMeta');
    if (meta) {
      meta.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB · pendiente de guardar`;
    }

    updatePreview();
  }

  function removeLogo() {
    state.pendingLogoDataUrl = null;
    state.removeLogo = true;

    const input = document.getElementById('saBrandLogoInput');
    if (input) input.value = '';

    const meta = document.getElementById('saBrandFileMeta');
    if (meta) {
      meta.textContent = 'Se restaurará el logo de Amelia Cloud para modo claro al guardar.';
    }

    updatePreview();
  }

  function removeLogoDark() {
    state.pendingLogoDarkDataUrl = null;
    state.removeLogoDark = true;

    const input = document.getElementById('saBrandLogoDarkInput');
    if (input) input.value = '';

    const meta = document.getElementById('saBrandDarkFileMeta');
    if (meta) {
      meta.textContent = 'Se quitará el logo oscuro personalizado. Si existe un logo principal, se reutilizará.';
    }

    updatePreview();
  }

  async function saveBranding(event) {
    event.preventDefault();
    setStatus('Guardando…');

    const displayName = String(
      document.getElementById('saBrandDisplayName')?.value || ''
    ).trim();
    const primaryColor = normalizeColor(
      document.getElementById('saBrandColorText')?.value || DEFAULT_COLOR
    );

    const body = {
      organization_id: state.organizationId,
      display_name: displayName || null,
      primary_color: primaryColor,
    };

    if (state.pendingLogoDataUrl) body.logo_base64 = state.pendingLogoDataUrl;
    if (state.removeLogo) body.remove_logo = true;
    if (state.pendingLogoDarkDataUrl) body.logo_dark_base64 = state.pendingLogoDarkDataUrl;
    if (state.removeLogoDark) body.remove_logo_dark = true;

    try {
      const result = await post('/admin/organization/branding', body);
      state.branding = result;
      state.pendingLogoDataUrl = null;
      state.removeLogo = false;
      state.pendingLogoDarkDataUrl = null;
      state.removeLogoDark = false;

      await loadCustomLogoUrls(result);
      renderBranding(result);
      setStatus('Marca guardada correctamente.', 'ok');
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function resetBranding() {
    if (!state.organizationId) return;

    if (!window.confirm(
      '¿Restablecer nombre, color y ambos logos a la identidad predeterminada de Amelia Cloud?'
    )) return;

    setStatus('Restableciendo…');

    try {
      const result = await post('/admin/organization/branding', {
        organization_id: state.organizationId,
        reset: true,
      });

      state.branding = result;
      state.pendingLogoDataUrl = null;
      state.removeLogo = false;
      state.pendingLogoDarkDataUrl = null;
      state.removeLogoDark = false;
      clearPreviewObjectUrls();

      renderBranding(result);
      setStatus('White Label restablecido a Amelia Cloud.', 'ok');
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
    const hasLogoDark = Boolean(branding.has_custom_logo_dark);

    panel.innerHTML = `
      <div class="sa-brand-grid">
        <div class="sa-brand-panel">
          <h3>Marca / White Label</h3>
          <p>Personaliza la identidad visual que verá esta empresa dentro de TAYULABS Cloud.</p>

          <form id="saBrandForm">
            <div class="field">
              <label>Nombre visible</label>
              <input
                id="saBrandDisplayName"
                maxlength="200"
                value="${esc(displayName)}"
                placeholder="${esc(branding.organization_name || 'Empresa')}"
              >
            </div>

            <div class="sa-brand-color-row">
              <div class="field">
                <label>Color</label>
                <input id="saBrandColorPicker" type="color" value="${esc(color)}">
              </div>
              <div class="field">
                <label>Color principal · #RRGGBB</label>
                <input
                  id="saBrandColorText"
                  value="${esc(color)}"
                  maxlength="7"
                  pattern="^#[0-9A-Fa-f]{6}$"
                >
              </div>
            </div>

            <div class="sa-brand-logo-grid">
              <section class="sa-brand-logo-card">
                <h4>Logo principal · modo claro</h4>
                <p>Se utiliza sobre fondos claros. PNG de máximo 512 KB.</p>

                <div class="field">
                  <input id="saBrandLogoInput" type="file" accept="image/png,.png">
                  <div id="saBrandFileMeta" class="sa-brand-file-meta">
                    ${hasLogo
                      ? 'Logo principal personalizado configurado.'
                      : 'Actualmente usa el logo predeterminado de Amelia Cloud.'}
                  </div>
                </div>

                <div class="sa-brand-logo-box">
                  <div>
                    <img
                      id="saBrandLogoPreviewSmall"
                      src="${esc(previewLogoSrc())}"
                      alt="${esc(displayName || 'Logo')}"
                    >
                    <div class="sa-brand-file-meta">Vista previa · modo claro</div>
                  </div>
                </div>

                <div class="sa-brand-actions">
                  ${hasLogo
                    ? '<button class="btn ghost" id="saBrandRemoveLogo" type="button">Quitar logo claro</button>'
                    : ''}
                </div>
              </section>

              <section class="sa-brand-logo-card">
                <h4>Logo · modo oscuro</h4>
                <p>Se utiliza sobre fondos oscuros. Si no cargas uno, se reutiliza el logo principal.</p>

                <div class="field">
                  <input id="saBrandLogoDarkInput" type="file" accept="image/png,.png">
                  <div id="saBrandDarkFileMeta" class="sa-brand-file-meta">
                    ${hasLogoDark
                      ? 'Logo oscuro personalizado configurado.'
                      : hasLogo
                        ? 'Sin logo oscuro propio: se reutiliza el logo principal.'
                        : 'Actualmente usa el logo blanco predeterminado de Amelia Cloud.'}
                  </div>
                </div>

                <div class="sa-brand-logo-box dark">
                  <div>
                    <img
                      id="saBrandLogoDarkPreviewSmall"
                      src="${esc(previewLogoDarkSrc())}"
                      alt="${esc(displayName || 'Logo oscuro')}"
                    >
                    <div class="sa-brand-file-meta">Vista previa · modo oscuro</div>
                  </div>
                </div>

                <div class="sa-brand-actions">
                  ${hasLogoDark
                    ? '<button class="btn ghost" id="saBrandRemoveLogoDark" type="button">Quitar logo oscuro</button>'
                    : ''}
                </div>
              </section>
            </div>

            <div class="sa-brand-actions">
              <button class="btn ghost" id="saBrandReset" type="button">
                Restablecer Amelia Cloud
              </button>
              <button class="btn" type="submit">Guardar marca</button>
            </div>

            <div id="saBrandStatus" class="sa-brand-status"></div>
          </form>
        </div>

        <div class="sa-brand-panel">
          <h3>Vista previa</h3>
          <p>Referencia de cómo se verá la identidad en los modos claro y oscuro.</p>

          <div class="sa-brand-preview-stack">
            <div class="sa-brand-preview">
              <div class="sa-brand-preview-label">Modo claro</div>
              <div class="sa-brand-preview-layout">
                <aside class="sa-brand-preview-sidebar">
                  <div class="sa-brand-preview-logo">
                    <img
                      id="saBrandPreviewLogo"
                      src="${esc(previewLogoSrc())}"
                      alt="${esc(displayName || 'Logo')}"
                    >
                  </div>
                  <div id="saBrandPreviewName" class="sa-brand-preview-name">
                    ${esc(displayName)}
                  </div>
                  <div class="sa-brand-preview-nav">
                    <div
                      id="saBrandPreviewActive"
                      class="active"
                      style="background:${esc(hexToRgba(color, .12))}"
                    >Dashboard</div>
                    <div>Fincas</div>
                    <div>Sensores</div>
                    <div>Dispositivos</div>
                  </div>
                </aside>

                <main class="sa-brand-preview-main">
                  <h3>Dashboard</h3>
                  <p>Gestión de activos IoT por finca y zona.</p>
                  <div class="sa-brand-preview-card">
                    <b>Dashboard personalizable</b>
                    <div>
                      <button
                        id="saBrandPreviewButton"
                        class="sa-brand-preview-button"
                        type="button"
                        style="background:${esc(color)}"
                      >＋ Agregar widget</button>
                    </div>
                  </div>
                </main>
              </div>
            </div>

            <div class="sa-brand-preview dark">
              <div class="sa-brand-preview-label">Modo oscuro</div>
              <div class="sa-brand-preview-layout">
                <aside class="sa-brand-preview-sidebar">
                  <div class="sa-brand-preview-logo">
                    <img
                      id="saBrandPreviewLogoDark"
                      src="${esc(previewLogoDarkSrc())}"
                      alt="${esc(displayName || 'Logo oscuro')}"
                    >
                  </div>
                  <div id="saBrandPreviewNameDark" class="sa-brand-preview-name">
                    ${esc(displayName)}
                  </div>
                  <div class="sa-brand-preview-nav">
                    <div
                      id="saBrandPreviewActiveDark"
                      class="active"
                      style="background:${esc(hexToRgba(color, .12))}"
                    >Dashboard</div>
                    <div>Fincas</div>
                    <div>Sensores</div>
                    <div>Dispositivos</div>
                  </div>
                </aside>

                <main class="sa-brand-preview-main">
                  <h3>Dashboard</h3>
                  <p>Gestión de activos IoT por finca y zona.</p>
                  <div class="sa-brand-preview-card">
                    <b>Dashboard personalizable</b>
                    <div>
                      <button
                        id="saBrandPreviewButtonDark"
                        class="sa-brand-preview-button"
                        type="button"
                        style="background:${esc(color)}"
                      >＋ Agregar widget</button>
                    </div>
                  </div>
                </main>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    const form = document.getElementById('saBrandForm');
    const picker = document.getElementById('saBrandColorPicker');
    const text = document.getElementById('saBrandColorText');
    const logoInput = document.getElementById('saBrandLogoInput');
    const logoDarkInput = document.getElementById('saBrandLogoDarkInput');

    form?.addEventListener('submit', saveBranding);

    picker?.addEventListener('input', () => {
      if (text) text.value = picker.value.toUpperCase();
      updatePreview();
    });

    text?.addEventListener('input', updatePreview);
    document.getElementById('saBrandDisplayName')?.addEventListener('input', updatePreview);

    logoInput?.addEventListener('change', (event) => {
      onLogoSelected(event).catch((error) => setStatus(error.message, 'error'));
    });

    logoDarkInput?.addEventListener('change', (event) => {
      onLogoDarkSelected(event).catch((error) => setStatus(error.message, 'error'));
    });

    document.getElementById('saBrandRemoveLogo')?.addEventListener('click', removeLogo);
    document.getElementById('saBrandRemoveLogoDark')?.addEventListener('click', removeLogoDark);
    document.getElementById('saBrandReset')?.addEventListener('click', resetBranding);
  }

  async function loadBranding() {
    if (!state.organizationId) {
      throw new Error('No hay una empresa seleccionada.');
    }

    const panel = document.getElementById('tab-branding');
    if (panel) panel.innerHTML = '<div class="empty">Cargando marca…</div>';

    const branding = await api(
      `/admin/organization/branding?organization_id=${encodeURIComponent(state.organizationId)}`
    );

    state.branding = branding;
    state.pendingLogoDataUrl = null;
    state.removeLogo = false;
    state.pendingLogoDarkDataUrl = null;
    state.removeLogoDark = false;

    await loadCustomLogoUrls(branding);
    renderBranding(branding);
  }

  function resetLocalState() {
    state.branding = null;
    state.pendingLogoDataUrl = null;
    state.removeLogo = false;
    state.pendingLogoDarkDataUrl = null;
    state.removeLogoDark = false;
    clearPreviewObjectUrls();
  }

  function wrapOrganizationFunctions() {
    if (state.wrapped || typeof window.openOrganization !== 'function') return;

    const originalOpen = window.openOrganization;

    window.openOrganization = async function (id, ...rest) {
      state.organizationId = String(id || '');
      resetLocalState();

      const result = await originalOpen.call(this, id, ...rest);
      ensureTab();
      return result;
    };

    const originalClose = window.closeOrganizationModal;

    if (typeof originalClose === 'function') {
      window.closeOrganizationModal = function (...args) {
        state.organizationId = null;
        resetLocalState();
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

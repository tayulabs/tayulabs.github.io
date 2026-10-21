(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const DEFAULT_COLOR = '#55C62B';
  const DEFAULT_LOGO_LIGHT = 'imagenes/AmeliaCloud-color.png';
  const DEFAULT_LOGO_DARK = 'imagenes/AmeliaCloud-white.png';

  let logoObjectUrl = null;
  let logoDarkObjectUrl = null;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function normalizeHex(value) {
    const color = String(value || '').trim().toUpperCase();
    return /^#[0-9A-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
  }

  function hexToRgb(hex) {
    const value = normalizeHex(hex).slice(1);
    return {
      r: parseInt(value.slice(0, 2), 16),
      g: parseInt(value.slice(2, 4), 16),
      b: parseInt(value.slice(4, 6), 16),
    };
  }

  function injectDynamicBrandStyles() {
    if (document.getElementById('tayuOrganizationBrandStyles')) return;

    const style = document.createElement('style');
    style.id = 'tayuOrganizationBrandStyles';
    style.textContent = `
      .nav button.active,.nav button:hover{background:rgba(var(--brand-rgb),.12)!important}
      .status{background:rgba(var(--brand-rgb),.14)!important}
      .live-pill,.chart-mode-pill{background:rgba(var(--brand-rgb),.12)!important;border-color:rgba(var(--brand-rgb),.24)!important}
      .nova-dot.online{box-shadow:0 0 0 5px rgba(var(--brand-rgb),.12)!important}
      .nova-relay-card.on{border-color:rgba(var(--brand-rgb),.55)!important;background:rgba(var(--brand-rgb),.08)!important}
      .chart-helper{background:rgba(var(--brand-rgb),.09)!important;border-color:rgba(var(--brand-rgb),.25)!important}
      .login{background:radial-gradient(circle at top left,rgba(var(--brand-rgb),.16),transparent 35%),var(--bg)!important}
      #authBootScreen{background:radial-gradient(circle at 8% 5%,rgba(var(--brand-rgb),.12),rgba(var(--brand-rgb),.035) 24%,transparent 42%),#fff!important}
      .auth-boot-spinner{border-color:rgba(var(--brand-rgb),.18)!important;border-top-color:var(--brand)!important}
    `;
    document.head.appendChild(style);
  }

  async function getKeycloak() {
    for (let i = 0; i < 100; i += 1) {
      const kc = window.__tayuEntryKeycloak || window.__tayuKeycloak;
      if (kc?.authenticated && kc?.token) return kc;
      await sleep(100);
    }
    throw new Error('No hay una sesión activa para cargar la marca.');
  }

  async function authFetch(path, options = {}) {
    const kc = await getKeycloak();
    await kc.updateToken(30);

    const raw = String(path || '').trim();
    const target = /^https?:\/\//i.test(raw) ? raw : API_URL + raw;

    return fetch(target, {
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.headers || {}),
      },
      cache: 'no-store',
    });
  }

  function revokeLogoObjectUrls() {
    if (logoObjectUrl) {
      URL.revokeObjectURL(logoObjectUrl);
      logoObjectUrl = null;
    }
    if (logoDarkObjectUrl) {
      URL.revokeObjectURL(logoDarkObjectUrl);
      logoDarkObjectUrl = null;
    }
  }

  async function fetchLogoObjectUrl(path, label) {
    const response = await authFetch(path);
    if (!response.ok) {
      throw new Error(`No se pudo cargar ${label} (${response.status})`);
    }

    const blob = await response.blob();
    if (blob.type && blob.type !== 'image/png') {
      throw new Error(`${label} no es PNG.`);
    }

    return URL.createObjectURL(blob);
  }

  function applyLightLogoSrc(src, displayName) {
    const sidebar = document.querySelector('.sidebar-logo-color');
    if (sidebar) {
      sidebar.src = src;
      sidebar.alt = displayName;
    }

    document.querySelectorAll('.login-logo-only img').forEach((image) => {
      image.src = src;
      image.alt = displayName;
    });

    const authLogo = document.querySelector('#authBootScreen .auth-boot-logo-stack img');
    if (authLogo) {
      authLogo.src = src;
      authLogo.alt = displayName;
    }
  }

  function applyDarkLogoSrc(src) {
    document.querySelectorAll('.sidebar-logo-white').forEach((image) => {
      image.src = src;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
    });
  }

  async function applyLogo(branding) {
    const displayName = branding?.display_name || 'Organización';
    revokeLogoObjectUrls();

    let lightSrc = DEFAULT_LOGO_LIGHT;
    let darkSrc = DEFAULT_LOGO_DARK;

    if (branding?.has_custom_logo && branding?.logo_url) {
      try {
        logoObjectUrl = await fetchLogoObjectUrl(branding.logo_url, 'el logo principal');
        lightSrc = logoObjectUrl;
      } catch (error) {
        console.warn('TAYULABS organization light logo:', error);
      }
    }

    if (branding?.has_custom_logo_dark && branding?.logo_dark_url) {
      try {
        logoDarkObjectUrl = await fetchLogoObjectUrl(
          branding.logo_dark_url,
          'el logo para modo oscuro'
        );
        darkSrc = logoDarkObjectUrl;
      } catch (error) {
        console.warn('TAYULABS organization dark logo:', error);
        if (logoObjectUrl) darkSrc = logoObjectUrl;
      }
    } else if (branding?.has_custom_logo && logoObjectUrl) {
      // Si la empresa solo cargó un logo personalizado, reutilizamos ese mismo
      // archivo en el rail oscuro en vez de aceptar una URL oscura por defecto
      // que pueda volver a mostrar el logo genérico de Amelia Cloud.
      darkSrc = logoObjectUrl;
    }

    applyLightLogoSrc(lightSrc, displayName);
    applyDarkLogoSrc(darkSrc);

    const stack = document.querySelector('.sidebar-logo-stack');
    if (stack) stack.setAttribute('aria-label', displayName);
  }

  function applyColorAndName(branding) {
    const color = normalizeHex(branding?.primary_color);
    const rgb = hexToRgb(color);
    const displayName = String(branding?.display_name || 'TAYULABS').trim() || 'TAYULABS';

    document.documentElement.style.setProperty('--brand', color);
    document.documentElement.style.setProperty('--brand-rgb', `${rgb.r},${rgb.g},${rgb.b}`);
    document.documentElement.dataset.organizationBrand = color;

    document.title = `${displayName} · IoT Platform`;

    const stack = document.querySelector('.sidebar-logo-stack');
    if (stack) stack.setAttribute('aria-label', displayName);

    window.__tayuBranding = {
      ...branding,
      display_name: displayName,
      primary_color: color,
    };
  }

  function normalizeBranding(source) {
    if (!source || typeof source !== 'object') return null;

    const logoUrl =
      source.logo_url ||
      source.brand_logo_url ||
      source.logo ||
      source.logo_path ||
      null;

    const logoDarkUrl =
      source.logo_dark_url ||
      source.brand_logo_dark_url ||
      source.dark_logo_url ||
      source.logo_dark ||
      null;

    const hasSignal = Boolean(
      source.display_name ||
      source.organization_name ||
      source.name ||
      source.primary_color ||
      source.brand_color ||
      source.brand_primary_color ||
      source.has_custom_logo ||
      source.has_custom_logo_dark ||
      logoUrl ||
      logoDarkUrl
    );

    if (!hasSignal) return null;

    return {
      ...source,
      display_name:
        source.display_name ||
        source.brand_display_name ||
        source.organization_name ||
        source.name ||
        'Organización',
      primary_color:
        source.primary_color ||
        source.brand_color ||
        source.brand_primary_color ||
        DEFAULT_COLOR,
      has_custom_logo:
        source.has_custom_logo !== undefined
          ? Boolean(source.has_custom_logo)
          : Boolean(logoUrl),
      has_custom_logo_dark:
        source.has_custom_logo_dark !== undefined
          ? Boolean(source.has_custom_logo_dark)
          : Boolean(logoDarkUrl),
      logo_url: logoUrl,
      logo_dark_url: logoDarkUrl,
      updated_at: source.updated_at || source.brand_updated_at || null,
    };
  }

  function extractBranding(data) {
    const candidates = [
      data?.branding,
      data?.organization?.branding,
      data?.organization_branding,
      data?.organization,
      data,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeBranding(candidate);
      if (normalized) return normalized;
    }

    return null;
  }

  async function tryBrandingEndpoint(path) {
    try {
      const response = await authFetch(path);
      if (!response.ok) return null;
      const data = await response.json().catch(() => ({}));
      return extractBranding(data);
    } catch (_) {
      return null;
    }
  }

  async function loadBranding() {
    injectDynamicBrandStyles();

    const response = await authFetch('/me');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);

    let branding = extractBranding(data);

    // Compatibilidad con distintas generaciones del backend. Si /me no trae
    // la marca embebida, probamos endpoints de lectura sin modificar nada.
    if (!branding) branding = await tryBrandingEndpoint('/branding');
    if (!branding) branding = await tryBrandingEndpoint('/organization/branding');
    if (!branding) branding = await tryBrandingEndpoint('/me/branding');

    branding ||= {
      display_name: 'TAYULABS',
      primary_color: DEFAULT_COLOR,
      has_custom_logo: false,
      has_custom_logo_dark: false,
      logo_url: null,
      logo_dark_url: null,
      updated_at: null,
    };

    applyColorAndName(branding);
    await applyLogo(branding);

    window.dispatchEvent(new CustomEvent('tayu:branding-applied', {
      detail: window.__tayuBranding,
    }));

    return window.__tayuBranding;
  }

  window.__tayuReloadBranding = loadBranding;

  loadBranding().catch((error) => {
    console.warn('TAYULABS organization branding:', error);
    revokeLogoObjectUrls();
    applyColorAndName({
      display_name: 'TAYULABS',
      primary_color: DEFAULT_COLOR,
      has_custom_logo: false,
      has_custom_logo_dark: false,
      logo_url: null,
      logo_dark_url: null,
      updated_at: null,
    });
    applyLightLogoSrc(DEFAULT_LOGO_LIGHT, 'TAYULABS');
    applyDarkLogoSrc(DEFAULT_LOGO_DARK);
  });
})();

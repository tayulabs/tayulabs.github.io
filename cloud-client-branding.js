(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const DEFAULT_COLOR = '#55C62B';
  const DEFAULT_LOGO_LIGHT = 'imagenes/LOGO-COLOR.jpg';
  const DEFAULT_LOGO_DARK = 'imagenes/LOGO-WHITE.jpg';

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

    return fetch(API_URL + path, {
      ...options,
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(typeof window.__tayuOrganizationHeaders === 'function'
          ? window.__tayuOrganizationHeaders()
          : {}),
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

    if (
      (branding?.has_custom_logo_dark || branding?.has_custom_logo) &&
      branding?.logo_dark_url
    ) {
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
      // Compatibilidad con respuestas antiguas del backend:
      // si existe logo principal pero aún no se anuncia logo_dark_url,
      // reutilizamos el principal también en modo oscuro.
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

  async function loadBranding() {
    injectDynamicBrandStyles();

    const response = await authFetch('/me');
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);

    const branding = data.branding || {
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

(() => {
  'use strict';

  let alarmObserver = null;

  const bellSvg = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path>
      <path d="M10 21h4"></path>
    </svg>`;

  const chevronSvg = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m7 10 5 5 5-5"></path>
    </svg>`;

  function profileFromToken() {
    const parsed = window.__tayuEntryKeycloak?.tokenParsed || {};
    const fullName = String(
      parsed.name ||
      [parsed.given_name, parsed.family_name].filter(Boolean).join(' ') ||
      parsed.preferred_username ||
      (parsed.email ? String(parsed.email).split('@')[0] : '') ||
      'Usuario'
    ).trim();

    return {
      name: fullName,
      email: String(parsed.email || '').trim(),
      role: String(window.__tayuClientAccess?.role || '').trim(),
    };
  }

  function initials(name) {
    const parts = String(name || 'U').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
  }

  function installStyles() {
    if (document.getElementById('tayuTopbarUserStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuTopbarUserStyles';
    style.textContent = `
      .nav button[data-view="alarmas"]{display:none!important}
      .topbar .actions .btn[onclick*="logout"]{display:none!important}
      .tayu-topbar-social{display:flex;align-items:center;gap:10px;margin-left:4px}
      .tayu-topbar-bell{
        position:relative;width:42px;height:42px;display:grid;place-items:center;
        border:0;border-radius:50%;background:transparent;color:var(--text);cursor:pointer;
      }
      .tayu-topbar-bell:hover{background:var(--panel2)}
      .tayu-topbar-bell svg{width:21px;height:21px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .tayu-topbar-badge{
        position:absolute;top:2px;right:1px;min-width:18px;height:18px;padding:0 5px;
        border-radius:999px;background:#ef4444;color:#fff;border:2px solid var(--panel);
        display:grid;place-items:center;font-size:10px;font-weight:900;line-height:1;
      }
      .tayu-topbar-badge[hidden]{display:none!important}
      .tayu-user-wrap{position:relative}
      .tayu-user-trigger{
        display:flex;align-items:center;gap:10px;border:0;background:transparent;color:var(--text);
        padding:5px 10px;border-radius:16px;cursor:pointer;max-width:320px;min-height:44px;flex:0 0 auto;
      }
      .tayu-user-trigger:hover{background:var(--panel2)}
      .tayu-user-avatar{
        width:40px;height:40px;flex:0 0 40px;border-radius:50%;display:grid;place-items:center;
        background:var(--brand);color:#fff;font-size:13px;font-weight:900;letter-spacing:.2px;
        box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 16%,transparent);
      }
      .tayu-user-name{
        max-width:185px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
        font-size:13px;font-weight:850;color:var(--text);text-align:left;
      }
      .tayu-user-chevron{width:15px;height:15px;display:grid;place-items:center;color:var(--muted);transition:.18s}
      .tayu-user-chevron svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
      .tayu-user-wrap.open .tayu-user-chevron{transform:rotate(180deg)}
      .tayu-user-menu{
        position:absolute;right:0;top:calc(100% + 8px);width:260px;z-index:10050;
        background:var(--panel);border:1px solid var(--border);border-radius:17px;padding:10px;
        box-shadow:var(--shadow);display:none;
      }
      .tayu-user-wrap.open .tayu-user-menu{display:block}
      .tayu-user-card{padding:9px 10px 12px;border-bottom:1px solid var(--border);margin-bottom:7px}
      .tayu-user-card b{display:block;font-size:13px;overflow-wrap:anywhere}
      .tayu-user-card small{display:block;color:var(--muted);font-size:11px;margin-top:4px;overflow-wrap:anywhere}
      .tayu-user-role{display:inline-flex;margin-top:8px;padding:4px 8px;border-radius:999px;background:var(--panel2);color:var(--muted);font-size:10px;font-weight:900;text-transform:capitalize}
      .tayu-user-menu-btn{
        width:100%;border:0;background:transparent;color:var(--text);border-radius:11px;
        padding:10px 11px;text-align:left;font-weight:800;cursor:pointer;
      }
      .tayu-user-menu-btn:hover{background:var(--panel2)}
      @media(max-width:760px){
        .topbar .actions{display:flex!important;justify-content:flex-end;align-items:center;gap:8px!important}
        .tayu-user-name{max-width:135px}
      }
      @media(max-width:520px){
        .tayu-user-name,.tayu-user-chevron{display:none}
        .tayu-user-trigger{padding:3px}
        .tayu-topbar-bell{width:40px;height:40px}
        .tayu-user-menu{right:-4px;width:min(260px,calc(100vw - 28px))}
      }
    `;
    document.head.appendChild(style);
  }

  function alarmAllowed() {
    return typeof window.__tayuModuleEnabled === 'function'
      ? window.__tayuModuleEnabled('alarmas')
      : true;
  }

  function syncAlarmVisibility() {
    const button = document.getElementById('tayuTopbarAlarmButton');
    if (!button) return;
    const allowed = alarmAllowed();
    button.hidden = !allowed;
    button.style.display = allowed ? 'grid' : 'none';
  }

  function syncAlarmBadge() {
    const source = document.getElementById('alarmNavBadge');
    const badge = document.getElementById('tayuTopbarAlarmBadge');
    if (!badge) return;

    const raw = String(source?.textContent || '').trim();
    const parsed = Number.parseInt(raw, 10);
    const count = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;

    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count <= 0;
  }

  function watchAlarmBadge() {
    alarmObserver?.disconnect();
    const source = document.getElementById('alarmNavBadge');
    if (!source) {
      setTimeout(watchAlarmBadge, 500);
      return;
    }

    alarmObserver = new MutationObserver(syncAlarmBadge);
    alarmObserver.observe(source, { childList: true, characterData: true, subtree: true, attributes: true });
    syncAlarmBadge();
  }

  function openAlarmas() {
    if (!alarmAllowed()) return;
    const original = document.querySelector('.nav button[data-view="alarmas"]');
    if (original) {
      original.click();
      return;
    }

    document.querySelectorAll('.view.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav button.active').forEach(el => el.classList.remove('active'));
    document.getElementById('alarmas')?.classList.add('active');
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'Alarmas';
  }

  function logout() {
    if (typeof window.logout === 'function') {
      window.logout();
      return;
    }
    window.__tayuEntryKeycloak?.logout?.({ redirectUri: 'https://tayulabs.com/cloud-iot.html' });
  }

  function renderProfile() {
    const profile = profileFromToken();
    const name = document.getElementById('tayuTopbarUserName');
    const avatar = document.getElementById('tayuTopbarUserAvatar');
    const menuName = document.getElementById('tayuTopbarMenuName');
    const email = document.getElementById('tayuTopbarMenuEmail');
    const role = document.getElementById('tayuTopbarMenuRole');

    if (name) name.textContent = profile.name;
    if (avatar) avatar.textContent = initials(profile.name);
    if (menuName) menuName.textContent = profile.name;
    if (email) {
      email.textContent = profile.email || 'Usuario autenticado';
      email.hidden = false;
    }
    if (role) {
      role.textContent = profile.role || 'usuario';
      role.hidden = false;
    }
  }

  function injectTopbar() {
    if (document.getElementById('tayuTopbarSocial')) return true;
    const actions = document.querySelector('.topbar .actions');
    if (!actions) return false;

    const group = document.createElement('div');
    group.id = 'tayuTopbarSocial';
    group.className = 'tayu-topbar-social';
    group.innerHTML = `
      <button id="tayuTopbarAlarmButton" class="tayu-topbar-bell" type="button" aria-label="Abrir alarmas" title="Alarmas">
        ${bellSvg}
        <span id="tayuTopbarAlarmBadge" class="tayu-topbar-badge" hidden>0</span>
      </button>
      <div id="tayuTopbarUserWrap" class="tayu-user-wrap">
        <button id="tayuTopbarUserTrigger" class="tayu-user-trigger" type="button" aria-haspopup="menu" aria-expanded="false">
          <span id="tayuTopbarUserAvatar" class="tayu-user-avatar">U</span>
          <span id="tayuTopbarUserName" class="tayu-user-name">Usuario</span>
          <span class="tayu-user-chevron">${chevronSvg}</span>
        </button>
        <div id="tayuTopbarUserMenu" class="tayu-user-menu" role="menu">
          <div class="tayu-user-card">
            <b id="tayuTopbarMenuName">Usuario</b>
            <small id="tayuTopbarMenuEmail"></small>
            <span id="tayuTopbarMenuRole" class="tayu-user-role"></span>
          </div>
          <button id="tayuTopbarLogout" class="tayu-user-menu-btn" type="button" role="menuitem">Cerrar sesión</button>
        </div>
      </div>`;

    actions.appendChild(group);

    document.getElementById('tayuTopbarAlarmButton')?.addEventListener('click', openAlarmas);
    document.getElementById('tayuTopbarLogout')?.addEventListener('click', logout);

    const wrap = document.getElementById('tayuTopbarUserWrap');
    const trigger = document.getElementById('tayuTopbarUserTrigger');
    trigger?.addEventListener('click', event => {
      event.stopPropagation();
      const open = !wrap?.classList.contains('open');
      wrap?.classList.toggle('open', open);
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    document.addEventListener('click', event => {
      if (!wrap?.contains(event.target)) {
        wrap?.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        wrap?.classList.remove('open');
        trigger?.setAttribute('aria-expanded', 'false');
      }
    });

    renderProfile();
    syncAlarmVisibility();
    syncAlarmBadge();
    watchAlarmBadge();
    return true;
  }

  function boot() {
    installStyles();

    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (injectTopbar() || attempts >= 100) clearInterval(timer);
    }, 100);

    window.addEventListener('tayu:client-access-ready', () => {
      renderProfile();
      syncAlarmVisibility();
    });

    window.addEventListener('tayu:modules-applied', syncAlarmVisibility);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumProductionShell';
  const DESKTOP_MIN = 961;
  let collapseTimer = null;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      :root{
        --tayu-premium-outer:#0d0f0d;
        --tayu-premium-rail:#171917;
        --tayu-premium-rail-ink:#f7f8f6;
        --tayu-premium-rail-hover:#232723;
        --tayu-premium-active:#f7f3df;
        --tayu-premium-active-ink:#151715;
        --tayu-premium-divider:rgba(255,255,255,.16);
      }
      body.dark{
        --tayu-premium-rail:#DDE4DA;
        --tayu-premium-rail-ink:#242A24;
        --tayu-premium-rail-hover:#C7CEC4;
        --tayu-premium-active:#5BC12F;
        --tayu-premium-active-ink:#071006;
        --tayu-premium-divider:#C4CCC1;
      }

      @media (min-width:${DESKTOP_MIN}px){
        html,body{
          height:100%!important;
          min-height:100%!important;
          overflow:hidden!important;
        }
        body{background:var(--tayu-premium-outer)!important;}
        #app.app{
          height:100vh!important;
          min-height:0!important;
          overflow:hidden!important;
          background:var(--tayu-premium-outer)!important;
        }

        .sidebar{
          position:fixed!important;
          left:14px!important;
          top:14px!important;
          bottom:14px!important;
          width:238px!important;
          padding:16px 14px 14px!important;
          background:var(--tayu-premium-rail)!important;
          color:var(--tayu-premium-rail-ink)!important;
          border:0!important;
          border-radius:30px 0 0 30px!important;
          display:flex!important;
          flex-direction:column!important;
          overflow:visible!important;
          z-index:40!important;
          box-shadow:none!important;
          transition:width .28s ease,padding .28s ease,background .22s ease!important;
        }

        body.sidebar-collapsed .sidebar{
          width:94px!important;
          padding:16px 12px 14px!important;
        }

        .main{
          margin:14px 14px 14px 252px!important;
          height:calc(100vh - 28px)!important;
          min-height:0!important;
          padding:24px!important;
          background:var(--bg)!important;
          border-radius:30px!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          overscroll-behavior:contain!important;
          scrollbar-width:none!important;
          -ms-overflow-style:none!important;
          transition:margin-left .28s ease,background .22s ease!important;
        }
        .main::-webkit-scrollbar{
          width:0!important;
          height:0!important;
          display:none!important;
        }
        body.sidebar-collapsed .main{margin-left:108px!important;}

        .brand{
          flex:0 0 auto!important;
          min-height:66px!important;
          margin:0 0 12px!important;
          justify-content:center!important;
          overflow:hidden!important;
        }
        .sidebar-logo-stack{width:154px!important;max-width:100%!important;}
        .sidebar-logo-stack .sidebar-logo{width:154px!important;max-height:66px!important;object-fit:contain!important;}
        body.sidebar-collapsed .sidebar-logo-stack{width:60px!important;}
        body.sidebar-collapsed .sidebar-logo-stack .sidebar-logo{width:60px!important;max-height:60px!important;}

        /* La superficie manda sobre el tema: rail oscuro usa logo oscuro; rail claro usa logo principal. */
        .sidebar-logo-stack .sidebar-logo-color{opacity:0!important;visibility:hidden!important;}
        .sidebar-logo-stack .sidebar-logo-white{opacity:1!important;visibility:visible!important;}
        body.dark .sidebar-logo-stack .sidebar-logo-color{opacity:1!important;visibility:visible!important;}
        body.dark .sidebar-logo-stack .sidebar-logo-white{opacity:0!important;visibility:hidden!important;}

        .sidebar-collapse-btn{
          position:absolute!important;
          right:-19px!important;
          top:25px!important;
          width:38px!important;
          height:38px!important;
          border-radius:50%!important;
          border:1px solid var(--border)!important;
          background:var(--panel)!important;
          color:var(--text)!important;
          box-shadow:0 7px 22px rgba(0,0,0,.18)!important;
          cursor:pointer!important;
          display:grid!important;
          place-items:center!important;
          z-index:60!important;
          font-size:17px!important;
          line-height:1!important;
          transition:transform .24s ease,background .22s ease,color .22s ease!important;
        }
        body.sidebar-collapsed .sidebar-collapse-btn{transform:rotate(180deg)!important;}

        .sidebar .nav{
          flex:1 1 auto!important;
          min-height:0!important;
          width:100%!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          overscroll-behavior:contain!important;
          scrollbar-width:none!important;
          padding:1px 0 6px!important;
        }
        .sidebar .nav::-webkit-scrollbar{display:none!important;}

        .sidebar .nav button{
          min-height:44px!important;
          margin:3px 0!important;
          padding:0 13px!important;
          border-radius:15px!important;
          gap:11px!important;
          background:transparent!important;
          color:var(--tayu-premium-rail-ink)!important;
          font-size:13px!important;
          font-weight:850!important;
          box-shadow:none!important;
          transition:background .15s ease,color .15s ease,width .28s ease,padding .28s ease!important;
        }
        .sidebar .nav button:hover{background:var(--tayu-premium-rail-hover)!important;color:var(--tayu-premium-rail-ink)!important;}
        .sidebar .nav button.active{
          background:var(--tayu-premium-active)!important;
          color:var(--tayu-premium-active-ink)!important;
          box-shadow:0 6px 18px rgba(0,0,0,.13)!important;
        }

        body.sidebar-collapsed .sidebar .nav button{
          width:58px!important;
          height:44px!important;
          min-height:44px!important;
          margin:3px auto!important;
          padding:0!important;
          justify-content:center!important;
        }
        body.sidebar-collapsed .sidebar .nav-label{display:none!important;}
        body:not(.sidebar-collapsed) .sidebar .nav-label{display:inline!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;}

        .sidebar .nav-icon{width:24px!important;height:24px!important;flex:0 0 24px!important;display:grid!important;place-items:center!important;}
        .sidebar .nav-icon .tayu-nav-img{width:20px!important;height:20px!important;max-width:20px!important;max-height:20px!important;}

        /* Rail negro en claro: iconos blancos salvo el activo. */
        body:not(.dark) .sidebar .nav button:not(.active) .tayu-nav-img.icon-color{opacity:0!important;visibility:hidden!important;}
        body:not(.dark) .sidebar .nav button:not(.active) .tayu-nav-img.icon-white{opacity:1!important;visibility:visible!important;filter:none!important;}
        body:not(.dark) .sidebar .nav button.active .tayu-nav-img.icon-color{opacity:1!important;visibility:visible!important;}
        body:not(.dark) .sidebar .nav button.active .tayu-nav-img.icon-white{opacity:0!important;visibility:hidden!important;}

        /* Rail gris verdoso en oscuro: iconos oscuros y activo verde. */
        body.dark .sidebar .nav button .tayu-nav-img.icon-color{opacity:0!important;visibility:hidden!important;}
        body.dark .sidebar .nav button .tayu-nav-img.icon-white{opacity:1!important;visibility:visible!important;filter:brightness(0) saturate(100%)!important;}

        .sidebar .alarm-badge{box-shadow:0 0 0 3px var(--tayu-premium-rail)!important;}
        body.sidebar-collapsed .sidebar .alarm-badge{right:1px!important;top:1px!important;}

        /* GPS/Flotas y cualquier botón inyectado heredan el mismo shell. */
        #gpsGenericNavButton .nav-icon{font-size:17px!important;line-height:1!important;}

        .topbar{position:relative;z-index:5;}
      }
    `;
    document.head.appendChild(style);
  }

  function isDesktop() {
    return window.innerWidth >= DESKTOP_MIN;
  }

  function collapseSidebar() {
    if (!isDesktop()) return;
    if (collapseTimer) {
      clearTimeout(collapseTimer);
      collapseTimer = null;
    }
    document.body.classList.add('sidebar-collapsed');
    const button = document.getElementById('sidebarCollapseBtn');
    if (button) {
      button.setAttribute('aria-label', 'Mostrar nombres del menú');
      button.title = 'Mostrar nombres del menú';
    }
    setTimeout(() => {
      window.shrimpMap?.invalidateSize?.();
      window.cattleSatelliteMap?.invalidateSize?.();
      window.bananaSatelliteMap?.invalidateSize?.();
      window.gpsGenericMap?.invalidateSize?.();
    }, 320);
  }

  function expandSidebarTemporarily() {
    if (!isDesktop()) return;
    if (collapseTimer) clearTimeout(collapseTimer);
    document.body.classList.remove('sidebar-collapsed');
    const button = document.getElementById('sidebarCollapseBtn');
    if (button) {
      button.setAttribute('aria-label', 'Ocultar nombres del menú');
      button.title = 'Ocultar nombres del menú';
    }
    collapseTimer = setTimeout(collapseSidebar, 3000);
    setTimeout(() => {
      window.shrimpMap?.invalidateSize?.();
      window.cattleSatelliteMap?.invalidateSize?.();
      window.bananaSatelliteMap?.invalidateSize?.();
      window.gpsGenericMap?.invalidateSize?.();
    }, 320);
  }

  function togglePremiumSidebar() {
    if (!isDesktop()) {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.toggle('open');
      return;
    }
    if (document.body.classList.contains('sidebar-collapsed')) expandSidebarTemporarily();
    else collapseSidebar();
  }

  function activate() {
    injectStyles();

    /* Sobrescribe únicamente el comportamiento visual del control ya existente. */
    window.toggleSidebarCollapse = togglePremiumSidebar;

    if (isDesktop()) collapseSidebar();

    const nav = document.querySelector('.sidebar .nav');
    if (nav) {
      nav.addEventListener('click', () => {
        if (isDesktop() && !document.body.classList.contains('sidebar-collapsed')) {
          if (collapseTimer) clearTimeout(collapseTimer);
          collapseTimer = setTimeout(collapseSidebar, 3000);
        }
      }, true);
    }

    window.addEventListener('resize', () => {
      if (isDesktop()) collapseSidebar();
      else if (collapseTimer) {
        clearTimeout(collapseTimer);
        collapseTimer = null;
      }
    }, { passive: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', activate, { once: true });
  else activate();
})();

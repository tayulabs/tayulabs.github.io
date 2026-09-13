(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumMobileShell';
  const BACKDROP_ID = 'tayuMobileSidebarBackdrop';
  const MOBILE_MAX = 960;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width:${MOBILE_MAX}px){
        html,body{
          min-height:100%!important;
          background:#0D0F0D!important;
          overflow-x:hidden!important;
        }

        #app.app{
          display:block;
          min-height:100vh!important;
          padding:8px!important;
          background:#0D0F0D!important;
          overflow:visible!important;
        }

        .main{
          position:relative!important;
          z-index:1!important;
          width:auto!important;
          min-height:calc(100vh - 16px)!important;
          margin:0!important;
          padding:16px!important;
          border-radius:26px!important;
          background:var(--bg)!important;
          overflow-x:hidden!important;
          box-shadow:0 16px 42px rgba(0,0,0,.18)!important;
        }

        body.dark .main{
          background:#101310!important;
          border:1px solid #2A302A!important;
        }

        .sidebar{
          position:fixed!important;
          left:8px!important;
          top:8px!important;
          bottom:8px!important;
          width:min(82vw,310px)!important;
          max-width:310px!important;
          padding:18px 14px 14px!important;
          border-radius:26px!important;
          overflow:hidden!important;
          display:flex!important;
          flex-direction:column!important;
          z-index:7001!important;
          box-shadow:18px 0 42px rgba(0,0,0,.24)!important;
          transform:translate3d(calc(-100% - 18px),0,0)!important;
          transition:transform .22s cubic-bezier(.2,.8,.2,1),background .16s ease!important;
          will-change:transform;
        }

        body:not(.dark) .sidebar{
          background:#171917!important;
          color:#F7F8F6!important;
          border:1px solid rgba(255,255,255,.06)!important;
        }

        body.dark .sidebar{
          background:#FFFFFF!important;
          color:#242A24!important;
          border:1px solid rgba(36,42,36,.08)!important;
        }

        .sidebar.open{transform:translate3d(0,0,0)!important;}
        .sidebar-collapse-btn{display:none!important;}

        .sidebar .brand{
          flex:0 0 auto!important;
          min-height:68px!important;
          margin:0 0 12px!important;
          padding:0!important;
          display:flex!important;
          align-items:center!important;
          justify-content:center!important;
          overflow:hidden!important;
        }

        .sidebar-logo-stack{
          width:154px!important;
          max-width:154px!important;
        }

        .sidebar-logo-stack .sidebar-logo{
          width:154px!important;
          max-width:154px!important;
          max-height:66px!important;
          object-fit:contain!important;
        }

        body:not(.dark) .sidebar .sidebar-logo-color{opacity:0!important;visibility:hidden!important;}
        body:not(.dark) .sidebar .sidebar-logo-white{opacity:1!important;visibility:visible!important;}
        body.dark .sidebar .sidebar-logo-color{opacity:1!important;visibility:visible!important;}
        body.dark .sidebar .sidebar-logo-white{opacity:0!important;visibility:hidden!important;}

        .sidebar .nav{
          flex:1 1 auto!important;
          min-height:0!important;
          width:100%!important;
          overflow-y:auto!important;
          overflow-x:hidden!important;
          scrollbar-width:none!important;
          overscroll-behavior:contain!important;
          padding:1px 0 8px!important;
        }

        .sidebar .nav::-webkit-scrollbar{display:none!important;}

        .sidebar .nav button,
        body.sidebar-collapsed .sidebar .nav button,
        body:not(.sidebar-collapsed) .sidebar .nav button{
          width:100%!important;
          min-height:46px!important;
          height:46px!important;
          margin:3px 0!important;
          padding:0 13px!important;
          border:0!important;
          border-radius:15px!important;
          align-items:center!important;
          justify-content:flex-start!important;
          gap:11px!important;
          background:transparent!important;
          font-size:13px!important;
          font-weight:850!important;
          text-align:left!important;
          box-shadow:none!important;
        }

        /* Importante: la visibilidad la decide el frontend base / Cloud Admin. */
        .sidebar .nav button[hidden],
        .sidebar .nav button[data-tayu-module-allowed="0"],
        .sidebar .nav button[style*="display: none"],
        .sidebar .nav button[style*="display:none"]{
          display:none!important;
        }

        body:not(.dark) .sidebar .nav button{color:#F7F8F6!important;}
        body.dark .sidebar .nav button{color:#242A24!important;}

        body:not(.dark) .sidebar .nav button:hover{
          background:#232723!important;
          color:#F7F8F6!important;
        }
        body:not(.dark) .sidebar .nav button.active{
          background:#F7F3DF!important;
          color:#151715!important;
          box-shadow:0 6px 18px rgba(0,0,0,.14)!important;
        }
        body.dark .sidebar .nav button:hover{
          background:#F1F4EF!important;
          color:#242A24!important;
        }
        body.dark .sidebar .nav button.active{
          background:#5BC12F!important;
          color:#071006!important;
          box-shadow:0 6px 18px rgba(91,193,47,.20)!important;
        }

        .sidebar .nav-label,
        body.sidebar-collapsed .sidebar .nav-label,
        body:not(.sidebar-collapsed) .sidebar .nav-label{
          display:inline!important;
          flex:1 1 auto!important;
          min-width:0!important;
          white-space:nowrap!important;
          overflow:hidden!important;
          text-overflow:ellipsis!important;
        }

        .sidebar .nav-icon{
          width:24px!important;
          height:24px!important;
          flex:0 0 24px!important;
          display:grid!important;
          place-items:center!important;
        }

        body:not(.dark) .sidebar .nav button:not(.active) .tayu-nav-img.icon-color{opacity:0!important;visibility:hidden!important;}
        body:not(.dark) .sidebar .nav button:not(.active) .tayu-nav-img.icon-white{opacity:1!important;visibility:visible!important;filter:none!important;}
        body:not(.dark) .sidebar .nav button.active .tayu-nav-img.icon-color{opacity:1!important;visibility:visible!important;}
        body:not(.dark) .sidebar .nav button.active .tayu-nav-img.icon-white{opacity:0!important;visibility:hidden!important;}
        body.dark .sidebar .nav button .tayu-nav-img.icon-color{opacity:0!important;visibility:hidden!important;}
        body.dark .sidebar .nav button .tayu-nav-img.icon-white{opacity:1!important;visibility:visible!important;filter:brightness(0) saturate(100%)!important;}

        body:not(.dark) .sidebar .alarm-badge{margin-left:auto!important;box-shadow:0 0 0 3px #171917!important;}
        body.dark .sidebar .alarm-badge{margin-left:auto!important;box-shadow:0 0 0 3px #FFFFFF!important;}

        .topbar{
          display:flex!important;
          flex-direction:row!important;
          flex-wrap:wrap!important;
          align-items:center!important;
          gap:8px!important;
          margin-bottom:14px!important;
          min-height:44px!important;
        }

        .mobile-menu{
          display:inline-flex!important;
          align-items:center!important;
          justify-content:center!important;
          width:auto!important;
          min-width:92px!important;
          height:42px!important;
          padding:0 13px!important;
          margin:0!important;
          border-radius:14px!important;
          border:1px solid var(--border)!important;
          background:var(--panel2)!important;
          color:var(--text)!important;
          font-weight:850!important;
          order:1!important;
        }

        .topbar .title{
          order:3!important;
          flex:1 0 100%!important;
          min-width:0!important;
          margin-top:3px!important;
        }
        .topbar .title h2{
          font-size:25px!important;
          line-height:1.08!important;
          margin:0!important;
          letter-spacing:-.35px!important;
        }
        .topbar .title p{margin:5px 0 0!important;font-size:13px!important;}

        .topbar .actions{
          order:2!important;
          margin-left:auto!important;
          width:auto!important;
          display:flex!important;
          align-items:center!important;
          gap:8px!important;
        }
        .topbar .actions .btn,
        .topbar .actions .icon-btn{width:auto!important;}

        .card{border-radius:20px!important;}

        #${BACKDROP_ID}{
          position:fixed;
          inset:0;
          z-index:7000;
          background:rgba(0,0,0,.42);
          opacity:0;
          visibility:hidden;
          pointer-events:none;
          transition:opacity .16s ease,visibility 0s linear .16s;
          backdrop-filter:blur(2px);
          -webkit-backdrop-filter:blur(2px);
        }
        #${BACKDROP_ID}.is-open{
          opacity:1;
          visibility:visible;
          pointer-events:auto;
          transition:opacity .16s ease,visibility 0s;
        }
        body.tayu-mobile-menu-open{overflow:hidden!important;}
      }

      @media (max-width:560px){
        #app.app{padding:6px!important;}
        .main{
          min-height:calc(100vh - 12px)!important;
          padding:13px!important;
          border-radius:22px!important;
        }
        .sidebar{
          left:6px!important;
          top:6px!important;
          bottom:6px!important;
          width:min(86vw,300px)!important;
          border-radius:22px!important;
        }
        .topbar .title h2{font-size:23px!important;}
        .mobile-menu{min-width:86px!important;height:40px!important;}
      }
    `;

    document.head.appendChild(style);
  }

  function ensureBackdrop() {
    let backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.remove('open');
    });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function syncOpenState() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = ensureBackdrop();
    const isMobile = window.innerWidth <= MOBILE_MAX;
    const isOpen = Boolean(isMobile && sidebar?.classList.contains('open'));

    backdrop.classList.toggle('is-open', isOpen);
    backdrop.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    document.body.classList.toggle('tayu-mobile-menu-open', isOpen);
  }

  function activate() {
    injectStyles();
    ensureBackdrop();

    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      const observer = new MutationObserver(syncOpenState);
      observer.observe(sidebar, { attributes:true, attributeFilter:['class'] });
    }

    window.addEventListener('resize', syncOpenState, { passive:true });
    syncOpenState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activate, { once:true });
  } else {
    activate();
  }
})();
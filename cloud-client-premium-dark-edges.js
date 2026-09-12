(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumDarkEdgesFix';

  function install() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:961px){
        #app.app::before,
        body.sidebar-collapsed #app.app::before,
        body:not(.sidebar-collapsed) #app.app::before{
          content:"";
          position:fixed;
          left:14px;
          top:14px;
          bottom:14px;
          width:132px!important;
          border-radius:30px;
          background:var(--tayu-premium-rail);
          z-index:10;
          pointer-events:none;
          transition:background .16s ease;
        }

        .sidebar,
        body.sidebar-collapsed .sidebar,
        body:not(.sidebar-collapsed) .sidebar{
          width:94px!important;
          padding:16px 12px 14px!important;
          border-radius:30px!important;
          z-index:40!important;
          box-shadow:none!important;
        }

        .main,
        body.sidebar-collapsed .main,
        body:not(.sidebar-collapsed) .main{
          position:relative!important;
          z-index:30!important;
          margin-left:108px!important;
          padding-left:42px!important;
          border-radius:30px!important;
          transition:background .16s ease!important;
        }

        .sidebar-logo-stack,
        body.sidebar-collapsed .sidebar-logo-stack,
        body:not(.sidebar-collapsed) .sidebar-logo-stack{
          width:60px!important;
          max-width:60px!important;
        }

        .sidebar-logo-stack .sidebar-logo,
        body.sidebar-collapsed .sidebar-logo-stack .sidebar-logo,
        body:not(.sidebar-collapsed) .sidebar-logo-stack .sidebar-logo{
          width:60px!important;
          max-width:60px!important;
          max-height:60px!important;
        }

        .sidebar .nav button,
        body.sidebar-collapsed .sidebar .nav button,
        body:not(.sidebar-collapsed) .sidebar .nav button{
          width:58px!important;
          height:44px!important;
          min-height:44px!important;
          margin:3px auto!important;
          padding:0!important;
          justify-content:center!important;
        }

        .sidebar .nav-label,
        body.sidebar-collapsed .sidebar .nav-label,
        body:not(.sidebar-collapsed) .sidebar .nav-label{
          display:none!important;
        }

        .sidebar-collapse-btn{display:none!important;}

        body:not(.dark) #app.app::before{background:#171917!important;}
        body.dark #app.app::before{background:#DDE4DA!important;}

        body.dark .main{
          background:#101310!important;
          border:1px solid #2A302A!important;
          box-shadow:inset 0 0 0 1px rgba(255,255,255,.012),0 16px 42px rgba(0,0,0,.18)!important;
        }

        body.dark #app.app,
        body.dark{
          background:#0D0F0D!important;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.classList.add('sidebar-collapsed');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();

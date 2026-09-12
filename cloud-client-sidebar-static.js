(() => {
  'use strict';

  const STYLE_ID = 'tayuStaticDesktopSidebar';

  function install() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:961px){
        .sidebar{
          width:94px!important;
          padding:16px 12px 14px!important;
        }

        .main,
        body.sidebar-collapsed .main,
        body:not(.sidebar-collapsed) .main{
          margin-left:108px!important;
        }

        #app.app::before,
        body.sidebar-collapsed #app.app::before,
        body:not(.sidebar-collapsed) #app.app::before{
          width:132px!important;
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
      }
    `;

    document.head.appendChild(style);
    document.body.classList.add('sidebar-collapsed');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();

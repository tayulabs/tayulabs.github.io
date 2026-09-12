(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumDarkEdgesFix';

  function install() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:961px){
        .sidebar{
          border-radius:30px!important;
          box-shadow:0 16px 38px rgba(0,0,0,.14)!important;
        }

        .main{
          margin-left:244px!important;
        }

        body.sidebar-collapsed .main{
          margin-left:100px!important;
        }

        .sidebar-collapse-btn{
          z-index:70!important;
        }

        body.dark .main{
          background:#101310!important;
          border:1px solid #2A302A!important;
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.012),
            0 16px 42px rgba(0,0,0,.18)!important;
        }

        body.dark #app.app{
          background:#0D0F0D!important;
        }

        body.dark{
          background:#0D0F0D!important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once:true });
  } else {
    install();
  }
})();

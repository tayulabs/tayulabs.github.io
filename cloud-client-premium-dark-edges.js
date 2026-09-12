(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumDarkEdgesFix';

  function install() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:961px){
        #app.app::before{
          content:"";
          position:fixed;
          left:14px;
          top:14px;
          bottom:14px;
          width:276px;
          border-radius:30px;
          background:var(--tayu-premium-rail);
          z-index:10;
          pointer-events:none;
          transition:width .16s ease,background .16s ease;
        }
        body.sidebar-collapsed #app.app::before{width:132px;}
        .sidebar{border-radius:30px!important;z-index:40!important;box-shadow:none!important;}
        .main{position:relative!important;z-index:30!important;margin-left:252px!important;padding-left:42px!important;border-radius:30px!important;}
        body.sidebar-collapsed .main{margin-left:108px!important;}
        .sidebar-collapse-btn{display:none!important;}
        body:not(.dark) #app.app::before{background:#171917!important;}
        body.dark #app.app::before{background:#DDE4DA!important;}
        body.dark .main{background:#101310!important;border:1px solid #2A302A!important;box-shadow:inset 0 0 0 1px rgba(255,255,255,.012),0 16px 42px rgba(0,0,0,.18)!important;}
        body.dark #app.app,body.dark{background:#0D0F0D!important;}
      }
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();

(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumDarkEdgesFix';

  function install() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:961px){
        /* Fondo extendido del rail, siempre por detrás de la ventana principal. */
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
          transition:width .28s ease,background .22s ease;
        }

        body.sidebar-collapsed #app.app::before{
          width:132px;
        }

        .sidebar{
          border-radius:30px!important;
          z-index:40!important;
          box-shadow:none!important;
        }

        .main{
          position:relative!important;
          z-index:30!important;
          margin-left:252px!important;
          padding-left:42px!important;
          border-radius:30px!important;
        }

        body.sidebar-collapsed .main{
          margin-left:108px!important;
        }

        /*
         * La flecha es una lengüeta que nace del borde del rail. No usa círculo,
         * borde ni sombra para que visualmente forme una sola pieza con la barra.
         */
        .sidebar-collapse-btn{
          right:-26px!important;
          top:30px!important;
          width:34px!important;
          height:48px!important;
          border:0!important;
          border-radius:0 15px 15px 0!important;
          background:var(--tayu-premium-rail)!important;
          color:var(--tayu-premium-rail-ink)!important;
          box-shadow:none!important;
          transform:none!important;
          font-size:0!important;
          display:grid!important;
          place-items:center!important;
          z-index:70!important;
        }

        .sidebar-collapse-btn > *{
          display:none!important;
        }

        .sidebar-collapse-btn::after{
          content:'‹';
          display:block;
          font-size:24px;
          line-height:1;
          font-weight:700;
          color:var(--tayu-premium-rail-ink);
          transform:none!important;
        }

        body.sidebar-collapsed .sidebar-collapse-btn{
          transform:none!important;
        }

        body.sidebar-collapsed .sidebar-collapse-btn::after{
          content:'›';
        }

        .sidebar-collapse-btn:hover{
          background:var(--tayu-premium-rail-hover)!important;
          color:var(--tayu-premium-rail-ink)!important;
        }

        body:not(.dark) #app.app::before{
          background:#171917!important;
        }

        body.dark #app.app::before{
          background:#DDE4DA!important;
        }

        body.dark .main{
          background:#101310!important;
          border:1px solid #2A302A!important;
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,.012),
            0 16px 42px rgba(0,0,0,.18)!important;
        }

        body.dark #app.app,
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

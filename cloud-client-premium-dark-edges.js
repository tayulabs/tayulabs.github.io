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

        /* La barra real queda encima para que la flecha pueda sobresalir. */
        .sidebar{
          border-radius:30px!important;
          z-index:40!important;
          box-shadow:none!important;
        }

        /* La ventana principal se monta sobre la extensión del rail. */
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

        /* Flecha fuera del logo y por encima del borde del panel principal. */
        .sidebar-collapse-btn{
          right:-34px!important;
          z-index:70!important;
        }

        /* Claro: rail negro extendido por detrás, igual que el concepto premium. */
        body:not(.dark) #app.app::before{
          background:#171917!important;
        }

        /* Oscuro: rail gris verdoso extendido por detrás. */
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

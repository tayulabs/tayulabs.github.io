(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumDarkEdgesFix';

  function install() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:961px){
        /*
         * La barra conserva su ancho útil original. El fondo se prolonga hacia
         * la derecha por detrás del panel principal, igual que en el demo.
         * Así el panel puede mantener su curva izquierda sin que aparezca una
         * cápsula separada ni una franja recta.
         */
        .sidebar{
          border-radius:30px!important;
          z-index:20!important;
          box-shadow:38px 0 0 0 var(--tayu-premium-rail)!important;
        }

        .main{
          position:relative!important;
          z-index:30!important;
          margin-left:252px!important;
          border-radius:30px!important;
        }

        body.sidebar-collapsed .main{
          margin-left:108px!important;
        }

        /* La flecha queda completamente dentro del borde visible del rail. */
        .sidebar-collapse-btn{
          right:0!important;
          z-index:70!important;
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

(() => {
  'use strict';

  const DESKTOP_MIN = 961;

  function bind() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.dataset.tayuDrawerGuard === '1') return;
    nav.dataset.tayuDrawerGuard = '1';

    nav.addEventListener('click', event => {
      if (window.innerWidth < DESKTOP_MIN) return;
      const button = event.target.closest('button');
      if (!button || !nav.contains(button)) return;

      /*
       * La navegación real ya se procesó en los listeners originales de la app.
       * El drawer visual se registró antes que este guard. Detenemos aquí la
       * propagación para que el shell legado no intente redimensionar la UI ni
       * ejecutar invalidateSize() de mapas.
       */
      event.stopImmediatePropagation();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once:true });
  } else {
    bind();
  }
})();

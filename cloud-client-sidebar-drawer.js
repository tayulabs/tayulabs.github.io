(() => {
  'use strict';

  const DESKTOP_MIN = 961;
  const DRAWER_ID = 'tayuSidebarVisualDrawer';
  const STYLE_ID = 'tayuSidebarVisualDrawerStyles';
  let closeTimer = null;
  let closeFinishTimer = null;

  function isDesktop() {
    return window.innerWidth >= DESKTOP_MIN;
  }

  function stripIds(root) {
    if (!root) return root;
    if (root.removeAttribute) root.removeAttribute('id');
    root.querySelectorAll?.('[id]').forEach(node => node.removeAttribute('id'));
    return root;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:${DESKTOP_MIN}px){
        #${DRAWER_ID}{
          position:fixed;
          left:14px;
          top:14px;
          bottom:14px;
          width:238px;
          z-index:115;
          padding:16px 14px 14px;
          border-radius:30px;
          background:var(--tayu-premium-rail,#171917);
          color:var(--tayu-premium-rail-ink,#f7f8f6);
          display:flex;
          flex-direction:column;
          pointer-events:none;
          opacity:0;
          visibility:hidden;
          transform:translate3d(-18px,0,0);
          will-change:transform,opacity;
          contain:layout paint style;
          box-shadow:10px 0 28px rgba(0,0,0,.08);
          transition:
            transform .18s cubic-bezier(.2,.8,.2,1),
            opacity .12s ease,
            visibility 0s linear .18s,
            background .16s ease;
        }
        #${DRAWER_ID}.is-open{
          opacity:1;
          visibility:visible;
          transform:translate3d(0,0,0);
          transition:
            transform .18s cubic-bezier(.2,.8,.2,1),
            opacity .10s ease,
            visibility 0s;
        }
        #${DRAWER_ID} .tayu-drawer-brand{
          flex:0 0 auto;
          min-height:66px;
          margin:0 0 12px;
          display:flex;
          align-items:center;
          justify-content:center;
          overflow:hidden;
        }
        #${DRAWER_ID} .tayu-drawer-brand .sidebar-logo-stack{
          width:154px!important;
          max-width:100%!important;
          position:relative;
          display:block;
        }
        #${DRAWER_ID} .tayu-drawer-brand .sidebar-logo{
          width:154px!important;
          max-height:66px!important;
          object-fit:contain!important;
        }
        #${DRAWER_ID} .sidebar-logo-color{opacity:0!important;visibility:hidden!important;}
        #${DRAWER_ID} .sidebar-logo-white{opacity:1!important;visibility:visible!important;}
        body.dark #${DRAWER_ID} .sidebar-logo-color{opacity:1!important;visibility:visible!important;}
        body.dark #${DRAWER_ID} .sidebar-logo-white{opacity:0!important;visibility:hidden!important;}

        #${DRAWER_ID} .tayu-drawer-nav{
          flex:1 1 auto;
          min-height:0;
          width:100%;
          overflow-y:auto;
          overflow-x:hidden;
          scrollbar-width:none;
          overscroll-behavior:contain;
          padding:1px 0 6px;
        }
        #${DRAWER_ID} .tayu-drawer-nav::-webkit-scrollbar{display:none;}
        #${DRAWER_ID} .tayu-drawer-row{
          width:100%;
          height:44px;
          min-height:44px;
          margin:3px 0;
          padding:0 13px;
          border-radius:15px;
          display:flex;
          align-items:center;
          justify-content:flex-start;
          gap:11px;
          color:var(--tayu-premium-rail-ink,#f7f8f6);
          font-size:13px;
          font-weight:850;
          white-space:nowrap;
          overflow:hidden;
        }
        #${DRAWER_ID} .tayu-drawer-row.is-active{
          background:var(--tayu-premium-active,#f7f3df);
          color:var(--tayu-premium-active-ink,#151715);
          box-shadow:0 6px 18px rgba(0,0,0,.13);
        }
        #${DRAWER_ID} .tayu-drawer-icon{
          width:24px;
          height:24px;
          flex:0 0 24px;
          display:grid;
          place-items:center;
          position:relative;
        }
        #${DRAWER_ID} .tayu-drawer-icon .tayu-nav-img{
          width:20px!important;
          height:20px!important;
          max-width:20px!important;
          max-height:20px!important;
        }
        #${DRAWER_ID} .tayu-drawer-label{
          min-width:0;
          overflow:hidden;
          text-overflow:ellipsis;
        }
        #${DRAWER_ID} .alarm-badge{
          position:static!important;
          margin-left:auto!important;
          transform:none!important;
          box-shadow:none!important;
        }

        body:not(.dark) #${DRAWER_ID} .tayu-drawer-row:not(.is-active) .tayu-nav-img.icon-color{opacity:0!important;visibility:hidden!important;}
        body:not(.dark) #${DRAWER_ID} .tayu-drawer-row:not(.is-active) .tayu-nav-img.icon-white{opacity:1!important;visibility:visible!important;filter:none!important;}
        body:not(.dark) #${DRAWER_ID} .tayu-drawer-row.is-active .tayu-nav-img.icon-color{opacity:1!important;visibility:visible!important;}
        body:not(.dark) #${DRAWER_ID} .tayu-drawer-row.is-active .tayu-nav-img.icon-white{opacity:0!important;visibility:hidden!important;}
        body.dark #${DRAWER_ID} .tayu-nav-img.icon-color{opacity:0!important;visibility:hidden!important;}
        body.dark #${DRAWER_ID} .tayu-nav-img.icon-white{opacity:1!important;visibility:visible!important;filter:brightness(0) saturate(100%)!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function ensureDrawer() {
    let drawer = document.getElementById(DRAWER_ID);
    if (drawer) return drawer;
    drawer = document.createElement('div');
    drawer.id = DRAWER_ID;
    drawer.setAttribute('aria-hidden', 'true');
    drawer.innerHTML = '<div class="tayu-drawer-brand"></div><div class="tayu-drawer-nav"></div>';
    document.body.appendChild(drawer);
    return drawer;
  }

  function sourceButtons() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return [];
    return [...nav.querySelectorAll('button')].filter(button => {
      if (button.hidden) return false;
      const style = getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function syncDrawer() {
    const sidebar = document.querySelector('.sidebar');
    const drawer = ensureDrawer();
    if (!sidebar) return drawer;

    const brandTarget = drawer.querySelector('.tayu-drawer-brand');
    const sourceBrand = sidebar.querySelector('.brand');
    brandTarget.replaceChildren();
    if (sourceBrand) {
      const clone = stripIds(sourceBrand.cloneNode(true));
      clone.classList.remove('brand');
      clone.style.margin = '0';
      clone.style.minHeight = '0';
      clone.style.width = '100%';
      clone.style.justifyContent = 'center';
      brandTarget.appendChild(clone);
    }

    const navTarget = drawer.querySelector('.tayu-drawer-nav');
    navTarget.replaceChildren();

    sourceButtons().forEach(button => {
      const row = document.createElement('div');
      row.className = 'tayu-drawer-row' + (button.classList.contains('active') ? ' is-active' : '');

      const iconSource = button.querySelector('.nav-icon');
      const icon = document.createElement('span');
      icon.className = 'tayu-drawer-icon';
      if (iconSource) {
        const clone = stripIds(iconSource.cloneNode(true));
        icon.innerHTML = clone.innerHTML;
      }

      const label = document.createElement('span');
      label.className = 'tayu-drawer-label';
      label.textContent = button.querySelector('.nav-label')?.textContent?.trim() || button.title || button.dataset.view || '';

      row.append(icon, label);

      const badgeSource = button.querySelector('.alarm-badge');
      if (badgeSource && badgeSource.textContent?.trim() && badgeSource.textContent.trim() !== '0') {
        const badge = stripIds(badgeSource.cloneNode(true));
        row.appendChild(badge);
      }

      navTarget.appendChild(row);
    });

    const sourceNav = sidebar.querySelector('.nav');
    if (sourceNav) navTarget.scrollTop = sourceNav.scrollTop;
    return drawer;
  }

  function closeDrawer() {
    const drawer = document.getElementById(DRAWER_ID);
    if (!drawer) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function openDrawer() {
    if (!isDesktop()) return;
    if (closeTimer) clearTimeout(closeTimer);
    if (closeFinishTimer) clearTimeout(closeFinishTimer);

    const drawer = syncDrawer();
    drawer.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => drawer.classList.add('is-open'));
    });
    closeTimer = setTimeout(closeDrawer, 3000);
  }

  function activate() {
    if (!isDesktop()) return;
    injectStyles();
    ensureDrawer();

    const nav = document.querySelector('.sidebar .nav');
    if (!nav || nav.dataset.tayuDrawerBound === '1') return;
    nav.dataset.tayuDrawerBound = '1';

    nav.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !nav.contains(button) || !isDesktop()) return;
      requestAnimationFrame(openDrawer);
    });

    window.addEventListener('resize', () => {
      if (!isDesktop()) closeDrawer();
    }, { passive:true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activate, { once:true });
  } else {
    activate();
  }
})();

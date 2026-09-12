(() => {
  'use strict';

  const STYLE_ID = 'tayuPremiumDarkEdgesFix';
  const HOVER_TIP_ID = 'tayuSidebarHoverTip';

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

        /* Hover tipo dock: solo transform, sin recalcular el layout. */
        .sidebar .nav button .nav-icon{
          transform:translateZ(0) scale(1);
          transform-origin:center;
          transition:transform .17s cubic-bezier(.2,.8,.2,1),filter .15s ease!important;
          will-change:transform;
        }
        .sidebar .nav button:hover .nav-icon{
          transform:translateZ(0) scale(1.22);
        }
        .sidebar .nav button.active .nav-icon{
          transform:translateZ(0) scale(1.06);
        }
        .sidebar .nav button.active:hover .nav-icon{
          transform:translateZ(0) scale(1.24);
        }

        #${HOVER_TIP_ID}{
          position:fixed;
          left:0;
          top:0;
          z-index:240;
          pointer-events:none;
          padding:8px 11px;
          border-radius:11px;
          background:#171917;
          color:#f7f8f6;
          font-size:12px;
          line-height:1;
          font-weight:850;
          white-space:nowrap;
          box-shadow:0 8px 22px rgba(0,0,0,.18);
          opacity:0;
          visibility:hidden;
          transform:translate3d(-7px,-50%,0) scale(.96);
          transform-origin:left center;
          will-change:transform,opacity;
          transition:opacity .10s ease,transform .16s cubic-bezier(.2,.8,.2,1),visibility 0s linear .16s;
        }
        #${HOVER_TIP_ID}.is-visible{
          opacity:1;
          visibility:visible;
          transform:translate3d(0,-50%,0) scale(1);
          transition:opacity .10s ease,transform .16s cubic-bezier(.2,.8,.2,1),visibility 0s;
        }
        body.dark #${HOVER_TIP_ID}{
          background:#DDE4DA;
          color:#242A24;
          box-shadow:0 8px 22px rgba(0,0,0,.20);
        }
      }
    `;

    document.head.appendChild(style);
    document.body.classList.add('sidebar-collapsed');
    installHoverLabels();
  }

  function getHoverTip() {
    let tip = document.getElementById(HOVER_TIP_ID);
    if (tip) return tip;
    tip = document.createElement('div');
    tip.id = HOVER_TIP_ID;
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tip);
    return tip;
  }

  function labelFor(button) {
    return button.querySelector('.nav-label')?.textContent?.trim()
      || button.title
      || button.dataset.view
      || '';
  }

  function showHoverTip(button) {
    if (window.innerWidth < 961) return;
    const label = labelFor(button);
    if (!label) return;

    const tip = getHoverTip();
    const rect = button.getBoundingClientRect();
    tip.textContent = label;
    tip.style.left = `${Math.round(rect.right + 12)}px`;
    tip.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    tip.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => tip.classList.add('is-visible'));
  }

  function hideHoverTip() {
    const tip = document.getElementById(HOVER_TIP_ID);
    if (!tip) return;
    tip.classList.remove('is-visible');
    tip.setAttribute('aria-hidden', 'true');
  }

  function bindHoverButton(button) {
    if (button.dataset.tayuHoverBound === '1') return;
    button.dataset.tayuHoverBound = '1';
    button.addEventListener('mouseenter', () => showHoverTip(button), { passive:true });
    button.addEventListener('mouseleave', hideHoverTip, { passive:true });
    button.addEventListener('focus', () => showHoverTip(button));
    button.addEventListener('blur', hideHoverTip);
  }

  function installHoverLabels() {
    getHoverTip();
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return;

    nav.querySelectorAll('button').forEach(bindHoverButton);

    if (nav.dataset.tayuHoverObserver !== '1') {
      nav.dataset.tayuHoverObserver = '1';
      const observer = new MutationObserver(() => {
        nav.querySelectorAll('button').forEach(bindHoverButton);
      });
      observer.observe(nav, { childList:true, subtree:true });
    }

    window.addEventListener('resize', hideHoverTip, { passive:true });
    document.addEventListener('scroll', hideHoverTip, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once:true });
  else install();
})();

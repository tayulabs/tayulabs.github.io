(() => {
  'use strict';

  const DESKTOP_MIN = 961;
  const STYLE_ID = 'tayuSidebarHoverStyles';
  const TOOLTIP_ID = 'tayuSidebarHoverTooltip';

  function isDesktop() {
    return window.innerWidth >= DESKTOP_MIN;
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (min-width:${DESKTOP_MIN}px){
        .sidebar .nav button .nav-icon{
          transform:scale(1);
          transform-origin:center;
          transition:transform .16s cubic-bezier(.2,.8,.2,1),filter .16s ease;
          will-change:transform;
        }
        .sidebar .nav button:hover .nav-icon{
          transform:scale(1.22);
        }
        .sidebar .nav button.active .nav-icon{
          transform:scale(1.06);
        }
        .sidebar .nav button.active:hover .nav-icon{
          transform:scale(1.24);
        }
        .sidebar .nav button:hover{
          transform:none!important;
        }

        #${TOOLTIP_ID}{
          position:fixed;
          z-index:220;
          left:0;
          top:0;
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
          transform:translate3d(-6px,-50%,0) scale(.96);
          transform-origin:left center;
          will-change:transform,opacity;
          transition:opacity .12s ease,transform .16s cubic-bezier(.2,.8,.2,1),visibility 0s linear .16s;
        }
        #${TOOLTIP_ID}.is-visible{
          opacity:1;
          visibility:visible;
          transform:translate3d(0,-50%,0) scale(1);
          transition:opacity .10s ease,transform .16s cubic-bezier(.2,.8,.2,1),visibility 0s;
        }
        body.dark #${TOOLTIP_ID}{
          background:#DDE4DA;
          color:#242A24;
          box-shadow:0 8px 22px rgba(0,0,0,.20);
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureTooltip() {
    let tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) return tooltip;
    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.setAttribute('role', 'tooltip');
    tooltip.setAttribute('aria-hidden', 'true');
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function getLabel(button) {
    return button.querySelector('.nav-label')?.textContent?.trim()
      || button.getAttribute('title')
      || button.dataset.view
      || '';
  }

  function showTooltip(button) {
    if (!isDesktop()) return;
    const label = getLabel(button);
    if (!label) return;

    const tooltip = ensureTooltip();
    const rect = button.getBoundingClientRect();
    tooltip.textContent = label;
    tooltip.style.left = `${Math.round(rect.right + 12)}px`;
    tooltip.style.top = `${Math.round(rect.top + rect.height / 2)}px`;
    tooltip.setAttribute('aria-hidden', 'false');

    requestAnimationFrame(() => tooltip.classList.add('is-visible'));
  }

  function hideTooltip() {
    const tooltip = document.getElementById(TOOLTIP_ID);
    if (!tooltip) return;
    tooltip.classList.remove('is-visible');
    tooltip.setAttribute('aria-hidden', 'true');
  }

  function bindButton(button) {
    if (button.dataset.tayuHoverBound === '1') return;
    button.dataset.tayuHoverBound = '1';

    button.addEventListener('mouseenter', () => showTooltip(button), { passive:true });
    button.addEventListener('mouseleave', hideTooltip, { passive:true });
    button.addEventListener('focus', () => showTooltip(button));
    button.addEventListener('blur', hideTooltip);
  }

  function bindVisibleButtons() {
    const nav = document.querySelector('.sidebar .nav');
    if (!nav) return;
    nav.querySelectorAll('button').forEach(bindButton);
  }

  function activate() {
    injectStyles();
    ensureTooltip();
    bindVisibleButtons();

    const nav = document.querySelector('.sidebar .nav');
    if (nav && !nav.dataset.tayuHoverObserver) {
      nav.dataset.tayuHoverObserver = '1';
      const observer = new MutationObserver(bindVisibleButtons);
      observer.observe(nav, { childList:true, subtree:true });
    }

    window.addEventListener('resize', hideTooltip, { passive:true });
    document.addEventListener('scroll', hideTooltip, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activate, { once:true });
  } else {
    activate();
  }
})();

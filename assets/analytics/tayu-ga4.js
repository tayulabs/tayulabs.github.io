/* TAYULABS | Estadísticas GA4 con consentimiento explícito */
(function () {
  "use strict";
  if (window.__tayulabsAnalyticsStarted) return;
  window.__tayulabsAnalyticsStarted = true;
  var MEASUREMENT_ID = "G-9KP5HCMSYM";
  var STORAGE_KEY = "tayulabs_ga4_consent_v1";
  var loaded = false;
  function readChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (err) { return null; }
  }
  function saveChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (err) {}
  }
  function startAnalytics() {
    if (loaded) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, { send_page_view: true });
    var tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(tag);
    document.addEventListener("click", function (event) {
      var a = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!a) return;
      var href = a.getAttribute("href") || "";
      var method = /(?:wa\.me|whatsapp\.com)/i.test(href) ? "whatsapp" :
                   /^mailto:/i.test(href) ? "email" : null;
      if (method && window.gtag) {
        window.gtag("event", "contact_click", { contact_method: method, link_url: a.href });
      }
    }, true);
  }
  function setup() {
    var style = document.createElement("style");
    style.id = "tayu-analytics-consent-css";
    style.textContent = [
      "#tayu-ga-banner{position:fixed;z-index:2147483640;bottom:16px;left:16px;right:16px;max-width:860px;margin:0 auto;background:#162c1c;color:#f2f9ee;padding:16px 20px;font:13px/1.5 Arial,sans-serif;border:1px solid #426347;border-radius:14px;box-shadow:0 10px 38px #0005}",
      "#tayu-ga-banner .tayu-ga-inner{margin:auto;display:flex;gap:18px;align-items:center;justify-content:space-between;flex-wrap:wrap}",
      "#tayu-ga-banner p{margin:0;flex:1 1 365px;font:inherit;color:inherit}",
      "#tayu-ga-banner a{color:#b2f59b;text-decoration:underline}",
      "#tayu-ga-banner .tayu-ga-actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}",
      "#tayu-ga-banner button{border:1px solid #9fb49f;padding:10px 15px;border-radius:8px;background:transparent;color:#fff;font:600 13px Arial,sans-serif;cursor:pointer;min-height:42px}",
      "#tayu-ga-banner button[data-tayu-consent=accept]{background:#5bc12f;border-color:#5bc12f;color:#102611}",
      "#tayu-ga-prefs{font:12px/1.4 Arial,sans-serif!important;background:transparent!important;border:0!important;box-shadow:none!important;color:inherit!important;opacity:.75;cursor:pointer;padding:8px!important;display:inline-block!important;text-transform:none!important}",
      "#tayu-ga-prefs:hover{opacity:1;text-decoration:underline}",
      "@media(max-width:600px){#tayu-ga-banner{bottom:9px;left:9px;right:9px;padding:14px 15px}#tayu-ga-banner .tayu-ga-actions{width:100%}#tayu-ga-banner .tayu-ga-actions button{flex:1 1 145px}}"
    ].join("\n");
    document.head.appendChild(style);
    var banner = document.createElement("div");
    banner.id = "tayu-ga-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Preferencias de estadísticas");
    banner.innerHTML = '<div class="tayu-ga-inner"><p>¿Nos ayudas a mejorar TAYULABS? Con tu permiso, usamos Google Analytics para conocer las visitas y mejorar nuestros contenidos. También puedes continuar sin activar estas estadísticas. <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Información de privacidad de Google</a>.</p><div class="tayu-ga-actions"><button type="button" data-tayu-consent="reject">Continuar sin estadísticas</button><button type="button" data-tayu-consent="accept">Aceptar estadísticas</button></div></div>';
    banner.hidden = true;
    // La hoja principal del sitio puede establecer estilos genéricos para div: asegurar el ocultamiento.
    banner.style.display = "none";
    document.body.appendChild(banner);
    function showBanner() {
      banner.hidden = false;
      banner.style.display = "block";
    }
    function hideBanner() {
      banner.hidden = true;
      banner.style.display = "none";
    }
    banner.querySelector('[data-tayu-consent="accept"]').addEventListener("click", function () {
      saveChoice("accepted");
      hideBanner();
      startAnalytics();
    });
    banner.querySelector('[data-tayu-consent="reject"]').addEventListener("click", function () {
      saveChoice("declined");
      hideBanner();
      if (loaded) {
        if (window.gtag) window.gtag("consent", "update", { analytics_storage: "denied" });
        window.location.reload();
      }
    });
    var preferences = document.createElement("button");
    preferences.type = "button";
    preferences.id = "tayu-ga-prefs";
    preferences.textContent = "Preferencias de estadísticas";
    preferences.addEventListener("click", showBanner);
    var footer = document.querySelector("footer, section.footer3, section[id^='footer']");
    if (footer) footer.appendChild(preferences);
    else {
      preferences.style.cssText += ";position:fixed;bottom:8px;left:8px;z-index:2147483630;background:#fff!important;color:#284a18!important;border-radius:7px;";
      document.body.appendChild(preferences);
    }
    if (readChoice() === "accepted") startAnalytics();
    else if (readChoice() !== "declined") showBanner();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
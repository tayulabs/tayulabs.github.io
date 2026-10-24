(() => {
  'use strict';

  const MODULE = 'satellite';
  let map = null;
  let drawing = false;
  let points = [];
  let markers = [];
  let line = null;
  let polygon = null;
  let selectedFieldId = null;
  let chart = null;
  let searchMarker = null;
  let currentSites = [];
  let currentFields = [];
  let fieldOverviewLayers = new Map();
  let fieldOverviewStates = new Map();
  let showArchivedFields = false;
  let ndviOverlay = null;
  let farmNdviOverlays = new Map();
  let compareBeforeOverlay = null;
  let compareAfterOverlay = null;
  let comparePositionPct = 50;
  let comparePeriods = [];
  let compareBeforeIndex = 0;
  let compareAfterIndex = 1;
  let fieldsRequestSeq = 0;
  let selectedFieldData = null;
  let datePeriods = [];
  let calendarObservations = [];
  let datePeriodIndex = -1;
  let calendarCursor = new Date();
  let sceneRows = [];
  let sceneSelectedIndex = -1;
  let scenesError = '';
  let scenesLoading = false;
  let sceneRequestSeq = 0;
  let sceneRasterOverlay = null;
  let sceneRasterSeq = 0;
  let sceneRasterLayer = '';
  let sceneRasterBusy = false;
  let sceneRasterError = '';
  let sceneContrastMode = 'fixed';
  let sceneRasterColorRange = null;
  let sceneRasterLocalMask = null;
  let scenePixelSample = null;
  let scenePixelPopup = null;


  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));

  function enabled() {
    if (typeof window.__tayuModuleEnabled === 'function') {
      return window.__tayuModuleEnabled(MODULE) === true;
    }
    const rows = Array.isArray(window.__tayuOrganizationModules) ? window.__tayuOrganizationModules : [];
    return rows.some(row => String(row?.module || '').toLowerCase() === MODULE && Boolean(row?.enabled));
  }

  function getApi(path) {
    if (!window.__tayuApi) throw new Error('API de Amelia no disponible');
    return window.__tayuApi(path);
  }

  function postApi(path, body) {
    if (!window.__tayuApiPost) throw new Error('API POST de Amelia no disponible');
    return window.__tayuApiPost(path, body);
  }

  function styles() {
    if (document.getElementById('tayu-satellite-styles')) return;
    const el = document.createElement('style');
    el.id = 'tayu-satellite-styles';
    el.textContent =
      '#satellite .sat-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(320px,.8fr);gap:18px;margin-top:18px}' +
      '#satellite .sat-map{height:520px;border-radius:20px;overflow:hidden;background:var(--panel2)}' +
      '#satellite .sat-search{margin-bottom:12px;position:relative}' +
      '#satellite .sat-search-box{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px}' +
      '#satellite .sat-search-box input{min-width:0}' +
      '#satellite .sat-search-results{display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:1200;background:var(--panel);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);overflow:hidden}' +
      '#satellite .sat-search-results.open{display:block}' +
      '#satellite .sat-search-result{padding:11px 13px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;line-height:1.35}' +
      '#satellite .sat-search-result:last-child{border-bottom:0}' +
      '#satellite .sat-search-result:hover{background:var(--panel2)}' +
      '#satellite .sat-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;align-items:center}' +
      '#satellite .sat-toolbar select{min-width:220px;max-width:320px}' +
      '#satellite .sat-legend{display:none;align-items:center;gap:10px;flex-wrap:wrap;margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);font-size:12px;font-weight:800}' +
      '#satellite .sat-legend.open{display:flex}' +
      '#satellite .sat-legend-item{display:inline-flex;align-items:center;gap:5px}' +
      '#satellite .sat-legend-swatch{width:12px;height:12px;border-radius:3px;display:inline-block}' +
      '#satellite .sat-compare-panel{display:none;margin-top:10px;padding:12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2)}' +
      '#satellite .sat-compare-panel.open{display:block}' +
      '#satellite .sat-compare-head{display:grid;grid-template-columns:1fr 1fr auto;gap:10px;align-items:end}' +
      '#satellite .sat-compare-period{padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel)}' +
      '#satellite .sat-compare-period span{display:block;font-size:11px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}' +
      '#satellite .sat-compare-period b{display:block;margin-top:4px;font-size:14px;line-height:1.25}' +
      '#satellite .sat-compare-period small{display:block;margin-top:3px;color:var(--muted);font-weight:750}' +
      '#satellite .sat-compare-timeline{position:relative;margin:14px 12px 2px;height:58px}' +
      '#satellite .sat-compare-track{position:absolute;left:0;right:0;top:16px;height:6px;border-radius:999px;background:rgba(148,163,184,.28)}' +
      '#satellite .sat-compare-selected{position:absolute;top:16px;height:6px;border-radius:999px;background:var(--brand);pointer-events:none}' +
      '#satellite .sat-compare-range{position:absolute;left:0;top:0;width:100%;height:38px;margin:0;background:transparent;appearance:none;-webkit-appearance:none;pointer-events:none}' +
      '#satellite .sat-compare-range::-webkit-slider-runnable-track{height:6px;background:transparent}' +
      '#satellite .sat-compare-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;border-radius:50%;margin-top:-8px;background:#fff;border:4px solid var(--brand);box-shadow:0 2px 8px rgba(0,0,0,.22);pointer-events:auto;cursor:ew-resize}' +
      '#satellite .sat-compare-range::-moz-range-track{height:6px;background:transparent}' +
      '#satellite .sat-compare-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#fff;border:4px solid var(--brand);box-shadow:0 2px 8px rgba(0,0,0,.22);pointer-events:auto;cursor:ew-resize}' +
      '#satellite .sat-compare-range.before{z-index:3}' +
      '#satellite .sat-compare-range.after{z-index:4}' +
      '#satellite .sat-compare-ticks{position:absolute;left:0;right:0;top:13px;display:flex;justify-content:space-between;pointer-events:none}' +
      '#satellite .sat-compare-tick{width:12px;height:12px;border-radius:50%;background:var(--panel);border:2px solid rgba(148,163,184,.7)}' +
      '#satellite .sat-compare-axis{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;font-size:11px;color:var(--muted);font-weight:750}' +
      '#satellite .sat-compare-label{position:absolute;top:14px;z-index:900;background:rgba(255,255,255,.9);color:#17310f;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;pointer-events:none;box-shadow:0 4px 16px rgba(0,0,0,.14)}' +
      '#satellite .sat-compare-label.before{left:14px}' +
      '#satellite .sat-compare-label.after{right:14px}' +
      '#satellite .sat-compare-control{display:none;position:absolute;left:50%;bottom:30px;transform:translateX(-50%);z-index:930;width:min(360px,calc(100% - 48px));padding:8px 12px 9px;border-radius:16px;background:rgba(255,255,255,.94);border:1px solid rgba(40,74,24,.18);box-shadow:0 8px 24px rgba(0,0,0,.24);backdrop-filter:blur(8px)}' +
      '#satellite .sat-compare-control.open{display:block}' +
      '#satellite .sat-compare-control-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:5px;color:#284a18;font-size:10px;font-weight:1000;letter-spacing:.06em}' +
      '#satellite .sat-compare-control input{display:block;width:100%;height:20px;margin:0;accent-color:#284a18;cursor:ew-resize}' +
      '#satellite .sat-map-wrap{position:relative}' +
      '#satellite .sat-form{display:grid;grid-template-columns:1fr 1fr;gap:12px}' +
      '#satellite .sat-form .full{grid-column:1/-1}' +
      '#satellite .sat-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:18px}' +
      '#satellite .sat-kpi{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:var(--shadow)}' +
      '#satellite .sat-kpi span{display:block;color:var(--muted);font-size:12px;font-weight:800}' +
      '#satellite .sat-kpi b{display:block;font-size:26px;margin-top:8px}' +
      '#satellite .sat-kpi small{display:block;margin-top:4px;line-height:1.35}' +
      '#satellite .sat-insights{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}' +
      '#satellite .sat-insight{background:var(--panel);border:1px solid var(--border);border-radius:18px;padding:16px;box-shadow:var(--shadow)}' +
      '#satellite .sat-insight span{display:block;color:var(--muted);font-size:12px;font-weight:800}' +
      '#satellite .sat-insight b{display:block;margin-top:6px;font-size:18px}' +
      '#satellite .sat-insight small{display:block;margin-top:6px;color:var(--muted);line-height:1.4}' +
      '#satellite .sat-list{display:flex;flex-direction:column;gap:10px;max-height:310px;overflow:auto}' +
      '#satellite .sat-field{padding:13px;border:1px solid var(--border);border-radius:16px;background:var(--panel2);cursor:pointer}' +
      '#satellite .sat-field.active{outline:2px solid var(--brand)}' +
      '#satellite .sat-field-row{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}' +
      '#satellite .sat-field-check{margin-top:3px;width:17px;height:17px;accent-color:var(--brand)}' +
      '#satellite .sat-batch-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}' +
      '#satellite .sat-map-lot-label{background:rgba(255,255,255,.92);border:0;box-shadow:0 3px 10px rgba(0,0,0,.16);color:#284a18;font-weight:900;border-radius:999px;padding:3px 7px}' +
      '#satellite .sat-farm-legend{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding:10px 12px;border:1px solid var(--border);border-radius:14px;background:var(--panel2);font-size:12px;font-weight:800;align-items:center}' +
      '#satellite .sat-farm-legend .item{display:inline-flex;align-items:center;gap:5px}' +
      '#satellite .sat-farm-legend .dot{width:11px;height:11px;border-radius:50%;display:inline-block}' +
      '#satellite .sat-field-status{display:inline-flex;margin-top:5px;padding:4px 8px;border-radius:999px;font-size:11px;font-weight:900;background:rgba(148,163,184,.16);color:var(--muted)}' +
      '#satellite .sat-field-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}' +
      '#satellite .sat-field-menu-wrap{position:relative}' +
      '#satellite .sat-field-menu-btn{border:0;background:transparent;color:var(--muted);font-size:20px;line-height:1;cursor:pointer;padding:0 4px}' +
      '#satellite .sat-field-menu{display:none;position:absolute;right:0;top:26px;z-index:50;min-width:180px;background:var(--panel);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}' +
      '#satellite .sat-field-menu.open{display:block}' +
      '#satellite .sat-field-menu button{display:block;width:100%;text-align:left;border:0;background:transparent;padding:10px 12px;cursor:pointer;color:var(--text);font-weight:750}' +
      '#satellite .sat-field-menu button:hover{background:var(--panel2)}' +
      '#satellite .sat-field-menu button.danger{color:var(--danger)}' +
      '#satellite .sat-module-title .module-header{align-items:center}' +
      '#satellite .sat-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:14px}' +
      '#satellite .sat-panel-head h3{margin:0;font-size:20px}' +
      '#satellite .sat-panel-head p{margin:4px 0 0;color:var(--muted);font-size:12px;line-height:1.4}' +
      '#satellite .sat-lot-site{margin-bottom:12px}' +
      '#satellite .sat-lot-summary{display:none;padding:12px 0 2px}' +
      '#satellite .sat-lot-summary.open{display:block}' +
      '#satellite .sat-lot-summary-top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}' +
      '#satellite .sat-lot-summary h4{margin:0;font-size:18px;line-height:1.2}' +
      '#satellite .sat-lot-summary-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}' +
      '#satellite .sat-lot-chip{display:inline-flex;align-items:center;padding:5px 8px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);font-size:11px;font-weight:850;color:var(--muted)}' +
      '#satellite .sat-create-form{display:none;padding-top:12px;border-top:1px solid var(--border)}' +
      '#satellite .sat-create-form.open{display:grid}' +
      '#satellite .sat-empty-lot{padding:8px 0 2px;color:var(--muted);font-size:12px;line-height:1.45}' +
      '#satellite .sat-lot-card .sat-form{gap:10px}' +
      '#satellite #satSaveField{justify-self:start;width:auto;min-height:36px;padding:7px 12px;border:0;background:transparent;color:var(--muted);box-shadow:none}' +
      '#satellite #satSaveField:not(:disabled){color:var(--brand);background:rgba(85,198,43,.08)}' +
      '#satellite .sat-action-section{margin-top:10px;padding-top:12px;border-top:1px solid var(--border)}' +
      '#satellite .sat-action-label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}' +
      '#satellite .sat-action-label b{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}' +
      '#satellite .sat-action-label small{color:var(--muted);font-size:10px}' +
      '#satellite .sat-lot-actions{display:flex;gap:8px;align-items:center}' +
      '#satellite .sat-lot-actions .btn{min-height:40px;border-radius:11px;font-weight:900;padding:8px 13px}' +
      '#satellite .sat-lot-actions #satRefresh{flex:0 0 auto;background:transparent}' +
      '#satellite .sat-lot-actions #satSync{flex:1 1 auto;box-shadow:none}' +
      '#satellite .sat-list-tabs{display:grid;grid-template-columns:1fr 1fr;gap:3px;margin:0;padding:3px;border:1px solid var(--border);border-radius:12px;background:var(--panel2)}' +
      '#satellite .sat-list-tabs .btn{border:0!important;border-radius:9px;min-height:36px;background:transparent;box-shadow:none;padding:7px 10px}' +
      '#satellite .sat-list-tabs .active{background:var(--panel);color:var(--text);box-shadow:0 1px 5px rgba(15,23,42,.08)}' +
      '#satellite .sat-batch-shell{display:flex;flex-direction:column;margin-top:10px;padding:0;background:transparent}' +
      '#satellite .sat-batch-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 2px 8px}' +
      '#satellite .sat-batch-head b{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}' +
      '#satellite .sat-batch-head-right{display:flex;align-items:center;gap:8px}' +
      '#satellite .sat-batch-count{font-size:11px;font-weight:850;color:var(--muted);white-space:nowrap}' +
      '#satellite .sat-link-action{border:0!important;background:transparent!important;box-shadow:none!important;padding:3px 0!important;min-height:auto!important;color:var(--brand)!important;font-size:11px!important;font-weight:900!important;cursor:pointer}' +
      '#satellite .sat-link-action:disabled{opacity:.45;cursor:not-allowed}' +
      '#satellite .sat-batch-actions{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,.85fr);gap:8px;margin:0}' +
      '#satellite .sat-batch-actions .btn{min-height:40px;border-radius:11px;padding:8px 10px;white-space:nowrap;line-height:1.2;font-size:12px}' +
      '#satellite .sat-batch-actions #satBatchSync{grid-column:auto;grid-row:auto}' +
      '#satellite .sat-batch-actions #satFarmNdviShow{background:transparent}' +
      '#satellite .sat-batch-actions #satFarmNdviHide{grid-column:1/-1;justify-self:start;min-height:auto;border:0;background:transparent;padding:4px 0;color:var(--muted);font-size:11px;box-shadow:none}' +
      '#satellite .sat-field-list-label{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:14px 2px 8px;padding-top:12px;border-top:1px solid var(--border)}' +
      '#satellite .sat-field-list-label b{font-size:13px}' +
      '#satellite .sat-field-list-label small{font-size:11px;color:var(--muted)}' +
      '#satellite .sat-toolbar{display:flex;gap:18px;flex-wrap:wrap;margin-top:12px;align-items:flex-start}' +
      '#satellite .sat-tool-group{display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:0;background:transparent;border:0}' +
      '#satellite .sat-tool-group-label{padding:0 3px 0 0;font-size:10px;font-weight:950;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}' +
      '#satellite .sat-tool-group .btn{min-height:36px;border-radius:10px;padding:7px 12px;box-shadow:none}' +
      '#satellite .sat-status{margin-top:9px;padding:7px 0 0;border-top:1px solid var(--border);border-radius:0;background:transparent;font-size:11px;color:var(--muted);font-weight:750;line-height:1.35}' +
      '#satellite .sat-status.ok{color:var(--brand)}#satellite .sat-status.error{color:var(--danger)}' +
      '#satellite .sat-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:850}' +
      '#satellite .sat-badge.good{background:rgba(85,198,43,.14);color:var(--brand)}' +
      '#satellite .sat-badge.limited{background:rgba(245,158,11,.16);color:#d97706}' +
      '#satellite .sat-badge.poor,#satellite .sat-badge.no_data{background:rgba(239,68,68,.13);color:var(--danger)}' +
      '#satellite .sat-chart{height:270px}#satellite .sat-table-wrap{overflow:auto}' +
      '#satellite .sat-date-nav{position:relative;display:grid;grid-template-columns:auto minmax(210px,1fr) auto minmax(180px,auto);gap:8px;align-items:stretch;margin:0 0 12px}' +
      '#satellite .sat-date-step,#satellite .sat-date-current{border:1px solid var(--border);background:var(--panel);color:var(--text);border-radius:14px;cursor:pointer;min-height:48px}' +
      '#satellite .sat-date-step{width:48px;font-size:26px;font-weight:900;line-height:1}' +
      '#satellite .sat-date-step:disabled,#satellite .sat-date-current:disabled{opacity:.45;cursor:not-allowed}' +
      '#satellite .sat-date-current{text-align:left;padding:7px 12px;display:flex;flex-direction:column;justify-content:center}' +
      '#satellite .sat-date-current span{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}' +
      '#satellite .sat-date-current b{font-size:14px;margin-top:2px;color:var(--text)}' +
      '#satellite .sat-date-current small{font-size:10px;margin-top:2px;color:var(--muted);font-weight:750}' +
      '#satellite .sat-date-quality{display:flex;align-items:center;justify-content:center;border:1px solid var(--border);background:var(--panel2);border-radius:14px;padding:8px 12px;font-size:12px;font-weight:900;text-align:center}' +
      '#satellite .sat-date-quality.good{background:rgba(85,198,43,.12);color:#2f7d16;border-color:rgba(85,198,43,.28)}' +
      '#satellite .sat-date-quality.limited{background:rgba(245,158,11,.12);color:#b45309;border-color:rgba(245,158,11,.3)}' +
      '#satellite .sat-date-quality.poor,#satellite .sat-date-quality.no_data{background:rgba(239,68,68,.1);color:#b42318;border-color:rgba(239,68,68,.22)}' +
      '#satellite .sat-calendar-popover{display:none;position:absolute;z-index:1250;left:56px;top:calc(100% + 8px);width:min(390px,calc(100vw - 48px));padding:14px;border:1px solid var(--border);border-radius:18px;background:var(--panel);box-shadow:0 18px 44px rgba(15,23,42,.22)}' +
      '#satellite .sat-calendar-popover.open{display:block}' +
      '#satellite .sat-calendar-head{display:grid;grid-template-columns:38px 1fr 38px;gap:8px;align-items:center;margin-bottom:10px}' +
      '#satellite .sat-calendar-head button{height:36px;border:1px solid var(--border);border-radius:11px;background:var(--panel2);color:var(--text);font-size:20px;cursor:pointer}' +
      '#satellite .sat-calendar-head b{text-align:center;text-transform:capitalize}' +
      '#satellite .sat-calendar-weekdays,#satellite .sat-calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:5px}' +
      '#satellite .sat-calendar-weekdays span{text-align:center;font-size:10px;font-weight:900;color:var(--muted);text-transform:uppercase}' +
      '#satellite .sat-calendar-grid{margin-top:6px}' +
      '#satellite .sat-calendar-day{position:relative;min-height:42px;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--text);font-weight:850;cursor:pointer}' +
      '#satellite .sat-calendar-day:hover:not(:disabled){background:var(--panel2);border-color:var(--border)}' +
      '#satellite .sat-calendar-day:disabled{cursor:not-allowed;color:rgba(100,116,139,.38)}' +
      '#satellite .sat-calendar-day.outside{opacity:.3}' +
      '#satellite .sat-calendar-day.selected{background:var(--brand);color:#fff;border-color:var(--brand)}' +
      '#satellite .sat-calendar-day .mark{position:absolute;left:50%;bottom:3px;transform:translateX(-50%);font-size:8px;line-height:1}' +
      '#satellite .sat-calendar-day.good .mark{color:#55c62b}' +
      '#satellite .sat-calendar-day.limited .mark{color:#d97706}' +
      '#satellite .sat-calendar-day.poor .mark,#satellite .sat-calendar-day.no_data .mark{color:#b42318;font-size:10px}' +
      '#satellite .sat-calendar-day.selected .mark{color:#fff}' +
      '#satellite .sat-calendar-legend{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:10px;color:var(--muted);font-weight:800}' +
      '#satellite .sat-calendar-legend span{display:inline-flex;align-items:center;gap:4px}' +
      '#satellite .sat-calendar-dot{width:8px;height:8px;border-radius:50%;display:inline-block}' +
      '#satellite .sat-calendar-dot.good{background:#55c62b}.sat-calendar-dot.limited{background:#d97706}.sat-calendar-dot.poor{background:#b42318}' +

      '#satellite .sat-scenes-card{margin:10px 0 12px;padding:12px 14px;border:1px solid var(--border);border-radius:15px;background:var(--panel)}' +
      '#satellite .sat-scenes-header{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px}' +
      '#satellite .sat-scenes-header strong{font-size:13px}' +
      '#satellite .sat-scenes-header small{color:var(--muted);font-size:11px;font-weight:750}' +
      '#satellite .sat-scenes-reload{border:1px solid var(--border);background:var(--panel2);border-radius:9px;color:var(--text);font-weight:800;padding:6px 9px;cursor:pointer;font-size:11px}' +
      '#satellite .sat-scenes-reload:disabled{opacity:.45;cursor:not-allowed}' +
      '#satellite .sat-scene-raster-toolbar{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:10px 0 0;padding:10px 12px;border-radius:11px;background:var(--panel2);border:1px solid var(--border)}' +
      '#satellite .sat-scene-raster-toolbar label{font-size:11px;font-weight:850;color:var(--muted)}' +
      '#satellite .sat-scene-raster-toolbar select{max-width:175px;min-width:125px;padding:7px;border:1px solid var(--border);border-radius:8px;background:var(--panel);color:var(--text);font-size:12px}' +
      '#satellite .sat-scene-raster-toolbar button{padding:7px 10px;border-radius:9px;border:1px solid var(--border);background:var(--panel);color:var(--text);font-size:11px;font-weight:850;cursor:pointer}' +
      '#satellite .sat-scene-raster-title{font-size:11px;line-height:1.4;flex-basis:100%;color:var(--muted)}' +
      '#satellite .sat-scene-raster-legend{display:none;padding:8px 10px;margin:8px 0 0;border-radius:10px;background:var(--panel2);border:1px solid var(--border)}' +
      '#satellite .sat-scene-raster-legend.open{display:block}' +
      '#satellite .sat-scene-raster-gradient{height:12px;border-radius:5px;background:linear-gradient(to right,#c62828,#ef6c00,#fdd835,#7cb342,#1b5e20)}' +
      '#satellite .sat-scene-raster-gradient.local{background:linear-gradient(to right,#2b5cb4,#40a2c9,#9ed6b7,#5aa973,#196345)}' +
      '#satellite .sat-scene-raster-gradient.radar{background:linear-gradient(to right,#22245a,#3171b5,#47c1db,#f1da68,#de5c2e)}' +
      '#satellite .sat-scene-raster-gradient.local.radar{background:linear-gradient(to right,#2b5cb4,#40a2c9,#9ed6b7,#5aa973,#196345)}' +
      '#satellite .sat-scene-raster-ticks{display:flex;justify-content:space-between;gap:3px;font-size:10px;color:var(--muted);margin-top:5px}' +
      '#satellite .sat-scene-raster-guide{margin-top:7px;font-size:11px;line-height:1.45;color:var(--muted)}' +
      '#satellite .sat-scene-raster-detail{font-size:11px;color:var(--muted);line-height:1.5;flex-basis:100%}' +
      '#satellite .sat-scenes-list{display:flex;gap:7px;overflow-x:auto;padding:3px 1px 9px}' +
      '#satellite .sat-scene-item{white-space:nowrap;border:1px solid var(--border);border-radius:10px;background:var(--panel2);color:var(--text);font-size:11px;font-weight:800;padding:8px 10px;cursor:pointer}' +
      '#satellite .sat-scene-item.active{outline:2px solid var(--brand);background:var(--panel)}' +
      '#satellite .sat-scene-item.radar{border-left:3px solid #3974c6}' +
      '#satellite .sat-scene-item.optical{border-left:3px solid #55a630}' +
      '#satellite .sat-scene-item.no_data{border-left:3px solid #bd5a38}' +
      '#satellite .sat-scene-details{padding:10px;border-radius:11px;background:var(--panel2);font-size:12px;line-height:1.5}' +
      '#satellite .sat-scene-values{display:flex;flex-wrap:wrap;column-gap:17px;row-gap:5px;margin-top:6px}' +
      '#satellite .sat-scene-values span{color:var(--muted)}' +
      '#satellite .sat-scene-values b{color:var(--text)}' +
      '#satellite .sat-scene-notice{font-size:11px;line-height:1.4;color:var(--muted);margin:7px 1px 0}' +
      '#satellite .sat-scene-flags{position:absolute;right:3px;top:3px;display:flex;gap:2px}' +
      '#satellite .sat-scene-flags em{font-style:normal;font-size:8px;line-height:1;border-radius:4px;padding:2px;background:#286622;color:#fff}' +
      '#satellite .sat-scene-flags em.radar{background:#2e67b0}' +
      '#satellite .sat-scene-flags em.no_data{background:#a55233}' +
      '@media(max-width:1100px){#satellite .sat-grid{grid-template-columns:1fr}#satellite .sat-kpis{grid-template-columns:1fr 1fr}#satellite .sat-insights{grid-template-columns:1fr}}' +
      '@media(max-width:700px){#satellite .sat-form,#satellite .sat-kpis{grid-template-columns:1fr}#satellite .sat-map{height:420px}#satellite .sat-compare-head{grid-template-columns:1fr}#satellite .sat-compare-timeline{margin-left:6px;margin-right:6px}#satellite .sat-date-nav{grid-template-columns:44px minmax(0,1fr) 44px}#satellite .sat-date-quality{grid-column:1/-1}#satellite .sat-calendar-popover{left:0;width:100%}#satellite .sat-lot-actions{flex-direction:column;align-items:stretch}#satellite .sat-batch-actions{grid-template-columns:1fr}#satellite .sat-batch-actions #satBatchSync{grid-column:auto}#satellite .sat-tool-group{width:100%}#satellite .sat-tool-group-label{width:100%}}';
    document.head.appendChild(el);
  }

  function setStatus(message, type) {
    const el = document.getElementById('satelliteStatus');
    if (!el) return;
    el.textContent = message;
    el.className = 'sat-status' + (type ? ' ' + type : '');
  }

  function fail(error) {
    console.error('Amelia Satellite:', error);
    setStatus(error?.message || 'Error en Amelia Satellite.', 'error');
  }

  function ensureUi() {
    if (!enabled()) return false;
    styles();

    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('button[data-view="satellite"]')) {
      const btn = document.createElement('button');
      btn.dataset.view = 'satellite';
      btn.innerHTML = '<span class="nav-icon"><img class="tayu-nav-img icon-color" src="imagenes/icons/satelite-color.png" alt=""><img class="tayu-nav-img icon-white" src="imagenes/icons/satelite-white.png" alt="" aria-hidden="true"></span><span class="nav-label">Satélite</span>';
      const fincas = nav.querySelector('button[data-view="fincas"]');
      if (fincas?.nextSibling) nav.insertBefore(btn, fincas.nextSibling);
      else nav.appendChild(btn);
      btn.addEventListener('click', () => openView(btn));
    }

    const main = document.querySelector('main.main');
    if (main && !document.getElementById('satellite')) {
      const section = document.createElement('section');
      section.id = 'satellite';
      section.className = 'view';
      section.innerHTML =
        '<div class="card sat-module-title"><div class="module-header"><div><h3 style="margin:0">🛰️ Amelia Satellite</h3><p class="hint" style="margin:6px 0 0">Selecciona un lote, revisa una fecha y analiza su evolución satelital.</p></div></div></div>' +
        '<div class="sat-kpis">' +
          '<div class="sat-kpi"><span>NDVI actual</span><b id="satKpiNdvi">—</b><small id="satKpiNdviHint">Sin datos</small></div>' +
          '<div class="sat-kpi"><span>NDMI actual</span><b id="satKpiNdmi">—</b><small id="satKpiNdmiHint">Sin datos</small></div>' +
          '<div class="sat-kpi"><span>Píxeles válidos</span><b id="satKpiValid">—</b><small id="satKpiQuality">Sin análisis</small></div>' +
          '<div class="sat-kpi"><span>Área</span><b id="satKpiArea">—</b><small>hectáreas</small></div>' +
        '</div>' +
        '<div class="sat-insights">' +
          '<div class="sat-insight"><span>Vigor relativo</span><b id="satInsightVigor">—</b><small id="satInsightVigorNote">Esperando observaciones.</small></div>' +
          '<div class="sat-insight"><span>Humedad relativa</span><b id="satInsightMoisture">—</b><small id="satInsightMoistureNote">Esperando observaciones.</small></div>' +
          '<div class="sat-insight"><span>Tendencia NDVI</span><b id="satInsightTrend">—</b><small id="satInsightTrendNote">Se calcula con los dos últimos periodos utilizables.</small></div>' +
        '</div>' +
        '<p class="hint" style="margin:8px 2px 0">Interpretación orientativa: los umbrales de NDVI/NDMI pueden variar según cultivo, etapa fenológica, suelo, clima y manejo.</p>' +
        '<div class="sat-grid">' +
          '<div>' +
            '<div class="card map-card"><div class="sat-search"><div class="sat-search-box"><input id="satLocationSearch" placeholder="Buscar ubicación o coordenadas: -2.1709, -79.9224"><button class="btn ghost" id="satLocationSearchButton">Buscar</button></div><div id="satSearchResults" class="sat-search-results"></div></div><div id="satDateNavigator" class="sat-date-nav"><button class="sat-date-step" id="satDatePrev" type="button" disabled aria-label="Periodo satelital anterior">‹</button><button class="sat-date-current" id="satDateCurrent" type="button" disabled aria-haspopup="dialog" aria-expanded="false"><span>Periodo satelital</span><b id="satDateCurrentText">Selecciona un lote</b><small id="satDateRangeText">Sin periodo disponible</small></button><button class="sat-date-step" id="satDateNext" type="button" disabled aria-label="Periodo satelital siguiente">›</button><div id="satDateQuality" class="sat-date-quality">Sin análisis</div><div id="satCalendarPopover" class="sat-calendar-popover" role="dialog" aria-label="Fechas satelitales disponibles"><div class="sat-calendar-head"><button id="satCalendarPrevMonth" type="button" aria-label="Mes anterior">‹</button><b id="satCalendarMonth">—</b><button id="satCalendarNextMonth" type="button" aria-label="Mes siguiente">›</button></div><div class="sat-calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div id="satCalendarGrid" class="sat-calendar-grid"></div><div class="sat-calendar-legend"><span><i class="sat-calendar-dot good"></i>Disponible</span><span><i class="sat-calendar-dot limited"></i>Calidad limitada</span><span><i class="sat-calendar-dot poor"></i>No recomendable</span><span>Gris: sin raster utilizable</span></div><div class="sat-calendar-legend" style="border-top:0;margin-top:5px;padding-top:4px"><span><i class="sat-calendar-dot good"></i>S2 real</span><span style="color:#2e67b0">■ S1 radar</span><span>Fechas reales: consultar abajo</span></div></div></div><div id="satScenesCard" class="sat-scenes-card" aria-live="polite"><div class="sat-scenes-header"><strong>Adquisiciones reales · Sentinel-1 y Sentinel-2</strong><div style="display:flex;gap:8px;align-items:center"><small id="satScenesCount">Selecciona un lote</small><button class="sat-scenes-reload" id="satScenesReload" type="button" disabled aria-label="Volver a consultar las adquisiciones">↻ Actualizar</button></div></div><div id="satScenesList" class="sat-scenes-list"></div><div id="satScenesDetails" class="sat-scene-details">Aún no hay lote seleccionado.</div><div id="satSceneRasterToolbar" class="sat-scene-raster-toolbar" style="display:none"><label for="satSceneRasterLayer">Índice / capa</label><select id="satSceneRasterLayer" aria-label="Capa de la adquisición"></select><label for="satSceneContrast">Contraste</label><select id="satSceneContrast" aria-label="Contraste del mapa"><option value="fixed">Fijo (comparar fechas)</option><option value="local">Local (detalle del lote)</option></select><button type="button" id="satSceneRasterLoad">Ver colores</button><button type="button" id="satSceneRasterHistoric">Volver a periodo agregado</button><div id="satSceneRasterTitle" class="sat-scene-raster-title">Sin mapa seleccionado</div></div><div id="satSceneRasterLegend" class="sat-scene-raster-legend"><div id="satSceneRasterGradient" class="sat-scene-raster-gradient"></div><div id="satSceneRasterTicks" class="sat-scene-raster-ticks"></div><div id="satSceneRasterGuide" class="sat-scene-raster-guide">Los colores expresan valores relativos de la capa, no un diagnóstico del cultivo.</div></div><p class="sat-scene-notice">Datos de prueba: mosaicos por día / órbita, no escenas SAFE individuales. Las fechas S1 no generan NDVI. El mapa y la comparación siguen utilizando periodos agregados.</p></div><div class="sat-map-wrap"><div id="satelliteMap" class="sat-map"></div><div id="satCompareBeforeLabel" class="sat-compare-label before" style="display:none">ANTES</div><div id="satCompareAfterLabel" class="sat-compare-label after" style="display:none">DESPUÉS</div><div id="satCompareControl" class="sat-compare-control"><div class="sat-compare-control-head"><span>ANTES</span><span>DESPUÉS</span></div><input id="satCompareRevealRange" type="range" min="0" max="100" step="1" value="50" aria-label="Revelar Antes y Después"></div></div><div class="sat-toolbar"><div class="sat-tool-group"><span class="sat-tool-group-label">Edición</span><button class="btn" id="satDrawStart">Dibujar lote</button><button class="btn ghost" id="satDrawUndo" disabled>Deshacer</button><button class="btn ghost" id="satDrawFinish" disabled>Finalizar</button><button class="btn ghost" id="satDrawClear">Limpiar</button></div><div class="sat-tool-group"><span class="sat-tool-group-label">Visualización</span><button class="btn ghost" id="satSatelliteViewButton" type="button">Satélite</button><button class="btn ghost" id="satNdviMapButton" disabled>NDVI</button><button class="btn ghost" id="satCompareToggle" disabled>Comparar fechas</button><button class="btn ghost" id="satHistoryJump" type="button">Historial</button></div></div><div id="satComparePanel" class="sat-compare-panel"><div class="sat-compare-head"><div class="sat-compare-period"><span>Antes</span><b id="satCompareBeforeText">Sin periodo</b><small id="satCompareBeforeQuality">—</small></div><div class="sat-compare-period"><span>Después</span><b id="satCompareAfterText">Sin periodo</b><small id="satCompareAfterQuality">—</small></div><button class="btn" id="satCompareRun" disabled>Comparar</button></div><div class="sat-compare-timeline"><div class="sat-compare-track"></div><div class="sat-compare-selected" id="satCompareSelected"></div><div class="sat-compare-ticks" id="satCompareTicks"></div><input class="sat-compare-range before" id="satCompareBeforeRange" type="range" min="0" max="1" step="1" value="0" disabled aria-label="Periodo Antes"><input class="sat-compare-range after" id="satCompareAfterRange" type="range" min="0" max="1" step="1" value="1" disabled aria-label="Periodo Después"><div class="sat-compare-axis"><span id="satCompareAxisStart">—</span><span id="satCompareAxisEnd">—</span></div></div><p class="hint" style="margin:8px 0 0">Mueve los dos puntos sobre la línea de tiempo y pulsa Comparar. El deslizador inferior recorre el raster del lote: su posición se conserva aunque muevas o acerques el mapa.</p></div><div id="satFarmLegend" class="sat-farm-legend"><strong>Resumen de finca</strong><span class="item"><i class="dot" style="background:#1b5e20"></i>Alto</span><span class="item"><i class="dot" style="background:#7cb342"></i>Moderado</span><span class="item"><i class="dot" style="background:#fdd835"></i>Bajo</span><span class="item"><i class="dot" style="background:#c62828"></i>Muy bajo</span><span class="item"><i class="dot" style="background:#94a3b8"></i>Sin dato confiable</span></div><div id="satNdviLegend" class="sat-legend"><span>NDVI</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#c62828"></i>Muy bajo</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#ef6c00"></i>Bajo</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#fdd835"></i>Medio</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#7cb342"></i>Bueno</span><span class="sat-legend-item"><i class="sat-legend-swatch" style="background:#1b5e20"></i>Alto</span></div><p class="hint" id="satDrawNote">Busca la ubicación, acerca el mapa y marca al menos 3 puntos para crear el perímetro.</p></div>' +
            '<div class="card" id="satelliteHistoryCard" style="margin-top:18px"><h3 style="margin-top:0">Evolución satelital</h3><div class="sat-chart"><canvas id="satelliteTrendChart"></canvas></div><div class="sat-table-wrap"><table class="table"><thead><tr><th>Periodo</th><th>Calidad</th><th>Válidos</th><th>NDVI</th><th>NDMI</th></tr></thead><tbody id="satelliteObservationsBody"><tr><td colspan="5">Sin datos.</td></tr></tbody></table></div></div>' +
          '</div>' +
          '<div>' +
            '<div class="card sat-lot-card">' +
              '<div class="sat-panel-head"><div><h3>Finca y lote</h3><p>Selecciona la finca y trabaja sobre uno de sus lotes.</p></div></div>' +
              '<div class="sat-lot-site"><label>Finca / sitio</label><select id="satSiteSelect"><option value="">Cargando...</option></select></div>' +
              '<div id="satLotEmpty" class="sat-empty-lot">Selecciona un lote de la lista o usa <b>Dibujar lote</b> para crear uno nuevo.</div>' +
              '<div id="satLotSummary" class="sat-lot-summary"><div class="sat-lot-summary-top"><div><h4 id="satLotSummaryName">—</h4><div class="sat-lot-summary-meta"><span class="sat-lot-chip" id="satLotSummaryCode">—</span><span class="sat-lot-chip" id="satLotSummaryCrop">—</span><span class="sat-lot-chip" id="satLotSummaryArea">— ha</span></div></div></div></div>' +
              '<div id="satCreateForm" class="sat-form sat-create-form"><div><label>Código</label><input id="satFieldCode" placeholder="SAT-001"></div><div><label>Cultivo</label><input id="satCropType" placeholder="banano, cacao..."></div><div class="full"><label>Nombre</label><input id="satFieldName" placeholder="Lote Norte"></div><div class="full"><label>Área estimada (ha)</label><input id="satArea" type="number" readonly></div><div class="full"><button class="btn" id="satSaveField" disabled>Guardar lote</button></div></div>' +
              '<div class="sat-action-section"><div class="sat-action-label"><b>Acciones del lote</b><small>Datos y procesamiento</small></div><div class="sat-lot-actions"><button class="btn ghost" id="satRefresh">↻ Actualizar</button><button class="btn" id="satSync" disabled>Analizar lote</button></div></div>' +
              '<div id="satelliteStatus" class="sat-status">Esperando datos.</div>' +
            '</div>' +
            '<div class="card sat-farm-fields-card" style="margin-top:18px">' +
              '<div class="sat-panel-head"><div><h3>Lotes de la finca</h3><p>Selecciona uno para trabajar o varios para ejecutar acciones en grupo.</p></div></div>' +
              '<div class="sat-list-tabs"><button class="btn ghost active" id="satActiveFieldsTab">Activos</button><button class="btn ghost" id="satArchivedFieldsTab">Archivados</button></div>' +
              '<div class="sat-batch-shell" id="satBatchActions"><div class="sat-batch-head"><b>Acciones en grupo</b><div class="sat-batch-head-right"><span class="sat-batch-count" id="satBatchCount">0 seleccionados</span><button class="sat-link-action" id="satSelectAllFields" disabled>Seleccionar todos</button></div></div><div class="sat-batch-actions"><button class="btn" id="satBatchSync" disabled>Analizar seleccionados</button><button class="btn ghost" id="satFarmNdviShow" disabled>Ver NDVI</button></div></div>' +
              '<div class="sat-field-list-label"><b>Listado de lotes</b><small>Toca un lote para abrirlo</small></div>' +
              '<div id="satelliteFieldList" class="sat-list"><div class="hint">Sin lotes.</div></div>' +
            '</div>' +
          '</div>' +
        '</div>';

      const fincasView = document.getElementById('fincas');
      if (fincasView?.nextSibling) main.insertBefore(section, fincasView.nextSibling);
      else main.appendChild(section);
      bind();
    }
    return true;
  }

  function showNewLotForm(show) {
    const form = document.getElementById('satCreateForm');
    const empty = document.getElementById('satLotEmpty');
    const summary = document.getElementById('satLotSummary');

    form?.classList.toggle('open', Boolean(show));
    summary?.classList.toggle('open', !show && Boolean(selectedFieldData));
    if (empty) {
      empty.style.display =
        show || selectedFieldData
          ? 'none'
          : '';
    }
  }

  function renderSelectedLotSummary(field) {
    selectedFieldData = field || null;

    const name = document.getElementById('satLotSummaryName');
    const code = document.getElementById('satLotSummaryCode');
    const crop = document.getElementById('satLotSummaryCrop');
    const area = document.getElementById('satLotSummaryArea');

    if (field) {
      if (name) name.textContent = field.name || 'Lote';
      if (code) code.textContent = field.code || 'Sin código';
      if (crop) crop.textContent = field.crop_type || 'Sin cultivo';
      if (area) area.textContent = Number(field.area_hectares || 0).toFixed(2) + ' ha';
    }

    showNewLotForm(false);
  }

  function openView(button) {
    document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    button.classList.add('active');
    document.getElementById('satellite')?.classList.add('active');
    const title = document.getElementById('pageTitle');
    if (title) title.textContent = 'Monitoreo Satelital';
    document.getElementById('sidebar')?.classList.remove('open');
    setTimeout(() => {
      initMap();
      map?.invalidateSize();
      loadSites().catch(fail);
    }, 80);
  }

  function initMap() {
    const host = document.getElementById('satelliteMap');
    if (!host || !window.L || map) return map;
    map = L.map(host).setView([-1.8312, -78.1834], 6);
    const streets = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:20,attribution:'© OpenStreetMap'});
    const imagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {maxZoom:19,attribution:'Imágenes © Esri'});
    imagery.addTo(map);
    L.control.layers({'Satélite':imagery,'Mapa':streets}).addTo(map);
    map.on('click', e => {
      if (drawing) {
        addPoint(e.latlng);
      } else if (sceneRasterOverlay && scenePixelSample && sceneRows[sceneSelectedIndex]) {
        showScenePixel(e.latlng).catch(error => {
          console.warn('Amelia Satellite pixel:', error);
          setStatus('No se pudo leer el píxel: ' + (error?.message || 'error'), 'error');
        });
      }
    });
    map.on('move zoom resize', () => {
      if (!compareAfterOverlay) return;
      requestAnimationFrame(() => setComparePosition(comparePositionPct));
    });
    return map;
  }


  function setSearchMarker(lat, lon, label) {
    initMap();
    searchMarker?.remove();
    searchMarker = L.marker([lat, lon]).addTo(map);
    if (label) searchMarker.bindPopup(esc(label)).openPopup();
    map.flyTo([lat, lon], Math.max(map.getZoom(), 16), {duration:.8});
  }

  function parseCoordinates(value) {
    const text = String(value || '').trim();
    const match = text.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lon = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return {lat, lon};
  }

  function closeSearchResults() {
    const host = document.getElementById('satSearchResults');
    if (!host) return;
    host.classList.remove('open');
    host.innerHTML = '';
  }

  function showSearchResults(rows) {
    const host = document.getElementById('satSearchResults');
    if (!host) return;
    if (!rows.length) {
      host.innerHTML = '<div class="sat-search-result">No se encontraron ubicaciones.</div>';
      host.classList.add('open');
      return;
    }

    host.innerHTML = rows.map((row, index) =>
      '<div class="sat-search-result" data-index="' + index + '">' +
      esc(row.display_name || 'Ubicación') +
      '</div>'
    ).join('');
    host.classList.add('open');

    host.querySelectorAll('.sat-search-result[data-index]').forEach(el => {
      el.addEventListener('click', () => {
        const row = rows[Number(el.dataset.index)];
        const lat = Number(row?.lat);
        const lon = Number(row?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
        document.getElementById('satLocationSearch').value = row.display_name || (lat + ', ' + lon);
        closeSearchResults();
        setSearchMarker(lat, lon, row.display_name || 'Ubicación');
        setStatus('Ubicación encontrada. Acerca el mapa y dibuja el lote.', 'ok');
      });
    });
  }

  async function searchLocation() {
    const input = document.getElementById('satLocationSearch');
    const query = String(input?.value || '').trim();
    if (!query) {
      setStatus('Escribe una ubicación o coordenadas.', 'error');
      return;
    }

    const coordinates = parseCoordinates(query);
    if (coordinates) {
      closeSearchResults();
      setSearchMarker(coordinates.lat, coordinates.lon, coordinates.lat.toFixed(6) + ', ' + coordinates.lon.toFixed(6));
      setStatus('Mapa centrado en las coordenadas ingresadas.', 'ok');
      return;
    }

    setStatus('Buscando ubicación...');
    const response = await fetch(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=es&q=' +
      encodeURIComponent(query),
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) throw new Error('No se pudo consultar el buscador de ubicaciones.');

    const rows = await response.json();
    showSearchResults(Array.isArray(rows) ? rows : []);
    setStatus(
      Array.isArray(rows) && rows.length
        ? 'Selecciona una coincidencia del buscador.'
        : 'No se encontraron coincidencias.',
      Array.isArray(rows) && rows.length ? 'ok' : 'error'
    );
  }

  function centerSelectedSite() {
    const siteId = document.getElementById('satSiteSelect')?.value;
    const site = currentSites.find(row => row.id === siteId);
    const lat = Number(site?.latitude);
    const lon = Number(site?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
    setSearchMarker(lat, lon, site.name || 'Sitio');
    setStatus('Mapa centrado en la ubicación registrada de ' + (site.name || 'la finca') + '.', 'ok');
    return true;
  }

  function clearComparison() {
    compareBeforeOverlay?.remove();
    compareAfterOverlay?.remove();
    compareBeforeOverlay = null;
    compareAfterOverlay = null;
    comparePositionPct = 50;

    document.getElementById('satCompareControl')?.classList.remove('open');
    const revealRange = document.getElementById('satCompareRevealRange');
    if (revealRange) revealRange.value = '50';

    const beforeLabel = document.getElementById('satCompareBeforeLabel');
    const afterLabel = document.getElementById('satCompareAfterLabel');
    if (beforeLabel) beforeLabel.style.display = 'none';
    if (afterLabel) afterLabel.style.display = 'none';
  }

  function clearFarmNdviOverlays() {
    farmNdviOverlays.forEach(overlay => {
      try { overlay.remove(); } catch (_) {}
    });
    farmNdviOverlays.clear();

    const showButton = document.getElementById('satFarmNdviShow');
    if (showButton) {
      const checked = document.querySelectorAll('#satelliteFieldList .sat-field-check:checked').length;
      showButton.textContent = checked ? 'Ver NDVI (' + checked + ')' : 'Ver NDVI';
    }
  }

  function clearNdviOverlay() {
    clearSceneRaster();
    ndviOverlay?.remove();
    ndviOverlay = null;
    clearComparison();
    document.getElementById('satNdviLegend')?.classList.remove('open');
  }

  function setComparePosition(percent) {
    const pct =
      Math.max(
        0,
        Math.min(
          100,
          Number(percent) || 0
        )
      );

    comparePositionPct = pct;

    const afterImage =
      compareAfterOverlay?.getElement?.();

    const revealRange =
      document.getElementById(
        'satCompareRevealRange'
      );

    if (revealRange) {
      revealRange.value =
        String(
          Math.round(pct)
        );
    }

    if (!afterImage) {
      return;
    }

    // El deslizador representa un porcentaje DEL RASTER, no de la ventana.
    // Así 50% siempre parte el NDVI por la mitad y, al mover/zoomear el mapa,
    // el corte permanece en la misma posición relativa dentro del lote.
    const clip =
      'inset(0 0 0 ' +
      pct.toFixed(2) +
      '%)';

    afterImage.style.clipPath =
      clip;

    afterImage.style.webkitClipPath =
      clip;
  }

  function periodValue(row) {
    return row?.interval_from && row?.interval_to
      ? String(row.interval_from) + '|' + String(row.interval_to)
      : '';
  }

  function periodDateKey(row) {
    const value = row?.interval_to || row?.interval_from || '';
    const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return match[1] + '-' + match[2] + '-' + match[3];
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0,10);
  }

  function periodDate(row) {
    const key = periodDateKey(row);
    if (!key) return null;
    const parts = key.split('-').map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
  }

  function shortDate(value) {
    const key = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    const date = key
      ? new Date(Number(key[1]), Number(key[2]) - 1, Number(key[3]), 12, 0, 0)
      : new Date(value);
    return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString('es-EC',{day:'2-digit',month:'short',year:'numeric'});
  }

  function setCalendarCursorFromPeriod(row) {
    const date = periodDate(row);
    if (date) calendarCursor = new Date(date.getFullYear(), date.getMonth(), 1, 12, 0, 0);
  }

  function closeCalendar() {
    const popover = document.getElementById('satCalendarPopover');
    const current = document.getElementById('satDateCurrent');
    popover?.classList.remove('open');
    current?.setAttribute('aria-expanded','false');
  }


  function sceneDay(row) {
    const match = String(row?.acquired_at || '').match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
  }

  function sceneKind(row) {
    return row?.collection === 'sentinel-1-grd' ? 'radar' : 'optical';
  }

  function sceneNum(value, digits = 3) {
    return value == null || !Number.isFinite(Number(value))
      ? '—'
      : Number(value).toFixed(digits);
  }

  function sceneDetail(index) {
    if (!sceneRows[index]) return;
    sceneSelectedIndex = index;
    const row = sceneRows[index];
    const day = sceneDay(row);
    const date = new Date(day + 'T12:00:00Z');
    if (!Number.isNaN(date.getTime())) {
      calendarCursor = new Date(date.getUTCFullYear(), date.getUTCMonth(), 1, 12);
    }
    sceneRasterLayer = sceneKind(row) === 'radar' ? 'vv' : 'ndvi';
    sceneRasterError = '';
    renderScenes();
    showSceneRaster(index, sceneRasterLayer).catch(error => console.warn('Amelia scene map:',error));
    if (document.getElementById('satCalendarPopover')?.classList.contains('open')) renderCalendar();
  }

  function clearSceneRaster() {
    sceneRasterSeq++;
    try { sceneRasterOverlay?.remove(); } catch (_) {}
    sceneRasterOverlay = null;
    sceneRasterColorRange = null;
    sceneRasterLocalMask = null;
    scenePixelSample = null;
    try { scenePixelPopup?.remove(); } catch (_) {}
    scenePixelPopup = null;
    document.getElementById('satSceneRasterLegend')?.classList.remove('open');
  }

  const sceneRasterRanges = {
    ndvi:['NDVI',[-0.2,0.075,0.35,0.625,0.9]],
    ndmi:['NDMI',[-0.5,-0.225,0.05,0.325,0.6]],
    ndre:['NDRE',[-0.1,0.088,0.275,0.463,0.65]],
    evi:['EVI',[-0.2,0.063,0.325,0.588,0.85]],
    vv:['VV · dB',[-23,-17.25,-11.5,-5.75,0]],
    vh:['VH · dB',[-30,-23.75,-17.5,-11.25,-5]],
    ratio:['VV/VH', [1,2.75,4.5,6.25,8]]
  };

  function renderSceneRasterToolbar(row) {
    const bar = document.getElementById('satSceneRasterToolbar');
    const layerSelect = document.getElementById('satSceneRasterLayer');
    const contrastSelect = document.getElementById('satSceneContrast');
    const title = document.getElementById('satSceneRasterTitle');
    const load = document.getElementById('satSceneRasterLoad');
    const legend = document.getElementById('satSceneRasterLegend');
    if (!bar || !layerSelect || !title || !load || !legend) return;
    if (!row || !selectedFieldId) {
      bar.style.display = 'none';
      legend.classList.remove('open');
      return;
    }
    bar.style.display = 'flex';
    const usable = row.quality !== 'no_data';
    const optical = sceneKind(row) === 'optical';
    const keys = optical ? ['ndvi','ndmi','ndre','evi'] : ['vv','vh','ratio'];
    if (!keys.includes(sceneRasterLayer)) sceneRasterLayer = keys[0];
    layerSelect.innerHTML = keys.map(key =>
      '<option value="' + key + '"' + (key === sceneRasterLayer ? ' selected' : '') + '>' +
      (sceneRasterRanges[key]?.[0] || key.toUpperCase()) + '</option>'
    ).join('');
    layerSelect.disabled = !usable || sceneRasterBusy;
    if (contrastSelect) {
      contrastSelect.value = sceneContrastMode;
      contrastSelect.disabled = !usable || sceneRasterBusy;
    }
    load.disabled = !usable || sceneRasterBusy;
    title.textContent = row.quality === 'no_data'
      ? 'Sin píxeles ópticos utilizables: no se mostrará una imagen de vigor.'
      : sceneRasterBusy ? 'Cargando imagen de la adquisición seleccionada…'
      : sceneRasterError ? 'Mapa no disponible: ' + sceneRasterError
      : sceneRasterOverlay ? 'Mapa real: ' + (optical ? 'S2' : 'S1') +
        ' · ' + shortDate(row.acquired_at) + ' · ' + (sceneRasterRanges[sceneRasterLayer]?.[0] || sceneRasterLayer) +
        ' · Contraste ' + (sceneContrastMode === 'local' ? 'local P05–P95' : 'fijo')
      : 'Pulsa «Ver colores» para cargar la capa de esta adquisición.';
    if (!sceneRasterOverlay || !usable) {
      legend.classList.remove('open');
      return;
    }
    const values = Array.isArray(sceneRasterColorRange) && sceneRasterColorRange.length === 2 &&
      sceneRasterColorRange.every(x => Number.isFinite(Number(x)))
      ? Array.from({length:5},(_,i) => Number(sceneRasterColorRange[0]) +
        (Number(sceneRasterColorRange[1])-Number(sceneRasterColorRange[0]))*i/4)
      : sceneRasterRanges[sceneRasterLayer]?.[1] || [];
    const gradient = document.getElementById('satSceneRasterGradient');
    const ticks = document.getElementById('satSceneRasterTicks');
    const guide = document.getElementById('satSceneRasterGuide');
    gradient?.classList.toggle('radar', !optical);
    gradient?.classList.toggle('local', sceneContrastMode === 'local');
    if (ticks) ticks.innerHTML = values.map(value => '<span>' + Number(value.toFixed(2)) + '</span>').join('');
    if (guide) {
      const direction = optical ? 'Menor índice ← Valores del índice → Mayor índice' :
        'Menor retorno radar ← Intensidad/señal → Mayor retorno radar';
      const note = sceneContrastMode === 'local'
        ? optical
          ? 'Contraste local P05–P95 del lote; se excluyen los píxeles no clasificados como vegetación (SCL ≠ 4). Una vivienda mal clasificada podría permanecer.'
          : 'Contraste local P05–P95 radar. No excluye automáticamente construcciones: la señal no representa salud del cultivo.'
        : 'Contraste fijo con escala constante para comparar adquisiciones de la misma capa.';
      guide.textContent = direction + '. ' + note +
        ' Los colores NO diagnostican enfermedades. ' +
        (scenePixelSample
          ? 'Haz clic dentro del mapa coloreado para consultar el valor numérico del píxel.'
          : 'Lectura por punto no disponible todavía para esta capa.');
    }
    legend.classList.add('open');
  }

  async function showSceneRaster(index, layer) {
    const row = sceneRows[index];
    if (!row || !selectedFieldId) return;
    const fieldId = selectedFieldId;
    sceneRasterLayer = layer;
    sceneRasterError = '';
    // Never leave the historical P5D image visible while claiming it belongs to a real date.
    clearFarmNdviOverlays();
    clearNdviOverlay();
    const seq = ++sceneRasterSeq;
    if (row.quality === 'no_data') {
      sceneRasterBusy = false;
      renderSceneRasterToolbar(row);
      setStatus('Adquisición sin píxeles útiles: no se mostrará un mapa NDVI.', 'error');
      return;
    }
    if (!row.id) {
      sceneRasterError = 'La adquisición no tiene identificador de escena.';
      renderSceneRasterToolbar(row);
      return;
    }
    sceneRasterBusy = true;
    renderSceneRasterToolbar(row);
    try {
      const result = await getApi('/satellite/fields/' + encodeURIComponent(fieldId) +
        '/scenes/' + encodeURIComponent(row.id) + '/map?layer=' + encodeURIComponent(layer) +
        '&contrast=' + encodeURIComponent(sceneContrastMode));
      if (seq !== sceneRasterSeq || fieldId !== selectedFieldId || sceneSelectedIndex !== index) return;
      const bounds = mapBounds(result);
      sceneRasterColorRange = Array.isArray(result.color_range) ? result.color_range : null;
      sceneRasterLocalMask = result.local_mask_method || null;
      const pixelRange = Array.isArray(result.sample_value_range) ? result.sample_value_range.map(Number) : [];
      if (result.sample_encoding === 'RG16_UNORM_ALPHA_V1' &&
          typeof result.sample_data_url === 'string' &&
          result.sample_data_url.startsWith('data:image/png;base64,') &&
          pixelRange.length === 2 && pixelRange.every(Number.isFinite)) {
        scenePixelSample = {
          imageUrl: result.sample_data_url, range: pixelRange,
          bbox: result.bbox.map(Number),
          width: Number(result.width),height:Number(result.height),
          sceneId:row.id,layer,context:null,loading:null
        };
      } else {
        scenePixelSample = null;
      }
      if (!map) initMap();
      sceneRasterOverlay = L.imageOverlay(result.image_data_url,bounds,{
        opacity:0.84,interactive:false,crossOrigin:false
      }).addTo(map);
      try { polygon?.bringToFront?.(); } catch (_) {}
      try { map.fitBounds(bounds,{padding:[24,24]}); } catch (_) {}
      setStatus('Mapa por adquisición: ' + shortDate(row.acquired_at) + ' · ' +
        layer.toUpperCase() + ' · contraste ' + (sceneContrastMode === 'local' ? 'local' : 'fijo'), 'ok');
    } catch(error) {
      if (seq !== sceneRasterSeq || fieldId !== selectedFieldId || sceneSelectedIndex !== index) return;
      sceneRasterError = error?.message || 'La imagen no se pudo cargar';
      console.warn('Amelia Satellite scene raster:',error);
      setStatus('No se pudo abrir el mapa: ' + sceneRasterError,'error');
    } finally {
      if (seq === sceneRasterSeq && fieldId === selectedFieldId) {
        sceneRasterBusy = false;
        renderSceneRasterToolbar(row);
      }
    }
  }


  function sceneMetricAverage(row, layer) {
    const fields = {
      ndvi:'ndvi_mean',ndmi:'ndmi_mean',ndre:'ndre_mean',evi:'evi_mean',
      vv:'s1_vv_db_mean',vh:'s1_vh_db_mean'
    };
    const field = fields[layer];
    const raw = field ? row?.[field] : null;
    return raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
  }

  async function showScenePixel(latlng) {
    const sample = scenePixelSample;
    const row = sceneRows[sceneSelectedIndex];
    if (!sample || !row || row.id !== sample.sceneId ||
        sample.layer !== sceneRasterLayer || !sceneRasterOverlay || !map) return;
    const [west,south,east,north] = sample.bbox;
    if (![west,south,east,north,sample.width,sample.height].every(Number.isFinite) ||
        east <= west || north <= south || sample.width < 2 || sample.height < 2) {
      throw new Error('Coordenadas del raster inválidas');
    }
    const x = Math.floor((latlng.lng-west)/(east-west)*sample.width);
    const y = Math.floor((north-latlng.lat)/(north-south)*sample.height);
    if (x < 0 || x >= sample.width || y < 0 || y >= sample.height) return;
    if (!sample.context) {
      if (!sample.loading) {
        sample.loading = new Promise((resolve,reject) => {
          const img = new Image();
          img.onload = () => {
            if (img.width !== sample.width || img.height !== sample.height) {
              reject(new Error('La imagen numérica no coincide con el mapa'));
              return;
            }
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d', {willReadFrequently:true});
            if (!ctx) {
              reject(new Error('No se pudo crear el lector de píxeles'));
              return;
            }
            ctx.drawImage(img,0,0);
            sample.context = ctx;
            resolve();
          };
          img.onerror = () => reject(new Error('No se pudo decodificar la muestra numérica'));
          img.src = sample.imageUrl;
        });
      }
      await sample.loading;
    }
    if (sample !== scenePixelSample || row.id !== sceneRows[sceneSelectedIndex]?.id) return;
    const rgba = sample.context.getImageData(x,y,1,1).data;
    const label = sceneRasterRanges[sample.layer]?.[0] || sample.layer.toUpperCase();
    const location = latlng.lat.toFixed(6) + ', ' + latlng.lng.toFixed(6);
    const valid = rgba[3] >= 250;
    let content = '<div style="min-width:215px;line-height:1.6;color:#172617">' +
      '<strong>' + esc(label) + ' · ' + esc(shortDate(row.acquired_at)) + '</strong>' +
      '<div style="font-size:11px;color:#52616b">Ubicación: ' + esc(location) + '</div>';
    if (!valid) {
      content += '<div style="margin-top:6px"><b>Sin valor válido para este píxel.</b></div>' +
        '<div style="font-size:11px">Puede ser una construcción, suelo no clasificado como vegetación o un píxel sin datos.</div>';
    } else {
      const encoded = rgba[0]*256 + rgba[1];
      const v = sample.range[0] + (encoded/65535)*(sample.range[1]-sample.range[0]);
      const average = sceneMetricAverage(row,sample.layer);
      const digits = ['vv','vh'].includes(sample.layer) ? 2 : 3;
      content += '<div style="font-size:23px;font-weight:900;margin:4px 0">' + esc(v.toFixed(digits)) + '</div>' +
        '<div style="font-size:11px">Valor del píxel procesado por Copernicus (cuantización 16 bits).</div>';
      if (average != null) {
        const delta = v-average;
        content += '<div style="font-size:11px;margin-top:4px">Promedio registrado del lote: <b>' +
          esc(average.toFixed(digits)) + '</b><br>Diferencia: <b>' +
          esc((delta>=0?'+':'')+delta.toFixed(digits)) + '</b></div>';
      }
    }
    content += '<div style="font-size:10px;color:#61717c;margin-top:4px">Ubicación aproximada según resolución raster; no es una medición en campo.</div></div>';
    try { scenePixelPopup?.remove(); } catch (_) {}
    scenePixelPopup = L.popup({maxWidth:320,closeButton:true})
      .setLatLng(latlng).setContent(content).openOn(map);
  }

  function renderScenes() {
    const count = document.getElementById('satScenesCount');
    const list = document.getElementById('satScenesList');
    const details = document.getElementById('satScenesDetails');
    if (!count || !list || !details) return;
    const reload = document.getElementById('satScenesReload');
    if (reload) reload.disabled = !selectedFieldId || scenesLoading;
    count.textContent = scenesLoading ? 'Cargando…' : scenesError
      ? 'No disponible'
      : sceneRows.length + ' adquisición(es) registrada(s)';
    if (!selectedFieldId) {
      renderSceneRasterToolbar(null);
      count.textContent = 'Selecciona un lote';
      list.innerHTML = '';
      details.textContent = 'Selecciona un lote para consultar las adquisiciones reales.';
      return;
    }
    if (scenesLoading) {
      renderSceneRasterToolbar(null);
      list.innerHTML = '';
      details.textContent = 'Consultando fechas y métricas reales de Sentinel-1 y Sentinel-2…';
      return;
    }
    if (scenesError) {
      renderSceneRasterToolbar(null);
      list.innerHTML = '';
      details.textContent = 'No fue posible cargar las adquisiciones: ' + scenesError;
      return;
    }
    if (!sceneRows.length) {
      renderSceneRasterToolbar(null);
      list.innerHTML = '';
      details.textContent = 'No hay adquisiciones reales procesadas para este lote. El historial por periodos continúa disponible.';
      return;
    }
    if (sceneSelectedIndex < 0 || !sceneRows[sceneSelectedIndex]) sceneSelectedIndex = 0;
    list.innerHTML = sceneRows.map((row,i) => {
      const radar = sceneKind(row) === 'radar';
      return '<button type="button" class="sat-scene-item ' +
        (radar ? 'radar' : 'optical') + (row.quality === 'no_data' ? ' no_data' : '') +
        (i === sceneSelectedIndex ? ' active' : '') +
        '" data-scene-index="' + i + '" aria-pressed="' + (i === sceneSelectedIndex) + '">' +
        (radar ? 'S1 radar ' : 'S2 óptico ') + esc(shortDate(row.acquired_at)) +
        (row.quality === 'no_data' ? ' · nublado/sin dato' : '') +
        '</button>';
    }).join('');

    const row = sceneRows[sceneSelectedIndex];
    const radar = sceneKind(row) === 'radar';
    const metrics = radar
      ? [['VV',sceneNum(row.s1_vv_mean,4)],['VH',sceneNum(row.s1_vh_mean,4)],
         ['VV (dB)',sceneNum(row.s1_vv_db_mean,2)],['VH (dB)',sceneNum(row.s1_vh_db_mean,2)],
         ['Órbita',row.relative_orbit ?? '—'],['Dirección',row.orbit_direction || '—']]
      : [['NDVI',sceneNum(row.ndvi_mean)],['NDMI',sceneNum(row.ndmi_mean)],
         ['NDRE',sceneNum(row.ndre_mean)],['EVI',sceneNum(row.evi_mean)],
         ['Nube local',row.local_cloud_percent == null ? '—' : sceneNum(row.local_cloud_percent,1) + '%'],
         ['Píxeles válidos',row.valid_pixel_percent == null ? '—' : sceneNum(row.valid_pixel_percent,1) + '%']];
    const type = radar ? 'Sentinel-1 · radar VV/VH' : 'Sentinel-2 · óptico';
    renderSceneRasterToolbar(row);
    details.innerHTML =
      '<strong>' + esc(type) + ' · ' + esc(shortDate(row.acquired_at)) + '</strong>' +
      ' <span>· Calidad: ' + esc(qualityLabel(row.quality)) + '</span>' +
      '<div class="sat-scene-values">' + metrics.map(([label,value]) =>
        '<span>' + esc(label) + ': <b>' + esc(value) + '</b></span>').join('') + '</div>';
  }

  async function loadScenes(id) {
    const requestSeq = ++sceneRequestSeq;
    sceneRows = [];
    sceneSelectedIndex = -1;
    scenesError = '';
    scenesLoading = true;
    renderScenes();
    try {
      const response = await getApi('/satellite/fields/' + encodeURIComponent(id) + '/scenes?limit=90');
      // Ignora respuestas de otras selecciones y peticiones antiguas del mismo lote.
      if (selectedFieldId !== id || requestSeq !== sceneRequestSeq) return;
      if (!response || !Array.isArray(response.scenes)) {
        throw new Error('La API no devolvió una lista de adquisiciones válida.');
      }
      sceneRows = response.scenes;
      sceneSelectedIndex = sceneRows.length ? 0 : -1;
    } catch (error) {
      if (selectedFieldId !== id || requestSeq !== sceneRequestSeq) return;
      scenesError = error?.message || 'Error de consulta';
      console.warn('Amelia Satellite acquisitions:', error);
    }
    if (selectedFieldId !== id || requestSeq !== sceneRequestSeq) return;
    scenesLoading = false;
    renderScenes();
    if (!datePeriods.length && sceneRows.length) {
      const date = new Date(sceneRows[0].acquired_at);
      if (!Number.isNaN(date.getTime())) {
        calendarCursor = new Date(date.getUTCFullYear(),date.getUTCMonth(),1,12);
      }
    }
    renderDateNavigator();
    if (document.getElementById('satCalendarPopover')?.classList.contains('open')) renderCalendar();
  }

  function renderCalendar() {
    const grid = document.getElementById('satCalendarGrid');
    const title = document.getElementById('satCalendarMonth');
    if (!grid || !title) return;

    const year = calendarCursor.getFullYear();
    const month = calendarCursor.getMonth();
    title.textContent = new Date(year, month, 1, 12, 0, 0)
      .toLocaleDateString('es-EC',{month:'long',year:'numeric'});

    const observationsByDay = new Map();
    calendarObservations.forEach(row => {
      const key = periodDateKey(row);
      if (!key) return;
      const current = observationsByDay.get(key);
      const rank = {good:3,limited:2,poor:1,no_data:0};
      if (!current || (rank[row?.quality] ?? -1) > (rank[current?.quality] ?? -1)) {
        observationsByDay.set(key, row);
      }
    });

    const scenesByDay = new Map();
    sceneRows.forEach(scene => {
      const key = sceneDay(scene);
      if (!key) return;
      if (!scenesByDay.has(key)) scenesByDay.set(key, []);
      scenesByDay.get(key).push(scene);
    });

    const first = new Date(year, month, 1, 12, 0, 0);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - mondayOffset, 12, 0, 0);
    const selectedValue = datePeriods[datePeriodIndex]?.value || '';

    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 12, 0, 0);
      const key =
        String(d.getFullYear()).padStart(4,'0') + '-' +
        String(d.getMonth()+1).padStart(2,'0') + '-' +
        String(d.getDate()).padStart(2,'0');
      const row = observationsByDay.get(key) || null;
      const value = row ? periodValue(row) : '';
      const usableIndex = value
        ? datePeriods.findIndex(item => item.value === value)
        : -1;
      const quality = row?.quality || '';
      const scenes = scenesByDay.get(key) || [];
      const hasRadar = scenes.some(scene => sceneKind(scene) === 'radar');
      const hasOptical = scenes.some(scene => sceneKind(scene) === 'optical');
      const opticalUsable = scenes.some(scene => sceneKind(scene) === 'optical' && scene.quality !== 'no_data');
      const outside = d.getMonth() !== month;
      const selected = usableIndex >= 0 && datePeriods[usableIndex]?.value === selectedValue;
      const usable = usableIndex >= 0 || scenes.length > 0;
      const mark = quality === 'poor' || quality === 'no_data' ? '☁' : row ? '●' : '';
      const titleText = (row
        ? 'Periodo NDVI: ' + qualityLabel(quality) + (row.valid_pixel_percent == null ? '' : ' · ' + Number(row.valid_pixel_percent).toFixed(1) + '% válido')
        : 'Sin periodo NDVI') +
        (scenes.length ? ' · Adquisición real: ' + (hasOptical ? 'S2' : '') + (hasRadar ? ' S1 radar' : '') : '');
      cells.push(
        '<button type="button" class="sat-calendar-day ' +
        esc(quality) +
        (outside ? ' outside' : '') +
        (selected ? ' selected' : '') +
        '" data-period-index="' + usableIndex + '" data-scene-day="' + esc(key) + '" ' +
        (usable ? '' : 'disabled ') +
        'title="' + esc(titleText) + '">' +
        d.getDate() +
        (mark ? '<span class="mark">' + mark + '</span>' : '') +
        (scenes.length ? '<span class="sat-scene-flags">' +
          (hasOptical ? '<em class="' + (opticalUsable ? '' : 'no_data') + '">S2</em>' : '') +
          (hasRadar ? '<em class="radar">S1</em>' : '') +
          '</span>' : '') +
        '</button>'
      );
    }
    grid.innerHTML = cells.join('');
  }

  function applySelectedObservationMetrics(row, index) {
    if (!row) return;

    const fmt = value =>
      Number.isFinite(Number(value))
        ? Number(value).toFixed(3)
        : '—';

    const ndvi = document.getElementById('satKpiNdvi');
    const ndmi = document.getElementById('satKpiNdmi');
    const valid = document.getElementById('satKpiValid');
    const quality = document.getElementById('satKpiQuality');
    const ndviHint = document.getElementById('satKpiNdviHint');
    const ndmiHint = document.getElementById('satKpiNdmiHint');

    if (ndvi) ndvi.textContent = fmt(row.ndvi_mean);
    if (ndmi) ndmi.textContent = fmt(row.ndmi_mean);
    if (valid) {
      valid.textContent =
        row.valid_pixel_percent == null
          ? '—'
          : Number(row.valid_pixel_percent).toFixed(1) + '%';
    }
    if (quality) quality.textContent = qualityLabel(row.quality);
    if (ndviHint) ndviHint.textContent = 'Periodo seleccionado';
    if (ndmiHint) ndmiHint.textContent = 'Periodo seleccionado';

    const ndviInfo = ndviLabel(row.ndvi_mean);
    const ndmiInfo = ndmiLabel(row.ndmi_mean);

    const vigor = document.getElementById('satInsightVigor');
    const vigorNote = document.getElementById('satInsightVigorNote');
    const moisture = document.getElementById('satInsightMoisture');
    const moistureNote = document.getElementById('satInsightMoistureNote');

    if (vigor) vigor.textContent = ndviInfo.label;
    if (vigorNote) vigorNote.textContent = ndviInfo.note;
    if (moisture) moisture.textContent = ndmiInfo.label;
    if (moistureNote) moistureNote.textContent = ndmiInfo.note;

    const trendEl = document.getElementById('satInsightTrend');
    const trendNoteEl = document.getElementById('satInsightTrendNote');
    const previous = index > 0 ? datePeriods[index - 1] : null;

    if (trendEl && trendNoteEl) {
      if (
        previous &&
        Number.isFinite(Number(row.ndvi_mean)) &&
        Number.isFinite(Number(previous.ndvi_mean))
      ) {
        const current = Number(row.ndvi_mean);
        const prior = Number(previous.ndvi_mean);
        const delta = current - prior;
        const pct =
          Math.abs(prior) > 0.0001
            ? (delta / Math.abs(prior)) * 100
            : null;
        const arrow =
          delta > 0.005
            ? '▲'
            : delta < -0.005
              ? '▼'
              : '→';

        trendEl.textContent =
          arrow + ' ' +
          (
            pct == null
              ? Math.abs(delta).toFixed(3)
              : Math.abs(pct).toFixed(1) + '%'
          );

        trendNoteEl.textContent =
          'NDVI ' +
          (
            delta > 0.005
              ? 'subió'
              : delta < -0.005
                ? 'bajó'
                : 'se mantuvo estable'
          ) +
          ' ' +
          Math.abs(delta).toFixed(3) +
          ' puntos respecto al periodo utilizable anterior.';
      } else {
        trendEl.textContent = '—';
        trendNoteEl.textContent = 'No existe un periodo utilizable anterior para comparar.';
      }
    }
  }

  function renderDateNavigator() {
    const previous = document.getElementById('satDatePrev');
    const next = document.getElementById('satDateNext');
    const current = document.getElementById('satDateCurrent');
    const currentText = document.getElementById('satDateCurrentText');
    const rangeText = document.getElementById('satDateRangeText');
    const quality = document.getElementById('satDateQuality');

    if (!previous || !next || !current || !currentText || !rangeText || !quality) return;

    if (!selectedFieldId) {
      previous.disabled = true;
      next.disabled = true;
      current.disabled = true;
      currentText.textContent = 'Selecciona un lote';
      rangeText.textContent = 'Sin periodo satelital';
      quality.className = 'sat-date-quality';
      quality.textContent = 'Sin análisis';
      closeCalendar();
      return;
    }

    if (!datePeriods.length || datePeriodIndex < 0) {
      previous.disabled = true;
      next.disabled = true;
      current.disabled = !sceneRows.length;
      currentText.textContent = sceneRows.length ? 'Ver adquisiciones reales' : 'Sin fechas utilizables';
      rangeText.textContent = sceneRows.length
        ? 'Escenas reales S1/S2 · sin periodo NDVI seleccionable'
        : 'Ejecuta “Analizar con satélite”';
      quality.className = 'sat-date-quality no_data';
      quality.textContent = 'Sin raster confiable';
      closeCalendar();
      return;
    }

    datePeriodIndex = Math.max(0, Math.min(datePeriodIndex, datePeriods.length - 1));
    const row = datePeriods[datePeriodIndex];

    previous.disabled = datePeriodIndex <= 0;
    next.disabled = datePeriodIndex >= datePeriods.length - 1;
    current.disabled = false;
    currentText.textContent = shortDate(row.interval_to || row.interval_from);
    rangeText.textContent =
      'Periodo ' + shortDate(row.interval_from) + ' → ' + shortDate(row.interval_to);

    const coverage = Number(row.valid_pixel_percent);
    quality.className = 'sat-date-quality ' + esc(row.quality || '');
    quality.textContent =
      qualityLabel(row.quality) +
      (Number.isFinite(coverage) ? ' · ' + coverage.toFixed(1) + '% válido' : '');

    setCalendarCursorFromPeriod(row);
    if (document.getElementById('satCalendarPopover')?.classList.contains('open')) {
      renderCalendar();
    }
  }

  async function selectDatePeriod(index) {
    const nextIndex = Number(index);
    if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex >= datePeriods.length) return;
    datePeriodIndex = nextIndex;
    renderDateNavigator();
    applySelectedObservationMetrics(
      datePeriods[datePeriodIndex],
      datePeriodIndex
    );
    closeCalendar();
    await loadNdviOverlay();
  }

  function periodPath(fieldId, periodValue) {
    let path = '/satellite/fields/' + encodeURIComponent(fieldId) + '/ndvi-map';
    const parts = String(periodValue || '').split('|');
    if (parts.length === 2 && parts[0] && parts[1]) {
      path += '?from=' + encodeURIComponent(parts[0]) + '&to=' + encodeURIComponent(parts[1]);
    }
    return path;
  }

  function mapBounds(result) {
    const bbox = Array.isArray(result?.bbox) ? result.bbox.map(Number) : [];
    if (bbox.length !== 4 || bbox.some(v => !Number.isFinite(v))) {
      throw new Error('El mapa NDVI no devolvió límites válidos.');
    }
    if (!result?.image_data_url) {
      throw new Error('El mapa NDVI no devolvió una imagen.');
    }
    return [
      [bbox[1], bbox[0]],
      [bbox[3], bbox[2]]
    ];
  }

  function formatMapPeriod(result) {
    return result?.from && result?.to
      ? new Date(result.from).toLocaleDateString('es-EC') + ' → ' + new Date(result.to).toLocaleDateString('es-EC')
      : 'periodo seleccionado';
  }

  function clearLayers() {
    markers.forEach(m => m.remove());
    markers = [];
    line?.remove(); line = null;
    polygon?.remove(); polygon = null;
    clearNdviOverlay();
    clearFarmNdviOverlays();
  }

  function redraw() {
    line?.remove(); line = null;
    if (drawing && points.length >= 2) line = L.polyline(points, {weight:3}).addTo(map);
    document.getElementById('satDrawUndo').disabled = points.length === 0;
    document.getElementById('satDrawFinish').disabled = points.length < 3;
    document.getElementById('satSaveField').disabled = true;
    const note = document.getElementById('satDrawNote');
    if (note) note.textContent = drawing ? 'Puntos marcados: ' + points.length : 'Marca al menos 3 puntos para crear el perímetro.';
  }

  function addPoint(latlng) {
    points.push([latlng.lat, latlng.lng]);
    markers.push(L.circleMarker(latlng,{radius:5,weight:2,fillOpacity:1}).addTo(map));
    redraw();
  }

  function estimateAreaHa(list) {
    if (list.length < 3) return 0;
    const lat0 = list.reduce((s,p)=>s+p[0],0)/list.length;
    const my = 111320;
    const mx = Math.max(1000,111320*Math.cos(lat0*Math.PI/180));
    const xy = list.map(p=>[p[1]*mx,p[0]*my]);
    let a = 0;
    for (let i=0;i<xy.length;i++) {
      const p1=xy[i], p2=xy[(i+1)%xy.length];
      a += p1[0]*p2[1]-p2[0]*p1[1];
    }
    return Math.abs(a)/2/10000;
  }

  function startDraw() {
    initMap();
    selectedFieldId = null;
    selectedFieldData = null;
    showNewLotForm(true);
    datePeriods = [];
    calendarObservations = [];
    datePeriodIndex = -1;
    renderDateNavigator();
    document.querySelectorAll('#satelliteFieldList .sat-field').forEach(el => el.classList.remove('active'));
    const syncButton = document.getElementById('satSync');
    const ndviButton = document.getElementById('satNdviMapButton');
    const compareButton = document.getElementById('satCompareToggle');
    if (syncButton) syncButton.disabled = true;
    if (ndviButton) ndviButton.disabled = true;
    if (compareButton) compareButton.disabled = true;
    clearLayers();
    points = [];
    drawing = true;
    redraw();
    setStatus('Dibuja el perímetro del lote.', 'ok');
  }

  function finishDraw() {
    if (points.length < 3) return;
    drawing = false;
    line?.remove(); line = null;
    polygon = L.polygon(points,{weight:3,fillOpacity:.18}).addTo(map);
    const area = estimateAreaHa(points);
    document.getElementById('satArea').value = area.toFixed(2);
    document.getElementById('satKpiArea').textContent = area.toFixed(2);
    document.getElementById('satSaveField').disabled = false;
    setStatus('Polígono listo para guardar.', 'ok');
  }

  function clearDraw() {
    drawing = false;
    points = [];
    clearLayers();
    document.getElementById('satArea').value = '';
    document.getElementById('satKpiArea').textContent = '—';
    document.getElementById('satSaveField').disabled = true;
    if (!selectedFieldId) {
      selectedFieldData = null;
      renderSelectedLotSummary(null);
    }
    redraw();
  }

  function geojson() {
    if (points.length < 3) return null;
    const coords = points.map(p => [p[1],p[0]]);
    coords.push([coords[0][0],coords[0][1]]);
    return {type:'Polygon',coordinates:[coords]};
  }

  function clearFieldOverview() {
    fieldOverviewLayers.forEach(layer => {
      try { layer.remove(); } catch (_) {}
    });
    fieldOverviewLayers.clear();
  }

  function overviewStyleForField(id) {
    const state = fieldOverviewStates.get(id);
    const baseColor = state?.color || '#94a3b8';

    return {
      weight: id === selectedFieldId ? 4 : 2,
      fillOpacity: id === selectedFieldId ? .24 : .16,
      color: id === selectedFieldId ? '#5BC12F' : baseColor,
      fillColor: baseColor
    };
  }

  function refreshOverviewStyles() {
    fieldOverviewLayers.forEach((layer, id) => {
      try {
        layer.setStyle(
          overviewStyleForField(id)
        );
      } catch (_) {}
    });
  }

  function renderFieldOverview(fields) {
    if (!map) return;

    clearFieldOverview();

    const bounds = [];

    fields.forEach(field => {
      if (!field?.geometry_geojson) return;

      const layer = L.geoJSON(
        field.geometry_geojson,
        {
          style: overviewStyleForField(field.id)
        }
      ).addTo(map);

      fieldOverviewLayers.set(field.id, layer);

      try {
        layer.bindTooltip(
          esc(field.name || field.code || 'Lote'),
          {
            permanent: false,
            direction: 'center',
            className: 'sat-map-lot-label'
          }
        );
      } catch (_) {}

      layer.on('click', event => {
        try { L.DomEvent.stopPropagation(event); } catch (_) {}
        selectField(field.id, fields).catch(fail);
      });

      try {
        const fieldBounds = layer.getBounds();
        if (fieldBounds?.isValid?.()) bounds.push(fieldBounds);
      } catch (_) {}
    });

    if (!selectedFieldId && bounds.length) {
      try {
        const combined = bounds.slice(1).reduce(
          (acc, item) => acc.extend(item),
          bounds[0]
        );
        map.fitBounds(combined, {padding:[28,28]});
      } catch (_) {}
    }
  }

  function farmStateFromObservation(observation) {
    const value = Number(observation?.ndvi_mean);

    if (
      !observation ||
      !(
        observation.quality === 'good' ||
        observation.quality === 'limited'
      ) ||
      !Number.isFinite(value)
    ) {
      return {
        label: 'Sin dato confiable',
        color: '#94a3b8',
        ndvi: null,
        period: null
      };
    }

    let label = 'Muy bajo';
    let color = '#c62828';

    if (value >= 0.65) {
      label = 'Alto';
      color = '#1b5e20';
    } else if (value >= 0.45) {
      label = 'Moderado';
      color = '#7cb342';
    } else if (value >= 0.25) {
      label = 'Bajo';
      color = '#fdd835';
    }

    const period =
      observation.interval_to
        ? new Date(observation.interval_to).toLocaleDateString('es-EC')
        : null;

    return {
      label,
      color,
      ndvi: value,
      period
    };
  }

  function updateFieldOverviewCard(fieldId, state) {
    const card =
      document.querySelector(
        '#satelliteFieldList .sat-field[data-id="' +
        CSS.escape(String(fieldId)) +
        '"]'
      );

    if (!card) return;

    let badge =
      card.querySelector(
        '.sat-field-status'
      );

    if (!badge) {
      badge =
        document.createElement('span');

      badge.className =
        'sat-field-status';

      const info =
        card.querySelector(
          '.sat-field-head > div:first-child'
        );

      info?.appendChild(
        badge
      );
    }

    badge.textContent =
      state.ndvi === null
        ? state.label
        : state.label +
          ' · NDVI ' +
          state.ndvi.toFixed(3) +
          (
            state.period
              ? ' · ' + state.period
              : ''
          );

    badge.style.background =
      state.color + '22';

    badge.style.color =
      state.color;
  }

  async function loadFarmOverviewStates(fields, siteId) {
    if (
      showArchivedFields ||
      !Array.isArray(fields) ||
      !fields.length
    ) {
      return;
    }

    const queue = [...fields];
    const results = new Map();

    async function worker() {
      while (queue.length) {
        const field = queue.shift();
        if (!field) continue;

        try {
          const rows =
            await getApi(
              '/satellite/fields/' +
              encodeURIComponent(field.id) +
              '/observations?limit=36'
            );

          const observations =
            Array.isArray(rows)
              ? rows
              : [];

          const latestUsable =
            observations.find(row =>
              (
                row?.quality === 'good' ||
                row?.quality === 'limited'
              ) &&
              Number.isFinite(
                Number(row?.ndvi_mean)
              )
            ) || null;

          results.set(
            field.id,
            farmStateFromObservation(
              latestUsable
            )
          );

        } catch (_) {
          results.set(
            field.id,
            farmStateFromObservation(
              null
            )
          );
        }
      }
    }

    await Promise.all(
      Array.from(
        {
          length:
            Math.min(
              4,
              fields.length
            )
        },
        () => worker()
      )
    );

    if (
      showArchivedFields ||
      document.getElementById('satSiteSelect')?.value !== siteId
    ) {
      return;
    }

    fieldOverviewStates =
      results;

    refreshOverviewStyles();

    results.forEach(
      (state, fieldId) => {
        updateFieldOverviewCard(
          fieldId,
          state
        );

        const layer =
          fieldOverviewLayers.get(
            fieldId
          );

        if (!layer) return;

        try {
          const field =
            fields.find(
              row =>
                row.id === fieldId
            );

          const tooltip =
            (field?.name || field?.code || 'Lote') +
            '<br>' +
            state.label +
            (
              state.ndvi === null
                ? ''
                : ' · NDVI ' +
                  state.ndvi.toFixed(3)
            ) +
            (
              state.period
                ? '<br>Último dato: ' +
                  state.period
                : ''
            );

          layer.bindTooltip(
            tooltip,
            {
              permanent: false,
              direction: 'center',
              className:
                'sat-map-lot-label'
            }
          );
        } catch (_) {}
      }
    );
  }

  function updateBatchButtons() {
    const checks = [...document.querySelectorAll('#satelliteFieldList .sat-field-check')];
    const checked = checks.filter(input => input.checked);

    const selectAll = document.getElementById('satSelectAllFields');
    const batch = document.getElementById('satBatchSync');
    const farmMap = document.getElementById('satFarmNdviShow');
    const count = document.getElementById('satBatchCount');

    if (count) {
      count.textContent =
        checked.length === 1
          ? '1 seleccionado'
          : checked.length + ' seleccionados';
    }

    if (selectAll) {
      selectAll.disabled = checks.length === 0;
      selectAll.textContent =
        checks.length > 0 && checked.length === checks.length
          ? 'Quitar selección'
          : 'Seleccionar todos';
    }

    if (batch) {
      batch.disabled = checked.length === 0;
      batch.textContent =
        checked.length > 0
          ? 'Analizar ' + checked.length + ' lote' + (checked.length === 1 ? '' : 's')
          : 'Analizar seleccionados';
    }

    if (farmMap) {
      farmMap.disabled =
        (checked.length === 0 && farmNdviOverlays.size === 0) ||
        showArchivedFields;

      farmMap.textContent =
        farmNdviOverlays.size > 0
          ? 'Ocultar NDVI'
          : checked.length > 0
            ? 'Ver NDVI (' + checked.length + ')'
            : 'Ver NDVI';
    }
  }

  async function loadSites() {
    setStatus('Cargando sitios...');
    const rows = await getApi('/satellite/sites');
    const sites = Array.isArray(rows) ? rows : [];
    currentSites = sites;
    const select = document.getElementById('satSiteSelect');
    const previousSiteId = select?.value || '';
    const rememberedSiteId = sessionStorage.getItem('tayuSatelliteSiteId') || '';
    select.innerHTML = sites.length
      ? sites.map(s => '<option value="' + esc(s.id) + '">' + esc(s.name) + ' · ' + esc(s.site_type || 'sitio') + '</option>').join('')
      : '<option value="">Sin sitios disponibles</option>';
    if (previousSiteId && sites.some(s => s.id === previousSiteId)) {
      select.value = previousSiteId;
    } else if (rememberedSiteId && sites.some(s => s.id === rememberedSiteId)) {
      select.value = rememberedSiteId;
    }
    if (select?.value) sessionStorage.setItem('tayuSatelliteSiteId', select.value);
    if (sites.length) {
      centerSelectedSite();
      await loadFields(select?.value || '');
    }
    setStatus('Amelia Satellite listo.', 'ok');
  }

  async function loadFields(siteIdOverride = '') {
    const siteId =
      String(
        siteIdOverride ||
        document.getElementById('satSiteSelect')?.value ||
        ''
      );

    const host =
      document.getElementById('satelliteFieldList');

    if (!siteId) {
      currentFields = [];
      clearFieldOverview();
      if (host) {
        host.innerHTML =
          '<div class="hint">Selecciona una finca / sitio.</div>';
      }
      return;
    }

    const requestSeq =
      ++fieldsRequestSeq;

    const endpoint =
      showArchivedFields
        ? '/satellite/archived-fields?site_id=' + encodeURIComponent(siteId)
        : '/satellite/fields?site_id=' + encodeURIComponent(siteId);

    const rows = await getApi(endpoint);

    // Ignora únicamente respuestas viejas. No dependemos del valor actual
    // del <select>, porque ese guard podía abortar la carga nueva y dejar
    // el mensaje "Cargando lotes..." indefinidamente.
    if (requestSeq !== fieldsRequestSeq) {
      return;
    }

    const allFields = Array.isArray(rows) ? rows : [];

    // Defensa adicional por sitio: aunque el backend ya recibe site_id,
    // si la respuesta incluye site_id filtramos también en frontend para
    // evitar que lotes de otra finca queden visibles por una respuesta stale
    // o por un endpoint que devuelva más registros de los esperados.
    const siteScopedFields =
      allFields.some(field => field?.site_id)
        ? allFields.filter(field => String(field.site_id) === String(siteId))
        : allFields;

    const fields = showArchivedFields
      ? siteScopedFields.filter(field => field?.status === 'archived')
      : siteScopedFields.filter(field => !field?.status || field.status === 'active');

    currentFields = fields;
    fieldOverviewStates = new Map();
    renderFieldOverview(fields);

    const farmLegend = document.getElementById('satFarmLegend');
    if (farmLegend) farmLegend.style.display = showArchivedFields ? 'none' : 'flex';

    const batchActions = document.getElementById('satBatchActions');
    if (batchActions) batchActions.style.display = showArchivedFields ? 'none' : 'flex';

    const activeTab = document.getElementById('satActiveFieldsTab');
    const archivedTab = document.getElementById('satArchivedFieldsTab');
    activeTab?.classList.toggle('active', !showArchivedFields);
    archivedTab?.classList.toggle('active', showArchivedFields);

    if (!host) return;

    host.innerHTML = fields.length
      ? fields.map(f => {
          const actions = showArchivedFields
            ? '<button data-action="restore" data-id="' + esc(f.id) + '">Restaurar lote</button>' +
              '<button class="danger" data-action="delete" data-id="' + esc(f.id) + '">Eliminar definitivamente</button>'
            : '<button data-action="archive" data-id="' + esc(f.id) + '">Archivar lote</button>' +
              '<button class="danger" data-action="delete" data-id="' + esc(f.id) + '">Eliminar definitivamente</button>';

          const checkbox = showArchivedFields
            ? ''
            : '<input class="sat-field-check" type="checkbox" data-id="' + esc(f.id) + '" aria-label="Seleccionar ' + esc(f.name) + '">';

          return '<div class="sat-field" data-id="' + esc(f.id) + '">' +
            '<div class="sat-field-row">' +
              checkbox +
              '<div>' +
                '<div class="sat-field-head"><div><b>' + esc(f.name) + '</b><div><small>' + esc(f.code) + ' · ' + esc(f.crop_type || 'Sin cultivo') + ' · ' + Number(f.area_hectares||0).toFixed(2) + ' ha</small></div></div>' +
                '<div class="sat-field-menu-wrap"><button class="sat-field-menu-btn" type="button" aria-label="Acciones del lote">⋮</button><div class="sat-field-menu">' + actions + '</div></div></div>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('')
      : '<div class="hint">' + (showArchivedFields ? 'No hay lotes archivados.' : 'Aún no hay lotes satelitales.') + '</div>';

    host.querySelectorAll('.sat-field').forEach(el =>
      el.addEventListener('click', event => {
        if (
          event.target?.closest?.('.sat-field-check') ||
          event.target?.closest?.('.sat-field-menu-wrap')
        ) return;

        if (showArchivedFields) return;
        selectField(el.dataset.id, fields).catch(fail);
      })
    );

    host.querySelectorAll('.sat-field-check').forEach(input =>
      input.addEventListener('change', updateBatchButtons)
    );

    host.querySelectorAll('.sat-field-menu-btn').forEach(button =>
      button.addEventListener('click', event => {
        event.stopPropagation();
        const menu = button.parentElement?.querySelector('.sat-field-menu');
        document.querySelectorAll('#satellite .sat-field-menu.open').forEach(item => {
          if (item !== menu) item.classList.remove('open');
        });
        menu?.classList.toggle('open');
      })
    );

    host.querySelectorAll('.sat-field-menu [data-action]').forEach(button =>
      button.addEventListener('click', event => {
        event.stopPropagation();
        const action = button.dataset.action;
        const id = button.dataset.id;
        manageField(id, action).catch(fail);
      })
    );

    updateBatchButtons();

    loadFarmOverviewStates(
      fields,
      siteId
    ).catch(error => {
      console.warn(
        'Amelia Satellite overview:',
        error
      );
    });

    if (selectedFieldId && fields.some(f => f.id === selectedFieldId)) {
      await selectField(selectedFieldId, fields);
    } else if (selectedFieldId) {
      selectedFieldId = null;
      selectedFieldData = null;
      renderSelectedLotSummary(null);
      refreshOverviewStyles();
    }
  }

  async function manageField(fieldId, action) {
    const field = currentFields.find(row => row.id === fieldId);
    const fieldName = field?.name || field?.code || 'este lote';

    if (action === 'archive') {
      if (!window.confirm('¿Archivar "' + fieldName + '"? El historial se conservará y podrás restaurarlo después.')) return;
      await postApi('/satellite/fields/' + encodeURIComponent(fieldId) + '/archive', {});
      if (selectedFieldId === fieldId) selectedFieldId = null;
      setStatus('Lote archivado. Su historial se conserva.', 'ok');
      await loadFields();
      return;
    }

    if (action === 'restore') {
      await postApi('/satellite/fields/' + encodeURIComponent(fieldId) + '/restore', {});
      setStatus('Lote restaurado.', 'ok');
      await loadFields();
      return;
    }

    if (action === 'delete') {
      const confirmed = window.confirm(
        '¿Eliminar definitivamente "' + fieldName + '"?\n\nSe borrará el lote y TODO su historial satelital. Esta acción no se puede deshacer.'
      );

      if (!confirmed) return;

      const secondConfirmed = window.confirm(
        'Confirmación final: ¿eliminar permanentemente "' + fieldName + '"?'
      );

      if (!secondConfirmed) return;

      await postApi(
        '/satellite/fields/' + encodeURIComponent(fieldId) + '/delete',
        {confirm:true}
      );

      if (selectedFieldId === fieldId) {
        selectedFieldId = null;
        clearDraw();
        renderObservations([]);
      }

      setStatus('Lote eliminado definitivamente.', 'ok');
      await loadFields();
    }
  }

  async function selectField(id, fields) {
    selectedFieldId = id;
    document.querySelectorAll('#satelliteFieldList .sat-field').forEach(el => el.classList.toggle('active', el.dataset.id === id));
    refreshOverviewStyles();
    document.getElementById('satSync').disabled = false;
    document.getElementById('satNdviMapButton').disabled = true;
    document.getElementById('satCompareToggle').disabled = true;
    document.getElementById('satCompareRun').disabled = true;
    datePeriods = [];
    calendarObservations = [];
    datePeriodIndex = -1;
    sceneRows = [];
    sceneSelectedIndex = -1;
    scenesError = '';
    scenesLoading = false;
    sceneRasterBusy = false;
    sceneRasterError = '';
    clearSceneRaster();
    sceneRequestSeq++;
    renderScenes();
    renderDateNavigator();
    let field = fields.find(f => f.id === id);
    if (!field) field = await getApi('/satellite/fields/' + encodeURIComponent(id));
    renderSelectedLotSummary(field);

    const codeInput = document.getElementById('satFieldCode');
    const cropInput = document.getElementById('satCropType');
    const nameInput = document.getElementById('satFieldName');
    const areaInput = document.getElementById('satArea');

    if (codeInput) codeInput.value = field?.code || '';
    if (cropInput) cropInput.value = field?.crop_type || '';
    if (nameInput) nameInput.value = field?.name || '';
    if (areaInput) areaInput.value = Number(field?.area_hectares || 0).toFixed(2);

    if (field?.geometry_geojson && map) {
      clearLayers();
      polygon = L.geoJSON(field.geometry_geojson,{style:{weight:3,fillOpacity:.18}}).addTo(map);
      try { map.fitBounds(polygon.getBounds(),{padding:[24,24]}); } catch (_) {}
    }
    document.getElementById('satKpiArea').textContent = Number(field?.area_hectares||0).toFixed(2);
    await loadObservations(id);
    if (datePeriods.length) {
      try { await loadNdviOverlay({silent:true}); }
      catch (error) { console.warn('Amelia Satellite auto NDVI:', error); }
    }
  }

  async function saveField() {
    if (selectedFieldId) throw new Error('Este lote ya existe. No se creará un duplicado.');
    const siteId = document.getElementById('satSiteSelect')?.value;
    const code = document.getElementById('satFieldCode')?.value.trim();
    const name = document.getElementById('satFieldName')?.value.trim();
    const crop = document.getElementById('satCropType')?.value.trim();
    const area = Number(document.getElementById('satArea')?.value||0);
    const geometry = geojson();
    if (!siteId || !code || !name || !geometry || !(area>0)) throw new Error('Completa sitio, código, nombre y polígono.');
    const result = await postApi('/satellite/fields',{site_id:siteId,code,name,crop_type:crop||null,geometry_geojson:geometry,area_hectares:area});
    selectedFieldId = result?.id || null;
    selectedFieldData = result || null;
    showNewLotForm(false);
    setStatus('Lote guardado.', 'ok');
    await loadFields();
  }

  async function syncOneField(fieldId, interval) {
    const intervalDays = interval === 'P10D' ? 10 : 5;
    const dayMs = 24 * 60 * 60 * 1000;
    const todayUtcDay = Math.floor(Date.now() / dayMs);
    const alignedToDay = Math.floor(todayUtcDay / intervalDays) * intervalDays;
    const to = new Date(alignedToDay * dayMs);
    const recentFrom = new Date(to.getTime() - (30 * dayMs));

    let result = await postApi(
      '/satellite/fields/' + encodeURIComponent(fieldId) + '/sync',
      {
        from: recentFrom.toISOString(),
        to: to.toISOString(),
        aggregationInterval: interval,
        maxCloudCoverage: 100
      }
    );

    const hasUsableObservation = value =>
      Array.isArray(value?.observations) &&
      value.observations.some(row =>
        row?.quality === 'good' ||
        row?.quality === 'limited'
      );

    let usedFallback = false;

    if (!hasUsableObservation(result)) {
      usedFallback = true;

      const historicalFrom =
        new Date(
          to.getTime() -
          (120 * dayMs)
        );

      result = await postApi(
        '/satellite/fields/' + encodeURIComponent(fieldId) + '/sync',
        {
          from: historicalFrom.toISOString(),
          to: to.toISOString(),
          aggregationInterval: interval,
          maxCloudCoverage: 100
        }
      );
    }

    const saved = Number(result?.saved || 0);
    const skippedNoData = Number(result?.skipped_no_data || 0);
    const usableCount = Array.isArray(result?.observations)
      ? result.observations.filter(row => row?.quality === 'good' || row?.quality === 'limited').length
      : 0;

    return {
      result,
      usedFallback,
      saved,
      skippedNoData,
      usableCount
    };
  }

  async function syncField() {
    if (!selectedFieldId) throw new Error('Selecciona un lote.');

    const interval = 'P5D';

    setStatus('Procesando imágenes satelitales...');

    const summary =
      await syncOneField(
        selectedFieldId,
        interval
      );

    if (summary.usableCount > 0) {
      setStatus(
        (summary.usedFallback ? 'Se amplió la búsqueda histórica. ' : '') +
        'Análisis completado: ' + summary.usableCount + ' periodos utilizables' +
        (summary.skippedNoData > 0 ? ' y ' + summary.skippedNoData + ' sin datos útiles.' : '.'),
        'ok'
      );
    } else if (summary.saved > 0) {
      setStatus(
        'Se encontraron datos recientes, pero su calidad es baja. Se muestran en el historial y no se usarán para el mapa NDVI.',
        'error'
      );
    } else {
      setStatus(
        'No se encontraron periodos satelitales utilizables para este lote en la ventana consultada.',
        'error'
      );
    }

    await loadObservations(selectedFieldId);

    const siteId =
      document.getElementById('satSiteSelect')?.value;

    if (
      siteId &&
      !showArchivedFields &&
      currentFields.length
    ) {
      await loadFarmOverviewStates(
        currentFields,
        siteId
      );
    }
  }

  async function syncSelectedFields() {
    const selectedIds =
      [...document.querySelectorAll('#satelliteFieldList .sat-field-check:checked')]
        .map(input => input.dataset.id)
        .filter(Boolean);

    if (!selectedIds.length) {
      throw new Error('Selecciona al menos un lote.');
    }

    const interval = 'P5D';

    const button =
      document.getElementById('satBatchSync');

    if (button) button.disabled = true;

    let completed = 0;
    let usable = 0;
    let lowQuality = 0;
    let failed = 0;

    for (const fieldId of selectedIds) {
      const field =
        currentFields.find(row => row.id === fieldId);

      setStatus(
        'Analizando lote ' +
        (field?.name || (completed + 1)) +
        ' (' + (completed + 1) + '/' + selectedIds.length + ')...'
      );

      try {
        const summary =
          await syncOneField(
            fieldId,
            interval
          );

        if (summary.usableCount > 0) usable++;
        else if (summary.saved > 0) lowQuality++;

      } catch (error) {
        console.error(
          'Amelia Satellite batch:',
          fieldId,
          error
        );
        failed++;
      }

      completed++;
    }

    setStatus(
      'Análisis múltiple completado: ' +
      usable + ' lote(s) con datos utilizables' +
      (lowQuality ? ', ' + lowQuality + ' con baja calidad' : '') +
      (failed ? ', ' + failed + ' con error' : '') +
      '.',
      failed ? 'error' : 'ok'
    );

    if (button) button.disabled = false;

    if (selectedFieldId) {
      await loadObservations(selectedFieldId);
    }

    const siteId =
      document.getElementById('satSiteSelect')?.value;

    if (
      siteId &&
      !showArchivedFields &&
      currentFields.length
    ) {
      await loadFarmOverviewStates(
        currentFields,
        siteId
      );
    }

    updateBatchButtons();
  }

  async function loadObservations(id) {
    // El historial P5D y las escenas reales se consultan en paralelo:
    // un fallo o interrupción del gráfico NDVI no bloquea el radar/S2.
    const historicTask = (async () => {
      const rows = await getApi('/satellite/fields/' + encodeURIComponent(id) + '/observations?limit=36');
      if (selectedFieldId !== id) return;
      renderObservations(Array.isArray(rows) ? rows : []);
    })();
    const sceneTask = loadScenes(id);
    const results = await Promise.allSettled([historicTask, sceneTask]);
    if (results[0].status === 'rejected') throw results[0].reason;
    if (results[1].status === 'rejected') console.warn('Amelia Satellite scene loader:', results[1].reason);
  }

  async function loadFarmNdviMaps() {
    const selectedIds =
      [...document.querySelectorAll('#satelliteFieldList .sat-field-check:checked')]
        .map(input => input.dataset.id)
        .filter(Boolean);

    if (!selectedIds.length) {
      throw new Error('Selecciona al menos un lote.');
    }

    clearNdviOverlay();
    clearFarmNdviOverlays();

    const showButton =
      document.getElementById('satFarmNdviShow');

    if (showButton) showButton.disabled = true;

    setStatus(
      'Cargando mapas NDVI de ' +
      selectedIds.length +
      ' lote(s)...'
    );

    const queue = [...selectedIds];
    const loadedBounds = [];
    let loaded = 0;
    let unavailable = 0;
    let failed = 0;

    async function worker() {
      while (queue.length) {
        const fieldId = queue.shift();
        if (!fieldId) continue;

        const field =
          currentFields.find(
            row =>
              row.id === fieldId
          );

        try {
          const result =
            await getApi(
              periodPath(
                fieldId,
                ''
              )
            );

          const bounds =
            mapBounds(
              result
            );

          const overlay =
            L.imageOverlay(
              result.image_data_url,
              bounds,
              {
                opacity: .76,
                interactive: false,
                crossOrigin: false
              }
            ).addTo(map);

          farmNdviOverlays.set(
            fieldId,
            overlay
          );

          loadedBounds.push(
            L.latLngBounds(
              bounds
            )
          );

          loaded++;

        } catch (error) {
          const message =
            String(
              error?.message ||
              ''
            ).toLowerCase();

          if (
            message.includes('not found') ||
            message.includes('no usable') ||
            message.includes('no se')
          ) {
            unavailable++;
          } else {
            failed++;
            console.warn(
              'Amelia Satellite farm NDVI:',
              field?.name || fieldId,
              error
            );
          }
        }
      }
    }

    await Promise.all(
      Array.from(
        {
          length:
            Math.min(
              3,
              selectedIds.length
            )
        },
        () => worker()
      )
    );

    fieldOverviewLayers.forEach(layer => {
      try { layer.bringToFront?.(); } catch (_) {}
    });

    document.getElementById('satNdviLegend')?.classList.toggle(
      'open',
      loaded > 0
    );

    if (
      loadedBounds.length &&
      map
    ) {
      try {
        const combined =
          loadedBounds
            .slice(1)
            .reduce(
              (acc, item) =>
                acc.extend(
                  item
                ),
              loadedBounds[0]
            );

        map.fitBounds(
          combined,
          {
            padding:
              [28,28]
          }
        );
      } catch (_) {}
    }

    if (showButton) {
      showButton.disabled = false;
      showButton.textContent = loaded > 0 ? 'Ocultar NDVI' : 'Ver NDVI';
    }

    setStatus(
      'Mapa NDVI de finca: ' +
      loaded +
      ' lote(s) cargados' +
      (
        unavailable
          ? ', ' +
            unavailable +
            ' sin periodo confiable'
          : ''
      ) +
      (
        failed
          ? ', ' +
            failed +
            ' con error'
          : ''
      ) +
      '.',
      failed
        ? 'error'
        : 'ok'
    );
  }

  async function loadNdviOverlay(options = {}) {
    if (!selectedFieldId) throw new Error('Selecciona un lote.');

    const selectedPeriod =
      datePeriodIndex >= 0
        ? datePeriods[datePeriodIndex]
        : null;

    if (!options.silent) setStatus('Cargando mapa NDVI...');

    const result = await getApi(
      periodPath(
        selectedFieldId,
        selectedPeriod?.value || ''
      )
    );
    const bounds = mapBounds(result);

    clearFarmNdviOverlays();
    clearNdviOverlay();

    ndviOverlay = L.imageOverlay(
      result.image_data_url,
      bounds,
      {
        opacity: .74,
        interactive: false,
        crossOrigin: false
      }
    ).addTo(map);

    document.getElementById('satNdviLegend')?.classList.add('open');
    try { polygon?.bringToFront?.(); } catch (_) {}
    try { map.fitBounds(bounds, {padding:[24,24]}); } catch (_) {}

    if (!options.silent) setStatus('Mapa NDVI cargado: ' + formatMapPeriod(result) + '.', 'ok');
  }

  async function runComparison() {
    if (!selectedFieldId) throw new Error('Selecciona un lote.');

    const beforeValue =
      comparePeriods[compareBeforeIndex]?.value ||
      '';

    const afterValue =
      comparePeriods[compareAfterIndex]?.value ||
      '';

    if (!beforeValue || !afterValue) {
      throw new Error('Selecciona los periodos Antes y Después.');
    }

    if (compareBeforeIndex >= compareAfterIndex) {
      throw new Error('El periodo Antes debe ser anterior al periodo Después.');
    }

    setStatus('Generando comparación Antes vs Después...');

    const [beforeResult, afterResult] = await Promise.all([
      getApi(periodPath(selectedFieldId, beforeValue)),
      getApi(periodPath(selectedFieldId, afterValue))
    ]);

    const beforeBounds = mapBounds(beforeResult);
    const afterBounds = mapBounds(afterResult);

    clearFarmNdviOverlays();
    clearNdviOverlay();

    compareBeforeOverlay = L.imageOverlay(
      beforeResult.image_data_url,
      beforeBounds,
      {
        opacity: .78,
        interactive: false,
        crossOrigin: false
      }
    ).addTo(map);

    compareAfterOverlay = L.imageOverlay(
      afterResult.image_data_url,
      afterBounds,
      {
        opacity: .78,
        interactive: false,
        crossOrigin: false
      }
    ).addTo(map);

    const compareControl = document.getElementById('satCompareControl');
    compareControl?.classList.add('open');

    const beforeLabel = document.getElementById('satCompareBeforeLabel');
    const afterLabel = document.getElementById('satCompareAfterLabel');

    if (beforeLabel) {
      beforeLabel.textContent = 'ANTES · ' + formatMapPeriod(beforeResult);
      beforeLabel.style.display = 'block';
    }

    if (afterLabel) {
      afterLabel.textContent = 'DESPUÉS · ' + formatMapPeriod(afterResult);
      afterLabel.style.display = 'block';
    }

    document.getElementById('satNdviLegend')?.classList.add('open');

    setComparePosition(50);

    try { polygon?.bringToFront?.(); } catch (_) {}
    try { map.fitBounds(beforeBounds, {padding:[24,24]}); } catch (_) {}

    setStatus('Comparación cargada. El deslizador inferior controla la misma posición relativa dentro del raster aunque muevas el mapa.', 'ok');
  }

  function comparePeriodText(period) {
    if (!period) return 'Sin periodo';

    const from =
      new Date(
        period.interval_from
      ).toLocaleDateString(
        'es-EC'
      );

    const to =
      new Date(
        period.interval_to
      ).toLocaleDateString(
        'es-EC'
      );

    return from + ' → ' + to;
  }

  function updateCompareTimeline(changed) {
    const count =
      comparePeriods.length;

    const beforeRange =
      document.getElementById(
        'satCompareBeforeRange'
      );

    const afterRange =
      document.getElementById(
        'satCompareAfterRange'
      );

    const compareRun =
      document.getElementById(
        'satCompareRun'
      );

    if (
      !beforeRange ||
      !afterRange
    ) {
      return;
    }

    const max =
      Math.max(
        1,
        count - 1
      );

    beforeRange.max =
      String(max);

    afterRange.max =
      String(max);

    if (count < 2) {
      compareBeforeIndex = 0;
      compareAfterIndex = 1;
      beforeRange.value = '0';
      afterRange.value = '1';
      beforeRange.disabled = true;
      afterRange.disabled = true;

      if (compareRun) {
        compareRun.disabled = true;
      }

    } else {
      if (changed === 'before') {
        compareBeforeIndex =
          Math.min(
            Number(
              beforeRange.value
            ),
            compareAfterIndex - 1
          );
      }

      if (changed === 'after') {
        compareAfterIndex =
          Math.max(
            Number(
              afterRange.value
            ),
            compareBeforeIndex + 1
          );
      }

      compareBeforeIndex =
        Math.max(
          0,
          Math.min(
            compareBeforeIndex,
            count - 2
          )
        );

      compareAfterIndex =
        Math.max(
          compareBeforeIndex + 1,
          Math.min(
            compareAfterIndex,
            count - 1
          )
        );

      beforeRange.value =
        String(
          compareBeforeIndex
        );

      afterRange.value =
        String(
          compareAfterIndex
        );

      beforeRange.disabled = false;
      afterRange.disabled = false;

      if (compareRun) {
        compareRun.disabled = false;
      }
    }

    const before =
      comparePeriods[
        compareBeforeIndex
      ];

    const after =
      comparePeriods[
        compareAfterIndex
      ];

    const beforeText =
      document.getElementById(
        'satCompareBeforeText'
      );

    const afterText =
      document.getElementById(
        'satCompareAfterText'
      );

    const beforeQuality =
      document.getElementById(
        'satCompareBeforeQuality'
      );

    const afterQuality =
      document.getElementById(
        'satCompareAfterQuality'
      );

    if (beforeText) {
      beforeText.textContent =
        comparePeriodText(
          before
        );
    }

    if (afterText) {
      afterText.textContent =
        comparePeriodText(
          after
        );
    }

    if (beforeQuality) {
      beforeQuality.textContent =
        before
          ? qualityLabel(
              before.quality
            )
          : '—';
    }

    if (afterQuality) {
      afterQuality.textContent =
        after
          ? qualityLabel(
              after.quality
            )
          : '—';
    }

    const start =
      document.getElementById(
        'satCompareAxisStart'
      );

    const end =
      document.getElementById(
        'satCompareAxisEnd'
      );

    if (start) {
      start.textContent =
        comparePeriods[0]
          ? new Date(
              comparePeriods[0]
                .interval_from
            ).toLocaleDateString(
              'es-EC'
            )
          : '—';
    }

    if (end) {
      end.textContent =
        comparePeriods[
          count - 1
        ]
          ? new Date(
              comparePeriods[
                count - 1
              ].interval_to
            ).toLocaleDateString(
              'es-EC'
            )
          : '—';
    }

    const ticks =
      document.getElementById(
        'satCompareTicks'
      );

    if (ticks) {
      ticks.innerHTML =
        count
          ? comparePeriods
              .map(
                () =>
                  '<i class="sat-compare-tick"></i>'
              )
              .join('')
          : '';
    }

    const selected =
      document.getElementById(
        'satCompareSelected'
      );

    if (selected) {
      if (count < 2) {
        selected.style.left = '0%';
        selected.style.width = '0%';
      } else {
        const denominator =
          count - 1;

        const left =
          (
            compareBeforeIndex /
            denominator
          ) *
          100;

        const right =
          (
            compareAfterIndex /
            denominator
          ) *
          100;

        selected.style.left =
          left + '%';

        selected.style.width =
          Math.max(
            0,
            right - left
          ) + '%';
      }
    }
  }

  function ndviLabel(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return {label:'—', note:'Sin datos suficientes.'};
    if (v >= 0.65) return {label:'Alto', note:'Cobertura vegetal relativamente vigorosa en este periodo.'};
    if (v >= 0.45) return {label:'Moderado', note:'Vigor vegetal intermedio; conviene seguir la tendencia.'};
    if (v >= 0.25) return {label:'Bajo', note:'Índice relativamente bajo; revisar junto con clima, manejo y cultivo.'};
    return {label:'Muy bajo', note:'Señal vegetal baja o suelo/agua expuestos. Requiere contexto de campo.'};
  }

  function ndmiLabel(value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return {label:'—', note:'Sin datos suficientes.'};
    if (v >= 0.30) return {label:'Alta', note:'Índice de humedad relativamente alto para este periodo.'};
    if (v >= 0.10) return {label:'Moderada', note:'Nivel de humedad relativo intermedio.'};
    if (v >= 0.00) return {label:'Baja positiva', note:'Humedad relativa baja, pero aún en valores positivos.'};
    return {label:'Muy baja', note:'Índice de humedad negativo; revisar junto con lluvia, riego y tipo de cultivo.'};
  }

  function qualityLabel(value) {
    const labels = {
      good:'Buena calidad',
      limited:'Calidad limitada',
      poor:'Baja calidad',
      no_data:'Sin datos'
    };
    return labels[value] || value || 'Sin análisis';
  }

  function renderObservations(rows) {
    const qualityRank = {
      good: 3,
      limited: 2,
      poor: 1,
      no_data: 0
    };

    // La API puede contener análisis antiguos con horas distintas
    // pero el mismo rango visible. Amelia muestra solo la mejor fila
    // por par de fechas para evitar duplicados en tabla/selectores.
    const dedupedByDay = new Map();

    [...rows].forEach(row => {
      const from = row?.interval_from ? new Date(row.interval_from) : null;
      const to = row?.interval_to ? new Date(row.interval_to) : null;

      const key =
        from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime())
          ? from.toISOString().slice(0,10) + '|' + to.toISOString().slice(0,10)
          : String(row?.id || Math.random());

      const current = dedupedByDay.get(key);

      if (!current) {
        dedupedByDay.set(key, row);
        return;
      }

      const currentRank = qualityRank[current?.quality] ?? -1;
      const nextRank = qualityRank[row?.quality] ?? -1;
      const currentValid = Number(current?.valid_pixel_percent ?? -1);
      const nextValid = Number(row?.valid_pixel_percent ?? -1);
      const currentTime = new Date(current?.interval_from || 0).getTime();
      const nextTime = new Date(row?.interval_from || 0).getTime();

      if (
        nextRank > currentRank ||
        (nextRank === currentRank && nextValid > currentValid) ||
        (nextRank === currentRank && nextValid === currentValid && nextTime > currentTime)
      ) {
        dedupedByDay.set(key, row);
      }
    });

    const sorted = [...dedupedByDay.values()]
      .sort((a,b)=>new Date(a.interval_from||0)-new Date(b.interval_from||0));

    const observed = sorted.filter(r =>
      Number.isFinite(Number(r.ndvi_mean)) &&
      Number.isFinite(Number(r.ndmi_mean))
    );

    const usable = observed.filter(r =>
      r.quality === 'good' ||
      r.quality === 'limited'
    );

    const latestUsable = usable[usable.length - 1] || null;
    const previous = usable.length > 1 ? usable[usable.length - 2] : null;
    const latestObserved = observed[observed.length - 1] || null;
    const displayLatest = latestObserved || latestUsable;
    const fmt = v => Number.isFinite(Number(v)) ? Number(v).toFixed(3) : '—';

    const ndviInfo = ndviLabel(latestUsable?.ndvi_mean);
    const ndmiInfo = ndmiLabel(latestUsable?.ndmi_mean);

    const rememberedDateValue = datePeriods[datePeriodIndex]?.value || '';
    calendarObservations = sorted.map(row => ({...row,value:periodValue(row)}));
    datePeriods = usable
      .filter(row => row.interval_from && row.interval_to)
      .sort((a,b)=>new Date(a.interval_to||0)-new Date(b.interval_to||0))
      .map(row => ({...row,value:periodValue(row)}));
    const rememberedDateIndex = datePeriods.findIndex(row => row.value === rememberedDateValue);
    datePeriodIndex = rememberedDateIndex >= 0 ? rememberedDateIndex : datePeriods.length - 1;
    if (datePeriodIndex >= 0) setCalendarCursorFromPeriod(datePeriods[datePeriodIndex]);
    renderDateNavigator();

    const ndviMapButton = document.getElementById('satNdviMapButton');
    const mapPeriods = [...usable]
      .filter(r => r.interval_from && r.interval_to)
      .sort((a,b)=>new Date(b.interval_to||0)-new Date(a.interval_to||0));

    if (ndviMapButton) {
      ndviMapButton.disabled = mapPeriods.length === 0;
    }

    const compareToggle = document.getElementById('satCompareToggle');

    const previousBeforeValue =
      comparePeriods[
        compareBeforeIndex
      ]?.value || '';

    const previousAfterValue =
      comparePeriods[
        compareAfterIndex
      ]?.value || '';

    comparePeriods =
      [...mapPeriods]
        .sort(
          (a,b) =>
            new Date(
              a.interval_to || 0
            ) -
            new Date(
              b.interval_to || 0
            )
        )
        .map(r => ({
          ...r,
          value:
            String(
              r.interval_from
            ) +
            '|' +
            String(
              r.interval_to
            )
        }));

    const rememberedBefore =
      comparePeriods.findIndex(
        item =>
          item.value ===
          previousBeforeValue
      );

    const rememberedAfter =
      comparePeriods.findIndex(
        item =>
          item.value ===
          previousAfterValue
      );

    if (
      rememberedBefore >= 0 &&
      rememberedAfter >= 0 &&
      rememberedBefore <
        rememberedAfter
    ) {
      compareBeforeIndex =
        rememberedBefore;

      compareAfterIndex =
        rememberedAfter;

    } else {
      compareBeforeIndex = 0;
      compareAfterIndex =
        Math.max(
          1,
          comparePeriods.length - 1
        );
    }

    updateCompareTimeline();

    if (compareToggle) {
      compareToggle.disabled =
        comparePeriods.length < 2;
    }

    document.getElementById('satKpiNdvi').textContent = fmt(displayLatest?.ndvi_mean);
    document.getElementById('satKpiNdmi').textContent = fmt(displayLatest?.ndmi_mean);
    document.getElementById('satKpiValid').textContent = displayLatest?.valid_pixel_percent == null ? '—' : Number(displayLatest.valid_pixel_percent).toFixed(1) + '%';
    document.getElementById('satKpiQuality').textContent = qualityLabel(displayLatest?.quality);

    const latestHint =
      displayLatest?.quality === 'poor'
        ? 'Último periodo · baja confianza'
        : displayLatest
          ? 'Último periodo observado'
          : 'Sin datos';

    document.getElementById('satKpiNdviHint').textContent = latestHint;
    document.getElementById('satKpiNdmiHint').textContent = latestHint;

    document.getElementById('satInsightVigor').textContent = ndviInfo.label;
    document.getElementById('satInsightVigorNote').textContent = ndviInfo.note;
    document.getElementById('satInsightMoisture').textContent = ndmiInfo.label;
    document.getElementById('satInsightMoistureNote').textContent = ndmiInfo.note;

    const trendEl = document.getElementById('satInsightTrend');
    const trendNoteEl = document.getElementById('satInsightTrendNote');
    if (latestUsable && previous) {
      const current = Number(latestUsable.ndvi_mean);
      const prior = Number(previous.ndvi_mean);
      const delta = current - prior;
      const pct = Math.abs(prior) > 0.0001 ? (delta / Math.abs(prior)) * 100 : null;
      const arrow = delta > 0.005 ? '▲' : delta < -0.005 ? '▼' : '→';
      trendEl.textContent = arrow + ' ' + (pct == null ? delta.toFixed(3) : Math.abs(pct).toFixed(1) + '%');
      trendNoteEl.textContent =
        'NDVI ' + (delta > 0.005 ? 'subió' : delta < -0.005 ? 'bajó' : 'se mantuvo estable') +
        ' ' + Math.abs(delta).toFixed(3) +
        ' puntos respecto al periodo anterior.';
    } else {
      trendEl.textContent = '—';
      trendNoteEl.textContent = 'Se necesitan al menos dos periodos utilizables.';
    }

    if (datePeriodIndex >= 0 && datePeriods[datePeriodIndex]) {
      applySelectedObservationMetrics(
        datePeriods[datePeriodIndex],
        datePeriodIndex
      );
    }

    const body = document.getElementById('satelliteObservationsBody');
    body.innerHTML = sorted.length ? sorted.map(r => {
      const from = r.interval_from ? new Date(r.interval_from).toLocaleDateString('es-EC') : '—';
      const to = r.interval_to ? new Date(r.interval_to).toLocaleDateString('es-EC') : '—';
      const q = esc(r.quality || 'no_data');
      return '<tr><td>' + from + ' → ' + to + '</td><td><span class="sat-badge ' + q + '">' + esc(qualityLabel(r.quality)) + '</span></td><td>' + (r.valid_pixel_percent==null?'—':Number(r.valid_pixel_percent).toFixed(1)+'%') + '</td><td>' + fmt(r.ndvi_mean) + '</td><td>' + fmt(r.ndmi_mean) + '</td></tr>';
    }).join('') : '<tr><td colspan="5">Sin datos.</td></tr>';

    if (!window.Chart) return;
    const canvas = document.getElementById('satelliteTrendChart');
    if (!canvas) return;
    if (chart) { try { chart.destroy(); } catch (_) {} }
    const chartRows = sorted.filter(r => Number.isFinite(Number(r.ndvi_mean)) && Number.isFinite(Number(r.ndmi_mean)));
    chart = new Chart(canvas,{
      type:'line',
      data:{
        labels:chartRows.map(r=>new Date(r.interval_to).toLocaleDateString('es-EC',{day:'2-digit',month:'short'})),
        datasets:[
          {label:'NDVI',data:chartRows.map(r=>Number(r.ndvi_mean)),tension:.28},
          {label:'NDMI',data:chartRows.map(r=>Number(r.ndmi_mean)),tension:.28}
        ]
      },
      options:{responsive:true,maintainAspectRatio:false,animation:false,scales:{y:{min:-1,max:1}}}
    });
    window.applyTayuChartTheme?.();
  }

  function bind() {
    document.getElementById('satRefresh')?.addEventListener('click',()=>loadSites().catch(fail));
    document.getElementById('satLocationSearchButton')?.addEventListener('click',()=>searchLocation().catch(fail));
    document.getElementById('satLocationSearch')?.addEventListener('keydown',event=>{
      if(event.key==='Enter'){
        event.preventDefault();
        searchLocation().catch(fail);
      }
    });
    document.addEventListener('click', event => {
      if (!event.target?.closest?.('.sat-search')) closeSearchResults();
      if (!event.target?.closest?.('.sat-date-nav')) closeCalendar();
      if (!event.target?.closest?.('.sat-field-menu-wrap')) {
        document.querySelectorAll('#satellite .sat-field-menu.open')
          .forEach(menu => menu.classList.remove('open'));
      }
    });
    document.getElementById('satDrawStart')?.addEventListener('click',startDraw);
    document.getElementById('satDrawUndo')?.addEventListener('click',()=>{if(points.length){points.pop();markers.pop()?.remove();redraw();}});
    document.getElementById('satDrawFinish')?.addEventListener('click',finishDraw);
    document.getElementById('satDrawClear')?.addEventListener('click',clearDraw);
    document.getElementById('satNdviMapButton')?.addEventListener('click',()=>loadNdviOverlay().catch(fail));
    document.getElementById('satSatelliteViewButton')?.addEventListener('click',()=>{
      clearNdviOverlay();
      clearFarmNdviOverlays();
      try { if (polygon?.getBounds) map?.fitBounds(polygon.getBounds(),{padding:[24,24]}); } catch (_) {}
      setStatus('Vista satelital activa.', 'ok');
    });
    document.getElementById('satHistoryJump')?.addEventListener('click',()=>{
      document.getElementById('satelliteHistoryCard')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    document.getElementById('satDatePrev')?.addEventListener('click',()=>selectDatePeriod(datePeriodIndex-1).catch(fail));
    document.getElementById('satDateNext')?.addEventListener('click',()=>selectDatePeriod(datePeriodIndex+1).catch(fail));
    document.getElementById('satDateCurrent')?.addEventListener('click',()=>{
      const popover = document.getElementById('satCalendarPopover');
      if (!popover) return;
      const open = !popover.classList.contains('open');
      popover.classList.toggle('open',open);
      document.getElementById('satDateCurrent')?.setAttribute('aria-expanded',open?'true':'false');
      if (open) renderCalendar();
    });
    document.getElementById('satCalendarPrevMonth')?.addEventListener('click',()=>{
      calendarCursor = new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1,12,0,0);
      renderCalendar();
    });
    document.getElementById('satCalendarNextMonth')?.addEventListener('click',()=>{
      calendarCursor = new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1,12,0,0);
      renderCalendar();
    });
    document.getElementById('satCalendarGrid')?.addEventListener('click',event=>{
      const button = event.target?.closest?.('.sat-calendar-day[data-period-index]');
      if (!button || button.disabled) return;
      const periodIndex = Number(button.dataset.periodIndex);
      const sceneIndex = sceneRows.findIndex(row => sceneDay(row) === button.dataset.sceneDay);
      if (sceneIndex >= 0 && (periodIndex < 0 || event.target?.closest?.('.sat-scene-flags'))) {
        sceneDetail(sceneIndex);
        closeCalendar();
      } else if (periodIndex >= 0) {
        selectDatePeriod(periodIndex).catch(fail);
      }
    });
    document.getElementById('satSceneRasterLayer')?.addEventListener('change',event=>{
      sceneRasterLayer = event.target.value;
      if (sceneRows[sceneSelectedIndex]) showSceneRaster(sceneSelectedIndex,sceneRasterLayer).catch(fail);
    });
    document.getElementById('satSceneContrast')?.addEventListener('change',event=>{
      const mode = event.target.value;
      if (mode !== 'fixed' && mode !== 'local') return;
      sceneContrastMode = mode;
      if (sceneRows[sceneSelectedIndex]) {
        showSceneRaster(sceneSelectedIndex,sceneRasterLayer).catch(fail);
      }
    });
    document.getElementById('satSceneRasterLoad')?.addEventListener('click',()=>{
      if (sceneRows[sceneSelectedIndex]) showSceneRaster(sceneSelectedIndex,sceneRasterLayer).catch(fail);
    });
    document.getElementById('satSceneRasterHistoric')?.addEventListener('click',()=>{
      clearSceneRaster();
      sceneRasterBusy = false;
      sceneRasterError = '';
      loadNdviOverlay().catch(fail);
    });
    document.getElementById('satScenesReload')?.addEventListener('click',()=>{
      if (selectedFieldId) loadScenes(selectedFieldId).catch(error => console.warn('Amelia Satellite scene reload:',error));
    });
    document.getElementById('satScenesList')?.addEventListener('click',event=>{
      const button = event.target?.closest?.('[data-scene-index]');
      if (!button) return;
      const index = Number(button.dataset.sceneIndex);
      if (Number.isInteger(index) && sceneRows[index]) sceneDetail(index);
    });

    document.getElementById('satCompareToggle')?.addEventListener('click',()=>{
      const panel = document.getElementById('satComparePanel');
      const open = !panel?.classList.contains('open');
      panel?.classList.toggle('open', open);
      if (!open) clearComparison();
    });

    document.getElementById('satCompareRun')?.addEventListener('click',()=>runComparison().catch(fail));

    document.getElementById('satCompareBeforeRange')?.addEventListener('input',()=>{
      updateCompareTimeline('before');
    });

    document.getElementById('satCompareAfterRange')?.addEventListener('input',()=>{
      updateCompareTimeline('after');
    });

    document.getElementById('satCompareRevealRange')?.addEventListener('input',event=>{
      setComparePosition(
        event.target.value
      );
    });

    document.getElementById('satSaveField')?.addEventListener('click',()=>saveField().catch(fail));
    document.getElementById('satSync')?.addEventListener('click',()=>syncField().catch(fail));

    document.getElementById('satActiveFieldsTab')?.addEventListener('click',()=>{
      showArchivedFields = false;
      selectedFieldId = null;
      selectedFieldData = null;
      renderSelectedLotSummary(null);
      clearDraw();
      loadFields().catch(fail);
    });

    document.getElementById('satArchivedFieldsTab')?.addEventListener('click',()=>{
      showArchivedFields = true;
      selectedFieldId = null;
      selectedFieldData = null;
      renderSelectedLotSummary(null);
      clearDraw();
      loadFields().catch(fail);
    });

    document.getElementById('satSelectAllFields')?.addEventListener('click',()=>{
      const checks = [...document.querySelectorAll('#satelliteFieldList .sat-field-check')];
      const shouldCheck = checks.some(input => !input.checked);
      checks.forEach(input => { input.checked = shouldCheck; });
      updateBatchButtons();
    });

    document.getElementById('satBatchSync')?.addEventListener('click',()=>syncSelectedFields().catch(fail));
    document.getElementById('satFarmNdviShow')?.addEventListener('click',()=>{
      if (farmNdviOverlays.size) {
        clearFarmNdviOverlays();
        document.getElementById('satNdviLegend')?.classList.remove('open');
        setStatus('Mapa NDVI de finca ocultado.', 'ok');
        updateBatchButtons();
      } else {
        loadFarmNdviMaps().catch(fail);
      }
    });
    document.getElementById('satSiteSelect')?.addEventListener('change',()=>{
      const siteId =
        document.getElementById('satSiteSelect')?.value || '';

      if (siteId) {
        sessionStorage.setItem(
          'tayuSatelliteSiteId',
          siteId
        );
      }

      const listHost =
        document.getElementById('satelliteFieldList');

      if (listHost) {
        listHost.innerHTML =
          '<div class="hint">Cargando lotes de esta finca...</div>';
      }

      // Programa primero la recarga. Así, aunque alguna limpieza visual
      // falle después, la carga de la nueva finca no queda bloqueada.
      window.setTimeout(
        () => {
          loadSites().catch(error => {
            if (listHost) {
              listHost.innerHTML =
                '<div class="hint">No se pudieron cargar los lotes de esta finca.</div>';
            }
            fail(error);
          });
        },
        0
      );

      try {
        selectedFieldId = null;
        selectedFieldData = null;
        renderSelectedLotSummary(null);
        currentFields = [];
        fieldOverviewStates = new Map();

        clearDraw();
        clearFieldOverview();

        const syncButton =
          document.getElementById('satSync');
        const ndviButton =
          document.getElementById('satNdviMapButton');
        const compareToggle =
          document.getElementById('satCompareToggle');
        const compareRun =
          document.getElementById('satCompareRun');
        const comparePanel =
          document.getElementById('satComparePanel');

        if (syncButton) syncButton.disabled = true;
        if (ndviButton) ndviButton.disabled = true;
        if (compareToggle) compareToggle.disabled = true;
        if (compareRun) compareRun.disabled = true;
        comparePanel?.classList.remove('open');

        const codeInput =
          document.getElementById('satFieldCode');
        const cropInput =
          document.getElementById('satCropType');
        const nameInput =
          document.getElementById('satFieldName');

        if (codeInput) codeInput.value = '';
        if (cropInput) cropInput.value = '';
        if (nameInput) nameInput.value = '';

        renderObservations([]);
        sceneRows = [];
        sceneSelectedIndex = -1;
        scenesError = '';
        scenesLoading = false;
        sceneRasterBusy = false;
        sceneRasterError = '';
        clearSceneRaster();
        sceneRequestSeq++;
        renderScenes();

        try {
          centerSelectedSite();
        } catch (error) {
          console.warn(
            'Amelia Satellite center site:',
            error
          );
        }
      } catch (error) {
        console.warn(
          'Amelia Satellite site cleanup:',
          error
        );
      }
    });

  }

  function boot() { ensureUi(); }

  window.addEventListener('tayu:modules-applied',()=>setTimeout(boot,0));
  window.addEventListener('tayu:client-access-ready',()=>setTimeout(boot,0));
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0),{once:true});
  else setTimeout(boot,0);

  let attempts = 0;
  const timer = setInterval(() => {
    attempts++;
    if (enabled()) { ensureUi(); clearInterval(timer); }
    if (attempts > 80) clearInterval(timer);
  },250);
})();
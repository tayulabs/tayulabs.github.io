(() => {
  'use strict';

  const sensorStateCache = new Map();
  let lastAlarmRefreshAt = 0;
  let liveTimer = null;

  const sensors = () => {
    try {
      return (typeof platformSensors !== 'undefined' && Array.isArray(platformSensors)) ? platformSensors : [];
    } catch (_) {
      return [];
    }
  };

  const assets = () => {
    try {
      return (typeof assetInventory !== 'undefined' && Array.isArray(assetInventory)) ? assetInventory : [];
    } catch (_) {
      return [];
    }
  };

  function assetFor(sensor) {
    return assets().find(asset => String(asset?.uuid || asset?.id || '') === String(sensor?.deviceKey || '')) || null;
  }

  function signalMeta(sensor) {
    return assetFor(sensor)?.configuration?.signals?.[sensor?.sourcePath] || {};
  }

  function isVisibleSensor(sensor) {
    return signalMeta(sensor)?.alerts_disabled !== true;
  }

  function parsePayload(row) {
    const value = row?.payload;
    if (value && typeof value === 'object') return value;
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return {}; }
    }
    return {};
  }

  function latestPayload(deviceKey) {
    const rows = (Array.isArray(window.__tayuLastTelemetry) ? window.__tayuLastTelemetry : [])
      .filter(row => String(row?.device_key || '') === String(deviceKey || ''))
      .sort((a,b) => new Date(b?.time || 0) - new Date(a?.time || 0));
    return parsePayload(rows[0]);
  }

  function readPath(object, path) {
    return String(path || '').split('.').filter(Boolean).reduce((acc,key) => acc == null ? undefined : acc[key], object);
  }

  function currentValue(sensor) {
    if (!sensor?.deviceKey || !sensor?.sourcePath) return undefined;
    return readPath(latestPayload(sensor.deviceKey), sensor.sourcePath);
  }

  function numeric(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function evaluate(sensor, value) {
    const meta = signalMeta(sensor);
    if (meta?.alerts_disabled === true) return { state:'Desactivado', alarm:false };

    if (typeof value === 'boolean' && sensor?.alarm_equals !== null && sensor?.alarm_equals !== undefined) {
      const alarm = value === Boolean(sensor.alarm_equals);
      return { state:alarm ? 'Alerta' : 'Normal', alarm };
    }

    const number = numeric(value);
    if (number === null) return { state:'Sin datos', alarm:false };

    const min = numeric(sensor?.min);
    const max = numeric(sensor?.max);
    if (min !== null && number < min) return { state:'Bajo', alarm:true };
    if (max !== null && number > max) return { state:'Alto', alarm:true };
    if (min === null && max === null) return { state:'Sin umbral', alarm:false };
    return { state:'Normal', alarm:false };
  }

  function formatValue(sensor, value) {
    if (value === undefined || value === null || value === '') return `—${sensor?.unit ? ` ${sensor.unit}` : ''}`;
    return `${value}${sensor?.unit ? ` ${sensor.unit}` : ''}`;
  }

  function stateClass(state) {
    if (state === 'Normal') return 'status';
    if (state === 'Bajo' || state === 'Alto' || state === 'Alerta') return 'status warn';
    return 'tayu-sensor-neutral';
  }

  function installStyles() {
    if (document.getElementById('tayuSensorAlertStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuSensorAlertStyles';
    style.textContent = `
      .tayu-sensor-action-head,.tayu-sensor-action-cell{text-align:center!important;width:58px}
      .tayu-sensor-delete{
        width:32px;height:32px;padding:0!important;border-radius:10px!important;
        display:inline-grid;place-items:center;font-size:21px!important;line-height:1!important;
        background:rgba(239,68,68,.08)!important;color:var(--danger)!important;
        border:1px solid rgba(239,68,68,.24)!important;cursor:pointer;font-weight:900!important;
      }
      .tayu-sensor-delete:hover{background:rgba(239,68,68,.14)!important;border-color:var(--danger)!important}
      .tayu-sensor-neutral{display:inline-flex;padding:6px 10px;border-radius:999px;background:var(--panel2);border:1px solid var(--border);color:var(--muted);font-size:12px;font-weight:850}
      .tayu-sensor-rule-note{margin:12px 0 0;padding:10px 12px;border-radius:12px;background:var(--panel2);border:1px solid var(--border);font-size:11px;line-height:1.45;color:var(--muted)}
      .tayu-mb-delete{
        width:32px!important;height:32px!important;padding:0!important;border-radius:10px!important;
        display:inline-grid!important;place-items:center!important;font-size:21px!important;line-height:1!important;
        font-weight:900!important;background:rgba(239,68,68,.08)!important;color:var(--danger)!important;
        border:1px solid rgba(239,68,68,.24)!important;
      }
      .tayu-mb-delete:hover{background:rgba(239,68,68,.14)!important;border-color:var(--danger)!important}
    `;
    document.head.appendChild(style);
  }

  function ensureRuleNote() {
    const table = document.getElementById('sensorTable');
    const card = table?.closest('.card');
    if (!card || card.querySelector('.tayu-sensor-rule-note')) return;
    const note = document.createElement('div');
    note.className = 'tayu-sensor-rule-note';
    note.innerHTML = '<b>Regla de alerta:</b> Mínimo genera alerta cuando la lectura es menor al valor configurado; Máximo cuando la lectura es mayor. Un valor exactamente igual al límite se considera dentro del rango.';
    table.closest('.table-wrap')?.insertAdjacentElement('beforebegin', note);
  }

  function enhanceSensorTable() {
    installStyles();
    const table = document.getElementById('sensorTable');
    if (!table) return;
    const rows = Array.from(table.rows || []);
    if (!rows.length) return;

    ensureRuleNote();

    const header = rows[0];
    let actionHead = header.querySelector('[data-tayu-sensor-action-head]');
    if (!actionHead) {
      actionHead = document.createElement('th');
      actionHead.dataset.tayuSensorActionHead = '1';
      actionHead.className = 'tayu-sensor-action-head';
      actionHead.textContent = 'Acción';
      header.appendChild(actionHead);
    }

    const list = sensors();
    rows.slice(1).forEach((row,index) => {
      const sensor = list[index];
      if (!sensor) return;
      if (!isVisibleSensor(sensor)) {
        row.remove();
        return;
      }

      row.dataset.tayuSensorId = String(sensor.id || '');
      row.dataset.tayuSensorDevice = String(sensor.deviceKey || '');
      row.dataset.tayuSensorPath = String(sensor.sourcePath || '');

      let cell = row.querySelector('[data-tayu-sensor-action-cell]');
      if (!cell) {
        cell = document.createElement('td');
        cell.dataset.tayuSensorActionCell = '1';
        cell.className = 'tayu-sensor-action-cell';
        row.appendChild(cell);
      }
      cell.replaceChildren();
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'tayu-sensor-delete';
      button.textContent = '×';
      button.title = `Quitar ${sensor.name || sensor.sourcePath} de Sensores y alertas`;
      button.setAttribute('aria-label', button.title);
      button.addEventListener('click', () => window.deleteSensor?.(sensor.id));
      cell.appendChild(button);
    });

    syncSensorRows();
  }

  function requestAlarmRefresh() {
    const now = Date.now();
    if (now - lastAlarmRefreshAt < 5000) return;
    lastAlarmRefreshAt = now;
    Promise.resolve(window.tayuLoadAlarmEvents?.()).catch(error => console.warn('Actualizar alarmas:', error));
  }

  function syncSensorRows() {
    const view = document.getElementById('sensores');
    const table = document.getElementById('sensorTable');
    if (!table || (view && !view.classList.contains('active'))) return;

    let anyAlarm = false;
    sensors().filter(isVisibleSensor).forEach(sensor => {
      const value = currentValue(sensor);
      if (value !== undefined) sensor.value = value;
      const evaluation = evaluate(sensor, value !== undefined ? value : sensor.value);
      sensor.state = evaluation.state;

      const row = Array.from(table.querySelectorAll('tr[data-tayu-sensor-id]'))
        .find(item => item.dataset.tayuSensorId === String(sensor.id || ''));
      if (row) {
        if (row.cells[1]) row.cells[1].innerHTML = `<b>${formatValue(sensor, value !== undefined ? value : sensor.value)}</b>`;
        if (row.cells[5]) row.cells[5].innerHTML = `<span class="${stateClass(evaluation.state)}">${evaluation.state}</span>`;
      }

      const previous = sensorStateCache.get(String(sensor.id));
      sensorStateCache.set(String(sensor.id), evaluation.state);
      if (evaluation.alarm) {
        anyAlarm = true;
        if (previous !== evaluation.state) requestAlarmRefresh();
      }
    });

    // Si una condición continúa fuera de rango, consultamos de forma moderada
    // los eventos reales del VPS para que la campana no dependa del refresco de 30 s.
    if (anyAlarm) requestAlarmRefresh();
  }

  async function deleteSensor(id) {
    const sensor = sensors().find(item => String(item?.id || '') === String(id || ''));
    if (!sensor?.deviceKey || !sensor?.sourcePath || typeof window.__tayuApiPost !== 'function') return;

    const ok = confirm(`¿Quitar “${sensor.name || sensor.sourcePath}” de Sensores y alertas?\n\nEl parámetro Modbus y su telemetría NO se eliminarán. Solo se quitarán sus umbrales/alertas y dejará de aparecer en esta sección.`);
    if (!ok) return;

    try {
      let sourceAsset = assetFor(sensor);
      try {
        if (typeof window.__tayuApi === 'function') {
          const remote = await window.__tayuApi('/devices');
          const fresh = Array.isArray(remote) ? remote.find(item => String(item?.device_key || '') === String(sensor.deviceKey)) : null;
          if (fresh?.configuration) sourceAsset = { ...sourceAsset, configuration:fresh.configuration };
        }
      } catch (error) {
        console.warn('Usando configuración local para quitar sensor:', error);
      }

      const cfg = JSON.parse(JSON.stringify(sourceAsset?.configuration || {}));
      cfg.outputs = cfg.outputs || {};
      cfg.signals = cfg.signals || {};
      cfg.assets = Array.isArray(cfg.assets) ? cfg.assets : [];
      const meta = cfg.signals[sensor.sourcePath] || {
        enabled:true,
        name:sensor.name || sensor.sourcePath,
        unit:sensor.unit || '',
        application:'generic',
        alarm_severity:'warning'
      };

      // La señal sigue existiendo para Modbus, gráficas y automatización. Solo
      // se elimina de la capa de Sensores/alertas.
      meta.enabled = meta.enabled !== false;
      meta.alarm_min = null;
      meta.alarm_max = null;
      meta.alarm_equals = null;
      meta.alerts_disabled = true;
      cfg.signals[sensor.sourcePath] = meta;

      await window.__tayuApiPost('/devices/configuration', {
        device_key:sensor.deviceKey,
        configuration:cfg
      });

      const local = assetFor(sensor);
      if (local) local.configuration = cfg;
      sensorStateCache.delete(String(sensor.id));
      await window.refreshRealData?.();
      enhanceSensorTable();
    } catch (error) {
      console.error('Quitar sensor/alerta:', error);
      alert(`No se pudo quitar el sensor de alertas: ${error?.message || error}`);
    }
  }

  function polishModbusDeleteButtons() {
    document.querySelectorAll('#modbus [data-mb-delete]').forEach(button => {
      button.textContent = '×';
      button.title = 'Eliminar parámetro Modbus';
      button.setAttribute('aria-label', 'Eliminar parámetro Modbus');
    });
  }

  function wrap(name, after) {
    const original = window[name];
    if (typeof original !== 'function' || original.__tayuSensorAlertWrapped) return;
    const wrapped = function(...args) {
      const result = original.apply(this,args);
      if (result && typeof result.then === 'function') {
        return result.finally(() => setTimeout(after, 0));
      }
      setTimeout(after,0);
      return result;
    };
    wrapped.__tayuSensorAlertWrapped = true;
    window[name] = wrapped;
  }

  function install() {
    installStyles();

    const originalRender = window.renderSensorTable;
    if (typeof originalRender === 'function' && !originalRender.__tayuSensorAlertWrapped) {
      const wrapped = function(...args) {
        const result = originalRender.apply(this,args);
        enhanceSensorTable();
        return result;
      };
      wrapped.__tayuSensorAlertWrapped = true;
      window.renderSensorTable = wrapped;
    }

    const originalUpdate = window.updateSensor;
    if (typeof originalUpdate === 'function' && !originalUpdate.__tayuSensorAlertWrapped) {
      const wrappedUpdate = async function(...args) {
        const result = await originalUpdate.apply(this,args);
        enhanceSensorTable();
        setTimeout(() => {
          syncSensorRows();
          window.tayuLoadAlarmEvents?.();
        }, 1200);
        return result;
      };
      wrappedUpdate.__tayuSensorAlertWrapped = true;
      window.updateSensor = wrappedUpdate;
    }

    window.deleteSensor = deleteSensor;

    wrap('addModbusParamRow', polishModbusDeleteButtons);
    wrap('onModbusDeviceChanged', polishModbusDeleteButtons);
    wrap('saveModbusConfigFromPlatform', polishModbusDeleteButtons);

    enhanceSensorTable();
    polishModbusDeleteButtons();
    setTimeout(() => { enhanceSensorTable(); polishModbusDeleteButtons(); }, 350);
    setTimeout(() => { enhanceSensorTable(); polishModbusDeleteButtons(); }, 1000);

    clearInterval(liveTimer);
    liveTimer = setInterval(syncSensorRows, 1000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, {once:true});
  else install();
})();

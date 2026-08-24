(() => {
  'use strict';

  function fieldValue(body, label) {
    const field = [...body.querySelectorAll('.field')]
      .find((item) => item.querySelector('label')?.textContent?.trim() === label);
    return field?.querySelector('input')?.value || '';
  }

  function safeFilename(value) {
    return String(value || 'dispositivo')
      .trim()
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'dispositivo';
  }

  function buildCredentialsText(body) {
    const deviceKey = document.getElementById('deviceCredentialsSubtitle')?.textContent?.trim() || 'Dispositivo';
    const rows = [
      ['Host', fieldValue(body, 'Host')],
      ['Puerto', fieldValue(body, 'Puerto')],
      ['TLS', fieldValue(body, 'TLS')],
      ['Usuario MQTT', fieldValue(body, 'Usuario MQTT')],
      ['Contraseña MQTT', fieldValue(body, 'Contraseña MQTT')],
      ['Telemetry topic', fieldValue(body, 'Telemetry topic')],
      ['Command topic', fieldValue(body, 'Command topic')],
    ];

    return [
      'TAYULABS Cloud',
      'Credenciales MQTT',
      '=================',
      '',
      `Dispositivo: ${deviceKey}`,
      `Fecha de descarga (UTC): ${new Date().toISOString()}`,
      '',
      ...rows.map(([label, value]) => `${label}: ${value}`),
      '',
      'IMPORTANTE',
      '----------',
      'Estas credenciales permiten autenticar el dispositivo en TAYULABS Cloud.',
      'Guarda este archivo en un lugar seguro y no lo compartas públicamente.',
      'La contraseña MQTT se entrega una sola vez; si se pierde, deberá regenerarse desde Super Admin.',
      '',
    ].join('\r\n');
  }

  function downloadCredentials(body) {
    const deviceKey = document.getElementById('deviceCredentialsSubtitle')?.textContent?.trim() || 'dispositivo';
    const text = buildCredentialsText(body);
    const blob = new Blob(['\uFEFF', text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `TAYULABS_${safeFilename(deviceKey)}_MQTT_CREDENTIALS.txt`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    const status = document.getElementById('deviceCopyStatus');
    if (status) status.textContent = 'Archivo de credenciales descargado.';
  }

  function enhanceCredentialsModal() {
    const body = document.getElementById('deviceCredentialsBody');
    if (!body) return;

    const doneButton = document.getElementById('doneDeviceCredentials');
    if (!doneButton || body.querySelector('#downloadDeviceCredentials')) return;

    const actions = doneButton.closest('.form-actions');
    if (!actions) return;

    const downloadButton = document.createElement('button');
    downloadButton.id = 'downloadDeviceCredentials';
    downloadButton.className = 'btn ghost';
    downloadButton.type = 'button';
    downloadButton.textContent = '⇩ Descargar credenciales';
    downloadButton.title = 'Descargar todas las credenciales MQTT en un archivo de texto';
    downloadButton.addEventListener('click', () => downloadCredentials(body));

    actions.insertBefore(downloadButton, doneButton);
  }

  function attachObserver() {
    const body = document.getElementById('deviceCredentialsBody');
    if (!body) {
      setTimeout(attachObserver, 100);
      return;
    }

    const observer = new MutationObserver(enhanceCredentialsModal);
    observer.observe(body, { childList: true });
    enhanceCredentialsModal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachObserver, { once: true });
  } else {
    attachObserver();
  }
})();

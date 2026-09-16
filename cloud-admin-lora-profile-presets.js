(() => {
  'use strict';

  const VERSION = '20260916-lora-profile-presets1';
  if (window.__tayuLoraProfilePresetsVersion === VERSION) return;
  window.__tayuLoraProfilePresetsVersion = VERSION;

  const PRESETS = {
    mini_gateway: {
      display_name: 'NOVA EDGE PRO Mini Gateway',
      profile_key: 'nova_edge_pro_minigateway',
      description: 'NOVA EDGE PRO configurado como Mini Gateway LoRa P2P con enlace WiFi/MQTT hacia TAYULABS Cloud y capacidad inicial de hasta 5 nodos LoRa.',
      capabilities: {
        category: 'iot_gateway',
        hardware_family: 'nova_edge_pro',
        communication: {
          default_role: 'lora_mini_gateway',
          protocol: 'lora_p2p',
          cloud_transport: 'wifi_mqtt_tls',
          max_nodes: 5,
          radio_defaults: {
            frequency_mhz: 915,
            tx_power_dbm: 20,
            spreading_factor: 9,
            bandwidth_khz: 125,
            coding_rate: '4/5',
            sync_word: '0x12'
          }
        }
      }
    },
    rak11300_node: {
      display_name: 'RAK11300 LoRa Node',
      profile_key: 'rak11300_lora_node',
      description: 'Nodo LoRa P2P basado en RAK11300 para sensores y GPS opcional, asociado a un Mini Gateway TAYULABS.',
      capabilities: {
        category: 'lora_node',
        hardware_family: 'rak11300',
        communication: {
          default_role: 'lora_node',
          protocol: 'lora_p2p',
          gps_optional: true,
          radio_defaults: {
            frequency_mhz: 915,
            tx_power_dbm: 20,
            spreading_factor: 9,
            bandwidth_khz: 125,
            coding_rate: '4/5',
            sync_word: '0x12'
          }
        }
      }
    }
  };

  function injectStyles() {
    if (document.getElementById('tayuLoraProfilePresetStyles')) return;
    const style = document.createElement('style');
    style.id = 'tayuLoraProfilePresetStyles';
    style.textContent = `
      .lora-profile-presets{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
      .lora-profile-presets .btn{white-space:nowrap}
      .lora-profile-preset-note{font-size:11px;color:var(--muted);margin:0 0 9px}
    `;
    document.head.appendChild(style);
  }

  function populate(preset) {
    const newButton = document.getElementById('newProfileButton');
    if (!newButton) return;
    newButton.click();

    setTimeout(() => {
      const form = document.getElementById('profileAdminForm');
      if (!form) return;
      if (form.display_name) form.display_name.value = preset.display_name;
      if (form.profile_key) form.profile_key.value = preset.profile_key;
      if (form.description) form.description.value = preset.description;
      if (form.capabilities) form.capabilities.value = JSON.stringify(preset.capabilities, null, 2);
      form.display_name?.dispatchEvent(new Event('change', {bubbles:true}));
    }, 0);
  }

  function decorate() {
    injectStyles();
    const section = document.getElementById('profiles-admin');
    if (!section || section.querySelector('[data-lora-profile-presets]')) return;

    const toolbar = section.querySelector('.profiles-toolbar');
    if (!toolbar) return;

    const wrap = document.createElement('div');
    wrap.dataset.loraProfilePresets = '1';
    wrap.innerHTML = `
      <p class="lora-profile-preset-note">Plantillas recomendadas para arquitectura LoRa TAYULABS:</p>
      <div class="lora-profile-presets">
        <button class="btn ghost small" type="button" data-lora-profile-preset="mini_gateway">＋ NOVA EDGE PRO Mini Gateway</button>
        <button class="btn ghost small" type="button" data-lora-profile-preset="rak11300_node">＋ RAK11300 LoRa Node</button>
      </div>
    `;
    toolbar.insertAdjacentElement('beforebegin', wrap);
  }

  document.addEventListener('click', event => {
    const button = event.target?.closest?.('[data-lora-profile-preset]');
    if (!button) return;
    const preset = PRESETS[button.dataset.loraProfilePreset];
    if (preset) populate(preset);
  }, true);

  document.addEventListener('click', event => {
    if (event.target?.closest?.('[data-view="profiles-admin"]')) {
      [0, 150, 400].forEach(ms => setTimeout(decorate, ms));
    }
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(decorate, 300), {once:true});
  } else {
    setTimeout(decorate, 300);
  }
})();
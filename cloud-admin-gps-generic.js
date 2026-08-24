(() => {
  'use strict';

  const API_URL = 'https://api.tayulabs.com';
  const PROFILE_KEY = 'gps_generic';
  const DEFAULT_PROFILE = {
    profile_key: PROFILE_KEY,
    display_name: 'GPS GENÉRICO',
    description: 'Perfil GPS multipropósito para trackers propios o de terceros, prototipos ESP32 + GPS + GSM y seguimiento de vehículos o activos.',
    administrative_status: 'active',
    capabilities: {
      version: 1,
      category: 'gps_tracker',
      location: {
        supported: true,
        source: 'telemetry',
        latitude_paths: ['lat','latitude','location.lat','location.latitude','gps.lat','gps.latitude'],
        longitude_paths: ['lon','lng','longitude','location.lon','location.lng','location.longitude','gps.lon','gps.lng','gps.longitude']
      },
      connectivity: [
        { type: 'gsm', optional: true },
        { type: 'wifi', optional: true }
      ],
      tracking: {
        profile: PROFILE_KEY,
        map: true,
        history: true,
        geofences: true,
        asset_metadata: true,
        configuration_path: 'gps',
        report_intervals_minutes: [1,5,10,30],
        telemetry: {
          speed: ['speed_kmh','speed','velocity','gps.speed'],
          heading: ['heading','course','bearing','gps.heading'],
          altitude: ['altitude','alt','gps.altitude'],
          satellites: ['satellites','sats','gps.satellites','gps.sats'],
          hdop: ['hdop','gps.hdop'],
          battery: ['battery_pct','battery','bateria','power.battery_pct']
        }
      }
    }
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function getKeycloak() {
    for (let i = 0; i < 120; i += 1) {
      const kc = window.__tayuKeycloak;
      if (kc?.authenticated && kc?.token) return kc;
      await sleep(100);
    }
    throw new Error('No hay sesión administrativa activa.');
  }

  async function request(path, options = {}) {
    const kc = await getKeycloak();
    await kc.updateToken(60).catch(() => {});
    const response = await fetch(API_URL + path, {
      ...options,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${kc.token}`,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `API ${response.status}`);
    return data;
  }

  async function ensureGpsGenericProfile() {
    try {
      const kc = await getKeycloak();
      const roles = kc.tokenParsed?.realm_access?.roles || [];
      if (!roles.includes('platform_super_admin')) return;

      const profiles = await request('/admin/device-profiles?include_inactive=true');
      const existing = (Array.isArray(profiles) ? profiles : []).find(
        profile => profile.profile_key === PROFILE_KEY
      );

      if (existing) {
        window.__tayuGpsGenericProfile = existing;
        return;
      }

      const created = await request('/admin/device-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(DEFAULT_PROFILE)
      });
      window.__tayuGpsGenericProfile = created || DEFAULT_PROFILE;
      console.info('TAYULABS: perfil GPS GENÉRICO creado.');

      if (typeof window.loadProfiles === 'function') {
        window.loadProfiles().catch(() => {});
      }
    } catch (error) {
      console.warn('TAYULABS GPS GENÉRICO: no se pudo verificar/crear el perfil.', error);
    }
  }

  function boot() {
    ensureGpsGenericProfile();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

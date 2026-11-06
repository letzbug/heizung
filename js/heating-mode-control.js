/** Heating mode control: explicit confirmation + protected same-origin API + verified readback. */
export function initHeatingModeControl({refresh}) {
  const button = document.getElementById('hdr-heating-mode');
  if (!button) return;
  let busy = false;
  let token = null; // Memory only, never stored on disk or in localStorage.
  button.addEventListener('click', async () => {
    if (busy || button.disabled) return;
    const current = button.dataset.mode;
    if (current !== 'heating' && current !== 'water') return;
    const mode = current === 'heating' ? 'WW' : 'H+WW';
    const label = mode === 'WW' ? 'NUR WARMWASSER (Heizbetrieb aus)' : 'HEIZEN + WARMWASSER';
    if (!window.confirm(`Heizung wirklich auf ${label} umstellen?`)) return;
    if (!token) {
      token = window.prompt('Vitola IQ: Heizungs-Steuercode eingeben. Nur im vertrauenswürdigen Heimnetz/über HTTPS verwenden.');
      if (!token) return;
    }
    busy = true;
    button.disabled = true;
    try {
      const res = await fetch('/api/heating-mode', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'X-Heating-Token': token },
        body: JSON.stringify({mode}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.verified !== true || data.mode !== mode) {
        if (res.status === 403) token = null;
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      await refresh();
      window.alert(`Betriebsart erfolgreich bestätigt: ${label}.`);
    } catch (err) {
      window.alert(`Umschaltung nicht bestätigt: ${err.message}\nBitte die Betriebsart am Heizgerät kontrollieren.`);
      await refresh().catch(() => {});
    } finally {
      busy = false;
      // Actual enabled state will be restored by fresh telemetry render.
      await refresh().catch(() => {});
    }
  });
}

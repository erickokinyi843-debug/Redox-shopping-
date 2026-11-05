window.APP_CONFIG = {
  apiBaseUrl: 'https://rodyx.pythonanywhere.com'
};

window.getMarketplaceContent = async contentType => {
  const apiBaseUrl = (window.APP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  const response = await fetch(`${apiBaseUrl}/api/content/${encodeURIComponent(contentType)}`);
  const content = await response.json().catch(() => []);
  if (!response.ok) throw new Error(content.error || `Could not load ${contentType}.`);
  if (!Array.isArray(content)) throw new Error(`The ${contentType} API returned an invalid response.`);
  return content;
};

window.postMarketplaceContent = async (contentType, post) => {
  const apiBaseUrl = (window.APP_CONFIG?.apiBaseUrl || '').replace(/\/$/, '');
  const response = await fetch(`${apiBaseUrl}/api/content/${encodeURIComponent(contentType)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(post)
  });
  const content = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(content.error || `Could not publish ${contentType}.`);
  return content;
};

document.querySelectorAll('[data-form-toggle]').forEach(toggle => {
  const form = document.getElementById(toggle.getAttribute('aria-controls'));
  if (!form) return;

  toggle.addEventListener('click', () => {
    const isOpening = form.hidden;
    form.hidden = !isOpening;
    toggle.setAttribute('aria-expanded', String(isOpening));
    toggle.textContent = isOpening ? toggle.dataset.closeLabel : toggle.dataset.openLabel;
    if (isOpening) form.querySelector('input, select, textarea')?.focus();
  });
});

window.startUserMessage = (email, name) => {
  if (!email) return;
  sessionStorage.setItem('rodyxPendingMessage', JSON.stringify({ email, name }));
  window.location.href = 'messages.html';
};

const gpsLocationStyles = document.createElement('style');
gpsLocationStyles.textContent = `
  .gps-location-control { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .gps-location-control > input { flex: 1 1 12rem; min-width: 0; width: auto; }
  .gps-location-button { border: 0; border-radius: 3px; padding: 10px 12px; background: #18a999; color: #fff; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
  .gps-location-button:disabled { opacity: .65; cursor: wait; }
  .gps-location-button:focus-visible { outline: 2px solid #183b56; outline-offset: 2px; }
  .gps-location-status { flex-basis: 100%; margin: 0; color: #607d8b; font-size: 12px; line-height: 1.4; }
`;
document.head.appendChild(gpsLocationStyles);

document.querySelectorAll('[data-gps-location][data-gps-search]').forEach(locationInput => {
  const control = document.createElement('div');
  control.className = 'gps-location-control';
  locationInput.parentNode.insertBefore(control, locationInput);
  control.appendChild(locationInput);

  const button = document.createElement('button');
  button.className = 'gps-location-button';
  button.type = 'button';
  button.textContent = 'Use GPS';
  const status = document.createElement('p');
  status.className = 'gps-location-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  control.append(button, status);

  button.addEventListener('click', () => {
    if (!navigator.geolocation) {
      status.textContent = 'GPS is unavailable in this browser. Enter a town or area manually.';
      return;
    }

    button.disabled = true;
    status.textContent = 'Requesting location permission...';
    navigator.geolocation.getCurrentPosition(position => {
      const latitude = position.coords.latitude.toFixed(6);
      const longitude = position.coords.longitude.toFixed(6);
      locationInput.value = `GPS ${latitude}, ${longitude}`;
      locationInput.dispatchEvent(new Event('input', { bubbles: true }));
      status.textContent = 'Your coordinates stay in this browser and are used for nearby search only.';
      button.disabled = false;
    }, error => {
      status.textContent = error.code === error.PERMISSION_DENIED
        ? 'Location permission was denied. Enter a town or area manually.'
        : 'Could not get your location. Check device location settings or enter it manually.';
      button.disabled = false;
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });
});

(function () {
  const panel = document.getElementById('cc-analytics-consent');
  if (!panel) return;
  const key = 'ccAnalyticsConsentV1';
  const fallback = document.getElementById('cc-analytics-fallback');
  if (fallback && document.querySelectorAll('[data-analytics-choices]').length === 1) fallback.hidden = false;
  const lifetime = 180 * 24 * 60 * 60 * 1000;
  const measurementId = panel.dataset.measurementId;
  let active = false;
  let returnFocus;
  const denied = { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };

  function readChoice() {
    try {
      if (sessionStorage.getItem(key) === 'rejected') return 'rejected';
    } catch { /* Local storage remains the fallback if session storage is unavailable. */ }
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      return saved && Number.isFinite(saved.expires) && saved.expires > Date.now() && saved.expires <= Date.now() + lifetime
        && (saved.choice === 'accepted' || saved.choice === 'rejected') ? saved.choice : null;
    } catch { return null; }
  }

  function clearCookies() {
    const domains = ['', location.hostname, '.computecurrent.com'];
    for (const cookie of document.cookie.split(';')) {
      const name = cookie.split('=')[0].trim();
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue;
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
      }
    }
  }

  function startAnalytics() {
    if (active || !/^G-[A-Z0-9]{4,16}$/i.test(measurementId)) return;
    active = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', denied);
    window.gtag('set', 'ads_data_redaction', true);
    window.gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', measurementId, { allow_google_signals: false, allow_ad_personalization_signals: false });
    const loader = document.createElement('script');
    loader.async = true;
    loader.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(loader);
  }

  function reject(reload = true) {
    if (active) window[`ga-disable-${measurementId}`] = true;
    clearCookies();
    if (active) window.gtag('consent', 'update', denied);
    if (active && reload) location.reload();
  }

  function choose(choice) {
    let persisted = false;
    try {
      localStorage.setItem(key, JSON.stringify({ choice, expires: Date.now() + lifetime }));
      persisted = true;
    } catch { /* A failed save must not restart analytics from a stale accepted record. */ }
    try {
      if (choice === 'rejected') sessionStorage.setItem(key, 'rejected');
      else sessionStorage.removeItem(key);
    } catch { /* Denied consent and ga-disable still stop collection on the current page. */ }
    panel.hidden = true;
    if (returnFocus) returnFocus.focus();
    if (choice === 'accepted') {
      if (active) {
        window[`ga-disable-${measurementId}`] = false;
        window.gtag('consent', 'update', { ...denied, analytics_storage: 'granted' });
      } else startAnalytics();
    } else {
      reject(persisted);
      if (!persisted) {
        panel.hidden = false;
        const status = panel.querySelector('[data-analytics-status]');
        status.hidden = false;
        status.textContent = 'Analytics is off on this page. Your browser could not save the choice. To keep it off on future visits, clear site data in your browser settings.';
      }
    }
  }
  for (const button of document.querySelectorAll('[data-analytics-choices]')) {
    button.addEventListener('click', () => {
      returnFocus = button;
      panel.hidden = false;
      document.getElementById('cc-analytics-title').focus();
    });
  }
  panel.querySelector('[data-analytics-accept]').addEventListener('click', () => choose('accepted'));
  panel.querySelector('[data-analytics-reject]').addEventListener('click', () => choose('rejected'));
  window.addEventListener('storage', (event) => {
    if (event.key !== key && event.key !== null) return;
    const choice = readChoice();
    panel.hidden = choice !== null;
    if (choice === 'accepted') startAnalytics();
    else reject();
  });
  const choice = readChoice();
  panel.hidden = choice !== null;
  if (choice === 'accepted') startAnalytics();
  else clearCookies();
})();

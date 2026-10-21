(() => {
  'use strict';

  const KEY = 'centerPrivacyPreferencesV1';
  const AD_ID = 'AW-18466593229';
  const PRIVACY_PAGE = '/privacidade.html';
  let preferences = null;
  let analyticsLoaded = false;
  let marketingLoaded = false;
  let panel = null;

  function normalize(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.version !== 1 || typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean') return null;
    return { version: 1, analytics: value.analytics, marketing: value.marketing };
  }

  function read() {
    try { return normalize(JSON.parse(window.localStorage.getItem(KEY) || 'null')); } catch { return null; }
  }
  preferences = read();

  function enabled(kind) { return preferences?.[kind] === true; }

  function injectScript(source, key) {
    if (document.querySelector('[data-privacy-script="' + key + '"]')) return;
    const script = document.createElement('script');
    script.src = source;
    script.async = true;
    script.dataset.privacyScript = key;
    document.head.appendChild(script);
  }

  function activate() {
    if (enabled('analytics') && !analyticsLoaded) {
      analyticsLoaded = true;
      // Vercel Web Analytics is optional until analytics permission is granted.
      injectScript('/_vercel/insights/script.js', 'analytics');
    }
    if (enabled('marketing') && !marketingLoaded) {
      marketingLoaded = true;
      window.dataLayer = window.dataLayer || [];
      window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
      window.gtag('consent', 'default', {
        ad_storage: 'denied', analytics_storage: 'denied',
        ad_user_data: 'denied', ad_personalization: 'denied'
      });
      window.gtag('consent', 'update', {
        ad_storage: 'granted', analytics_storage: enabled('analytics') ? 'granted' : 'denied',
        ad_user_data: 'granted', ad_personalization: 'granted'
      });
      window.gtag('js', new Date());
      window.gtag('config', AD_ID);
      injectScript('https://www.googletagmanager.com/gtag/js?id=' + AD_ID, 'marketing');
    }
  }

  const dispatch = () => window.dispatchEvent(new CustomEvent('center-privacy-consent'));
  function save(next) {
    const wasEnabled = analyticsLoaded || marketingLoaded;
    preferences = { version: 1, analytics: Boolean(next.analytics), marketing: Boolean(next.marketing) };
    try { window.localStorage.setItem(KEY, JSON.stringify(preferences)); } catch {}
    close();
    if (wasEnabled && ((!preferences.analytics && analyticsLoaded) || (!preferences.marketing && marketingLoaded))) {
      // Already loaded scripts cannot be safely unloaded; a reload enforces revocation.
      window.location.reload();
      return;
    }
    activate();
    if (marketingLoaded && enabled('marketing') && typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        ad_storage: 'granted',
        analytics_storage: enabled('analytics') ? 'granted' : 'denied',
        ad_user_data: 'granted', ad_personalization: 'granted'
      });
    }
    dispatch();
  }

  function close() {
    if (panel) panel.hidden = true;
  }

  function open() {
    if (!panel) return;
    panel.querySelector('[name="privacy-analytics"]').checked = enabled('analytics');
    panel.querySelector('[name="privacy-marketing"]').checked = enabled('marketing');
    panel.hidden = false;
    panel.querySelector('[data-privacy-accept]')?.focus({ preventScroll: true });
  }

  function render() {
    panel = document.createElement('section');
    panel.className = 'privacy-consent';
    panel.hidden = true;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Preferências de privacidade');
    panel.setAttribute('aria-modal', 'false');
    panel.innerHTML = [
      '<div class="privacy-consent__content">',
        '<div class="privacy-consent__copy">',
          '<p class="privacy-consent__eyebrow">Privacidade e transparência</p>',
          '<h2>Você escolhe como medimos sua visita.</h2>',
          '<p>Os dados essenciais são usados para operar o pedido. Com sua autorização, também podemos medir visitas e campanhas. <a href="' + PRIVACY_PAGE + '">Entenda como seus dados são tratados</a>.</p>',
        '</div>',
        '<div class="privacy-consent__settings">',
          '<label><input type="checkbox" name="privacy-analytics"><span><b>Estatísticas</b><small>Ajuda a melhorar o site e entender as visitas.</small></span></label>',
          '<label><input type="checkbox" name="privacy-marketing"><span><b>Medição de anúncios</b><small>Ajuda a medir os resultados das campanhas.</small></span></label>',
        '</div>',
        '<div class="privacy-consent__actions">',
          '<button type="button" class="privacy-consent__secondary" data-privacy-reject>Somente essenciais</button>',
          '<button type="button" class="privacy-consent__secondary" data-privacy-save>Salvar escolhas</button>',
          '<button type="button" class="privacy-consent__primary" data-privacy-accept>Permitir opcionais</button>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(panel);
    panel.querySelector('[data-privacy-reject]').addEventListener('click', () => save({ analytics: false, marketing: false }));
    panel.querySelector('[data-privacy-accept]').addEventListener('click', () => save({ analytics: true, marketing: true }));
    panel.querySelector('[data-privacy-save]').addEventListener('click', () => save({
      analytics: panel.querySelector('[name="privacy-analytics"]').checked,
      marketing: panel.querySelector('[name="privacy-marketing"]').checked
    }));
    document.addEventListener('click', (event) => {
      const button = event.target.closest?.('[data-open-privacy-settings]');
      if (button) { event.preventDefault(); open(); }
    });
    // First-time visitors can browse immediately. Optional trackers stay disabled
    // unless the visitor explicitly opens preferences and opts in.
  }

  window.CenterPrivacyConsent = { enabled, open, save, read: () => preferences };
  activate();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render, { once: true });
  else render();
})();
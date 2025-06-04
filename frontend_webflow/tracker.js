(function () {
  const API_URL = 'https://klrab.se/api/tracking'; // Ändra till rätt endpoint om annan

  // Hämta eller skapa unikt besöks-ID
  let visitorId = localStorage.getItem('visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('visitor_id', visitorId);
  }

  // Hjälpfunktion för UTM-parametrar
  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  // Skicka händelse till backend
  function sendEvent(eventType, metadata = {}) {
    const payload = {
      visitor_id: visitorId,
      event: eventType,
      url: window.location.pathname,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || null,
      utm_source: getQueryParam('utm_source'),
      utm_medium: getQueryParam('utm_medium'),
      utm_campaign: getQueryParam('utm_campaign'),
      metadata,
    };

    navigator.sendBeacon(API_URL, JSON.stringify(payload));
  }

  // Skicka page_view när sidan laddats
  sendEvent('page_view');

  // Skicka scroll_50 när användaren scrollat över 50 %
  let hasScrolled = false;
  window.addEventListener('scroll', () => {
    if (!hasScrolled && window.scrollY / document.body.scrollHeight > 0.5) {
      sendEvent('scroll_50');
      hasScrolled = true;
    }
  });

  // Skicka klickhändelser för länkar och knappar
  document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button');
    if (target) {
      sendEvent('click', {
        tag: target.tagName,
        text: target.innerText.slice(0, 30),
        href: target.href || null,
      });
    }
  });
})();

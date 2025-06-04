<script>
(function () {
  const API_URL = 'https://macspotbackend.azurewebsites.net/api/tracking';

  let visitorId = localStorage.getItem('visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('visitor_id', visitorId);
  }

  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  function sendEvent(eventType, metadata = {}) {
    const payload = {
      visitor_id: visitorId,
      event_type: eventType,
      url: window.location.pathname,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || null,
      utm_source: getQueryParam('utm_source'),
      utm_medium: getQueryParam('utm_medium'),
      utm_campaign: getQueryParam('utm_campaign'),
      metadata,
    };

    try {
      navigator.sendBeacon(API_URL, JSON.stringify(payload));
    } catch (err) {
      console.error('[tracking] beacon error:', err);
    }
  }

  sendEvent('page_view');

  let hasScrolled = false;
  window.addEventListener('scroll', () => {
    if (!hasScrolled && window.scrollY / document.body.scrollHeight > 0.5) {
      sendEvent('scroll_50');
      hasScrolled = true;
    }
  });

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

  window.MacSpotUtils = { trackEvent: sendEvent };
})();
</script>

<script>
document.addEventListener("DOMContentLoaded", function () {
  const form = document.querySelector("form");

  if (form) {
    form.addEventListener("submit", function (e) {
      const emailInput = document.getElementById("email");
      const nameInput = document.getElementById("name");

      const email = emailInput ? emailInput.value.trim() : null;
      const name = nameInput ? nameInput.value.trim() : null;

      if (window.MacSpotUtils && email) {
        window.MacSpotUtils.trackEvent("form_submit", {
          email: email,
          name: name,
          form_name: form.getAttribute("name") || "webflow_form",
          form_action: form.getAttribute("action") || window.location.pathname,
          page_title: document.title
        });
        console.log("[tracking] Skickade form_submit:", email, name);
      }
    });
  }
});
</script>
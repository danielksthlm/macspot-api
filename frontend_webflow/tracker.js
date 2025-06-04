<script>
(function () {
  const API_URL = 'https://macspotbackend.azurewebsites.net/api/tracking';

  let visitorId = localStorage.getItem('visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('visitor_id', visitorId);
  }

  const sessionStartTime = Date.now();

  let ipAddress = null;
  fetch('https://api.ipify.org?format=json')
    .then(res => res.json())
    .then(data => { ipAddress = data.ip; })
    .catch(() => {});

  function sha256(input) {
    const buffer = new TextEncoder().encode(input);
    return crypto.subtle.digest("SHA-256", buffer).then(buf => {
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    });
  }

  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  async function sendEvent(eventType, metadata = {}) {
    const fingerprintInput = `${navigator.userAgent}|${window.screen.width}x${window.screen.height}|${navigator.language}|${Intl.DateTimeFormat().resolvedOptions().timeZone}`;
    const fingerprintHash = await sha256(fingerprintInput);

    const enrichedMetadata = {
      ...metadata,
      user_agent: navigator.userAgent,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        devicePixelRatio: window.devicePixelRatio
      },
      language: navigator.language || (navigator.languages && navigator.languages[0]) || 'unknown',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      platform: navigator.platform || null,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      deviceMemory: navigator.deviceMemory || null,
      performance_now: Math.round(performance.now()),
      viewport: {
        innerHeight: window.innerHeight,
        scrollY: window.scrollY
      },
      fingerprint: fingerprintHash,
      ip_address: ipAddress || null
    };

    const payload = {
      visitor_id: visitorId,
      event_type: eventType,
      url: window.location.pathname,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || null,
      utm_source: getQueryParam('utm_source'),
      utm_medium: getQueryParam('utm_medium'),
      utm_campaign: getQueryParam('utm_campaign'),
      metadata: enrichedMetadata,
    };

    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon(API_URL, JSON.stringify(payload));
      } else {
        await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
    } catch (err) {
      console.error('[tracking] beacon error:', err);
    }
  }

  sendEvent('page_view');

  window.addEventListener('beforeunload', () => {
    const timeOnPage = Math.round(performance.now() / 1000);
    sendEvent('session_end', {
      time_on_page_sec: timeOnPage,
      visited_pages: JSON.parse(sessionStorage.getItem('visitedPages') || '[]')
    });
  });

  window.addEventListener('beforeunload', () => {
    sendEvent('page_unload');
  });

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
        time_since_page_load_ms: Math.round(performance.now())
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

  const pages = JSON.parse(sessionStorage.getItem('visitedPages') || '[]');
  pages.push(window.location.pathname);
  sessionStorage.setItem('visitedPages', JSON.stringify(pages));
});
</script>
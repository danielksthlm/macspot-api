<script>
(function () {
  const API_URL = 'https://macspotbackend.azurewebsites.net/api/tracking';

  let visitorId = localStorage.getItem('visitor_id');
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    localStorage.setItem('visitor_id', visitorId);
  }

  const sessionStartTime = Date.now();

  // Advanced session tracking variables
  let visibleSeconds = 0;
  let lastVisibleTime = document.visibilityState === 'visible' ? Date.now() : null;
  let maxScroll = 0;
  let resizeCount = 0;

  let rageClickCount = 0;
  let lastClickTime = 0;
  let idleTime = 0;
  let lastActivity = Date.now();
  let scrollVelocityMax = 0;
  let lastScrollY = window.scrollY;

  ['mousemove', 'keydown', 'scroll'].forEach(event => {
    document.addEventListener(event, () => lastActivity = Date.now());
  });

  setInterval(() => {
    const now = Date.now();
    if (now - lastActivity > 5000) idleTime += 5;
  }, 5000);

  window.addEventListener('scroll', () => {
    const delta = Math.abs(window.scrollY - lastScrollY);
    if (delta > scrollVelocityMax) scrollVelocityMax = delta;
    lastScrollY = window.scrollY;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      lastVisibleTime = Date.now();
    } else if (lastVisibleTime) {
      visibleSeconds += Math.round((Date.now() - lastVisibleTime) / 1000);
      lastVisibleTime = null;
    }
  });

  window.addEventListener('resize', () => resizeCount++);
  window.addEventListener('scroll', () => {
    const current = Math.round(window.scrollY + window.innerHeight);
    if (current > maxScroll) maxScroll = current;
  });

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
      timezone_offset_min: new Date().getTimezoneOffset(),
      is_mobile: /Mobi|Android/i.test(navigator.userAgent),
      color_depth: window.screen.colorDepth,
      nav_type: performance?.navigation?.type ?? null,
      do_not_track: navigator.doNotTrack === "1",
      fingerprint: fingerprintHash,
      ip_address: ipAddress || null
    };

    try {
      if (performance?.timing?.loadEventEnd > 0) {
        enrichedMetadata.page_load_ms = performance.timing.loadEventEnd - performance.timing.navigationStart;
      }
    } catch {}

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
    if (lastVisibleTime) {
      visibleSeconds += Math.round((Date.now() - lastVisibleTime) / 1000);
    }

    const timeOnPage = Math.round(performance.now() / 1000);
    const visitedPages = JSON.parse(sessionStorage.getItem('visitedPages') || '[]');
    const clickTrail = JSON.parse(sessionStorage.getItem('clickTrail') || '[]');

    sendEvent('session_end', {
      time_on_page_sec: timeOnPage,
      visible_seconds: visibleSeconds,
      scroll_depth_px: maxScroll,
      resize_count: resizeCount,
      visited_pages: visitedPages,
      click_trail: clickTrail,
      total_idle_seconds: idleTime,
      rage_clicks: rageClickCount,
      scroll_velocity_max: scrollVelocityMax
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
      if (Date.now() - lastClickTime < 300) rageClickCount++;
      lastClickTime = Date.now();

      // Advanced clickTrail tracking
      const clickTrail = JSON.parse(sessionStorage.getItem('clickTrail') || '[]');
      clickTrail.push({
        tag: target.tagName,
        text: target.innerText?.slice(0, 50),
        href: target.href || null,
        ts: new Date().toISOString()
      });
      sessionStorage.setItem('clickTrail', JSON.stringify(clickTrail));

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
  const forms = document.querySelectorAll("form");

  forms.forEach(form => {
    const emailInput = form.querySelector('input[type="email"]') || form.querySelector(".newsletter-email");
    const nameInput = form.querySelector("#name") || form.querySelector("input[name='name']");

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
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

        // Send verification request after tracking form_submit
        try {
          if (window.MacSpotUtils.fetchJSON) {
            await MacSpotUtils.fetchJSON('/api/request_verification', {
              email,
              action: 'newsletter',
              campaign_id: 'klrab_juni_2025'
            }, 'POST');
          }

          if (window.MacSpotUtils.trackEvent) {
            window.MacSpotUtils.trackEvent("verification_requested", {
              email,
              action: 'newsletter',
              campaign_id: 'klrab_juni_2025'
            });
          }

          const successMsg = document.createElement("div");
          successMsg.innerText = "Tack! Kontrollera din e-post.";
          successMsg.style.color = "#006400";
          successMsg.style.marginTop = "10px";
          form.appendChild(successMsg);

          form.reset();
        } catch (err) {
          console.error("Verifieringsfel:", err);
          alert("Det gick inte att skicka din prenumeration.");
        }
      }
    });
  });

  const pages = JSON.parse(sessionStorage.getItem('visitedPages') || '[]');
  pages.push(window.location.pathname);
  sessionStorage.setItem('visitedPages', JSON.stringify(pages));
});
</script>
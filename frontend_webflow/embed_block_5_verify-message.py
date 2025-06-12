<script>
window.addEventListener('DOMContentLoaded', () => {
  const forms = document.querySelectorAll('form');

  forms.forEach(form => {
    const emailInput = form.querySelector('input[type="email"].newsletter-email');
    if (!emailInput) return;

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = emailInput.value.trim();
      if (!email || !email.includes('@')) {
        alert('Ange en giltig e-postadress.');
        return;
      }

      try {
        // 📨 Skicka verifieringsbegäran
        await MacSpotUtils.fetchJSON('/api/request_verification', {
          email,
          action: 'newsletter',
          campaign_id: 'klrab_juni_2025'
        }, 'POST');

        // 🧠 Spåra med tracking.js
        if (window.MacSpotUtils?.trackEvent) {
          window.MacSpotUtils.trackEvent('verification_requested', {
            email,
            action: 'newsletter',
            campaign_id: 'klrab_juni_2025'
          });
        }

        alert('Tack! Kontrollera din e-post.');
        form.reset();
      } catch (err) {
        alert('Något gick fel. Försök igen.');
        console.error('Verifieringsfel:', err);
      }
    });
  });
});
</script>
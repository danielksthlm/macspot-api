<script>
window.addEventListener('DOMContentLoaded', async () => {
  const token = new URLSearchParams(window.location.search).get('token');
  const container = document.getElementById('verify-message');

  if (!token || !container) {
    container.textContent = "Token saknas eller är ogiltig.";
    return;
  }

  container.textContent = "Verifierar…";

  try {
    const response = await MacSpotUtils.fetchJSON('/api/verify_token', { token }, 'POST');
    const { status, message, download_url, action, email } = response;

    if (status === 'confirmed' && action === 'newsletter') {
      container.textContent = "Tack! Din prenumeration är nu bekräftad.";
    } else if (status === 'confirmed' && action === 'download_pdf' && download_url) {
      container.textContent = "Din nedladdning startar strax…";

      if (window.MacSpotUtils?.trackEvent) {
        window.MacSpotUtils.trackEvent('pdf_download_triggered', {
          email,
          action,
          campaign_id: 'klrab_juni_2025',
          pdf_id: 'whitepaper_klrab2025'
        });
      }

      setTimeout(() => {
        window.location.href = download_url;
      }, 2000);
    } else {
      container.textContent = message || "Verifieringen lyckades, men inget hände.";
    }
  } catch (err) {
    console.error("Verifieringsfel:", err);
    container.textContent = "Det gick inte att verifiera din begäran.";
  }
});
</script>
<script>
  // const db = require('../db'); // Antag att db är en instans av en databasanslutning (t.ex. pg-pool)

  async function submitBooking(data) {
    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.warn('⛔ Bokning nekad –', errorData.error);
        return;
      }

      const result = await response.json();
      console.log('✅ Bokning skapad med ID:', result.bookingId);
    } catch (error) {
      console.error('❌ Fel vid bokning:', error);
    }
  }

  // Exempel på hur du kan använda funktionen med data från ett formulär eller liknande
  // Kontrollera att clt_ready är "true" innan anropet görs
  const clt_ready = String(document.querySelector('[name="clt_ready"]')?.value || '').toLowerCase();
  if (clt_ready === 'true') {
    const email = document.querySelector('[name="email"]')?.value || '';
    const contact_id = document.querySelector('[name="contact_id"]')?.value || '';
    const meeting_type = document.querySelector('[name="meeting_type"]')?.value || '';
    const meeting_length = document.querySelector('[name="meeting_length"]')?.value || '';
    const meeting_date = document.querySelector('[name="meeting_date"]')?.value || '';
    const meeting_time = document.querySelector('[name="meeting_time"]')?.value || '';

    if (!contact_id) {
      console.warn('⛔ Bokning nekad – contact_id saknas');
    } else {
      submitBooking({
        email,
        contact_id,
        meeting_type,
        meeting_length,
        meeting_date,
        meeting_time,
        clt_ready
      });
    }
  } else {
    console.warn('⛔ Bokning nekad – clt_ready är inte true');
  }
</script>
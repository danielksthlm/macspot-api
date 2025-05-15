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
      console.log('✅ Bokning skapad med ID:', result.booking_id);
    } catch (error) {
      console.error('❌ Fel vid bokning:', error);
    }
  }

  // Exempel på hur du kan använda funktionen med data från ett formulär eller liknande
  // Kontrollera att clt_ready är "true" innan anropet görs
  const clt_ready = String(document.querySelector('[name="clt_ready"]')?.value || '').toLowerCase();
  if (clt_ready === 'true') {
    const form = window.formState || {};
    if (!form.contact_id || !form.slot_iso) {
      console.warn('⛔ Bokning nekad – contact_id eller slot_iso saknas');
    } else {
      submitBooking({
        email: form.email,
        contact_id: form.contact_id,
        meeting_type: form.meeting_type,
        meeting_length: form.meeting_length,
        slot_iso: form.slot_iso
      });
    }
  } else {
    console.warn('⛔ Bokning nekad – clt_ready är inte true');
  }
</script>
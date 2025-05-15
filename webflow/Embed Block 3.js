<script>
  // const db = require('../db'); // Antag att db är en instans av en databasanslutning (t.ex. pg-pool)

  async function submitBooking(data) {
    if (!data.contact_id || !data.slot_iso || !data.email || !data.meeting_type || !data.meeting_length) {
      console.warn('⛔ Bokning nekad – obligatoriska fält saknas i data:', data);
      return;
    }
    try {
      console.log('📨 Skickar bokning:', data);
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
        alert('Bokningen misslyckades: ' + (errorData?.error || 'okänt fel'));
        return;
      }

      const result = await response.json();
      console.log('✅ Bokning skapad med ID:', result.bookingId);
      console.log('📦 Payload som skickades:', data);
      alert('Tack! Din bokning är genomförd.');
    } catch (error) {
      console.error('❌ Fel vid bokning:', error);
    }
  }

  // Koppla submit-booking-button till submitBooking
  const bookingButton = document.getElementById('submit-booking-button');
  if (bookingButton) {
    bookingButton.addEventListener('click', (e) => {
      e.preventDefault();
      const form = window.formState || {};
      if (!form.contact_id || !form.slot_iso) {
        console.warn('⛔ Bokning nekad – contact_id eller slot_iso saknas');
        return;
      }
      console.log('📤 Initierar POST mot /api/bookings med:', {
        email: form.email,
        contact_id: form.contact_id,
        meeting_type: form.meeting_type,
        meeting_length: form.meeting_length,
        slot_iso: form.slot_iso
      });
      submitBooking({
        email: form.email,
        contact_id: form.contact_id,
        meeting_type: form.meeting_type,
        meeting_length: form.meeting_length,
        slot_iso: form.slot_iso
      });
    });
  }
</script>
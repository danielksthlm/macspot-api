<script>
  async function submitBooking(data) {
    if (!data.contact_id || !data.slot_iso || !data.email || !data.meeting_type || !data.meeting_length) {
      return;
    }

    const startTime = new Date(data.slot_iso);
    const endTime = new Date(startTime.getTime() + data.meeting_length * 60000);

    const payload = {
      email: data.email,
      contact_id: data.contact_id,
      meeting_type: data.meeting_type,
      meeting_length: data.meeting_length,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      slot_iso: data.slot_iso
    };

    try {
      const response = await fetch('https://macspotbackend.azurewebsites.net/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        alert('Bokningen misslyckades: ' + (errorData?.error || 'okänt fel'));
        return;
      }

      alert('Tack! Din bokning är genomförd.');
    } catch (error) {
      alert('Fel vid bokning, försök igen senare.');
    }
  }
  if (typeof window.submitBooking !== 'function') {
    window.submitBooking = submitBooking;
  }

  function initBookingButtonListener() {
    const btn = document.getElementById('submit-booking-button');
    if (!btn) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();

      const cltReadyEl = document.getElementById('clt_ready');
      const cltEmailEl = document.getElementById('clt_email');
      const cltContactIdEl = document.getElementById('clt_contact_id');
      const cltMeetingTypeEl = document.getElementById('clt_meetingtype');
      const cltMeetingLengthEl = document.getElementById('clt_meetinglength');
      const cltSlotIsoEl = document.getElementById('clt_meetingtime');

      const cltEmail = cltEmailEl?.value.trim();
      const cltContactId = cltContactIdEl?.value.trim();
      const cltMeetingType = cltMeetingTypeEl?.value.trim();
      const cltMeetingLength = parseInt(cltMeetingLengthEl?.value, 10);
      const cltSlotIso = cltSlotIsoEl?.value.trim();
      const cltReady = cltReadyEl?.value.trim();

      if (!cltEmail || !cltContactId || !cltMeetingType || isNaN(cltMeetingLength) || !cltSlotIso || cltReady !== 'true') {
        return;
      }

      const bookingPayload = {
        email: cltEmail,
        contact_id: cltContactId,
        meeting_type: cltMeetingType,
        meeting_length: cltMeetingLength,
        slot_iso: cltSlotIso
      };

      submitBooking(bookingPayload);
    });
  }
  if (typeof window.initBookingButtonListener !== 'function') {
    window.initBookingButtonListener = initBookingButtonListener;
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      if (document.getElementById('calendar_grid')) {
        initBookingButtonListener();
      } else {
        const interval = setInterval(() => {
          if (document.getElementById('calendar_grid')) {
            clearInterval(interval);
            initBookingButtonListener();
          }
        }, 100);
      }
    } catch (err) {
    }
  });
</script>
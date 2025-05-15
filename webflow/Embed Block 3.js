async function submitBooking(data) {
  console.log('🚀 [Kod 3] submitBooking anropad');
  console.log('🔁 [Kod 3] submitBooking körs med data:', data);
  if (!data.contact_id || !data.slot_iso || !data.email || !data.meeting_type || !data.meeting_length) {
    console.warn('⛔ Bokning nekad – obligatoriska fält saknas i data:', data);
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
    slot_iso: data.slot_iso // 👈 Lades till här
  };

  console.log('📡 [Kod 3] Försöker POSTa till /api/bookings...');
  console.log('📦 [Kod 3] Payload som skickas:', payload);
  console.log('📡 [Kod 3] submitBooking kommer nu att försöka anropa fetch()');

  try {
    const response = await fetch('https://macspotbackend.azurewebsites.net/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.warn('⛔ Bokning nekad –', errorData.error);
      alert('Bokningen misslyckades: ' + (errorData?.error || 'okänt fel'));
      return;
    }

    const result = await response.json();
    console.log('✅ Bokning skapad med ID:', result.bookingId);
    alert('Tack! Din bokning är genomförd.');
  } catch (error) {
    console.error('❌ Fel vid bokning:', error);
  }
}
if (typeof window.submitBooking !== 'function') {
  window.submitBooking = submitBooking;
  console.log('✅ [Kod 3] submitBooking är nu kopplad till window');
}

function initBookingButtonListener() {
  console.log('🧠 [Kod 3] initBookingButtonListener() körs...');
  const btn = document.getElementById('submit-booking-button');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    e.preventDefault();

    console.log("✅ [Kod 3] Klick på Boka avlyssnad");

    const cltReadyEl = document.getElementById('clt_ready');
    const cltEmailEl = document.getElementById('clt_email');
    const cltContactIdEl = document.getElementById('clt_contact_id');
    const cltMeetingTypeEl = document.getElementById('clt_meetingtype');
    const cltMeetingLengthEl = document.getElementById('clt_meetinglength');
    const cltSlotIsoEl = document.getElementById('clt_meetingtime');

    console.log('🔍 clt_ready:', cltReadyEl?.value);
    console.log('🔍 clt_email:', cltEmailEl?.value);
    console.log('🔍 clt_contact_id:', cltContactIdEl?.value);
    console.log('🔍 clt_meetingtype:', cltMeetingTypeEl?.value);
    console.log('🔍 clt_meetinglength:', cltMeetingLengthEl?.value);
    console.log('🔍 clt_meetingtime:', cltSlotIsoEl?.value);

    const cltEmail = cltEmailEl?.value.trim();
    const cltContactId = cltContactIdEl?.value.trim();
    const cltMeetingType = cltMeetingTypeEl?.value.trim();
    const cltMeetingLength = parseInt(cltMeetingLengthEl?.value, 10);
    const cltSlotIso = cltSlotIsoEl?.value.trim();
    const cltReady = cltReadyEl?.value.trim();

    console.log('🧪 [Kod 3] Värden vid klick:', {
      cltEmail, cltContactId, cltMeetingType, cltMeetingLength, cltSlotIso, cltReady
    });

    console.log('🧪 [Kod 3] submitBooking-funktion kommer att köras (om villkor uppfylls)');
    console.log('🧪 Fältvärden:');
    console.log('    clt_email:', cltEmail);
    console.log('    clt_contact_id:', cltContactId);
    console.log('    clt_meetingtype:', cltMeetingType);
    console.log('    clt_meetinglength:', cltMeetingLength);
    console.log('    clt_meetingtime:', cltSlotIso);
    console.log('    clt_ready:', cltReady);

    console.log('🧠 meeting_time ändrad – clt_ready:', cltReadyEl?.value);

    if (!cltEmail || !cltContactId || !cltMeetingType || isNaN(cltMeetingLength) || !cltSlotIso || cltReady !== 'true') {
      console.warn('⛔ Bokning nekad – saknade fält eller clt_ready != true');
      return;
    }

    const bookingPayload = {
      email: cltEmail,
      contact_id: cltContactId,
      meeting_type: cltMeetingType,
      meeting_length: cltMeetingLength,
      slot_iso: cltSlotIso
    };

    console.log('📤 [Kod 3] Skickar payload till submitBooking:', bookingPayload);
    console.log('📤 [Kod 3] Kör submitBooking med:', bookingPayload);
    submitBooking(bookingPayload);
  });
  console.log('✅ [Kod 3] Bokningsknapp initierad');
}
if (typeof window.initBookingButtonListener !== 'function') {
  window.initBookingButtonListener = initBookingButtonListener;
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    console.log('✅ [Kod 3] DOMContentLoaded – bokningsblock initieras');

    if (document.getElementById('calendar_grid')) {
      console.log('🧠 [Kod 3] calendar_grid fanns direkt – initBookingButtonListener anropas');
      initBookingButtonListener();
    } else {
      const interval = setInterval(() => {
        if (document.getElementById('calendar_grid')) {
          console.log('🧠 [Kod 3] calendar_grid hittades efter väntan – initBookingButtonListener anropas');
          clearInterval(interval);
          initBookingButtonListener();
        }
      }, 100);
    }

  } catch (err) {
    console.error('❌ [Kod 3] Fel vid init:', err);
  }
});
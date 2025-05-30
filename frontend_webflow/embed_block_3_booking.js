<script>
  async function submitBooking(data) {
    console.log('📡 submitBooking anropades med:', data);
    if (!data.contact_id || !data.slot_iso || !data.meeting_type || !data.meeting_length) {
      return;
    }

    const startTime = new Date(data.slot_iso);
    const endTime = new Date(startTime.getTime() + data.meeting_length * 60000);

    const payload = {
      contact_id: data.contact_id,
      meeting_type: data.meeting_type,
      meeting_length: data.meeting_length,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      slot_iso: data.slot_iso,
      email: MacSpotUtils.getVal('#clt_email')
    };

    const btn = document.getElementById('submit-booking-button');
    if (btn) btn.disabled = true;

    try {
      const response = await MacSpotUtils.fetchJSON('/api/bookings', payload, 'POST');
      console.log('✅ Booking succeeded:', response);

      // Show success UI
      const successEl = document.querySelector('.w-form-done');
      const errorEl = document.querySelector('.w-form-fail');
      if (successEl) successEl.style.display = 'block';
      if (errorEl) errorEl.style.display = 'none';
      window.formState = null;
      if (btn) {
        btn.style.display = 'none';
        btn.disabled = false;
      }

      // After showing success, reset form and UI after a timeout
      setTimeout(() => {
        const form = document.querySelector('form');
        if (form) form.reset();

        const cltReady = document.getElementById('clt_ready');
        if (cltReady) cltReady.value = 'false';

        window.formState = null;

        const successEl = document.querySelector('.w-form-done');
        if (successEl) successEl.style.display = 'none';

        const calendarWrapper = document.getElementById('calendar_wrapper');
        if (calendarWrapper) calendarWrapper.style.display = 'none';

        const typeGroup = document.getElementById('meeting_type_group');
        if (typeGroup) typeGroup.style.display = 'none';

        const slotGroup = document.getElementById('time_slot_group');
        if (slotGroup) slotGroup.style.display = 'none';

        const slotSelect = document.getElementById('time_slot_select');
        if (slotSelect) slotSelect.innerHTML = '';

        const meetingTypeSelect = document.getElementById('meeting_type_select');
        if (meetingTypeSelect) meetingTypeSelect.innerHTML = '';
      }, 10000);
    } catch (error) {
      console.error('❌ submitBooking – fel från fetchJSON:', error.message || error);
      console.warn('📡 Payload vid fel:', payload);
      console.warn('📡 User-Agent:', navigator.userAgent);
      // console.warn('📡 Browser IP:', await (await fetch('https://api.ipify.org?format=json')).json());
      // IP-hämtning blockeras av CORS i Webflow – logga istället på backend.
      // Show error UI
      const errorEl = document.querySelector('.w-form-fail');
      const successEl = document.querySelector('.w-form-done');
      if (errorEl) errorEl.style.display = 'block';
      if (successEl) successEl.style.display = 'none';
      if (btn) btn.disabled = false;
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
      const cltContactIdEl = document.getElementById('clt_contact_id');
      const cltMeetingTypeEl = document.getElementById('clt_meetingtype');
      const cltMeetingLengthEl = document.getElementById('clt_meetinglength');
      const cltSlotIsoEl = document.getElementById('clt_meetingtime');
      const cltEmailEl = document.getElementById('clt_email');
      const cltEmail = cltEmailEl?.value.trim();

      if (!cltEmail || !cltEmail.includes('@')) {
        alert('Ange en giltig e-postadress.');
        return;
      }

      const cltContactId = cltContactIdEl?.value.trim();
      const cltMeetingType = cltMeetingTypeEl?.value.trim();
      const cltMeetingLengthRaw = cltMeetingLengthEl?.value;
      const cltMeetingLength = parseInt(cltMeetingLengthRaw, 10);
      if (isNaN(cltMeetingLength)) return;
      const cltSlotIso = cltSlotIsoEl?.value.trim();
      const cltReady = cltReadyEl?.value.trim();

      if (!cltContactId || !cltMeetingType || !cltSlotIso || cltReady !== 'true') {
        return;
      }

      const bookingPayload = {
        contact_id: cltContactId,
        meeting_type: cltMeetingType,
        meeting_length: cltMeetingLength,
        slot_iso: cltSlotIso,
        email: cltEmail
      };

      submitBooking(bookingPayload);
    });
  }
  if (typeof window.initBookingButtonListener !== 'function') {
    window.initBookingButtonListener = initBookingButtonListener;
  }

  window.addEventListener('DOMContentLoaded', () => {
    try {
      if (document.getElementById('submit-booking-button')) {
        initBookingButtonListener();
      } else {
        const interval = setInterval(() => {
          if (document.getElementById('submit-booking-button')) {
            clearInterval(interval);
            initBookingButtonListener();
          }
        }, 100);
      }
    } catch (err) {
    }
  });
</script>
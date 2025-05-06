<script>
  function validateContact() {
    const emailEl = document.querySelector('#booking_email');
    const email = emailEl ? emailEl.value.trim() : '';
    const meetingInput = document.querySelector('input[name="meeting_type"]:checked');
    const meetingType = meetingInput ? meetingInput.value : '';

    const isValidEmail = email.length > 0 && email.includes('@');
    const isMeetingTypeSelected = meetingType.length > 0;

    const submitBtn = document.getElementById('submit_contact');
    if (submitBtn) {
      submitBtn.disabled = !(isValidEmail && isMeetingTypeSelected);
    }
  }

  async function submitContactUpdate() {
    const emailInput = document.querySelector('#booking_email');
    const email = emailInput ? emailInput.value.trim() : '';
    const meetingInput = document.querySelector('input[name="meeting_type"]:checked');
    const meetingType = meetingInput ? meetingInput.value : '';

    if (!email || !meetingType) {
      alert('Please fill in all required fields.');
      return;
    }

    try {
      const response = await fetch('/api/update_contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, meetingType }),
      });

      if (response.ok) {
        alert('Contact updated successfully!');
        if (typeof window.triggerSlotSearch === 'function') {
          window.triggerSlotSearch();
        }
      } else {
        alert('Failed to update contact.');
      }
    } catch (error) {
      console.error('Error updating contact:', error);
      alert('An error occurred while updating contact.');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const emailEl = document.querySelector('#booking_email');
    if (emailEl) emailEl.addEventListener('input', validateContact);

    const meetingTypeRadios = document.querySelectorAll('input[name="meeting_type"]');
    meetingTypeRadios.forEach(radio => radio.addEventListener('change', validateContact));

    const submitBtn = document.getElementById('submit_contact');
    if (submitBtn) submitBtn.addEventListener('click', submitContactUpdate);

    validateContact();
  });
</script>
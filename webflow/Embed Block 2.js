<script>
  async function validateContact() {
    const email = document.querySelector('#booking_email').value.trim();
    const meetingType = document.querySelector('input[name="meeting_type"]:checked')?.value;

    if (!email || !email.includes('@')) return;
    if (!meetingType) return;

    const response = await fetch("https://macspotbackend.azurewebsites.net/api/validate_contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, meeting_type: meetingType })
    });

    const result = await response.json();
    console.log("✅ API-svar:", result);

    const submitButton = document.querySelector('#contact-update-button');
    const meetingTypeGroup = document.querySelector('#meeting_type_group');
    const bookingDetailsStep = document.querySelector('#booking-details-step');
    const addressWrapper = document.querySelector('#autofilled-fields-at-client');

    const fields = ['first_name', 'last_name', 'phone', 'company'];

    // Dölj alla inputs i början
    fields.forEach(field => {
      const inputField = document.querySelector(`#${field}`);
      if (inputField) inputField.style.display = 'none';
    });
    if (addressWrapper) addressWrapper.style.display = 'none';
    if (meetingTypeGroup) meetingTypeGroup.style.display = 'none';
    if (bookingDetailsStep) bookingDetailsStep.style.display = 'none';

    if (result.status === "ok") {
      if (meetingTypeGroup) meetingTypeGroup.style.display = 'block';
      if (bookingDetailsStep) bookingDetailsStep.style.display = 'block';
      if (submitButton) submitButton.style.display = 'none';
    } else if (result.status === "incomplete") {
      fields.forEach(field => {
        const inputField = document.querySelector(`#${field}`);
        if (inputField) {
          inputField.style.display = result.missing_fields.includes(field) ? 'block' : 'none';
        }
      });

      if (addressWrapper) {
        const addressFields = ['address', 'postal_code', 'city', 'country'];
        const missingAddressFields = result.missing_fields.filter(f => addressFields.includes(f));
        addressWrapper.style.display = missingAddressFields.length > 0 ? 'block' : 'none';
      }

      if (submitButton) {
        submitButton.style.display = 'block';
        submitButton.textContent = 'Uppdatera uppgifter';
      }
    } else if (result.status === "new_customer") {
      fields.forEach(field => {
        const inputField = document.querySelector(`#${field}`);
        if (inputField) inputField.style.display = 'block';
      });
      if (addressWrapper) addressWrapper.style.display = 'block';
      if (submitButton) {
        submitButton.style.display = 'block';
        submitButton.textContent = 'Skapa kontakt';
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const meetingTypeGroup = document.querySelector('#meeting_type_group');
    const bookingDetailsStep = document.querySelector('#booking-details-step');
    const addressWrapper = document.querySelector('#autofilled-fields-at-client');
    const emailField = document.querySelector('#booking_email');
    const validateButton = document.querySelector('#contact-update-button');

    if (meetingTypeGroup) meetingTypeGroup.style.display = 'none';
    if (addressWrapper) addressWrapper.style.display = 'none';
    if (bookingDetailsStep) bookingDetailsStep.style.display = 'none';

    if (emailField) {
      emailField.addEventListener('blur', () => {
        const email = emailField.value.trim();
        if (email && email.includes('@')) {
          if (meetingTypeGroup) meetingTypeGroup.style.display = 'block';
          // Väntar på att mötestyp väljs innan validateContact anropas
        }
      });
    }

    if (validateButton) {
      validateButton.addEventListener('click', validateContact);
    } else {
      console.error('🛑 contact-update-button hittades inte på sidan!');
    }

    document.querySelectorAll('input[name="meeting_type"]').forEach(radio => {
      radio.addEventListener('change', validateContact);
    });
  });
</script>
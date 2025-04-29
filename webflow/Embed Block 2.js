<script>
  async function validateContact() {
    const email = document.querySelector('#booking_email')?.value.trim();
    const meetingType = document.querySelector('input[name="meeting_type"]:checked')?.value;

    if (!email || !email.includes('@')) return;
    if (!meetingType) return;

    const response = await fetch('https://macspotbackend.azurewebsites.net/api/validate_contact', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, meeting_type: meetingType })
    });

    const result = await response.json();
    console.log("✅ API-svar:", result);

    const submitButton = document.querySelector('#contact-update-button');
    const addressWrapper = document.querySelector('#autofilled-fields-at-client');
    const fields = ['first_name', 'last_name', 'phone', 'company'];

    // Dölja allt först
    fields.forEach(field => {
      const input = document.querySelector(`#${field}`);
      if (input) input.style.display = 'none';
    });
    if (addressWrapper) addressWrapper.style.display = 'none';
    if (submitButton) submitButton.style.display = 'none';

    if (result.status === "ok") {
      submitButton.style.display = 'none';
    } else if (result.status === "incomplete") {
      fields.forEach(field => {
        const input = document.querySelector(`#${field}`);
        if (input && result.missing_fields.includes(field)) {
          input.style.display = 'block';
        }
      });
      const addressFields = ['address', 'postal_code', 'city', 'country'];
      if (result.missing_fields.some(f => addressFields.includes(f))) {
        addressWrapper.style.display = 'block';
      }
      submitButton.style.display = 'block';
      submitButton.value = 'Uppdatera uppgifter';
    } else if (result.status === "new_customer") {
      fields.forEach(field => {
        const input = document.querySelector(`#${field}`);
        if (input) input.style.display = 'block';
      });
      addressWrapper.style.display = 'block';
      submitButton.style.display = 'block';
      submitButton.value = 'Skapa kontakt';
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const meetingTypeGroup = document.querySelector('#meeting_type_group');
    const emailField = document.querySelector('#booking_email');

    if (meetingTypeGroup) meetingTypeGroup.style.display = 'none';

    if (emailField) {
      emailField.addEventListener('blur', () => {
        const email = emailField.value.trim();
        if (email && email.includes('@')) {
          meetingTypeGroup.style.display = 'block';
        }
      });
    }

    document.addEventListener('change', (e) => {
      if (e.target.name === 'meeting_type') {
        validateContact();
      }
    });
  });
</script>
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
    if (addressWrapper) {
      addressWrapper.classList.add('atClientField');
    }
    const fields = ['first_name', 'last_name', 'phone', 'company'];

    fields.forEach(field => {
      const input = document.querySelector(`#${field}`);
      if (input) {
        input.style.display = 'none';
        input.classList.remove('needs-filling');
      }
    });
    if (addressWrapper) addressWrapper.style.display = 'none';

    if (submitButton) {
      submitButton.style.display = 'none';
    }

    if (result.status === "ok") {
      window.triggerSlotSearch?.();
    } else if (result.status === "incomplete") {
      fields.forEach(field => {
        const input = document.querySelector(`#${field}`);
        if (input && result.missing_fields.includes(field)) {
          input.style.display = 'block';
          input.classList.add('needs-filling');
        }
      });

      const addressFields = ['address', 'postal_code', 'city', 'country'];
      if (meetingType === 'atClient' && result.missing_fields.some(f => addressFields.includes(f))) {
        if (addressWrapper) addressWrapper.style.display = 'block';
        addressFields.forEach(field => {
          const input = document.querySelector(`#${field}`);
          if (input) input.classList.add('needs-filling');
        });
      } else {
        if (addressWrapper) addressWrapper.style.display = 'none';
        addressFields.forEach(field => {
          const input = document.querySelector(`#${field}`);
          if (input) input.classList.remove('needs-filling');
        });
      }

      const needsFillingElements = document.querySelectorAll('.needs-filling');
      const allVisibleAndEmpty = Array.from(needsFillingElements).some(el => el.offsetParent !== null && !el.value.trim());

      if (submitButton) {
        if (allVisibleAndEmpty) {
          submitButton.style.display = 'block';
          submitButton.value = 'Uppdatera uppgifter';
        } else {
          submitButton.style.display = 'none';
          window.triggerSlotSearch?.();
        }
      }
    } else if (result.status === "new_customer") {
      fields.forEach(field => {
        const input = document.querySelector(`#${field}`);
        if (input) {
          input.style.display = 'block';
          input.classList.add('needs-filling');
        }
      });
      if (meetingType === 'atClient') {
        if (addressWrapper) {
          addressWrapper.style.display = 'block';
          const addressFields = ['address', 'postal_code', 'city', 'country'];
          addressFields.forEach(field => {
            const input = document.querySelector(`#${field}`);
            if (input) input.classList.add('needs-filling');
          });
        }
      } else {
        if (addressWrapper) addressWrapper.style.display = 'none';
        const addressFields = ['address', 'postal_code', 'city', 'country'];
        addressFields.forEach(field => {
          const input = document.querySelector(`#${field}`);
          if (input) input.classList.remove('needs-filling');
        });
      }

      const needsFillingElements = document.querySelectorAll('.needs-filling');
      const allVisibleAndEmpty = Array.from(needsFillingElements).some(el => el.offsetParent !== null && !el.value.trim());

      if (submitButton) {
        if (allVisibleAndEmpty) {
          submitButton.style.display = 'block';
          submitButton.value = 'Skapa kontakt';
        } else {
          submitButton.style.display = 'none';
          window.triggerSlotSearch?.();
        }
      }
    }
  }

  // --- NEW FUNCTION: submitContactUpdate ---
  async function submitContactUpdate() {
    const email = document.querySelector('#booking_email')?.value.trim();
    if (!email) {
      console.error('🛑 Email is required to check status.');
      return;
    }

    try {
      const response = await fetch(`https://macspotbackend.azurewebsites.net/api/check_contact?email=${encodeURIComponent(email)}`);
      const result = await response.json();
      console.log("✅ Svar från check_contact:", result);

      const submitButton = document.querySelector('#contact-update-button');

      if (result.status === "incomplete") {
        // Show fields to fill and submit button if needed
        const needsFillingElements = document.querySelectorAll('.needs-filling');
        const allVisibleAndEmpty = Array.from(needsFillingElements).some(el => el.offsetParent !== null && !el.value.trim());

        if (submitButton) {
          if (allVisibleAndEmpty) {
            submitButton.style.display = 'block';
            submitButton.value = 'Uppdatera uppgifter';
          } else {
            submitButton.style.display = 'none';
          }
        }
      } else if (result.status === "new_customer") {
        // Show fields to fill and submit button if needed
        const needsFillingElements = document.querySelectorAll('.needs-filling');
        const allVisibleAndEmpty = Array.from(needsFillingElements).some(el => el.offsetParent !== null && !el.value.trim());

        if (submitButton) {
          if (allVisibleAndEmpty) {
            submitButton.style.display = 'block';
            submitButton.value = 'Skapa kontakt';
          } else {
            submitButton.style.display = 'none';
          }
        }
      } else {
        if (submitButton) {
          submitButton.style.display = 'none';
        }
      }
    } catch (error) {
      console.error('❌ Fel vid kontroll av kontaktstatus:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const meetingTypeGroup = document.querySelector('#meeting_type_group');
    const emailField = document.querySelector('#booking_email');
    const submitButton = document.querySelector('#contact-update-button');

    if (meetingTypeGroup) {
      meetingTypeGroup.style.display = 'none';
    }

    if (emailField) {
      emailField.addEventListener('blur', () => {
        const email = emailField.value.trim();
        if (email && email.includes('@')) {
          if (meetingTypeGroup) meetingTypeGroup.style.display = 'block';
        }
      });
    }

    if (submitButton) {
      submitButton.style.display = 'none';
      submitButton.addEventListener('click', (event) => {
        event.preventDefault();
        submitContactUpdate();
      });
    }

    document.querySelectorAll('input[name="meeting_type"]').forEach(radio => {
      radio.addEventListener('change', validateContact);
    });
  });
</script>
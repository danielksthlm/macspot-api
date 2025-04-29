<script>
  async function submitContactUpdate() {
    const email = document.querySelector('#booking_email')?.value.trim();
    const meetingType = document.querySelector('input[name="meeting_type"]:checked')?.value;
    const firstName = document.querySelector('#first_name')?.value.trim();
    const lastName = document.querySelector('#last_name')?.value.trim();
    const phone = document.querySelector('#phone')?.value.trim();
    const company = document.querySelector('#company')?.value.trim();
    const address = document.querySelector('#address')?.value.trim();
    const postalCode = document.querySelector('#postal_code')?.value.trim();
    const city = document.querySelector('#city')?.value.trim();
    const country = document.querySelector('#country')?.value.trim();

    if (!email || !meetingType) {
      console.error('🛑 Email och mötestyp krävs!');
      return;
    }

    const body = { email, meeting_type: meetingType, first_name: firstName, last_name: lastName, phone, company, address, postal_code: postalCode, city, country };

    try {
      const response = await fetch('https://macspotbackend.azurewebsites.net/api/update_contact', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      console.log("✅ Svar från update_contact:", result);

      if (result.status === "updated" || result.status === "created") {
        location.reload();
      } else {
        console.error('❌ Kunde inte spara kontakt:', result);
      }
    } catch (error) {
      console.error('❌ Tekniskt fel vid sparande:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const submitButton = document.querySelector('#contact-update-button');
    if (submitButton) {
      submitButton.addEventListener('click', (e) => {
        e.preventDefault();
        submitContactUpdate();
      });
    }
  });
</script>
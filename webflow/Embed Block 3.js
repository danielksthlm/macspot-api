<script>
  // --- NEW FUNCTION: submitContactUpdate ---
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
      console.error('🛑 Kan inte skicka utan email och meeting_type.');
      return;
    }

    const body = {
      email: email,
      meeting_type: meetingType,
      origin: "klrab.se",
      first_name: firstName,
      last_name: lastName,
      phone: phone,
      company: company,
      address: address,
      postal_code: postalCode,
      city: city,
      country: country
    };

    try {
      const response = await fetch('https://macspotbackend.azurewebsites.net/api/update_contact', {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const result = await response.json();
      console.log("✅ Svar från update_contact:", result);

      if (result.status === "updated" || result.status === "created") {
        location.reload(); // Alternativt gå vidare till nästa steg
      } else {
        alert('❌ Kunde inte spara, försök igen.');
      }
    } catch (error) {
      console.error('❌ Fel vid update_contact:', error);
      alert('❌ Tekniskt fel vid sparande.');
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const submitButton = document.querySelector('#contact-update-button');
    if (submitButton) {
      submitButton.addEventListener('click', (event) => {
        event.preventDefault();
        submitContactUpdate();
      });
    }
  });
</script>
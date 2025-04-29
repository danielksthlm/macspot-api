<script>
  async function submitContactUpdate() {
    const email = document.querySelector('#booking_email')?.value.trim();
    const meetingType = document.querySelector('input[name="meeting_type"]:checked')?.value;

    if (!email || !meetingType) {
      console.error('🛑 Kan inte skicka utan email och mötestyp.');
      return;
    }

    // Kontrollera att alla needs-filling fält är ifyllda
    const needsFilling = document.querySelectorAll('.needs-filling');
    let allFilled = true;

    needsFilling.forEach(field => {
      if (!field.value.trim()) {
        allFilled = false;
        field.style.borderColor = 'red'; // Visa att fält är tomt
      } else {
        field.style.borderColor = ''; // Nollställ om korrekt
      }
    });

    if (!allFilled) {
      console.error('🛑 Alla obligatoriska fält måste fyllas i.');
      alert('Vänligen fyll i alla obligatoriska fält.');
      return;
    }

    const body = {
      email,
      meeting_type: meetingType
    };

    needsFilling.forEach(field => {
      const key = field.id;
      const value = field.value.trim();
      if (value) {
        body[key] = value;
      }
    });

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
        alert('❌ Kunde inte spara, försök igen.');
      }
    } catch (error) {
      console.error('❌ Tekniskt fel vid sparande:', error);
      alert('❌ Tekniskt fel.');
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
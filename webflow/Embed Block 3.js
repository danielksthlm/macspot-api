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
        window.triggerSlotSearch?.();
      } else {
        alert('❌ Kunde inte spara, försök igen.');
      }
    } catch (error) {
      console.error('❌ Fel vid update_contact:', error);
      alert('❌ Tekniskt fel vid sparande.');
    }
  }

  // --- UPDATED FUNCTION: triggerSlotSearch ---
  async function triggerSlotSearch() {
    const meetingType = document.querySelector('input[name="meeting_type"]:checked')?.value;
    const email = document.querySelector('#booking_email')?.value.trim();
    const meetingLengthStr = document.querySelector('#meeting_length')?.value.trim();
    const meetingLength = parseInt(meetingLengthStr, 10);

    if (!meetingType || !email || isNaN(meetingLength)) {
      console.warn("⛔️ Saknar meeting_type, email eller giltig meeting_length.");
      return;
    }

    const response = await fetch("https://macspotbackend.azurewebsites.net/api/getavailableslots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_type: meetingType,
        email: email,
        meeting_length: meetingLength
      })
    });

    const result = await response.json();
    console.log("📅 Tillgängliga tider:", result);

    const wrapper = document.querySelector("#calendar-wrapper");
    if (!wrapper) {
      console.warn("⚠️ calendar-wrapper hittades inte.");
      return;
    }

    wrapper.innerHTML = ""; // töm tidigare

    if (!Array.isArray(result.slots) || result.slots.length === 0) {
      wrapper.innerHTML = "<p>Inga tider tillgängliga just nu.</p>";
      return;
    }

    result.slots.forEach(slot => {
      const btn = document.createElement("button");
      btn.textContent = new Date(slot).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
      btn.className = "calendar-slot-button";
      btn.addEventListener("click", () => {
        document.querySelector("#selected_slot")?.setAttribute("value", slot);
        document.querySelector("#selected_slot_display").textContent = btn.textContent;
      });
      wrapper.appendChild(btn);
    });
  }

  window.triggerSlotSearch = triggerSlotSearch;

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
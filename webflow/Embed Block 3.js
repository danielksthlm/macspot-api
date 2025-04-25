/**
 * Embed Block 3 – Initiering av tillgängliga tider
 * Kräver: färdigifylld kontakt + mötestyp + möteslängd (minuter)
 * Anropar: /api/getAvailableSlots
 */

window.MacSpotCalendar = {
  async startCalendarFlow() {
    const email = document.getElementById("email")?.value.trim();
    const meetingType = document.querySelector('input[name="meeting_type"]:checked')?.value;
    const duration = document.getElementById("meeting_minutes")?.value;

    if (!email || !meetingType || !duration) {
      console.warn("🛑 Saknar e-post, mötestyp eller mötestid.");
      return;
    }

    try {
      const res = await fetch("https://macspotbackend.azurewebsites.net/api/getAvailableSlots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, meeting_type: meetingType, minutes: Number(duration) })
      });

      if (!res.ok) throw new Error(`Fel: ${res.status}`);
      const data = await res.json();

      console.log("🕒 Tillgängliga tider (API-svar):", data);

      // TODO: Sätt in data i fm/em-slotgrupper här

    } catch (err) {
      console.error("🛑 Misslyckades att hämta tider:", err);
    }
  }
};
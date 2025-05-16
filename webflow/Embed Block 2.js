<script>
window.initAvailableSlotFetch = function() {
  const cltReady = document.getElementById('clt_ready')?.value;
  if (cltReady !== 'true' || !window.formState) {
    console.warn('❌ Kan inte hämta tillgängliga tider – formState eller clt_ready saknas');
    return;
  }

  console.log('📡 Hämtar tillgängliga tider för:', window.formState);
  if (!window.formState.contact_id) {
    console.warn('⚠️ contact_id saknas i formState – fetch avbryts');
  }

  fetch('https://macspotbackend.azurewebsites.net/api/getavailableslots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: window.formState.email,
      meeting_type: window.formState.meeting_type,
      meeting_length: window.formState.meeting_length,
      contact_id: window.formState.contact_id
    })
  })
  .then(res => res.json())
  .then(data => {
    console.log('🧪 Rått slotData från API:', data);
    if (!Array.isArray(data.slots)) {
      console.warn('⚠️ API svarar utan slot-array:', data);
    }
    if (Array.isArray(data.slots)) {
      const grouped = {};
      data.slots.forEach(slot => {
        const localDate = new Date(slot.slot_iso);
        const localYear = localDate.getFullYear();
        const localMonth = String(localDate.getMonth() + 1).padStart(2, '0');
        const localDay = String(localDate.getDate()).padStart(2, '0');
        const date = `${localYear}-${localMonth}-${localDay}`;
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push({
          slot_iso: slot.slot_iso,
          slot_local: slot.slot_local || slot.slot_iso
        });
      });
      console.log('📦 Skickar grouped slots till setAvailableSlots:', grouped);
      if (typeof window.setAvailableSlots === 'function') {
        window.setAvailableSlots(grouped);
      } else {
        console.warn('⚠️ setAvailableSlots() saknas – kontrollera att kalendermodul är laddad');
      }
    } else {
      console.warn('⚠️ Ogiltigt slotData-format:', data);
    }
  })
  .catch(err => {
    console.error('❌ Fetch error in getavailableslots:', err.message || err);
    alert('Fel vid hämtning av tider. Kontrollera din internetanslutning eller att servern är tillgänglig.');
  });
};

window.setAvailableSlots = function(groupedSlots) {
  console.log('🧠 [Kod 2b] setAvailableSlots anropad med:', groupedSlots);
  console.log('🧠 [Kod 2b] window.formState:', window.formState);
  if (!window.CalendarModule || typeof window.CalendarModule.renderCalendar !== 'function') {
    return;
  }

  // Konvertera groupedSlots från {datum: [{slot_iso, slot_local}]} till {datum: [slot_local]}
  const reformatted = {};
  for (const [date, slots] of Object.entries(groupedSlots)) {
    reformatted[date] = slots.map(slot => slot.slot_local || slot.slot_iso);
  }

  window.CalendarModule.renderCalendar(reformatted);
};
</script>
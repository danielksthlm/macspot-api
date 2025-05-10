<script>
// Skapa ett nytt objekt CalendarModule och flytta in funktionerna som metoder
window.CalendarModule = {
  renderCalendar: function(groupedSlots, currentDate) {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (!calendarWrapper) {
      console.warn('⚠️ calendarWrapper is null – renderCalendar avbryts');
      return;
    }
    // Exempel på rendering (detaljer beroende på implementation)
    calendarWrapper.innerHTML = ''; // Rensa tidigare innehåll
    // Rendera kalender baserat på groupedSlots och currentDate
    // ...
  },

  renderTimes: function(times) {
    const timesWrapper = document.getElementById('times_wrapper');
    if (!timesWrapper) {
      console.warn('⚠️ timesWrapper is null – renderTimes avbryts');
      return;
    }
    timesWrapper.innerHTML = ''; // Rensa tidigare tider
    // Rendera tider baserat på times
    // ...
  },

  highlightDate: function(date) {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (!calendarWrapper) return;
    const selectedDayEl = calendarWrapper.querySelector(`[data-date="${date.toISOString().slice(0,10)}"]`);
    if (selectedDayEl) {
      selectedDayEl.classList.add('selected');
      selectedDayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },

  formatDate: function(date) {
    // Exempel på formatering
    return date.toISOString().slice(0,10);
  }
};

// Gör att kod 2b kan köra rendering baserat på laddade slots.
window.setAvailableSlots = function(groupedSlots) {
  console.log('📆 setAvailableSlots kallad med:', Object.keys(groupedSlots || {}).length, 'datum');
  // Hantera initialSlotRendered (återställs varje gång nya slots sätts)
  window.initialSlotRendered = false;
  window.latestAvailableSlots = groupedSlots; // fallback cache om renderCalendar saknas
  // Hitta första datum med lediga tider
  const firstAvailableDateStr = Object.keys(groupedSlots).sort()[0];
  const firstAvailableDate = new Date(firstAvailableDateStr);
  window.firstAvailableDate = firstAvailableDate;
  if (typeof window.CalendarModule.renderCalendar === 'function') {
    window.CalendarModule.renderCalendar(groupedSlots, window.firstAvailableDate);
  } else {
    console.warn('⚠️ renderCalendar saknas – kontrollera att 2b är laddad');
  }
};
</script>
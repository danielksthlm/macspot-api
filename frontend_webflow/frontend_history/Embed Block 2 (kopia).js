<script>
// Globala flaggor för valhantering och månad
window.userHasManuallySelectedDate = false;
window.initialSlotRendered = false;
window.lastRenderedMonth = null;

// Maxbokningsdatum: 60 dagar framåt
const maxBookingDate = new Date();
maxBookingDate.setDate(maxBookingDate.getDate() + 60); // 60 dagar framåt

window.CalendarModule = {
  renderCalendar: function(groupedSlots, firstDate) {
    // Hide calendar if meeting type or meeting length is not selected
    const cltType = document.getElementById('clt_meetingtype')?.value;
    const cltLength = document.getElementById('clt_meetinglength')?.value;
    if (!cltType || !cltLength) {
      const wrapper = document.getElementById('calendar_wrapper');
      if (wrapper) {
        wrapper.style.display = 'none';
        wrapper.style.opacity = '0';
        wrapper.style.visibility = 'hidden';
      }
      return;
    }
    if (!(firstDate instanceof Date) || isNaN(firstDate.getTime())) {
      console.warn('❌ Ogiltigt startdatum i renderCalendar');
      return;
    }
    if (!groupedSlots || typeof groupedSlots !== 'object') {
      console.warn('❌ groupedSlots saknas eller är ogiltigt i renderCalendar');
      return;
    }

    const wrapper = document.getElementById('calendar_wrapper');
    if (wrapper) {
      wrapper.style.display = 'flex';
      wrapper.style.opacity = '1';
      wrapper.style.visibility = 'visible';
    }
    const grid = document.getElementById('calendar_grid');
    const weekLabelEls = grid.querySelectorAll('.weeklabel');
    const weekNumberEls = grid.querySelectorAll('.weeknumber');
    const dayEls = grid.querySelectorAll('.day');

    if (!wrapper || !grid || dayEls.length === 0) {
      console.warn('❌ Nödvändiga element saknas i DOM');
      return;
    }

    const currentMonth = new Date(firstDate.getFullYear(), firstDate.getMonth(), 1);
    const currentMonthKey = currentMonth.getFullYear() + '-' + currentMonth.getMonth();

    const monthEl = document.getElementById('calendar_month');
    if (monthEl) {
      monthEl.textContent = currentMonth.toLocaleString('sv-SE', { month: 'long', year: 'numeric' });
    }

    // Inserted: Setup calendar navigation arrows and month label click
    // --- Calculate latest allowed month based on groupedSlots (not maxBookingDate) ---
    const latestSlotDateStr = Object.keys(groupedSlots).sort().slice(-1)[0];
    const latestSlotDate = new Date(latestSlotDateStr);
    const latestAllowedMonth = new Date(latestSlotDate.getFullYear(), latestSlotDate.getMonth(), 1);
    const leftArrow = document.getElementById('cal_arrow_left');
    const rightArrow = document.getElementById('cal_arrow_right');
    if (leftArrow && rightArrow) {
      // Ny logik för att begränsa och rotera månader
      const firstAllowedMonth = new Date();
      firstAllowedMonth.setDate(1);
      const lastAllowedMonth = latestAllowedMonth;

      leftArrow.onclick = () => {
        const prevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
        window.userHasManuallySelectedDate = false;
        if (
          currentMonth.getFullYear() === firstAllowedMonth.getFullYear() &&
          currentMonth.getMonth() === firstAllowedMonth.getMonth()
        ) {
          // Roterar bakåt från första → sista
          window.CalendarModule.renderCalendar(groupedSlots, lastAllowedMonth);
        } else {
          window.CalendarModule.renderCalendar(groupedSlots, prevMonth);
        }
      };

      rightArrow.onclick = () => {
        const nextMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
        window.userHasManuallySelectedDate = false;
        if (
          currentMonth.getFullYear() === lastAllowedMonth.getFullYear() &&
          currentMonth.getMonth() === lastAllowedMonth.getMonth()
        ) {
          // Roterar framåt från sista → första
          window.CalendarModule.renderCalendar(groupedSlots, firstAllowedMonth);
        } else {
          window.CalendarModule.renderCalendar(groupedSlots, nextMonth);
        }
      };
      leftArrow.style.cursor = 'pointer';
      rightArrow.style.cursor = 'pointer';
    }
    if (monthEl) {
      monthEl.onclick = () => {
        const today = new Date();
        window.CalendarModule.renderCalendar(window.latestAvailableSlots, today);
      };
      monthEl.style.cursor = 'pointer';
    }

    const labels = ['', 'M', 'T', 'O', 'T', 'F', 'L', 'S'];
    weekLabelEls.forEach((el, index) => {
      el.textContent = labels[index] || '';
    });

    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const rawLastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const lastDay = rawLastDay > maxBookingDate ? maxBookingDate : rawLastDay;
    const jsDay = (firstDay.getDay() + 6) % 7; // ensures Monday = 0
    const startOffset = jsDay;
    const totalDays = startOffset + lastDay.getDate();
    const numWeeks = Math.ceil(totalDays / 7);
    const maxDayElements = dayEls.length;

    window.firstAvailableInMonthSelected = false;
    let dayIndex = 0;
    for (let week = 0; week < numWeeks; week++) {
      const monday = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + week * 7);
      const weekNumber = window.getISOWeek(monday);
      if (week < weekNumberEls.length) {
        weekNumberEls[week].textContent = 'v' + weekNumber;
      }

      for (let wd = 0; wd < 7; wd++) {
        const gridIndex = week * 7 + wd;
        if (dayIndex >= maxDayElements) break;
        const dayEl = dayEls[dayIndex];
        if (!dayEl) {
          dayIndex++;
          continue;
        }
        const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + gridIndex);
        // ISO-format för datum (YYYY-MM-DD, svensk lokal)
        const isoDate = cellDate.toLocaleDateString('sv-SE').replaceAll('.', '-');

        if (cellDate.getMonth() !== currentMonth.getMonth()) {
          dayEl.textContent = '';
          dayEl.removeAttribute('data-date');
          dayEl.classList.remove('today', 'available', 'selected');
          dayIndex++;
          continue;
        }
        // Visa alla dagar i månaden, men endast tillgängliga dagar blir klickbara
        dayEl.textContent = cellDate.getDate();
        dayEl.dataset.date = isoDate;

        const isToday = cellDate.toDateString() === new Date().toDateString();
        if (isToday) dayEl.classList.add('today');
        else dayEl.classList.remove('today');

        const availableSlots = groupedSlots[isoDate];
        const isAvailable = Array.isArray(availableSlots) && availableSlots.length > 0;
        if (isAvailable) {
          dayEl.classList.add('available');
          const cloned = dayEl.cloneNode(true);
          cloned.classList.add('available');
          if (isToday) cloned.classList.add('today');
          cloned.addEventListener('click', () => {
            // Manuell val
            window.userHasManuallySelectedDate = true;
            const allDays = document.querySelectorAll('.day');
            allDays.forEach(d => d.classList.remove('selected'));
            cloned.classList.add('selected');
            const selectedDateEl = document.getElementById('selected_date');
            if (selectedDateEl) {
              const weekday = cellDate.toLocaleDateString('sv-SE', { weekday: 'long' });
              const formatted = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${cellDate.getDate()} ${cellDate.toLocaleDateString('sv-SE', { month: 'short' })}`;
              selectedDateEl.textContent = formatted;
            }
            window.CalendarModule.highlightDate(cloned);
            window.CalendarModule.renderTimes(groupedSlots[isoDate]);
          });
          dayEl.replaceWith(cloned);

          // Om månad just bytts (pga pilklick) och ingen dag är vald – välj första tillgängliga dag i denna månad
          const isSameMonth = currentMonth.getMonth() === cellDate.getMonth() && currentMonth.getFullYear() === cellDate.getFullYear();
          if (!window.firstAvailableInMonthSelected && isSameMonth && !window.userHasManuallySelectedDate) {
            // Kontrollera att datumet verkligen är den första tillgängliga i denna månad
            const currentMonthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`;
            const isoMonthStr = isoDate.slice(0, 7); // YYYY-MM
            if (isoMonthStr === currentMonthStr) {
              // Ensure only one .day has 'selected' class
              const allDays = document.querySelectorAll('.day');
              allDays.forEach(d => d.classList.remove('selected'));
              cloned.classList.add('selected');
              const selectedDateEl = document.getElementById('selected_date');
              if (selectedDateEl) {
                const weekday = cellDate.toLocaleDateString('sv-SE', { weekday: 'long' });
                const formatted = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${cellDate.getDate()} ${cellDate.toLocaleDateString('sv-SE', { month: 'short' })}`;
                selectedDateEl.textContent = formatted;
              }
              cloned.scrollIntoView({ behavior: 'smooth', block: 'center' });
              window.CalendarModule.renderTimes(groupedSlots[isoDate]);
              window.initialSlotRendered = true;
              window.lastRenderedMonth = currentMonthKey;
              window.firstAvailableInMonthSelected = true;
            }
          }
        } else {
          dayEl.classList.remove('available');
          dayEl.classList.remove('selected');
        }
        dayIndex++;
      }
    }

    for (let i = numWeeks; i < weekNumberEls.length; i++) {
      weekNumberEls[i].textContent = '';
    }

    for (let i = dayIndex; i < dayEls.length; i++) {
      const el = dayEls[i];
      el.textContent = '';
      el.removeAttribute('data-date');
      el.classList.remove('today', 'available', 'selected');
    }

    console.log('🧪 Kontroll DOM:', {
      wrapperExists: !!wrapper,
      gridExists: !!grid,
      dayCount: dayEls.length,
      weekLabelCount: weekLabelEls.length,
      weekNumberCount: weekNumberEls.length
    });
    console.log('✅ Kalender renderad');

    // Förval första tillgängliga dag - logik flyttad till inuti isAvailable ovan, samt skyddas av userHasManuallySelectedDate.

    // Hide calendar if meeting type or meeting length is cleared after selection
    const cltTypeCheck = document.getElementById('clt_meetingtype')?.value;
    const cltLengthCheck = document.getElementById('clt_meetinglength')?.value;
    const wrapperCheck = document.getElementById('calendar_wrapper');
    if (!cltTypeCheck || !cltLengthCheck) {
      if (wrapperCheck) {
        wrapperCheck.style.display = 'none';
      }
    }
  },
  renderTimes: function(times) {
    const timeGrid = document.getElementById('time_grid');
    const submitButton = document.getElementById('submit-booking-button');
    const cltMeetingTime = document.getElementById('clt_meetingtime');
    if (!timeGrid || !Array.isArray(times)) {
      console.warn('❌ renderTimes: time_grid saknas eller times är ogiltig');
      return;
    }

    const timeItems = timeGrid.querySelectorAll('.timeitems');
    timeItems.forEach((item, idx) => {
      const label = item.querySelector('span.time-label') || item.querySelector('span.w-form-label');
      if (label) {
        label.className = 'time-label w-form-label';
      }
      const input = item.querySelector('input[type="radio"]');
      const slot = times[idx];

      if (!slot || !input || !label) {
        item.style.display = 'none';
        return;
      }

      if (label && label.textContent === 'Radio') {
        label.textContent = '';
      }

      const labelText = typeof slot === 'object' && slot.slot_local
        ? slot.slot_local.slice(11, 16)
        : typeof slot === 'string'
        ? slot.slice(11, 16)
        : '';

      if (labelText) {
        label.textContent = labelText;
      } else {
        item.style.display = 'none';
        return;
      }

      input.value = slot.slot_iso || slot;
      input.dataset.slotIso = slot.slot_iso || slot;
      input.name = 'meeting_time';
      input.id = `radio-${idx}`;
      label.setAttribute('for', `radio-${idx}`);
      item.dataset.slotIso = slot.slot_iso || slot;
      item.style.display = 'block';

      item.onclick = () => {
        timeItems.forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');

        if (!window.formState) window.formState = {};
        window.formState.slot_iso = slot.slot_iso || slot;
        window.formState.meeting_time = labelText;

        if (cltMeetingTime) cltMeetingTime.value = slot.slot_iso || slot;

        if (submitButton) {
          submitButton.style.display = 'flex';
          submitButton.style.opacity = '1';
          submitButton.style.pointerEvents = 'auto';
          submitButton.style.visibility = 'visible';
          if (submitButton.tagName === 'INPUT') {
            submitButton.value = 'Boka';
          } else {
            submitButton.textContent = 'Boka';
          }
        }

        const cltReadyEl = document.getElementById('clt_ready');
        if (cltReadyEl) cltReadyEl.value = 'true';
      };
    });
  },
  highlightDate: function(date) {
    // Highlight date logic
    console.log('Highlighting date:', date);
    // Scroll the highlighted date into view
    if (date && typeof date.scrollIntoView === 'function') {
      date.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  },
  initAvailableSlotFetch: function() {
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
        console.log('📦 Skickar grouped slots till renderCalendar:', grouped);
        if (typeof window.CalendarModule.renderCalendar === 'function') {
          const firstDateStr = Object.keys(grouped).sort()[0];
          const firstDate = new Date(firstDateStr);
          window.CalendarModule.renderCalendar(grouped, firstDate);
        }
      }
    })
    .catch(err => {
      console.error('❌ Fetch error in getavailableslots:', err.message || err);
      alert('Fel vid hämtning av tider. Kontrollera din internetanslutning eller att servern är tillgänglig.');
    });
  }
};

window.getISOWeek = function(date) {
  var target = new Date(date.valueOf());
  var dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  var firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
};

// Inserted CSS
const style = document.createElement('style');
style.innerHTML = `
.day.today,
.day.available,
.day.available.selected {
  display: flex;
  width: 100%;
  height: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  align-items: center;
  justify-content: center;
}

.day.today {
  border: 1px solid #B2B2B2;
}

.day.available {
  background-color: #B2B2B2;
  color: #F5F5F5;
  cursor: pointer;
}

.day.available:hover {
  background-color: #e9a56f;
  color: #F5F5F5;
}

.day.available.selected {
  background-color: #e9a56f;
  color: #F5F5F5;
  border: 1px solid #B2B2B2;
}
`;
document.head.appendChild(style);
// Expose initAvailableSlotFetch globally
window.initAvailableSlotFetch = window.CalendarModule.initAvailableSlotFetch;
</script>
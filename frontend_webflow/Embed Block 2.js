<script>
window.CalendarModule = {
  renderCalendar: function(groupedSlots, firstDate) {
    if (!(firstDate instanceof Date) || isNaN(firstDate.getTime())) {
      console.warn('❌ Ogiltigt startdatum i renderCalendar');
      return;
    }

    const wrapper = document.getElementById('calendar_wrapper');
    if (wrapper) {
      wrapper.style.display = 'flex';
      wrapper.style.opacity = '1';
      wrapper.style.visibility = 'visible';
    }
    const grid = document.getElementById('calendar_grid');
    const weekLabelEls = grid?.querySelectorAll('.weeklabel') || [];
    const weekNumberEls = grid?.querySelectorAll('.weeknumber') || [];
    const dayEls = grid?.querySelectorAll('.day') || [];

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

    // Setup ISO week labels
    const labels = ['', 'M', 'T', 'O', 'T', 'F', 'L', 'S'];
    weekLabelEls.forEach((el, idx) => el.textContent = labels[idx] || '');

    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const jsDay = firstDay.getDay();
    const startOffset = jsDay === 0 ? 6 : jsDay - 1;
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const totalDays = startOffset + lastDay.getDate();
    const numWeeks = Math.ceil(totalDays / 7);

    let dayIndex = 0;
    for (let week = 0; week < numWeeks; week++) {
      const monday = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + week * 7);
      const weekNumber = window.getISOWeek(monday);
      if (week < weekNumberEls.length) {
        weekNumberEls[week].textContent = 'v' + weekNumber;
      }

      for (let wd = 0; wd < 7; wd++) {
        const gridIndex = week * 7 + wd;
        if (dayIndex >= dayEls.length) break;
        const dayEl = dayEls[dayIndex];
        const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + gridIndex);
        const isoDate = cellDate.toISOString().split('T')[0];

        if (cellDate.getMonth() !== currentMonth.getMonth()) {
          dayEl.textContent = '';
          dayEl.removeAttribute('data-date');
          dayEl.classList.remove('today', 'available', 'selected');
        } else {
          dayEl.textContent = cellDate.getDate();
          dayEl.dataset.date = isoDate;

          const isToday = cellDate.toDateString() === new Date().toDateString();
          dayEl.classList.toggle('today', isToday);

          const isAvailable = groupedSlots[isoDate]?.length > 0;
          dayEl.classList.toggle('available', isAvailable);

          if (isAvailable) {
            const cloned = dayEl.cloneNode(true);
            dayEl.replaceWith(cloned);
            cloned.addEventListener('click', () => {
              window.CalendarModule.highlightDate(cloned);
              window.CalendarModule.renderTimes(groupedSlots[isoDate]);
            });

            if (!document.querySelector('.day.selected')) {
              cloned.classList.add('selected');
              cloned.scrollIntoView({ behavior: 'smooth', block: 'center' });
              window.CalendarModule.renderTimes(groupedSlots[isoDate]);
              window.initialSlotRendered = true;
              window.lastRenderedMonth = currentMonthKey;
            }

            if (!window.userHasManuallySelectedDate &&
                (!window.initialSlotRendered || window.lastRenderedMonth !== currentMonthKey)) {
              window.initialSlotRendered = true;
              window.lastRenderedMonth = currentMonthKey;
              window.CalendarModule.highlightDate(cloned);
              window.CalendarModule.renderTimes(groupedSlots[isoDate]);
            }
          }
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
      const label = item.querySelector('.time-label') || item.querySelector('span.w-form-label');
      const input = item.querySelector('input[type="radio"]');
      const slot = times[idx];

      if (!slot || !input || !label) {
        item.style.display = 'none';
        return;
      }

      const labelText = typeof slot === 'object' && slot.slot_local
        ? slot.slot_local.slice(11, 16)
        : typeof slot === 'string'
        ? slot.slice(11, 16)
        : '';

      label.textContent = labelText;
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
    // Implementation details...
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
  .calendar-wrapper {
    font-family: Arial, sans-serif;
  }
  .calendar-day {
    padding: 5px;
    cursor: pointer;
  }
  .calendar-day.highlighted {
    background-color: #007BFF;
    color: white;
  }
`;
document.head.appendChild(style);
// Expose initAvailableSlotFetch globally
window.initAvailableSlotFetch = window.CalendarModule.initAvailableSlotFetch;
</script>
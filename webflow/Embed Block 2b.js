<script>
  window.getISOWeek = function(date) {
    const tempDate = new Date(date.getTime());
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 3 - ((tempDate.getDay() + 6) % 7));
    const week1 = new Date(tempDate.getFullYear(), 0, 4);
    return 1 + Math.round(((tempDate.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  };

  window.CalendarModule = {
    // Hjälpfunktion: format YYYY-MM-DD
    formatDate: function(date) {
      return date.toLocaleDateString('sv-SE').replaceAll('.', '-');
    },

    highlightDate: function(selectedDayEl) {
      const calendarWrapper = document.getElementById('calendar_wrapper');
      const dayEls = calendarWrapper ? [document.getElementById('calendar_day')] : [];
      // Remove 'selected' from all Day elements by class
      const allDayEls = calendarWrapper ? calendarWrapper.querySelectorAll('.day') : [];
      allDayEls.forEach(el => {
        el.classList.remove('selected');
      });
      selectedDayEl.classList.add('selected');
      selectedDayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    renderTimes: function(times, currentMonth) {
      console.log('🔍 times i renderTimes:', times);
      if (!Array.isArray(times) || times.length === 0) {
        console.warn('⚠️ Inga tider att visa i renderTimes');
        return;
      }
      const wrapper = document.getElementById('calendar_time_wrapper');
      const selectedDateEl = document.getElementById('selected_date');
      const timeGrid = document.getElementById('time_grid');
      const submitButton = document.getElementById('submit-booking-button');

      submitButton.style.display = 'none';
      submitButton.style.opacity = '0';
      submitButton.style.pointerEvents = 'none';
      submitButton.style.visibility = 'hidden';

      if (!wrapper || !selectedDateEl || !timeGrid || !submitButton) {
        console.warn('⚠️ Nödvändiga element för tidvisning saknas');
        return;
      }

      // Visa wrapper
      wrapper.style.display = 'block';

      // Rensa föregående visning
      const selectedDayEl = document.querySelector('.day.selected');
      if (!selectedDayEl) return;

      const selectedDay = selectedDayEl.textContent.padStart(2, '0');
      const year = currentMonth.getFullYear();
      const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
      const date = new Date(`${year}-${month}-${selectedDay}`);
      const weekday = date.toLocaleDateString('sv-SE', { weekday: 'long' });
      const formatted = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${selectedDay} ${date.toLocaleDateString('sv-SE', { month: 'short' })}`;
      selectedDateEl.textContent = `${formatted}`;

      // Hämta alla .timeitems
      const timeItems = timeGrid.querySelectorAll('.timeitems');

      // Rensa alla
      timeItems.forEach(el => {
        let label = el.querySelector('.time-label');
        if (!label) label = el.querySelector('span.w-form-label');
        if (label) label.textContent = '';
        el.classList.remove('selected');
        el.style.display = 'none';
      });

      // Fyll tider
      times.forEach((slot, index) => {
        if (index >= timeItems.length) return;
        const el = timeItems[index];

        const uniqueId = `radio-${index}`;
        const radioInput = el.querySelector('input[type="radio"]');
        let label = el.querySelector('.time-label');
        if (!label) label = el.querySelector('span.w-form-label');

        const labelText = slot.slot_local ? slot.slot_local.slice(11, 16) : slot;

        if (label) {
          label.textContent = labelText;
          label.setAttribute('for', uniqueId);
        }

        if (radioInput) {
          radioInput.value = slot.slot_iso || slot;
          radioInput.id = uniqueId;
          radioInput.name = 'meeting_time';
          radioInput.dataset.slotIso = slot.slot_iso || slot;
        }

        el.dataset.slotIso = slot.slot_iso || slot;
        el.style.display = 'block';
        el.onclick = () => {
          timeItems.forEach(t => t.classList.remove('selected'));
          el.classList.add('selected');

          if (!window.formState) window.formState = {};
          window.formState.slot_iso = slot.slot_iso || slot;
          window.formState.meeting_time = labelText;

          const slotIsoEl = document.getElementById('clt_slot_iso');
          if (slotIsoEl) slotIsoEl.textContent = slot.slot_iso || slot;

          const bookingButton = document.getElementById('submit-booking-button');
          if (bookingButton) {
            bookingButton.style.display = 'flex';
            bookingButton.style.opacity = '1';
            bookingButton.style.pointerEvents = 'auto';
            bookingButton.style.visibility = 'visible';
            // Set button label to "Boka"
            if (bookingButton.tagName === 'INPUT') {
              bookingButton.value = 'Boka';
            } else {
              bookingButton.textContent = 'Boka';
            }
            console.log('✅ submit-booking-button VISAS via display:flex + opacity');
          }
        };
      });
    },

    renderCalendar: function(availableSlots, currentMonth) {
      // Add currentMonthKey at top of renderCalendar
      const currentMonthKey = currentMonth.getFullYear() + '-' + currentMonth.getMonth();
      const calendarWrapper = document.getElementById('calendar_wrapper');
      if (!calendarWrapper) return;


      // Preserve calendar_times before resetting innerHTML
      const calendarTimes = document.getElementById('calendar_times');
      const shouldRestoreTimes = !!calendarTimes;

      // Reset wrapper
      // calendarWrapper.innerHTML = '';

      // Hantera header manuellt i Webflow – endast återställ innehåll om wrapper finns
      const existingHeaderWrapper = document.getElementById('calendar_header');
      if (existingHeaderWrapper) {
        existingHeaderWrapper.innerHTML = '';
        // Add optional dynamic header content here if needed
      }

      // --- Inserted: month/year label and arrow handlers ---
      const monthEl = document.getElementById('calendar_month');
      if (monthEl) {
        monthEl.textContent = currentMonth.toLocaleString('sv-SE', { month: 'long', year: 'numeric' });
      }

      // Flytta pilhantering till renderCalendar för att alltid binda korrekt
      const leftArrow = document.getElementById('cal_arrow_left');
      const rightArrow = document.getElementById('cal_arrow_right');
      if (leftArrow && rightArrow) {
        leftArrow.onclick = () => {
          const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1);
          window.CalendarModule.renderCalendar(availableSlots, newMonth);
        };
        rightArrow.onclick = () => {
          const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1);
          window.CalendarModule.renderCalendar(availableSlots, newMonth);
        };
        // Gör pilarna till "pointer" vid hover
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
      // --- End inserted ---

      // Grid container
      const grid = document.getElementById('calendar_grid');
      if (!grid) {
        console.warn('❌ calendar_grid saknas i DOM');
        // Fortsätt ändå för felsökning i Webflow
      }
      console.log('🧱 Börjar rendera kalendern...');
      console.log('📆 Månad:', currentMonth.toISOString());
      console.log('📦 availableSlots:', availableSlots);

      console.log('✅ calendar_grid hittades i DOM:', grid);
      console.log('📦 calendar_grid innerHTML vid start:', grid.innerHTML.slice(0, 200));

      // Update existing .weeklabel elements instead of recreating header row
      const weekLabelEls = grid.querySelectorAll('.weeklabel');
      const weekNumberEls = grid.querySelectorAll('.weeknumber');
      const dayEls = grid.querySelectorAll('.day');
      console.log('🔢 Antal .weeklabel:', weekLabelEls.length);
      console.log('🔢 Antal .weeknumber:', weekNumberEls.length);
      console.log('🔢 Antal .day:', dayEls.length);

      const labels = ['', 'M', 'T', 'O', 'T', 'F', 'L', 'S'];
      weekLabelEls.forEach((el, index) => {
        el.textContent = labels[index] || '';
      });

      // Date range setup
      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      const jsDay = firstDay.getDay();
      const startOffset = jsDay === 0 ? 6 : jsDay - 1;
      const totalDays = startOffset + lastDay.getDate();
      // Always show dynamic number of weeks based on days
      const numWeeks = Math.ceil((startOffset + lastDay.getDate()) / 7);

      if (!weekNumberEls.length) console.warn('⚠️ Inga .weeknumber-element hittades i DOM');
      if (!dayEls.length) console.warn('⚠️ Inga .day-element hittades i DOM');

      const maxDayElements = dayEls.length;

      let dayIndex = 0;
      for (let week = 0; week < numWeeks; week++) {
        const monday = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + week * 7);
        const weekNumber = window.getISOWeek(monday);
        if (week < weekNumberEls.length) {
          weekNumberEls[week].textContent = 'v' + weekNumber;
        }

        for (let wd = 0; wd < 7; wd++) {
          const gridIndex = week * 7 + wd;
          if (dayIndex >= maxDayElements) {
            console.warn(`⚠️ Dagindex ${dayIndex} överskrider antal .day-element (${maxDayElements})`);
            break;
          }
          const dayEl = dayEls[dayIndex];
          if (!dayEl) {
            console.warn(`⚠️ Saknar .day-element vid index ${dayIndex}`);
            continue;
          }
          const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + gridIndex);
          if (cellDate.getMonth() !== currentMonth.getMonth()) {
            dayEl.textContent = '';
            dayEl.removeAttribute('data-date');
            dayEl.classList.remove('today', 'available', 'selected');
            dayIndex++;
            continue;
          } else {
            const isoDate = window.CalendarModule.formatDate(cellDate);
            dayEl.textContent = cellDate.getDate();
            dayEl.dataset.date = isoDate;

            const isToday = cellDate.toDateString() === new Date().toDateString();
            dayEl.classList.toggle('today', isToday);

            const isAvailable = availableSlots[isoDate]?.length > 0;
            dayEl.classList.toggle('available', isAvailable);

            if (isAvailable) {
              dayEl.addEventListener('click', () => {
                window.CalendarModule.highlightDate(dayEl);
                window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
                window.userHasManuallySelectedDate = true;
              });

              if (
                !window.userHasManuallySelectedDate &&
                (!window.initialSlotRendered || window.lastRenderedMonth !== currentMonthKey)
              ) {
                window.initialSlotRendered = true;
                window.lastRenderedMonth = currentMonthKey;
                window.CalendarModule.highlightDate(dayEl);
                window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
              }
            }
            dayIndex++;
          }
        }
      }

      for (let i = numWeeks; i < weekNumberEls.length; i++) {
        weekNumberEls[i].textContent = '';
      }

      // Töm alla .day efter sista dayIndex
      for (let i = dayIndex; i < dayEls.length; i++) {
        const el = dayEls[i];
        el.textContent = '';
        el.removeAttribute('data-date');
        el.classList.remove('today', 'available', 'selected');
      }

      // Ta inte bort eller ersätt calendar_grid – hanteras nu i Webflow

      if (shouldRestoreTimes && !calendarWrapper.contains(calendarTimes)) {
        calendarWrapper.appendChild(calendarTimes);
      }

      // calendarWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

      console.log('✅ Kalendern färdigrenderad');
    }
  };

  window.setAvailableSlots = function(groupedSlots) {
    if (!window.CalendarModule || typeof window.CalendarModule.renderCalendar !== 'function') {
      return;
    }
    if (Object.keys(groupedSlots).length === 0) {
      return;
    }
    window.initialSlotRendered = false;
    window.latestAvailableSlots = groupedSlots;
    const firstAvailableDateStr = Object.keys(groupedSlots).sort()[0];
    const firstAvailableDate = new Date(firstAvailableDateStr);
    window.firstAvailableDate = firstAvailableDate;
    const monthLabel = document.getElementById('calendar_month');
    if (monthLabel) {
      monthLabel.textContent = firstAvailableDate.toLocaleString('sv-SE', { month: 'long', year: 'numeric' });
    }
    window.CalendarModule.renderCalendar(groupedSlots, firstAvailableDate);
    const wrapper = document.getElementById('calendar_wrapper');
    if (wrapper) {
      wrapper.style.display = 'flex';
    }
  };

  // Vänta på att #calendar_wrapper laddas in i DOM
  let waitForCalendarWrapper2b = setInterval(() => {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (calendarWrapper) {
      clearInterval(waitForCalendarWrapper2b);
      // Removed calendarWrapper.style.display = 'flex';
      // Insert the waitForCalendarGrid block here
      let waitForCalendarGrid = setInterval(() => {
        const grid = document.getElementById('calendar_grid');
        if (grid) {
          clearInterval(waitForCalendarGrid);
          console.log('✅ calendar_grid hittades av waitForCalendarGrid');
          if (window.latestAvailableSlots && window.firstAvailableDate) {
            console.log('🧠 Trigger renderCalendar från waitForCalendarGrid');
            window.CalendarModule.renderCalendar(window.latestAvailableSlots, window.firstAvailableDate);
          }
        } else {
          console.log('⏳ Väntar på calendar_grid...');
        }
      }, 100);
    }
  }, 100);
// --- Inserted CSS for today and available day styling ---
const calendarStyle = document.createElement('style');
calendarStyle.textContent = `
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
document.head.appendChild(calendarStyle);
</script>
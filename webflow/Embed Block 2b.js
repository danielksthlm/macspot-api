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
      const calendarTimes = document.getElementById('calendar_times');
      if (!calendarTimes) {
        console.warn('⚠️ calendar_times saknas – renderTimes avbryts');
        return;
      }
      calendarTimes.style.display = 'block';
      calendarTimes.scrollIntoView({ behavior: 'smooth', block: 'start' });
      calendarTimes.innerHTML = '';
      const selectedDateEl = document.querySelector('.calendar-day.selected');
      if (selectedDateEl) {
        const selectedDay = selectedDateEl.textContent.padStart(2, '0');
        const year = currentMonth.getFullYear();
        const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
        const date = new Date(`${year}-${month}-${selectedDay}`);
        const weekday = date.toLocaleDateString('sv-SE', { weekday: 'long' });
        const formatted = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${selectedDay} ${date.toLocaleDateString('sv-SE', { month: 'short' })}`;
        const label = document.createElement('div');
        label.textContent = `📅 ${formatted}`;
        calendarTimes.appendChild(label);
      }
      times.forEach(time => {
        const timeEl = document.createElement('button');
        timeEl.type = 'button';
        timeEl.className = 'time-slot';
        timeEl.textContent = time;
        timeEl.addEventListener('click', () => {
          const allTimes = calendarTimes.querySelectorAll('.time-slot');
          allTimes.forEach(t => t.classList.remove('selected'));
          timeEl.classList.add('selected');
          if (!window.formState) window.formState = {};
          const selectedDateEl = document.querySelector('.calendar-day.selected');
          if (selectedDateEl) {
            const selectedDay = selectedDateEl.textContent.padStart(2, '0');
            const year = currentMonth.getFullYear();
            const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
            const dateIso = `${year}-${month}-${selectedDay}`;
            const isoTime = `${dateIso}T${time}:00.000Z`;
            window.formState.slot_iso = isoTime;
            const slotIsoEl = document.getElementById('clt_slot_iso');
            if (slotIsoEl) slotIsoEl.textContent = isoTime;
            const submitButton = document.getElementById('contact-update-button');
            if (submitButton) {
              submitButton.style.display = 'block';
              submitButton.textContent = 'Boka möte';
            }
          }
          window.formState.meeting_time = time;
        });
        calendarTimes.appendChild(timeEl);
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
        return;
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
      const numWeeks = Math.ceil(totalDays / 7);
      // Ensure we don't overrender grid rows (e.g. skip 7th row if not needed)
      const maxDays = numWeeks * 7;

      if (!weekNumberEls.length) console.warn('⚠️ Inga .weeknumber-element hittades i DOM');
      if (!dayEls.length) console.warn('⚠️ Inga .day-element hittades i DOM');
      let dayIndex = 0;
      for (let week = 0; week < numWeeks; week++) {

        const gridIndex = week * 7;
        const monday = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + week * 7);
        const weekNumber = window.getISOWeek(monday);
        if (week < weekNumberEls.length) {
          weekNumberEls[week].textContent = 'v' + weekNumber;
        }

        for (let wd = 0; wd < 7; wd++) {
          const gridIndex = week * 7 + wd;
          const dayEl = dayEls[dayIndex];
          if (!dayEl) {
            console.warn(`⚠️ Saknar .day-element vid index ${dayIndex}`);
            continue;
          }
          if (gridIndex < startOffset || gridIndex >= totalDays || gridIndex >= maxDays) {
            dayEl.textContent = '';
            dayEl.removeAttribute('data-date');
            dayIndex++;
            continue;
          }

          const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + gridIndex);
          const date = cellDate;
          const isoDate = window.CalendarModule.formatDate(date);
          dayEl.textContent = date.getDate();
          console.log(`📅 Fyller dag: ${isoDate} → ${date.getDate()} (index ${dayIndex})`);
          dayEl.dataset.date = isoDate;
          console.log(`✅ Dag satt: ${isoDate} → ${date.getDate()}`);

          const todayMidnight = new Date();
          todayMidnight.setHours(0, 0, 0, 0);
          const isPast = date < todayMidnight;

          // --- Inserted: highlight today, available, and bind click ---
          const isToday = date.toDateString() === new Date().toDateString();
          if (isToday) {
            dayEl.classList.add('today');
          }

          const isAvailable = !isPast && availableSlots[isoDate] && availableSlots[isoDate].length > 0;
          if (isAvailable) {
            dayEl.classList.add('available');
            (function bindClick(cell, date, isoDate) {
              cell.addEventListener('click', () => {
                window.CalendarModule.highlightDate(cell);
                window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
              });
            })(dayEl, date, isoDate);
            // Immediately select and render the first available slot (no setTimeout)
            if (!window.initialSlotRendered || window.lastRenderedMonth !== currentMonthKey) {
              window.initialSlotRendered = true;
              window.lastRenderedMonth = currentMonthKey;
              window.CalendarModule.highlightDate(dayEl);
              window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
              dayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
          dayIndex++;
        }
      }

      // Ta inte bort eller ersätt calendar_grid – hanteras nu i Webflow

      if (shouldRestoreTimes && !calendarWrapper.contains(calendarTimes)) {
        calendarWrapper.appendChild(calendarTimes);
      }

      calendarWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
  };

  // Vänta på att #calendar_wrapper laddas in i DOM
  let waitForCalendarWrapper2b = setInterval(() => {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (calendarWrapper) {
      clearInterval(waitForCalendarWrapper2b);
      // Removed: calendarWrapper.style.display = 'flex';
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
.day.today {
  display: flex;
  border: 1px solid #B2B2B2;
  border-radius: 50%;
  aspect-ratio: 1 / 1;
  align-items: center;
  justify-content: center;
}

.day.available {
  display: flex;
  background-color: #B2B2B2;
  color: #F5F5F5;
  border-radius: 50%;
  aspect-ratio: 1 / 1;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.day.available:hover {
  background-color: #e9a56f;
  color: #F5F5F5;
}

.day.available.selected {
  display: flex;
  background-color: #e9a56f;
  color: #F5F5F5;
  border: 1px solid #B2B2B2;
}
`;
document.head.appendChild(calendarStyle);
</script>
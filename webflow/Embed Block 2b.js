<script>
// 2b: Kalender/tider/slots render-funktioner, och setAvailableSlots

window.CalendarModule = {
  // Hjälpfunktion: format YYYY-MM-DD
  formatDate: function(date) {
    return date.toISOString().split('T')[0];
  },

  highlightDate: function(selectedDayEl) {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    const dayEls = calendarWrapper.querySelectorAll('.calendar-day');
    dayEls.forEach(el => {
      el.classList.remove('selected');
    });
    selectedDayEl.classList.add('selected');
    selectedDayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Guard clause: Check timesWrapper existence before showing
    const timesWrapper = document.getElementById('times_wrapper');
    if (!timesWrapper) {
      console.warn('⚠️ timesWrapper is null – highlightDate avbryts');
      return;
    }
    timesWrapper.style.display = 'block';
  },

  renderTimes: function(times, currentMonth) {
    const timesWrapper = document.getElementById('times_wrapper');
    if (!timesWrapper) {
      console.warn('⚠️ timesWrapper is null – renderTimes avbryts');
      return;
    }
    timesWrapper.style.display = 'block';
    timesWrapper.innerHTML = '';
    // Visa veckodag och datum före tiderna.
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
      label.style.fontSize = '0.8rem';
      label.style.fontWeight = 'bold';
      label.style.color = '#333';
      label.style.marginBottom = '0.25rem';
      timesWrapper.appendChild(label);
    }
    times.forEach(time => {
      const timeEl = document.createElement('button');
      timeEl.type = 'button';
      timeEl.className = 'time-slot';
      timeEl.textContent = time;
      timeEl.addEventListener('click', () => {
        // Markera vald tid och spara i formState.
        const allTimes = timesWrapper.querySelectorAll('.time-slot');
        allTimes.forEach(t => t.classList.remove('selected'));
        timeEl.classList.add('selected');
        // --- BEGIN: formState uppdateras med slot_iso och meeting_time ---
        if (!window.formState) window.formState = {};
        const selectedDateEl = document.querySelector('.calendar-day.selected');
        if (selectedDateEl) {
          const selectedDay = selectedDateEl.textContent.padStart(2, '0');
          const year = currentMonth.getFullYear();
          const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
          const dateIso = `${year}-${month}-${selectedDay}`;
          const isoTime = `${dateIso}T${time}:00.000Z`;
          window.formState.slot_iso = isoTime;
          // Visa bokningsknapp när tid är vald.
          const submitButton = document.getElementById('contact-update-button');
          if (submitButton) {
            submitButton.style.display = 'block';
            submitButton.textContent = 'Boka möte';
          }
        }
        window.formState.meeting_time = time;
      });
      timesWrapper.appendChild(timeEl);
    });
  },

  renderCalendar: function(availableSlots, currentMonth) {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (!calendarWrapper) {
      console.warn('⚠️ calendarWrapper is null – renderCalendar avbryts');
      return;
    }
    calendarWrapper.innerHTML = '';

    const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
    const monthTitle = document.createElement('div');
    monthTitle.className = 'calendar-month';
    monthTitle.textContent = monthName;

    // Navigeringspilar för månad bakåt/frammåt.
    const navWrapper = document.createElement('div');
    navWrapper.style.display = 'flex';
    navWrapper.style.justifyContent = 'space-between';
    navWrapper.style.alignItems = 'center';
    navWrapper.style.marginBottom = '0.5rem';

    const prevButton = document.createElement('button');
    prevButton.textContent = '<';
    prevButton.onclick = () => {
      currentMonth.setMonth(currentMonth.getMonth() - 1);
      window.CalendarModule.renderCalendar(availableSlots, currentMonth);
    };

    const nextButton = document.createElement('button');
    nextButton.textContent = '>';
    nextButton.onclick = () => {
      currentMonth.setMonth(currentMonth.getMonth() + 1);
      window.CalendarModule.renderCalendar(availableSlots, currentMonth);
    };

    // Döljer vänsterpil om vi är i nuvarande månad.
    const today = new Date();
    const isCurrentMonth = currentMonth.getFullYear() === today.getFullYear() &&
                           currentMonth.getMonth() === today.getMonth();
    if (isCurrentMonth) {
      prevButton.disabled = true;
      prevButton.style.visibility = 'hidden';
    }

    navWrapper.appendChild(prevButton);
    navWrapper.appendChild(monthTitle);
    navWrapper.appendChild(nextButton);
    calendarWrapper.appendChild(navWrapper);

    const weekdays = ['Mån', 'Tis', 'Ons', 'Tors', 'Fre', 'Lör', 'Sön'];
    const weekdayHeader = document.createElement('div');
    weekdayHeader.className = 'calendar-weekdays';
    const weekNumHeader = document.createElement('div');
    weekNumHeader.className = 'week-number';
    weekNumHeader.textContent = 'V';
    weekdayHeader.appendChild(weekNumHeader);
    weekdays.forEach(d => {
      const wd = document.createElement('div');
      wd.textContent = d;
      weekdayHeader.appendChild(wd);
    });
    calendarWrapper.appendChild(weekdayHeader);

    const grid = document.createElement('div');
    grid.className = 'calendar-grid';

    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const jsDay = firstDay.getDay();
    const startOffset = jsDay === 0 ? 6 : jsDay - 1;
    const totalDays = startOffset + lastDay.getDate();
    const numWeeks = Math.ceil(totalDays / 7);
    let day = 1;
    for (let week = 0; week < numWeeks; week++) {
      let mondayDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + week * 7);
      const weekNumber = window.getISOWeek(mondayDate);
      const weekNumberEl = document.createElement('div');
      weekNumberEl.className = 'week-number';
      weekNumberEl.textContent = weekNumber;
      grid.appendChild(weekNumberEl);
      for (let wd = 0; wd < 7; wd++) {
        const gridIndex = week * 7 + wd;
        if (gridIndex < startOffset || day > lastDay.getDate()) {
          const placeholder = document.createElement('div');
          grid.appendChild(placeholder);
        } else {
          const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
          const isoDate = window.CalendarModule.formatDate(date);
          const dayEl = document.createElement('div');
          dayEl.className = 'calendar-day';
          dayEl.textContent = day;
          dayEl.dataset.date = isoDate;
          const todayMidnight = new Date();
          todayMidnight.setHours(0, 0, 0, 0);
          const isPast = date < todayMidnight;
          if (isPast) {
            dayEl.classList.add('unavailable');
          } else if (availableSlots[isoDate] && availableSlots[isoDate].length > 0) {
            dayEl.classList.add('available');
            dayEl.addEventListener('click', () => {
              window.CalendarModule.highlightDate(dayEl);
              window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
            });
            if (!window.initialSlotRendered) {
              window.CalendarModule.highlightDate(dayEl);
              window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
              window.initialSlotRendered = true;
            }
          } else {
            dayEl.classList.add('unavailable');
          }
          grid.appendChild(dayEl);
          day++;
        }
      }
    }
    const oldGrid = calendarWrapper.querySelector('.calendar-grid');
    if (oldGrid) oldGrid.remove();
    calendarWrapper.appendChild(grid);
  }
};

// Hjälpfunktion för ISO-veckonummer
window.getISOWeek = function(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  let dayNum = d.getUTCDay();
  if (dayNum === 0) dayNum = 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return weekNo;
};

window.setAvailableSlots = function(groupedSlots) {
  // Hantera initialSlotRendered (återställs varje gång nya slots sätts)
  window.initialSlotRendered = false;
  window.latestAvailableSlots = groupedSlots;
  // Hitta första datum med lediga tider
  const firstAvailableDateStr = Object.keys(groupedSlots).sort()[0];
  const firstAvailableDate = new Date(firstAvailableDateStr);
  window.firstAvailableDate = firstAvailableDate;
  window.CalendarModule.renderCalendar(groupedSlots, window.firstAvailableDate);
};
</script>
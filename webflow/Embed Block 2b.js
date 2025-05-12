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
    return date.toISOString().split('T')[0];
  },

  highlightDate: function(selectedDayEl) {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    const dayEls = calendarWrapper?.querySelectorAll('.calendar-day') || [];
    dayEls.forEach(el => {
      el.classList.remove('selected');
    });
    selectedDayEl.classList.add('selected');
    selectedDayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  },

  renderTimes: function(times, currentMonth) {
    const calendarTimes = document.getElementById('calendar_times');
    calendarTimes.style.setProperty('display', 'block', 'important');
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
      label.style.fontSize = '0.8rem';
      label.style.fontWeight = 'bold';
      label.style.color = '#333';
      label.style.marginBottom = '0.25rem';
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
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (!calendarWrapper) {
      return;
    }
    const calendarTimes = document.getElementById('calendar_times');
    const keepCalendarTimes = calendarTimes?.parentElement?.removeChild(calendarTimes);
    calendarWrapper.innerHTML = '';
    if (keepCalendarTimes) calendarWrapper.appendChild(keepCalendarTimes);
    calendarWrapper.style.setProperty('display', 'flex', 'important');
    calendarWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });

    const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
    const monthTitle = document.createElement('div');
    monthTitle.className = 'calendar-month';
    monthTitle.textContent = monthName;

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
              setTimeout(() => {
                document.getElementById('calendar_wrapper')?.style.setProperty('display', 'flex', 'important');
                window.CalendarModule.highlightDate(dayEl);
                window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
                window.initialSlotRendered = true;
              }, 100);
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
  window.CalendarModule.renderCalendar(groupedSlots, firstAvailableDate);
  document.getElementById('calendar_wrapper')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

// Vänta på att #calendar_wrapper laddas in i DOM
let waitForCalendarWrapper2b = setInterval(() => {
  const calendarWrapper = document.getElementById('calendar_wrapper');
  if (calendarWrapper) {
    clearInterval(waitForCalendarWrapper2b);
    calendarWrapper.style.setProperty('display', 'flex', 'important');
    calendarWrapper.style.visibility = 'visible';
    calendarWrapper.style.opacity = '1';
    calendarWrapper.style.maxHeight = 'none';
    calendarWrapper.style.position = 'static';
    calendarWrapper.style.top = 'auto';
    calendarWrapper.style.transition = 'none';
  }
}, 100);

</script>
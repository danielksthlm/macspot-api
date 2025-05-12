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
      // Remove 'selected' from all calendar_day elements by id
      const allDayEls = calendarWrapper ? calendarWrapper.querySelectorAll('[id^="calendar_day"]') : [];
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
      const calendarWrapper = document.getElementById('calendar_wrapper');
      if (!calendarWrapper) return;

      // Preserve calendar_times before resetting innerHTML
      const calendarTimes = document.getElementById('calendar_times');
      const shouldRestoreTimes = !!calendarTimes;

      // Reset wrapper
      calendarWrapper.innerHTML = '';

      const outerWrapper = document.createElement('div');

      // Header: månad och år med vänster/höger knappar
      const header = document.createElement('div');
      header.style.display = 'flex';
      header.style.justifyContent = 'center';
      header.style.alignItems = 'center';
      header.style.gridColumn = '1 / -1';

      const leftBtn = document.createElement('button');
      leftBtn.innerHTML = '&#10094;'; // ❮
      leftBtn.className = 'arrow';
      leftBtn.onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        window.CalendarModule.renderCalendar(availableSlots, currentMonth);
      };

      const rightBtn = document.createElement('button');
      rightBtn.innerHTML = '&#10095;'; // ❯
      rightBtn.className = 'arrow';
      rightBtn.onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        window.CalendarModule.renderCalendar(availableSlots, currentMonth);
      };

      const title = document.createElement('div');
      title.className = 'h3';
      title.textContent = currentMonth.toLocaleString('sv-SE', { month: 'long', year: 'numeric' });
      title.style.flex = '1';
      title.style.textAlign = 'center';

      header.appendChild(leftBtn);
      header.appendChild(title);
      header.appendChild(rightBtn);
      outerWrapper.appendChild(header);

      // Grid container
      const grid = document.createElement('div');
      grid.id = 'calendar_grid';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(8, minmax(2em, 1fr))';

      // Weekday header row
      const weekNameRow = document.createElement('div');
      weekNameRow.id = 'week_name';
      weekNameRow.style.gridColumn = '1 / -1';
      weekNameRow.style.display = 'grid';
      weekNameRow.style.gridTemplateColumns = 'repeat(8, minmax(2em, 1fr))';

      ['', 'M', 'T', 'O', 'T', 'F', 'L', 'S'].forEach(label => {
        const col = document.createElement('div');
        col.className = 'WeekLabel';
        col.textContent = label;
      // Removed col.style.textAlign = 'center';
        weekNameRow.appendChild(col);
      });
      grid.appendChild(weekNameRow);

      // Date range setup
      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      const jsDay = firstDay.getDay();
      const startOffset = jsDay === 0 ? 6 : jsDay - 1;
      const totalDays = startOffset + lastDay.getDate();
      const numWeeks = Math.ceil(totalDays / 7);

      let day = 1;

      for (let week = 0; week < numWeeks; week++) {
        for (let wd = 0; wd < 8; wd++) {
          let cell;
          if (wd === 0) {
            // Week number
            cell = document.createElement('div');
            cell.className = 'WeekNumber';
            const monday = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + week * 7);
            const weekNumber = window.getISOWeek(monday);
            cell.textContent = 'v' + weekNumber;
          // Removed cell.style.textAlign = 'center';
            // Removed cell.style.cursor = 'pointer';
            } else {
              cell = document.createElement('p');
              const gridIndex = week * 7 + (wd - 1);
              if (gridIndex < startOffset || day > lastDay.getDate()) {
                cell.textContent = '';
              } else {
                // Use corrected date calculation to match visual cell
                const cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + gridIndex);
                // 🧠 cellDate = verkligt datum för den här cellen (t.ex. 2025-05-12)
                const date = cellDate;
                const isoDate = window.CalendarModule.formatDate(date);
                cell.id = 'calendar_day';
                // 🧩 isoDate används som nyckel i availableSlots och för att koppla till backend-data
                cell.textContent = date.getDate();
                cell.className = 'Day';
              // Removed cell.style.textAlign = 'center';
                // 📅 Det här är det datum användaren ser i kalendern (t.ex. "12")
                cell.dataset.date = isoDate;
                // 🧷 Kopplar det visuella datumet till backend-datan via dataset

                const todayMidnight = new Date();
                todayMidnight.setHours(0, 0, 0, 0);
                const isPast = date < todayMidnight;

                if (isPast) {
                  // no class added here per instructions
                } else if (availableSlots[isoDate] && availableSlots[isoDate].length > 0) {
                  // no class added here per instructions
                  // ✅ Om datumet har tillgängliga tider, gör det klickbart
                  (function bindClick(cell, date, isoDate) {
                    cell.addEventListener('click', () => {
                      window.CalendarModule.highlightDate(cell);
                      window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
                    });
                  })(cell, date, isoDate);
                  if (!window.initialSlotRendered) {
                    setTimeout(() => {
                      document.getElementById('calendar_wrapper')?.style.setProperty('display', 'flex', 'important');
                      window.CalendarModule.highlightDate(cell);
                      window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
                      window.initialSlotRendered = true;
                    }, 100);
                  }
                } else {
                  // no class added here per instructions
                }
              }
            }
          grid.appendChild(cell);
        }
      }

      // Replace old grid if it exists
      const oldGrid = document.getElementById('calendar_grid');
      if (oldGrid) oldGrid.remove();
      outerWrapper.appendChild(grid);

      calendarWrapper.appendChild(outerWrapper);

      if (shouldRestoreTimes && !calendarWrapper.contains(calendarTimes)) {
        calendarWrapper.appendChild(calendarTimes);
      }

      calendarWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
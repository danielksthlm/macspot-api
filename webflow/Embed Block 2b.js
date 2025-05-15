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
      console.log('🔁 renderTimes anropades med:', times);
      console.log('🔍 times i renderTimes:', times);
      console.log('🧠 Kontrollera clt_ready vid slot-rendering:', document.getElementById('clt_ready')?.value);
      if (!Array.isArray(times) || times.length === 0) {
        console.warn('⚠️ Inga tider att visa i renderTimes');
        return;
      }
      // Kontrollera att currentMonth är ett giltigt Date-objekt
      if (!(currentMonth instanceof Date) || isNaN(currentMonth.getTime())) {
        console.warn('❌ currentMonth är inte ett giltigt Date-objekt i renderTimes:', currentMonth);
        return;
      }
      // Sort times array before rendering
      times = times.sort((a, b) => {
        // If slot_local exists, compare those, otherwise compare as strings
        const aStr = a.slot_local || (typeof a === 'string' ? a : '');
        const bStr = b.slot_local || (typeof b === 'string' ? b : '');
        return aStr.localeCompare(bStr);
      });

      const wrapper = document.getElementById('calendar_time_wrapper');
      const selectedDateEl = document.getElementById('selected_date');
      const timeGrid = document.getElementById('time_grid');
      const submitButton = document.getElementById('submit-booking-button');

      if (!wrapper || !selectedDateEl || !timeGrid || !submitButton) {
        console.warn('⚠️ Något DOM-element saknas i renderTimes:', {
          wrapper, selectedDateEl, timeGrid, submitButton
        });
        return;
      }

      // Extra skydd: om submitButton är null, returnera tidigt (redan täckt ovan)
      // Sätt submitButton till hidden
      submitButton.style.display = 'none';
      submitButton.style.opacity = '0';
      submitButton.style.pointerEvents = 'none';
      submitButton.style.visibility = 'hidden';

      // Visa wrapper
      wrapper.style.display = 'block';

      // Rensa föregående visning
      const selectedDayEl = document.querySelector('.day.selected');
      if (!selectedDayEl) {
        console.warn('⚠️ Ingen .day.selected hittades – fortsätter ändå utan highlight');
      } else {
        selectedDayEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

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

        const labelText = typeof slot === 'object' && slot.slot_local
          ? slot.slot_local.slice(11, 16)
          : typeof slot === 'string'
          ? slot.slice(11, 16)
          : '';

        console.log('⏰ Skapar labelText:', { slot, labelText });
        if (!labelText || labelText === 'Radio') {
          console.warn('⚠️ labelText saknas eller är "Radio":', labelText);
        }

        if (label) {
          // Ensure the label has the 'time-label' class
          if (!label.classList.contains('time-label')) {
            label.classList.add('time-label');
          }
          label.textContent = labelText;
          label.setAttribute('for', uniqueId);
          label.classList.add('time-label');
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

          console.log('🧠 [Kod 2b] Slot valdes:', slot);
          console.log('🧠 [Kod 2b] clt_ready just nu:', document.getElementById('clt_ready')?.value);

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
          // --- Set clt_ready and clt_meetingtime hidden fields ---
          const cltReadyEl = document.getElementById('clt_ready');
          const cltMeetingTimeEl = document.getElementById('clt_meetingtime');
          if (cltMeetingTimeEl) cltMeetingTimeEl.value = slot.slot_iso || slot; // Always set to ISO!
          if (cltReadyEl) cltReadyEl.value = 'true'; // Always run last

          // --- [Kod 2b] Logga data som skickas till submitBooking ---
          console.log('[Kod 2b] Skickar data till submitBooking:');
          console.log('clt_email:', document.getElementById('clt_email')?.value);
          console.log('clt_meetingtype:', document.getElementById('clt_meetingtype')?.value);
          console.log('clt_meetinglength:', document.getElementById('clt_meetinglength')?.value);
          console.log('clt_meetingtime:', document.getElementById('clt_meetingtime')?.value);
          console.log('clt_contact_id:', document.getElementById('clt_contact_id')?.value);
          console.log('clt_ready:', document.getElementById('clt_ready')?.value);
        };
      });

      // Visa bokningsknappen när en slot väljs via radio
      // (Eventlistener för radio borttagen då den är redundant och felaktig)
    },

    renderCalendar: function(availableSlots, currentMonth) {
      // Kontrollera att currentMonth är ett giltigt Date-objekt innan användning
      if (!(currentMonth instanceof Date) || isNaN(currentMonth.getTime())) {
        console.warn('❌ currentMonth är inte ett giltigt Date-objekt i renderCalendar:', currentMonth);
        return;
      }
      const currentMonthKey = currentMonth.getFullYear() + '-' + currentMonth.getMonth();
      const calendarWrapper = document.getElementById('calendar_wrapper');
      if (!calendarWrapper) return;
      // Om availableSlots saknar någon nyckel som matchar currentMonth, logga en varning
      const monthStr = String(currentMonth.getMonth() + 1).padStart(2, '0');
      const yearStr = String(currentMonth.getFullYear());
      const hasAnySlotInMonth = Object.keys(availableSlots || {}).some(key => {
        // key format: YYYY-MM-DD
        return key.startsWith(`${yearStr}-${monthStr}`);
      });
      if (!hasAnySlotInMonth) {
        console.warn(`⚠️ availableSlots saknar någon nyckel för månaden ${yearStr}-${monthStr} – kalendern kan bli tom`);
      }


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
            // Kontrollera om availableSlots finns
            if (!availableSlots) {
              console.warn('⚠️ availableSlots saknas helt – renderCalendar körs utan data');
              return;
            }
            dayEl.textContent = cellDate.getDate();
            dayEl.dataset.date = isoDate;

            const isToday = cellDate.toDateString() === new Date().toDateString();
            dayEl.classList.toggle('today', isToday);

            const isAvailable = availableSlots[isoDate]?.length > 0;
            dayEl.classList.toggle('available', isAvailable);
            if (isAvailable) {
              console.log('🧠 Tillgängligt datum hittat:', isoDate);
            }
            // Logga om det inte finns entry för isoDate
            if (!availableSlots[isoDate]) {
              console.log(`ℹ️ Inget entry i availableSlots för datum ${isoDate}`);
            }

            if (isAvailable) {
              const cloned = dayEl.cloneNode(true);
              dayEl.replaceWith(cloned);

              cloned.addEventListener('click', () => {
                window.CalendarModule.highlightDate(cloned);
                window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
                window.userHasManuallySelectedDate = true;
              });

              // Förvälj första tillgängliga dag om ingen är vald
              if (!document.querySelector('.day.selected')) {
                cloned.classList.add('selected');
                cloned.scrollIntoView({ behavior: 'smooth', block: 'center' });
                window.CalendarModule.renderTimes(availableSlots[isoDate], currentMonth);
                window.initialSlotRendered = true;
                window.lastRenderedMonth = currentMonthKey;
                console.log('🧪 Förvald första tillgängliga dag:', isoDate);
              }

              if (
                !window.userHasManuallySelectedDate &&
                (!window.initialSlotRendered || window.lastRenderedMonth !== currentMonthKey)
              ) {
                console.log('🧪 Auto-trigger renderTimes för datum:', isoDate, 'med slots:', availableSlots[isoDate]);
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
  console.log('🧠 [Kod 2b] setAvailableSlots anropad med:', groupedSlots);
  console.log('🧠 [Kod 2b] window.formState:', window.formState);
  if (!window.CalendarModule || typeof window.CalendarModule.renderCalendar !== 'function') {
    console.warn('❌ window.CalendarModule.renderCalendar() saknas eller inte en funktion');
    return;
  }
  if (Object.keys(groupedSlots).length === 0) {
    console.warn('❌ groupedSlots är tomt – inga tider att visa');
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

  const wrapper = document.getElementById('calendar_wrapper');
  if (wrapper) wrapper.style.display = 'flex';

  const grid = document.getElementById('calendar_grid');
  if (grid) {
    console.log('✅ calendar_grid redan i DOM – renderCalendar körs direkt');
    window.CalendarModule.renderCalendar(groupedSlots, firstAvailableDate);
  } else {
    console.log('⏳ Väntar på calendar_grid...');
    const waitForCalendarGrid = setInterval(() => {
      const g = document.getElementById('calendar_grid');
      if (g) {
        clearInterval(waitForCalendarGrid);
        console.log('✅ calendar_grid hittades av waitForCalendarGrid');
        window.CalendarModule.renderCalendar(groupedSlots, firstAvailableDate);
      }
    }, 100);
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
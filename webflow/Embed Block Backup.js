<script>
  // === ID-Matris: Fält och deras start-synlighet (från Webflow/CSS) ===
  // ID               | Start-synlighet
  // -----------------|----------------
  // booking_email    | visible
  // meeting_type_group | visible (visas efter e-post)
  // meeting_type_select | visible
  // company          | display: none
  // first_name       | display: none
  // last_name        | display: none
  // phone            | display: none
  // address          | display: none
  // postal_code      | display: none
  // city             | display: none
  // country          | display: none
  // missing_fields_messages | visible
  // contact_validation_loading | hidden (visas vid API-anrop)
  // contact-update-button | hidden (visas vid ifyllda fält)
  // Meeting type lengths will be loaded from backend and kept in this scope
  let lengths = {};

  async function loadMeetingTypes() {
    try {
      const res = await fetch('https://macspotbackend.azurewebsites.net/api/meeting_types');
      if (!res.ok) throw new Error('Failed to fetch meeting types');
      // Backend returns { types, lengths }
      const { types, lengths: loadedLengths } = await res.json();
      lengths = loadedLengths || {};

      const container = document.getElementById('meeting_type_select');
      if (!container) return;

      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      (Array.isArray(types) ? types : JSON.parse(types)).forEach(type => {
        const value = type.toLowerCase();
        const labelText = type;
        const displayNames = {
          zoom: 'Digitalt via Zoom',
          facetime: 'Digitalt via FaceTime',
          teams: 'Digitalt via Teams',
          atclient: 'Möte hos dig (ange din adress)',
          atoffice: 'Möte på mitt kontor i Stockholm'
        };
        const visibleLabel = displayNames.hasOwnProperty(value) ? displayNames[value] : labelText;

        const cell = document.createElement('div');
        cell.className = 'radio-button-items';

        const label = document.createElement('label');
        label.className = 'radio-button-items';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'meeting_type';
        input.value = value;
        input.className = 'radio-button-items';

        // Add event listener to handle meeting length rendering and validation
        input.addEventListener('change', () => {
          renderMeetingLengths(value);
          validateAndRenderCustomerFields();
        });

        label.appendChild(input);
        const text = document.createElement('span');
        text.textContent = ` ${visibleLabel}`;
        text.style.display = 'block';
        text.style.marginLeft = '10px';
        text.style.marginTop = '-20px';
        text.style.lineHeight = '1.4';
        text.style.paddingLeft = '8px';
        label.appendChild(text);
        cell.appendChild(label);
        container.appendChild(cell);
      });

      // Instead of old meetingLengthWrapper, render lengths for first type (if any)
      // Find checked or first meeting type, else fallback to first in list
      let selectedType = document.querySelector('input[name="meeting_type"]:checked')?.value;
      if (!selectedType && types.length > 0) {
        selectedType = types[0].toLowerCase();
        // Optionally: check the first meeting type radio button
        const firstRadio = container.querySelector('input[name="meeting_type"]');
        if (firstRadio) firstRadio.checked = true;
      }
      if (selectedType) {
        renderMeetingLengths(selectedType);
      }
    } catch (error) {
      console.error('Error loading meeting types:', error);
      const container = document.getElementById('meeting_type_group');
      if (container) {
        container.innerHTML = '<p style="color: red;">Kunde inte ladda mötestyper.</p>';
      }
    }
  }

  // Render meeting length radio buttons for a given meeting type
  function renderMeetingLengths(type) {
    const slotContainer = document.getElementById('time_slot_select');
    if (!slotContainer) return;
    slotContainer.innerHTML = '';

    const values = (lengths && lengths[type]) ? lengths[type] : [90]; // fallback om inget definierat
    values.forEach(value => {
      const cell = document.createElement('div');
      cell.className = 'radio-button-items'; // one grid cell

      const label = document.createElement('label');
      label.className = 'radio-button-items';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'meeting_length';
      input.value = value;
      input.className = 'radio-button-items';
      if (value === values[0]) input.checked = true;
      input.addEventListener('change', validateAndRenderCustomerFields);

      const text = document.createElement('span');
      text.textContent = ` ${value} min`;
      label.appendChild(input);
      label.appendChild(text);
      cell.appendChild(label);
      slotContainer.appendChild(cell);
    });

    const wrapper = document.getElementById('time_slot_group');
    if (wrapper) wrapper.style.display = 'block';
  }

  function validateEmail() {
    const emailEl = document.querySelector('#booking_email');
    const email = emailEl ? emailEl.value.trim() : '';
    const isValid = email.length > 0 && email.includes('@');
    const meetingTypeGroup = document.getElementById('meeting_type_group');
    if (meetingTypeGroup) {
      meetingTypeGroup.style.display = isValid ? 'block' : 'none';
    }
    if (email.length > 0 && email.includes('@')) {
      loadMeetingTypes();
    }
    validateAndRenderCustomerFields();
  }

  async function validateAndRenderCustomerFields() {
    console.log('🔁 validateAndRenderCustomerFields() körs');
    const emailEl = document.querySelector('#booking_email');
    const email = emailEl ? emailEl.value.trim() : '';
    const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
    const meetingType = meetingTypeEl ? meetingTypeEl.value : '';

    const allFieldIds = ['first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country'];
    const fieldLabels = {
      first_name: 'Förnamn',
      last_name: 'Efternamn',
      phone: 'Telefonnummer',
      company: 'Företag',
      address: 'Gatuadress',
      postal_code: 'Postnummer',
      city: 'Stad',
      country: 'Land'
    };
    const allFields = allFieldIds.map(id => document.getElementById(id)).filter(Boolean);

    const addressField = document.getElementById('address_field');
    const missingFieldsContainer = document.getElementById('missing_fields_messages');
    const submitButton = document.getElementById('contact-update-button');
    const loadingEl = document.getElementById('contact_validation_loading');

    // Clear previous missing field messages and remove .needs-filling classes
    if (missingFieldsContainer) {
      missingFieldsContainer.innerHTML = '';
    }
    allFields.forEach(input => {
      input.classList.remove('needs-filling');
    });

    if (!email || !meetingType) {
      if (addressField) addressField.style.display = 'none';
      if (submitButton) {
        submitButton.style.display = 'none';
      }
      return;
    }

    try {
      if (loadingEl) loadingEl.style.display = 'block';

      const url = `https://macspotbackend.azurewebsites.net/api/validate_contact`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, meeting_type: meetingType })
      });
      console.log('📡 validate_contact status:', response.status);

      if (!response.ok) {
        throw new Error('Failed to validate contact');
      }

      const data = await response.json();
      console.log('✅ API JSON:', data);
      // console.log('ℹ️ typeof missing_fields:', typeof data.missing_fields);
      // console.log('🔎 missing_fields:', data.missing_fields);
      if (!('missing_fields' in data)) {
        console.log('✅ missing_fields inte nödvändigt – kunden är komplett');
      } else if (!Array.isArray(data.missing_fields)) {
        console.warn('⚠️ missing_fields finns men är inte en array');
      }


      if (data.missing_fields && Array.isArray(data.missing_fields)) {
        let firstFocusable = null;
        allFields.forEach(input => {
          const fieldName = input.id;
          // console.log(`🧪 Kontroll: fieldName = '${fieldName}'`);
          // console.log(`🔍 Finns i missing_fields?`, data.missing_fields.includes(fieldName));
          const isAddressField = ['address', 'postal_code', 'city', 'country'].includes(fieldName);
          const shouldShow = data.missing_fields.includes(fieldName) && (!isAddressField || meetingType === 'atclient');
          if (shouldShow) {
            // console.log("👁️ Visar fält:", fieldName);
            // console.log(`➡️ input.id = ${input.id}`);
            // console.log(`➡️ input.style.display = ${input.style.display}`);
            input.style.display = 'block';
            input.classList.add('needs-filling');
            if (!input.value.trim() && !firstFocusable) {
              firstFocusable = input;
            }
            if (missingFieldsContainer) {
              const p = document.createElement('p');
              p.style.color = 'red';
              const label = fieldLabels[fieldName] || fieldName;
              p.textContent = `Saknat fält: ${label}`;
              missingFieldsContainer.appendChild(p);
            }
          } else {
            input.style.display = 'none';
          }
        });
        if (firstFocusable) {
          firstFocusable.focus();
          firstFocusable.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      if (addressField) {
        addressField.style.display = (meetingType === 'atclient') ? 'block' : 'none';
      }

      // Show submit button only if all visible fields have content
      let allVisibleFilled = true;
      const visibleInputs = allFields.filter(el => {
        return el.offsetParent !== null; // visible
      });
      allVisibleFilled = visibleInputs.every(input => input.value.trim());
      // Button display logic moved just before formState assignment (see below)

      // --- Button display logic (refactored) ---
      if (submitButton) {
        submitButton.style.display = 'none';
        if (allVisibleFilled) {
          if (data.status === 'new_customer') {
            submitButton.style.display = 'block';
            submitButton.textContent = 'Spara kund';
          } else {
            // Befintlig kund med ny eller kompletterad data
            submitButton.style.display = 'block';
            submitButton.textContent = window.formState?.slot_iso ? 'Boka möte' : 'Uppdatera kund';
          }
        }
      }

      if (allVisibleFilled) {
        // Get selected meeting length from radio buttons (default 90)
        const selectedLengthRadio = document.querySelector('input[name="meeting_length"]:checked');
        const selectedLength = selectedLengthRadio ? parseInt(selectedLengthRadio.value, 10) : 90;
        window.formState = {
          email,
          meeting_type: meetingType,
          meeting_length: selectedLength,
          metadata: {
            first_name: document.getElementById('first_name')?.value || '',
            last_name: document.getElementById('last_name')?.value || '',
            phone: document.getElementById('phone')?.value || '',
            company: document.getElementById('company')?.value || '',
            address: document.getElementById('address')?.value || '',
            postal_code: document.getElementById('postal_code')?.value || '',
            city: document.getElementById('city')?.value || '',
            country: document.getElementById('country')?.value || ''
          }
        };
        // --- BEGIN: Fetch available slots and set in window.setAvailableSlots ---
        try {
          const slotRes = await fetch('https://macspotbackend.azurewebsites.net/api/getavailableslots', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              meeting_type: meetingType,
              meeting_length: selectedLength
            })
          });
          const slotData = await slotRes.json();
          if (Array.isArray(slotData.slots)) {
            const grouped = {};
            slotData.slots.forEach(slot => {
              // Parse slot_iso as local date and time for accurate timezone placement
              const localDate = new Date(slot.slot_iso);
              const date = localDate.getFullYear() + '-' +
                           String(localDate.getMonth() + 1).padStart(2, '0') + '-' +
                           String(localDate.getDate()).padStart(2, '0');
              const time = localDate.toTimeString().slice(0, 5);
              if (!grouped[date]) grouped[date] = [];
              grouped[date].push(time);
            });
            window.setAvailableSlots(grouped);
          }
        } catch (err) {
          console.error('Kunde inte hämta tillgängliga tider:', err);
        }
        // --- END: Fetch available slots ---
        const calendarWrapper = document.getElementById('calendar-wrapper');
        if (calendarWrapper) {
          calendarWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }

    } catch (error) {
      console.error('Error validating contact:', error);
      allFields.forEach(input => {
        input.style.display = 'none';
      });
      if (addressField) {
        addressField.style.display = 'none';
      }
      if (submitButton) {
        submitButton.style.display = 'none';
      }
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  window.validateCustomerContact = validateAndRenderCustomerFields;

  window.setAvailableSlots = function(availableSlots) {
    // availableSlots is an object with keys as ISO date strings, values as arrays of time strings
    // Example: { "2024-06-15": ["09:00", "10:30"], "2024-06-16": ["11:00"] }

    const calendarWrapper = document.getElementById('calendar-wrapper');
    const timesWrapper = document.getElementById('times-wrapper');

    if (!calendarWrapper || !timesWrapper) {
      console.warn('Calendar or times wrapper not found.');
      return;
    }

    // Clear calendar and times
    calendarWrapper.innerHTML = '';
    timesWrapper.innerHTML = '';

    // Month navigation state
    let currentMonth = new Date();

    // Helper: format date as YYYY-MM-DD
    function formatDate(date) {
      return date.toISOString().split('T')[0];
    }

    // Render improved calendar with month name, weekdays, and grid layout
    function renderCalendar() {
      calendarWrapper.innerHTML = '';

      const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });
      const monthTitle = document.createElement('div');
      monthTitle.className = 'calendar-month';
      monthTitle.textContent = monthName;

      // Month navigation
      const navWrapper = document.createElement('div');
      navWrapper.style.display = 'flex';
      navWrapper.style.justifyContent = 'space-between';
      navWrapper.style.alignItems = 'center';
      navWrapper.style.marginBottom = '0.5rem';

      const prevButton = document.createElement('button');
      prevButton.textContent = '<';
      prevButton.onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() - 1);
        renderCalendar();
      };

      const nextButton = document.createElement('button');
      nextButton.textContent = '>';
      nextButton.onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
      };

      // Block or hide left arrow if in current month
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

      const weekdays = ['Mån', 'Tis', 'Ons', 'Tors', 'Fre', 'Lör', 'Sön']; // Starts on Monday, correct
      const weekdayHeader = document.createElement('div');
      weekdayHeader.className = 'calendar-weekdays';
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
      // Corrected startOffset calculation for week starting on Monday:
      const startOffset = (firstDay.getDay() + 6) % 7;
      if (startOffset !== 0) {
        for (let i = 0; i < startOffset; i++) {
          const placeholder = document.createElement('div');
          grid.appendChild(placeholder);
        }
      }

      // Track if we already auto-rendered the first available date for this render
      // (window.initialSlotRendered is used globally)
      for (let day = 1; day <= lastDay.getDate(); day++) {
        const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
        const isoDate = formatDate(date);
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day';
        dayEl.textContent = day;

        // Block previous dates (before today)
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const isPast = date < todayMidnight;

        if (isPast) {
          dayEl.classList.add('unavailable');
          dayEl.style.color = '#ccc';
        } else if (availableSlots[isoDate] && availableSlots[isoDate].length > 0) {
          dayEl.classList.add('available');
          dayEl.style.cursor = 'pointer';
          dayEl.style.pointerEvents = 'auto';
          dayEl.addEventListener('click', () => {
            highlightDate(dayEl);
            renderTimes(availableSlots[isoDate]);
          });
          // Automatically show first available date
          if (!window.initialSlotRendered) {
            highlightDate(dayEl);
            renderTimes(availableSlots[isoDate]);
            window.initialSlotRendered = true;
          }
        } else {
          dayEl.classList.add('unavailable');
          dayEl.style.color = '#ccc';
        }

        grid.appendChild(dayEl);
      }
      calendarWrapper.appendChild(grid);
    }

    // Highlight selected date in calendar
    function highlightDate(selectedDayEl) {
      const dayEls = calendarWrapper.querySelectorAll('.calendar-day');
      dayEls.forEach(el => el.classList.remove('selected'));
      selectedDayEl.classList.add('selected');
    }

    // Render available times for selected date
    function renderTimes(times) {
      timesWrapper.innerHTML = '';
      times.forEach(time => {
        // --- BEGIN: Show weekday and date label before each time ---
        const selectedDateEl = document.querySelector('.calendar-day.selected');
        if (selectedDateEl) {
          const selectedDay = selectedDateEl.textContent.padStart(2, '0');
          const year = currentMonth.getFullYear();
          const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
          const date = new Date(`${year}-${month}-${selectedDay}`);
          const weekday = date.toLocaleDateString('sv-SE', { weekday: 'long' });
          const formatted = `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${selectedDay} ${date.toLocaleDateString('sv-SE', { month: 'short' })}`;
          const label = document.createElement('div');
          label.style.fontSize = '0.75rem';
          label.style.color = '#555';
          label.style.marginBottom = '2px';
          label.textContent = formatted;
          timesWrapper.appendChild(label);
        }
        // --- END: Show weekday and date label before each time ---
        const timeEl = document.createElement('button');
        timeEl.type = 'button';
        timeEl.className = 'time-slot';
        timeEl.textContent = time;
        timeEl.addEventListener('click', () => {
          // Mark selected time
          const allTimes = timesWrapper.querySelectorAll('.time-slot');
          allTimes.forEach(t => t.classList.remove('selected'));
          timeEl.classList.add('selected');
          // Store selected time in formState
          if (!window.formState) window.formState = {};
          // --- Begin new block to set slot_iso ---
          const selectedDateEl = document.querySelector('.calendar-day.selected');
          if (selectedDateEl) {
            const selectedDay = selectedDateEl.textContent.padStart(2, '0');
            const year = currentMonth.getFullYear();
            const month = String(currentMonth.getMonth() + 1).padStart(2, '0');
            const dateIso = `${year}-${month}-${selectedDay}`;
            const isoTime = `${dateIso}T${time}:00.000Z`;
            window.formState.slot_iso = isoTime;
            // Show submit button when both date and time are selected
            const submitButton = document.getElementById('contact-update-button');
            if (submitButton) {
              submitButton.style.display = 'block';
              submitButton.textContent = 'Boka möte';
            }
          }
          window.formState.meeting_time = time;
          // --- End new block ---
          console.log('Selected time:', time);
        });
        timesWrapper.appendChild(timeEl);
      });
    }

    // Reset the initialSlotRendered flag before rendering calendar for a new slot set
    window.initialSlotRendered = false;
    // Move calendar rendering before any fetch/asynchronous logic and wrap in requestAnimationFrame
    requestAnimationFrame(() => renderCalendar());
  };

  document.addEventListener('DOMContentLoaded', async () => {
    // Meeting length select dropdown removed (radio buttons are now used exclusively)
    const meetingTypeGroup = document.getElementById('meeting_type_group');
    const style = document.createElement('style');
    style.textContent = `
      #calendar-wrapper {
        max-width: 280px;
        margin-bottom: 1rem;
      }
      .calendar-month {
        font-weight: bold;
        text-align: center;
        margin: 0.5rem 0;
      }
      .calendar-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        font-size: 0.8rem;
        text-align: center;
        margin-bottom: 4px;
        color: #444;
      }
      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr); /* Monday to Sunday */
        gap: 4px;
      }
      .calendar-day {
        width: 100%;
        aspect-ratio: 1 / 1;
        line-height: 28px;
        text-align: center;
        border-radius: 4px;
        cursor: default;
        font-size: 0.9rem;
        background-color: #f5f5f5;
      }
      .calendar-day.available {
        background-color: #e0f7fa;
        cursor: pointer;
      }
      .calendar-day.selected {
        background-color: #00796b;
        color: white;
      }
    `;
    document.head.appendChild(style);

    const emailEl = document.querySelector('#booking_email');
    if (emailEl) emailEl.addEventListener('input', validateEmail);

    // Lägg till lyssnare på meeting_type_group för att validera vid ändring
    if (meetingTypeGroup) {
      meetingTypeGroup.addEventListener('change', () => {
        const calendarWrapper = document.getElementById('calendar-wrapper');
        const timesWrapper = document.getElementById('times-wrapper');
        if (calendarWrapper) calendarWrapper.innerHTML = '';
        if (timesWrapper) timesWrapper.innerHTML = '';
        if (window.formState) {
          window.formState.slot_iso = null;
        }
        const submitButton = document.getElementById('contact-update-button');
        if (submitButton) {
          submitButton.style.display = 'none';
        }
        // Reset initialSlotRendered so the calendar auto-selects again
        window.initialSlotRendered = false;
        validateAndRenderCustomerFields();
      });
    }

    // Also call validateAndRenderCustomerFields automatically if both fields are filled
    const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
    if (emailEl && emailEl.value.trim() && meetingTypeEl) {
      validateAndRenderCustomerFields();
    }

    // Göm knappen initialt
    const submitButton = document.getElementById('contact-update-button');
    if (submitButton) {
      submitButton.style.display = 'none';
      submitButton.onclick = async (event) => {
        event.preventDefault();
        if (!window.formState) {
          alert('Vänligen fyll i alla obligatoriska fält.');
          return;
        }
        // Validera att slot_iso finns innan fetch
        if (!window.formState.slot_iso) {
          alert('Vänligen välj en tid i kalendern.');
          submitButton.disabled = false;
          submitButton.textContent = 'Boka möte';
          return;
        }
        submitButton.disabled = true;
        submitButton.textContent = 'Skickar...';

        try {
          const response = await fetch('https://macspotbackend.azurewebsites.net/api/book_meeting', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(window.formState)
          });
          if (!response.ok) {
            throw new Error('Booking failed');
          }
          const result = await response.json();
          // Byt ut alert mot visuell feedback
          const confirmationEl = document.getElementById('booking-status');
          if (confirmationEl) {
            confirmationEl.textContent = '✅ Bokning genomförd!';
            confirmationEl.style.color = 'green';
          }
          // Optionally reset form or redirect
        } catch (error) {
          alert('Ett fel uppstod vid bokningen. Försök igen.');
          const confirmationEl = document.getElementById('booking-status');
          if (confirmationEl) {
            confirmationEl.textContent = '❌ Bokningen misslyckades – försök igen.';
            confirmationEl.style.color = 'red';
          }
          console.error(error);
        } finally {
          submitButton.disabled = false;
          submitButton.textContent = 'Boka möte';
        }
      };
    }
  });
</script>
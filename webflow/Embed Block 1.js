// Kontrollerar om alla tre kundfält är ifyllda och triggar initCalendarAndSlots vid behov.
function checkClientReady() {
  // Cache DOM lookups
  const cltEmailEl = document.getElementById('clt_email');
  const cltMeetingTypeEl = document.getElementById('clt_meetingtype');
  const cltMeetingLengthEl = document.getElementById('clt_meetinglength');
  const cltReady = document.getElementById('clt_ready');

  const cltEmail = cltEmailEl?.value.trim();
  const cltMeetingType = cltMeetingTypeEl?.value.trim();
  const cltMeetingLength = cltMeetingLengthEl?.value.trim();
  const isReady = cltEmail && cltMeetingType && cltMeetingLength;
  if (cltReady) cltReady.value = isReady ? 'true' : 'false';

  if (isReady) {
    try {
      if (!window.formState) window.formState = {};
      window.formState.email = cltEmail;
      window.formState.meeting_type = cltMeetingType;
      window.formState.meeting_length = parseInt(cltMeetingLength, 10) || 90;
      fetch('https://macspotbackend.azurewebsites.net/api/getavailableslots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cltEmail,
          meeting_type: cltMeetingType,
          meeting_length: parseInt(cltMeetingLength, 10) || 90
        })
      })
      .then(res => res.json())
      .then(slotData => {
        if (Array.isArray(slotData.slots)) {
          const grouped = {};
          slotData.slots.forEach(slot => {
            const localDate = new Date(slot.slot_iso);
            const localYear = localDate.getFullYear();
            const localMonth = String(localDate.getMonth() + 1).padStart(2, '0');
            const localDay = String(localDate.getDate()).padStart(2, '0');
            const date = `${localYear}-${localMonth}-${localDay}`;
            const time = localDate.toTimeString().slice(0, 5);
            if (!grouped[date]) grouped[date] = [];
            grouped[date].push(time);
          });
          requestAnimationFrame(() => {
            const calendarWrapper = document.getElementById('calendar_wrapper');
            if (calendarWrapper) {
              calendarWrapper.classList.add('visible-calendar');
              calendarWrapper.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            if (calendarWrapper && calendarWrapper.offsetParent !== null) {
              window.setAvailableSlots(grouped);
            }
          });
// Wrapperfunktion för att trigga checkClientReady
function triggerClientReadyCheck() {
  checkClientReady();
}
        }
      })
      .catch(err => {
        console.error('Kunde inte hämta tillgängliga tider:', err);
      });
      // Removed duplicate: calendarWrapper.classList.add('visible-calendar') and scrollIntoView
    } catch (err) {
      console.error('Fel vid initiering av kalender och slots:', err);
    }
  } else {
    console.log('⏳ Väntar – inte alla fält är ifyllda ännu');
  }
}
<script>
// Laddar mötestyper (t.ex. Zoom, Teams, atclient, atoffice) och renderar radio-knappar.
// Syfte: Användaren väljer typ av möte, vilket styr tillgängliga tider och fält.
async function loadMeetingTypes() {
    try {
      const res = await fetch('https://macspotbackend.azurewebsites.net/api/meeting_types');
      if (!res.ok) throw new Error('Failed to fetch meeting types');
      // Backend returns { types, lengths }
      const { types, lengths: loadedLengths } = await res.json();
      lengths = loadedLengths || {};

      const container = document.getElementById('meeting_type_select');
      if (!container) return;

      container.innerHTML = '';
      // Rendera radio-knapp för varje mötestyp.
      function createRadioElement({name, value, label, checked, onChange}) {
        const cell = document.createElement('div');
        cell.className = 'radio-button-items';
        const labelEl = document.createElement('label');
        labelEl.className = 'radio-button-items';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = value;
        input.className = 'radio-button-items';
        if (checked) input.checked = true;
        if (typeof onChange === 'function') input.addEventListener('change', onChange);
        labelEl.appendChild(input);
        const text = document.createElement('span');
        text.textContent = ` ${label}`;
        text.className = 'radio-label-text';
        labelEl.appendChild(text);
        cell.appendChild(labelEl);
        return cell;
      }
      (Array.isArray(types) ? types : JSON.parse(types)).forEach((type, idx) => {
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
        const checked = false; // ensure no meeting type is preselected
        const radio = createRadioElement({
          name: 'meeting_type',
          value,
          label: visibleLabel,
          checked,
          onChange: () => {
            renderMeetingLengths(value);
            validateAndRenderCustomerFields();
          }
        });
        container.appendChild(radio);
      });

      // Rendera längder för första (eller vald) mötestyp direkt.
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

  // Renderar radio-knappar för möteslängd baserat på vald mötestyp.
  function renderMeetingLengths(type) {
    const slotContainer = document.getElementById('time_slot_select');
    if (!slotContainer) return;
    slotContainer.innerHTML = '';

    const values = (lengths && lengths[type]) ? lengths[type] : [90]; // fallback om inget definierat
    function createMeetingLengthRadio(value, checked) {
      const cell = document.createElement('div');
      cell.className = 'radio-button-items';
      const labelEl = document.createElement('label');
      labelEl.className = 'radio-button-items';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'meeting_length';
      input.value = value;
      input.className = 'radio-button-items';
      if (checked) input.checked = true;
      input.addEventListener('change', validateAndRenderCustomerFields);
      labelEl.appendChild(input);
      const text = document.createElement('span');
      text.textContent = ` ${value} min`;
      text.className = 'radio-label-text';
      labelEl.appendChild(text);
      cell.appendChild(labelEl);
      return cell;
    }
    values.forEach((value, idx) => {
      slotContainer.appendChild(createMeetingLengthRadio(value, false));
    });

    const wrapper = document.getElementById('time_slot_group');
    if (wrapper) wrapper.classList.add('visible-group');
  }

  // Enkel e-postvalidering och styr visning av mötestypval.
  function validateEmail() {
    const emailEl = document.querySelector('#booking_email');
    const email = emailEl ? emailEl.value.trim() : '';
    const isValid = email.length > 0 && email.includes('@');
    const meetingTypeGroup = document.getElementById('meeting_type_group');
    if (meetingTypeGroup) {
      if (isValid) {
        meetingTypeGroup.classList.add('visible-group');
        meetingTypeGroup.classList.remove('hidden');
      } else {
        meetingTypeGroup.classList.remove('visible-group');
        meetingTypeGroup.classList.add('hidden');
      }
    }
    if (email.length > 0 && email.includes('@')) {
      loadMeetingTypes();
    }
    // Dessa dolda fält används för att signalera att alla tre kunddata (email, mötestyp, längd) är ifyllda.
    const cltEmail = document.getElementById('clt_email');
    if (cltEmail) cltEmail.value = email;
    validateAndRenderCustomerFields();
  }

  // Validerar kontaktuppgifter mot backend och renderar nödvändiga kontaktfält.
  // Syfte: Säkerställa att alla obligatoriska fält är ifyllda innan bokning.
  // Hanterar även logik för submit-knapp och sparar state i window.formState.
  async function validateAndRenderCustomerFields() {
    console.log('🔁 validateAndRenderCustomerFields() körs');
    // Cache DOM lookups
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
    const cltEmail = document.getElementById('clt_email');
    const cltMeetingType = document.getElementById('clt_meetingtype');
    const cltMeetingLength = document.getElementById('clt_meetinglength');
    const selectedLengthRadio = document.querySelector('input[name="meeting_length"]:checked');
    const selectedLength = selectedLengthRadio ? parseInt(selectedLengthRadio.value, 10) : 90;

    // Set hidden input values before checkClientReady for clarity
    if (cltEmail) cltEmail.value = email;
    if (cltMeetingType) cltMeetingType.value = meetingType;
    if (cltMeetingLength) cltMeetingLength.value = selectedLength;

    // Clear previous missing field messages and remove .needs-filling classes
    if (missingFieldsContainer) {
      missingFieldsContainer.innerHTML = '';
    }
    allFields.forEach(input => {
      input.classList.remove('needs-filling');
    });

    // Visa och validera endast om både e-post och mötestyp är angivna.
    if (!email || !meetingType) {
      if (addressField) addressField.classList.add('hidden');
      if (submitButton) submitButton.classList.add('hidden');
      return;
    }

    try {
      if (loadingEl) loadingEl.classList.add('loading-visible');

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
      if (!('missing_fields' in data)) {
        console.log('✅ missing_fields inte nödvändigt – kunden är komplett');
      } else if (!Array.isArray(data.missing_fields)) {
        console.warn('⚠️ missing_fields finns men är inte en array');
      }

      if (data.missing_fields && Array.isArray(data.missing_fields)) {
        let firstFocusable = null;
        allFields.forEach(input => {
          const fieldName = input.id;
          const isAddressField = ['address', 'postal_code', 'city', 'country'].includes(fieldName);
          const shouldShow = data.missing_fields.includes(fieldName) && (!isAddressField || meetingType === 'atclient');
          if (shouldShow) {
            input.classList.remove('hidden');
            input.classList.add('needs-filling');
            if (!input.value.trim() && !firstFocusable) {
              firstFocusable = input;
            }
            if (missingFieldsContainer) {
              const p = document.createElement('p');
              p.className = 'missing-field-message';
              const label = fieldLabels[fieldName] || fieldName;
              p.textContent = `Saknat fält: ${label}`;
              missingFieldsContainer.appendChild(p);
            }
          } else {
            input.classList.add('hidden');
            input.classList.remove('needs-filling');
          }
        });
        if (firstFocusable) {
          firstFocusable.focus();
          firstFocusable.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }

      if (addressField) {
        if (meetingType === 'atclient') {
          addressField.classList.remove('hidden');
        } else {
          addressField.classList.add('hidden');
        }
      }

      // Show submit button only if all visible fields have content
      let allVisibleFilled = true;
      const visibleInputs = allFields.filter(el => {
        return el.offsetParent !== null; // visible
      });
      allVisibleFilled = visibleInputs.every(input => input.value.trim());

      // --- Button display logic (refactored) ---
      if (submitButton) {
        submitButton.classList.add('hidden');
        if (allVisibleFilled) {
          if (data.status === 'new_customer') {
            submitButton.classList.remove('hidden');
            submitButton.textContent = 'Skapa';
          } else if (data.status === 'existing_customer' && data.missing_fields.length > 0) {
            submitButton.classList.remove('hidden');
            submitButton.textContent = 'Uppdatera';
          }
        }
      }

      if (allVisibleFilled) {
        // Spara nuvarande kontakt- och mötesdata i window.formState
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
        // Hidden input values already set above
        // Only warn if missing
        if (!cltEmail || !cltMeetingType || !cltMeetingLength) {
          console.warn('⚠️ En eller flera dolda kundfält saknas i DOM');
        }
        triggerClientReadyCheck();
        // No need for extra calendarWrapper.classList.add/scrollIntoView here
      }

    } catch (error) {
      console.error('Error validating contact:', error);
      allFields.forEach(input => {
        input.classList.add('hidden');
      });
      if (addressField) {
        addressField.classList.add('hidden');
      }
      if (submitButton) {
        submitButton.classList.add('hidden');
      }
    } finally {
      if (loadingEl) loadingEl.classList.remove('loading-visible');
    }
  }

  // Gör kontaktvalideringsfunktionen globalt åtkomlig.
  window.validateCustomerContact = validateAndRenderCustomerFields;

  // Hanterar rendering av tillgängliga mötestider och kalender.
  // availableSlots är ett objekt: { "YYYY-MM-DD": ["09:00", "10:30"], ... }
window.setAvailableSlots = function(availableSlots) {
    const calendarWrapper = document.getElementById('calendar_wrapper');
    const timesWrapper = document.getElementById('times_wrapper');
    if (!calendarWrapper) {
      console.warn('⚠️ calendarWrapper saknas');
      return;
    }
    calendarWrapper.innerHTML = '';
    if (timesWrapper) timesWrapper.innerHTML = '';

    // Håller aktuell månad för navigering.
    let currentMonth = new Date();

    // Hjälpfunktion: format YYYY-MM-DD
    function formatDate(date) {
      return date.toISOString().split('T')[0];
    }

    // Ritar kalendern: månadstitel, veckodagar och grid.
    // Grid: 8 kolumner (1 för veckonummer, 7 för måndag-söndag).
    function renderCalendar() {
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
        renderCalendar();
      };

      const nextButton = document.createElement('button');
      nextButton.textContent = '>';
      nextButton.onclick = () => {
        currentMonth.setMonth(currentMonth.getMonth() + 1);
        renderCalendar();
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

      const weekdays = ['Mån', 'Tis', 'Ons', 'Tors', 'Fre', 'Lör', 'Sön']; // Kalendern börjar på måndag
      // Header: veckonummer + veckodagar
      const weekdayHeader = document.createElement('div');
      weekdayHeader.className = 'calendar-weekdays';
      // Veckonummer-header
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

      // --- Kalendergrid: 8 kolumner (veckonummer + 7 dagar) ---
      // Här sker rendering av 8x7-grid med veckonummer till vänster.
      // Varje rad = vecka. Första cellen = veckonummer, resterande = dagar.
      const grid = document.createElement('div');
      grid.className = 'calendar-grid';

      // Hjälpfunktion för ISO-veckonummer
      function getISOWeek(date) {
        // Kopiera datum för att inte modifiera original
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        // Sätt till närmaste torsdag: aktuellt datum + 4 - veckodag
        let dayNum = d.getUTCDay();
        if (dayNum === 0) dayNum = 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
        const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return weekNo;
      }

      const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const lastDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
      // Justera så att kalendern börjar på måndag (startOffset = antal tomma celler före första dagen)
      const jsDay = firstDay.getDay(); // JS: 0 = söndag, 1 = måndag, ..., 6 = lördag
      const startOffset = jsDay === 0 ? 6 : jsDay - 1;

      // Totalt antal dagar i grid (inkl. placeholder)
      const totalDays = startOffset + lastDay.getDate();
      const numWeeks = Math.ceil(totalDays / 7);

      let day = 1;
      for (let week = 0; week < numWeeks; week++) {
        // Beräkna måndagens datum för denna vecka
        let mondayDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1 - startOffset + week * 7);
        const weekNumber = getISOWeek(mondayDate);
        // Första cellen: veckonummer
        const weekNumberEl = document.createElement('div');
        weekNumberEl.className = 'week-number';
        weekNumberEl.textContent = weekNumber;
        grid.appendChild(weekNumberEl);
        for (let wd = 0; wd < 7; wd++) {
          const gridIndex = week * 7 + wd;
          // Om före första dagen i månaden eller efter sista: tom cell
          if (gridIndex < startOffset || day > lastDay.getDate()) {
            const placeholder = document.createElement('div');
            grid.appendChild(placeholder);
          } else {
            const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const isoDate = formatDate(date);
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
                highlightDate(dayEl);
                renderTimes(availableSlots[isoDate]);
              });
              if (!window.initialSlotRendered) {
                highlightDate(dayEl);
                renderTimes(availableSlots[isoDate]);
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
      // Ta bort gammalt grid om det finns
      const oldGrid = calendarWrapper.querySelector('.calendar-grid');
      if (oldGrid) oldGrid.remove();

      // Lägg till nya grid
      calendarWrapper.appendChild(grid);
    }

    // Markerar vald dag i kalendern.
    function highlightDate(selectedDayEl) {
      const dayEls = calendarWrapper.querySelectorAll('.calendar-day');
      dayEls.forEach(el => {
        el.classList.remove('selected');
      });
      selectedDayEl.classList.add('selected');
      console.log('📌 Vald dag:', selectedDayEl.dataset.date);
      // Guard clause: Check timesWrapper existence before showing
      const timesWrapper = document.getElementById('times_wrapper');
      if (!timesWrapper) {
        console.warn('⚠️ timesWrapper is null – highlightDate avbryts');
        return;
      }
      timesWrapper.classList.add('visible-group');
      timesWrapper.classList.remove('hidden');
    }

    // Visar tillgängliga tider för vald dag.
    function renderTimes(times) {
      const timesWrapper = document.getElementById('times_wrapper');
      if (!timesWrapper) {
        console.warn('⚠️ timesWrapper is null');
        return;
      }
      timesWrapper.classList.add('visible-group');
      timesWrapper.classList.remove('hidden');
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
        label.className = 'timeslot-date-label';
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
              submitButton.classList.remove('hidden');
              submitButton.textContent = 'Boka möte';
            }
          }
          window.formState.meeting_time = time;
          console.log('Selected time:', time);
        });
        timesWrapper.appendChild(timeEl);
      });
    }

    // --- window.initialSlotRendered ---
    // Denna flagga styr att första lediga dag/tid i kalendern auto-renderas EN gång när slots laddas.
    // Den återställs varje gång nya slots laddas (t.ex. vid byte av mötestyp/längd).
    // Detta gör att användaren alltid ser första lediga slot direkt.
    window.initialSlotRendered = false;
    renderCalendar();
};

  document.addEventListener('DOMContentLoaded', async () => {
    // Init: Sätter eventlyssnare och gömmer submit-knapp
    const meetingTypeGroup = document.getElementById('meeting_type_group');
    const emailEl = document.querySelector('#booking_email');
    if (emailEl) emailEl.addEventListener('input', validateEmail);

    // Vid byte av mötestyp: nollställ kalender/tider, återställ initialSlotRendered och validera kontaktfält.
    if (meetingTypeGroup) {
      meetingTypeGroup.addEventListener('change', () => {
        const calendarWrapper = document.getElementById('calendar_wrapper');
        const timesWrapper = document.getElementById('times_wrapper');
        if (calendarWrapper) calendarWrapper.innerHTML = '';
        if (timesWrapper) timesWrapper.innerHTML = '';
        if (window.formState) {
          window.formState.slot_iso = null;
        }
        const submitButton = document.getElementById('contact-update-button');
        if (submitButton) {
          submitButton.classList.add('hidden');
        }
        window.initialSlotRendered = false;
        validateAndRenderCustomerFields();
      });
    }

    // Om e-post och mötestyp redan är ifyllda: validera kontaktfält direkt.
    const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
    if (emailEl?.value.trim() && meetingTypeEl) {
      validateAndRenderCustomerFields();
    }

    // Göm bokningsknappen initialt och sätt click-handler för bokning.
    const submitButton = document.getElementById('contact-update-button');
    if (submitButton) {
      submitButton.classList.add('hidden');
      submitButton.onclick = async (event) => {
        event.preventDefault();
        if (!window.formState) {
          alert('Vänligen fyll i alla obligatoriska fält.');
          return;
        }
        // Kontrollera att slot_iso (vald tid) finns innan bokning.
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
          // Visuell feedback vid lyckad bokning.
          const confirmationEl = document.getElementById('booking-status');
          if (confirmationEl) {
            confirmationEl.textContent = '✅ Bokning genomförd!';
            confirmationEl.classList.add('booking-success');
            confirmationEl.classList.remove('booking-failed');
          }
          // Optionellt: nollställ formulär eller gör redirect.
        } catch (error) {
          alert('Ett fel uppstod vid bokningen. Försök igen.');
          const confirmationEl = document.getElementById('booking-status');
          if (confirmationEl) {
            confirmationEl.textContent = '❌ Bokningen misslyckades – försök igen.';
            confirmationEl.classList.add('booking-failed');
            confirmationEl.classList.remove('booking-success');
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

// (window.initCalendarAndSlots togs bort – logik flyttad till checkClientReady)
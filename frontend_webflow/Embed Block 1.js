<script>
  // --- Globala bokningsinställningar ---
  let bookingSettings = null;

  async function loadBookingSettings() {
    try {
      const res = await fetch('https://macspotbackend.azurewebsites.net/api/booking_settings');
      if (res.ok) {
        bookingSettings = await res.json();
        console.log('✅ Loaded booking_settings:', bookingSettings);
      } else {
        console.warn('⚠️ Kunde inte hämta booking_settings');
      }
    } catch (err) {
      console.error('❌ Fel vid hämtning av booking_settings:', err);
    }
  }

  // Återställer formulärstate (mötestyp, mötestid, tider, clt_ready)
  function resetFormState() {
    console.log('🔄 Återställer formulärstate');
    const fieldsToClear = [
      'clt_meetingtype',
      'clt_meetinglength',
      'clt_ready'
    ];
    fieldsToClear.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const meetingRadios = document.querySelectorAll('input[name="meeting_type"]');
    meetingRadios.forEach(r => r.checked = false);
    const lengthRadios = document.querySelectorAll('input[name="meeting_length"]');
    lengthRadios.forEach(r => r.checked = false);

    const slotContainer = document.getElementById('time_slot_select');
    if (slotContainer) slotContainer.innerHTML = '';
    const slotGroup = document.getElementById('time_slot_group');
    if (slotGroup) slotGroup.style.display = 'none';
    // Döljer kalendern också
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (calendarWrapper) calendarWrapper.style.display = 'none';
  }

  // Kontrollerar e-post och triggar laddning av mötestyper och validering.
  function validateEmail() {
    console.log('🔎 validateEmail() körs');
    const emailEl = document.querySelector('#booking_email');
    const email = emailEl ? emailEl.value.trim() : '';
    const cltEmail = document.getElementById('clt_email');
    if (cltEmail) {
      cltEmail.value = email;
      console.log('📥 Satt #clt_email:', email);
    }
    if (email.length > 0 && email.includes('@')) {
      loadMeetingTypes();
      resetFormState();
      // Döljer kalendern också
      const calendarWrapper = document.getElementById('calendar_wrapper');
      if (calendarWrapper) calendarWrapper.style.display = 'none';
      // Lägg till logg direkt efter anropet
      console.log('🧪 Validering och mötestyper triggat, väntar på meeting_type_select');
      const typeGroup = document.getElementById('meeting_type_group');
      if (typeGroup) {
        typeGroup.style.display = 'block';
        console.log('✅ Visar #meeting_type_group via style.display');
      }
    } else {
      console.log('❌ Ogiltig e-post, laddar inte mötestyper');
    }
  }

  // Laddar mötestyper och längder från backend och renderar radioknappar.
  async function loadMeetingTypes() {
    console.log('🔎 loadMeetingTypes() körs');
    try {
      const res = await fetch('https://macspotbackend.azurewebsites.net/api/meeting_types');
      if (!res.ok) throw new Error('Failed to fetch meeting types');
      const { types, lengths: loadedLengths } = await res.json();
      window.lengths = {};
      Object.entries(loadedLengths || {}).forEach(([key, val]) => {
        window.lengths[key.toLowerCase()] = val;
      });
      console.log('📡 Hämtade mötestyper och längder:', types, window.lengths);
      console.log('📊 Mötestyper:', types);
      console.log('📊 Längder per typ:', window.lengths);

      const container = document.getElementById('meeting_type_select');
      if (!container) {
        console.warn('⚠️ #meeting_type_select saknas i DOM');
        return;
      }
      container.innerHTML = '';

      function createRadio({ name, value, label, checked, onChange }) {
        const div = document.createElement('div');
        div.className = 'radio-button-items';
        const labelEl = document.createElement('label');
        labelEl.className = 'radio-button-items';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = value;
        input.className = 'radio-button-items';
        // Ingen radioknapp ska förväljas eller klickas automatiskt
        if (typeof onChange === 'function') input.addEventListener('change', onChange);
        labelEl.appendChild(input);
        const text = document.createElement('span');
        text.textContent = ` ${label}`;
        text.style.display = 'block';
        text.style.marginLeft = '10px';
        text.style.marginTop = '-20px';
        text.style.lineHeight = '1.4';
        text.style.paddingLeft = '8px';
        labelEl.appendChild(text);
        div.appendChild(labelEl);
        return div;
      }

      (Array.isArray(types) ? types : JSON.parse(types)).forEach((type, index) => {
        const value = type.toLowerCase();
        const displayNames = {
          zoom: 'Digitalt via Zoom',
          facetime: 'Digitalt via FaceTime',
          teams: 'Digitalt via Teams',
          atclient: 'Möte hos dig (ange din adress)',
          atoffice: 'Möte på mitt kontor i Stockholm'
        };
        const label = displayNames[value] || type;
        const radio = createRadio({
          name: 'meeting_type',
          value,
          label,
          checked: false,
          onChange: () => {
            console.log('🔄 Mötestyp ändrad till:', value);
            renderMeetingLengths(value);
            validateAndRenderCustomerFields();
          }
        });
        container.appendChild(radio);
      });

      const renderedRadios = container.querySelectorAll('input[name="meeting_type"]');
      if (renderedRadios.length === 0) {
        console.warn('⚠️ Inga mötestyper renderades – kontrollera types-data');
      }

      const typeGroup = document.getElementById('meeting_type_group');
      if (typeGroup) {
        typeGroup.classList.remove('hidden');
        typeGroup.classList.add('visible-group');
        console.log('✅ Visar #meeting_type_group');
      }

    } catch (err) {
      console.error('❌ Error loading meeting types:', err);
      const container = document.getElementById('meeting_type_group');
      if (container) {
        container.innerHTML = '<p style="color: red;">Kunde inte ladda mötestyper - skyll inte på mig utan på Bill Gates.</p>';
      }
    }
  }

  // Renderar längdalternativ beroende på mötestyp.
  function renderMeetingLengths(type) {
    console.log('🔎 renderMeetingLengths() körs för typ:', type);
    // Döljer kalendern också innan man visar längdalternativ
    const calendarWrapper = document.getElementById('calendar_wrapper');
    if (calendarWrapper) calendarWrapper.style.display = 'none';
    const slotContainer = document.getElementById('time_slot_select');
    if (!slotContainer) {
      console.warn('⚠️ #time_slot_select saknas i DOM');
      return;
    }
    slotContainer.innerHTML = '';
    const values = (window.lengths && window.lengths[type]) ? window.lengths[type] : [90];
    console.log(`⏱ Renderar ${values.length} tider för ${type}`);

    function createLengthRadio(value, checked) {
      const div = document.createElement('div');
      div.className = 'radio-button-items';
      const labelEl = document.createElement('label');
      labelEl.className = 'radio-button-items';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'meeting_length';
      input.value = value;
      input.className = 'radio-button-items';
      if (checked) input.checked = true;
      input.addEventListener('change', () => {
        console.log('🔄 Möteslängd ändrad till:', value);
        const cltMeetingLength = document.getElementById('clt_meetinglength');
        if (cltMeetingLength) {
          cltMeetingLength.value = value;
          console.log('📥 Satt #clt_meetinglength:', value);
          // Kopiera radioknappens mötestyp till #clt_meetingtype om möjligt
          const cltMeetingType = document.getElementById('clt_meetingtype');
          const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
          if (cltMeetingType && meetingTypeEl) {
            cltMeetingType.value = meetingTypeEl.value;
            console.log('📥 Bekräftat #clt_meetingtype från radioknapp:', cltMeetingType.value);
          }
        }
        validateAndRenderCustomerFields();
      });
      labelEl.appendChild(input);
      const span = document.createElement('span');
      span.textContent = ` ${value} min`;
      span.className = 'radio-label-text';
      labelEl.appendChild(span);
      div.appendChild(labelEl);
      return div;
    }

    values.forEach((value, idx) => {
      slotContainer.appendChild(createLengthRadio(value, false));
    });

    const wrapper = document.getElementById('time_slot_group');
    if (wrapper) wrapper.classList.add('visible-group');

    const slotGroup = document.getElementById('time_slot_group');
    if (slotGroup) {
      slotGroup.classList.remove('hidden');
      slotGroup.classList.add('visible-group');
      console.log('✅ Visar #time_slot_group');
      slotGroup.style.display = 'block';
      console.log('✅ Visar #time_slot_group via style.display');
    }
    // Efter sista console.log('✅ Visar #time_slot_group via style.display');
    // Visa kalendern endast om både mötestyp och längd är ifyllda och giltiga
    const calendarWrapper2 = document.getElementById('calendar_wrapper');
    const cltMeetingLength2 = document.getElementById('clt_meetinglength')?.value;
    const cltMeetingType2 = document.getElementById('clt_meetingtype')?.value;
    if (calendarWrapper2) {
      if (cltMeetingLength2 && cltMeetingType2) {
        calendarWrapper2.style.display = 'flex';
        if (window.initAvailableSlotFetch) {
          window.initAvailableSlotFetch();
        }
      } else {
        calendarWrapper2.style.display = 'none';
      }
    }

  }

  // Validerar kontaktuppgifter mot backend och renderar nödvändiga kontaktfält.
  async function validateAndRenderCustomerFields() {
    // Döljer alltid submit-knappen i början av valideringen
    const submitButton = document.getElementById('contact-update-button');
    if (submitButton) submitButton.style.display = 'none';
    console.log('🔎 validateAndRenderCustomerFields() körs');
    const emailEl = document.querySelector('#booking_email');
    const email = emailEl ? emailEl.value.trim() : '';
    const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
    const meetingType = meetingTypeEl ? meetingTypeEl.value : '';
    const meetingLengthEl = document.querySelector('input[name="meeting_length"]:checked');
    const meetingLength = meetingLengthEl ? meetingLengthEl.value : '';

    const cltEmail = document.getElementById('clt_email');
    const cltMeetingType = document.getElementById('clt_meetingtype');
    const cltMeetingLength = document.getElementById('clt_meetinglength');
    const cltReady = document.getElementById('clt_ready');
    const cltContactId = document.getElementById('clt_contact_id');
    const addressField = document.querySelector('#address_fields');
    if (!meetingType || !meetingLength) {
      console.log('⏳ Väntar på mötestyp och mötestid innan validering av namn');
      return;
    }
    // Om email eller mötestyp saknas, göm fält och knapp
    if (!email || !meetingType) {
      console.log('⚠️ E-post eller mötestyp saknas, gömmer fält och knapp');
      const allFields = ['first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country'].map(id => document.getElementById(id)).filter(Boolean);
      allFields.forEach(f => {
        f.classList.add('hidden');
        f.classList.remove('needs-filling');
      });
      if (addressField) addressField.classList.add('hidden');
      if (submitButton) submitButton.style.display = 'none';
      if (cltReady) cltReady.value = 'false';
      return;
    }
    try {
      const url = 'https://macspotbackend.azurewebsites.net/api/validate_contact';
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, meeting_type: meetingType })
      });
      const data = await response.json();
      console.log('📡 validate_contact status:', response.status);
      console.log('🔍 API-svar – söker contact_id:', data);

      // --- LOGGAR: Kontrollmötestyp och clt-fält ---
      console.log('📋 Kontrollmötestyp:', meetingType);
      console.log('📊 Kontroll clt-fält:', {
        cltEmail: cltEmail?.value,
        cltMeetingType: cltMeetingType?.value,
        cltMeetingLength: cltMeetingLength?.value,
        cltContactId: cltContactId?.value,
        cltReady: cltReady?.value
      });

      await fetchAndUpdateCustomerState(email, meetingType);
      updateCustomerFieldVisibilityAndState(data, meetingType);
    } catch (err) {
      console.error('❌ Fel vid validering av kontakt:', err);
    }
  }

  // Kontrollera att validateEmail() kopplas vid input
  document.addEventListener('DOMContentLoaded', async () => {
    // Ladda bokningsinställningar
    await loadBookingSettings();

    // Sätt clt_ready till 'false' vid sidladdning
    const cltReady = document.getElementById('clt_ready');
    if (cltReady) cltReady.value = 'false';

    const emailEl = document.querySelector('#booking_email');
    if (emailEl) {
      emailEl.addEventListener('input', validateEmail);
      console.log('✅ Lyssnare på #booking_email aktiverad');
    } else {
      console.warn('⚠️ #booking_email hittades inte vid DOMContentLoaded');
    }
    // Lägg till lyssnare på alla kontaktfält så att validateAndRenderCustomerFields() körs vid input
    [
      'first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country', 'clt_contact_id'
    ].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          validateAndRenderCustomerFields();
        });
      }
    });
    console.log('✅ Lyssnare på kontaktfält aktiverad');
    // Göm alltid kontaktknappen initialt vid sidladdning
    const submitButton = document.getElementById('contact-update-button');
    if (submitButton) {
      submitButton.style.display = 'none';
      submitButton.textContent = '';
      console.log('🚫 Gömmer kontaktknapp vid sidladdning och nollställer text');
    }

    // Lägg till click-lyssnare på #contact-update-button som POSTar till /validate_contact (write_if_valid)
    if (submitButton) {
      submitButton.addEventListener('click', async (e) => {
        // --- DEBUGLOGGAR: visar exakt vad som finns tillgängligt vid klicktillfället ---
        console.log('🧪 Knappklick mottaget.');
        console.log('🧪 Knappetikett:', submitButton.textContent);
        console.log('🧪 window.formState:', window.formState);
        // Lägg till loggning av varje relevant fält:
        ['first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country'].forEach(id => {
          const el = document.getElementById(id);
          console.log(`🧪 ${id}:`, el?.value || '(tomt)');
        });
        console.log('🧪 clt_ready:', document.getElementById('clt_ready')?.value);
        // -------------------------------------------------------------------------------
        e.preventDefault();
        const label = submitButton.tagName === 'INPUT' ? submitButton.value : submitButton.textContent;
        if (!['Skapa', 'Uppdatera'].includes(label)) {
          console.warn('⚠️ Avbryter klick – ogiltig knappetikett:', label);
          return;
        }

        if (!window.formState) {
          const metadata = {};
          ['first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country'].forEach(id => {
            const el = document.getElementById(id);
            metadata[id] = el?.value || '';
          });

          const emailEl = document.querySelector('#booking_email');
          const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
          const meetingLengthEl = document.querySelector('input[name="meeting_length"]:checked');
          const contactIdEl = document.getElementById('clt_contact_id');

          window.formState = {
            email: emailEl?.value.trim() || '',
            meeting_type: meetingTypeEl?.value || '',
            meeting_length: parseInt(meetingLengthEl?.value || '90', 10),
            contact_id: contactIdEl?.value || '',
            metadata
          };
          console.log('📥 Återskapade window.formState vid klick:', window.formState);
        }

        const body = {
          email: window.formState.email,
          meeting_type: window.formState.meeting_type,
          metadata: window.formState.metadata,
          write_if_valid: true
        };

        try {
          console.log('📤 Skickar kontaktdata till /validate_contact (write_if_valid)', body);
          const res = await fetch('https://macspotbackend.azurewebsites.net/api/validate_contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          const result = await res.json();
          console.log('✅ Kontaktdata sparad via validate_contact:', result);
          // --- NY LOGIK: Sätt clt_contact_id och trigga slot-fetch om contact_id finns ---
          if (result.contact_id) {
            const cltContactId = document.getElementById('clt_contact_id');
            if (cltContactId) cltContactId.value = result.contact_id;

            if (window.formState) {
              window.formState.contact_id = result.contact_id;
            }

            const cltReady = document.getElementById('clt_ready');
            if (cltReady) cltReady.value = 'true';

            if (window.initAvailableSlotFetch) {
              window.initAvailableSlotFetch();
              console.log('📡 initAvailableSlotFetch() anropad från Skapa/Uppdatera');
            }
            // --- Lägg till validateAndRenderCustomerFields() efter skapande/uppdatering ---
            validateAndRenderCustomerFields();
            console.log('🔁 Kör validateAndRenderCustomerFields() efter skapande');
            // Dölj knappen efter lyckad uppdatering
            submitButton.style.display = 'none';
            submitButton.style.opacity = '0';
            submitButton.style.pointerEvents = 'none';
            submitButton.style.visibility = 'hidden';
            console.log('🚫 Gömmer kontaktknapp efter att kunden skapats');
          }
        } catch (err) {
          console.error('❌ Misslyckades spara kontaktdata:', err);
        }
      });
    }
  });

  // --- Nya funktioner för API-anrop och fälthantering ---
  async function fetchAndUpdateCustomerState(email, meetingType) {
    const cltEmail = document.getElementById('clt_email');
    const cltMeetingType = document.getElementById('clt_meetingtype');
    const cltMeetingLength = document.getElementById('clt_meetinglength');
    const cltContactId = document.getElementById('clt_contact_id');

    if (cltEmail) cltEmail.value = email;
    if (cltMeetingType) {
      cltMeetingType.value = meetingType;
      console.log('📥 Satt cltMeetingType från fetchAndUpdateCustomerState:', cltMeetingType.value);
    }

    const response = await fetch('https://macspotbackend.azurewebsites.net/api/validate_contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, meeting_type: meetingType })
    });
    const data = await response.json();

    const idFromResponse = [data.contact_id, data.id].find(v => typeof v === 'string' && v.length > 10) || '';
    if (cltContactId) cltContactId.value = idFromResponse;

    return data;
  }

  function updateCustomerFieldVisibilityAndState(data, meetingType) {
    // Hämta required_fields från bookingSettings om det finns
    const requiredFields = bookingSettings?.required_fields?.[meetingType] || [];

    // --- LOGGAR direkt efter shouldShowField ---
    console.log('🧪 bookingSettings.required_fields:', bookingSettings?.required_fields?.[meetingType]);
    console.log('🧪 Backend missing_fields:', data.missing_fields);
    const allFieldIds = ['first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country'];
    const metadata = data.metadata || {};
    const shownFields = Array.isArray(data.missing_fields) ? data.missing_fields : [];
    console.log('🧪 Fält som kommer visas i formuläret:', shownFields);

    const submitButton = document.getElementById('contact-update-button');
    // Dölj submit-knappen direkt efter den definierats
    if (submitButton) {
      submitButton.style.display = 'none';
      // submitButton.style.pointerEvents = 'none';
      // submitButton.style.visibility = 'hidden';
    }
    const cltEmail = document.getElementById('clt_email');
    const cltMeetingType = document.getElementById('clt_meetingtype');
    const cltMeetingLength = document.getElementById('clt_meetinglength');
    const cltContactId = document.getElementById('clt_contact_id');
    const cltReady = document.getElementById('clt_ready');
    const emailEl = document.querySelector('#booking_email');
    const meetingLengthEl = document.querySelector('input[name="meeting_length"]:checked');
    const meetingLength = meetingLengthEl ? meetingLengthEl.value : '';
    const addressField = document.querySelector('#address_fields');
    // allFieldIds redan definierad ovan
    const fieldLabels = bookingSettings?.field_labels || {};
    const allFields = allFieldIds.map(id => document.getElementById(id)).filter(Boolean);
    const missingFieldsContainer = document.getElementById('missing_fields_messages');
    if (missingFieldsContainer) missingFieldsContainer.innerHTML = '';

    // --- NY LOGIK för visning av address_fields och kontaktfält ---
    const addressFieldIds = ['address', 'postal_code', 'city', 'country'];
    const addressWrapper = document.getElementById('address_fields');

    allFields.forEach(input => {
      const shouldShow = shownFields.includes(input.id);
      if (shouldShow) {
        input.classList.remove('hidden');
        input.classList.add('needs-filling');
        input.style.display = 'block';
      } else {
        input.classList.remove('needs-filling');
        input.classList.add('hidden');
        input.style.display = 'none';
      }
    });

    // Fallback: se till att alla shownFields visas oavsett value
    shownFields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.style.display = 'block';
        el.classList.remove('hidden');
        el.classList.add('needs-filling');
      }
    });

    // Visa address_fields om något av adresselementen krävs i shownFields
    if (addressWrapper) {
      const shouldShowAnyAddressField = addressFieldIds.some(id => shownFields.includes(id));
      addressWrapper.style.display = shouldShowAnyAddressField ? 'block' : 'none';
      if (shouldShowAnyAddressField) {
        addressWrapper.classList.remove('hidden');
      } else {
        addressWrapper.classList.add('hidden');
      }
    }

    // Visa knapp baserat på status och om alla synliga fält är ifyllda
    if (submitButton) {
      if (data.status === 'new_customer') {
        submitButton.style.display = 'flex';
        // submitButton.style.pointerEvents = 'auto';
        // submitButton.style.visibility = 'visible';
        if (submitButton.tagName === 'INPUT') {
          submitButton.value = 'Skapa';
        } else {
          submitButton.textContent = 'Skapa';
        }
        console.log('🆕 Ny kund – visa "Skapa" knapp');
      } else if (data.status === 'existing_customer' && Array.isArray(data.missing_fields) && data.missing_fields.length > 0) {
        submitButton.style.display = 'flex';
        // submitButton.style.pointerEvents = 'auto';
        // submitButton.style.visibility = 'visible';
        if (submitButton.tagName === 'INPUT') {
          submitButton.value = 'Uppdatera';
        } else {
          submitButton.textContent = 'Uppdatera';
        }
        console.log('✏️ Befintlig kund med saknade fält – visa "Uppdatera" knapp');
      } else {
        // submitButton already hidden above
        console.log('✅ Befintlig kund komplett – göm knapp');
      }
    }

    // Kontrollera att alla dolda fält är ifyllda
    const allCltFieldsFilled =
      cltEmail && String(cltEmail.value).trim() &&
      cltMeetingType && String(cltMeetingType.value).trim() &&
      cltMeetingLength && String(cltMeetingLength.value).trim() &&
      cltContactId && typeof cltContactId.value === 'string' && cltContactId.value.trim();
    if (!allCltFieldsFilled) {
      // Specifik logg när cltContactId.value saknas
      if (!cltContactId || !cltContactId.value.trim()) {
        console.warn('⚠️ clt_ready = false p.g.a: cltContactId.value saknas', {
          cltEmail: cltEmail?.value,
          cltMeetingType: cltMeetingType?.value,
          cltMeetingLength: cltMeetingLength?.value,
          cltContactId: cltContactId?.value
        });
      } else {
        console.warn('⚠️ clt_ready = false p.g.a: clt-fält saknas – detaljer:', {
          cltEmail: cltEmail?.value,
          cltMeetingType: cltMeetingType?.value,
          cltMeetingLength: cltMeetingLength?.value,
          cltContactId: cltContactId?.value
        });
      }
    }
    console.log('🧪 Kontroll av clt-fält:',
      {
        cltEmail: cltEmail?.value,
        cltMeetingType: cltMeetingType?.value,
        cltMeetingLength: cltMeetingLength?.value,
        cltContactId: cltContactId?.value
      }
    );

    // Kontrollera att alla synliga kontaktfält är ifyllda
    // Använd getComputedStyle för att säkert avgöra synlighet
    const visibleInputs = allFields.filter(el => el && window.getComputedStyle(el).display !== 'none');
    const allVisibleContactFieldsFilled = visibleInputs.every(input => input.value.trim());
    visibleInputs.forEach(input => {
      console.log(`🔍 Synligt fält: #${input.id} = "${input.value.trim()}"`);
    });

    if (allCltFieldsFilled && allVisibleContactFieldsFilled) {
      const addressFieldIds = ['address', 'postal_code', 'city', 'country'];
      const addressInputs = addressFieldIds.map(id => document.getElementById(id)).filter(Boolean);
      const addressVisibleAndRequired = meetingType === 'atclient' && addressInputs.some(el => window.getComputedStyle(el).display !== 'none');
      const allAddressFieldsFilled = addressInputs.every(el => el.value.trim());

      const addressCheckPassed = !addressVisibleAndRequired || allAddressFieldsFilled;

      if (addressCheckPassed && cltReady) {
        cltReady.value = 'true';
        // Sätt window.formState så att det alltid finns vid knapptryckning
        window.formState = {
          email: emailEl ? emailEl.value.trim() : '',
          meeting_type: meetingType,
          meeting_length: parseInt(meetingLength, 10),
          contact_id: cltContactId?.value || '',
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
        // Lägg till källa för formState
        window.formState.source = 'frontend';
        // Döljer submit-knappen direkt när clt_ready = true (skapande/uppdatering klar)
        if (submitButton) {
          submitButton.style.display = 'none';
          // submitButton.style.pointerEvents = 'none';
          // submitButton.style.visibility = 'hidden';
          console.log('🚫 Gömmer knapp efter skapande eller uppdatering');
        }
        console.log('✅ formState satt:', window.formState);
        console.log('✅ Alla kund- och kontaktfält ifyllda, satt #clt_ready = true');
        // KOPPLAR Block 1 till Block 2: initiera slot-fetch om funktionen finns
        if (window.initAvailableSlotFetch) {
          window.initAvailableSlotFetch();
          console.log('📡 initAvailableSlotFetch() anropad från Block 1');
        } else {
          console.warn('⚠️ initAvailableSlotFetch() saknas – se till att Block 2 är laddad');
          setTimeout(() => {
            if (window.initAvailableSlotFetch) {
              window.initAvailableSlotFetch();
              console.log('📡 initAvailableSlotFetch() kördes via fallback');
            } else {
              console.warn('❌ initAvailableSlotFetch() saknas fortfarande efter timeout');
            }
          }, 500);
        }
      }
    } else {
      const debugMissing = [];
      if (!allCltFieldsFilled) debugMissing.push('clt-fält saknas');
      if (!allVisibleContactFieldsFilled) debugMissing.push('synliga kontaktfält saknas');
      console.warn('⚠️ clt_ready = false p.g.a:', debugMissing.join(' + '));
      if (cltReady) {
        cltReady.value = 'false';
        console.log('⚠️ Saknas ifyllda kontaktfält, satt #clt_ready = false');
      }
    }

    // Lägg till logg för slutstatus för clt-fält
    console.log('🧪 Slutstatus clt-fält:', {
      clt_email: cltEmail?.value,
      clt_meetingtype: cltMeetingType?.value,
      clt_meetinglength: cltMeetingLength?.value,
      clt_contact_id: cltContactId?.value,
      clt_ready: cltReady?.value
    });
  }
</script>
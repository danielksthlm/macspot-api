<style>
  #contact-update-button.hidden {
    display: none !important;
  }
</style>
<script>
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
      window.lengths = loadedLengths || {};
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
        container.innerHTML = '<p style="color: red;">Kunde inte ladda mötestyper.</p>';
      }
    }
  }

  // Renderar längdalternativ beroende på mötestyp.
  function renderMeetingLengths(type) {
    console.log('🔎 renderMeetingLengths() körs för typ:', type);
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

  }

  // Validerar kontaktuppgifter mot backend och renderar nödvändiga kontaktfält.
  async function validateAndRenderCustomerFields() {
    // Döljer alltid submit-knappen i början av valideringen
    const submitButton = document.getElementById('contact-update-button');
    if (submitButton) submitButton.classList.add('hidden');
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

    const addressField = document.querySelector('#address_fields');
    if (!addressField) {
      console.warn('⚠️ #address_fields hittades inte i DOM');
    }

    // Lägg till guard för att vänta på mötestyp och mötestid innan validering av namn
    if (!meetingType || !meetingLength) {
      console.log('⏳ Väntar på mötestyp och mötestid innan validering av namn');
      return;
    }

    // Sätt dolda fält
    if (cltEmail) {
      cltEmail.value = email;
      console.log('📥 Satt #clt_email:', email);
    }
    if (cltMeetingType) {
      cltMeetingType.value = meetingType;
      console.log('📥 Satt #clt_meetingtype:', meetingType);
    }
    if (cltMeetingLength) {
      cltMeetingLength.value = meetingLength;
      console.log('📥 Satt #clt_meetinglength:', meetingLength);
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
      if (submitButton) submitButton.classList.add('hidden');
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
      console.log('📡 validate_contact status:', response.status);
      if (!response.ok) throw new Error('Failed to validate contact');
      const data = await response.json();
      console.log('✅ API JSON:', data);

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
      const missingFieldsContainer = document.getElementById('missing_fields_messages');
      if (missingFieldsContainer) missingFieldsContainer.innerHTML = '';

      // Börja med att dölja alla fält och #address_fields
      allFields.forEach(f => {
        f.classList.add('hidden');
        f.classList.remove('needs-filling');
        f.style.display = 'none';
      });
      if (addressField) addressField.style.display = 'none';

      // Visa alltid dessa fält om kunden är ny eller har missing_fields
      const alwaysShow = ['first_name', 'last_name', 'phone', 'company'];
      allFields.forEach(input => {
        const fieldName = input.id;
        const isAddressField = ['address', 'postal_code', 'city', 'country'].includes(fieldName);
        const shouldShow = data.status === 'new_customer' && alwaysShow.includes(fieldName);
        const isMissing = data.missing_fields && data.missing_fields.includes(fieldName);
        const showField = shouldShow || isMissing;

        if (showField) {
          input.classList.remove('hidden');
          input.classList.add('needs-filling');
          input.style.display = 'block';
          if (missingFieldsContainer && isMissing) {
            const p = document.createElement('p');
            p.className = 'missing-field-message';
            p.textContent = `Saknat fält: ${fieldLabels[fieldName] || fieldName}`;
            missingFieldsContainer.appendChild(p);
          }
        }
      });

      // Visa #address_fields om meetingType === 'atclient' och (ny kund eller någon adress i missing_fields)
      const addressFieldIds = ['address', 'postal_code', 'city', 'country'];
      const addressRequired =
        meetingType === 'atclient' &&
        (
          data.status === 'new_customer' ||
          (data.missing_fields && addressFieldIds.some(id => data.missing_fields.includes(id)))
        );

      if (addressRequired && addressField) {
        addressField.style.display = 'block';
        console.log('✅ Visar #address_fields pga atclient + ny kund eller missing_fields');
      }

      // Visa knapp baserat på status och om alla synliga fält är ifyllda
      if (submitButton) {
        if (data.status === 'new_customer') {
          submitButton.classList.remove('hidden');
          submitButton.value = 'Skapa';
          console.log('🆕 Ny kund – visa "Skapa" knapp');
        } else if (data.status === 'existing_customer' && data.missing_fields.length > 0) {
          submitButton.classList.remove('hidden');
          submitButton.value = 'Uppdatera';
          console.log('✏️ Befintlig kund med saknade fält – visa "Uppdatera" knapp');
        } else {
          submitButton.classList.add('hidden');
          console.log('✅ Befintlig kund komplett – göm knapp');
        }
      }

      // Sätt clt_ready till 'true' om alla tre dolda fält finns och är ifyllda
      if (
        cltEmail && cltEmail.value.trim() &&
        cltMeetingType && cltMeetingType.value.trim() &&
        cltMeetingLength && cltMeetingLength.value.trim()
      ) {
        if (cltReady) {
          cltReady.value = 'true';
          console.log('✅ Alla dolda kundfält ifyllda, satt #clt_ready = true');
        }
      } else {
        if (cltReady) {
          cltReady.value = 'false';
          console.log('⚠️ Ej alla dolda kundfält ifyllda, satt #clt_ready = false');
        }
      }

    } catch (err) {
      console.error('❌ Fel vid validering av kontakt:', err);
    }
  }

  // Kontrollera att validateEmail() kopplas vid input
  document.addEventListener('DOMContentLoaded', () => {
    const emailEl = document.querySelector('#booking_email');
    if (emailEl) {
      emailEl.addEventListener('input', validateEmail);
      console.log('✅ Lyssnare på #booking_email aktiverad');
    } else {
      console.warn('⚠️ #booking_email hittades inte vid DOMContentLoaded');
    }
    // Göm alltid kontaktknappen initialt vid sidladdning
    const submitButton = document.getElementById('contact-update-button');
    if (submitButton) {
      submitButton.classList.add('hidden');
      submitButton.value = '';
      console.log('🚫 Gömmer kontaktknapp vid sidladdning och nollställer text');
    }
  });
</script>
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
  async function loadMeetingTypes() {
    try {
      const res = await fetch('https://macspotbackend.azurewebsites.net/api/meeting_types');
      if (!res.ok) throw new Error('Failed to fetch meeting types');
      const types = await res.json();

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

      const radios = container.querySelectorAll('input[name="meeting_type"]');
      radios.forEach(r => r.addEventListener('change', () => {
        console.log('Mötestyp vald:', r.value);
        setTimeout(validateAndRenderCustomerFields, 50);
      }));
    } catch (error) {
      console.error('Error loading meeting types:', error);
      const container = document.getElementById('meeting_type_group');
      if (container) {
        container.innerHTML = '<p style="color: red;">Kunde inte ladda mötestyper.</p>';
      }
    }
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
    const submitButton = document.querySelector('button[type="submit"]');
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
      if (!Array.isArray(data.missing_fields)) {
        console.warn('⚠️ missing_fields saknas eller inte en array');
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
      if (submitButton) {
        submitButton.style.display = allVisibleFilled ? 'block' : 'none';
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

  document.addEventListener('DOMContentLoaded', async () => {
    const emailEl = document.querySelector('#booking_email');
    if (emailEl) emailEl.addEventListener('input', validateEmail);

    // Also call validateAndRenderCustomerFields automatically if both fields are filled
    const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
    if (emailEl && emailEl.value.trim() && meetingTypeEl) {
      validateAndRenderCustomerFields();
    }
  });
</script>
<script>
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

    const customerFieldsGroup = document.getElementById('customer_fields_group');
    const addressField = document.getElementById('address_field');
    const missingFieldsContainer = document.getElementById('missing_fields_messages');
    const submitButton = document.querySelector('button[type="submit"]');
    const loadingEl = document.getElementById('contact_validation_loading');

    // Clear previous missing field messages and remove .needs-filling classes
    if (missingFieldsContainer) {
      missingFieldsContainer.innerHTML = '';
    }
    if (customerFieldsGroup) {
      const inputs = customerFieldsGroup.querySelectorAll('input, textarea, select');
      inputs.forEach(input => input.classList.remove('needs-filling'));
    }

    if (!email || !meetingType) {
      if (customerFieldsGroup) {
        customerFieldsGroup.style.display = 'none';
      }
      if (addressField) {
        addressField.style.display = 'none';
      }
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
      if (!Array.isArray(data.missing_fields)) {
        console.warn('⚠️ missing_fields saknas eller inte en array');
      }

      if (customerFieldsGroup) {
        customerFieldsGroup.style.display = 'block';
      }

      if (data.missing_fields && Array.isArray(data.missing_fields)) {
        if (missingFieldsContainer) {
          data.missing_fields.forEach(field => {
            const p = document.createElement('p');
            p.style.color = 'red';
            p.textContent = `Saknat fält: ${field}`;
            missingFieldsContainer.appendChild(p);
            // Mark corresponding input fields with .needs-filling
            if (customerFieldsGroup) {
              const fieldInput = customerFieldsGroup.querySelector(`[name="${field}"]`);
              if (fieldInput) {
                fieldInput.classList.add('needs-filling');
              }
            }
          });
        }
      }

      if (meetingType === 'atclient') {
        if (addressField) {
          addressField.style.display = 'block';
        }
      } else {
        if (addressField) {
          addressField.style.display = 'none';
        }
      }

      // Show submit button only if at least one visible field is empty
      let showSubmit = false;
      if (customerFieldsGroup) {
        const visibleInputs = Array.from(customerFieldsGroup.querySelectorAll('input, textarea, select')).filter(el => {
          return el.offsetParent !== null; // visible
        });
        showSubmit = visibleInputs.some(input => !input.value.trim());
      }
      if (submitButton) {
        submitButton.style.display = showSubmit ? 'block' : 'none';
      }

    } catch (error) {
      console.error('Error validating contact:', error);
      if (customerFieldsGroup) {
        customerFieldsGroup.style.display = 'none';
      }
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
    const contactEl = document.querySelector('#booking_customer_contact');
    if (contactEl) contactEl.addEventListener('input', validateAndRenderCustomerFields);

    // Also call validateAndRenderCustomerFields automatically if both fields are filled
    const meetingTypeEl = document.querySelector('input[name="meeting_type"]:checked');
    if (emailEl && emailEl.value.trim() && meetingTypeEl) {
      validateAndRenderCustomerFields();
    }
  });
</script>
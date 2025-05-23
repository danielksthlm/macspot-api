<script>
  const METADATA_KEYS = ['first_name', 'last_name', 'phone', 'company', 'address', 'postal_code', 'city', 'country'];
  const ADDRESS_FIELD_IDS = ['address', 'postal_code', 'city', 'country'];
  const displayNames = {
    zoom: 'Digitalt via Zoom',
    facetime: 'Digitalt via FaceTime',
    teams: 'Digitalt via Teams',
    atclient: 'Möte hos dig (ange adress)',
    atoffice: 'Möte på mitt kontor i Stockholm'
  };
  let bookingSettings = null;

  document.addEventListener('DOMContentLoaded', async () => {
    bookingSettings = await fetchJSON('/api/booking_settings');
    document.getElementById('clt_ready').value = 'false';
    document.querySelector('#booking_email')?.addEventListener('input', onEmailInput);
    METADATA_KEYS.concat('clt_contact_id').forEach(id => {
      document.getElementById(id)?.addEventListener('input', validateContact);
    });
    document.getElementById('contact-update-button')?.addEventListener('click', submitContact);
  });

  function onEmailInput() {
    resetState();
    const email = getVal('#booking_email');
    setVal('#clt_email', email);
    if (!email.includes('@')) return;
    loadMeetingTypes();
  }

  async function loadMeetingTypes() {
    const { types, lengths } = await fetchJSON('/api/meeting_types');
    window.lengths = Object.fromEntries(Object.entries(lengths).map(([k, v]) => [k.toLowerCase(), v]));
    const container = document.getElementById('meeting_type_select');
    container.innerHTML = '';
    types.forEach(type => {
      const value = type.toLowerCase();
      container.appendChild(createRadio('meeting_type', value, displayNames[value], () => {
        setVal('#clt_meetingtype', value);
        renderMeetingLengths(value);
        validateContact();
      }));
    });
    document.getElementById('meeting_type_group').style.display = 'block';
  }

  function renderMeetingLengths(type) {
    const container = document.getElementById('time_slot_select');
    container.innerHTML = '';
    (window.lengths[type] || [90]).forEach(length => {
      container.appendChild(createRadio('meeting_length', length, `${length} min`, () => {
        setVal('#clt_meetinglength', String(length));
        document.querySelector('#clt_meetinglength')?.setAttribute('value', String(length));
        console.log('🧪 DEBUG set clt_meetinglength to:', length);
        validateContact();
        checkReady();
      }));
    });
    document.getElementById('time_slot_group').style.display = 'block';
  }


  async function validateContact() {
    const email = getVal('#booking_email'), type = getVal('input[name="meeting_type"]:checked'), len = getVal('input[name="meeting_length"]:checked');
    if (!email.includes('@') || !type) return;
    const response = await fetchJSON('/api/validate_contact', { email, meeting_type: type }, 'POST');
    const { contact_id, missing_fields, status } = response;
    console.log('🧪 validateContact() contact_id:', contact_id);
    if (contact_id) {
      setVal('#clt_contact_id', contact_id);
      if (!window.formState) window.formState = {};
      window.formState.contact_id = contact_id;
    }
    const metadata = typeof response?.metadata === 'object' ? response.metadata : {};
    // Autofill using the latest formState.metadata as the source of truth
    const dataSource = metadata;
    METADATA_KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (
        el &&
        dataSource[key] !== undefined &&
        dataSource[key] !== null
      ) {
        setVal(`#${key}`, dataSource[key]);
      }
    });
    checkReady();
    updateSubmitButton(status, missing_fields || []);
    // Store missing_fields in window.formState for later use in submitContact
    if (!window.formState) window.formState = {};
    window.formState.missing_fields = missing_fields || [];
    toggleFields(missing_fields || [], bookingSettings?.required_fields?.[type] || []);
    const debugVals = {
      clt_contact_id: getVal('#clt_contact_id'),
      clt_email: getVal('#clt_email'),
      clt_meetingtype: getVal('#clt_meetingtype'),
      clt_meetinglength: getVal('#clt_meetinglength'),
      clt_meetingtime: getVal('#clt_meetingtime'),
      clt_ready: getVal('#clt_ready'),
      ...Object.fromEntries(METADATA_KEYS.map(k => [k, getVal(`#${k}`)]))
    };
    console.log('🧪 Kontakt-ID:', debugVals.clt_contact_id);
    console.log('🧪 DEBUG:', debugVals);
    // if (getVal('#clt_ready') === 'true' && getVal('#clt_contact_id')) {
    //   window.initAvailableSlotFetch?.();
    // }
  }

  function toggleFields(missing, required) {
    METADATA_KEYS.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const currentVal = getVal(`#${id}`);
      const shouldShow = required.includes(id) && (!currentVal || missing.includes(id));
      el.style.display = shouldShow ? 'block' : 'none';
    });

    const addr = document.getElementById('address_fields');
    const showAddr = ADDRESS_FIELD_IDS.some(id => required.includes(id) && (!getVal(`#${id}`) || missing.includes(id)));
    if (addr) addr.style.display = showAddr ? 'block' : 'none';
  }

  async function submitContact(e) {
    e.preventDefault();
    const currentStatus = window.formState || {};
    const missing = currentStatus.missing_fields || METADATA_KEYS;
    const metadata = Object.fromEntries(
      missing.map(k => [k, getVal(`#${k}`)]).filter(([, v]) => v && v.trim())
    );
    const payload = {
      email: getVal('#clt_email'),
      meeting_type: getVal('#clt_meetingtype'),
      metadata,
      write_if_valid: true
    };
    const { contact_id, status } = await fetchJSON('/api/validate_contact', payload, 'POST');
    if (!contact_id) {
      setVal('#clt_ready', 'false');
      alert('Kunde inte skapa eller uppdatera kontakt. Kontrollera att alla fält är korrekt ifyllda.');
      return;
    }
    setVal('#clt_contact_id', contact_id);
    if (!window.formState) window.formState = {};
    window.formState.contact_id = contact_id;
    window.formState.email = getVal('#clt_email');
    window.formState.meeting_type = getVal('#clt_meetingtype');
    window.formState.meeting_length = getVal('#clt_meetinglength');
    setVal('#clt_ready', 'true');
    checkReady();
    if (getVal('#clt_ready') === 'true' && getVal('#clt_contact_id')) {
      window.initAvailableSlotFetch?.();
      hideContactForm();
    }
  }

  // Hantera alla tre status: new_customer, incomplete, existing_customer
  function updateSubmitButton(status, missing) {
    const btn = document.getElementById('contact-update-button');
    if (!btn) return;
    if (status === 'new_customer') {
      btn.value = btn.textContent = 'Skapa';
      btn.style.display = 'block';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.visibility = 'visible';
    } else if (status === 'incomplete') {
      btn.value = btn.textContent = 'Uppdatera';
      btn.style.display = 'block';
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
      btn.style.visibility = 'visible';
    } else if (status === 'existing_customer') {
      btn.style.display = 'none';
    }
    // btn.disabled = true; // Disabled moved to checkReady
  }

  function checkReady() {
    const allCltFilled = ['#clt_email', '#clt_meetingtype', '#clt_meetinglength'].every(id => {
      const el = document.querySelector(id);
      return el && typeof el.value === 'string' && el.value.trim();
    });
    const type = getVal('#clt_meetingtype');
    const required = (bookingSettings?.required_fields?.[type] || []);
    console.log('🧪 Kontroll checkReady – required:', required);
    const allRequiredFilled = required.every(id => {
      const el = document.getElementById(id);
      return el && typeof el.value === 'string' && el.value.trim();
    });
    // Removed clt_contact_id requirement from isReady
    const isReady = allCltFilled && allRequiredFilled;
    setVal('#clt_ready', isReady ? 'true' : 'false');
    const btn = document.getElementById('contact-update-button');
    if (btn) btn.disabled = !isReady;
  }

  function resetState() {
    ['#clt_ready', '#clt_meetingtype', '#clt_meetinglength', '#clt_contact_id'].forEach(id => setVal(id, ''));
  }

  function getVal(sel) {
    const el = document.querySelector(sel);
    return el ? (el.type === 'radio' ? (el.checked ? el.value : '') : (typeof el.value === 'string' ? el.value.trim() : '')) : '';
  }

  function setVal(sel, val) {
    const el = document.querySelector(sel);
    if (el) el.value = val;
  }

  async function fetchJSON(url, body, method = 'GET') {
    const res = await fetch('https://macspotbackend.azurewebsites.net' + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(await res.text());
    try {
      const text = await res.clone().text();
    } catch (err) {
    }
    return await res.json();
  }

  function createRadio(name, value, label, onChange) {
    const div = document.createElement('div');
    const labelEl = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.addEventListener('change', onChange);
    labelEl.appendChild(input);
    const span = document.createElement('span');
    span.textContent = ` ${label}`;
    labelEl.appendChild(span);
    div.appendChild(labelEl);
    return div;
  }

function hideContactForm() {
  METADATA_KEYS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  const sections = ['contact-update-button', 'meeting_type_group', 'time_slot_group'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}
</script>
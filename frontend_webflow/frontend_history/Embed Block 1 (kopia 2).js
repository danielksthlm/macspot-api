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
    console.log('📦 SETTINGS:', bookingSettings);
    document.getElementById('clt_ready').value = 'false';
    document.querySelector('#booking_email')?.addEventListener('input', onEmailInput);
    // Ensure checkReady runs when any metadata field is typed in
    METADATA_KEYS.forEach(id => {
      document.getElementById(id)?.addEventListener('input', checkReady);
    });
    // Removed live validateContact() on metadata field input to prevent overwrites while typing.
    // METADATA_KEYS.concat('clt_contact_id').forEach(id => {
    //   document.getElementById(id)?.addEventListener('input', validateContact);
    // });
    document.getElementById('contact-update-button')?.addEventListener('click', submitContact);
  });

  function onEmailInput() {
    resetState();
    const email = getVal('#booking_email');
    setVal('#clt_email', email);
    checkTriggerValidateContact();
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
        checkTriggerValidateContact();
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
        checkTriggerValidateContact();
      }));
    });
    document.getElementById('time_slot_group').style.display = 'block';
  }


  async function validateContact() {
    const email = getVal('#booking_email'), type = getVal('#clt_meetingtype');
    if (!email.includes('@') || !type) return;
    const payload = { email, meeting_type: type };
    const response = await fetchJSON('/api/validate_contact', payload, 'POST');
    const { contact_id, missing_fields, status, metadata } = response;
    window.formState = {
      status,
      contact_id,
      email: metadata?.email || email,
      meeting_type: metadata?.meeting_type || type,
      meeting_length: metadata?.meeting_length || getVal('#clt_meetinglength')
    };
    console.log('🧪 validateContact() contact_id:', contact_id);
    if (contact_id) {
      setVal('#clt_contact_id', contact_id);
    }
    if (metadata) {
      if (metadata.email) setVal('#clt_email', metadata.email);
      if (metadata.meeting_type) setVal('#clt_meetingtype', metadata.meeting_type);
      if (metadata.meeting_length) setVal('#clt_meetinglength', String(metadata.meeting_length));
    }
    const baseRequired = bookingSettings?.required_fields?.base || [];
    const extraRequired = bookingSettings?.required_fields?.[type?.toLowerCase()] || [];
    const required = [...new Set([...baseRequired, ...extraRequired])];

    toggleFields(status, missing_fields || [], required, metadata || {});

    checkReady();
    console.log('📡 meeting_type vid validateContact():', getVal('#clt_meetingtype'));
    console.log('📡 meeting_length vid validateContact():', getVal('#clt_meetinglength'));
    console.log('📡 clt_ready vid validateContact():', getVal('#clt_ready'));

    if (status === 'existing_customer') {
      // Ensure meeting_length is set before triggering initAvailableSlotFetch
      if (getVal('#clt_ready') === 'true' && contact_id) {
        console.log('📡 clt_ready är true – triggar initAvailableSlotFetch');
        window.initAvailableSlotFetch?.({
          email: getVal('#clt_email'),
          meeting_type: getVal('#clt_meetingtype'),
          meeting_length: getVal('#clt_meetinglength'),
          contact_id: getVal('#clt_contact_id')
        });
      }
    }
  }

  function toggleFields(status, missing_fields, required, metadata) {
    const containerVisibleFields = new Set();

    if (status === 'new_customer') {
      required.forEach(id => containerVisibleFields.add(id));
    } else if (status === 'incomplete') {
      missing_fields.forEach(id => containerVisibleFields.add(id));
      required.forEach(id => containerVisibleFields.add(id));
    }

    METADATA_KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (!el) return;
      const shouldShow = containerVisibleFields.has(key);
      el.style.display = shouldShow ? 'block' : 'none';
      if (shouldShow && metadata[key] !== undefined) {
        setVal(`#${key}`, metadata[key]);
      }
    });

    const btn = document.getElementById('contact-update-button');
    if (btn) {
      if (status === 'new_customer') {
        btn.value = btn.textContent = 'Skapa';
        btn.style.display = 'block';
      } else if (status === 'incomplete') {
        btn.value = btn.textContent = 'Uppdatera';
        btn.style.display = 'block';
      } else {
        btn.style.display = 'none';
      }
    }

    const addr = document.getElementById('address_fields');
    if (addr) {
      const showAddr = ADDRESS_FIELD_IDS.some(id => containerVisibleFields.has(id));
      addr.style.display = showAddr ? 'block' : 'none';
    }
  }

  async function submitContact(e) {
    e.preventDefault();
    const status = window.formState?.status || '';
    if (status !== 'new_customer' && status !== 'incomplete') {
      console.warn('🛑 submitContact called but status is neither new_customer nor incomplete:', status);
      return;
    }
    // Only include visible and filled metadata fields
    const visible = METADATA_KEYS.filter(k => {
      const el = document.getElementById(k);
      return el && (el.offsetParent !== null || el.offsetHeight > 0);
    });
    const metadata = Object.fromEntries(
      visible.map(k => [k, getVal(`#${k}`)]).filter(([, v]) => v && v.trim())
    );
    const payload = {
      email: getVal('#clt_email'),
      meeting_type: getVal('#clt_meetingtype'),
      metadata,
      write_if_valid: true
    };
    const { contact_id, status: newStatus } = await fetchJSON('/api/validate_contact', payload, 'POST');
    if (!contact_id) {
      setVal('#clt_ready', 'false');
      alert('Kunde inte skapa eller uppdatera kontakt. Kontrollera att alla fält är korrekt ifyllda.');
      return;
    }
    setVal('#clt_contact_id', contact_id);
    window.formState = {
      contact_id,
      email: getVal('#clt_email'),
      meeting_type: getVal('#clt_meetingtype'),
      meeting_length: getVal('#clt_meetinglength'),
      status: newStatus || status
    };

    checkReady();

    if (getVal('#clt_ready') === 'true' && getVal('#clt_contact_id')) {
      // After successful creation or update, initAvailableSlotFetch and hide form
      window.initAvailableSlotFetch?.({
        email: getVal('#clt_email'),
        meeting_type: getVal('#clt_meetingtype'),
        meeting_length: getVal('#clt_meetinglength'),
        contact_id: getVal('#clt_contact_id')
      });
      hideContactForm();
    }
  }

  // updateSubmitButton removed; logic now unified in checkReady()

  function checkReady() {
    const status = window.formState?.status || '';
    console.log('🧪 checkReady → email:', getVal('#clt_email'));
    console.log('🧪 checkReady → meeting_type:', getVal('#clt_meetingtype'));
    console.log('🧪 checkReady → meeting_length:', getVal('#clt_meetinglength'));
    console.log('🧪 formState.status:', window.formState?.status);
    if (status === 'existing_customer') {
      setVal('#clt_ready', 'true');
      console.log('🧪 checkReady – status:', status, '| clt_ready: true (forced for existing_customer)');
      return;
    }
    const allCltFilled = ['#clt_email', '#clt_meetingtype', '#clt_meetinglength'].every(id => {
      const el = document.querySelector(id);
      return el && typeof el.value === 'string' && el.value.trim();
    });
    const type = getVal('#clt_meetingtype');
    // Use the same required fields logic as in validateContact()
    const baseRequired = bookingSettings?.required_fields?.base || [];
    const extraRequired = bookingSettings?.required_fields?.[type?.toLowerCase()] || [];
    const required = [...new Set([...baseRequired, ...extraRequired])];
    console.log('🧪 Kontroll checkReady – required:', required);
    console.log('🧪 Kontroll checkReady – baseRequired:', baseRequired);
    console.log('🧪 Kontroll checkReady – extraRequired:', extraRequired);
    const allRequiredFilled = required.every(id => {
      const el = document.getElementById(id);
      const val = getVal(`#${id}`);
      console.log('🧪 checkReady field:', id, 'value:', val);
      return typeof val === 'string' && val.trim();
    });
    // Removed clt_contact_id requirement from isReady
    const isReady = allCltFilled && allRequiredFilled;
    setVal('#clt_ready', isReady ? 'true' : 'false');
    console.log('🧪 clt_ready just set:', isReady);
    const btn = document.getElementById('contact-update-button');
    if (btn) {
      if (isReady && status === 'existing_customer') {
        btn.style.display = 'none';
        btn.style.visibility = 'hidden';
      } else if (status === 'incomplete' || status === 'new_customer') {
        btn.value = btn.textContent = status === 'new_customer' ? 'Skapa' : 'Uppdatera';
        btn.style.display = 'block';
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
        btn.style.visibility = 'visible';
        btn.disabled = !isReady;
      } else {
        btn.style.display = 'none';
        btn.style.visibility = 'hidden';
      }
    }
    console.log('🧪 checkReady – status:', status, '| clt_ready:', isReady);
  }

  function resetState() {
    ['#clt_ready', '#clt_meetingtype', '#clt_meetinglength', '#clt_contact_id'].forEach(id => setVal(id, ''));
    console.log('🧪 clt_ready reset to empty string');
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
    const noCacheUrl = url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    const res = await fetch('https://macspotbackend.azurewebsites.net' + noCacheUrl, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(await res.text());
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
  // Hide only the metadata fields
  METADATA_KEYS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
  // Only hide the contact update button, keep meeting_type_group and time_slot_group visible
  const sections = ['contact-update-button'];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function groupSlotsByDay(slots) {
  return slots.reduce((acc, slot) => {
    const day = slot.slot_local?.slice(0, 10);
    if (!acc[day]) acc[day] = [];
    acc[day].push(slot);
    return acc;
  }, {});
}

function checkTriggerValidateContact() {
  const email = getVal('#booking_email');
  const type = getVal('#clt_meetingtype');
  const length = getVal('#clt_meetinglength');
  if (email.includes('@') && type && length) {
    validateContact();
  }
}
</script>
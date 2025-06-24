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
    bookingSettings = await MacSpotUtils.fetchJSON('/api/booking_settings');
    console.log('📦 SETTINGS:', bookingSettings);
    MacSpotUtils.setVal('#clt_ready', 'false');
    document.querySelector('#booking_email')?.addEventListener('input', onEmailInput);
    // (Removed: Ensure checkReady runs when any metadata field is typed in)
    // Also update MacSpotUtils.setVal for each metadata field on input, and sync DOM value
    METADATA_KEYS.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          MacSpotUtils.setVal(`#${id}`, el.value);
          // 💡 Uppdatera också el.value för att säkerställa att DOM är synkad
          el.setAttribute('value', el.value);
          checkReady();
        });
      }
    });
    // Removed live validateContact() on metadata field input to prevent overwrites while typing.
    // METADATA_KEYS.concat('clt_contact_id').forEach(id => {
    //   document.getElementById(id)?.addEventListener('input', validateContact);
    // });
    const contactButton = document.getElementById('contact-update-button');
    if (contactButton) {
      contactButton.addEventListener('click', submitContact);
    }

  });

  function onEmailInput() {
    MacSpotUtils.resetContactState();
    const email = MacSpotUtils.getVal('#booking_email');
    MacSpotUtils.setVal('#clt_email', email);
    checkTriggerValidateContact();
    if (!email.includes('@')) return;
    loadMeetingTypes();
  }

  async function loadMeetingTypes() {
    const { types, lengths } = await MacSpotUtils.fetchJSON('/api/meeting_types');
    window.lengths = Object.fromEntries(Object.entries(lengths).map(([k, v]) => [k.toLowerCase(), v]));
    const container = document.getElementById('meeting_type_select');
    container.innerHTML = '';
    types.forEach(type => {
      const value = type.toLowerCase();
      container.appendChild(MacSpotUtils.createRadio('meeting_type', value, displayNames[value], () => {
        MacSpotUtils.setVal('#clt_meetingtype', value);
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
      container.appendChild(MacSpotUtils.createRadio('meeting_length', length, `${length} min`, () => {
        MacSpotUtils.setVal('#clt_meetinglength', String(length));
        document.querySelector('#clt_meetinglength')?.setAttribute('value', String(length));
        console.log('🧪 DEBUG set clt_meetinglength to:', length);
        checkTriggerValidateContact();
      }));
    });
    document.getElementById('time_slot_group').style.display = 'block';
  }


  async function validateContact() {
    const email = MacSpotUtils.getVal('#booking_email'), type = MacSpotUtils.getVal('#clt_meetingtype');
    if (!email.includes('@') || !type) return;
    const payload = { email, meeting_type: type };
    const response = await MacSpotUtils.fetchJSON('/api/validate_contact', payload, 'POST');
    const { contact_id, missing_fields, status, metadata, ccrelation_metadata } = response;
    console.log('📦 missing_fields:', missing_fields);
    console.log('📦 metadata:', metadata);
    window.formState = {
      status,
      contact_id,
      email: ccrelation_metadata?.email || email,
      meeting_type: metadata?.meeting_type || type,
      meeting_length: metadata?.meeting_length || MacSpotUtils.getVal('#clt_meetinglength'),
      metadata,
      ccrelation_metadata
    };
    const baseRequired = bookingSettings?.required_fields?.base || [];
    const extraRequired = bookingSettings?.required_fields?.[type?.toLowerCase()] || [];
    const required = [...new Set([...baseRequired, ...extraRequired])];
    console.log('🧪 validateContact() contact_id:', contact_id);
    if (contact_id) {
      MacSpotUtils.setVal('#clt_contact_id', contact_id);
    }

    // Move toggleFields logic up first to show necessary fields
    toggleFields(status, missing_fields || [], required, metadata || {});

    // no additional metadata autofill here — only toggleFields controls visibility and population

    checkReady();
    console.log('📡 meeting_type vid validateContact():', MacSpotUtils.getVal('#clt_meetingtype'));
    console.log('📡 meeting_length vid validateContact():', MacSpotUtils.getVal('#clt_meetinglength'));
    console.log('📡 clt_ready vid validateContact():', MacSpotUtils.getVal('#clt_ready'));

    if (status === 'existing_customer') {
      // Ensure meeting_length is set before triggering initAvailableSlotFetch
      if (MacSpotUtils.getVal('#clt_ready') === 'true' && contact_id) {
        console.log('📡 clt_ready är true – triggar initAvailableSlotFetch');
        window.initAvailableSlotFetch?.({
          email: ccrelation_metadata?.email || email,
          meeting_type: MacSpotUtils.getVal('#clt_meetingtype'),
          meeting_length: MacSpotUtils.getVal('#clt_meetinglength'),
          contact_id: MacSpotUtils.getVal('#clt_contact_id')
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
    }

    METADATA_KEYS.forEach(key => {
      const el = document.getElementById(key);
      if (!el) return;
      const shouldShow = containerVisibleFields.has(key);
      if (!shouldShow) {
        el.style.display = 'none';
        MacSpotUtils.setVal(`#${key}`, ''); // Clear visible DOM field if not shown
      } else {
        el.style.display = 'block';
        if (missing_fields?.includes(key)) {
          const val = metadata?.[key];
          if (typeof val === 'string' && val.trim()) {
            MacSpotUtils.setVal(`#${key}`, val);
          } else {
            MacSpotUtils.setVal(`#${key}`, '');
          }
        } else {
          MacSpotUtils.setVal(`#${key}`, ''); // Hide backend data from being shown
        }
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
    if (!window.formState) {
      console.log('🛠 DEBUG submitContact start – current formState:', window.formState);
      console.warn('🛑 submitContact avbruten – formState saknas');
      return;
    }
    const status = window.formState?.status || '';
    if (status !== 'new_customer' && status !== 'incomplete') {
      console.warn('🛑 submitContact called but status is neither new_customer nor incomplete:', status);
      return;
    }
    // Only include visible metadata fields, convert empty strings to null, fallback to formState.metadata if needed
    const visible = METADATA_KEYS.filter(k => {
      const el = document.getElementById(k);
      return el && (el.offsetParent !== null || el.offsetHeight > 0);
    });
    const metadata = Object.fromEntries(
      visible.map(k => {
        const domVal = MacSpotUtils.getVal(`#${k}`);
        const fallbackVal = window.formState?.metadata?.[k];
        const chosenVal = (domVal && domVal.trim()) ? domVal : (fallbackVal && fallbackVal.trim() ? fallbackVal : null);
        return [k, chosenVal];
      })
    );
    console.log('🧪 Submitting metadata:', metadata);
    const payload = {
      email: MacSpotUtils.getVal('#clt_email'),
      meeting_type: MacSpotUtils.getVal('#clt_meetingtype'),
      metadata,
      write_if_valid: true
    };
    const { contact_id, status: newStatus } = await MacSpotUtils.fetchJSON('/api/validate_contact', payload, 'POST');
    if (!contact_id) {
      MacSpotUtils.setVal('#clt_ready', 'false');
      alert('Kunde inte skapa eller uppdatera kontakt. Kontrollera att alla fält är korrekt ifyllda.');
      return;
    }
    MacSpotUtils.setVal('#clt_contact_id', contact_id);

    window.formState = {
      contact_id,
      email: window.formState?.ccrelation_metadata?.email || MacSpotUtils.getVal('#clt_email'),
      meeting_type: MacSpotUtils.getVal('#clt_meetingtype'),
      meeting_length: MacSpotUtils.getVal('#clt_meetinglength'),
      status: newStatus || status,
      ccrelation_metadata: window.formState?.ccrelation_metadata
    };

    checkReady();
    await validateContact();

    if (MacSpotUtils.getVal('#clt_ready') === 'true' && MacSpotUtils.getVal('#clt_contact_id')) {
      // After successful creation or update, initAvailableSlotFetch and hide form
      console.log('✅ Triggering initAvailableSlotFetch after successful submitContact');
      window.initAvailableSlotFetch?.({
        email: MacSpotUtils.getVal('#clt_email'),
        meeting_type: MacSpotUtils.getVal('#clt_meetingtype'),
        meeting_length: MacSpotUtils.getVal('#clt_meetinglength'),
        contact_id: MacSpotUtils.getVal('#clt_contact_id')
      });
      hideContactForm();
    }
  }

  // updateSubmitButton removed; logic now unified in checkReady()

  function checkReady() {
    const status = window.formState?.status || '';
    console.log('🧪 checkReady → email:', MacSpotUtils.getVal('#clt_email'));
    console.log('🧪 checkReady → meeting_type:', MacSpotUtils.getVal('#clt_meetingtype'));
    console.log('🧪 checkReady → meeting_length:', MacSpotUtils.getVal('#clt_meetinglength'));
    console.log('🧪 formState.status:', window.formState?.status);
    if (status === 'existing_customer') {
      MacSpotUtils.setVal('#clt_ready', 'true');
      console.log('🧪 checkReady – status:', status, '| clt_ready: true (forced for existing_customer)');
      return;
    }
    const allCltFilled = ['#clt_email', '#clt_meetingtype', '#clt_meetinglength'].every(id => {
      const el = document.querySelector(id);
      return el && typeof el.value === 'string' && el.value.trim();
    });
    const type = MacSpotUtils.getVal('#clt_meetingtype');
    // Use the same required fields logic as in validateContact()
    const baseRequired = bookingSettings?.required_fields?.base || [];
    const extraRequired = bookingSettings?.required_fields?.[type?.toLowerCase()] || [];
    const required = [...new Set([...baseRequired, ...extraRequired])];
    console.log('🧪 Kontroll checkReady – required:', required);
    console.log('🧪 Kontroll checkReady – baseRequired:', baseRequired);
    console.log('🧪 Kontroll checkReady – extraRequired:', extraRequired);
    console.log('🧪 DEBUG current values:', required.map(id => [id, MacSpotUtils.getVal(`#${id}`)]));
    console.log('🧪 DEBUG checkReady with fallback to formState.metadata where necessary');
    const allRequiredFilled = required.every(id => {
      const el = document.getElementById(id);
      const val = MacSpotUtils.getVal(`#${id}`) || (window.formState?.metadata?.[id] ?? '');
      console.log('🧪 checkReady field:', id, 'value:', val);
      return typeof val === 'string' && val.trim();
    });
    // Removed clt_contact_id requirement from isReady
    const isReady = allCltFilled && allRequiredFilled;
    MacSpotUtils.setVal('#clt_ready', isReady ? 'true' : 'false');
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
    // 🧪 DEBUG: Logga elementvärden för alla required-fält
    console.log('🧪 DEBUG element values:');
    required.forEach(id => {
      const el = document.getElementById(id);
      if (!el) {
        console.warn(`❗ Saknar DOM-element för id "${id}"`);
      } else {
        console.log(`🔍 ${id} =`, el.value);
      }
    });
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
  const email = MacSpotUtils.getVal('#booking_email');
  const type = MacSpotUtils.getVal('#clt_meetingtype');
  const length = MacSpotUtils.getVal('#clt_meetinglength');
  if (email.includes('@') && type && length) {
    validateContact();
  }
}
</script>
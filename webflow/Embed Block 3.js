<script>
// --- Block 3 ---
// Denna kod hanterar vad som sker när användaren klickar på “Boka möte”.
// Förutsättning: Alla fält (email, typ, längd, datum, tid) finns i formState.
// Resultat: POST mot /api/book_meeting + visuell feedback.

// Säkerställ att knappen är korrekt konfigurerad vid sidladdning
const submitBtn = document.getElementById('contact-update-button');
if (submitBtn) {
  submitBtn.textContent = 'Boka';
  submitBtn.style.display = 'none'; // Dold tills giltigt val görs
}

// Lyssna på val av tid för att aktivera knappen
document.querySelectorAll('.timeitems input[type="radio"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const wrapper = document.getElementById('calendar_time_wrapper');
    const btn = document.getElementById('contact-update-button');
    const label = radio.closest('.timeitems')?.querySelector('.time-label')?.textContent || radio.value;
    if (wrapper && btn && radio.checked) {
      window.formState = window.formState || {};
      window.formState.selected_time = label;
      btn.textContent = 'Boka';
      btn.style.display = 'block';
    }
  });
});

document.getElementById('contact-update-button')?.addEventListener('click', async () => {
  const btn = document.getElementById('contact-update-button');
  if (!window.formState?.clt_ready) {
    console.warn('❌ Bokningsdata ofullständig:', window.formState);
    alert('Vänligen fyll i alla uppgifter innan du bokar.');
    return;
  }

  // Fyll metadata från inputs om saknas
  const fieldMap = {
    first_name: 'clt_first_name',
    last_name: 'clt_last_name',
    phone: 'clt_phone',
    company: 'clt_company',
    address: 'clt_address',
    postal_code: 'clt_postal_code',
    city: 'clt_city',
    country: 'clt_country'
  };

  const contact = window.contacts?.find(c => c.booking_email === window.formState.email);
  window.formState.metadata = window.formState.metadata || {};

  Object.entries(fieldMap).forEach(([key, id]) => {
    const el = document.querySelector(`[id="${id}"], [name="${id}"]`);
    let value = '';
    if (el) {
      value = (el?.value ?? el?.textContent ?? '').trim();
    }
    if (!value && contact?.metadata?.[key]) {
      value = contact.metadata[key];
    }
    if (!window.formState.metadata[key] && value) {
      window.formState.metadata[key] = value;
    }
  });

  // Om metadata är tomt, försök fylla från window.contacts på nytt
  if (Object.values(window.formState.metadata || {}).every(v => !v)) {
    const contact = window.contacts?.find(c => c.booking_email === window.formState.email);
    if (contact?.metadata) {
      window.formState.metadata = { ...contact.metadata };
    }
  }

  const requiredFields = ['first_name', 'last_name', 'phone'];
  const digitalTypes = ["Zoom", "FaceTime", "Teams"];
  const isDigital = digitalTypes.includes(window.formState.meeting_type);
  if (!isDigital) {
    requiredFields.push('company', 'address', 'postal_code', 'city', 'country');
  }

  const missing = requiredFields.filter(f => !window.formState.metadata?.[f]);
  if (missing.length > 0) {
    console.warn('❌ Bokningsdata ofullständig:', window.formState);
    alert('Vänligen fyll i alla uppgifter innan du bokar.\n\nSaknas: ' + missing.join(', '));
    return;
  }

  const payload = {
    email: window.formState.email,
    meeting_type: window.formState.meeting_type,
    meeting_length: window.formState.meeting_length,
    meeting_date: window.formState.selected_date,
    meeting_time: window.formState.selected_time,
    metadata: window.formState.metadata
  };

  console.log('📤 Skickar bokning:', payload);
  document.getElementById('clt_meetingdate')?.setAttribute('value', window.formState.selected_date);
  document.getElementById('clt_meetingtime')?.setAttribute('value', window.formState.selected_time);

  btn.disabled = true;
  btn.textContent = 'Skickar...';

  try {
    const res = await fetch('https://macspotbackend.azurewebsites.net/api/book_meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      console.log('✅ Bokning bekräftad:', data);
      btn.textContent = '✅ Bokad!';
      setTimeout(() => {
        btn.textContent = 'Boka';
        btn.disabled = false;
      }, 3000);
    } else {
      console.error('❌ Bokningsfel:', data);
      alert('Det gick inte att boka. Försök igen senare.');
      btn.textContent = 'Boka';
      btn.disabled = false;
    }
  } catch (err) {
    console.error('❌ Nätverksfel:', err);
    alert('Något gick fel med uppkopplingen.');
    btn.textContent = 'Boka';
    btn.disabled = false;
  }
});
</script>
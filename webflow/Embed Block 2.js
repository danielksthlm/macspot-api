<script>
const calendarWrapper = document.getElementById('calendar-wrapper');
const timesWrapper = document.getElementById('times-wrapper');

let selectedDate = null;
let selectedSlot = null;
let availableSlots = [];

function validateAndRenderCustomerFields() {
  // Antag att denna funktion redan innehåller valideringslogik för fälten email, meeting_type etc.
  // När valideringen är lyckad och alla fält har innehåll, sätt window.formState:
  const email = document.getElementById('email')?.value || '';
  const meetingType = document.getElementById('meeting_type')?.value || '';
  if (!email || !meetingType) return; // Exempel på enkel kontroll

  window.formState = {
    email,
    meeting_type: meetingType,
    meeting_length: 90,
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
}

function renderCalendar(monthOffset = 0) {
  const today = new Date();
  const current = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const year = current.getFullYear();
  const month = current.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const calendar = document.createElement('table');
  calendar.className = 'calendar-grid';

  const header = document.createElement('tr');
  ['S', 'M', 'T', 'W', 'T', 'F', 'L'].forEach(day => {
    const th = document.createElement('th');
    th.textContent = day;
    header.appendChild(th);
  });
  calendar.appendChild(header);

  let row = document.createElement('tr');
  for (let i = 0; i < firstDay; i++) {
    row.appendChild(document.createElement('td'));
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dayStr = date.toISOString().split('T')[0];
    const td = document.createElement('td');
    td.textContent = day;
    td.className = 'calendar-day';

    const hasSlot = availableSlots.some(slot => slot.slot_iso.startsWith(dayStr));
    if (hasSlot) {
      td.classList.add('available');
      td.onclick = () => {
        selectedDate = dayStr;
        highlightDate(dayStr);
        renderTimes(dayStr);
      };
    }

    row.appendChild(td);
    if ((firstDay + day) % 7 === 0 || day === daysInMonth) {
      calendar.appendChild(row);
      row = document.createElement('tr');
    }
  }

  calendarWrapper.innerHTML = '';
  calendarWrapper.appendChild(calendar);
}

function highlightDate(dayStr) {
  document.querySelectorAll('.calendar-day').forEach(td => {
    td.classList.remove('selected');
    if (td.textContent.length && dayStr.endsWith(td.textContent.padStart(2, '0'))) {
      td.classList.add('selected');
    }
  });
}

function renderTimes(dayStr) {
  timesWrapper.innerHTML = '';
  selectedSlot = null;
  if (submitButton) submitButton.disabled = true;

  const slots = availableSlots.filter(slot => slot.slot_iso.startsWith(dayStr));
  slots.forEach(slot => {
    const button = document.createElement('button');
    const localTime = new Date(slot.slot_iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    button.textContent = localTime;
    button.className = 'time-slot';
    button.onclick = () => {
      document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
      button.classList.add('selected');
      selectedSlot = slot;
      if (submitButton) submitButton.disabled = false;
    };
    timesWrapper.appendChild(button);
  });
}

// Exponera funktion för att ta emot slots (anropas utifrån)
window.setAvailableSlots = function(slots) {
  availableSlots = slots;
  renderCalendar();
};

let submitButton;
document.addEventListener('DOMContentLoaded', () => {
  submitButton = document.getElementById('contact-update-button');
  if (!submitButton) {
    console.error('❌ Kan inte hitta contact-update-button i DOM:en!');
    return;
  }

  submitButton.onclick = async () => {
    if (!selectedSlot) return;
    submitButton.disabled = true;
    submitButton.textContent = 'Skickar...';

    const payload = {
      email: window.formState?.email || '',
      meeting_type: window.formState?.meeting_type || '',
      meeting_length: window.formState?.meeting_length || 90,
      slot_iso: selectedSlot.slot_iso,
      metadata: window.formState?.metadata || {}
    };

    try {
      const res = await fetch('https://macspotbackend.azurewebsites.net/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok) {
        submitButton.textContent = 'Bokat!';
      } else {
        submitButton.textContent = 'Fel vid bokning';
        console.error(data);
      }
    } catch (err) {
      console.error('Bokning misslyckades:', err);
      submitButton.textContent = 'Fel vid nätverk';
    }
  };
});
</script>
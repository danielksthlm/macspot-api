<script>
  // Hämtar element via ID för tydlighet och säkerhet (ingen klassanvändning)
  async function loadMeetingTypes() {
    try {
      const response = await fetch('https://macspotbackend.azurewebsites.net/api/meeting_types');
      const meetingTypes = await response.json();
      console.log("✅ Mötestyper hämtade:", meetingTypes);

      const labels = {
        Zoom: "Digitalt via Zoom",
        FaceTime: "Digitalt via FaceTime",
        Teams: "Digitalt via Teams",
        atClient: "Vi ses hos dig",
        atOffice: "Vi ses på vårt kontor i Stockholm"
      };

      const meetingTypeSelect = document.getElementById('meeting_type_select');
      meetingTypeSelect.innerHTML = '';

      meetingTypes.forEach((type, index) => {
        const label = document.createElement('label');
        label.className = 'radio-button-items w-radio';

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'meeting_type';
        input.value = type;
        input.id = `meeting_type_${index}`;
        input.className = 'w-form-formradioinput w-radio-input';
        input.setAttribute('data-name', type);

        const span = document.createElement('span');
        span.className = 'w-form-label';
        span.setAttribute('for', `meeting_type_${index}`);
        span.textContent = labels[type] || type; // Visa översatt etikett om den finns

        input.addEventListener('change', validateContact);

        label.appendChild(input);
        label.appendChild(span);

        meetingTypeSelect.appendChild(label);
      });
    } catch (error) {
      console.error('❌ Kunde inte ladda mötestyper:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', loadMeetingTypes);
</script>
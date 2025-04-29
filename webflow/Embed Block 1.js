<script>
  async function loadMeetingTypes() {
    try {
      const response = await fetch('https://macspotbackend.azurewebsites.net/api/meeting_types');
      const meetingTypes = await response.json();
      console.log("✅ Mötestyper hämtade:", meetingTypes);

      const meetingTypeSelect = document.getElementById('meeting_type_select');
      meetingTypeSelect.innerHTML = '';

      meetingTypes.forEach((type, index) => {
        const wrapperDiv = document.createElement('div');
        wrapperDiv.className = 'Radio Button Wrapper'; // Webflow klass för wrapper

        const label = document.createElement('label');
        label.className = 'Radio Button Field'; // Webflow klass för label

        const input = document.createElement('input');
        input.type = 'radio';
        input.name = 'meeting_type';
        input.value = type;
        input.id = `meeting_type_${index}`;
        input.className = 'radio-button'; // Webflow klass för själva radio-knappen (valfritt)

        input.addEventListener('change', validateContact); // Viktigt: koppla validateContact till varje radio-knapp

        label.appendChild(input);
        label.appendChild(document.createTextNode(' ' + type));
        wrapperDiv.appendChild(label);
        meetingTypeSelect.appendChild(wrapperDiv);
      });
    } catch (error) {
      console.error('❌ Kunde inte ladda mötestyper:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', loadMeetingTypes);
</script>
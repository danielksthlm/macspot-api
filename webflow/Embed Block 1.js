<script>
  async function loadMeetingTypes() {
    try {
      const response = await fetch('https://macspotbackend.azurewebsites.net/api/meeting_types');
      const meetingTypes = await response.json();
      console.log("✅ Mötestyper hämtade:", meetingTypes);

      const meetingTypeSelect = document.getElementById('meeting_type_select');
      meetingTypeSelect.innerHTML = '';

      meetingTypes.forEach((type, index) => {
        const label = document.createElement('label');
        label.innerHTML = `<input type="radio" name="meeting_type" value="${type}" id="meeting_type_${index}"> ${type}`;
        meetingTypeSelect.appendChild(label);
      });
    } catch (error) {
      console.error('❌ Kunde inte ladda mötestyper:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', loadMeetingTypes);
</script>
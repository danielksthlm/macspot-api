<script type="text/javascript">
async function loadMeetingTypes() {
  const container = document.getElementById("meeting_type_group");
  if (!container) {
    console.error("🛑 Container meeting_type_group hittades inte!");
    return;
  }

  try {
    const res = await fetch("https://macspotbackend.azurewebsites.net/api/meetingTypes");
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const types = await res.json();
    console.log("✅ Mötestyper hämtade:", types);

    container.innerHTML = "";
    types.forEach(({ value, label }) => {
      console.log(`➕ Lägger till meeting_type: ${value}`);
      const wrapper = document.createElement("label");
      wrapper.className = "w-radio";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "meeting_type";
      input.value = value;
      input.className = "w-form-formradioinput w-radio-input";

      const span = document.createElement("span");
      span.className = "w-form-label";
      span.textContent = label;

      wrapper.appendChild(input);
      wrapper.appendChild(span);
      container.appendChild(wrapper);
    });

  } catch (err) {
    console.error("🛑 Misslyckades att ladda mötestyper:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadMeetingTypes);
</script>
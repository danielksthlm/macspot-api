<script type="text/javascript">
/**
 * Embed Block 1 – Dynamiskt ladda mötestyper till meeting_type_group
 */

async function loadMeetingTypes() {
  const container = document.getElementById("meeting_type_group");
  if (!container) return;

  try {
    const res = await fetch("https://macspotbackend.azurewebsites.net/api/meetingTypes");
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const types = await res.json();

    container.innerHTML = "";
    types.forEach(({ value, label }) => {
      const wrapper = document.createElement("label");
      wrapper.className = "radio-button-field w-radio";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "meeting_type";
      input.value = value;
      input.className = "w-form-formradioinput w-radio-input";

      const labelDiv = document.createElement("div");
      labelDiv.className = "paragraph radio-button-field";
      labelDiv.textContent = label;

      wrapper.appendChild(input);
      wrapper.appendChild(labelDiv);
      container.appendChild(wrapper);
    });

  } catch (err) {
    console.error("🛑 Misslyckades att ladda mötestyper:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadMeetingTypes);
</script>
<script type="text/javascript">
async function loadMeetingTypes() {
  const container = document.getElementById("meeting_type_group");
  if (!container) {
    console.error("🛑 Container meeting_type_group hittades inte!");
    return;
  }

  try {
    const res = await fetch("https://macspotbackend.azurewebsites.net/api/meeting_types");
    if (!res.ok) throw new Error(`Status: ${res.status}`);
    const types = await res.json();
    console.log("✅ Mötestyper hämtade:", types);

    // Skapa radioknappar
    const group = document.createElement("fieldset");
    group.id = "meeting_type_select";
    group.className = "radio-group";

    types.forEach((type, index) => {
      console.log(`➕ Lägger till meeting_type: ${type}`);

      const label = document.createElement("label");
      label.className = "radio-label";

      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "meeting_type";
      radio.value = type;
      radio.id = `meeting_type_${index}`;

      label.appendChild(radio);
      label.appendChild(document.createTextNode(" " + type));
      group.appendChild(label);
    });

    container.innerHTML = "";
    container.appendChild(group);

  } catch (err) {
    console.error("🛑 Misslyckades att ladda mötestyper:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadMeetingTypes);
</script>
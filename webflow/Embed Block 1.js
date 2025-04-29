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

    // Skapa <select>-element
    const select = document.createElement("select");
    select.name = "meeting_type";
    select.className = "w-select";

    types.forEach((type) => {
      console.log(`➕ Lägger till meeting_type: ${type}`);
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      select.appendChild(option);
    });

    container.innerHTML = "";
    container.appendChild(select);

  } catch (err) {
    console.error("🛑 Misslyckades att ladda mötestyper:", err);
  }
}

document.addEventListener("DOMContentLoaded", loadMeetingTypes);
</script>
/**
 * Embed Block 4 – Presenterar fm/em-tider
 * Kräver: JSON-data från /getAvailableSlots med { fm: [], em: [] }
 */

function renderSlots(slots) {
  const fmList = document.getElementById("slot-fm");
  const emList = document.getElementById("slot-em");

  fmList.innerHTML = "";
  emList.innerHTML = "";

  slots.fm.forEach(time => {
    const btn = document.createElement("button");
    btn.textContent = time;
    btn.className = "slot-button";
    btn.onclick = () => selectSlot(time);
    fmList.appendChild(btn);
  });

  slots.em.forEach(time => {
    const btn = document.createElement("button");
    btn.textContent = time;
    btn.className = "slot-button";
    btn.onclick = () => selectSlot(time);
    emList.appendChild(btn);
  });

  document.getElementById("calendar-slot-container")?.style.display = "block";
}

function selectSlot(time) {
  console.log("⏱️ Vald tid:", time);
  document.getElementById("selected_time").value = time;
}

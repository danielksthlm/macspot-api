  // --- Block 3 ---
  // Denna kod hanterar vad som sker när användaren klickar på “Boka möte”.
  // Förutsättning: Alla fält (email, typ, längd, datum, tid) finns i formState.
  // Resultat: POST mot /api/book_meeting + visuell feedback.
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const submitButton = document.getElementById('contact-update-button');
    if (!submitButton) return;

    submitButton.onclick = async (event) => {
      event.preventDefault();
      if (!window.formState) {
        alert('❗ Vänligen fyll i alla fält först.');
        return;
      }

      const {
        email,
        meeting_type,
        meeting_length,
        meeting_time,
        slot_iso,
        metadata
      } = window.formState;

      if (!metadata || Object.keys(metadata).length === 0) {
        alert('❗ Vänligen fyll i kontaktuppgifter innan bokning.');
        submitButton.disabled = false;
        submitButton.textContent = 'Boka möte';
        return;
      }

      if (!slot_iso) {
        alert('❗ Välj en tid i kalendern.');
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = 'Skickar...';

      try {
        const response = await fetch('https://macspotbackend.azurewebsites.net/api/book_meeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            meeting_type,
            meeting_length,
            meeting_time,
            slot_iso,
            metadata
          })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Kunde inte boka.');

        const confirmationEl = document.getElementById('booking-status');
        if (confirmationEl) {
          confirmationEl.textContent = '✅ Bokningen är genomförd!';
          confirmationEl.classList.add('booking-success');
          confirmationEl.classList.remove('booking-failed');

          // Rensa formState
          window.formState = {};

          // Alternativ visuell bekräftelse – scrolla till status eller visa popup
          confirmationEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Här kan även redirect eller reload ske vid behov
          // setTimeout(() => location.reload(), 3000);
        }

        submitButton.textContent = 'Bokat!';
        submitButton.disabled = true;

      } catch (err) {
        console.error('❌ Bokningen misslyckades:', err);
        alert('❌ Ett fel uppstod. Försök igen.');

        const confirmationEl = document.getElementById('booking-status');
        if (confirmationEl) {
          confirmationEl.textContent = '❌ Bokningen misslyckades – försök igen.';
          confirmationEl.classList.add('booking-failed');
          confirmationEl.classList.remove('booking-success');
        }

        submitButton.disabled = false;
        submitButton.textContent = 'Boka möte';
      }
    };
  });
</script>
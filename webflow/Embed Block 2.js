/ **
 * Embed Block 2 – Initierar kundflöde
 * Lyssnar på befintliga fält: #email + meeting_type-radio
 */
document.addEventListener("DOMContentLoaded", () => {
  const emailField = document.getElementById("email");
  const radios = document.querySelectorAll('input[name="meeting_type"]');

  const handleInput = () => {
    const email = emailField?.value.trim();
    const selected = Array.from(radios).find(r => r.checked)?.value;
    if (!email || !selected) return;

    console.log("📩 E-post:", email);
    console.log("📞 Mötestyp:", selected);

    // Kör kundflöde
    if (window.handleCustomerFlow) {
      window.handleCustomerFlow();
    }
  };

  emailField?.addEventListener("input", handleInput);
  radios.forEach(r => r.addEventListener("change", handleInput));
});
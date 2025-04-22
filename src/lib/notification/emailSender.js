// File: lib/notification/emailSender.js
import { sendMail } from "./sendMail.js";


async function sendConfirmationEmail(contact, booking) {
  console.log(`✉️ Skickar bekräftelse till ${contact.email}...`);
  console.log("📌 Möte:", {
    start: booking?.start_time,
    end: booking?.end_time,
    room: booking?.room_email,
    link: booking?.meeting_link
  });

  const subject = "Din bokning är bekräftad";
  const html = `
    <p>Hej ${contact.name || "kund"},</p>
    <p>Din bokning är bekräftad:</p>
    <ul>
      <li><strong>Tid:</strong> ${booking.start_time} – ${booking.end_time}</li>
      <li><strong>Plats:</strong> ${booking.room_email || "Digitalt möte"}</li>
      <li><strong>Länk:</strong> <a href="${booking.meeting_link}">${booking.meeting_link}</a></li>
    </ul>
    <p>Välkommen!</p>
  `;

  const fallbackEmail = process.env.MS_SENDER_EMAIL;

  // Skicka på riktigt om möjligt
  const emailToSend = (contact.email && contact.email !== "placeholder@example.com") ? contact.email : fallbackEmail;
  
  if (emailToSend && booking.meeting_link) {
    try {
      await sendMail(emailToSend, subject, html);
      console.log("✅ Mejlet skickat.");
    } catch (err) {
      console.warn("⚠️ Kunde inte skicka mejlet:", err.message);
    }
  }

  return true;
}

export { sendConfirmationEmail };
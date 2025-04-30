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
    <p>Hej ${contact.name || "vän"},</p>
    <p>Din bokning är bekräftad:</p>
    <ul>
      <li><strong>Tid:</strong> ${booking.start_time} – ${booking.end_time}</li>
      <li><strong>Plats:</strong> ${booking.room_email || "Digitalt möte"}</li>
      <li><strong>Länk:</strong> <a href="${booking.meeting_link}">${booking.meeting_link}</a></li>
    </ul>
    <p>Välkommen!</p>
  `;

  const fallbackEmail = process.env.MS_SENDER_EMAIL;
  const emailToSend = (contact.email && contact.email !== "placeholder@example.com") ? contact.email : fallbackEmail;

  if (!fallbackEmail) {
    console.warn("⚠️ Ingen fallback-email (MS_SENDER_EMAIL) definierad.");
  }

  if (emailToSend && booking.meeting_link) {
    try {
      await sendMail(emailToSend, subject, html);
      console.log("✅ Mejlet skickat.");
      return true;
    } catch (err) {
      console.warn("⚠️ Kunde inte skicka mejlet:", err.message);
      return false;
    }
  } else {
    console.warn("⚠️ Inget mejl skickat – saknar mottagare eller länk.");
    return false;
  }
}

export { sendConfirmationEmail };
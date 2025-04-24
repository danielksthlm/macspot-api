import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { ConfidentialClientApplication } from "@azure/msal-node";

const clientId = process.env.MS_CLIENT_ID;
const tenantId = process.env.MS_TENANT_ID;
const clientSecret = process.env.MS_CLIENT_SECRET;
const organizerEmail = process.env.MS_SENDER_EMAIL;

/**
 * Autentiserar mot Microsoft Graph med klientuppgifter.
 */
async function getGraphClient() {
  const config = {
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      clientSecret,
    },
  };

  const cca = new ConfidentialClientApplication(config);

  const tokenResponse = await cca.acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });

  const client = Client.init({
    authProvider: (done) => {
      done(null, tokenResponse.accessToken);
    },
  });

  return client;
}

/**
 * Skapar ett Teams-möte i användarens kalender via Microsoft Graph.
 */
async function createMicrosoft365Booking(booking, contact) {
  const client = await getGraphClient();

  const event = {
    subject: "Bokning via MacSpot",
    body: {
      contentType: "HTML",
      content: `Möte med ${contact.name}`,
    },
    start: {
      dateTime: booking.start_time,
      timeZone: "Europe/Stockholm",
    },
    end: {
      dateTime: booking.end_time,
      timeZone: "Europe/Stockholm",
    },
    attendees: [
      {
        emailAddress: {
          address: contact.email || organizerEmail,
          name: contact.name,
        },
        type: "required",
      },
    ],
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  };

  try {
    const created = await client
      .api(`/users/${organizerEmail}/events`)
      .post(event);

    return {
      success: true,
      eventId: created.id,
      meetingLink: created.onlineMeeting?.joinUrl || null,
    };
  } catch (err) {
    console.error("❌ Fel vid skapande av Microsoft-bokning:", err);
    return { success: false, error: err.message };
  }
}

export { createMicrosoft365Booking };

export async function getMicrosoftSchedule(start, end, email, settings) {
  const client = await getGraphClient();
  const userEmail = "daniel@klrab.se"; // Tillfällig fix

  console.log("🔍 Kollar MS-kalender för:", userEmail);

  try {
    const res = await client
      .api(`/users/${userEmail}/calendarView`)
      .query({
        startDateTime: new Date(start).toISOString(),
        endDateTime: new Date(end).toISOString(),
      })
      .header("Prefer", 'outlook.timezone="Europe/Stockholm"')
      .get();

    return res.value || [];
  } catch (err) {
    console.error("❌ Fel vid hämtning av Microsoft-schema:", err);
    return [];
  }
}

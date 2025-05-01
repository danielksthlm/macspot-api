import { Client } from "@microsoft/microsoft-graph-client";
import { ConfidentialClientApplication } from "@azure/msal-node";

const clientId = process.env.MS_CLIENT_ID;
const tenantId = process.env.MS_TENANT_ID;
const clientSecret = process.env.MS_CLIENT_SECRET;
const senderEmail = process.env.MS_SENDER_EMAIL;

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
 * Skickar ett e-postmeddelande via Microsoft Graph.
 */
async function sendMail(to, subject, html) {
  const client = await getGraphClient();

  const mail = {
    message: {
      subject,
      body: {
        contentType: "HTML",
        content: html,
      },
      toRecipients: [
        {
          emailAddress: {
            address: to,
          },
        },
      ],
    },
    saveToSentItems: "false",
  };

  if (!senderEmail) {
    throw new Error("❌ Saknar MS_SENDER_EMAIL – kontrollera local.settings.json");
  }

  try {
    console.log(`📧 Försöker skicka mail till ${to} med ämne "${subject}"...`);
    await client.api(`/users/${senderEmail}/sendMail`).post(mail);
    console.log("✅ E-post skickat!");
  } catch (err) {
    console.error("❌ Misslyckades att skicka e-post via Microsoft Graph:", err.message);
  }
}

export { sendMail };
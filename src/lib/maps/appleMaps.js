// File: lib/maps/appleMaps.js
import fs from "fs";
import jwt from "jsonwebtoken";
import fetch from "node-fetch";
import { debug, getEnv } from "../utils/debug.js";

const teamId = getEnv("APPLE_MAPS_TEAM_ID");
const keyId = getEnv("APPLE_MAPS_KEY_ID");
const keyPath = getEnv("APPLE_MAPS_KEY_PATH");

/**
 * Skapar ett Apple JWT för serverbaserade Maps-anrop.
 */
function createAppleMapsJWT() {
  try {
    const privateKey = fs.readFileSync(keyPath, "utf8");

    const token = jwt.sign({}, privateKey, {
      algorithm: "ES256",
      issuer: teamId,
      keyid: keyId,
      expiresIn: "1h",
      header: {
        alg: "ES256",
        kid: keyId,
        typ: "JWT"
      }
    });

    debug("maps", "Skapat Apple Maps JWT", { token }); // DEBUG: logga JWT
    return token;
  } catch (error) {
    debug("maps", "Fel vid skapande av JWT", { error });
    throw error;
  }
}

/**
 * Använder Apple Maps Directions API för att hämta restid (i minuter).
 */
async function getTravelTime(fromAddress, toAddress, atTime) {
  const jwtToken = createAppleMapsJWT();

  debug("maps", "Hämtar restid", { fromAddress, toAddress, atTime });

  // Steg 1: Hämta access token
  const tokenResponse = await fetch("https://maps-api.apple.com/v1/token", {
    headers: {
      Authorization: `Bearer ${jwtToken}`
    }
  });

  const tokenData = await tokenResponse.json();

  if (!tokenResponse.ok || !tokenData.accessToken) {
    debug("maps", "Fel vid hämtning av access token", { status: tokenResponse.status, body: tokenData });
    throw new Error("Apple Maps API auth-token-misslyckande");
  }

  const accessToken = tokenData.accessToken;

  // Steg 2: Anropa directions-endpoint med accessToken
  const url = new URL("https://maps-api.apple.com/v1/directions");
  url.searchParams.append("origin", fromAddress);
  url.searchParams.append("destination", toAddress);
  url.searchParams.append("transportType", "automobile");
  url.searchParams.append("departureTime", new Date(atTime).toISOString());

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!res.ok) {
    const err = await res.text();
    debug("maps", "Apple Maps API error", { error: err });
    throw new Error("Apple Maps API request failed");
  }

  const data = await res.json();
  const travelTimeSec = data.routes?.[0]?.durationSeconds;
  if (!travelTimeSec) {
    debug("maps", "❌ Ingen restid returnerad", { rawResponse: data });
    throw new Error("No travel time returned");
  }

  debug("maps", "Restid i sekunder", { travelTimeSec });
  const travelTimeMinutes = Math.round(travelTimeSec / 60); // i minuter
  debug("maps", "Restid i minuter", { travelTimeMinutes });

  return travelTimeMinutes;
}

export { getTravelTime };
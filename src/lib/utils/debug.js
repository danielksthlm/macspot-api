// File: lib/utils/debug.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_TO_FILE = true;
const LOG_FILE_PATH = path.join(__dirname, "../../../logs/debug.log");

function debug(scope = "general", message = "", data = null, level = "INFO") {
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    scope,
    message,
    ...(data && { data })
  };

  // Logga till terminal
  console.log(JSON.stringify(entry, null, 2));

  // Logga till fil om aktivt
  if (LOG_TO_FILE) {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
      fs.appendFileSync(LOG_FILE_PATH, JSON.stringify(entry) + "\n");
    } catch (err) {
      console.error("❌ Misslyckades skriva till loggfil:", err.message);
    }
  }
}

export { debug };

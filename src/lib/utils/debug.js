// File: lib/utils/debug.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_TO_FILE = true;
const LOG_FILE_PATH = path.join(__dirname, "../../../logs/debug.log");

function debug(scope = "general", message = "", data = null) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${scope}] ${message}` + (data ? ` ${JSON.stringify(data)}` : "");

  // Logga till terminal
  console.log(logLine);

  // Logga till fil om aktivt
  if (LOG_TO_FILE) {
    try {
      fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
      fs.appendFileSync(LOG_FILE_PATH, logLine + "\n");
    } catch (err) {
      console.error("❌ Misslyckades skriva till loggfil:", err.message);
    }
  }
}

export { debug };

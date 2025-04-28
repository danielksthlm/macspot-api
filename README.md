Perfekt! 🚀
Här kommer en helt färdig och korrekt uppdaterad README.md som matchar exakt vad vi byggt klart:

⸻

📄 NY README.md för ditt projekt

# MacSpot API – Azure Functions (Node.js 20, klassisk modell)

![Deploy](https://github.com/danielkallberg/macspot-api/actions/workflows/deploy.yml/badge.svg)

MacSpot är ett modulärt, privat CRM/ERP-system byggt ovanpå Azure Functions v4 och Node.js 20.  
Systemet är designat för att köras lokalt med molnkopplingar endast vid behov, exempelvis för kalenderintegration eller databasbackup.  
Det kombinerar snabbhet, lokal kontroll och säker molnsynk.

---

## 🧠 Arkitektur

- 📦 Bygger på Azure Functions (v4, Node.js 20)
- 📂 Klassisk modell: en mapp + `function.json` och `index.js` per endpoint
- 🌐 PostgreSQL via `pg`-modulen (dynamisk import)
- 🔒 SSL och miljövariabler används för alla anslutningar
- ☁️ Zip-deploy till Azure via `az functionapp deployment source config-zip`

---

## 🚀 Kom igång (lokalt)

```bash
npm install
npm run start

Lokalt körs allt via Azure Functions Core Tools (func start) genom NPM-script.

⸻

📦 Deployment till Azure

För korrekt deploy:

rm -rf node_modules
npm install --production
zip -r macspotbackend.zip host.json package.json node_modules meeting_types
az functionapp deployment source config-zip --resource-group MacSpotRG --name macspotbackend --src macspotbackend.zip

✅ Detta säkerställer att pg-modulen inkluderas i deploymenten.

⸻

✅ Funktionalitet och status (April 2025)
    •    Node.js 20 kompatibilitet på Azure Functions (Flex Consumption Plan)
    •    PostgreSQL-anslutning via pg v8+ med SSL
    •    Dynamisk import av pg för Node.js ES Modules
    •    Fullständig miljövariabelhantering (PGUSER, PGPASSWORD, PGHOST, PGDATABASE, PGPORT)
    •    Curl-tester visar 200 OK från API
    •    Full felhantering och loggning av error.message + error.stack

⸻

📋 Struktur

host.json
package.json
meeting_types/
  ├── function.json
  └── index.js
node_modules/

Varje API-endpoint (ex: /meeting_types) ligger i egen mapp.
Ingen v4-bundling används just nu.

⸻

🔄 Felhantering

Alla fel returneras som JSON:

{
  "error": "beskrivning av felet",
  "stack": "stacktrace"
}

Detta gäller både för databasanslutning och vid oväntade problem.

⸻

🛠️ Troubleshooting (Felsökning)

Problem    Felmeddelande    Lösning
Cannot find package 'pg' imported    pg-modul inte funnen    Använd npm install --production och config-zip deploy
password authentication failed for user    Fel lösenord eller PGUSER    Dubbelkolla Programinställningar i Azure
500 Internal Server Error utan body    Crash före funktion startar    Kontrollera pg-import, använd dynamisk import
Connection timeout    PGHOST fel eller brandvägg blockerar    Kontrollera PGHOST och brandväggsinställningar



⸻

🗄️ Databasmodell (PostgreSQL)

MacSpot använder en flexibel modell:
    •    Contact – Person
    •    Company – Företag
    •    CCRelation – Relation mellan person och företag
    •    Bookings – Koppling till Contact (och metadata för möten)

Alla regler och inställningar styrs av booking_settings-tabellen.

⸻

🧩 Nästa steg
    •    Bygga fler API-endpoints (customers, contacts, bookings)
    •    Snygga till JSON-svaren från API
    •    Implementera healthcheck-endpoint
    •    Automatisera test av db-anslutning via GitHub Actions

⸻

📆 Releaseinfo
    •    Version: v1.0
    •    Status: Funktionellt och klart
    •    Senast verifierat: 2025-04-28

⸻



# 📢 KLART!
✅ Denna README är nu helt aktuell med din riktiga kodbas och plattform.  
✅ Den visar exakt vad som är klart och hur projektet funkar på riktigt.

---

# 🚀 Vill du att jag också hjälper dig snabbt skapa en **healthcheck-funktion** (`/health`) som kollar om PostgreSQL är online och svarar 200/500?  
(Superbra för framtida övervakning och säker drift!)

Säg bara "ja"! 🎯✨  
Så är vi igång direkt! 🚀

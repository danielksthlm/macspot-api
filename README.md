# MacSpot API – Azure Functions v4

![Deploy](https://github.com/danielkallberg/macspot-api/actions/workflows/deploy.yml/badge.svg)

MacSpot är ett modulärt och privat CRM/ERP-system byggt ovanpå Azure Functions v4 och Node.js. Systemet är designat för att köras lokalt – med molnkopplingar endast när det behövs, exempelvis vid integrationer eller när systemet är offline. Det ger en flexibel och robust lösning som kombinerar det bästa från lokal kontroll och molnets kraft. MacSpot är en modern, säker och integritetsbevarande ersättare till plattformar som HubSpot – men snabbare, enklare och helt i användarens händer.

## 🧠 Arkitektur

- 📦 Bygger på `@azure/functions` (v4-modellen)
- 🗂 Alla endpoints definieras med `app.http(...)` direkt i kod
- 🧩 Varje API-rutt ligger i `src/routes/*.js`
- 🧪 Fullt testbart, lokalt och i molnet

## 🚀 Exempelrutt

```http
POST /api/bookings
```

Returnerar `200 OK` med ett meddelande.

## 📄 Kom igång

```bash
npm install
func start
```

## 📁 Mappstruktur
src
├── lib
│   ├── bookingService.js
│   ├── calendar
│   │   ├── appleCalendar.js
│   │   ├── caldav.js
│   │   ├── ms365Calendar.js
│   │   ├── msGraph.js
│   │   └── roomBooking.js
│   ├── db
│   │   └── db.js
│   ├── log
│   │   └── eventLogger.js
│   ├── maps
│   │   └── appleMaps.js
│   ├── notification
│   │   ├── emailSender.js
│   │   └── sendMail.js
│   ├── test
│   │   └── testBookingService.js
│   └── utils
│       ├── debug.js
│       └── translation.js
└── routes
    ├── bookings.js
    ├── getAvailableSlots.js
    ├── health.js
    └── status.js

10 directories, 18 files

## 🔗 Kommandoalias (förslag)

```bash
alias macspotdev="cd ~/Documents/KLR_AI/Projekt_MacSpot/macspot-api && func start"
```

## 🛠️ Nästa steg

- [ ] Lägg till fler routes: `customers`, `invoices`, `availability`
- [ ] Sätt upp e-postbekräftelser (mail.js)
- [ ] Koppla till databas (PostgreSQL eller Azurite Table Storage)
- [ ] Lägg till nytt GitHub Actions-flöde för att testa databasanslutning via `macapp`-användaren (SELECT 1)

## 🗄️ Databasmodell

MacSpot använder en flexibel och utbyggbar databasmodell som bygger på tre centrala tabeller för att modellera relationer mellan personer och företag:

- `Contact` – Fysiska personer (t.ex. användare, kundansvariga, konsulter)
- `Company` – Juridiska personer (t.ex. företag, organisationer)
- `CCRelation` – Kopplar kontakt och företag med en roll (t.ex. VD, ordförande, styrelseledamot)

Ett kontaktkort kan alltså representera flera roller över tid i flera olika företag, vilket ger en mycket större modellkraft än i exempelvis HubSpot.

Bokningar (`bookings`) kopplas direkt till `Contact`, inte `Company`, vilket möjliggör fullständig historik, notifikationer och personlig logik – även när flera företag är inblandade.

## 🧩 Kontakt–företagsrelationer

MacSpot utökar den traditionella CRM-strukturen genom att använda en frikopplad modell där kontakter (`Contact`) och företag (`Company`) binds ihop genom `CCRelation`. Det innebär:

- En kontakt kan ha olika roller i flera företag
- Ett företag kan ha flera personer kopplade med olika ansvarsområden
- Samma kontakt kan vara VD i ett företag och ordförande i ett annat

Det här möjliggör:

- Dynamiska B2B-strukturer
- Flerdimensionella relationer över tid
- Smarta bokningsflöden där kontaktens “hatt” påverkar vilka val som visas

```sql
-- Exempel: hämta alla företag där en kontakt är VD
SELECT c.name, r.role
FROM Company c
JOIN CCRelation r ON r.company_id = c.id
WHERE r.contact_id = 'kontakt-uuid'
  AND r.role = 'VD';
```

Bokningar (`Bookings`) relaterar alltid till en fysisk person (`Contact`), men metadata kan ange i vilken kontext bokningen sker (t.ex. som representant för ett företag).

### 📆 Bokningslogik

Systemet hanterar och automatiserar bokningar genom att:

- 🔗 Integrera med **Microsoft Kalender** (jobbmöten) via Microsoft Graph API
- 🍎 Läsa in **Apple Kalender** (CalDAV) för att undvika krockar med privata händelser
- 🏢 Hantera **mötesrum** (bokning via CalDAV) och **restidslogik** för fysiska möten
- 📲 Generera **möteslänkar** (Teams, Zoom, FaceTime) för digitala möten
- 🧠 **Restidsberäkning via Apple Maps** (JWT-signerad integration)
- 🗄️ Spara all bokningsinformation i en lokal PostgreSQL-databas (`macspot`) med valfri Azure-backup

Varje bokning kopplas direkt till en `Contact` och kan innehålla metadata som:

- mötestyp (fysisk/digital)
- adress
- restid
- språk
- deltagare
- tekniskt medel (Teams/Zoom/FaceTime)
- `synced_to_calendar` – om bokningen har synkats till Microsoft
- `calendar_event_id` – original-ID från Graph (om tillgänglig)

När en bokning sparas innehåller den bland annat följande fält:

- `start_time`, `end_time`
- `contact_id` – koppling till `Contact`
- `meeting_type`, `location_type`, `room_email`
- `meeting_link` – länk till digitalt möte (t.ex. Teams)
- `event_id` – ID för kalenderhändelse (Microsoft)
- `language`, `status`, `require_approval`
- `metadata`, `notes`

Detta möjliggör fullständig bokningslogik även när användaren är offline.

## Bokningsvillkor

Följande villkor måste vara uppfyllda för att en bokning ska godkännas eller visas till kund:

1. **Ingen krock** i Microsoft Kalender (via Microsoft Graph) eller Apple Kalender (via CalDAV).
2. **Tillräcklig restid** före och efter mötet (beräknad via Apple Maps eller `fallback_travel_minutes`).
3. **Inom inställda restidsfönster** (`travel_window.start` / `travel_window.end`) och inte på helgdag om `block_weekends` är true.
4. **Inom veckokvoten** av bokningsbara minuter (`max_weekly_booking_minutes`).
5. **Mötesrum finns** (via Microsoft Graph `getSchedule` eller fallback-logik).
6. **Uppfyller minimilängd** för den aktuella mötestypen (från `default_meeting_lengths`).

✅ Alla villkor styrs av `booking_settings` (PostgreSQL)

Så här ska det vara:

Kunden anger sin email och vilket typ av möte hen vill ha. Mötestyp finns i tabellen booking_settings och värdet i meeting_type.När vi har dessa två parametrar så ska vi dels:se om vi har all data om kunden genom att matcha mot berörda tabeller som en funktion av meeting_type. OM det är atClient så måste komplett adress anges. Övriga mötesformer så räcker Bolagsnamn, förnamn, efternamn, tele och email. När detta är klart och uppdaterat alt att en ny kund läggs upp. Därefter anger man antal mötesminuter där reglerna finns i booking_settings och så ska koden visa tillgängliga tider (konfliktfritt) dvs följande villkor måste vara uppfyllda för att en bokning ska godkännas eller visas till kund:

1. **Ingen krock** i Microsoft Kalender (via Microsoft Graph) eller Apple Kalender (via CalDAV).
2. **Tillräcklig restid** före och efter mötet (beräknad via Apple Maps eller `fallback_travel_minutes`).
3. **Inom inställda restidsfönster** (`travel_window.start` / `travel_window.end`) och inte på helgdag om `block_weekends` är true.
4. **Inom veckokvoten** av bokningsbara minuter (`max_weekly_booking_minutes`).
5. **Mötesrum finns** (via Microsoft Graph `getSchedule` eller fallback-logik).
6. **Uppfyller minimilängd** för den aktuella mötestypen (från `default_meeting_lengths`).

Av de valbara tiden ska man välj en fm-tid och en em-tid som på minsta sätt fragmenterar min kalender. Kalandern ska likna den som finns i Hubpsot (men bättre). Man väljer den en dag och sedan en eller två tider

### 📎 ER-diagram

Filen `pgERD_MacSpot.pgerd` (öppnas med [pgModeler](https://pgmodeler.io/)) innehåller full databasstruktur:

```
📄 pgERD_MacSpot.pgerd
```

Diagrammet inkluderar bl.a.:

- `Contact`, `Company`, `CCRelation`
- `Bookings` (med `contact_id`)
- `BookingSettings` (jsonb-baserade öppettider och regler)
- `EventLog` (audit trail för händelser)

Modellen är optimerad för PostgreSQL, men flexibel nog att användas med supabase eller andra tjänster.

### 🪵 Logging och felsökning

Systemet loggar automatiskt:
- 🎯 Bokningshändelser i `event_log` (PostgreSQL)
- 🧠 Teknisk debug via `debug.js` (fil + terminal)
- 📬 Rumsbokning, restid, e-post, kalender-ID etc.

Exempel på `event_type`:
- `booking_created`, `room_selected`, `calendar_event`, `email_sent`, `rejected`

Loggar kan enkelt analyseras eller användas för att trigga externa webhookar.


find src . -maxdepth 1 -type f \( -name "*.js" -o -name "*.json" \) | while read -r file; do
  relpath="${file#./}"
  relpath="${relpath#src/}"
  tmpfile=$(mktemp)

  first_line=$(head -n 1 "$file")
  if [[ "$first_line" == "// File:"* ]]; then
    tail -n +2 "$file" > "$tmpfile"
  else
    cp "$file" "$tmpfile"
  fi

  {
    echo "// File: $relpath"
    cat "$tmpfile"
  } > "$file"

  rm "$tmpfile"
done

find src -type f -name "*.js" | sort | while read file; do
  echo -e "\n// ===== File: ${file#src/} =====" >> all-in-one.js
  cat "$file" >> all-in-one.js
done

code ~/.zshrc
source ~/.zshrc
psqlmacspot


tree -I 'node_modules' -L 4
tree -a -I 'node_modules' -L 4
tree -a -I 'node_modules|objects' -L 4
tree src -L 5

---

## 🔄 CI/CD – GitHub Actions

För att säkerställa att molndatabasen är tillgänglig från GitHub Actions och att användaren `macapp` fungerar som förväntat, kan ett nytt test-flöde läggas till i `.github/workflows/test-db.yml`:

```yaml
name: Test PostgreSQL Connection

on:
  workflow_dispatch:

jobs:
  test-db:
    runs-on: ubuntu-latest
    env:
      PGHOST: ${{ secrets.PGHOST }}
      PGPORT: ${{ secrets.PGPORT }}
      PGUSER: ${{ secrets.PGUSER }}
      PGPASSWORD: ${{ secrets.PGPASSWORD }}
      PGDATABASE: ${{ secrets.PGDATABASE }}

    steps:
      - name: Check database connectivity
        run: |
          sudo apt-get install -y postgresql-client
          psql -c "SELECT 1;"
```

Lägg till dessa secrets i GitHub → Settings → Secrets → Actions:

- `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`

## 📦 Synkplattform – Version 1.0

🎉 Detta är en fryst och stabil version av den tvåvägssynkade plattformen mellan lokal och molndatabas.

### ✅ Funktionalitet

- Full tvåvägssynk mellan lokal och moln via `pending_changes`
- Moderna triggerfunktioner för `contact` och `bookings`
- Minimal molnstruktur, full lokal struktur
- Säkerhet via separat app-användare i Azure (`macapp`)
- Automatisk loggning till `event_log`

### 🧪 Testflöde

```sql
-- Lokalt
UPDATE contact
SET metadata = jsonb_set(metadata, '{first_name}', '"TestLokalt"')
WHERE booking_email = 'lokaltest@example.com';

-- Moln
UPDATE contact
SET metadata = jsonb_set(metadata, '{first_name}', '"TestMoln"')
WHERE booking_email = 'lokaltest@example.com';

-- Lägg till pending_changes i molnet
INSERT INTO pending_changes (...) VALUES (...);
```

### 🔁 Verifiering

- `SELECT * FROM pending_changes WHERE direction = 'out';`
- `python sync_all.py`
- `SELECT * FROM contact WHERE booking_email = 'lokaltest@example.com';`

### 🔐 Säkerhet

- `REVOKE ALL ON SCHEMA public FROM PUBLIC;`
- Endast `SELECT`, `INSERT`, `UPDATE` för användaren `macapp`

### ✉️ E-post (Microsoft Graph)

E-post skickas endast via Microsoft Graph API. Tidigare SMTP- eller SendGrid-baserad logik har tagits bort eller inaktiverats. Följande variabler används:

- `MS365_CLIENT_ID`
- `MS365_CLIENT_SECRET`
- `MS365_TENANT_ID`
- `MS365_USER_EMAIL`

Dessa används i `emailSender.js` och `sendMail.js` via Graph-anrop med autentisering via MSAL.

## 🔑 Obligatoriska miljövariabler (Secrets)

För att aktivera full funktionalitet i systemet krävs följande secrets:

### Microsoft Graph API (kalenderhantering)

- `MS365_CLIENT_ID`
- `MS365_CLIENT_SECRET`
- `MS365_TENANT_ID`
- `MS365_USER_EMAIL`

### Apple Maps REST API (restidsberäkning)

- `APPLE_TEAM_ID`
- `APPLE_KEY_ID`
- `APPLE_PRIVATE_KEY`
- `APPLE_MAPS_PRIVATE_KEY` *(alternativ till KEY_PATH för molndrift)*

> Om du använder `APPLE_MAPS_PRIVATE_KEY` från secrets, ersätts behovet av `APPLE_MAPS_KEY_PATH`. Strängen måste innehålla `\\n` för radbrytningar.

Läggs in i Azure App Settings (produktion) och/eller GitHub Secrets (CI).

### Apple Kalender (CalDAV)

- `CALDAV_USER`
- `CALDAV_PASSWORD`
- `CALDAV_CALENDAR_URL` *(ex: https://caldav.icloud.com/xyz/)*

Används för att autentisera mot din privata Apple-kalender och hämta händelser via CalDAV. Detta krävs för att systemet ska kunna upptäcka krockar med personliga kalenderhändelser.

### 🏁 Release

- Version: `v1.0`
- Datum: 2025-04-25

### ✅ Bekräftad funktionalitet (2025-04-25)

- Triggerfunktioner skapade om från grunden
- Alla `pending_changes` loggas korrekt från lokal databas
- `sync_all.py` fungerar utan fel i båda riktningar
- Struktur i molnet har full `PRIMARY KEY`-täckning (`id`)
- GitHub Actions-anslutning testad via `psql SELECT 1;`
- Secrets (`PGUSER=macapp` etc.) inlagda i både Azure och GitHub

### 🔄 Senaste förbättringar (2025-04-25)

- `health.js` uppdaterad med globalt try/catch och loggning till Application Insights
- `status.js` visar nu antal saknade miljövariabler (env status)
- `msGraph.js` uppdaterad med korrekt OAuth2-flöde (utan APPLE-variabler)
- `appleMaps.js` stödjer nu både `KEY_PATH` och `PRIVATE_KEY` från secrets
- GitHub Actions-flöde för att synka secrets till Azure (`sync-secrets-to-azure.yml`)
- `health.js` och `status.js` svarar korrekt även vid saknade värden
- README och kodstruktur uppdaterade för att reflektera faktisk funktion

Denna release är testad och bekräftad för produktionsdrift.

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
macspot-api/
├── .github/workflows/       # GitHub Actions workflows (CI/CD)
├── src/                     # All applikationslogik
│   ├── lib/                 # Återanvändbara moduler
│   │   ├── calendar/        # Kalender- och bokningslogik (MS365, CalDAV)
│   │   ├── db/              # Databaskoppling (PostgreSQL)
│   │   ├── log/             # Händelseloggning
│   │   ├── maps/            # Apple Maps-integration
│   │   ├── notification/    # E-postutskick
│   │   └── utils/           # Hjälpfunktioner
│   ├── routes/              # Azure Functions (HTTP triggers)
│   │   ├── bookings.js
│   │   ├── getAvailableSlots.js
│   │   ├── health.js
│   │   └── status.js
├── index.js                 # Importerar alla routes
├── host.json                # Azure Functions host-konfiguration
├── local.settings.json      # Lokala miljövariabler
├── package.json             # NPM-paket och skript
└── README.md                # Dokumentation

## 🔗 Kommandoalias (förslag)

```bash
alias macspotdev="cd ~/Documents/KLR_AI/Projekt_MacSpot/macspot-api && func start"
```

## 🛠️ Nästa steg

- [ ] Lägg till fler routes: `customers`, `invoices`, `availability`
- [ ] Sätt upp e-postbekräftelser (mail.js)
- [ ] Koppla till databas (PostgreSQL eller Azurite Table Storage)

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
psqlmacspot


tree -I 'node_modules' -L 4

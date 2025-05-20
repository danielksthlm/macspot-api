import os
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime

# Lista över filnamn
import glob

filnamn_lista = [
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/meeting_types/index.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/validate_contact/index.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/getavailableslots/index.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/refreshCalendarOrigins/index.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/refreshTravelTimes/index.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/calendar/appleCalendar.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/calendar/getMsToken.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/calendar/msGraph.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/calendar/resolveOrigin.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/config/settingsLoader.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/config/verifySettings.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/db/pgPool.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/maps/appleMaps.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/maps/returnTravelVerifier.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/maps/travelTimeResolver.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/bookings/index.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/utils/debugLogger.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared/slots/slotEngine.js"
]

# Slutlig sammanslagen fil
output_fil = os.path.join("/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/", f"AllBackendCodes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")

saknade_filer = []
# Läs och skriv innehåll
with open(output_fil, "w", encoding="utf-8") as utfil:
    # Trädstruktur
    root_path = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/"
    utfil.write("📂 KODTRÄD\n")
    utfil.write("==========\n")
    sorted_paths = sorted([os.path.relpath(f, root_path) for f in filnamn_lista])
    for path in sorted_paths:
        parts = path.split(os.sep)
        for i, part in enumerate(parts):
            prefix = "│   " * i + "├── "
            utfil.write(f"{prefix}{part}\n")
    utfil.write("==========\n\n")

    for filnamn in filnamn_lista:
        visat_filnamn = os.path.basename(filnamn)
        if os.path.exists(filnamn):
            # Läs filens rader
            with open(filnamn, "r", encoding="utf-8") as infil:
                rader = infil.readlines()
            antal_rader = len(rader)
            # Imports
            imports = []
            import_count = 0
            for rad in rader:
                rad_strip = rad.strip()
                if rad_strip.startswith("import "):
                    imports.append(rad_strip)
                    import_count += 1
                elif "require(" in rad_strip:
                    imports.append(rad_strip)
                    import_count += 1

            # Funktioner
            funktion_count = 0
            # Längsta funktion (förenklad heuristik)
            longest_func = 0
            i = 0
            while i < len(rader):
                rad = rader[i].strip()
                is_func = (
                    rad.startswith("function ")
                    or ("const " in rad and "=" in rad and "(" in rad and rad.rstrip().endswith("{"))
                    or ("=>" in rad and ("const " in rad or "let " in rad or "var " in rad))
                )
                if is_func:
                    funktion_count += 1
                    start = i
                    j = i + 1
                    brace_count = 0
                    if "{" in rad:
                        brace_count += rad.count("{")
                        brace_count -= rad.count("}")
                    while j < len(rader):
                        line = rader[j]
                        brace_count += line.count("{")
                        brace_count -= line.count("}")
                        # Slut på funktion: när klammern är stängd eller tomrad (förenklad)
                        if brace_count <= 0 or line.strip() == "":
                            break
                        j += 1
                    func_len = j - start
                    if func_len > longest_func:
                        longest_func = func_len
                    i = j
                else:
                    i += 1

            # Kommentarstäckning
            kommentar_rader = 0
            for rad in rader:
                rad_strip = rad.strip()
                if (
                    rad_strip.startswith("//")
                    or rad_strip.startswith("/*")
                    or rad_strip.startswith("*")
                    or rad_strip.startswith("*/")
                ):
                    kommentar_rader += 1
            # Komplexitetsord
            komplex_ord = ["if", "for", "while", "switch", "try"]
            komplex_count = 0
            for rad in rader:
                for ord in komplex_ord:
                    # Enkla sök (kan ge dubletter om flera per rad)
                    komplex_count += rad.count(f"{ord} ")
                    komplex_count += rad.count(f"{ord}(")
            # TODO/FIXME
            todo_count = 0
            for rad in rader:
                if "TODO" in rad or "FIXME" in rad:
                    todo_count += 1
            # Senast ändrad
            senast_andrad_ts = os.path.getmtime(filnamn)
            senast_andrad = datetime.fromtimestamp(senast_andrad_ts).strftime("%Y-%m-%d %H:%M:%S")
            # Skriv metadata-block
            utfil.write("====================\n")
            utfil.write(f"📄 Fil: {visat_filnamn}\n")
            utfil.write(f"📅 Senast ändrad: {senast_andrad}\n")
            utfil.write(f"📏 Antal rader: {antal_rader}\n")
            utfil.write(f"🧩 Antal funktioner: {funktion_count}\n")
            utfil.write(f"💬 Kommentarstäckning: {kommentar_rader} rader ({(kommentar_rader / antal_rader * 100):.1f}%)\n")
            utfil.write(f"📥 Imports: {import_count} – {imports if imports else 'Inga'}\n")
            utfil.write(f"🔍 Längsta funktion: {longest_func} rader\n")
            utfil.write(f"🧠 Komplexitetspoäng: {komplex_count}\n")
            utfil.write(f"🧪 TODO/FIXME: {todo_count}\n")
            utfil.write("====================\n")
            utfil.write(f"START: {visat_filnamn}\n")
            with open(filnamn, "r", encoding="utf-8") as infil:
                utfil.write(infil.read())
            utfil.write(f"\nEND: {visat_filnamn}\n\n")
        else:
            utfil.write(f"START: {visat_filnamn}\n")
            utfil.write(f"// ⚠️ Filen '{visat_filnamn}' hittades inte\n")
            utfil.write(f"END: {visat_filnamn}\n\n")
            saknade_filer.append(visat_filnamn)

    # Lista alla function.json och host.json i hela macspot-api
    utfil.write("📁 JSON-KONFIGURATIONER (function.json / host.json)\n")
    utfil.write("====================================\n\n")
    json_filer = glob.glob(os.path.join(root_path, "**", "function.json"), recursive=True)
    json_filer += glob.glob(os.path.join(root_path, "**", "host.json"), recursive=True)

    if json_filer:
        for json_fil in sorted(json_filer):
            rel_path = os.path.relpath(json_fil, root_path)
            utfil.write(f"- {rel_path}\n")
    else:
        utfil.write("Inga function.json eller host.json hittades.\n")
    utfil.write("\n")

if saknade_filer:
    print("⚠️ Följande filer hittades inte:")
    for fil in saknade_filer:
        print(f" - {fil}")

# Slutlig sammanslagen fil

import psycopg2

def generera_databasstruktur(output_path):
    # Denna funktion ansluter till molndatabasen (Azure) för att hämta struktur och innehåll
    try:
        conn = psycopg2.connect(
            dbname=os.environ["REMOTE_DB_NAME"],
            user=os.environ["REMOTE_DB_USER"],
            password=os.environ["REMOTE_DB_PASSWORD"],
            host=os.environ["REMOTE_DB_HOST"],
            port=os.environ.get("REMOTE_DB_PORT", 5432),
            sslmode="require"
        )
        cur = conn.cursor()
        with open(output_path, "a", encoding="utf-8") as f:
            f.write("📊 MOLNDATABAS (Azure) – STRUKTUR & INNEHÅLL\n")
            f.write("====================================\n\n")
            # Tabeller
            cur.execute("""
                SELECT tablename FROM pg_tables WHERE schemaname = 'public'
            """)
            tables = [row[0] for row in cur.fetchall()]
            for table in tables:
                f.write(f"📁 Tabell: {table}\n")
                # Kolumner
                cur.execute(f"""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = %s
                """, (table,))
                cols = cur.fetchall()
                for col in cols:
                    f.write(f"  • {col[0]} ({col[1]})\n")
                # Primär-/sekundärnycklar
                cur.execute("""
                    SELECT conname, contype, pg_get_constraintdef(c.oid)
                    FROM pg_constraint c
                    JOIN pg_class t ON c.conrelid = t.oid
                    WHERE t.relname = %s
                """, (table,))
                keys = cur.fetchall()
                for key in keys:
                    f.write(f"  🔑 [{key[1]}] {key[0]}: {key[2]}\n")
                # Top 5 rader
                cur.execute(f"SELECT * FROM {table} LIMIT 5")
                rows = cur.fetchall()
                if rows:
                    colnames = [desc[0] for desc in cur.description]
                    f.write("  🧪 Topp 5 rader:\n")
                    for row in rows:
                        f.write("    - " + ", ".join(f"{k}={v}" for k, v in zip(colnames, row)) + "\n")
                f.write("\n")
        cur.close()
        conn.close()
    except Exception as e:
        print("⚠️ Fel vid hämtning av databasstruktur:", e)

generera_databasstruktur(output_fil)

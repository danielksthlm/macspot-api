BASE = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api"
import os
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime
import jsonschema

total_rader = 0
total_funktioner = 0
total_komplexitet = 0
total_todo = 0

# Lista över filnamn
import glob

filnamn_lista = [
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync_from_cloud.py",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync_to_cloud.py",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync_static_tables.py",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync.py",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync_all.py",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync_plist.xml",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync_generate_fromcloud_pending.py",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/sync_generate_pending_from_diff.py",
    "/Users/danielkallberg/Library/LaunchAgents/com.macspot.sync.plist",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/healthcheck_sync.py"
]

# Slutlig sammanslagen fil
output_fil = os.path.join("/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/AllSyncCodes_history", f"AllSyncCodes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
output_dir = os.path.dirname(output_fil)

saknade_filer = []
# Läs och skriv innehåll
with open(output_fil, "w", encoding="utf-8") as utfil:
    # Trädstruktur
    from collections import defaultdict

    def bygg_träd(paths):
        träd = lambda: defaultdict(träd)
        rot = träd()
        # Lägg till extra filer med etiketterade namn
        paths = list(paths)
        paths += [
            os.path.join(output_dir, "🧊_azure_temp.txt"),
            os.path.join(output_dir, "🏠_lokal_temp.txt"),
            os.path.join(output_dir, "🧮_diff_output.txt")
        ]
        for path in paths:
            delar = os.path.relpath(path, root_path).split(os.sep)
            curr = rot
            for del_ in delar:
                curr = curr[del_]
        return rot

    def skriv_träd(node, depth=0):
        for namn in sorted(node.keys()):
            prefix = "│   " * depth + "├── "
            utfil.write(f"{prefix}{namn}\n")
            skriv_träd(node[namn], depth + 1)

    # root_path ska inkludera AllSyncCodes_history också
    root_path = os.path.commonpath(filnamn_lista + [output_dir])
    # Inkludera även diffdelen och tempfiler i paths
    filtrerat = [f for f in filnamn_lista if "node_modules" not in f]
    paths_for_tree = list(filtrerat)
    paths_for_tree += [
        os.path.join(output_dir, "🧊_azure_temp.txt"),
        os.path.join(output_dir, "🏠_lokal_temp.txt"),
        os.path.join(output_dir, "🧮_diff_output.txt")
    ]
    struktur = bygg_träd(paths_for_tree)
    utfil.write("📂 KODTRÄD\n==========\n")
    skriv_träd(struktur)
    utfil.write("==========\n\n")

    for filnamn in filnamn_lista:
        visat_filnamn = os.path.basename(filnamn)
        rel_path = os.path.relpath(filnamn, root_path)
        # Bestäm kodtyp baserat på sökvägen
        if "/shared/" in rel_path:
            kodtyp = "🔧 Shared-modul"
        elif "/validate_contact/" in rel_path:
            kodtyp = "📬 Kontaktvalidering"
        elif "/meeting_types/" in rel_path:
            kodtyp = "📅 Mötestyp-endpoint"
        elif "/getavailableslots/" in rel_path:
            kodtyp = "🧠 Slot-generator"
        elif "/refreshCalendarOrigins/" in rel_path:
            kodtyp = "🔁 Kalender-refresh"
        elif "/refreshTravelTimes/" in rel_path:
            kodtyp = "🚗 Restids-refresh"
        elif "/bookings/" in rel_path:
            kodtyp = "📤 Boknings-API"
        else:
            kodtyp = "📄 Övrigt"
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

            # Bestäm kodspråk baserat på filändelse
            if filnamn.endswith(".js"):
                kodspråk = "🟨 JavaScript"
            elif filnamn.endswith(".py"):
                kodspråk = "🐍 Python"
            elif filnamn.endswith(".json"):
                kodspråk = "🧾 JSON"
            else:
                kodspråk = "📄 Okänt format"

            total_rader += antal_rader
            total_funktioner += funktion_count
            total_komplexitet += komplex_count
            total_todo += todo_count

            if 'fil_summering' not in locals():
                fil_summering = []
            fil_summering.append([
                visat_filnamn,
                antal_rader,
                funktion_count,
                komplex_count,
                kommentar_rader,
                import_count
            ])

            # Skriv metadata-block
            utfil.write("====================\n")
            utfil.write(f"📄 Fil: {rel_path}\n")
            utfil.write(f"📂 Kodtyp: {kodtyp}\n")
            utfil.write(f"🗂 Filtyp: {kodspråk}\n")
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

    # Lista alla relevanta konfigurationsfiler i hela macspot-api
    utfil.write("📁 KONFIGURATIONSFILER (function.json / host.json / package.json / .funcignore)\n")
    utfil.write("====================================\n\n")
    config_filer = []
    for filnamn in ["function.json", "host.json", "package.json", ".funcignore"]:
        config_filer += glob.glob(os.path.join(BASE, "**", filnamn), recursive=True)
    config_filer = [f for f in config_filer if "node_modules" not in f]

    host_schema = {
      "type": "object",
      "properties": {
        "version": {"type": "string"},
        "extensionBundle": {
          "type": "object",
          "properties": {
            "id": {"type": "string"},
            "version": {"type": "string"}
          },
          "required": ["id", "version"]
        }
      },
      "required": ["version"]
    }

    if config_filer:
        for config_fil in sorted(config_filer):
            rel_path = os.path.relpath(config_fil, root_path)
            utfil.write(f"📄 {rel_path}\n")
            try:
                if os.path.basename(config_fil) == "host.json":
                    import json
                    data = json.load(open(config_fil))
                    jsonschema.validate(instance=data, schema=host_schema)
                with open(config_fil, "r", encoding="utf-8") as cf:
                    for rad in cf:
                        utfil.write("   " + rad)
            except jsonschema.exceptions.ValidationError as ve:
                utfil.write(f"   // ❌ Ogiltig host.json: {ve.message}\n")
            except Exception as e:
                utfil.write(f"   // ⚠️ Kunde inte läsa filen: {e}\n")
            utfil.write("\n")
    else:
        utfil.write("Inga function.json, host.json, package.json eller .funcignore hittades i projektet.\n\n")

    utfil.write("📈 SUMMERING AV ALLA JS-FILER\n")
    utfil.write("====================================\n")
    utfil.write(f"📏 Totalt antal rader kod: {total_rader}\n")
    utfil.write(f"🧩 Totalt antal funktioner: {total_funktioner}\n")
    utfil.write(f"🧠 Total komplexitetspoäng: {total_komplexitet}\n")
    utfil.write(f"🧪 Antal TODO/FIXME totalt: {total_todo}\n\n")
    utfil.write("📊 Per fil:\n")
    utfil.write("fil,rader,funktioner,komplexitet,kommentarer,imports\n")
    for row in fil_summering:
        utfil.write(",".join(str(x) for x in row) + "\n")

if saknade_filer:
    print("⚠️ Följande filer hittades inte:")
    for fil in saknade_filer:
        print(f" - {fil}")

# Slutlig sammanslagen fil

import psycopg2

def generera_databasstruktur(output_path, db_config, rubrik, output_dir):
    # Skriv till temporärfil i output_dir
    temp_path = os.path.join(output_dir, output_path)
    try:
        conn = psycopg2.connect(
            dbname=os.environ[db_config["DB_NAME"]],
            user=os.environ[db_config["DB_USER"]],
            password=os.environ[db_config["DB_PASSWORD"]],
            host=os.environ[db_config["DB_HOST"]],
            port=os.environ.get(db_config["DB_PORT"], 5432),
            sslmode=db_config.get("SSLMODE", "disable")
        )
        cur = conn.cursor()
        with open(temp_path, "w", encoding="utf-8") as f:
            f.write(f"{rubrik}\n")
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

import os
# Skriv till temporära filer i output_dir
generera_databasstruktur("azure_temp.txt", {
    "DB_NAME": "REMOTE_DB_NAME",
    "DB_USER": "REMOTE_DB_USER",
    "DB_PASSWORD": "REMOTE_DB_PASSWORD",
    "DB_HOST": "REMOTE_DB_HOST",
    "DB_PORT": "REMOTE_DB_PORT",
    "SSLMODE": "require"
}, "📊 MOLNDATABAS (Azure) – STRUKTUR & INNEHÅLL", output_dir)

generera_databasstruktur("lokal_temp.txt", {
    "DB_NAME": "LOCAL_DB_NAME",
    "DB_USER": "LOCAL_DB_USER",
    "DB_PASSWORD": "LOCAL_DB_PASSWORD",
    "DB_HOST": "LOCAL_DB_HOST",
    "DB_PORT": "LOCAL_DB_PORT"
}, "📊 LOKAL DATABAS – STRUKTUR & INNEHÅLL", output_dir)

from difflib import unified_diff

def generera_diffanalys(fil1, fil2, output_path):
    with open(fil1, "r", encoding="utf-8") as f1, open(fil2, "r", encoding="utf-8") as f2:
        lines1 = f1.readlines()
        lines2 = f2.readlines()
    diff = unified_diff(lines1, lines2, fromfile="Azure", tofile="Lokal", lineterm="")
    with open(output_path, "a", encoding="utf-8") as f:
        f.write("📊 DIFFANALYS Azure vs Lokal\n")
        f.write("====================================\n")
        for line in diff:
            f.write(line + "\n")

# HTML diff-funktion
from difflib import HtmlDiff

def generera_html_diff(fil1, fil2, output_path):
    with open(fil1, "r", encoding="utf-8") as f1, open(fil2, "r", encoding="utf-8") as f2:
        lines1 = f1.readlines()
        lines2 = f2.readlines()
    differ = HtmlDiff()
    html = differ.make_file(lines1, lines2, fromdesc="Azure DB", todesc="Lokal DB", context=True, numlines=3)
    with open(output_path, "w", encoding="utf-8") as out:
        out.write(html)

# Skriv in temporärfilerna till output_fil före diffen
with open(output_fil, "a", encoding="utf-8") as f:
    for temp_fil in ["azure_temp.txt", "lokal_temp.txt"]:
        temp_path = os.path.join(output_dir, temp_fil)
        with open(temp_path, "r", encoding="utf-8") as tf:
            f.write(tf.read())

generera_diffanalys(
    os.path.join(output_dir, "azure_temp.txt"),
    os.path.join(output_dir, "lokal_temp.txt"),
    output_fil
)

# Anropa HTML-diff direkt efter generera_diffanalys
generera_html_diff(
    os.path.join(output_dir, "azure_temp.txt"),
    os.path.join(output_dir, "lokal_temp.txt"),
    os.path.join(output_dir, "🧮_diff_output.html")
)

# Kopiera temporärfiler till etiketterade kopior innan de tas bort
import shutil
shutil.copyfile(os.path.join(output_dir, "azure_temp.txt"), os.path.join(output_dir, "🧊_azure_temp.txt"))
shutil.copyfile(os.path.join(output_dir, "lokal_temp.txt"), os.path.join(output_dir, "🏠_lokal_temp.txt"))
shutil.copyfile(output_fil, os.path.join(output_dir, "🧮_diff_output.txt"))

# Ta bort temporära filer efter diffanalysen

os.remove(os.path.join(output_dir, "azure_temp.txt"))
os.remove(os.path.join(output_dir, "lokal_temp.txt"))

# Lägg till klickbar länk till HTML-diff i textfilen
with open(output_fil, "a", encoding="utf-8") as f:
    f.write("\n🌐 HTML-diff finns även här:\n")
    f.write(f"file://{os.path.join(output_dir, '🧮_diff_output.html')}\n")

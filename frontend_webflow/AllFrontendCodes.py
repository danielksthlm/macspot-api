import os
from dotenv import load_dotenv
load_dotenv()
from datetime import datetime

total_rader = 0
total_funktioner = 0
total_komplexitet = 0
total_todo = 0

# Lista över filnamn
import glob

filnamn_lista = [
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/frontend_webflow/webflow_init.html",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/frontend_webflow/embed_block_1_contact.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/frontend_webflow/embed_block_2_calendar.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/frontend_webflow/embed_block_3_booking.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/frontend_webflow/styles_init.css"
]

# Slutlig sammanslagen fil
output_fil = os.path.join("/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/frontend_webflow/frontend_history", f"AllFrontendCodes_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")

# Lista för saknade filer
saknade_filer = []
fil_summering = []
# Läs och skriv innehåll
with open(output_fil, "w", encoding="utf-8") as utfil:
    # Trädstruktur
    from collections import defaultdict

    def bygg_träd(paths):
        träd = lambda: defaultdict(träd)
        rot = träd()
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

    root_path = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/"
    filtrerat = [f for f in filnamn_lista if "node_modules" not in f]
    struktur = bygg_träd(filtrerat)
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
        config_filer += glob.glob(os.path.join(root_path, "**", filnamn), recursive=True)
    config_filer = [f for f in config_filer if "node_modules" not in f]


    if config_filer:
        for config_fil in sorted(config_filer):
            rel_path = os.path.relpath(config_fil, root_path)
            utfil.write(f"📄 {rel_path}\n")
            try:
                if os.path.basename(config_fil) == "host.json":
                    import json
                    with open(config_fil, "r", encoding="utf-8") as cf:
                        data = json.load(cf)
                with open(config_fil, "r", encoding="utf-8") as cf:
                    for rad in cf:
                        utfil.write("   " + rad)
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
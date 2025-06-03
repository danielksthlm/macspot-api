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

rotmapp = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/local_frontend"
# Hämta alla filer rekursivt (alla typer av filer)
filnamn_lista = glob.glob(os.path.join(rotmapp, "**"), recursive=True)
filnamn_lista = [f for f in filnamn_lista if os.path.isfile(f) and "history" not in f and "node_modules" not in f]

# Slutlig sammanslagen fil
output_fil = os.path.join(rotmapp, "history", f"AllLocalFrontend_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")

saknade_filer = []
# Läs och skriv innehåll
with open(output_fil, "w", encoding="utf-8") as utfil:
    # Trädstruktur
    from collections import defaultdict

    def bygg_träd(paths):
        träd = lambda: defaultdict(träd)
        rot = träd()
        for path in paths:
            delar = os.path.relpath(path, os.path.dirname(root_path)).split(os.sep)
            curr = rot
            for del_ in delar:
                curr = curr[del_]
        return rot

    def skriv_träd(node, depth=0):
        for namn in sorted(node.keys()):
            prefix = "│   " * depth + "├── "
            utfil.write(f"{prefix}{namn}\n")
            skriv_träd(node[namn], depth + 1)

    root_path = rotmapp
    filtrerat = [f for f in filnamn_lista if "node_modules" not in f and "history" not in f]
    struktur = bygg_träd(filtrerat)
    utfil.write("📂 KODTRÄD\n==========\n")
    skriv_träd(struktur)
    utfil.write("==========\n\n")

    for filnamn in filnamn_lista:
        visat_filnamn = os.path.basename(filnamn)
        rel_path = os.path.relpath(filnamn, root_path)
        # Bestäm kodtyp baserat på sökvägen och filnamn
        if visat_filnamn in ["index.html"]:
            kodtyp = "🧱 HTML-rot"
        elif visat_filnamn in ["vite.config.js"]:
            kodtyp = "⚙️ Vite-konfiguration"
        elif visat_filnamn.endswith(".css"):
            kodtyp = "🎨 Stilmall"
        elif visat_filnamn.endswith(".jsx"):
            kodtyp = "⚛️ React-komponent"
        elif "/shared/" in rel_path:
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
            kodtyp = f"📁 {os.path.dirname(rel_path)}"
        if os.path.exists(filnamn):
            # Läs filens rader
            with open(filnamn, "r", encoding="utf-8") as infil:
                rader = infil.readlines()

            huvudfunktion = ""
            externa_moduler = set()
            lokala_imports = set()
            api_anrop = set()
            css_klasser = set()

            antal_rader = len(rader)
            # Imports
            imports = []
            oanvända_imports = set()
            import_count = 0
            for rad in rader:
                rad_strip = rad.strip()
                if rad_strip.startswith("import "):
                    imports.append(rad_strip)
                    import_count += 1
                    if "from \"" in rad_strip or "from '" in rad_strip:
                        moddel = rad_strip.split("from")[-1].strip().strip("\"'")
                        if moddel.startswith("."):
                            lokala_imports.add(moddel)
                        else:
                            externa_moduler.add(moddel)
                elif "require(" in rad_strip:
                    imports.append(rad_strip)
                    import_count += 1
                    if "from \"" in rad_strip or "from '" in rad_strip:
                        moddel = rad_strip.split("from")[-1].strip().strip("\"'")
                        if moddel.startswith("."):
                            lokala_imports.add(moddel)
                        else:
                            externa_moduler.add(moddel)

            all_rader_sammanslagna = " ".join(rader)
            for imp in imports:
                imp_namn = ""
                if "from" in imp and "import" in imp:
                    imp_delar = imp.split("import")[1].split("from")[0].strip().replace("{", "").replace("}", "").split(",")
                    for namn in imp_delar:
                        if namn.strip() and namn.strip() not in all_rader_sammanslagna:
                            oanvända_imports.add(namn.strip())

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
                    if huvudfunktion == "":
                        if rad.startswith("function "):
                            huvudfunktion = rad.split()[1].split("(")[0]
                        elif "const " in rad and "=" in rad:
                            huvudfunktion = rad.split("const")[1].split("=")[0].strip()
                        elif "export default function " in rad:
                            huvudfunktion = rad.split("export default function ")[1].split("(")[0]
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

            for rad in rader:
                if "fetch(" in rad or "axios." in rad:
                    if "\"" in rad or "'" in rad:
                        parts = rad.split("fetch(") if "fetch(" in rad else rad.split("axios.")
                        for part in parts:
                            if "http" in part or "/" in part:
                                url_start = part.find("\"") if "\"" in part else part.find("'")
                                url_end = part.find("\"", url_start+1) if "\"" in part else part.find("'", url_start+1)
                                if url_start != -1 and url_end != -1:
                                    api = part[url_start+1:url_end]
                                    api_anrop.add(api)

            for rad in rader:
                if "className=" in rad or "class=" in rad:
                    delar = rad.split("className=") if "className=" in rad else rad.split("class=")
                    for d in delar[1:]:
                        start = d.find("\"")
                        end = d.find("\"", start+1)
                        if start != -1 and end != -1:
                            klasser = d[start+1:end].split()
                            css_klasser.update(klasser)

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
            inline_kommentarer = sum(1 for rad in rader if '//' in rad)
            block_kommentarer = max(0, kommentar_rader - inline_kommentarer)
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
            elif filnamn.endswith(".jsx"):
                kodspråk = "⚛️ React (JSX)"
            elif filnamn.endswith(".py"):
                kodspråk = "🐍 Python"
            elif filnamn.endswith(".json"):
                kodspråk = "🧾 JSON"
            elif filnamn.endswith(".html"):
                kodspråk = "🌐 HTML"
            elif filnamn.endswith(".css"):
                kodspråk = "🎨 CSS"
            elif filnamn.endswith(".sh"):
                kodspråk = "💻 Shellscript"
            elif filnamn.endswith(".md"):
                kodspråk = "📘 Markdown"
            else:
                ext = os.path.splitext(filnamn)[1]
                kodspråk = f"📁 Annan filtyp ({ext if ext else 'ingen ändelse'})"

            total_rader += antal_rader
            total_funktioner += funktion_count
            total_komplexitet += komplex_count
            total_todo += todo_count
            if 'all_css' not in locals():
                all_css = set()
            if 'all_apis' not in locals():
                all_apis = set()
            all_css.update(css_klasser)
            all_apis.update(api_anrop)

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

            if oanvända_imports:
                utfil.write(f"⚠️ Oanvända imports i {visat_filnamn}: {sorted(oanvända_imports)}\n")
            if externa_moduler:
                utfil.write(f"📦 Externa moduler: {', '.join(sorted(externa_moduler))}\n")
            if lokala_imports:
                utfil.write(f"📁 Lokala imports: {', '.join(sorted(lokala_imports))}\n")
            if api_anrop:
                utfil.write(f"🌍 API-anrop: {', '.join(sorted(api_anrop))}\n")
            if css_klasser:
                utfil.write(f"🎨 CSS-klasser: {', '.join(sorted(css_klasser))}\n")
            if huvudfunktion:
                utfil.write(f"📌 Huvudfunktion: {huvudfunktion}\n")
            utfil.write("====================\n")
            utfil.write(f"📄 Fil: {rel_path}\n")
            utfil.write(f"📂 Kodtyp: {kodtyp}\n")
            utfil.write(f"🗂 Filtyp: {kodspråk}\n")
            utfil.write(f"📅 Senast ändrad: {senast_andrad}\n")
            utfil.write(f"📏 Antal rader: {antal_rader}\n")
            utfil.write(f"🧩 Antal funktioner: {funktion_count}\n")
            utfil.write(f"💬 Kommentarstäckning: {kommentar_rader} rader ({(kommentar_rader / antal_rader * 100):.1f}%) – {inline_kommentarer} inline, {block_kommentarer} block\n")
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

    # Lista alla relevanta konfigurationsfiler i hela local_backend
    utfil.write("📁 KONFIGURATIONSFILER (function.json / host.json / package.json / .funcignore)\n")
    utfil.write("====================================\n\n")
    config_filer = []
    for filnamn in ["function.json", "host.json", "package.json", ".funcignore"]:
        config_filer += glob.glob(os.path.join(root_path, "**", filnamn), recursive=True)
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

    utfil.write("📈 SUMMERING AV ALLA KODFILER\n")
    utfil.write("====================================\n")
    utfil.write(f"📏 Totalt antal rader kod: {total_rader}\n")
    utfil.write(f"🧩 Totalt antal funktioner: {total_funktioner}\n")
    utfil.write(f"🧠 Total komplexitetspoäng: {total_komplexitet}\n")
    utfil.write(f"🧪 Antal TODO/FIXME totalt: {total_todo}\n\n")

    typ_summering = {}
    for row in fil_summering:
        typ = row[0].split(".")[-1]
        if typ not in typ_summering:
            typ_summering[typ] = {"filer": 0, "rader": 0}
        typ_summering[typ]["filer"] += 1
        typ_summering[typ]["rader"] += row[1]

    utfil.write("📚 Summering per kodtyp:\n")
    for typ, data in typ_summering.items():
        utfil.write(f"  • .{typ}: {data['filer']} filer, {data['rader']} rader\n")
    utfil.write("\n")

    utfil.write(f"🎨 Totalt antal unika CSS-klasser: {len(all_css)}\n")
    utfil.write(f"🌍 Totalt antal API-anrop: {len(all_apis)}\n\n")
    utfil.write("📊 Per fil:\n")
    utfil.write("fil,rader,funktioner,komplexitet,kommentarer,imports\n")
    for row in fil_summering:
        utfil.write(",".join(str(x) for x in row) + "\n")

if saknade_filer:
    print("⚠️ Följande filer hittades inte:")
    for fil in saknade_filer:
        print(f" - {fil}")

# Slutlig sammanslagen fil

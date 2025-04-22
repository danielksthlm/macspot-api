import os
from datetime import datetime

def samla_valda_filer_dynamiskt(projektrot="macspot-api"):
    filnamn_att_hitta = {
        "deploy.yml",
        "local.settings.json",
        "host.json",
        "index.js",
        "package-lock.json",
        "ping.js",
        "package.json"
    }

    rotväg = os.path.expanduser(f"/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/{projektrot}")
    hittade_filer = []

    # Sök i ROT-mappen (ej undermappar)
    for fil in os.listdir(rotväg):
        full_path = os.path.join(rotväg, fil)
        if os.path.isfile(full_path) and fil in filnamn_att_hitta:
            hittade_filer.append(full_path)

    # Sök i src/ och dess undermappar
    src_väg = os.path.join(rotväg, "src")
    if os.path.exists(src_väg):
        for mapp, _, filer in os.walk(src_väg):
            for fil in filer:
                if fil in filnamn_att_hitta:
                    hittade_filer.append(os.path.join(mapp, fil))

    # Sök i .github/workflows/
    workflows_väg = os.path.join(rotväg, ".github", "workflows")
    if os.path.exists(workflows_väg):
        for fil in os.listdir(workflows_väg):
            full_path = os.path.join(workflows_väg, fil)
            if os.path.isfile(full_path) and fil in filnamn_att_hitta:
                hittade_filer.append(full_path)

    # Skapa sammanslagen fil i rotmappen
    timestamp = datetime.now().strftime("%y%m%d_%H%M")
    utfil = os.path.join(rotväg, f"MergeFilesForAnalys_{timestamp}.txt")

    with open(utfil, "w", encoding="utf-8") as outfile:
        for filväg in hittade_filer:
            try:
                idx = filväg.index(projektrot)
                visad_väg = filväg[idx:]
            except ValueError:
                visad_väg = os.path.basename(filväg)

            try:
                with open(filväg, "r", encoding="utf-8") as f:
                    innehåll = f.read()
                outfile.write(f"\n======== FIL: {visad_väg} [START]========\n")
                outfile.write(innehåll)
                outfile.write(f"\n======== FIL: {visad_väg} [STOP]========\n\n")
            except Exception as e:
                outfile.write(f"\n======== FIL: {visad_väg} [KUNDE EJ LÄSAS: {e}] ========\n\n")

    print(f"Sammanställning klar: {utfil}")

# Kör funktionen
samla_valda_filer_dynamiskt()
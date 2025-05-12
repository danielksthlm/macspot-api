import os
from datetime import datetime

# Lista över filnamn
filnamn_lista = [
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/webflow/Embed Block 1.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/webflow/Embed Block 2.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/webflow/Embed Block 2b.js",
    "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/webflow/Embed Block 3.js"
]

# Slutlig sammanslagen fil
output_fil = os.path.join(os.path.dirname(__file__), f"webflowmerg_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")

# Läs och skriv innehåll
with open(output_fil, "w", encoding="utf-8") as utfil:
    for filnamn in filnamn_lista:
        visat_filnamn = os.path.basename(filnamn)
        if os.path.exists(filnamn):
            utfil.write(f"START: {visat_filnamn}\n")
            with open(filnamn, "r", encoding="utf-8") as infil:
                utfil.write(infil.read())
            utfil.write(f"\nEND: {visat_filnamn}\n\n")
        else:
            utfil.write(f"START: {visat_filnamn}\n")
            utfil.write(f"// ⚠️ Filen '{visat_filnamn}' hittades inte\n")
            utfil.write(f"END: {visat_filnamn}\n\n")

print(f"✅ Filer sammanfogade i {output_fil}")
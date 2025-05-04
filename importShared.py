import os

folder_path = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/shared"
output_file = os.path.join(folder_path, "samlad_kod.txt")

with open(output_file, "w", encoding="utf-8") as outfile:
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.endswith(".js"):
                file_path = os.path.join(root, file)
                relative_path = os.path.relpath(file_path, folder_path)
                print(f"Bearbetar: {relative_path}")
                try:
                    with open(file_path, "r", encoding="utf-8") as infile:
                        content = infile.read()
                        outfile.write(f"\n### Fil: {relative_path} ###\n")
                        outfile.write(content)
                        outfile.write("\n")
                except Exception as e:
                    print(f"Fel vid läsning av {file_path}: {e}")

print(f"Koden är samlad i filen: {output_file}")
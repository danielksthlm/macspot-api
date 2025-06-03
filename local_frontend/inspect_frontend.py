from selenium import webdriver
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.common.by import By
import time
import json
from datetime import datetime
from pathlib import Path
import zipfile
import shutil

timestamp = datetime.now().strftime("%Y%m%d_%H%M")
prefix = f"macspot_{timestamp}_"

export_dir = Path(__file__).parent / "ui_exports" / timestamp
export_dir.mkdir(parents=True, exist_ok=True)

# Rensa gamla exports (äldre än 7 dagar)
cutoff_time = time.time() - 7 * 86400
ui_exports_dir = Path(__file__).parent / "ui_exports"
for path in ui_exports_dir.iterdir():
    if path.is_dir():
        ts = path.name
        try:
            folder_time = datetime.strptime(ts, "%Y%m%d_%H%M").timestamp()
            if folder_time < cutoff_time:
                shutil.rmtree(path)
                print(f"🗑️ Rensade gammal mapp: {path}")
        except ValueError:
            pass  # hoppa över mappar med annan namnstruktur

# Setup
options = Options()
options.add_argument("--headless")
driver = webdriver.Firefox(options=options)

# 1. Öppna sidan
driver.get("http://localhost:5173")
time.sleep(2)

# 2. Ta skärmdump
driver.save_screenshot(str(export_dir / f"{prefix}frontend_snapshot.png"))
print(f"📸 Skärmdump sparad som '{prefix}frontend_snapshot.png'.")

# 3. DOM-elementbeskrivning
elements = driver.find_elements(By.CSS_SELECTOR, "*")
snapshot = []

for el in elements[:50]:
    try:
        snapshot.append({
            "tag": el.tag_name,
            "classes": el.get_attribute("class"),
            "text": el.text[:50],
            "bbox": el.rect
        })
    except Exception:
        pass

with open(export_dir / f"{prefix}dom_snapshot.json", "w") as f:
    json.dump(snapshot, f, indent=2, ensure_ascii=False)
print(f"📄 DOM-snapshot sparad i '{prefix}dom_snapshot.json'.")

# Export full HTML
with open(export_dir / f"{prefix}frontend_snapshot.html", "w", encoding="utf-8") as f:
    f.write(driver.page_source)
print(f"🧾 Fullständig HTML sparad som '{prefix}frontend_snapshot.html'.")

# Extract styles for multiple mac-* classes
classes_to_check = ["mac-card", "mac-panel", "mac-btn"]
for cls in classes_to_check:
    try:
        el = driver.find_element(By.CLASS_NAME, cls)
        styles = driver.execute_script("""
          var s = window.getComputedStyle(arguments[0]);
          return Object.fromEntries([...s].map(k => [k, s.getPropertyValue(k)]));
        """, el)
        with open(export_dir / f"{prefix}{cls}_styles.json", "w") as f:
            json.dump(styles, f, indent=2)
        print(f"🎨 CSS-stil sparad i '{prefix}{cls}_styles.json'.")
    except:
        print(f"⚠️ Kunde inte hämta stil för .{cls}")

print("\n✅ Inspektionskörning färdig. Filer genererade:")
print(f" - {prefix}frontend_snapshot.png")
print(f" - {prefix}dom_snapshot.json")
print(f" - {prefix}frontend_snapshot.html")
for cls in classes_to_check:
    print(f" - {prefix}{cls}_styles.json")

# 7. Generera HTML-baserad stilrapport
report = [f"<html><head><title>MacSpot UI-stilrapport</title><style>body{{font-family:-apple-system;}}table{{border-collapse:collapse;margin-bottom:2rem;}}td,th{{border:1px solid #ccc;padding:4px 8px;}}th{{background:#eee}}</style></head><body>"]
report.append("<h1>🧪 Stilrapport: MacSpot</h1>")
report.append(f"<p><a href='{prefix}frontend_snapshot.png' target='_blank'>📸 Visa skärmdump</a> | <a href='{prefix}frontend_snapshot.html' target='_blank'>🧾 Visa HTML</a></p>")

# Sammanställ alla stilar i en tabell
merged_keys = set()
style_data = {}
for cls in classes_to_check:
    path = export_dir / f"{prefix}{cls}_styles.json"
    if path.exists():
        data = json.loads(path.read_text())
        style_data[cls] = data
        merged_keys.update(data.keys())

report.append("<h2>📊 Jämförelsetabell</h2>")
report.append("<table><tr><th>Egenskap</th>" + "".join(f"<th>{cls}</th>" for cls in classes_to_check) + "</tr>")
for key in sorted(merged_keys):
    report.append("<tr><td>{}</td>".format(key))
    # För att markera avvikelser, samla alla värden för denna key
    cell_values = [style_data.get(cls, {}).get(key, "") for cls in classes_to_check]
    unique_values = set(cell_values)
    for idx, cls in enumerate(classes_to_check):
        value = cell_values[idx]
        css = ""
        if not value.strip():
            css = " style='background:#f0f0f0;color:#888'"
        elif len({style_data.get(cls2, {}).get(key, "") for cls2 in classes_to_check if cls2 in style_data}) > 1:
            css = " style='background:#fff2cc'"
        report.append(f"<td{css}>{value}</td>")
    report.append("</tr>")
report.append("</table>")

for cls in classes_to_check:
    path = export_dir / f"{prefix}{cls}_styles.json"
    if path.exists():
        data = json.loads(path.read_text())
        # Lägg till semantisk struktur för framtida utökning
        report.append(f"<section>")
        report.append(f"<h2>{cls}</h2>")
        report.append("<!-- Gruppindelning av CSS-egenskaper för ökad överskådlighet -->")
        # Gruppindelning av CSS-egenskaper
        layout_keys = [
            "display", "position", "top", "right", "bottom", "left", "z-index", "float", "clear",
            "box-sizing", "width", "height", "min-width", "min-height", "max-width", "max-height", "margin", "padding", "overflow"
        ]
        text_keys = [
            "font", "font-family", "font-size", "font-weight", "line-height", "letter-spacing",
            "text-align", "text-transform", "white-space", "word-break", "color"
        ]
        color_keys = [
            "background", "background-color", "border", "border-color", "box-shadow"
        ]
        # Övriga keys samlas här
        other_keys = [k for k in sorted(data.keys()) if k not in layout_keys + text_keys + color_keys]
        grouped = [
            ("🧱 Layout", layout_keys),
            ("🔤 Typografi", text_keys),
            ("🎨 Färg & bakgrund", color_keys),
            ("🧩 Övrigt", other_keys)
        ]
        for label, keys in grouped:
            report.append(f"<h3>{label}</h3>")
            report.append("<table><tr><th>CSS-egenskap</th><th>Värde</th></tr>")
            for key in keys:
                if key in data and data[key].strip():
                    report.append(f"<tr><td>{key}</td><td>{data[key]}</td></tr>")
            report.append("</table>")
        report.append("</section>")
    else:
        report.append(f"<p style='color:red;'>⚠️ Filen <code>{prefix}{cls}_styles.json</code> hittades inte.</p>")

# 8. Generera mac_base.css med gemensamma stilar
common_props = {}
for key in sorted(merged_keys):
    values = [style_data.get(cls, {}).get(key, "") for cls in classes_to_check]
    if all(v == values[0] and v.strip() for v in values):
        common_props[key] = values[0]

report.append("<h2>🚦 Avvikelser från .mac-base</h2>")
for cls in classes_to_check:
    path = export_dir / f"{prefix}{cls}_styles.json"
    if path.exists():
        data = json.loads(path.read_text())
        diff = {k: v for k, v in data.items() if k in common_props and v != common_props[k]}
        if diff:
            report.append(f"<h3>{cls}</h3>")
            report.append("<table><tr><th>CSS-egenskap</th><th>mac-base</th><th>Avvikelse</th></tr>")
            for k in sorted(diff):
                report.append(f"<tr><td>{k}</td><td>{common_props.get(k, '')}</td><td>{diff[k]}</td></tr>")
            report.append("</table>")
        else:
            report.append(f"<p><strong>{cls}</strong> har inga avvikelser från <code>.mac-base</code>.</p>")
report.append("</body></html>")
(export_dir / f"{prefix}style_report.html").write_text("\n".join(report), encoding="utf-8")
print(f"📊 Stilrapport sparad som '{prefix}style_report.html'")

base_css = [".mac-base {"]
for k, v in common_props.items():
    base_css.append(f"  {k}: {v};")
base_css.append("}")

(export_dir / f"{prefix}mac_base.css").write_text("\n".join(base_css), encoding="utf-8")
print(f"🧱 Föreslagen gemensam stil sparad som '{prefix}mac_base.css'")

# 9. Skapa mac-unified.css där varje klass bygger på .mac-base
unified = [".mac-base {"]
for k, v in common_props.items():
    unified.append(f"  {k}: {v};")
unified.append("}\n")

for cls in classes_to_check:
    path = export_dir / f"{prefix}{cls}_styles.json"
    if path.exists():
        data = json.loads(path.read_text())
        unified.append(f".{cls} {{")
        for k, v in data.items():
            if k not in common_props and v.strip():
                unified.append(f"  {k}: {v};")
        unified.append("}\n")

(export_dir / f"{prefix}mac_unified.css").write_text("\n".join(unified), encoding="utf-8")
print(f"📦 Komplett stil sparad som '{prefix}mac_unified.css'")

# 10. Skapa dokumentation för mac-klasser
doc = [
    "<html><head><title>MacSpot UI-dokumentation</title>",
    f"<link rel='stylesheet' href='{prefix}mac_base.css'>",
    f"<link rel='stylesheet' href='{prefix}mac_unified.css'>",
    "<style>body{font-family:-apple-system;}section{margin:2rem 0;}h2{margin-top:1rem;}div.sample{border:1px solid #ccc;padding:1rem;border-radius:8px;margin-top:0.5rem;width:fit-content;}</style></head><body>"
]
doc.append("<h1>📚 MacSpot UI-komponenter</h1>")
for cls in classes_to_check:
    doc.append(f"<section><h2>.{cls}</h2>")
    doc.append(f"<div class='sample {cls}'>Exempel på .{cls}</div></section>")
doc.append("</body></html>")
(export_dir / f"{prefix}mac_documentation.html").write_text("\n".join(doc), encoding="utf-8")
print(f"📘 Dokumentation sparad som '{prefix}mac_documentation.html'")

# 11. Ta skärmdump av dokumentationssidan
try:
    doc_options = Options()
    doc_options.add_argument("--headless")
    doc_driver = webdriver.Firefox(options=doc_options)
    doc_driver.get("file://" + str((export_dir / f"{prefix}mac_documentation.html").resolve()))
    time.sleep(2)
    doc_driver.save_screenshot(str(export_dir / f"{prefix}mac_documentation.png"))
    print(f"📸 Dokumentationsskärmdump sparad som '{prefix}mac_documentation.png'")
    doc_driver.quit()
except Exception as e:
    print(f"⚠️ Kunde inte skapa skärmdump av dokumentationen: {e}")



driver.quit()
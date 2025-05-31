BASE = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api"


import os
import subprocess
from datetime import datetime
import sys
import psycopg2
import json

# Delad json- och metadata-funktionalitet som används i flera synkmoduler
def safe_json_load(data, default={}):
    try:
        return json.loads(data) if isinstance(data, str) else data
    except Exception:
        return default

def metadata_equal(meta1, meta2):
    m1 = safe_json_load(meta1)
    m2 = safe_json_load(meta2)
    return m1 == m2

log_dir = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot"
log_out = os.path.join(log_dir, "macspot_sync.log")
log_err = os.path.join(log_dir, "macspot_sync_error.log")

# Se till att loggfilerna existerar
for path in [log_out, log_err]:
    if not os.path.exists(path):
        with open(path, 'w'):
            pass

# Skriv ut manuell/automatisk körningsinfo till loggen
is_manual = sys.stdout.isatty()
sys.stdout = open(log_out, 'a')
sys.stderr = open(log_err, 'a')
if is_manual:
    print(f"🖐️ Manuell körning: {datetime.now().isoformat()}")
else:
    print(f"🤖 Automatisk körning via launchd: {datetime.now().isoformat()}")

def run_script(name, script_path):
    subprocess.run(["python", f"{BASE}/{script_path}"], check=True)

try:
    start_time = datetime.now()
    def is_database_online(host, port):
        import socket
        try:
            socket.create_connection((host, port), timeout=2)
            return True
        except:
            return False

    def run_healthcheck():
        try:
            subprocess.run(["python", f"{BASE}/healthcheck_sync.py"], check=True)
        except Exception as e:
            print(f"❌ Healthcheck misslyckades: {e}")

    # Kontrollera att båda databaser är online innan sync startar
    if not is_database_online("localhost", 5433):
        print("❌ Lokal databas är inte tillgänglig (localhost:5433)")
        exit(1)

    if not is_database_online("macspotpg.postgres.database.azure.com", 5432):
        print("❌ Azure-databasen är inte tillgänglig (macspotpg.postgres.database.azure.com:5432)")
        exit(1)

    print(f"📌 Körning initierad: {datetime.now().isoformat()}")

    print("🧪 Kör healthcheck_sync.py...")
    run_healthcheck()

    print(f"\n🔄 [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Startar fullständig synk...")

    scripts_part1 = [
        ("🟡 Kör sync.py...", "sync.py"),
        ("🟢 Kör sync_to_cloud.py...", "sync_to_cloud.py")
    ]

    for msg, script in scripts_part1:
        run_script(msg, script)

    scripts_part2 = [
        ("🔵 Kör sync_from_cloud.py...", "sync_from_cloud.py")
    ]

    for msg, script in scripts_part2:
        run_script(msg, script)

    today_prefix = datetime.now().strftime('%Y%m%d')
    outbox_dir = os.path.join(BASE, 'sync_outbox')
    files = [f for f in os.listdir(outbox_dir) if f.startswith(today_prefix)]
    files_with_type = [f for f in files if len(f.split("_")) >= 3]
    num_changes = len(files_with_type)

    if num_changes == 0:
        print("ℹ️ Ingen förändring hittades att synka.")
        print("📭 Inga fler ändringar kvar i pending_changes.")
    else:
        print(f"📤 Totalt {num_changes} ändring(ar) skickades till molnet:")
        files = [f for f in sorted(os.listdir(outbox_dir)) if f.startswith(today_prefix)]
        summary = {}
        for f in files:
            parts = f.split("_")
            if len(parts) >= 3:
                typ = parts[2].split(".")[0]
                summary[typ] = summary.get(typ, 0) + 1

        if summary:
            print("🧾 Sammanfattning per typ:")
            for typ, count in summary.items():
                print(f"   • {typ}: {count} st")

        # --- Kontrollera och skriv ut äldre JSON-filer i sync_outbox ---
        old_files = [f for f in os.listdir(outbox_dir) if not f.startswith(today_prefix)]
        if old_files:
            print("📂 Äldre JSON-filer som ligger kvar i sync_outbox:")
            for f in old_files:
                print(f"   • {f}")

        print("📊 Kontroll av återstående ändringar i pending_changes...")

        # Lokalt
        local = psycopg2.connect(
            dbname="macspot",
            user="postgres",
            host="localhost",
            port=5433
        )
        cur_local = local.cursor()
        cur_local.execute("""
            SELECT COUNT(*) FROM pending_changes
            WHERE direction = 'out' AND processed = false
        """)
        out_local = cur_local.fetchone()[0]
        cur_local.execute("""
            SELECT COUNT(*) FROM pending_changes
            WHERE direction = 'out' AND processed = false
            GROUP BY record_id
        """)
        print(f"   • Lokalt → molnet: {out_local} ändring(ar) kvar över {cur_local.rowcount} kontakt(er).")
        cur_local.close()
        local.close()

        # Molnet
        cloud = psycopg2.connect(
            dbname="postgres",
            user="daniel",
            host="macspotpg.postgres.database.azure.com",
            port=5432
        )
        cur_cloud = cloud.cursor()
        cur_cloud.execute("""
            SELECT COUNT(*) FROM pending_changes
            WHERE direction = 'out' AND processed = false
        """)
        out_cloud = cur_cloud.fetchone()[0]
        cur_cloud.execute("""
            SELECT COUNT(*) FROM pending_changes
            WHERE direction = 'out' AND processed = false
            GROUP BY record_id
        """)
        cur_cloud.close()
        cloud.close()

    print(f"\n✅ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fullständig synk körd.")

except Exception as e:
    import traceback
    print("❌ Ett oväntat fel inträffade under körningen:")
    print(traceback.format_exc())

finally:
    print(f"🏁 Körning avslutad: {datetime.now().isoformat()}")
    duration = datetime.now() - start_time
    print(f"⏱️ Total körtid: {int(duration.total_seconds())} sekunder")
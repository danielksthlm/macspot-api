BASE = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api"


import os
import subprocess
from datetime import datetime, timezone
import sys
import psycopg2
import json
from sync_from_cloud import sync as sync_from_cloud

with open("/tmp/launchd_debug.txt", "a") as f:
    f.write("[sync_all.py] Körning initierad\n")


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
is_manual = os.environ.get("LAUNCHD_RUN") != "true"
log_mode = "MANUELL" if is_manual else "AUTOMATISK (launchd)"
with open("/tmp/env_debug.txt", "a") as f:
    f.write(f"LAUNCHD_RUN: {os.environ.get('LAUNCHD_RUN')}\n")
# Debug environment variables to file
with open("/tmp/env_debug.txt", "w") as f:
    f.write(str(dict(os.environ)))
out = open(log_out, 'a')
err = open(log_err, 'a')
sys.stdout = out
sys.stderr = err
print(f"🚀 Körläge: {log_mode} – {datetime.now(timezone.utc).isoformat()}")

def run_script(name, script_path):
    subprocess.run(["/Users/danielkallberg/Documents/KLR_AI/venv/bin/python", f"{BASE}/{script_path}"], check=True)

try:
    start_time = datetime.now(timezone.utc)
    local_db_ok = True
    cloud_db_ok = True
    def is_database_online(host, port):
        import socket
        try:
            socket.create_connection((host, port), timeout=2)
            return True
        except:
            return False

    def run_healthcheck():
        try:
            subprocess.run(
                ["/Users/danielkallberg/Documents/KLR_AI/venv/bin/python", f"{BASE}/healthcheck_sync.py"],
                check=True
            )
        except Exception as e:
            print(f"❌ Healthcheck misslyckades: {e}")

    # Kontrollera att båda databaser är online innan sync startar
    if not is_database_online("localhost", 5433):
        print("❌ Lokal databas är inte tillgänglig (localhost:5433)")
        local_db_ok = False
        exit(1)

    if not is_database_online("macspotpg.postgres.database.azure.com", 5432):
        print("❌ Azure-databasen är inte tillgänglig (macspotpg.postgres.database.azure.com:5432)")
        cloud_db_ok = False
        exit(1)

    print(f"📌 Körning initierad: {datetime.now(timezone.utc).isoformat()}")

    print("🧪 Kör healthcheck_sync.py...")
    run_healthcheck()

    print(f"\n🔄 [{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}] Startar fullständig synk...")

    # Kör sync.py först
    run_script("🟡 Kör sync.py...", "sync.py")

    # Efter sync.py, kontrollera om det finns diffar i event_log
    # Efter sync.py, kontrollera om det finns diffar i event_log
    with psycopg2.connect(dbname="macspot", user="postgres", host="localhost", port=5433) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) FROM event_log
                WHERE received_at > now() - interval '5 minutes'
                  AND event_type IN ('sync_local_diff_contacts', 'sync_local_diff_bookings')
            """)
            diff_count = cur.fetchone()[0]
            if diff_count > 0:
                print(f"🚦 Det finns {diff_count} diff-loggar från sync.py – överväg att köra sync_to_cloud.py manuellt eller automatiskt.")
                print("⚙️ Kör sync_generate_pending_from_diff.py för att skapa riktiga pending_changes...")
                run_script("⚙️ Kör sync_generate_pending_from_diff.py...", "sync_generate_pending_from_diff.py")

    # Kör sync_to_cloud.py efter kontrollen
    run_script("🟢 Kör sync_to_cloud.py...", "sync_to_cloud.py")


    # Kör generate_fromcloud_pending.py om event_log innehåller sync_fromcloud_mismatch
    with psycopg2.connect(dbname="macspot", user="postgres", host="localhost", port=5433) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT COUNT(*) FROM event_log
                WHERE received_at > now() - interval '5 minutes'
                  AND event_type IN ('sync_mismatch_contact', 'sync_fromcloud_mismatch')
            """)
            cloud_diff_count = cur.fetchone()[0]
            if cloud_diff_count > 0:
                print(f"🚦 Det finns {cloud_diff_count} moln→lokalt-diffar – kör sync_generate_fromcloud_pending.py...")
                run_script("⚙️ Kör sync_generate_fromcloud_pending.py...", "sync_generate_fromcloud_pending.py")

    today_prefix = datetime.now(timezone.utc).strftime('%Y%m%d')
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

    out_cloud, tracking_count = sync_from_cloud()

    print(f"\n✅ [{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')}] Fullständig synk körd.")

    # Sammanfatta diff-loggar (senaste 5 poster, med email och tabell-format)
    with psycopg2.connect(dbname="macspot", user="postgres", host="localhost", port=5433) as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT received_at, event_type, payload->>'email'
                FROM event_log
                WHERE received_at > now() - interval '10 minutes'
                  AND event_type IN ('sync_local_diff_contacts', 'sync_local_diff_bookings', 'sync_mismatch_contact', 'sync_fromcloud_mismatch')
                ORDER BY received_at DESC
                LIMIT 5
            """)
            rows = cur.fetchall()
            if rows:
                print("📜 Senaste 5 event_log-poster:")
                print("| tidpunkt            | event_type              | e-post                     |")
                print("|---------------------|--------------------------|-----------------------------|")
                for received_at, event_type, email in rows:
                    print(f"| {received_at.strftime('%Y-%m-%d %H:%M:%S')} | {event_type:<24} | {email or '(okänd)':<27} |")
            else:
                print("📜 Inga event_log-poster senaste 10 minuter.")

except Exception as e:
    import traceback
    print("❌ Ett oväntat fel inträffade under körningen:")
    print(traceback.format_exc())

finally:
    print(f"🏁 Körning avslutad: {datetime.now(timezone.utc).isoformat()}")
    duration = datetime.now(timezone.utc) - start_time

    # Räkna antal lyckade synkar och tracking_event
    synced_out = out_local if 'out_local' in locals() else 0
    synced_in = out_cloud if 'out_cloud' in locals() else 0

    print(f"⏱️ Total körtid: {int(duration.total_seconds())} sekunder")
    # Visa macOS-notis om synken är färdig (endast på Mac)
    import subprocess
    try:
        if not local_db_ok or not cloud_db_ok:
            status_msg = "❌ Fel: "
            if not local_db_ok:
                status_msg += "lokal DB nere. "
            if not cloud_db_ok:
                status_msg += "moln-DB nere. "
        else:
            status_msg = f"Synk klar: {synced_out} ut, {synced_in} in, {tracking_count} tracking-events"

        subprocess.run([
            "/opt/homebrew/bin/terminal-notifier",
            "-title", "MacSpot Sync",
            "-message", status_msg,
            "-appIcon", "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/klrab.icns",
            "-open", "file:///Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot_sync.log"
        ])
    except Exception as e:
        print(f"⚠️ Kunde inte visa notis med terminal-notifier: {e}")
    out.close()
    err.close()
BASE = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api"

import os
import subprocess
from datetime import datetime

def is_database_online(host, port):
    import socket
    try:
        socket.create_connection((host, port), timeout=2)
        return True
    except:
        return False

# Kontrollera att båda databaser är online innan sync startar
if not is_database_online("localhost", 5433):
    print("❌ Lokal databas är inte tillgänglig (localhost:5433)")
    exit(1)

if not is_database_online("macspotpg.postgres.database.azure.com", 5432):
    print("❌ Azure-databasen är inte tillgänglig (macspotpg.postgres.database.azure.com:5432)")
    exit(1)

print(f"\n🔄 [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Startar fullständig synk...")

scripts_part1 = [
    ("🟡 Kör sync.py...", "sync.py"),
    ("🟢 Kör sync_to_cloud.py...", "sync_to_cloud.py")
]

for msg, script in scripts_part1:
    print(f"\n{msg}")
    subprocess.run(["python", f"{BASE}/{script}"], check=True)

# Cleanup: remove 'force_resync' from metadata in local database BEFORE sync_from_cloud.py
import psycopg2
conn = psycopg2.connect(
    dbname="macspot",
    user="postgres",
    host="localhost",
    port=5433
)
cur = conn.cursor()
cur.execute("""
    UPDATE contact
    SET metadata = metadata - 'force_resync'
    WHERE metadata ? 'force_resync';
""")
conn.commit()
cur.close()
conn.close()
print("🧹 force_resync tag bort från metadata")

scripts_part2 = [
    ("🔵 Kör sync_from_cloud.py...", "sync_from_cloud.py")
]

for msg, script in scripts_part2:
    print(f"\n{msg}")
    subprocess.run(["python", f"{BASE}/{script}"], check=True)

today_prefix = datetime.now().strftime('%Y%m%d')
outbox_dir = os.path.join(BASE, 'sync_outbox')
num_changes = len([f for f in os.listdir(outbox_dir) if f.startswith(today_prefix)])


print(f"\n✅ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fullständig synk färdig! {num_changes} ändring(ar) skickades.")

# --- Efter alla andra operationer: Rensa postal_number och sätt force_resync för daniel@anynode.se ---
import psycopg2
import json

conn = psycopg2.connect(
    dbname="macspot",
    user="postgres",
    host="localhost",
    port=5433
)
cur = conn.cursor()

cur.execute("SELECT id, metadata FROM contact WHERE booking_email = 'daniel@anynode.se'")
row = cur.fetchone()
if row:
    contact_id, metadata = row
    metadata = json.loads(metadata) if isinstance(metadata, str) else metadata
    if 'postal_number' in metadata:
        print("🧹 Tar bort 'postal_number' från metadata...")
        del metadata['postal_number']
    metadata['force_resync'] = True
    cur.execute("UPDATE contact SET metadata = %s WHERE id = %s", (json.dumps(metadata), contact_id))
    conn.commit()
    print("✅ Uppdaterad metadata med force_resync")
else:
    print("❗ Kunde inte hitta kontakt med e-post daniel@anynode.se")

cur.close()
conn.close()
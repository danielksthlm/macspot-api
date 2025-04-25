import socket
import sys

def is_database_online(host, port):
    try:
        socket.create_connection((host, port), timeout=2)
        return True
    except:
        return False

# Kontrollera att båda databaser är online innan sync startar
if not is_database_online("localhost", 5433):
    print("❌ Lokal databas är inte tillgänglig (localhost:5433)")
    sys.exit(1)

if not is_database_online("macspotpg.postgres.database.azure.com", 5432):
    print("❌ Azure-databasen är inte tillgänglig (macspotpg.postgres.database.azure.com:5432)")
    sys.exit(1)

import subprocess
from datetime import datetime
import os
print(f"\n🔄 [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Startar fullständig synk...")

# Exportera lokala ändringar till JSON
print("\n🟡 Kör sync.py...")
BASE = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api"

subprocess.run(["python", f"{BASE}/sync.py"], check=True)

# Ladda upp till molnet
print("\n🟢 Kör sync_to_cloud.py...")
subprocess.run(["python", f"{BASE}/sync_to_cloud.py"], check=True)

# Hämta från molnet till lokal databas
print("\n🔵 Kör sync_from_cloud.py...")
subprocess.run(["python", f"{BASE}/sync_from_cloud.py"], check=True)

# Räkna antal exporterade ändringar idag
today_prefix = datetime.now().strftime('%Y%m%d')
outbox_dir = os.path.join(BASE, 'sync_outbox')
num_changes = len([f for f in os.listdir(outbox_dir) if f.startswith(today_prefix)])

print(f"\n✅ [{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Fullständig synk färdig! {num_changes} ändring(ar) skickades.")
import psycopg2
import json
from pathlib import Path
from datetime import datetime
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

# Skapa en mapp för sync-data
Path("sync_outbox").mkdir(exist_ok=True)

# Anslutning till lokal PostgreSQL
conn = psycopg2.connect(**LOCAL_DB_CONFIG)
cursor = conn.cursor()

# Hämta osynkade ändringar
cursor.execute("""
    SELECT id, table_name, record_id, operation, payload, created_at
    FROM pending_changes
    WHERE processed = false AND direction = 'out'
    ORDER BY created_at ASC
""")

rows = cursor.fetchall()

# Skapa exportformat
export = []
for row in rows:
    change_id, table, record_id, operation, payload, created_at = row
    export.append({
        "change_id": str(change_id),
        "table": table,
        "operation": operation,
        "data": payload
    })

# Spara till JSON-fil med tidsstämpel
if export:
    filename = f"sync_outbox/{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=2, ensure_ascii=False)
    print(f"Exporterat {len(export)} poster till {filename}")
else:
    print("Inga osynkade poster.")

cursor.close()
conn.close()

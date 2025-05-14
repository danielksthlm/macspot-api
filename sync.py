import psycopg2
import json
from datetime import datetime
from config import LOCAL_DB_CONFIG

# Anslutning till lokal PostgreSQL
conn = psycopg2.connect(**LOCAL_DB_CONFIG)
cursor = conn.cursor()

# Rensa äldre UPDATE-rader (endast senaste behövs per record_id)
cursor.execute("""
    DELETE FROM pending_changes pc
    WHERE operation = 'UPDATE'
      AND processed = false
      AND direction = 'out'
      AND id NOT IN (
        SELECT id FROM (
          SELECT id,
                 ROW_NUMBER() OVER (PARTITION BY record_id ORDER BY created_at DESC) AS rn
          FROM pending_changes
          WHERE operation = 'UPDATE'
            AND processed = false
            AND direction = 'out'
        ) sub
        WHERE rn = 1
      );
""")

# Hämta EN ändring per kontakt (record_id) – endast senaste per kontakt exporteras med hjälp av ROW_NUMBER()
cursor.execute("""
    SELECT id, table_name, record_id, operation, payload, created_at
    FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY record_id ORDER BY created_at DESC) as rn
        FROM pending_changes
        WHERE processed = false AND direction = 'out'
    ) sub
    WHERE rn = 1
""")

rows = cursor.fetchall()

# Filtrera bort poster där metadata är identisk med befintlig kontakt
filtered_rows = []
for row in rows:
    change_id, table, record_id, operation, payload, created_at = row
    data = json.loads(payload) if isinstance(payload, str) else payload
    if table == "contact" and operation == "UPDATE":
        try:
            cursor.execute("SELECT metadata FROM contact WHERE id = %s", (record_id,))
            result = cursor.fetchone()
            if result:
                current_metadata = result[0] if isinstance(result[0], dict) else json.loads(result[0])
                incoming_metadata = data.get("metadata")
                if isinstance(incoming_metadata, str):
                    incoming_metadata = json.loads(incoming_metadata)
                if current_metadata == incoming_metadata:
                    continue
        except Exception as e:
            print(f"⚠️ Kunde inte jämföra metadata för {record_id}: {e}")
    filtered_rows.append(row)
rows = filtered_rows

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
    first_type = export[0]["table"] if export else "unknown"
    filename = f"sync_outbox/{datetime.now().strftime('%Y%m%d_%H%M%S')}_{first_type}.json"
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(export, f, indent=2, ensure_ascii=False)

cursor.close()
conn.close()

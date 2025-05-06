import psycopg2
import json
from config import LOCAL_DB_CONFIG

def connect_db(config):
    return psycopg2.connect(**config)

def apply_change(cur, table, operation, payload):
    # Om force_resync finns i metadata, alltid kör UPDATE utan tidsjämförelse
    skip_merge = False
    if 'metadata' in payload and table == 'contact':
        meta = json.loads(payload['metadata']) if isinstance(payload['metadata'], str) else payload['metadata']
        if meta.pop('force_resync', False):
            print("🔁 Tvingad synk via force_resync – ersätter metadata fullständigt")
            payload['metadata'] = json.dumps(meta)
            print(f"🧨 force_resync: Ersätter metadata fullständigt med: {payload['metadata']}")
            operation = 'UPDATE'
            payload["_force_resync_applied"] = True
        else:
            skip_merge = False

    if operation == "INSERT":
        cols = ", ".join(payload.keys())
        placeholders = ", ".join(["%s"] * len(payload))
        sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
        cur.execute(sql, [json.dumps(v) if isinstance(v, dict) else v for v in payload.values()])
    elif operation == "UPDATE":
        if not payload.get("_force_resync_applied") and table == "contact" and "metadata" in payload:
            cur.execute(f"SELECT metadata FROM {table} WHERE id = %s", (payload["id"],))
            row = cur.fetchone()
            if row and row[0]:
                existing_metadata = row[0] if isinstance(row[0], dict) else json.loads(row[0])
                incoming_metadata = payload["metadata"] if isinstance(payload["metadata"], dict) else json.loads(payload["metadata"])
                print(f"🔍 Före merge – lokal metadata: {json.dumps(existing_metadata)}")
                print(f"🔍 Incoming metadata från moln: {json.dumps(incoming_metadata)}")
                existing_metadata.update(incoming_metadata)
                print(f"🧬 Efter merge – metadata som kommer sparas lokalt: {json.dumps(existing_metadata)}")
                payload["metadata"] = existing_metadata
        sets = ", ".join([f"{col} = %s" for col in payload if col != "id"])
        values = [json.dumps(payload[col]) if isinstance(payload[col], dict) else payload[col] for col in payload if col != "id"]
        values.append(payload["id"])
        sql = f"UPDATE {table} SET {sets} WHERE id = %s"
        cur.execute(sql, values)
    elif operation == "DELETE":
        sql = f"DELETE FROM {table} WHERE id = %s"
        cur.execute(sql, [payload["id"]])

def sync():
    print("🔗 Ansluter till remote databasen...")
    remote_conn = connect_db(LOCAL_DB_CONFIG)
    remote_cur = remote_conn.cursor()

    print("🔗 Ansluter till lokal databasen...")
    local_conn = connect_db(LOCAL_DB_CONFIG)
    local_cur = local_conn.cursor()

    print("📥 Hämtar pending_changes från remote...")
    remote_cur.execute("""
        SELECT id, table_name, operation, payload
        FROM pending_changes
        WHERE direction = 'in' AND processed = false
        ORDER BY created_at ASC
    """)

    rows = remote_cur.fetchall()
    print(f"📊 Totalt {len(rows)} ändringar att synka.")
    count = 0
    for row in rows:
        change_id, table, operation, payload_json = row
        try:
            payload = payload_json if isinstance(payload_json, dict) else json.loads(payload_json)
            print(f"🔄 Behandlar: table={table}, operation={operation}, id={payload.get('id')}")
            # Skippa om ID är ogiltig UUID-sträng
            if not isinstance(payload.get("id"), str) or "your-generated-id" in payload.get("id"):
                print(f"⏭ Hoppar över ogiltig ID: {payload.get('id')}")
                continue
            apply_change(local_cur, table, operation, payload)
            print(f"✅ Utförde {operation} på {table}.")
            if table == "bookings" and operation == "INSERT":
                pass  # Notis borttagen
            local_cur.execute("""
                INSERT INTO event_log (id, source, event_type, payload, received_at)
                VALUES (gen_random_uuid(), %s, %s, %s, now())
            """, ('sync', f"{operation.lower()}_{table}", json.dumps(payload)))
            remote_cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", [change_id])
            print(f"✅ Synkade: {operation} på {table}")
            count += 1
        except Exception as e:
            print(f"❌ Fel vid synk för {table}: {e}")
            continue

    print("💾 Sparar ändringar i lokal databas...")
    local_conn.commit()
    print("💾 Sparar ändringar i remote databas...")
    remote_conn.commit()

    print("🔒 Stänger databasanslutningar...")
    local_cur.close()
    remote_cur.close()
    local_conn.close()
    remote_conn.close()
    print("🚀 Sync klar.")
    print(f"✅ Totalt {count} ändring(ar) importerades från molnet.")

if __name__ == "__main__":
    sync()
import psycopg2
import json
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def connect_db(config):
    return psycopg2.connect(**config)

def apply_change(cur, table, operation, payload):
    if operation == "INSERT":
        cols = ", ".join(payload.keys())
        placeholders = ", ".join(["%s"] * len(payload))
        sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
        cur.execute(sql, [json.dumps(v) if isinstance(v, dict) else v for v in payload.values()])
    elif operation == "UPDATE":
        if table == "contact" and "metadata" in payload:
            local_meta = payload["metadata"]
            if isinstance(local_meta, str):
                local_meta = json.loads(local_meta)
            cur.execute("SELECT metadata FROM contact WHERE id = %s", (payload["id"],))
            row = cur.fetchone()
            if row:
                remote_meta = row[0]
                if isinstance(remote_meta, str):
                    remote_meta = json.loads(remote_meta)
                if remote_meta == local_meta:
                    print(f"♻️ Ingen skillnad i metadata för {payload['id']}, hoppar UPDATE och markerar som klar.")
                    return
        sets = ", ".join([f"{col} = %s" for col in payload if col != "id"])
        values = [json.dumps(payload[col]) if isinstance(payload[col], dict) else payload[col] for col in payload if col != "id"]
        values.append(payload["id"])
        sql = f"UPDATE {table} SET {sets} WHERE id = %s"
        cur.execute(sql, values)
        cur.execute("SELECT metadata, updated_at FROM contact WHERE id = %s", [payload["id"]])
        updated_row = cur.fetchone()
        if updated_row:
            try:
                metadata = updated_row[0]
                if isinstance(metadata, str):
                    metadata = json.loads(metadata)
                address = metadata.get("address", "(ingen adress)")
            except Exception:
                address = "(kunde inte tolkas)"
            print(f"🧾 Efter UPDATE: {payload['id']} → {address} @ {updated_row[1]}")
        else:
            print(f"⚠️ UPDATE-verifiering misslyckades: Inget resultat för {payload['id']}")
    elif operation == "DELETE":
        sql = f"DELETE FROM {table} WHERE id = %s"
        cur.execute(sql, [payload["id"]])

def sync():
    remote_conn = connect_db(REMOTE_DB_CONFIG)
    remote_cur = remote_conn.cursor()

    local_conn = connect_db(LOCAL_DB_CONFIG)
    local_cur = local_conn.cursor()

    remote_cur.execute("""
        SELECT id, table_name, record_id, operation, payload
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY record_id ORDER BY created_at ASC) AS rn
            FROM pending_changes
            WHERE direction = 'out' AND processed = false
              AND table_name IN ('contact', 'bookings')
        ) sub
        WHERE rn = 1
        ORDER BY created_at ASC, id
    """)
    rows = remote_cur.fetchall()

    remote_cur.execute("""
        DELETE FROM pending_changes
        WHERE id NOT IN (
            SELECT id FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY record_id ORDER BY created_at ASC) AS rn
                FROM pending_changes
                WHERE direction = 'out' AND processed = false
            ) sub
            WHERE rn = 1
        ) AND direction = 'out' AND processed = false AND operation = 'UPDATE';
    """)

    seen_record_ids = set()
    for row in rows:
        try:
            payload_preview = row[4] if isinstance(row[4], dict) else json.loads(row[4])
            rid = payload_preview.get("id")
            email = payload_preview.get("booking_email", "okänd e-post")
            seen_record_ids.add(rid)
        except Exception as e:
            pass
    count = 0
    for row in rows:
        change_id, table, record_id, operation, payload_json = row
        try:
            payload = payload_json if isinstance(payload_json, dict) else json.loads(payload_json)
            if not isinstance(payload.get("id"), str) or "your-generated-id" in payload.get("id"):
                continue
            apply_change(local_cur, table, operation, payload)
            if table == "bookings" and operation == "INSERT":
                local_cur.execute(
                    """
                    UPDATE pending_changes
                    SET booking_id = %s
                    WHERE record_id = %s AND table_name = 'bookings' AND booking_id IS NULL
                    """,
                    (record_id, record_id)
                )
                local_conn.commit()
            if table == "contact":
                email = payload.get("booking_email", "(okänd e-post)")
                meta = payload.get("metadata")
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except Exception:
                        meta = {}
                elif not isinstance(meta, dict):
                    meta = {}
                address = meta.get("address", "(okänd adress)")
                print(f"📥 Importerad kontakt: {email} → {address}")
            if table == "bookings" and operation == "INSERT":
                pass  # Notis borttagen
            local_cur.execute("""
                INSERT INTO event_log (id, source, event_type, payload, received_at)
                VALUES (gen_random_uuid(), %s, %s, %s, now())
            """, ('sync', f"{operation.lower()}_{table}", json.dumps(payload)))
            remote_cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", [change_id])
            remote_conn.commit()
            count += 1
        except Exception as e:
            print(f"❌ Fel vid synk för {table} (id={change_id}): {e}")
            continue

    local_conn.commit()
    local_cur.close()
    remote_cur.close()
    local_conn.close()
    remote_conn.close()

if __name__ == "__main__":
    sync()
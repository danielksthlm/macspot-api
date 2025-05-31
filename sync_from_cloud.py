import psycopg2
import json
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def connect_db(config):
    return psycopg2.connect(**config)

def safe_json_load(data, default={}):
    try:
        return json.loads(data) if isinstance(data, str) else data
    except Exception:
        return default

def metadata_equal(meta1, meta2):
    m1 = safe_json_load(meta1)
    m2 = safe_json_load(meta2)
    return m1 == m2

def apply_change(cur, table, operation, payload):
    try:
        if operation == "INSERT":
            cols = ", ".join(payload.keys())
            placeholders = ", ".join(["%s"] * len(payload))
            sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
            cur.execute(sql, [json.dumps(v) if isinstance(v, dict) else v for v in payload.values()])

        elif operation == "UPDATE":
            if table == "contact" and "metadata" in payload:
                local_meta = payload["metadata"]
                cur.execute("SELECT metadata FROM contact WHERE id = %s", (payload["id"],))
                row = cur.fetchone()
                if row and metadata_equal(row[0], local_meta):
                    print(f"♻️ Ingen skillnad i metadata för {payload['id']}, hoppar UPDATE.")
                    return

            sets = ", ".join([f"{col} = %s" for col in payload if col != "id"])
            values = [json.dumps(payload[col]) if isinstance(payload[col], dict) else payload[col]
                      for col in payload if col != "id"]
            values.append(payload["id"])
            sql = f"UPDATE {table} SET {sets} WHERE id = %s"
            cur.execute(sql, values)

            # Verifiera resultat (endast för kontakt)
            if table == "contact":
                cur.execute("SELECT metadata, updated_at FROM contact WHERE id = %s", [payload["id"]])
                updated_row = cur.fetchone()
                if updated_row:
                    try:
                        metadata = safe_json_load(updated_row[0])
                        address = metadata.get("address", "(ingen adress)")
                    except Exception:
                        address = "(kunde inte tolkas)"
                    print(f"🧾 Efter UPDATE: {payload['id']} → {address} @ {updated_row[1]}")
                else:
                    print(f"⚠️ UPDATE-verifiering misslyckades: Inget resultat för {payload['id']}")

        elif operation == "DELETE":
            cur.execute(f"DELETE FROM {table} WHERE id = %s", [payload["id"]])
            print(f"🗑️ Raderade post {payload['id']} från {table}")

    except Exception as e:
        print(f"❌ Fel i apply_change för {table} ({operation}): {e}")
        raise

def sync():
    remote_conn = connect_db(REMOTE_DB_CONFIG)
    remote_cur = remote_conn.cursor()

    local_conn = connect_db(LOCAL_DB_CONFIG)
    local_cur = local_conn.cursor()

    try:
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

        count = 0
        for row in rows:
            change_id, table, record_id, operation, payload_json = row
            try:
                payload = safe_json_load(payload_json)
                if not isinstance(payload.get("id"), str) or "your-generated-id" in payload.get("id"):
                    continue

                apply_change(local_cur, table, operation, payload)

                if table == "bookings" and operation == "INSERT":
                    local_cur.execute("""
                        UPDATE pending_changes
                        SET booking_id = %s
                        WHERE record_id = %s AND table_name = 'bookings' AND booking_id IS NULL
                    """, (record_id, record_id))

                # Logga kontaktimport
                if table == "contact":
                    email = payload.get("booking_email", "(okänd e-post)")
                    meta = safe_json_load(payload.get("metadata", {}))
                    address = meta.get("address", "(okänd adress)")
                    print(f"📥 Importerad kontakt: {email} → {address}")

                local_cur.execute("""
                    INSERT INTO event_log (id, source, event_type, payload, received_at)
                    VALUES (gen_random_uuid(), %s, %s, %s, now())
                """, ('sync', f"{operation.lower()}_{table}", json.dumps(payload)))

                remote_cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", [change_id])
                remote_conn.commit()
                local_conn.commit()
                count += 1

            except Exception as e:
                print(f"❌ Fel vid synk för {table} (id={change_id}): {e}")
                local_conn.rollback()
                remote_conn.rollback()
                continue

    finally:
        local_cur.close()
        remote_cur.close()
        local_conn.close()
        remote_conn.close()

if __name__ == "__main__":
    sync()
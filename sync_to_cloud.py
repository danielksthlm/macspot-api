import psycopg2
import json
from datetime import datetime, timezone
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def connect_db(config):
    return psycopg2.connect(**config)

def safe_json_load(data, default={}):
    try:
        return json.loads(data) if isinstance(data, str) else data
    except Exception:
        return default


def fetch_pending_changes(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, table_name, record_id, operation, payload
            FROM pending_changes
            WHERE processed = false AND direction = 'out'
            ORDER BY created_at ASC
        """)
        return cur.fetchall()

def get_table_columns(conn, table_name):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = %s
        """, (table_name,))
        return [row[0] for row in cur.fetchall()]

def build_insert_sql(table_name, payload):
    cols = ", ".join(payload.keys())
    placeholders = ", ".join(["%s"] * len(payload))
    return f"INSERT INTO {table_name} ({cols}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING", list(payload.values())

def build_update_sql(table_name, payload):
    cleaned_payload = {k: v for k, v in payload.items() if k != "id"}

    set_clause = ", ".join([f"{k} = %s" for k in cleaned_payload])
    values = [
        json.dumps(v) if isinstance(v, dict) else v
        for v in cleaned_payload.values()
    ]
    values.append(payload["id"])
    return f"UPDATE {table_name} SET {set_clause} WHERE id = %s", values

def sync():
    local_conn = connect_db(LOCAL_DB_CONFIG)
    remote_conn = connect_db(REMOTE_DB_CONFIG)

    try:
        # Hämta tillåtna kolumner för varje tabell
        allowed_columns = {
            'contact': get_table_columns(remote_conn, 'contact'),
            'bookings': get_table_columns(remote_conn, 'bookings')
        }

        changes = fetch_pending_changes(local_conn)
        print(f"📦 {len(changes)} ändringar att synka...")

        for change in changes:
            change_id, table_name, record_id, operation, payload_json = change
            print(f"🔄 Hanterar {operation} för {table_name} (ID: {record_id})")
            try:
                payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
                # Filtrera payload till endast tillåtna kolumner
                payload = {k: v for k, v in payload.items() if k in allowed_columns.get(table_name, [])}
                with remote_conn.cursor() as cur:
                    if operation == "INSERT":
                        sql, values = build_insert_sql(table_name, payload)
                        cur.execute(sql, values)
                        print(f"✅ INSERT till {table_name} klar (ID: {record_id})")
                        # Logga till event_log
                        cur.execute("""
                            INSERT INTO event_log (id, source, event_type, payload, received_at)
                            VALUES (gen_random_uuid(), %s, %s, %s, now())
                        """, (
                            'sync',
                            f"sync_to_cloud_insert_{table_name}",
                            json.dumps({
                                "record_id": record_id,
                                "table": table_name,
                                "operation": operation,
                                "email": payload.get("booking_email", None)
                            })
                        ))

                    elif operation == "UPDATE":
                        sql, values = build_update_sql(table_name, payload)
                        cur.execute(sql, values)
                        if cur.rowcount == 0:
                            print(f"⚠️ UPDATE påverkade inga rader i {table_name} (ID: {record_id})")
                        else:
                            print(f"✅ UPDATE till {table_name} klar (ID: {record_id})")
                        # Verifiering av UPDATE
                        cur.execute(f"SELECT * FROM {table_name} WHERE id = %s", (record_id,))
                        after = cur.fetchone()
                        print(f"🔍 Verifiering av UPDATE för {table_name} ID: {record_id} → {after}")
                        # Logga till event_log
                        cur.execute("""
                            INSERT INTO event_log (id, source, event_type, payload, received_at)
                            VALUES (gen_random_uuid(), %s, %s, %s, now())
                        """, (
                            'sync',
                            f"sync_to_cloud_update_{table_name}",
                            json.dumps({
                                "record_id": record_id,
                                "table": table_name,
                                "operation": operation,
                                "email": payload.get("booking_email", None)
                            })
                        ))

                    elif operation == "DELETE":
                        cur.execute(f"DELETE FROM {table_name} WHERE id = %s", [record_id])
                        print(f"🗑️ DELETE från {table_name} klar (ID: {record_id})")
                        # Logga till event_log
                        cur.execute("""
                            INSERT INTO event_log (id, source, event_type, payload, received_at)
                            VALUES (gen_random_uuid(), %s, %s, %s, now())
                        """, (
                            'sync',
                            f"sync_to_cloud_delete_{table_name}",
                            json.dumps({
                                "record_id": record_id,
                                "table": table_name,
                                "operation": operation,
                                "email": payload.get("booking_email", None)
                            })
                        ))

                with local_conn.cursor() as local_cur:
                    local_cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", [change_id])
                    local_conn.commit()
                    print(f"📍 Markerat som bearbetad: {change_id}")

            except Exception as op_err:
                print(f"❌ Fel vid hantering av ändring ({operation}) för {table_name} – {op_err}")

    except Exception as e:
        print(f"❌ Fel under synk: {e}")

    finally:
        local_conn.close()
        remote_conn.close()

if __name__ == "__main__":
    sync()
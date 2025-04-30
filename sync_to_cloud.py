import psycopg2
import json
from datetime import datetime
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def connect_db(config):
    return psycopg2.connect(**config)

def fetch_pending_changes(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, table_name, record_id, operation, payload
            FROM pending_changes
            WHERE direction = 'out' AND processed = false
              AND table_name IN ('contact', 'bookings')
        """)
        return cur.fetchall()

def mark_as_processed(conn, change_id):
    with conn.cursor() as cur:
        cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
        conn.commit()

def apply_change(conn, change, local_conn):
    from datetime import timezone

    table_name, record_id, operation, payload = change[1], change[2], change[3], change[4]
    with conn.cursor() as cur:
        data = json.loads(payload) if isinstance(payload, str) else payload

        # Skip contact records with metadata.origin != 'klrab.se'
        if table_name == 'contact' and 'metadata' in data:
            meta = json.loads(data['metadata']) if isinstance(data['metadata'], str) else data['metadata']
            if meta.get('origin') != 'klrab.se':
                print(f"⚠️ Skickas ej: origin != klrab.se – {data.get('booking_email')}")
                mark_as_processed(local_conn, change[0])
                return

        print(f"🟡 Försöker köra: {operation} på {table_name}")
        print(f"➡️  Data: {data}")

        # Ensure all values are serializable to SQL
        for k, v in data.items():
            if isinstance(v, dict):
                data[k] = json.dumps(v)

        if 'updated_at' in data:
            if isinstance(data['updated_at'], str):
                # Parse and convert to UTC if it's a string
                try:
                    dt = datetime.fromisoformat(data['updated_at'])
                    data['updated_at'] = dt.astimezone(timezone.utc).isoformat()
                except Exception as e:
                    print(f"⚠️ Kunde inte tolka updated_at: {data['updated_at']} ({e})")
            elif isinstance(data['updated_at'], datetime):
                data['updated_at'] = data['updated_at'].astimezone(timezone.utc).isoformat()

        if operation == 'INSERT':
            columns = ', '.join(data.keys())
            placeholders = ', '.join(['%s'] * len(data))
            values = list(data.values())
            if table_name in ['contact', 'bookings', 'event_log']:
                update_clause = ', '.join([f"{k} = EXCLUDED.{k}" for k in data.keys() if k != 'id'])
                cur.execute(
                    f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders}) "
                    f"ON CONFLICT (id) DO UPDATE SET {update_clause}",
                    values
                )
            else:
                cur.execute(f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})", values)
        if table_name == 'contact' and 'metadata' in data:
            # Merge metadata with existing remote value
            cur.execute(f"SELECT metadata FROM {table_name} WHERE id = %s", (record_id,))
            row = cur.fetchone()
            if row and isinstance(row[0], dict):
                existing_metadata = row[0]
            elif row and isinstance(row[0], str):
                existing_metadata = json.loads(row[0])
            else:
                existing_metadata = {}
            # Update with incoming keys
            incoming_metadata = json.loads(data['metadata']) if isinstance(data['metadata'], str) else data['metadata']
            existing_metadata.update(incoming_metadata)
            data['metadata'] = json.dumps(existing_metadata)
        elif operation == 'UPDATE':
            columns = ', '.join(data.keys())
            placeholders = ', '.join(['%s'] * len(data))
            values = list(data.values())
            update_clause = ', '.join([f"{k} = EXCLUDED.{k}" for k in data.keys() if k != 'id'])
            cur.execute(
                f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders}) "
                f"ON CONFLICT (id) DO UPDATE SET {update_clause}",
                values
            )
        elif operation == 'DELETE':
            cur.execute(f"DELETE FROM {table_name} WHERE id = %s", (record_id,))
        conn.commit()
        mark_as_processed(local_conn, change[0])
        print(f"✅ Synkade {operation} på {table_name} (id={record_id})")

def sync():
    import traceback
    local_conn = connect_db(LOCAL_DB_CONFIG)
    remote_conn = connect_db(REMOTE_DB_CONFIG)
    print("🔗 Remote anslutning:", remote_conn.get_dsn_parameters())

    changes = fetch_pending_changes(local_conn)
    count = 0
    for change in changes:
        try:
            apply_change(remote_conn, change, local_conn)
            count += 1
        except Exception as e:
            print(f"❌ Misslyckades att applicera ändring på {change[1]} (id={change[2]}): {e}")
            traceback.print_exc()
    print(f"✅ Totalt {count} ändring(ar) synkade till molnet.")
    
    local_conn.close()
    remote_conn.close()

if __name__ == "__main__":
    sync()
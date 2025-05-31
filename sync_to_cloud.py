import psycopg2
import json
from datetime import datetime, timezone
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def safe_json_load(data, default={}):
    try:
        return json.loads(data) if isinstance(data, str) else data
    except Exception:
        return default

def metadata_equal(meta1, meta2):
    m1 = safe_json_load(meta1)
    m2 = safe_json_load(meta2)
    return m1 == m2

def connect_db(config):
    return psycopg2.connect(**config)

def fetch_pending_changes(conn):
    with conn.cursor() as cur:
        cur.execute("""
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
        rows = cur.fetchall()

        # Rensa äldre UPDATE-poster med samma record_id
        cur.execute("""
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
        return rows

def mark_as_processed(conn, change_id):
    with conn.cursor() as cur:
        cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
        conn.commit()

#
# 📝 SYNC-BETEENDE: Hantering av metadata
#
# Viktigt att förstå skillnaden:
#
# 1. Ändring av värde:
#    - Exempel: "postal_code": "111 11" → "115 32"
#    - Hanteras som en vanlig UPDATE (om updated_at är nyare)
#
# 2. Ändring av nyckel (etikett):
#    - Exempel: "postal_number" → "postal_code"
#    - Molnet kommer *inte* ta bort "postal_number" utan force_resync
#    - Lägg till `"force_resync": true` i metadata för att tvinga full överskrivning
#
# Detta minskar risken att data i molnet raderas av misstag.

def apply_change(conn, change, local_conn):
    table_name, record_id, operation, payload = change[1], change[2], change[3], change[4]
    with conn.cursor() as cur:
        data = safe_json_load(payload)

        # Skip contact records with metadata.origin != 'klrab.se'
        if table_name == 'contact' and 'metadata' in data:
            meta = safe_json_load(data['metadata'])
            if meta.get('origin') != 'klrab.se':
                print(f"⚠️ Skickas ej: origin != klrab.se – {data.get('booking_email')}")
                mark_as_processed(local_conn, change[0])
                return

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
            cur.execute(
                f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders}) "
                f"ON CONFLICT (id) DO UPDATE SET "
                f"{', '.join([f'{k} = EXCLUDED.{k}' for k in data.keys() if k != 'id'])}",
                values
            )
            if table_name == 'bookings':
                with local_conn.cursor() as local_cur:
                    local_cur.execute(
                        """
                        UPDATE pending_changes
                        SET booking_id = %s
                        WHERE record_id = %s AND table_name = 'bookings' AND booking_id IS NULL
                        """,
                        (record_id, record_id)
                    )
                    local_conn.commit()

        if data.get("force_resync") is True:
            print(f"🔁 Force resync aktiv – uppdaterar {table_name} {record_id}")

        if operation == 'UPDATE':
            # Merge metadata with existing remote value and ensure JSON string (only for UPDATE)
            if 'metadata' in data and table_name == 'contact':
                cur.execute(f"SELECT metadata FROM {table_name} WHERE id = %s", (record_id,))
                row = cur.fetchone()
                if row and row[0]:
                    existing_metadata = safe_json_load(row[0])
                else:
                    existing_metadata = {}

                incoming_metadata = safe_json_load(data['metadata'])
                if metadata_equal(existing_metadata, incoming_metadata):
                    mark_as_processed(local_conn, change[0])
                    return
                existing_metadata.update(incoming_metadata)
                changed_keys = [k for k in incoming_metadata if existing_metadata.get(k) != incoming_metadata[k]]
                if not changed_keys:
                    mark_as_processed(local_conn, change[0])
                    return
                data['metadata'] = json.dumps(existing_metadata)

            # Förbättrad hantering av tidsjämförelse för updated_at
            if 'updated_at' in data and not data.get("force_resync"):
                try:
                    # Säkerställ att local_ts är datetime i UTC
                    local_ts = data['updated_at']
                    if isinstance(local_ts, str):
                        local_ts = datetime.fromisoformat(local_ts)
                    if local_ts.tzinfo is None:
                        local_ts = local_ts.replace(tzinfo=timezone.utc)
                    else:
                        local_ts = local_ts.astimezone(timezone.utc)

                    cur.execute(f"SELECT updated_at FROM {table_name} WHERE id = %s", (record_id,))
                    row = cur.fetchone()
                    if row and row[0] and isinstance(row[0], datetime):
                        remote_ts = row[0]
                        if remote_ts.tzinfo is None:
                            remote_ts = remote_ts.replace(tzinfo=timezone.utc)
                        else:
                            remote_ts = remote_ts.astimezone(timezone.utc)

                        if local_ts <= remote_ts:
                            mark_as_processed(local_conn, change[0])
                            return
                except Exception:
                    pass

            if table_name == "contact" and "metadata" in data:
                local_meta = safe_json_load(data["metadata"])
                cur.execute("SELECT metadata FROM contact WHERE id = %s", (data["id"],))
                row = cur.fetchone()
                if row:
                    remote_meta = safe_json_load(row[0])
                    if remote_meta == local_meta:
                        mark_as_processed(local_conn, change[0])
                        return

            columns = ', '.join(data.keys())
            placeholders = ', '.join(['%s'] * len(data))
            values = list(data.values())
            update_keys = [k for k in data.keys() if k != 'id']
            update_set = ', '.join([f"{k} = %s" for k in update_keys])
            update_values = [data[k] for k in update_keys]
            update_values.append(record_id)
            cur.execute(
                f"UPDATE {table_name} SET {update_set} WHERE id = %s",
                update_values
            )
            print(f"✅ UPDATE körd för {table_name} {record_id}")
            cur.execute("SELECT metadata, updated_at FROM contact WHERE id = %s", [payload["id"]])
            updated_row = cur.fetchone()
        elif operation == 'DELETE':
            cur.execute(f"DELETE FROM {table_name} WHERE id = %s", (record_id,))
            print(f"🗑️ Raderade post {record_id} från {table_name}")
        conn.commit()
        mark_as_processed(local_conn, change[0])

def sync():
    import traceback
    local_conn = connect_db(LOCAL_DB_CONFIG)
    remote_conn = connect_db(REMOTE_DB_CONFIG)

    changes = fetch_pending_changes(local_conn)
    count = 0
    for change in changes:
        try:
            apply_change(remote_conn, change, local_conn)
            count += 1
        except Exception as e:
            print(f"❌ Misslyckades att applicera ändring på {change[1]} (id={change[2]}): {e}")
            traceback.print_exc()
    
    local_conn.close()
    remote_conn.close()

if __name__ == "__main__":
    sync()
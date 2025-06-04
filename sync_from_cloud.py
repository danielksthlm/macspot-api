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
            sets = ", ".join([f"{col} = %s" for col in payload if col != "id"])
            values = [json.dumps(payload[col]) if isinstance(payload[col], dict) else payload[col]
                      for col in payload if col != "id"]
            values.append(payload["id"])
            sql = f"UPDATE {table} SET {sets} WHERE id = %s"
            cur.execute(sql, values)

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
                # Removed 'if not isinstance(payload.get("id"), str)' check per instructions

                apply_change(local_cur, table, operation, payload)

                if table == "bookings" and operation == "INSERT":
                    local_cur.execute("""
                        UPDATE pending_changes
                        SET booking_id = %s
                        WHERE record_id = %s AND table_name = 'bookings' AND booking_id IS NULL
                    """, (record_id, record_id))

                # Simplified kontaktimport log
                if table == "contact":
                    print(f"📥 Importerad kontakt: {payload.get('booking_email', '(okänd e-post)')}")

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
                continue

        tracking_count = sync_tracking_events(local_conn, remote_conn)
        return count, tracking_count

    # Sync tracking_event rows from cloud to local
    except Exception as e:
        print(f"❌ Fel i sync-funktionen: {e}")
    finally:
        local_cur.close()
        remote_cur.close()
        local_conn.close()
        remote_conn.close()
    return count


def sync_tracking_events(local_conn, remote_conn):
    remote_cur = remote_conn.cursor()
    local_cur = local_conn.cursor()

    tracking_synced = 0

    try:
        remote_cur.execute("""
            SELECT id, visitor_id, event_type, timestamp, metadata
            FROM tracking_event
            WHERE synced_at IS NULL
            ORDER BY timestamp ASC
            LIMIT 100
        """)
        rows = remote_cur.fetchall()

        for row in rows:
            try:
                insert_sql = """
                    INSERT INTO tracking_event (id, visitor_id, event_type, timestamp, metadata)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """
                local_cur.execute(insert_sql, [
                    row[0],  # id
                    row[1],  # visitor_id
                    row[2],  # event_type
                    row[3],  # timestamp
                    json.dumps(row[4])  # metadata
                ])
                remote_cur.execute("UPDATE tracking_event SET synced_at = now() WHERE id = %s", [row[0]])
                tracking_synced += 1
            except Exception as e:
                print(f"❌ Tracking-event synkfel: {e}")
                continue

        local_conn.commit()
        remote_conn.commit()

        # Rensa alla synkade tracking_event från molnet direkt efter synk
        try:
            remote_cur.execute("""
                DELETE FROM tracking_event
                WHERE synced_at IS NOT NULL
            """)
            remote_conn.commit()
            print("🧹 Rensade alla synkade tracking_event från molnet.")
        except Exception as e:
            print(f"⚠️ Kunde inte rensa molndata: {e}")
    finally:
        local_cur.close()
        remote_cur.close()

    return tracking_synced


if __name__ == "__main__":
    print(sync())
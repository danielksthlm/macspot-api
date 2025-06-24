import psycopg2
import json
from config import LOCAL_DB_CONFIG
from datetime import datetime

def connect_local():
    return psycopg2.connect(**LOCAL_DB_CONFIG)

def extract_pending_changes_from_eventlog(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, event_type, payload, received_at
            FROM event_log
            WHERE event_type LIKE 'sync_local_diff_%'
            AND received_at > now() - interval '1 hour'
            ORDER BY received_at DESC
        """)
        rows = cur.fetchall()

    count = 0
    with conn.cursor() as cur:

        def safe_serialize(value):
            if isinstance(value, dict):
                return json.dumps(value)
            elif isinstance(value, datetime):
                return value.isoformat()
            return value

        for row in rows:
            event_id, event_type, payload_json, _ = row
            payload = payload_json if isinstance(payload_json, dict) else json.loads(payload_json)
            email = payload.get("email") or (payload.get("metadata") or {}).get("email")
            table = "contact" if "contacts" in event_type else "bookings"

            if not email:
                continue

            # Hämta aktuell post från databasen
            if table == "contact":
                cur.execute("""
                    SELECT c.*, ccr.metadata->>'email' AS ccr_email
                    FROM contact c
                    JOIN ccrelation ccr ON c.id = ccr.contact_id
                    WHERE ccr.metadata->>'email' = %s
                    LIMIT 1
                """, (email,))
            else:
                cur.execute(f"SELECT * FROM {table} WHERE email = %s", (email,))
            result = cur.fetchone()
            if not result:
                if table == "contact":
                    print(f"⚠️ Ingen contact/ccrelation hittades för e-post: {email}")
                else:
                    print(f"⚠️ Ingen rad hittades för {email} i {table}")
                continue

            colnames = [desc[0] for desc in cur.description]
            row_dict = dict(zip(colnames, result))
            row_id = row_dict["id"]
            row_dict = {k: safe_serialize(v) for k, v in row_dict.items()}

            # Kontrollera om redan finns
            cur.execute("""
                SELECT 1 FROM pending_changes
                WHERE table_name = %s AND record_id = %s AND direction = 'out' AND processed = false
            """, (table, row_id))
            if cur.fetchone():
                print(f"⏩ Redan pending: {email} i {table}")
                continue

            cur.execute("""
                INSERT INTO pending_changes (
                    table_name, record_id, change_type, operation, direction,
                    processed, created_at, payload
                ) VALUES (
                    %s, %s, 'UPDATE', 'UPDATE', 'out', false, now(), %s
                )
            """, (table, row_id, json.dumps(row_dict)))
            count += 1

    conn.commit()
    return count

if __name__ == "__main__":
    conn = connect_local()
    try:
        total = extract_pending_changes_from_eventlog(conn)
        print(f"✅ Skapade {total} nya pending_changes från event_log.")
    finally:
        conn.close()
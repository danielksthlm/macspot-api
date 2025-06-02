import psycopg2
import json
from config import LOCAL_DB_CONFIG
from datetime import datetime

def connect_db():
    return psycopg2.connect(**LOCAL_DB_CONFIG)

def get_diff_events(cur):
    cur.execute("""
        SELECT payload->>'email' AS email, payload->>'record_id' AS record_id,
               payload->>'table' AS table_name, payload->>'diff_summary' AS diff,
               MAX(received_at) AS latest
        FROM event_log
        WHERE event_type LIKE 'sync_fromcloud_mismatch%'
        GROUP BY 1, 2, 3, 4
        ORDER BY latest DESC
    """)
    return cur.fetchall()

def get_latest_payload(cur, table_name, record_id):
    cur.execute(f"SELECT * FROM {table_name} WHERE id = %s", (record_id,))
    row = cur.fetchone()
    if not row:
        return None
    colnames = [desc[0] for desc in cur.description]
    row_dict = dict(zip(colnames, row))
    
    def safe_serialize(value):
        if isinstance(value, dict):
            return json.dumps(value)
        elif isinstance(value, datetime):
            return value.isoformat()
        return value

    row_dict = {k: safe_serialize(v) for k, v in row_dict.items()}
    return row_dict

def create_pending_change(cur, table_name, record_id, payload):
    cur.execute("""
        INSERT INTO pending_changes (
            table_name, record_id, change_type, operation, direction,
            processed, created_at, payload
        ) VALUES (
            %s, %s, 'UPDATE', 'UPDATE', 'out', false, now(), %s
        )
    """, (table_name, record_id, json.dumps(payload)))

def main():
    conn = connect_db()
    cur = conn.cursor()

    print("🔄 Genererar pending_changes från event_log (moln → lokal)...")
    events = get_diff_events(cur)
    print(f"📌 Hittade {len(events)} diff-loggar att bearbeta...")

    count = 0
    for email, record_id, table_name, _, _ in events:
        payload = get_latest_payload(cur, table_name, record_id)
        if not payload:
            print(f"⚠️ Kunde inte hitta rad i {table_name} för ID: {record_id}")
            continue
        try:
            create_pending_change(cur, table_name, record_id, payload)
            print(f"📥 Skapade pending_change för {table_name}: {email}")
            count += 1
        except Exception as e:
            print(f"❌ Misslyckades att skapa pending_change: {e}")

    conn.commit()
    cur.close()
    conn.close()

    print(f"✅ Klart – {count} pending_changes skapade.")

if __name__ == "__main__":
    main()
import psycopg2
import json
from datetime import datetime

LOCAL_DB_CONFIG = {
    "dbname": "macspot",
    "user": "danielkallberg",
    "password": "HittaFitta69",  # fyll i om det behövs
    "host": "localhost",
    "port": 5433
}

REMOTE_DB_CONFIG = {
    "dbname": "postgres",
    "user": "daniel",
    "password": "wijmeg-zihMa7-gomcuq",
    "host": "macspotpg.postgres.database.azure.com",
    "port": 5432
}

def connect_db(config):
    return psycopg2.connect(**config)

def fetch_pending_changes(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, table_name, record_id, operation, payload
            FROM pending_changes
            WHERE direction = 'out' AND processed = false
              AND table_name = ANY(%s)
        """, (['contact', 'bookings', 'booking_settings', 'translation', 'event_log', 'contact_email'],))
        return cur.fetchall()

def mark_as_processed(conn, change_id):
    with conn.cursor() as cur:
        cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
        conn.commit()

def apply_change(conn, change):
    table_name, record_id, operation, payload = change[1], change[2], change[3], change[4]
    with conn.cursor() as cur:
        data = json.loads(payload) if isinstance(payload, str) else payload

        # Ensure all values are serializable to SQL
        for k, v in data.items():
            if isinstance(v, dict):
                data[k] = json.dumps(v)

        if operation == 'INSERT':
            columns = ', '.join(data.keys())
            placeholders = ', '.join(['%s'] * len(data))
            values = list(data.values())
            cur.execute(f"INSERT INTO {table_name} ({columns}) VALUES ({placeholders})", values)
        elif operation == 'UPDATE':
            set_clause = ', '.join([f"{k} = %s" for k in data.keys()])
            values = list(data.values()) + [record_id]
            cur.execute(f"UPDATE {table_name} SET {set_clause} WHERE id = %s", values)
        elif operation == 'DELETE':
            cur.execute(f"DELETE FROM {table_name} WHERE id = %s", (record_id,))
        conn.commit()

def sync():
    local_conn = connect_db(LOCAL_DB_CONFIG)
    remote_conn = connect_db(REMOTE_DB_CONFIG)

    changes = fetch_pending_changes(local_conn)
    for change in changes:
        try:
            apply_change(remote_conn, change)
            mark_as_processed(local_conn, change[0])
        except Exception as e:
            print(f"❌ Misslyckades att applicera ändring: {e}")
    
    local_conn.close()
    remote_conn.close()

if __name__ == "__main__":
    sync()
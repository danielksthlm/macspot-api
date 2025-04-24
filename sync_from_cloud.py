import psycopg2
import json
from pathlib import Path
import subprocess
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def visa_notis(titel, meddelande):
    try:
        subprocess.run([
            "/opt/homebrew/bin/terminal-notifier",
            "-title", titel,
            "-message", meddelande.replace("!", "\\!")
        ], check=True)
    except Exception as e:
        print(f"❌ Kunde inte visa notis: {e}")

def connect_db(config):
    return psycopg2.connect(**config)

def apply_change(cur, table, operation, payload):
    if operation == "INSERT":
        cols = ", ".join(payload.keys())
        placeholders = ", ".join(["%s"] * len(payload))
        values = list(payload.values())
        sql = f"INSERT INTO {table} ({cols}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING"
        params = [json.dumps(v) if isinstance(v, dict) else v for v in values]
        print(f"📝 SQL: {cur.mogrify(sql, params).decode()}")
        cur.execute(sql, params)
    elif operation == "UPDATE":
        sets = ", ".join([f"{col} = %s" for col in payload if col != "id"])
        values = [payload[col] for col in payload if col != "id"]
        values.append(payload["id"])
        sql = f"UPDATE {table} SET {sets} WHERE id = %s"
        params = [json.dumps(v) if isinstance(v, dict) else v for v in values]
        print(f"📝 SQL: {cur.mogrify(sql, params).decode()}")
        cur.execute(sql, params)
    elif operation == "DELETE":
        sql = f"DELETE FROM {table} WHERE id = %s"
        params = [payload["id"]]
        print(f"📝 SQL: {cur.mogrify(sql, params).decode()}")
        cur.execute(sql, params)

def sync():
    print("🔗 Ansluter till remote databasen...")
    remote_conn = connect_db(REMOTE_DB_CONFIG)
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
                visa_notis("📅 Ny bokning!", "En kund har precis bokat tid online.")
            local_cur.execute("""
                INSERT INTO event_log (id, source, event_type, payload, received_at)
                VALUES (gen_random_uuid(), %s, %s, %s, now())
            """, ('sync', f"{operation.lower()}_{table}", json.dumps(payload)))
            remote_cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", [change_id])
            print(f"✅ Synkade: {operation} på {table}")
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

if __name__ == "__main__":
    sync()
import psycopg2
import json
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def copy_booking_settings():
    # Anslut till molndatabasen
    remote_conn = psycopg2.connect(**REMOTE_DB_CONFIG)
    remote_cur = remote_conn.cursor()

    # Anslut till lokala databasen
    local_conn = psycopg2.connect(**LOCAL_DB_CONFIG)
    local_cur = local_conn.cursor()

    # Hämta alla rader från molnets booking_settings
    remote_cur.execute("SELECT key, value::text, value_type, updated_at FROM booking_settings ORDER BY key;")
    settings = remote_cur.fetchall()

    # Rensa lokal tabell
    local_cur.execute("DELETE FROM booking_settings;")

    # Skriv in varje rad
    for row in settings:
        local_cur.execute("""
            INSERT INTO booking_settings (key, value, value_type, updated_at)
            VALUES (%s, %s::jsonb, %s, %s)
        """, row)

    local_conn.commit()
    print(f"✅ {len(settings)} inställningar kopierade från molnet till lokal databas.")

    # Stäng anslutningar
    remote_cur.close()
    remote_conn.close()
    local_cur.close()
    local_conn.close()

if __name__ == "__main__":
    copy_booking_settings()
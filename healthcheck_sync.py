# 📄 Förbättrad version av healthcheck_sync.py

import psycopg2
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG
from datetime import datetime
import sys

__version__ = "1.0.1"

def get_pending_count(conn, label):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM pending_changes
            WHERE direction = 'out' AND processed = false
        """)
        count = cur.fetchone()[0]
        print(f"🔍 {label}: {count} osynkade förändringar")
        return count

def check_db_connection(name, config):
    try:
        start = datetime.utcnow()
        conn = psycopg2.connect(**config)
        latency = (datetime.utcnow() - start).total_seconds()
        print(f"✅ Anslutning till {name} OK (latens: {latency:.2f} sek)")
        return conn
    except Exception as e:
        print(f"❌ Fel vid anslutning till {name}: {e}")
        return None

def main():
    print(f"\n📋 Healthcheck MacSpot sync v{__version__} – {datetime.utcnow().isoformat()} UTC\n")
    errors = 0

    local_conn = check_db_connection("Lokal databas", LOCAL_DB_CONFIG)
    if local_conn:
        get_pending_count(local_conn, "Lokal → moln")
        local_conn.close()
    else:
        errors += 1

    remote_conn = check_db_connection("Molndatabas", REMOTE_DB_CONFIG)
    if remote_conn:
        get_pending_count(remote_conn, "Moln → lokal")
        remote_conn.close()
    else:
        errors += 1

    if errors > 0:
        print(f"\n❌ Healthcheck avslutades med {errors} fel.\n")
        sys.exit(1)
    else:
        print(f"\n✅ Healthcheck genomförd utan fel.\n")

if __name__ == "__main__":
    main()
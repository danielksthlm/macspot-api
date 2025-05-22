from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG
import psycopg2

# Tabeller att tömma i respektive miljö
LOCAL_TABLES = [
    "bookings",
    "contact",
    "event_log",
    "pending_changes"
]

REMOTE_TABLES = [
    "available_slots_cache",
    "bookings",
    "contact",
    "event_log",
    "pending_changes",
    "slot_cache",
    "calendar_origin_cache",
    "travel_time_cache"
]

def truncate_tables(conn, tables, label):
    with conn.cursor() as cur:
        print(f"🔧 Tömmer tabeller i {label}...")
        for table in tables:
            print(f"  - TRUNCATE {table}")
            cur.execute(f'TRUNCATE TABLE "{table}" CASCADE;')
    conn.commit()

if __name__ == "__main__":
    confirm = input("⚠️ Detta kommer att ta bort ALLA DATA i definierade tabeller. Fortsätt? (ja/nej): ")
    if confirm.strip().lower() != "ja":
        print("❌ Avbrutet.")
        exit(0)

    local_conn = psycopg2.connect(**LOCAL_DB_CONFIG)
    remote_conn = psycopg2.connect(**REMOTE_DB_CONFIG)

    try:
        truncate_tables(local_conn, LOCAL_TABLES, "lokal databas")
        truncate_tables(remote_conn, REMOTE_TABLES, "molndatabas")
        print("✅ Alla tabeller tömda.")
    finally:
        local_conn.close()
        remote_conn.close()
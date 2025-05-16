import psycopg2
import os

# Anslutningsdetaljer
local_conn = psycopg2.connect(
    host="localhost",
    port=5433,
    dbname="macspot",
    user="postgres",  # eller annan lokal användare
    password=os.getenv("LOCAL_PGPASSWORD", "")
)

cloud_conn = psycopg2.connect(
    host="macspotpg.postgres.database.azure.com",
    port=5432,
    dbname="postgres",
    user="daniel",
    password=os.getenv("CLOUD_PGPASSWORD", ""),
    sslmode="require"
)

def fetch_columns(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, column_name;
        """)
        return cur.fetchall()

def compare_schemas(local, cloud):
    ignored_tables = {"ccrelation", "company", "travel_time_cache", "available_slots_cache", "slot_cache"}
    local_dict = {(tbl, col): typ for tbl, col, typ in local}
    cloud_dict = {(tbl, col): typ for tbl, col, typ in cloud}

    all_keys = {
        key for key in set(local_dict.keys()).union(cloud_dict.keys())
        if key[0] not in ignored_tables
    }
    for key in sorted(all_keys):
        local_type = local_dict.get(key)
        cloud_type = cloud_dict.get(key)
        if local_type != cloud_type:
            print(f"❌ Skillnad i {key[0]}.{key[1]}: lokal={local_type}, moln={cloud_type}")
        else:
            print(f"✅ {key[0]}.{key[1]}: {local_type}")

def compare_table_counts(local_conn, cloud_conn):
    with local_conn.cursor() as loc_cur, cloud_conn.cursor() as cld_cur:
        # Hämta tabeller från lokal databas
        loc_cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        """)
        loc_tables = {row[0] for row in loc_cur.fetchall()}
        # Hämta tabeller från molndatabas
        cld_cur.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        """)
        cld_tables = {row[0] for row in cld_cur.fetchall()}
        # Endast tabeller som finns i båda
        common_tables = loc_tables & cld_tables
        ignored_tables = {"ccrelation", "company", "travel_time_cache", "available_slots_cache", "slot_cache"}
        tables = sorted(t for t in common_tables if t not in ignored_tables)

        for table in tables:
            try:
                loc_cur.execute(f"SELECT COUNT(*) FROM {table}")
                local_count = loc_cur.fetchone()[0]
            except Exception:
                local_count = "❌"

            try:
                cld_cur.execute(f"SELECT COUNT(*) FROM {table}")
                cloud_count = cld_cur.fetchone()[0]
            except Exception:
                cloud_count = "❌"

            status = "✅" if local_count == cloud_count else "❌"
            print(f"{status} {table}: lokal={local_count}, moln={cloud_count}")

if __name__ == "__main__":
    print("🔍 Hämtar kolumner från lokal databas...")
    local_cols = fetch_columns(local_conn)
    print("🔍 Hämtar kolumner från molndatabas...")
    cloud_cols = fetch_columns(cloud_conn)
    print("\n📊 Jämförelse av kolumner och datatyper:\n")
    compare_schemas(local_cols, cloud_cols)
    print("\n📊 Jämförelse av antal rader per tabell:\n")
    compare_table_counts(local_conn, cloud_conn)
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG
import psycopg2
import json
from datetime import datetime


TABLES = ["translation", "booking_settings"]


def connect_db(config):
    return psycopg2.connect(**config)


def fetch_all_from_local(conn, table):
    with conn.cursor() as cur:
        cur.execute(f"SELECT * FROM {table}")
        colnames = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        return colnames, rows


def clear_remote_table(conn, table):
    with conn.cursor() as cur:
        cur.execute(f"DELETE FROM {table}")
        conn.commit()


def insert_to_remote(conn, table, columns, rows):
    with conn.cursor() as cur:
        placeholders = ', '.join(['%s'] * len(columns))
        colnames = ', '.join(columns)
        for row in rows:
            # Hantera jsonb-värden som json-strängar
            formatted_row = []
            for i, col in enumerate(columns):
                value = row[i]
                if table == 'booking_settings' and col == 'value':
                    formatted_row.append(json.dumps(value))
                else:
                    formatted_row.append(value)
            cur.execute(f"INSERT INTO {table} ({colnames}) VALUES ({placeholders})", formatted_row)
        conn.commit()


def sync_static_tables():
    local_conn = connect_db(LOCAL_DB_CONFIG)
    remote_conn = connect_db(REMOTE_DB_CONFIG)

    for table in TABLES:
        print(f"\n⏳ Synkar tabell: {table}...")
        columns, rows = fetch_all_from_local(local_conn, table)
        clear_remote_table(remote_conn, table)
        insert_to_remote(remote_conn, table, columns, rows)
        print(f"✅ Klar med tabell: {table} ({len(rows)} rader)")

    local_conn.close()
    remote_conn.close()


if __name__ == "__main__":
    sync_static_tables()

# 📄 Förbättrad version av healthcheck_sync.py

import psycopg2
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG
from datetime import datetime, timezone
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
        start = datetime.now(timezone.utc)
        conn = psycopg2.connect(**config)
        latency = (datetime.now(timezone.utc) - start).total_seconds()
        print(f"✅ Anslutning till {name} OK (latens: {latency:.2f} sek)")
        return conn
    except Exception as e:
        print(f"❌ Fel vid anslutning till {name}: {e}")
        return None

def main():
    print(f"\n📋 Healthcheck MacSpot sync v{__version__} – {datetime.now(timezone.utc).isoformat()} UTC\n")
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
        # --- Kontaktjämförelse mellan lokal och moln ---
        try:
            print("\n🔍 Jämför kontaktposter mellan lokal och moln...")
            with psycopg2.connect(**LOCAL_DB_CONFIG) as local_conn, psycopg2.connect(**REMOTE_DB_CONFIG) as remote_conn:
                with local_conn.cursor() as local_cur, remote_conn.cursor() as remote_cur:
                    local_cur.execute("SELECT id, metadata FROM contact")
                    remote_cur.execute("SELECT id, metadata FROM contact")

                    local_contacts = {str(row[0]): row[1] for row in local_cur.fetchall()}
                    remote_contacts = {str(row[0]): row[1] for row in remote_cur.fetchall()}

                    mismatch_count = 0
                    for contact_id, local_meta in local_contacts.items():
                        remote_meta = remote_contacts.get(contact_id)
                        if remote_meta is None:
                            print(f"⚠️ Kontakt {contact_id} finns inte i molnet.")
                            mismatch_count += 1
                        elif local_meta != remote_meta:
                            if {k: v for k, v in local_meta.items() if k != 'updated_at'} != {k: v for k, v in remote_meta.items() if k != 'updated_at'}:
                                print(f"⚠️ Kontakt {contact_id} skiljer sig mellan lokal och moln (förutom updated_at).")
                                mismatch_count += 1

                    for contact_id in remote_contacts:
                        if contact_id not in local_contacts:
                            print(f"⚠️ Kontakt {contact_id} finns i molnet men saknas lokalt.")
                            mismatch_count += 1

                    if mismatch_count == 0:
                        print("✅ Alla kontakter matchar mellan lokal och moln.")
                    else:
                        print(f"❗ Totalt {mismatch_count} avvikelse(r) i kontaktmetadata.")
        except Exception as e:
            print(f"⚠️ Fel vid jämförelse av kontakter: {e}")
        remote_conn.close()
    else:
        errors += 1

    # Hämta senaste mismatch-loggar från event_log
    try:
        with psycopg2.connect(**LOCAL_DB_CONFIG) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT event_type, payload->>'email', payload->>'diff_summary', received_at
                    FROM event_log
                    WHERE received_at > now() - interval '10 minutes'
                      AND event_type IN (
                          'sync_local_diff', 'sync_mismatch_contact', 'sync_fromcloud_mismatch', 'sync_forced_rewrite'
                      )
                    ORDER BY received_at DESC
                    LIMIT 10
                """)
                rows = cur.fetchall()
                if rows:
                    print("\n🚨 Senaste synkavvikelser:")
                    for event_type, email, diff, timestamp in rows:
                        print(f"• {event_type}: {email} – {diff} @ {timestamp}")
                else:
                    print("\n✅ Inga mismatch-loggar i event_log senaste 10 minuterna.")
    except Exception as e:
        print(f"⚠️ Kunde inte läsa mismatch-loggar: {e}")

    # Lista alla tabeller i lokal och molndatabas
    def list_tables(conn, label):
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                """)
                tables = [row[0] for row in cur.fetchall()]
                print(f"\n📋 Tabeller i {label}:")
                for t in tables:
                    print(f"• {t}")
        except Exception as e:
            print(f"⚠️ Kunde inte hämta tabeller från {label}: {e}")

    # Lista triggers per tabell
    def list_triggers(conn, label):
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT event_object_table, trigger_name, action_timing, event_manipulation
                    FROM information_schema.triggers
                    ORDER BY event_object_table, trigger_name
                """)
                rows = cur.fetchall()
                if rows:
                    print(f"\n📌 Triggers i {label}:")
                    for table, trigger, timing, event in rows:
                        print(f"• {table} – {trigger} ({timing} {event})")
                else:
                    print(f"\nℹ️ Inga triggers i {label}.")
        except Exception as e:
            print(f"⚠️ Kunde inte hämta triggers från {label}: {e}")

    def analyze_triggers(conn, table_name, label):
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT trigger_name, action_timing, event_manipulation, action_statement
                    FROM information_schema.triggers
                    WHERE event_object_table = %s
                """, (table_name,))
                rows = cur.fetchall()
                if rows:
                    print(f"\n🔍 Triggers för tabell '{table_name}' i {label}:")
                    for trigger_name, timing, event, stmt in rows:
                        print(f"• {trigger_name} – {timing} {event}: {stmt}")
                else:
                    print(f"\nℹ️ Inga triggers för tabell '{table_name}' i {label}.")
        except Exception as e:
            print(f"⚠️ Fel vid analys av triggers i {label}: {e}")

    def list_columns(conn, table_name, label):
        try:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_name = %s
                    ORDER BY ordinal_position
                """, (table_name,))
                rows = cur.fetchall()
                print(f"\n📑 Kolumner för '{table_name}' i {label}:")
                for name, dtype in rows:
                    print(f"• {name} ({dtype})")
        except Exception as e:
            print(f"⚠️ Fel vid kolumnhämtning i {label} för tabell '{table_name}': {e}")

    # Anropa för båda databaser om öppna
    if local_conn:
        local_conn = check_db_connection("Lokal databas", LOCAL_DB_CONFIG)
        if local_conn:
            list_tables(local_conn, "lokal databas")
            list_triggers(local_conn, "lokal databas")
            local_conn.close()
    if remote_conn:
        remote_conn = check_db_connection("Molndatabas", REMOTE_DB_CONFIG)
        if remote_conn:
            list_tables(remote_conn, "molndatabas")
            list_triggers(remote_conn, "molndatabas")
            remote_conn.close()

    if local_conn := check_db_connection("Lokal databas", LOCAL_DB_CONFIG):
        for tabell in ["contact", "bookings"]:
            analyze_triggers(local_conn, tabell, "lokal databas")
        local_conn.close()

    if remote_conn := check_db_connection("Molndatabas", REMOTE_DB_CONFIG):
        for tabell in ["contact", "bookings"]:
            analyze_triggers(remote_conn, tabell, "molndatabas")
        remote_conn.close()

    if local_conn := check_db_connection("Lokal databas", LOCAL_DB_CONFIG):
        for tabell in ["contact", "bookings"]:
            list_columns(local_conn, tabell, "lokal databas")
        local_conn.close()

    if remote_conn := check_db_connection("Molndatabas", REMOTE_DB_CONFIG):
        for tabell in ["contact", "bookings"]:
            list_columns(remote_conn, tabell, "molndatabas")
        remote_conn.close()

    def verify_trigger_connections():
        print("\n📎 Verifierar att triggers är kopplade till rätt funktioner...")
        for label, config in [("lokal databas", LOCAL_DB_CONFIG), ("molndatabas", REMOTE_DB_CONFIG)]:
            try:
                with psycopg2.connect(**config) as conn:
                    with conn.cursor() as cur:
                        for table, trigger, function in [
                            ("contact", "audit_sync_contact_trigger", "log_contact_change"),
                            ("bookings", "audit_sync_bookings_trigger", "log_bookings_change")
                        ]:
                            cur.execute("""
                                SELECT trigger_name, action_statement
                                FROM information_schema.triggers
                                WHERE event_object_table = %s AND trigger_name = %s
                            """, (table, trigger))
                            row = cur.fetchone()
                            if row:
                                if function in row[1]:
                                    print(f"✅ {label}: {trigger} på '{table}' kör {function}()")
                                else:
                                    print(f"❌ {label}: {trigger} hittades men pekar inte på {function}()")
                            else:
                                print(f"❌ {label}: Trigger '{trigger}' på tabell '{table}' saknas")
            except Exception as e:
                print(f"⚠️ Kunde inte verifiera triggers i {label}: {e}")

    def verify_trigger_cloud():
        print("\n🌩️ Verifierar triggerfunktioner i molndatabasen separat...")
        try:
            with psycopg2.connect(**REMOTE_DB_CONFIG) as conn:
                with conn.cursor() as cur:
                    for table, trigger, expected_func in [
                        ("contact", "audit_sync_contact_trigger", "log_contact_change"),
                        ("bookings", "audit_sync_bookings_trigger", "log_bookings_change")
                    ]:
                        cur.execute("""
                            SELECT trigger_name, action_statement
                            FROM information_schema.triggers
                            WHERE event_object_table = %s AND trigger_name = %s
                        """, (table, trigger))
                        row = cur.fetchone()
                        if row:
                            if expected_func in row[1]:
                                print(f"✅ Molndatabas: {trigger} på '{table}' kör {expected_func}()")
                            else:
                                print(f"❌ Molndatabas: {trigger} pekar INTE på {expected_func}()")
                        else:
                            print(f"❌ Molndatabas: Trigger '{trigger}' saknas på tabell '{table}'")
        except Exception as e:
            print(f"⚠️ Kunde inte verifiera molntriggers: {e}")

    verify_trigger_connections()
    verify_trigger_cloud()

    # Visa de senaste 5 event_log-posterna med e-post och diff_summary
    try:
        with psycopg2.connect(**LOCAL_DB_CONFIG) as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT received_at, event_type, payload->>'email', payload->>'diff_summary'
                    FROM event_log
                    WHERE payload->>'email' IS NOT NULL
                    ORDER BY received_at DESC
                    LIMIT 5
                """)
                rows = cur.fetchall()
                if rows:
                    print("\n📜 Senaste 5 event_log-poster:")
                    print(f"| {'tidpunkt':<20} | {'event_type':<25} | {'e-post':<30} | {'diff_summary':<40} |")
                    print("|" + "-"*22 + "|" + "-"*27 + "|" + "-"*32 + "|" + "-"*42 + "|")
                    for t, e, m, d in rows:
                        print(f"| {t.strftime('%Y-%m-%d %H:%M:%S')} | {e:<25} | {m:<30} | {d or '':<40} |")
                else:
                    print("ℹ️ Inga loggposter hittades.")
    except Exception as e:
        print(f"⚠️ Kunde inte hämta senaste event_log-poster: {e}")

    if errors > 0:
        print(f"\n❌ Healthcheck avslutades med {errors} fel.\n")
        sys.exit(1)
    else:
        print(f"\n✅ Healthcheck genomförd utan fel.\n")

if __name__ == "__main__":
    main()
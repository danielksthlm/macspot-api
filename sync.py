import psycopg2
import json
from config import LOCAL_DB_CONFIG, REMOTE_DB_CONFIG

def safe_json(data):
    return json.loads(data) if isinstance(data, str) else data


# Deep diff for metadata fields
def deep_metadata_diff(meta1, meta2):
    m1 = safe_json(meta1)
    m2 = safe_json(meta2)
    diffs = []
    all_keys = set(m1.keys()).union(m2.keys())
    for key in sorted(all_keys):
        v1 = m1.get(key)
        v2 = m2.get(key)
        if v1 != v2:
            diffs.append(f"    • metadata.{key}: lokal='{v1}' vs moln='{v2}'")
    return diffs

def connect_db(config):
    return psycopg2.connect(**config)

def fetch_contacts(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM contact")
        colnames = [desc[0] for desc in cur.description]
        return {
            row[colnames.index("id")]: dict(zip(colnames, row))
            for row in cur.fetchall()
        }

def fetch_bookings(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT * FROM bookings")
        colnames = [desc[0] for desc in cur.description]
        return {
            row[colnames.index("id")]: dict(zip(colnames, row))
            for row in cur.fetchall()
        }

def compare_and_print(local_data, cloud_data, label, local):
    print(f"\n📋 Jämför {label}...")
    for cid, local_item in sorted(local_data.items(), key=lambda item: item[1].get("booking_email", "")):
        cloud = cloud_data.get(cid)
        if not cloud:
            print(f"🆕 Finns lokalt men inte i molnet: {local_item.get('booking_email', '(okänd)')}")
            continue

        differences = []
        # Jämför varje fält i raden (förutom id)
        for key in local_item:
            if key == 'id':
                continue
            local_val = local_item[key]
            cloud_val = cloud.get(key)
            if key == 'metadata':
                meta_diffs = deep_metadata_diff(
                    safe_json(local_val),
                    safe_json(cloud_val)
                )
                if meta_diffs:
                    differences.append(f"  🔹 {key}: METADATA skiljer sig")
                    differences.extend(meta_diffs)
            elif local_val != cloud_val:
                if key == 'updated_at':
                    # Jämför även timestamp exakt
                    if local_val == cloud_val:
                        differences.append(f"  ⚠️ Mismatch i {key} men identisk updated_at – kontrollera dataintegritet")
                        with local.cursor() as cur:
                            cur.execute("""
                                INSERT INTO event_log (id, source, event_type, payload, received_at)
                                VALUES (gen_random_uuid(), %s, %s, %s, now())
                            """, (
                                'sync',
                                f"sync_warning_{label}",
                                json.dumps({
                                    "email": local_item.get("booking_email", "(okänd)"),
                                    "warning": f"MATCH updated_at men data skiljer sig",
                                    "field": key,
                                    "local": str(local_val),
                                    "cloud": str(cloud_val)
                                })
                            ))
                        local.commit()
                differences.append(f"  🔸 {key}: lokal='{local_val}' vs moln='{cloud_val}'")

        if differences:
            print(f"✏️ Skillnad för {local_item.get('booking_email', '(okänd)')}")
            for diff in differences:
                print(diff)

            with local.cursor() as cur:
                cur.execute("""
                    INSERT INTO event_log (id, source, event_type, payload, received_at)
                    VALUES (gen_random_uuid(), %s, %s, %s, now())
                """, (
                    'sync',
                    f"sync_local_diff_{label}",
                    json.dumps({
                        "email": local_item.get("booking_email", "(okänd)"),
                        "diff_summary": differences
                    })
                ))
            # Observera: sync.py lägger bara till diff i event_log – ingen ändring sker i pending_changes.
            local.commit()

    for cid, cloud in sorted(cloud_data.items(), key=lambda item: item[1].get("booking_email", "")):
        if cid in local_data:
            continue
        print(f"🆕 Finns i molnet men inte lokalt: {cloud.get('booking_email', '(okänd)')}")


if __name__ == "__main__":
    try:
        local = connect_db(LOCAL_DB_CONFIG)
        cloud = connect_db(REMOTE_DB_CONFIG)
    except Exception as e:
        print(f"❌ Fel vid databasanslutning: {e}")
        exit(1)
    local_contacts = fetch_contacts(local)
    cloud_contacts = fetch_contacts(cloud)
    compare_and_print(local_contacts, cloud_contacts, "contacts", local)

    local_bookings = fetch_bookings(local)
    cloud_bookings = fetch_bookings(cloud)
    compare_and_print(local_bookings, cloud_bookings, "bookings", local)
    local.close()
    cloud.close()

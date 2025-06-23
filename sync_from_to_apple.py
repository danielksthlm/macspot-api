import psycopg2
import psycopg2.errors
import json
import objc
from datetime import datetime
from config import LOCAL_DB_CONFIG
from Contacts import (
    CNContactStore,
    CNMutableContact,
    CNSaveRequest,
    CNPhoneNumber,
    CNLabeledValue
)

# Placeholder: Apple Contacts-hantering kräver pyobjc och systemåtkomst
# from Contacts import CNContactStore, CNMutableContact, CNSaveRequest

def connect_db():
    return psycopg2.connect(**LOCAL_DB_CONFIG)

def fetch_pending_apple_contacts(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, record_id, operation, payload
            FROM pending_changes
            WHERE table_name = 'contact' AND direction = 'in' AND processed = false
            ORDER BY created_at ASC
        """)
        return cur.fetchall()

def apply_pending_out_contacts(conn):
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON ((payload->'metadata'->>'apple_id')::text)
              id, record_id, operation, payload
            FROM pending_changes
            WHERE table_name = 'contact' AND direction = 'out' AND processed = false
            ORDER BY (payload->'metadata'->>'apple_id')::text, created_at DESC
            LIMIT 50000
        """)
        rows = cur.fetchall()

        for change_id, record_id, operation, payload_json in rows:
            payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
            # Kontroll: Hoppa över pending_change utan e-post
            if not payload.get("email") and not payload.get("emails"):
                print(f"⚠️ Hoppar över pending_change utan e-post: {payload}")
                cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
                continue
            emails = payload.get("emails", [])
            email = emails[0]["email"] if emails else None
            apple_id = payload.get("apple_id") or payload.get("metadata", {}).get("apple_id")

            # NYTT: Hoppa över tom kontakt
            if not any([
                payload.get("first_name"),
                payload.get("last_name"),
                payload.get("emails"),
                payload.get("phones")
            ]):
                print(f"⚠️ Hoppar över tom kontakt: {email}")
                cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
                continue

            if not apple_id:
                # Skapa ny kontakt i Apple för att få apple_id
                print(f"➕ Skapar kontakt i Apple för: {email} – saknar apple_id")

                store = CNContactStore.alloc().init()
                request = CNSaveRequest.alloc().init()
                contact = CNMutableContact.alloc().init()

                contact.setGivenName_(payload.get("first_name", ""))
                contact.setMiddleName_(payload.get("middle_name", ""))
                contact.setFamilyName_(payload.get("last_name", ""))
                contact.setOrganizationName_(payload.get("organization", ""))
                contact.setJobTitle_(payload.get("job_title", ""))
                contact.setDepartmentName_(payload.get("department", ""))
                contact.setNickname_(payload.get("nickname", ""))
                contact.setNote_(payload.get("note", ""))

                # E-post
                if payload.get("emails"):
                    email_values = []
                    for item in payload["emails"]:
                        label = item.get("label", "")
                        value = item.get("email", "")
                        labeled = CNLabeledValue.labeledValueWithLabel_value_(label, value)
                        email_values.append(labeled)
                    contact.setEmailAddresses_(email_values)

                # Telefon
                if payload.get("phones"):
                    phone_values = []
                    for item in payload["phones"]:
                        label = item.get("label", "")
                        number = item.get("number", "")
                        phone = CNPhoneNumber.phoneNumberWithStringValue_(number)
                        labeled = CNLabeledValue.labeledValueWithLabel_value_(label, phone)
                        phone_values.append(labeled)
                    contact.setPhoneNumbers_(phone_values)

                # Lägg till kontakt i Apple
                request.addContact_toContainerWithIdentifier_(contact, None)
                success, error = store.executeSaveRequest_error_(request, None)
                if error:
                    print(f"❌ Kunde inte skapa kontakt i Apple: {email} – {error}")
                    cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
                    continue

                apple_id = str(contact.identifier)
                metadata = payload.get("metadata", {})
                metadata["apple_id"] = apple_id
                metadata["origin"] = "macos"
                payload["apple_id"] = apple_id
                payload["metadata"] = metadata

                # Uppdatera den lokala posten med nytt apple_id
                def make_json_safe(obj):
                    if isinstance(obj, dict):
                        return {k: make_json_safe(v) for k, v in obj.items()}
                    elif isinstance(obj, list):
                        return [make_json_safe(v) for v in obj]
                    elif isinstance(obj, (str, int, float, bool)) or obj is None:
                        return obj
                    else:
                        return str(obj)

                safe_payload = make_json_safe(payload | {"metadata": metadata})
                cur.execute("""
                    UPDATE contact SET metadata = %s WHERE id = %s
                """, (json.dumps(safe_payload), record_id))

                print(f"✅ Kontakt skapad i Apple och apple_id satt: {email}")

            metadata = payload.get("metadata", {})
            if apple_id:
                metadata['apple_id'] = apple_id
            metadata['origin'] = "macos"
            
            print(f"↘️ Skriver till local contact: {email} ({operation})")

            # Kontrollera om kontakt redan finns baserat på apple_id (enbart) för att undvika dubbletter
            existing_contact = None

            if not apple_id:
                print(f"⚠️ Saknar apple_id – kan inte synka {email}")
                cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
                continue

            cur.execute("""
                SELECT id FROM contact
                WHERE metadata->>'apple_id' = %s
            """, (apple_id,))
            existing_contact = cur.fetchone()

            # Kontrollera att vi inte försöker använda ett id som redan används av en skyddad kontakt (origin = klrab.se)
            cur.execute("""
                SELECT id FROM contact
                WHERE id = %s AND (metadata->'metadata'->>'origin' = 'klrab.se' OR metadata->>'origin' = 'klrab.se')
            """, (record_id,))
            protected = cur.fetchone()
            if protected:
                print(f"🚫 Kan ej skapa/uppdatera kontakt med skyddat id (origin=klrab.se): {email}")
                cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
                continue

            # Om kombinationen email + apple_id redan finns med annan id → hämta rätt id
            cur.execute("""
                SELECT id FROM contact
                WHERE LOWER(email) = LOWER(%s)
                  AND metadata->>'apple_id' = %s
            """, (email, apple_id))
            existing = cur.fetchone()
            if existing:
                record_id = existing[0]  # Överskriv med korrekt id

            # UPSERT-logik: Alltid använd UPSERT, och uppdatera även updated_at
            print(f"➕/🔁 Upsert kontakt: {email}")
            cur.execute("""
                INSERT INTO contact (id, email, booking_email, metadata, updated_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE
                SET email = EXCLUDED.email,
                    booking_email = EXCLUDED.booking_email,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
            """, (record_id, email, email, json.dumps(payload | {"metadata": metadata})))

            cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
        conn.commit()
        cur.execute("SELECT COUNT(*) FROM pending_changes WHERE processed = true AND created_at < NOW() - interval '30 days'")
        rensade = cur.fetchone()[0]
        print(f"🧹 Förbereder rensning av {rensade} äldre pending_changes (processed)")
        print(f"✅ {len(rows)} kontakter behandlade i apply_pending_out_contacts")

def cleanup_processed_changes(conn):
    with conn.cursor() as cur:
        cur.execute("""
            DELETE FROM pending_changes
            WHERE processed = true AND created_at < NOW() - interval '30 days'
        """)
        conn.commit()
        print("🧹 Rensade gamla processed pending_changes (> 30 dagar)")

def main():
    conn = connect_db()
    changes = fetch_pending_apple_contacts(conn)
    apply_pending_out_contacts(conn)
    cleanup_processed_changes(conn)
    print(f"📥 Hittade {len(changes)} kontakter att synka till Apple Kontakter")

    # För statistik/loggning
    num_pending_created = 0
    num_pending_skipped = 0

    for change in changes:
        change_id, record_id, operation, payload_json = change
        payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
        apple_id = payload.get("apple_id") or payload.get("metadata", {}).get("apple_id")
        emails = payload.get("emails", [])
        email = emails[0]["email"] if emails else None

        if not any([
            payload.get("first_name"),
            payload.get("last_name"),
            payload.get("emails"),
            payload.get("phones")
        ]):
            print(f"⚠️ Hoppar över tom kontakt: {payload}")
            continue

        # NYTT: Hoppa över kontakt utan e-post
        if not email:
            print(f"⚠️ Hoppar över kontakt utan e-post: {payload}")
            with conn.cursor() as cur:
                cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
            continue

        print(f"👤 Kontakt: {payload.get('first_name', '')} {payload.get('last_name', '')} – {email} – AppleID: {apple_id}")

        store = CNContactStore.alloc().init()
        request = CNSaveRequest.alloc().init()

        contact = CNMutableContact.alloc().init()

        # Notera: Eftersom vi nu inte använder "email" direkt, och Apple Contacts matchar på email, denna del kan behöva anpassas.
        # För nu, använd första email om finns, annars hoppa över.
        if not email:
            print(f"⚠️ Kontakt saknar e-post – hoppar över: {payload}")
            continue
        predicate = CNContact.predicateForContactsMatchingEmailAddress_(email or "")
        contacts, _ = store.unifiedContactsMatchingPredicate_keysToFetch_error_(predicate, None, None)
        if contacts and len(contacts) > 0:
            existing = contacts[0].mutableCopy()
            contact = existing
            print(f"🔁 Uppdaterar befintlig kontakt i Apple: {email}")
        else:
            print(f"➕ Skapar ny kontakt i Apple: {email}")

        contact.givenName = payload.get("first_name", "")
        contact.middleName = payload.get("middle_name", "")
        contact.familyName = payload.get("last_name", "")
        contact.organizationName = payload.get("organization", "")
        contact.jobTitle = payload.get("job_title", "")
        contact.departmentName = payload.get("department", "")
        contact.nickname = payload.get("nickname", "")
        contact.note = payload.get("note", "")

        if payload.get("emails"):
            email_values = []
            for item in payload["emails"]:
                label = item.get("label", "")
                value = item.get("email", "")
                email_lbl = CNLabeledValue.labeledValueWithLabel_value_(label, value)
                email_values.append(email_lbl)
            contact.setEmailAddresses_(email_values)

        if payload.get("phones"):
            phone_values = []
            for item in payload["phones"]:
                label = item.get("label", "")
                number = item.get("number", "")
                phone = CNPhoneNumber.phoneNumberWithStringValue_(number)
                labeled = CNLabeledValue.labeledValueWithLabel_value_(label, phone)
                phone_values.append(labeled)
            contact.setPhoneNumbers_(phone_values)

        if not contact.emailAddresses() and not contact.phoneNumbers():
            print(f"❌ Skapar ej kontakt – saknar e-post och telefon: {email}")
            continue

        if contacts and len(contacts) > 0:
            request.updateContact_(contact)
        else:
            request.addContact_toContainerWithIdentifier_(contact, None)
        
        # Improved error handling for save request
        success, error = store.executeSaveRequest_error_(request, None)
        if error:
            print(f"❌ Fel vid kontakt-skrivning till Apple: {email} – {error}")

        # Use contact.identifier as record_id and include apple_id and apple_uid in payload and metadata
        record_id = contact.identifier
        apple_id = contact.identifier
        jsonPayload = {
            "first_name": contact.givenName,
            "middle_name": contact.middleName,
            "last_name": contact.familyName,
            "organization": contact.organizationName,
            "job_title": contact.jobTitle,
            "department": contact.departmentName,
            "nickname": contact.nickname,
            "note": contact.note,
            "emails": payload.get("emails", []),
            "apple_id": apple_id,
            "apple_uid": apple_id,
            "metadata": {
                "origin": payload.get("metadata", {}).get("origin", ""),
                "apple_id": apple_id,
                "apple_uid": apple_id
            }
        }

        with conn.cursor() as cur:
            # Kontrollera om identisk pending_change redan finns (via JSON-diff) – matcha på apple_id
            cur.execute("""
                SELECT id, payload FROM pending_changes
                WHERE table_name = 'contact'
                  AND direction = 'out'
                  AND processed = false
                  AND (payload->'metadata'->>'apple_id') = %s
            """, (apple_id,))
            existing_pending = cur.fetchone()
            identical = False
            if existing_pending:
                # Jämför JSON
                try:
                    old_payload = existing_pending[1]
                    if isinstance(old_payload, str):
                        old_payload = json.loads(old_payload)
                    if json.dumps(old_payload, sort_keys=True) == json.dumps(jsonPayload, sort_keys=True):
                        identical = True
                except Exception as e:
                    pass

            if identical:
                print(f"🧼 Kontakt redan identisk i pending_changes – hoppar över: {email}")
                num_pending_skipped += 1
            else:
                # Kontrollera att ingen duplikat-pending_change skapas för samma apple_id (oavsett payload)
                cur.execute("""
                    SELECT count(*) FROM pending_changes
                    WHERE table_name = 'contact'
                      AND direction = 'out'
                      AND processed = false
                      AND (payload->'metadata'->>'apple_id') = %s
                """, (apple_id,))
                count = cur.fetchone()[0]
                if count > 0:
                    print(f"🧼 Duplikat pending_change finns redan för {apple_id} – hoppar över.")
                    num_pending_skipped += 1
                else:
                    # Skapa pending_change – endast emails, inte email som nyckel
                    cur.execute("""
                        INSERT INTO pending_changes (table_name, operation, payload, record_id, created_at, change_type, direction)
                        VALUES (%s, %s, %s::jsonb, %s, NOW(), %s, %s)
                    """, ("contact", operation, json.dumps(jsonPayload), record_id, "sync_to_apple", "out"))
                    num_pending_created += 1

            cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
            cur.execute("""
                INSERT INTO event_log (id, source, event_type, payload, received_at)
                VALUES (gen_random_uuid(), 'sync', 'sync_to_apple_contact', %s, now())
            """, (json.dumps({
                "record_id": record_id,
                "operation": operation,
                "email": email,
                "apple_id": apple_id,
                "apple_uid": apple_id,
                "origin": payload.get("metadata", {}).get("origin", "")
            }),))
            conn.commit()
            print(f"✅ Skrev kontakt till Apple Kontakter och markerade som klar: {email}")

    conn.close()
    print(f"✅ Klar med synkning av Apple-kontakter. Totalt {len(changes)} kontakter behandlade.")
    print(f"ℹ️ Skapade pending_changes: {num_pending_created}, hoppade över (duplikat/identiska): {num_pending_skipped}")

if __name__ == "__main__":
    main()
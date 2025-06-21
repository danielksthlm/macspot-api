import psycopg2
import json
from datetime import datetime
from config import LOCAL_DB_CONFIG
from Contacts import CNContactStore, CNMutableContact, CNSaveRequest, CNPhoneNumber, CNLabeledValue, CNEmailAddress

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
            SELECT id, record_id, operation, payload
            FROM pending_changes
            WHERE table_name = 'contact' AND direction = 'out' AND processed = false
            ORDER BY created_at ASC
        """)
        rows = cur.fetchall()

        for change_id, record_id, operation, payload_json in rows:
            payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
            email = payload.get("email", None)
            metadata = payload.get("metadata", {})
            
            print(f"↘️ Skriver till local contact: {email} ({operation})")

            if operation == "INSERT":
                cur.execute("""
                    INSERT INTO contact (id, email, booking_email, metadata)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """, (record_id, email, email, json.dumps(payload)))
            elif operation == "UPDATE":
                cur.execute("""
                    UPDATE contact
                    SET email = %s,
                        booking_email = %s,
                        metadata = %s
                    WHERE id = %s
                """, (email, email, json.dumps(payload), record_id))

            cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
            conn.commit()

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

    for change in changes:
        change_id, record_id, operation, payload_json = change
        payload = json.loads(payload_json) if isinstance(payload_json, str) else payload_json
        print(f"👤 Kontakt: {payload.get('first_name', '')} {payload.get('last_name', '')} – {payload.get('email', '')}")

        store = CNContactStore.alloc().init()
        request = CNSaveRequest.alloc().init()

        contact = CNMutableContact.alloc().init()

        predicate = CNContact.predicateForContactsMatchingEmailAddress_(payload.get("email", ""))
        contacts, _ = store.unifiedContactsMatchingPredicate_keysToFetch_error_(predicate, None, None)
        if contacts and len(contacts) > 0:
            existing = contacts[0].mutableCopy()
            contact = existing
            print(f"🔁 Uppdaterar befintlig kontakt i Apple: {payload.get('email', '')}")
        else:
            print(f"➕ Skapar ny kontakt i Apple: {payload.get('email', '')}")

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
                email = CNLabeledValue.labeledValueWithLabel_value_(label, value)
                email_values.append(email)
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

        if contacts and len(contacts) > 0:
            request.updateContact_(contact)
        else:
            request.addContact_toContainerWithIdentifier_(contact, None)
        store.executeSaveRequest_error_(request, None)

        with conn.cursor() as cur:
            cur.execute("UPDATE pending_changes SET processed = true WHERE id = %s", (change_id,))
            conn.commit()
            print(f"✅ Skrev kontakt till Apple Kontakter och markerade som klar: {payload.get('email', '')}")

    conn.close()

if __name__ == "__main__":
    main()
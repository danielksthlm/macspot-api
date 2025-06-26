import os
import asyncpg
from typing import List

import json

def fix_encoding(text):
    if isinstance(text, str):
        try:
            return text.encode("latin1").decode("utf-8")
        except Exception:
            return text
    return text

async def get_contacts_with_emails_grouped():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            c.id,
            c.metadata,
            ccr.metadata->>'email' AS email,
            ccr.role,
            ccr.main_contact,
            cmp.metadata->>'name' AS company_name
        FROM contact c
        JOIN ccrelation ccr ON c.id = ccr.contact_id
        LEFT JOIN company cmp ON ccr.company_id = cmp.id
        ORDER BY c.created_at DESC
    """)
    await conn.close()

    contact_map = {}
    for row in rows:
        contact_id = str(row["id"])
        metadata_raw = row["metadata"]
        metadata = metadata_raw if isinstance(metadata_raw, dict) else json.loads(metadata_raw or "{}")
        email = row["email"]
        role = row["role"]
        if contact_id not in contact_map:
            contact_map[contact_id] = {
                "id": contact_id,
                "first_name": fix_encoding(metadata.get("first_name")),
                "last_name": fix_encoding(metadata.get("last_name")),
                "company": fix_encoding(metadata.get("company")),
                "emails": []
            }
        label = "★" if row["main_contact"] else ""
        contact_map[contact_id]["emails"].append({
            "email": email,
            "role": role,
            "company_name": row["company_name"],
            "main_contact": row["main_contact"],
            "label": label
        })
    # Sort emails so that main_contact=True comes first for each contact
    for contact in contact_map.values():
        contact["emails"].sort(key=lambda x: not x.get("main_contact", False))
    return list(contact_map.values())

async def get_all_contacts():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            c.id,
            ccr.metadata->>'email' AS email,
            c.metadata,
            COALESCE(b.count, 0) AS booking_count
        FROM contact c
        JOIN ccrelation ccr ON c.id = ccr.contact_id
        LEFT JOIN (
            SELECT contact_id, COUNT(*) AS count
            FROM bookings
            GROUP BY contact_id
        ) b ON c.id = b.contact_id
        ORDER BY c.created_at DESC
    """)
    await conn.close()
    contacts = []
    for row in rows:
        metadata_raw = row["metadata"]
        if isinstance(metadata_raw, dict):
            metadata = metadata_raw
        elif isinstance(metadata_raw, str):
            try:
                metadata = json.loads(metadata_raw)
            except Exception:
                metadata = {}
        else:
            metadata = {}
        print("RAW last_name:", metadata.get("last_name"))
        contacts.append({
            "id": str(row["id"]),
            "email": row["email"],  # Now comes from ccr.metadata->>'email'
            "first_name": fix_encoding(metadata.get("first_name")),
            "last_name": fix_encoding(metadata.get("last_name")),
            "company": fix_encoding(metadata.get("company")),
            "phone": metadata.get("phone"),
            "booking_count": row["booking_count"]
        })
    return contacts

async def get_contact_by_id(contact_id: str):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    row = await conn.fetchrow("""
        SELECT c.*, ccr.metadata->>'email' AS email
        FROM contact c
        JOIN ccrelation ccr ON c.id = ccr.contact_id
        WHERE c.id = $1
        LIMIT 1
    """, contact_id)
    await conn.close()
    if row:
        return dict(row)
    return {"error": "Contact not found"}
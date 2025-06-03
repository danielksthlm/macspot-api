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

async def get_all_contacts():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            c.id,
            c.email,
            c.booking_email,
            c.metadata,
            COALESCE(b.count, 0) AS booking_count
        FROM contact c
        LEFT JOIN (
            SELECT contact_id, COUNT(*) AS count
            FROM bookings
            GROUP BY contact_id
        ) b ON c.id = b.contact_id
        ORDER BY c.created_at DESC
        LIMIT 100
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
            "email": row["email"],
            "booking_email": row["booking_email"],
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
    row = await conn.fetchrow("SELECT * FROM contact WHERE id = $1", contact_id)
    await conn.close()
    if row:
        return dict(row)
    return {"error": "Contact not found"}
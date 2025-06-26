from fastapi import APIRouter
from fastapi.responses import JSONResponse
from fastapi import HTTPException, Request
from .services import get_all_contacts, get_contact_by_id, get_contacts_with_emails_grouped
import asyncpg
import os

router = APIRouter(prefix="/contacts", tags=["contacts"])

@router.get("")
async def list_contacts():
    data = await get_all_contacts()
    return JSONResponse(content=data, media_type="application/json; charset=utf-8")

@router.get("/{contact_id}")
async def get_contact(contact_id: str):
    return await get_contact_by_id(contact_id)


# Booking settings endpoints
@router.get("/settings")
async def get_booking_settings():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    try:
        rows = await conn.fetch("SELECT key, value, value_type FROM booking_settings")
        return {
            r["key"]: {
                "value": r["value"],
                "value_type": r["value_type"]
            }
            for r in rows
        }
    finally:
        await conn.close()

@router.put("/settings/{key}")
async def update_booking_setting(key: str, request: Request):
    body = await request.json()
    value = body.get("value")
    if value is None:
        raise HTTPException(status_code=400, detail="Missing 'value'")
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    try:
        await conn.execute(
            "UPDATE booking_settings SET value = $1, updated_at = NOW() WHERE key = $2",
            value,
            key
        )
        return {"status": "ok", "key": key}
    finally:
        await conn.close()

@router.get("/with-emails")
async def list_contacts_with_emails_grouped():
    data = await get_contacts_with_emails_grouped()
    return JSONResponse(content=data, media_type="application/json; charset=utf-8")
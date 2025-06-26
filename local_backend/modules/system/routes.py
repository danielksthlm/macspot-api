from fastapi import APIRouter, Body
import asyncpg
import os
from fastapi.responses import JSONResponse

router = APIRouter()

@router.get("/table-metadata")
async def get_table_metadata():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    try:
        rows = await conn.fetch("SELECT category, table_name, description FROM table_metadata_view")
        return [dict(row) for row in rows]
    finally:
        await conn.close()


# Endpoint to update table metadata for a specific field
@router.put("/table-metadata/{table}/{field}")
async def update_table_metadata(table: str, field: str, payload: dict):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    try:
        await conn.execute("""
            UPDATE table_metadata
            SET 
                description = COALESCE($1, description),
                label = COALESCE($2, label),
                data_type = COALESCE($3, data_type),
                readonly = COALESCE($4, readonly)
            WHERE table_name = $5 AND field = $6
        """,
        payload.get("description"),
        payload.get("label"),
        payload.get("data_type"),
        payload.get("readonly"),
        table, field)
        return {"table": table, "field": field, "updated": True}
    finally:
        await conn.close()


# Booking settings endpoints
@router.get("/booking-settings")
async def get_booking_settings():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    try:
        rows = await conn.fetch("SELECT key, value FROM booking_settings")
        return {row["key"]: row["value"] for row in rows}
    finally:
        await conn.close()


@router.put("/booking-settings/{key}")
async def update_booking_setting(key: str, payload: dict = Body(...)):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    try:
        await conn.execute("""
            UPDATE booking_settings
            SET value = $1
            WHERE key = $2
        """, payload.get("value"), key)
        return JSONResponse(content={"key": key, "value": payload.get("value")})
    finally:
        await conn.close()
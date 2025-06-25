from fastapi import APIRouter
from local_backend.db import get_db_connection  # justera om annan import

router = APIRouter()

@router.get("/table-metadata")
async def get_table_metadata():
    conn = await get_db_connection()
    rows = await conn.fetch("SELECT category, table_name, description FROM table_metadata_view")
    await conn.close()
    return [dict(row) for row in rows]
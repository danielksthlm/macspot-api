import asyncpg
import os

async def get_open_invoices():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT id, supplier, due_date, amount, status
        FROM invoice
        WHERE status = 'unpaid'
        ORDER BY due_date ASC
    """)
    await conn.close()
    return [dict(row) for row in rows]
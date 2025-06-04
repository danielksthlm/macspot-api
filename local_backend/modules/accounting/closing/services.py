import asyncpg
import os
from datetime import date, timedelta

async def lock_period_service():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    today = date.today()
    result = await conn.execute("""
        UPDATE period
        SET locked = true
        WHERE end_date < $1 AND locked = false
    """, today)
    await conn.close()
    return f"Perioder låsta: {result}"

async def perform_year_end_closing():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    latest = await conn.fetchrow("SELECT end_date FROM period ORDER BY end_date DESC LIMIT 1")
    if not latest:
        await conn.close()
        return "Ingen tidigare period hittades"
    new_start = latest["end_date"] + timedelta(days=1)
    new_end = new_start.replace(year=new_start.year + 1) - timedelta(days=1)
    await conn.execute("""
        INSERT INTO period (id, start_date, end_date, locked, name, created_at)
        VALUES (gen_random_uuid(), $1, $2, false, $3, now())
    """, new_start, new_end, f"{new_start.year}")
    await conn.close()
    return f"Ny period skapad: {new_start} – {new_end}"
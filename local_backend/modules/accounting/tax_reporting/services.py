import asyncpg

async def generate_tax_report(db_url: str, year: int, month: int):
    conn = await asyncpg.connect(dsn=db_url)
    try:
        rows = await conn.fetch("""
            SELECT
                a.number AS account,
                a.name AS account_name,
                SUM(e.amount) AS total
            FROM entry e
            JOIN account a ON e.account_id = a.id
            WHERE EXTRACT(YEAR FROM e.created_at) = $1
              AND EXTRACT(MONTH FROM e.created_at) = $2
              AND a.number LIKE '26%'  -- momsrelaterade konton
            GROUP BY a.number, a.name
            ORDER BY a.number
        """, year, month)
        return [dict(r) for r in rows]
    finally:
        await conn.close()
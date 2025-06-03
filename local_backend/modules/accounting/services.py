import os
import asyncpg

async def generate_resultatrapport():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT rs.group_name, SUM(e.amount) AS total
        FROM entry e
        JOIN account a ON e.account_id = a.id
        JOIN report_structure rs
          ON (a.number = rs.account_number OR a.number BETWEEN split_part(rs.account_range, '-', 1)::text AND split_part(rs.account_range, '-', 2)::text)
        WHERE rs.report_type = 'resultat'
        GROUP BY rs.group_name, rs.order_index
        ORDER BY rs.order_index
    """)
    await conn.close()
    return [{"group": row["group_name"], "total": float(row["total"])} for row in rows]

async def generate_balansrapport():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT rs.group_name, SUM(e.amount) AS total
        FROM entry e
        JOIN account a ON e.account_id = a.id
        JOIN report_structure rs
          ON (a.number = rs.account_number OR a.number BETWEEN split_part(rs.account_range, '-', 1)::text AND split_part(rs.account_range, '-', 2)::text)
        WHERE rs.report_type = 'balans'
        GROUP BY rs.group_name, rs.order_index
        ORDER BY rs.order_index
    """)
    await conn.close()
    return [{"group": row["group_name"], "total": float(row["total"])} for row in rows]

async def generate_momsrapport():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT rs.group_name, SUM(e.amount) AS total
        FROM entry e
        JOIN account a ON e.account_id = a.id
        JOIN report_structure rs
          ON (a.number = rs.account_number OR a.number BETWEEN split_part(rs.account_range, '-', 1)::text AND split_part(rs.account_range, '-', 2)::text)
        WHERE rs.report_type = 'moms'
        GROUP BY rs.group_name, rs.order_index
        ORDER BY rs.order_index
    """)
    await conn.close()
    results = [{"group": row["group_name"], "total": float(row["total"])} for row in rows]
    netto = sum(r["total"] for r in results)
    results.append({"group": "Netto att betala", "total": netto})
    return results
async def get_chart_of_accounts(language="sv"):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT
            a.number,
            COALESCE(t.name, a.name) AS name,
            a.type,
            a.is_active,
            a.report_type,
            a.report_group
        FROM account a
        LEFT JOIN account_translation t
          ON t.account_id = a.id AND t.language = $1
        ORDER BY a.number
    """, language)
    await conn.close()
    return [dict(row) for row in rows]
from .schemas import TransactionIn
from uuid import uuid4
from decimal import Decimal
from datetime import datetime
import os
import asyncpg
import json

def fix_encoding(text):
    if isinstance(text, str):
        try:
            return text.encode("latin1").decode("utf-8")
        except Exception:
            return text
    return text

async def get_accounts(language="sv"):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            a.id,
            a.number,
            COALESCE(t.name, a.name) AS name,
            a.type
        FROM account a
        LEFT JOIN account_translation t
          ON t.account_id = a.id AND t.language = $1
        ORDER BY a.number
    """, language)
    await conn.close()
    from uuid import UUID
    return [
        {
            k: fix_encoding(str(v)) if isinstance(v, str) else str(v) if isinstance(v, UUID) else v
            for k, v in row.items()
        }
        for row in rows
    ]

async def get_transactions(language="sv", filter_user=None):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    # Prepare for future translation of 'description' via transaction_translation
    rows = await conn.fetch("""
        SELECT
            t.id,
            t.date,
            COALESCE(tt.description, t.description) AS description,
            t.description AS original_description,
            t.series,
            t.ver_no,
            t.metadata,
            t.created_at,
            json_agg(json_build_object(
                'id', e.id,
                'account_id', e.account_id,
                'amount', e.amount,
                'description', e.description,
                'metadata', e.metadata
            )) AS entries
        FROM transaction t
        LEFT JOIN transaction_translation tt
          ON tt.transaction_id = t.id AND tt.language = $1
        LEFT JOIN entry e ON e.transaction_id = t.id
        WHERE ($2::text IS NULL OR t.metadata->>'user' = $2)
        GROUP BY t.id, tt.description
        ORDER BY t.date DESC, t.ver_no DESC
        LIMIT 100
    """, language, filter_user)
    await conn.close()
    from uuid import UUID
    from datetime import date
    result = []
    for row in rows:
        user = None
        try:
            user = json.loads(row["metadata"]).get("user")
        except Exception:
            pass
        has_translation = row["description"] != row["original_description"]
        obj = {
            k: fix_encoding(str(v)) if isinstance(v, str)
            else str(v) if isinstance(v, (UUID, date))
            else v
            for k, v in row.items()
        }
        obj["has_translation"] = has_translation
        obj["user"] = user
        result.append(obj)
    return result


# Skapa ny funktion för att skapa transaktion
async def create_transaction(transaction: TransactionIn):
    import json
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)

    default_user = os.getenv("DEFAULT_USER_EMAIL", "unknown@local")

    # Hämta nästa ver_no för serien
    ver_row = await conn.fetchrow("""
        UPDATE journal_series
        SET next_ver_no = next_ver_no + 1
        WHERE series = $1
        RETURNING next_ver_no - 1 AS ver_no
    """, transaction.series)
    if not ver_row:
        await conn.close()
        raise ValueError(f"Ogiltig verifikationsserie: {transaction.series}")
    ver_no = ver_row["ver_no"]

    # Hämta alla kontonummer i en gång
    account_rows = await conn.fetch("SELECT id, number FROM account")
    account_map = {r["number"]: r["id"] for r in account_rows}

    # Kontroll: alla konton måste finnas
    for entry in transaction.entries:
        if entry.account_number not in account_map:
            await conn.close()
            raise ValueError(f"Konto saknas: {entry.account_number}")

    # Kontroll: debet = kredit
    total = sum([entry.amount for entry in transaction.entries])
    if total != Decimal("0.00"):
        await conn.close()
        raise ValueError(f"Obalanserad transaktion: {total}")

    # Kontrollera metadata och sätt user om saknas, serialisera till JSON-sträng
    metadata_dict = transaction.metadata or {}
    if "user" not in metadata_dict:
        metadata_dict["user"] = default_user
    metadata = json.dumps(metadata_dict)

    # Skapa verifikat
    tx_id = uuid4()
    now = datetime.utcnow()
    await conn.execute("""
        INSERT INTO transaction (id, date, description, series, ver_no, metadata, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
    """, tx_id, transaction.date, transaction.description, transaction.series, ver_no, metadata, now)

    import json
    for entry in transaction.entries:
        entry_metadata = entry.metadata or {}
        entry_metadata["user"] = entry_metadata.get("user", metadata_dict["user"])
        entry_metadata["generated_by"] = entry_metadata.get("generated_by", "macspot-backend")
        entry_metadata = json.dumps(entry_metadata)
        await conn.execute("""
            INSERT INTO entry (id, transaction_id, account_id, amount, description, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        """, uuid4(), tx_id, account_map[entry.account_number], entry.amount,
             entry.description, entry_metadata, now)

    await conn.close()
    return {"status": "ok", "transaction_id": str(tx_id), "series": transaction.series, "ver_no": ver_no}
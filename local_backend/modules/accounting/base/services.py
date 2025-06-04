from typing import Optional
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
    # --- created_by lookup ---
    created_by = None
    user_email = metadata_dict.get("user", default_user)
    contact_row = await conn.fetchrow("SELECT id FROM contact WHERE email = $1", user_email)
    if contact_row:
        created_by = contact_row["id"]
    metadata = json.dumps(metadata_dict)

    # Skapa verifikat
    tx_id = uuid4()
    now = datetime.utcnow()
    await conn.execute("""
        INSERT INTO transaction (id, date, description, series, ver_no, metadata, created_at, updated_at, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9)
    """, tx_id, transaction.date, transaction.description, transaction.series, ver_no, metadata, now, transaction.status, created_by)

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


# Avvikelse-/felupptäckt
async def detect_anomalies():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    try:
        rows = await conn.fetch("""
            SELECT t.id, t.description, t.date, t.ver_no, a.number AS account_number, e.amount
            FROM transaction t
            JOIN entry e ON e.transaction_id = t.id
            JOIN account a ON a.id = e.account_id
            WHERE t.date > now() - interval '12 months'
        """)
        seen = set()
        anomalies = []
        for r in rows:
            key = (r["description"], float(r["amount"]))
            if key in seen:
                anomalies.append({
                    "transaction_id": str(r["id"]),
                    "ver_no": r["ver_no"],
                    "reason": "Dublett: samma text och belopp",
                    "description": r["description"],
                    "amount": float(r["amount"]),
                    "date": r["date"].isoformat(),
                })
            else:
                seen.add(key)
            if abs(float(r["amount"])) > 50000:
                anomalies.append({
                    "transaction_id": str(r["id"]),
                    "ver_no": r["ver_no"],
                    "reason": "Högt belopp",
                    "description": r["description"],
                    "amount": float(r["amount"]),
                    "date": r["date"].isoformat(),
                })
    finally:
        await conn.close()
    return anomalies

# --- Budget vs Actual report
async def generate_budget_vs_actual(db_url: str, year: Optional[int] = None, month: Optional[int] = None):
    conditions = []
    values = []

    if year:
        conditions.append("b.year = $%d" % (len(values)+1))
        values.append(year)
    if month:
        conditions.append("b.month = $%d" % (len(values)+1))
        values.append(month)

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch(f"""
        SELECT
            b.year,
            b.month,
            b.account_number,
            b.amount AS budget,
            COALESCE(SUM(e.amount), 0) AS actual
        FROM budget b
        LEFT JOIN account a ON a.number = b.account_number
        LEFT JOIN entry e ON e.account_id = a.id
          AND EXTRACT(YEAR FROM e.created_at) = b.year
          AND EXTRACT(MONTH FROM e.created_at) = b.month
        {where_clause}
        GROUP BY b.year, b.month, b.account_number, b.amount
        ORDER BY b.year, b.month, b.account_number
    """, *values)
    await conn.close()
    return [dict(r) for r in rows]

async def generate_cashflow_report():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            TO_CHAR(t.date, 'YYYY-MM') AS period,
            SUM(e.amount) FILTER (WHERE a.type = 'tillgång' AND e.amount > 0) AS inflow,
            SUM(e.amount) FILTER (WHERE a.type = 'tillgång' AND e.amount < 0) AS outflow
        FROM entry e
        JOIN account a ON e.account_id = a.id
        JOIN transaction t ON e.transaction_id = t.id
        GROUP BY period
        ORDER BY period
    """)
    await conn.close()
    return [dict(r) for r in rows]

async def generate_full_cashflow_report():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            TO_CHAR(t.date, 'YYYY-MM') AS period,
            a.number AS account_number,
            a.name AS account_name,
            a.type AS account_type,
            SUM(e.amount) AS total
        FROM entry e
        JOIN account a ON e.account_id = a.id
        JOIN transaction t ON e.transaction_id = t.id
        WHERE a.type IN ('tillgång', 'skuld')
        GROUP BY period, a.number, a.name, a.type
        ORDER BY period, a.number
    """)
    await conn.close()

    # Strukturera datan
    cashflow = {}
    for r in rows:
        period = r["period"]
        if period not in cashflow:
            cashflow[period] = {
                "period": period,
                "accounts": []
            }
        cashflow[period]["accounts"].append({
            "account_number": r["account_number"],
            "account_name": r["account_name"],
            "account_type": r["account_type"],
            "amount": float(r["total"])
        })

    return list(cashflow.values())


# Ny funktion: indirekt kassaflödesanalys
async def generate_indirect_cashflow(db_url: str):
    conn = await asyncpg.connect(dsn=db_url)
    try:
        # Steg 1: Hämta årets resultat (nettoresultat)
        net_result_row = await conn.fetchrow("""
            SELECT SUM(e.amount) AS net_income
            FROM entry e
            JOIN account a ON e.account_id = a.id
            WHERE a.report_type = 'resultat'
        """)

        # Steg 2: Justera för icke-kassapåverkande poster (t.ex. avskrivningar)
        adjustments = await conn.fetch("""
            SELECT a.number, a.name, SUM(e.amount) AS total
            FROM entry e
            JOIN account a ON e.account_id = a.id
            WHERE a.number LIKE '7%' -- t.ex. avskrivningar: 7830 etc.
            GROUP BY a.number, a.name
        """)

        # Steg 3: Förändringar i rörelsekapital (tillgångar och skulder)
        working_capital = await conn.fetch("""
            SELECT a.type, a.number, a.name, SUM(e.amount) AS delta
            FROM entry e
            JOIN account a ON e.account_id = a.id
            WHERE a.type IN ('tillgång', 'skuld')
            GROUP BY a.type, a.number, a.name
        """)

        await conn.close()

        return {
            "net_income": float(net_result_row["net_income"] or 0),
            "adjustments": [
                {
                    "account": r["number"],
                    "name": r["name"],
                    "amount": float(r["total"])
                } for r in adjustments
            ],
            "working_capital_changes": [
                {
                    "account": r["number"],
                    "name": r["name"],
                    "type": r["type"],
                    "delta": float(r["delta"])
                } for r in working_capital
            ]
        }
    except Exception as e:
        await conn.close()
        raise

# Ny funktion: kontoavstämning för ett specifikt konto
async def generate_reconciliation_report(db_url: str, account_number: str):
    conn = await asyncpg.connect(dsn=db_url)
    try:
        rows = await conn.fetch("""
            SELECT t.date, t.description, e.amount
            FROM entry e
            JOIN transaction t ON t.id = e.transaction_id
            JOIN account a ON a.id = e.account_id
            WHERE a.number = $1
            ORDER BY t.date
        """, account_number)
        total = sum([r["amount"] for r in rows])
        transactions = [{
            "date": r["date"].isoformat(),
            "description": r["description"],
            "amount": float(r["amount"])
        } for r in rows]
        return {
            "account_number": account_number,
            "total_balance": float(total),
            "transactions": transactions
        }
    finally:
        await conn.close()

# --- SIE export ---
async def generate_sie_export(start_date=None, end_date=None):
    conn = await asyncpg.connect(dsn=os.environ["LOCAL_DB_URL"])
    try:
        sie_lines = []
        sie_lines.append("#FLAGGA 0")
        sie_lines.append("#FORMAT PC8")
        sie_lines.append("#GEN 2")
        sie_lines.append("#SIETYP 4")
        sie_lines.append("#PROGRAM macspot 1.0")
        sie_lines.append(f"#ORGNR 000000-0000")
        sie_lines.append(f"#FNAMN Ditt Företag AB")

        # Kontoplan
        accounts = await conn.fetch("SELECT number, name FROM account ORDER BY number")
        for acc in accounts:
            sie_lines.append(f"#KONTO {acc['number']} \"{acc['name']}\"")

        # Verifikationer
        query = """
            SELECT t.id, t.date, t.series, t.ver_no, t.description, e.amount, a.number AS account
            FROM transaction t
            JOIN entry e ON e.transaction_id = t.id
            JOIN account a ON a.id = e.account_id
            WHERE ($1::date IS NULL OR t.date >= $1)
              AND ($2::date IS NULL OR t.date <= $2)
            ORDER BY t.date, t.ver_no
        """
        rows = await conn.fetch(query, start_date, end_date)
        for row in rows:
            datum = row["date"].strftime("%Y%m%d")
            sie_lines.append(f"#{'VER'} \"{row['series']}\" {datum} \"{row['description']}\"")
            sie_lines.append(f"#{'TRANS'} {row['account']} {row['amount']} \"\"")

        return "\n".join(sie_lines)
    finally:
        await conn.close()
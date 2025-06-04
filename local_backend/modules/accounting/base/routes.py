from fastapi import APIRouter
from fastapi import Depends
router = APIRouter(prefix="/accounting", tags=["accounting"])

# 🔐 Följande endpoints kräver Bearer-token (API-autentisering):
# - POST /transactions
# - POST /transaction_translations
# - POST /attachments

import os
API_KEY = os.getenv("API_ACCOUNTING_KEY")

from fastapi import Header, HTTPException
def verify_token(authorization: str = Header(None)):
    if authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid or missing token")

@router.get("/report/reconciliation", dependencies=[Depends(verify_token)])
async def get_reconciliation(account_number: str):
    from .services import generate_reconciliation_report
    db_url = os.environ["LOCAL_DB_URL"]
    result = await generate_reconciliation_report(db_url, account_number)
    return JSONResponse(content={"status": "ok", "result": result})
from .suggest_accounting import analyze_invoice_attachment
from fastapi import HTTPException
from fastapi import Path
from fastapi import UploadFile, File
from fastapi import Depends, Header
from fastapi import Query
from uuid import UUID
from .schemas import TransactionIn, TransactionTranslationIn, TransactionTranslationOut
from .services import create_transaction
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from .services import get_accounts, get_transactions, generate_full_cashflow_report
from typing import Optional
import os

# --- BANK RECONCILIATION & CSV UPLOAD ---
import csv
from fastapi import UploadFile
from io import StringIO



router = APIRouter(prefix="/accounting", tags=["accounting"])

# 🔐 Följande endpoints kräver Bearer-token (API-autentisering):
# - POST /transactions
# - POST /transaction_translations
# - POST /attachments

API_KEY = os.getenv("API_ACCOUNTING_KEY")

def verify_token(authorization: str = Header(None)):
    if authorization != f"Bearer {API_KEY}":
        raise HTTPException(status_code=401, detail="Invalid or missing token")

@router.get("/chart_of_accounts")
async def get_chart(lang: str = "sv"):
    from .services import get_chart_of_accounts
    data = await get_chart_of_accounts(language=lang)
    return JSONResponse(content=data)

@router.get("/report/resultat")
async def get_resultatrapport():
    from .services import generate_resultatrapport
    data = await generate_resultatrapport()
    return JSONResponse(content=data)

@router.get("/report/balans")
async def get_balansrapport():
    from .services import generate_balansrapport
    data = await generate_balansrapport()
    return JSONResponse(content=data)

@router.get("/report/moms")
async def get_momsrapport():
    from .services import generate_momsrapport
    data = await generate_momsrapport()
    return JSONResponse(content=data)

@router.get("/accounts")
async def list_accounts(lang: str = "sv"):
    data = await get_accounts(language=lang)
    return JSONResponse(content=data)

@router.get("/transactions")
async def list_transactions(lang: str = "sv", user: Optional[str] = None):
    data = await get_transactions(language=lang, filter_user=user)
    return JSONResponse(content=data)


# Skapa ny POST-route för transactions
@router.post("/transactions", dependencies=[Depends(verify_token)])
async def post_transaction(transaction: TransactionIn):
    """
    Skapa en ny transaction. Tar emot och sparar även currency_code, exchange_rate och total_amount_original.
    """
    try:
        # Pass entire transaction object, which now includes currency_code, exchange_rate, total_amount_original
        result = await create_transaction(transaction)
        return JSONResponse(content=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# Ny POST-endpoint för att föreslå konto baserat på beskrivning, filnamn och belopp
@router.post("/suggest_accounting")
async def suggest_accounting_api(payload: dict):
    desc = payload.get("description", "")
    file_name = payload.get("file_name", "")
    amount = payload.get("amount")
    suggestion = suggest_account(desc, file_name, amount)
    return {"status": "ok", **suggestion}

from .suggest_accounting import extract_text_from_pdf
import asyncpg

@router.post("/extract_text_from_attachment")
async def extract_text_endpoint(attachment_id: UUID):
    try:
        db_url = os.environ["LOCAL_DB_URL"]
        conn = await asyncpg.connect(dsn=db_url)
        row = await conn.fetchrow("SELECT data FROM attachment WHERE id = $1", attachment_id)
        await conn.close()

        if not row:
            raise HTTPException(status_code=404, detail="Attachment not found")

        text = extract_text_from_pdf(row["data"])
        return {"text": text}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Skapa ny POST-route för transaction_translations
import asyncpg
from fastapi import HTTPException


@router.post("/transaction_translations", dependencies=[Depends(verify_token)])
async def add_transaction_translation(translation: TransactionTranslationIn):
    try:
        db_url = os.environ["LOCAL_DB_URL"]
        conn = await asyncpg.connect(dsn=db_url)
        await conn.execute("""
            INSERT INTO transaction_translation (transaction_id, language, description)
            VALUES ($1, $2, $3)
            ON CONFLICT (transaction_id, language) DO UPDATE
            SET description = EXCLUDED.description
        """, translation.transaction_id, translation.language, translation.description)
        await conn.close()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Ny GET-endpoint för att hämta översättningar för en transaction_id
from typing import List
from uuid import UUID

@router.get("/transaction_translations/{transaction_id}", response_model=List[TransactionTranslationOut])
async def get_transaction_translations(transaction_id: UUID):
    try:
        db_url = os.environ["LOCAL_DB_URL"]
        conn = await asyncpg.connect(dsn=db_url)
        rows = await conn.fetch("""
            SELECT transaction_id, language, description
            FROM transaction_translation
            WHERE transaction_id = $1
        """, transaction_id)
        await conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Ny POST-endpoint för att ladda upp bilagor
@router.post("/attachments", dependencies=[Depends(verify_token)])
async def upload_attachment(transaction_id: UUID, file: UploadFile = File(...)):
    allowed_types = ["application/pdf", "image/jpeg", "image/png"]
    max_size_bytes = 5 * 1024 * 1024  # 5 MB

    if file.content_type not in allowed_types:
        raise HTTPException(status_code=422, detail=f"Filtypen '{file.content_type}' är inte tillåten")

    content = await file.read()

    if len(content) > max_size_bytes:
        raise HTTPException(status_code=422, detail=f"Filen är för stor (max 5 MB)")

    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    await conn.execute("""
        INSERT INTO attachment (transaction_id, filename, content_type, data)
        VALUES ($1, $2, $3, $4)
    """, transaction_id, file.filename, file.content_type, content)
    await conn.close()

    return {"status": "ok", "filename": file.filename}
# Ny GET-endpoint för att hämta alla bilagor för en viss transaction_id
from uuid import UUID

@router.get("/attachments/{transaction_id}")
async def get_attachments(transaction_id: UUID):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT id, filename, content_type, data, uploaded_at
        FROM attachment
        WHERE transaction_id = $1
        ORDER BY uploaded_at
    """, transaction_id)
    await conn.close()
    return [
        {
            "id": str(row["id"]),
            "filename": row["filename"],
            "content_type": row["content_type"],
            "uploaded_at": row["uploaded_at"].isoformat(),
            "size_bytes": len(row["data"])
        }
        for row in rows
    ]


# Ny GET-endpoint för att ladda ner en bilaga
from uuid import UUID
from fastapi.responses import StreamingResponse
from io import BytesIO

@router.get("/attachments/{attachment_id}/download")
async def download_attachment(attachment_id: UUID):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    row = await conn.fetchrow("""
        SELECT filename, content_type, data
        FROM attachment
        WHERE id = $1
    """, attachment_id)
    await conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")

    return StreamingResponse(BytesIO(row["data"]), media_type=row["content_type"], headers={
        "Content-Disposition": f'attachment; filename="{row["filename"]}"'
    })

# Byt namn på en bilaga
@router.put("/attachments/{attachment_id}/rename", dependencies=[Depends(verify_token)])
async def rename_attachment(attachment_id: UUID, new_filename: str):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    result = await conn.execute("""
        UPDATE attachment SET filename = $1 WHERE id = $2
    """, new_filename, attachment_id)
    await conn.close()
    return {"status": "ok", "result": result}

# Radera en bilaga
@router.delete("/attachments/{attachment_id}", dependencies=[Depends(verify_token)])
async def delete_attachment(attachment_id: UUID):
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    result = await conn.execute("""
        DELETE FROM attachment WHERE id = $1
    """, attachment_id)
    await conn.close()
    return {"status": "ok", "result": result}


# Ny POST-endpoint för att analysera en fakturabilaga
from uuid import UUID
from fastapi import Depends


@router.post("/analyze_invoice", dependencies=[Depends(verify_token)])
async def analyze_invoice(attachment_id: UUID):
    db_url = os.environ["LOCAL_DB_URL"]
    try:
        result = await analyze_invoice_attachment(attachment_id, db_url)
        from .suggest_accounting import suggest_periodization, generate_transaction_from_parsed
        periodization = suggest_periodization(result.get("text", ""), result.get("parsed", {}).get("total_amount", 0))
        tx_suggestion = generate_transaction_from_parsed(result.get("parsed", {}))
        result["periodization"] = periodization
        result["transaction_suggestion"] = tx_suggestion
        return JSONResponse(content={"status": "ok", **result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Ny POST-endpoint: Konvertera fakturabilaga till transaktion
from uuid import UUID
from fastapi import Depends

@router.post("/invoice_to_transaction", dependencies=[Depends(verify_token)])
async def invoice_to_transaction(attachment_id: UUID):
    from .suggest_accounting import analyze_invoice_attachment, generate_transaction_from_parsed
    from .services import create_transaction
    from .schemas import TransactionIn, EntryIn
    import os
    import datetime

    db_url = os.environ["LOCAL_DB_URL"]
    result = await analyze_invoice_attachment(str(attachment_id), db_url)
    parsed = result.get("parsed", {})

    tx_suggestion = generate_transaction_from_parsed(parsed)
    if not tx_suggestion:
        raise HTTPException(status_code=422, detail="Kunde inte generera transaktion från faktura")

    try:
        entries = [
            EntryIn(
                account_number=e["account_number"],
                amount=e["amount"],
                description=e.get("description"),
                metadata={"generated_by": "invoice_to_transaction"}
            )
            for e in tx_suggestion["entries"]
        ]

        transaction = TransactionIn(
            date=datetime.date.fromisoformat(tx_suggestion["date"]) if tx_suggestion.get("date") else datetime.date.today(),
            description=tx_suggestion.get("description", "Fakturaimport"),
            series="A",
            metadata={"reference": tx_suggestion.get("reference"), "source": "invoice_auto"},
            entries=entries
        )

        result = await create_transaction(transaction)
        return {"status": "ok", **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Ny POST-endpoint för GPT-analys av faktura
@router.post("/invoice_gpt_analysis", dependencies=[Depends(verify_token)])
async def invoice_gpt_analysis(attachment_id: UUID):
    from .suggest_accounting import extract_text_from_pdf, parse_invoice_with_gpt
    import asyncpg
    import os
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    row = await conn.fetchrow("SELECT data FROM attachment WHERE id = $1", str(attachment_id))
    await conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Attachment not found")
    text = extract_text_from_pdf(row["data"])
    gpt_result = parse_invoice_with_gpt(text)
    return {"text": text, "gpt_parsed": gpt_result}

# Ny GET-endpoint för att flagga avvikande transaktioner
@router.get("/anomalies", dependencies=[Depends(verify_token)])
async def get_anomalies():
    from .services import detect_anomalies
    db_url = os.environ["LOCAL_DB_URL"]
    try:
        anomalies = await detect_anomalies(db_url)
        return JSONResponse(content={"status": "ok", "anomalies": anomalies})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Ny GET-endpoint för budget vs actual
from typing import Optional

@router.get("/report/budget_vs_actual", dependencies=[Depends(verify_token)])
async def get_budget_vs_actual(year: Optional[int] = Query(None), month: Optional[int] = Query(None)):
    from .services import generate_budget_vs_actual
    db_url = os.environ["LOCAL_DB_URL"]
    data = await generate_budget_vs_actual(db_url, year=year, month=month)
    return JSONResponse(content={"status": "ok", "result": data})

@router.post("/suggest_periodization")
async def suggest_periodization_api(payload: dict):
    from .suggest_accounting import suggest_periodization
    description = payload.get("description", "")
    total_amount = float(payload.get("total_amount", 0))
    suggestion = suggest_periodization(description, total_amount)
    return {"status": "ok", "periodization": suggestion}

@router.get("/report/cashflow", dependencies=[Depends(verify_token)])
async def get_cashflow_report():
    data = await generate_full_cashflow_report()
    return JSONResponse(content={"status": "ok", "result": data})

# Ny GET-endpoint för indirekt kassaflödesanalys
@router.get("/report/cashflow_indirect", dependencies=[Depends(verify_token)])
async def get_indirect_cashflow():
    from .services import generate_indirect_cashflow
    db_url = os.environ["LOCAL_DB_URL"]
    data = await generate_indirect_cashflow(db_url)
    return JSONResponse(content={"status": "ok", "result": data})


# --- BANK CSV UPLOAD ENDPOINT ---
@router.post("/bank/upload_csv", dependencies=[Depends(verify_token)])
async def upload_bank_csv(file: UploadFile = File(...)):
    db_url = os.environ["LOCAL_DB_URL"]
    content = await file.read()
    text = content.decode("utf-8")
    reader = csv.DictReader(StringIO(text))
    import asyncpg
    conn = await asyncpg.connect(dsn=db_url)
    count = 0
    for row in reader:
        await conn.execute("""
            INSERT INTO bank_statement (date, balance, source, metadata)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT DO NOTHING
        """, row["date"], float(row["balance"]), row.get("source", "unknown"), row)
        count += 1
    await conn.close()
    return {"status": "ok", "imported": count}

# --- BANK RECONCILIATION ENDPOINT ---
@router.get("/bank/reconcile", dependencies=[Depends(verify_token)])
async def reconcile_bank(account_number: str = Query(...)):
    import asyncpg
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)

    rows = await conn.fetch("""
        SELECT TO_CHAR(t.date, 'YYYY-MM-DD') AS date, SUM(e.amount) AS balance
        FROM entry e
        JOIN transaction t ON e.transaction_id = t.id
        JOIN account a ON a.id = e.account_id
        WHERE a.number = $1
        GROUP BY t.date
    """, account_number)

    entries_by_date = {r["date"]: float(r["balance"]) for r in rows}

    banks = await conn.fetch("""
        SELECT TO_CHAR(date, 'YYYY-MM-DD') AS date, balance
        FROM bank_statement
        ORDER BY date
    """)

    await conn.close()

    diffs = []
    for row in banks:
        bdate = row["date"]
        bbal = float(row["balance"])
        expected = entries_by_date.get(bdate)
        if expected is not None and abs(expected - bbal) > 0.01:
            diffs.append({"date": bdate, "bank_balance": bbal, "accounting_balance": expected, "difference": round(expected - bbal, 2)})

    return {"status": "ok", "differences": diffs}
# --- SIE export endpoint ---

from typing import Optional
from fastapi import Query, Depends
from fastapi import HTTPException

@router.get("/export/sie", dependencies=[Depends(verify_token)])
async def export_sie(start_date: Optional[str] = Query(None), end_date: Optional[str] = Query(None)):
    from .services import generate_sie_export
    import datetime
    from fastapi.responses import PlainTextResponse

    try:
        start = datetime.date.fromisoformat(start_date) if start_date else None
        end = datetime.date.fromisoformat(end_date) if end_date else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Felaktigt datumformat. Använd YYYY-MM-DD.")

    sie_data = await generate_sie_export(start, end)
    return PlainTextResponse(sie_data, media_type="text/plain", headers={
        "Content-Disposition": 'attachment; filename="export.se"'
    })
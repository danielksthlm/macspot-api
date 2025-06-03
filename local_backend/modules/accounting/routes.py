from fastapi import HTTPException
from fastapi import Path
from fastapi import UploadFile, File
from fastapi import Depends, Header
from uuid import UUID
from .schemas import TransactionIn, TransactionTranslationIn, TransactionTranslationOut
from .services import create_transaction
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from .services import get_accounts, get_transactions
from typing import Optional
import os



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
    try:
        result = await create_transaction(transaction)
        return JSONResponse(content=result)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


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

    db_url = os.environ["LOCAL_DB_URL"]
    content = await file.read()

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
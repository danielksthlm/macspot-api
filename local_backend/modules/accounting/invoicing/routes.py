from fastapi import APIRouter
from .services import generate_invoice
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/invoicing", tags=["invoicing"])

@router.get("/generate_invoice")
async def generate_invoice_route():
    invoice = await generate_invoice()
    return JSONResponse(content={"status": "ok", "invoice": invoice})
from fastapi import APIRouter

router = APIRouter(prefix="/accounts_payable", tags=["Accounts Payable"])

@router.get("/open_invoices")
async def list_open_invoices():
    from .services import get_open_invoices
    return await get_open_invoices()
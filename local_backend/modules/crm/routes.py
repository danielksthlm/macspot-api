from fastapi import APIRouter
from fastapi.responses import JSONResponse
from .services import get_all_contacts, get_contact_by_id

router = APIRouter(prefix="/contacts", tags=["contacts"])

@router.get("/")
async def list_contacts():
    data = await get_all_contacts()
    return JSONResponse(content=data, media_type="application/json; charset=utf-8")

@router.get("/{contact_id}")
async def get_contact(contact_id: str):
    return await get_contact_by_id(contact_id)
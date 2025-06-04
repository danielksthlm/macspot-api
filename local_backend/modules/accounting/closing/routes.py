from fastapi import APIRouter
from fastapi.responses import JSONResponse

from .services import lock_period_service, perform_year_end_closing

router = APIRouter(prefix="/closing", tags=["closing"])

@router.post("/lock_period")
async def lock_period():
    result = await lock_period_service()
    return JSONResponse(content={"status": "ok", "message": result})

@router.post("/year_end")
async def year_end():
    result = await perform_year_end_closing()
    return JSONResponse(content={"status": "ok", "message": result})
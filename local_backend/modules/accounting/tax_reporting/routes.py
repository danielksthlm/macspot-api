from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
import os
from .services import generate_tax_report

router = APIRouter(prefix="/tax_reporting", tags=["tax_reporting"])

@router.get("/report", dependencies=[Depends(lambda: None)])  # Placeholder for auth
async def get_tax_report(year: int = Query(...), month: int = Query(...)):
    db_url = os.environ["LOCAL_DB_URL"]
    result = await generate_tax_report(db_url, year, month)
    return JSONResponse(content={"status": "ok", "report": result})
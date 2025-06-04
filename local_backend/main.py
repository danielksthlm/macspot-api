from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.security import APIKeyHeader
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

# Routers från olika moduler
from local_backend.modules.crm.routes import router as crm_router
from local_backend.modules.accounting.base.routes import router as base_accounting_router
from local_backend.modules.accounting.tax_reporting.routes import router as tax_router
from local_backend.modules.accounting.closing.routes import router as closing_router
from local_backend.modules.accounting.invoicing.routes import router as invoicing_router
from local_backend.modules.accounting.accounts_payable.routes import router as payable_router

app = FastAPI()

api_key_header = APIKeyHeader(name="Authorization")

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="MacSpot API",
        version="1.0.0",
        description="Redovisnings-API med autentisering",
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "APIKeyHeader": {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization"
        }
    }
    for path in openapi_schema["paths"].values():
        for op in path.values():
            op.setdefault("security", []).append({"APIKeyHeader": []})
    app.openapi_schema = openapi_schema
    return openapi_schema

app.openapi = custom_openapi

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inkludera routers
app.include_router(crm_router)
app.include_router(base_accounting_router)
app.include_router(tax_router)
app.include_router(closing_router)
app.include_router(invoicing_router)
app.include_router(payable_router)
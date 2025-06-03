from fastapi import FastAPI
import os
from dotenv import load_dotenv
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
from local_backend.modules.crm.routes import router as crm_router

app = FastAPI()
app.include_router(crm_router)
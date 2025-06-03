import os
from dotenv import load_dotenv
from pathlib import Path

# Ladda .env från projektroten
env_path = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=env_path)

DB_DSN = os.getenv("LOCAL_DB_DSN")  # alt. bygg ihop från PGHOST, etc
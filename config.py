from dotenv import load_dotenv
import os

load_dotenv()

LOCAL_DB_CONFIG = {
    "dbname": os.getenv("LOCAL_DB_NAME"),
    "user": os.getenv("LOCAL_DB_USER"),
    "password": os.getenv("LOCAL_DB_PASSWORD"),
    "host": os.getenv("LOCAL_DB_HOST"),
    "port": int(os.getenv("LOCAL_DB_PORT", 5432))
}

REMOTE_DB_CONFIG = {
    "dbname": os.getenv("REMOTE_DB_NAME"),
    "user": os.getenv("REMOTE_DB_USER"),
    "password": os.getenv("REMOTE_DB_PASSWORD"),
    "host": os.getenv("REMOTE_DB_HOST"),
    "port": int(os.getenv("REMOTE_DB_PORT", 5432))
}
import os
from dotenv import load_dotenv
import json
import datetime
import asyncpg
import asyncio

load_dotenv(dotenv_path="/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/macspot-api/.env")

EXPORT_ROOT = "/Users/danielkallberg/Documents/KLR_AI/Projekt_MacSpot/exports/accounting"
EXPORT_DATA_DIR = os.path.join(EXPORT_ROOT, "exportdata")
EXPORT_ATTACHMENTS_DIR = os.path.join(EXPORT_ROOT, "attachments")

DB_CONFIG = {
    "user": os.environ["LOCAL_DB_USER"],
    "password": os.environ["LOCAL_DB_PASSWORD"],
    "database": os.environ["LOCAL_DB_NAME"],
    "host": os.environ["LOCAL_DB_HOST"],
    "port": os.environ["LOCAL_DB_PORT"]
}

async def export_data():
    os.makedirs(EXPORT_DATA_DIR, exist_ok=True)
    os.makedirs(EXPORT_ATTACHMENTS_DIR, exist_ok=True)

    date_str = datetime.datetime.now().strftime("%Y-%m-%d")
    data_dir = os.path.join(EXPORT_DATA_DIR, date_str)
    os.makedirs(data_dir, exist_ok=True)

    conn = await asyncpg.connect(**DB_CONFIG)

    # Export transactions
    transactions = await conn.fetch("SELECT * FROM transaction")
    with open(os.path.join(data_dir, "transactions.json"), "w") as f:
        json.dump([dict(r) for r in transactions], f, default=str, indent=2)

    # Export accounts
    accounts = await conn.fetch("SELECT * FROM account")
    with open(os.path.join(data_dir, "accounts.json"), "w") as f:
        json.dump([dict(r) for r in accounts], f, indent=2, default=str)

    # Export momsrapport
    moms = await conn.fetch("""
        SELECT 
          CASE 
            WHEN a.number LIKE '26%' THEN 'Utgående moms' 
            WHEN a.number LIKE '264%' THEN 'Ingående moms' 
            ELSE 'Annat' 
          END AS group_name,
          SUM(e.amount) AS total
        FROM entry e
        JOIN account a ON e.account_id = a.id
        GROUP BY group_name
    """)
    with open(os.path.join(data_dir, "momsrapport.json"), "w") as f:
        json.dump([dict(r) for r in moms], f, indent=2, default=str)

    # Export attachments
    attachments = await conn.fetch("SELECT id, filename, data FROM attachment")
    for a in attachments:
        file_path = os.path.join(EXPORT_ATTACHMENTS_DIR, f"{a['id']}_{a['filename']}")
        with open(file_path, "wb") as f:
            f.write(a["data"])

    await conn.close()
    print(f"✅ Export klar: {data_dir}")

if __name__ == "__main__":
    asyncio.run(export_data())
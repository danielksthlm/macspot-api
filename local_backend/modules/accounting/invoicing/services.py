from datetime import date
from uuid import uuid4

async def generate_invoice():
    return {
        "invoice_id": str(uuid4()),
        "date": date.today().isoformat(),
        "total": 2500.00,
        "currency": "SEK",
        "items": [
            {"description": "Konsulttjänster maj", "quantity": 10, "unit_price": 250.00}
        ]
    }
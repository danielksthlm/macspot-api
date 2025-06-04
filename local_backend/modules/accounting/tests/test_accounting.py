import pytest
from httpx import AsyncClient
from uuid import uuid4
from local_backend.main import app

@pytest.mark.asyncio
async def test_invoice_to_transaction():
    # Detta kräver att en attachment redan finns i databasen
    attachment_id = "00000000-0000-0000-0000-000000000000"  # byt till ett riktigt id vid test

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/accounting/invoice_to_transaction",
            params={"attachment_id": attachment_id},
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code in [200, 422, 404]  # beror på testdata
        print("Svar:", response.json())

@pytest.mark.asyncio
async def test_invoice_gpt_analysis():
    attachment_id = "00000000-0000-0000-0000-000000000000"  # byt till riktig testbilaga

    async with AsyncClient(app=app, base_url="http://test") as ac:
        response = await ac.post(
            "/accounting/invoice_gpt_analysis",
            params={"attachment_id": attachment_id},
            headers={"Authorization": "Bearer testtoken"}
        )
        assert response.status_code in [200, 404]
        print("GPT-svar:", response.json())
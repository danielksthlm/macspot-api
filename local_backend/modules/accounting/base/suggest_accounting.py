import re
from typing import Optional, Dict
import fitz  # PyMuPDF
# from .match_supplier import match_supplier_name

# Import GPT invoice parser from separate module
from .gpt_invoice_parser import parse_invoice_with_gpt


def parse_invoice_text(text: str) -> Dict[str, Optional[str]]:
    text = text.replace(",", ".")  # Normalize decimal separator
    text = text.replace("O", "0").replace("I", "1")
    numbers = [float(m.group()) for m in re.finditer(r"\d{1,3}(?:[ ]?\d{3})*(?:\.\d{2})", text)]
    total_amount = max(numbers) if numbers else None

    vat_patterns = {
        "25%": r"(25\s?%|moms\s?25\s?%)",
        "12%": r"(12\s?%)",
        "6%": r"(6\s?%)"
    }
    vat_detected = None
    for rate, pattern in vat_patterns.items():
        if re.search(pattern, text, re.IGNORECASE):
            vat_detected = rate
            break
    if not vat_detected:
        vat_detected = "25%"

    date_patterns = [r"\d{4}-\d{2}-\d{2}", r"\d{2}/\d{2}/\d{4}", r"\d{2}\.\d{2}\.\d{4}"]
    invoice_date = None
    for pattern in date_patterns:
        match = re.search(pattern, text)
        if match:
            invoice_date = match.group()
            break

    ocr_match = re.search(r"(OCR|Referens)?\s*[:#]?\s?(\d{6,})", text, re.IGNORECASE)
    reference = ocr_match.group(2) if ocr_match else None

    currency_match = re.search(r"(SEK|kr|EUR|€|USD|\$)", text, re.IGNORECASE)
    currency = currency_match.group() if currency_match else "SEK"

    orgnr = re.search(r"\b\d{6}-\d{4}\b", text)  # Ex: 556123-4567
    iban = re.search(r"[A-Z]{2}\d{2}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}[ ]?\d{4}", text)

    return {
        "total_amount": total_amount,
        "vat_rate": vat_detected,
        "invoice_date": invoice_date,
        "reference_number": reference,
        "currency": currency,
        "orgnr": orgnr.group() if orgnr else None,
        "iban": iban.group() if iban else None,
        # TODO: match supplier by name/orgnr/IBAN
    }


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        all_text = []
        for page in doc:
            all_text.append(page.get_text())
        return "\n".join(all_text)
    except Exception as e:
        return f"ERROR: {e.__class__.__name__} – {str(e)}"


# --- NEW FUNCTION ---
async def analyze_invoice_attachment(attachment_id: str, db_url: str) -> dict:
    import asyncpg
    from datetime import datetime
    conn = await asyncpg.connect(dsn=db_url)
    row = await conn.fetchrow("SELECT data FROM attachment WHERE id = $1", attachment_id)
    await conn.close()
    if not row:
        return {"error": "Attachment not found"}
    text = extract_text_from_pdf(row["data"])
    parsed = parse_invoice_text(text)
    needs_fallback = False
    try:
        parsed_date = parsed.get("invoice_date")
        if parsed_date:
            try:
                invoice_date_obj = datetime.strptime(parsed_date[:10], "%Y-%m-%d")
                if invoice_date_obj > datetime.now():
                    needs_fallback = True
            except ValueError:
                needs_fallback = True
        else:
            needs_fallback = True

        total = parsed.get("total_amount")
        if not total or float(total) < 10 or float(total) > 1_000_000:
            needs_fallback = True

        if not parsed.get("reference_number"):
            needs_fallback = True
    except Exception:
        needs_fallback = True

    if needs_fallback:
        gpt_parsed = parse_invoice_with_gpt(text, log=True)
        parsed.update({k: v for k, v in gpt_parsed.items() if v})
    parsed["supplier_name"] = "UNKNOWN"
    return {"text": text, "parsed": parsed}

def generate_transaction_from_parsed(parsed: dict, supplier_name: str = "", currency: str = "SEK") -> dict:
    supplier_name = parsed.get("supplier_name", supplier_name)
    description = f"Faktura {supplier_name}".strip()
    total = parsed.get("total_amount")
    vat_rate = parsed.get("vat_rate")
    date = parsed.get("invoice_date") or ""
    ref = parsed.get("reference_number") or ""
    currency = parsed.get("currency", currency)

    if not total or not vat_rate:
        return {}

    total = round(float(total), 2)
    vat_factor = {"25%": 0.2, "12%": 0.1071, "6%": 0.0566}.get(vat_rate, 0.2)
    vat_amount = round(total * vat_factor / (1 + vat_factor), 2)
    net_amount = round(total - vat_amount, 2)

    raw_entries = [
        {
            "account_number": "3001",
            "amount": -net_amount,
            "description": "Försäljning",
            "currency": currency
        },
        {
            "account_number": "2611",
            "amount": -vat_amount,
            "description": f"Moms {vat_rate}",
            "currency": currency
        },
        {
            "account_number": "1930",
            "amount": total,
            "description": "Inbetalning",
            "currency": currency
        }
    ]
    entries = apply_regulatory_rules(parsed, raw_entries)

    return {
        "description": description,
        "date": date,
        "reference": ref,
        "currency": currency,
        "entries": entries
    }
def detect_anomalies(transactions: list) -> list:
    anomalies = []
    for tx in transactions:
        seen_refs = set()
        ref = tx.get("reference", "")
        if ref in seen_refs:
            anomalies.append({
                "transaction_id": tx.get("id"),
                "issue": f"Duplicate reference: {ref}"
            })
        elif ref:
            seen_refs.add(ref)
        for entry in tx.get("entries", []):
            desc = entry.get("description", "").lower()
            amount = abs(entry.get("amount", 0))
            if "lunch" in desc or "middag" in desc:
                if amount > 1000:
                    anomalies.append({
                        "transaction_id": tx.get("id"),
                        "issue": f"High meal expense: {amount} SEK"
                    })
            if entry.get("account_number") == "3001" and amount > 500000:
                anomalies.append({
                    "transaction_id": tx.get("id"),
                    "issue": f"Unusually high revenue: {amount} SEK"
                })
            if entry.get("account_number") == "2641" and float(entry.get("amount", 0)) > 0:
                anomalies.append({
                    "transaction_id": tx.get("id"),
                    "issue": "Possible VAT paid on purchase (check for reverse charge)"
                })
    return anomalies

def suggest_periodization(description: str, total_amount: float) -> Optional[dict]:
    """
    Försök periodisera kostnader automatiskt.
    T.ex. Dropbox-abonnemang 1200 SEK → 100 SEK/månad i 12 månader.
    """
    description = description.lower()
    recurring_keywords = ["abonnemang", "dropbox", "google", "office365", "försäkring", "hyra", "licens"]
    if any(word in description for word in recurring_keywords) and total_amount > 1000:
        monthly = round(total_amount / 12, 2)
        return {
            "type": "monthly",
            "months": 12,
            "monthly_amount": monthly,
            "total": total_amount
        }
    return None

def apply_regulatory_rules(parsed: dict, entries: list) -> list:
    """
    Justera konton, moms och texter enligt svenska redovisningsregler:
    - Representation (avdragsgill/ej avdragsgill)
    - Omvänd moms (EU-handel)
    - Avdragsgränser
    """
    adjusted = []
    description_text = parsed.get("description", "").lower()
    vat_rate = parsed.get("vat_rate", "25%")
    currency = parsed.get("currency", "SEK")
    total = parsed.get("total_amount", 0)

    for entry in entries:
        account = entry["account_number"]
        text = entry["description"].lower()
        amount = entry["amount"]

        # Representation
        if "lunch" in text or "middag" in text or "representation" in text:
            if abs(amount) > 300:
                account = "5832"  # ej avdragsgill representation
            else:
                account = "5831"  # avdragsgill representation

        # EU-handel (om moms = 0% + utländsk valuta → anta EU-tjänst)
        if vat_rate == "0%" or vat_rate == "0" or vat_rate is None:
            if currency != "SEK":
                if amount < 0:
                    account = "2645"  # Ingående moms omvänd skattskyldighet
                else:
                    account = "2614"  # Utgående moms omvänd skattskyldighet

        # TODO: Lägg till fler regler här vid behov
        adjusted.append({
            **entry,
            "account_number": account,
            "currency": currency
        })

    return adjusted

# --- NEW FUNCTION ---
import os
import asyncpg

async def generate_cashflow_report():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            TO_CHAR(t.date, 'YYYY-MM') AS period,
            SUM(e.amount) FILTER (WHERE a.type = 'tillgång' AND e.amount > 0) AS inflow,
            SUM(e.amount) FILTER (WHERE a.type = 'tillgång' AND e.amount < 0) AS outflow
        FROM entry e
        JOIN account a ON e.account_id = a.id
        JOIN transaction t ON e.transaction_id = t.id
        GROUP BY period
        ORDER BY period
    """)
    await conn.close()
    return [dict(r) for r in rows]

async def generate_full_cashflow_report():
    db_url = os.environ["LOCAL_DB_URL"]
    conn = await asyncpg.connect(dsn=db_url)
    rows = await conn.fetch("""
        SELECT 
            TO_CHAR(t.date, 'YYYY-MM') AS period,
            a.number AS account_number,
            a.name AS account_name,
            a.type AS account_type,
            SUM(e.amount) AS total
        FROM entry e
        JOIN account a ON e.account_id = a.id
        JOIN transaction t ON e.transaction_id = t.id
        WHERE a.type IN ('tillgång', 'skuld')
        GROUP BY period, a.number, a.name, a.type
        ORDER BY period, a.number
    """)
    await conn.close()

    # Strukturera datan
    cashflow = {}
    for r in rows:
        period = r["period"]
        if period not in cashflow:
            cashflow[period] = {
                "period": period,
                "accounts": []
            }
        cashflow[period]["accounts"].append({
            "account_number": r["account_number"],
            "account_name": r["account_name"],
            "account_type": r["account_type"],
            "amount": float(r["total"])
        })

    return list(cashflow.values())
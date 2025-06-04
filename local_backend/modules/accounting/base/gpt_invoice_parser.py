from typing import Optional, Dict
import openai
import json
import os
from dotenv import load_dotenv
from datetime import datetime

def parse_invoice_with_gpt(text: str, log: bool = False) -> Dict[str, Optional[str]]:
    load_dotenv()
    openai.api_key = os.getenv("OPENAI_API_KEY")

    prompt = f"""
    Du är en redovisningsexpert som extraherar data från OCR-scannade fakturor i PDF-format.
    Svara alltid med ett strikt JSON-objekt. Ingen förklaring.

    Extrahera följande fält:
    - total_amount (float)
    - vat_rate (t.ex. "25%")
    - invoice_date (YYYY-MM-DD)
    - reference_number (OCR eller referensnummer)
    - currency (t.ex. "SEK", "EUR")
    - orgnr (organisationsnummer, t.ex. "556123-4567")
    - iban (internationellt kontonummer)

    Svarsexempel:
    {{
      "total_amount": 1234.56,
      "vat_rate": "25%",
      "invoice_date": "2025-06-01",
      "reference_number": "1234567890",
      "currency": "SEK",
      "orgnr": "556123-4567",
      "iban": "SE3550000000054910000003"
    }}

    Text:
    {text}
    """
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": prompt}]
        )
        gpt_output = response.choices[0].message.content
        result = json.loads(gpt_output)

        if log:
            log_dir = os.path.join(os.path.dirname(__file__), "logs")
            os.makedirs(log_dir, exist_ok=True)
            log_file = os.path.join(log_dir, "gpt_invoice.log")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"\n\n--- {datetime.now().isoformat()} ---\n")
                f.write("PROMPT:\n")
                f.write(prompt.strip() + "\n")
                f.write("GPT SVAR:\n")
                f.write(gpt_output.strip())

        return result
    except Exception as e:
        return {"error": str(e)}
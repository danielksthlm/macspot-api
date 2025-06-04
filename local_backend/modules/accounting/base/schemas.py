from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from datetime import date

from pydantic import BaseModel, Field

class TransactionTranslationOut(BaseModel):
    transaction_id: UUID
    language: str
    description: str

class TransactionTranslationIn(BaseModel):
    transaction_id: UUID
    language: str
    description: str

class EntryIn(BaseModel):
    account_number: str
    amount: Decimal
    description: Optional[str] = None
    metadata: Optional[dict] = None


class TransactionIn(BaseModel):
    date: date
    description: Optional[str] = None
    series: str = Field(default="A", max_length=10)
    metadata: Optional[dict] = None
    entries: List[EntryIn]
    status: Optional[str] = Field(default="prelim", pattern="^(prelim|posted|locked)$")

class EntryOut(BaseModel):
    id: UUID
    account_id: UUID
    amount: Decimal
    description: Optional[str]
    metadata: Optional[dict]

class TransactionOut(BaseModel):
    id: UUID
    date: date
    description: Optional[str]
    series: str
    ver_no: int
    metadata: Optional[dict]
    entries: List[EntryOut]
    user: Optional[str] = None
    status: Optional[str]
"""Snelle categorie op basis van trefwoorden; het taalmodel mag dit later overschrijven."""
from __future__ import annotations

CATEGORIES = ("vergunning", "verkeer", "raad", "evenement", "regels", "overig")

_RULES: list[tuple[str, tuple[str, ...]]] = [
    ("evenement", ("evenement", "evenementenvergunning", "markt", "festival", "kermis")),
    ("verkeer", ("verkeersbesluit", "parkeer", "afsluiting", "wegafsluiting", "verkeersmaatregel", "laadpaal", "gehandicaptenparkeerplaats")),
    ("vergunning", ("omgevingsvergunning", "vergunning", "kapvergunning", "kappen", "bouwen", "dakkapel", "aanvraag", "melding", "exploitatie", "alcoholwet", "drank- en horeca")),
    ("raad", ("gemeenteraad", "raadsbesluit", "raadsvoorstel", "motie", "begroting")),
    ("regels", ("verordening", "beleidsregel", "omgevingsplan", "bestemmingsplan", "apv", "tarieven", "mandaat")),
]


def categorize(title: str, subjects: list[str] | None = None) -> str:
    haystack = " ".join([title, *(subjects or [])]).lower()
    for category, words in _RULES:
        if any(w in haystack for w in words):
            return category
    return "overig"

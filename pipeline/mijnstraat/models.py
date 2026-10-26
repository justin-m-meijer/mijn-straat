from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass
class Item:
    """Eén bericht in de feed, los van de bron waar het vandaan komt."""

    id: str
    source: str  # "bekendmakingen" | "ori"
    title: str
    published: str  # ISO-datum (YYYY-MM-DD)
    url: str
    doc_type: str = ""  # bijv. "Gemeenteblad", "Staatscourant"
    subjects: list[str] = field(default_factory=list)
    text: str = ""  # platte tekst van het document, alleen tijdens de run
    category: str = "overig"
    summary: str = ""
    location_hint: str = ""  # adres of plaatsaanduiding om te geocoderen
    address: str = ""
    lat: float | None = None
    lon: float | None = None

    def to_public(self) -> dict:
        """Wat de app te zien krijgt; de volledige tekst blijft achter."""
        data = asdict(self)
        data.pop("text")
        return data

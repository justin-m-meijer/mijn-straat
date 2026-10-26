"""Geocoderen via de PDOK Locatieserver (BAG, CC0)."""
from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"

_POINT = re.compile(r"POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)")
_SUFFIX = r"(?:straat|weg|laan|dijk|plein|singel|steeg|hof|kade|pad|dreef|markt|park|erf|gracht|veld|baan|ring|wal|haven|akker|kamp|brink|polder|waard)"
_ADDRESS = re.compile(
    rf"\b((?:[A-Z][\w'\-]*\s)*[A-Z]?[\w'\-]*{_SUFFIX})\s+(\d+(?:\s?[a-zA-Z])?(?:\s?[-–]\s?\d+[a-zA-Z]?)?)\b"
)
_POSTCODE = re.compile(r"\b(\d{4}\s?[A-Z]{2})\s+(\d+)\b")


_NOT_STREET = {"aanvraag", "melding", "besluit", "verleend", "verleende", "geweigerd", "ingetrokken", "plaatsen", "bouwen", "kappen", "slopen", "wijzigen", "te", "op", "aan", "bij", "voor"}


def _trim_prefix(street: str) -> str:
    words = street.split()
    while len(words) > 1 and (words[0].lower() in _NOT_STREET or words[0].lower().endswith(("vergunning", "besluit", "melding"))):
        words.pop(0)
    return " ".join(words)


def guess_address(text: str) -> str:
    """Haal een adres uit een titel of tekst: 'Kerkstraat 5', of postcode + huisnummer."""
    m = _POSTCODE.search(text)
    if m:
        return f"{m.group(1)} {m.group(2)}"
    m = _ADDRESS.search(text)
    if m:
        number = re.split(r"\s?[-–]\s?", m.group(2))[0]
        return f"{_trim_prefix(m.group(1))} {number}"
    return ""


class Geocoder:
    def __init__(self, client: httpx.Client, gemeente: str, cache_file: Path) -> None:
        self.client = client
        self.gemeente = gemeente
        self.cache_file = cache_file
        self.cache: dict[str, list | None] = {}
        if cache_file.exists():
            self.cache = json.loads(cache_file.read_text())

    def save(self) -> None:
        self.cache_file.parent.mkdir(parents=True, exist_ok=True)
        self.cache_file.write_text(json.dumps(self.cache, ensure_ascii=False, indent=1))

    def lookup(self, query: str) -> tuple[str, float, float] | None:
        """Zoek een adres (of anders een straat) binnen de gemeente."""
        query = query.strip()
        if not query:
            return None
        if query in self.cache:
            hit = self.cache[query]
            return tuple(hit) if hit else None
        result = None
        for kind in ("adres", "weg"):
            resp = self.client.get(
                LOCATIESERVER,
                params=[
                    ("q", query),
                    ("fq", f"gemeentenaam:{self.gemeente}"),
                    ("fq", f"type:{kind}"),
                    ("rows", "1"),
                    ("fl", "weergavenaam,centroide_ll,score"),
                ],
            )
            resp.raise_for_status()
            docs = resp.json().get("response", {}).get("docs", [])
            if docs:
                m = _POINT.search(docs[0].get("centroide_ll", ""))
                if m:
                    result = (docs[0]["weergavenaam"], float(m.group(2)), float(m.group(1)))
                    break
        self.cache[query] = list(result) if result else None
        return result

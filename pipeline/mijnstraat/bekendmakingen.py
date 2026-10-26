"""Officiële bekendmakingen via de SRU-zoekservice van KOOP (CC0).

Handleiding: https://data.overheid.nl/dataset/officiele-bekendmakingen (tab Downloads, SRU 2.0).
"""
from __future__ import annotations

import datetime as dt
import re
from xml.etree import ElementTree as ET

import httpx

from .models import Item
from .rd import rd_to_wgs84
from .xmlutil import find_all, first_text, html_to_text, local

SRU_URL = "https://repository.overheid.nl/sru"
PAGE_SIZE = 100


def build_query(gemeente: str, since: dt.date) -> str:
    # Gemeenteblad én Staatscourant: gemeentelijke verkeersbesluiten staan in de Staatscourant.
    return (
        "c.product-area==officielepublicaties"
        f' AND dt.creator=="{gemeente}"'
        f" AND dt.available>={since.isoformat()}"
    )


def parse_records(xml_text: str) -> tuple[list[Item], int | None]:
    """Parse een SRU-antwoord. Geeft items en de volgende startRecord (of None)."""
    root = ET.fromstring(xml_text)
    items: list[Item] = []
    for record in find_all(root, "record"):
        data = next((e for e in record.iter() if local(e.tag) == "recordData"), None)
        if data is None:
            continue
        item = _parse_record(data)
        if item:
            items.append(item)
    nxt = first_text(root, "nextRecordPosition")
    return items, int(nxt) if nxt.isdigit() else None


def _parse_record(data: ET.Element) -> Item | None:
    ident = first_text(data, "identifier")
    title = first_text(data, "title")
    if not ident or not title:
        return None
    published = first_text(data, "available", "issued", "date", "modified")[:10]
    url = first_text(data, "preferredUrl") or f"https://zoek.officielebekendmakingen.nl/{ident}.html"
    doc_type = first_text(data, "publicatienaam", "type")
    subjects = sorted({e.text.strip() for e in find_all(data, "subject") if e.text and e.text.strip()})
    item = Item(
        id=f"bm:{ident}",
        source="bekendmakingen",
        title=title,
        published=published,
        url=url,
        doc_type=doc_type,
        subjects=subjects,
    )
    _apply_location_metadata(data, item)
    return item


_POINT = re.compile(r"(-?\d+(?:\.\d+)?)[ ,]+(-?\d+(?:\.\d+)?)")


def _apply_location_metadata(data: ET.Element, item: Item) -> None:
    """Gebruik locatie-metadata als de bekendmaking die heeft.

    Sinds de Wet elektronische publicaties dragen veel bekendmakingen een locatie,
    maar de veldnamen verschillen per leverancier. We zoeken daarom op deelnamen.
    """
    postcode = huisnummer = ""
    for e in data.iter():
        name = local(e.tag).lower()
        text = (e.text or "").strip()
        if not text:
            continue
        if "postcode" in name and not postcode:
            postcode = text
        elif "huisnummer" in name and not huisnummer:
            huisnummer = text
        elif item.lat is None and (name in {"pos", "coordinates"} or "punt" in name or "geometrie" in name):
            m = _POINT.search(text)
            if m:
                x, y = float(m.group(1)), float(m.group(2))
                if 0 < x < 300_000 and 300_000 < y < 625_000:  # Rijksdriehoek
                    item.lat, item.lon = rd_to_wgs84(x, y)
                elif 50 < y < 54 and 3 < x < 8:  # lon lat
                    item.lat, item.lon = y, x
                elif 50 < x < 54 and 3 < y < 8:  # lat lon
                    item.lat, item.lon = x, y
    if postcode:
        item.location_hint = f"{postcode} {huisnummer}".strip()


def fetch(client: httpx.Client, gemeente: str, days: int, limit: int | None = None) -> list[Item]:
    since = dt.date.today() - dt.timedelta(days=days)
    query = build_query(gemeente, since)
    items: list[Item] = []
    start = 1
    while True:
        resp = client.get(
            SRU_URL,
            params={
                "operation": "searchRetrieve",
                "version": "2.0",
                "query": query,
                "maximumRecords": PAGE_SIZE,
                "startRecord": start,
            },
        )
        resp.raise_for_status()
        page, nxt = parse_records(resp.text)
        items.extend(i for i in page if not i.published or i.published >= since.isoformat())
        if limit and len(items) >= limit:
            return items[:limit]
        if not nxt or not page:
            return items
        start = nxt


def fetch_text(client: httpx.Client, item: Item, max_chars: int = 60_000) -> str:
    resp = client.get(item.url, follow_redirects=True)
    resp.raise_for_status()
    return html_to_text(resp.text)[:max_chars]

"""Focusgebied: in een grote gemeente alleen de omgeving van één postcode verwerken.

Amsterdam publiceert duizenden bekendmakingen per kwartaal. Die allemaal laten samenvatten kost uren
op de Mac, terwijl de app alleen berichten in de buurt toont. Met een focus (postcode + straal) houden
we vóór het ophalen van teksten en het samenvatten alleen over:
- berichten met een locatie binnen de straal;
- berichten zonder locatie die voor de hele gemeente gelden (raad, regels), want die toont de app ook.
"""
from __future__ import annotations

import math
import re

import httpx

from .models import Item

LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"
_POINT = re.compile(r"POINT\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)")
GEMEENTEBREED = ("raad", "regels")


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def resolve(client: httpx.Client, postcode: str) -> dict:
    """Postcode -> middelpunt en gemeente via PDOK: {'postcode', 'lat', 'lon', 'gemeente', 'buurt'}."""
    pc = postcode.replace(" ", "").upper()
    resp = client.get(
        LOCATIESERVER,
        params={"q": pc, "fq": "type:postcode", "rows": 1, "fl": "postcode,centroide_ll,gemeentenaam,buurtnaam,wijknaam,buurtcode"},
    )
    resp.raise_for_status()
    docs = resp.json().get("response", {}).get("docs", [])
    m = _POINT.search(docs[0].get("centroide_ll", "")) if docs else None
    if not m:
        raise ValueError(f"postcode niet gevonden: {postcode}")
    d = docs[0]
    area = {
        "postcode": pc,
        "lat": float(m.group(2)),
        "lon": float(m.group(1)),
        "gemeente": d.get("gemeentenaam", ""),
        "buurt": d.get("buurtnaam", ""),
        "wijk": d.get("wijknaam", ""),
        "buurtcode": d.get("buurtcode", ""),
    }
    if not area["buurt"] or not area["wijk"]:
        area.update({k: v for k, v in _buurt_via_adres(client, pc).items() if v and not area[k]})
    return area


def _buurt_via_adres(client: httpx.Client, pc: str) -> dict:
    """PDOK geeft bij type:postcode geen buurt of wijk; een adres in die postcode wel."""
    try:
        resp = client.get(
            LOCATIESERVER,
            params={"q": pc, "fq": f"type:adres AND postcode:{pc}", "rows": 1, "fl": "buurtnaam,wijknaam,buurtcode"},
        )
        resp.raise_for_status()
        docs = resp.json().get("response", {}).get("docs", [])
    except (httpx.HTTPError, ValueError):
        return {}
    if not docs:
        return {}
    d = docs[0]
    return {"buurt": d.get("buurtnaam", ""), "wijk": d.get("wijknaam", ""), "buurtcode": d.get("buurtcode", "")}


def keep(item: Item, lat: float, lon: float, radius: int) -> bool:
    if item.lat is not None and item.lon is not None:
        return distance_m(lat, lon, item.lat, item.lon) <= radius
    return item.category in GEMEENTEBREED


def apply(items: list[Item], lat: float, lon: float, radius: int) -> list[Item]:
    return [i for i in items if keep(i, lat, lon, radius)]

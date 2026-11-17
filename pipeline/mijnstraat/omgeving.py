"""Leefomgeving: luchtkwaliteit (Luchtmeetnet) en zwemwater (zwemwater.nl en Rijkswaterstaat).

Bronnen, onderzocht op 2026-11-17:
- Luchtmeetnet (RIVM, GGD's, provincies): open API zonder sleutel, uurwaarden, ongevalideerd.
  Licentie CC BY-ND 4.0: we tonen de waarden ongewijzigd, met bronvermelding "www.luchtmeetnet.nl".
  Fair use: maximaal 100 verzoeken per 5 minuten. De stationslijst (±103 stations) cachen we daarom een maand.
- zwemwater.nl (provincies, IPO): geen API; de homepage bevat alle zwemplekken met hun actuele status.
  Geen expliciete licentie, dus dit blijft (net als de politie-API) buiten de publieke kopie.
- Rijkswaterstaat Zwemwateronderzoek (OGC API Features): het EU-oordeel per zwemlocatie in rijkswateren.

Een storing bij een van deze bronnen mag de rest van de feed niet tegenhouden; cli.py vangt fouten af.
"""
from __future__ import annotations

import datetime as dt
import html
import json
import re
import time
from pathlib import Path
from typing import Callable

import httpx

from .focus import distance_m

LUCHTMEETNET = "https://api.luchtmeetnet.nl/open_api"
ZWEMWATER = "https://www.zwemwater.nl/"
RWS_ZWEMLOCATIES = (
    "https://geo.rijkswaterstaat.nl/services/ogc/gdr/zwemwateronderzoek/ogc/features/v1/collections/zwemlocaties_rws/items"
)

LUCHT_BRON = "www.luchtmeetnet.nl (RIVM, GGD, provincies), CC BY-ND 4.0, ongevalideerde uurwaarden"
ZWEM_BRON = "zwemwater.nl (provincies); EU-oordeel: Rijkswaterstaat"

# Wat de app toont; andere stoffen (benzeen, roet, ...) laten we weg.
STOFFEN = ("NO2", "PM10", "PM25", "O3")
STATION_RADIUS = 25_000  # m rond het midden van de gemeente of het focusgebied
ZWEM_RADIUS = 15_000
MAX_STATIONS = 6
STATIONS_MAX_AGE = 30 * 24 * 3600  # stations veranderen zelden
PAUSE = 3.1  # s tussen verzoeken: 100 per 5 minuten

Log = Callable[[str], None]


# ---------------------------------------------------------------- lucht


def _get(client: httpx.Client, url: str, params: dict | None = None) -> dict:
    # Zonder start/end stuurt Luchtmeetnet een 302 door naar iq.luchtmeetnet.nl.
    resp = client.get(url, params=params, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


def parse_station(number: str, data: dict) -> dict | None:
    geo = data.get("geometry") or {}
    coords = geo.get("coordinates") or []
    if len(coords) != 2:
        return None
    return {
        "nummer": number,
        "naam": data.get("location") or number,
        "lat": float(coords[1]),  # GeoJSON-volgorde: [lon, lat]
        "lon": float(coords[0]),
        "type": data.get("type") or "",
        "stoffen": [c for c in data.get("components") or [] if c in STOFFEN],
    }


def fetch_stations(client: httpx.Client, cache: Path, log: Log = print, pause: float = PAUSE) -> list[dict]:
    """Alle meetstations met locatie. Gecachet, want het kost ruim 100 verzoeken."""
    if cache.exists() and time.time() - cache.stat().st_mtime < STATIONS_MAX_AGE:
        return json.loads(cache.read_text())
    numbers: list[str] = []
    page, last = 1, 1
    while page <= last:
        body = _get(client, f"{LUCHTMEETNET}/stations", {"page": page})
        numbers += [s["number"] for s in body.get("data", [])]
        last = body.get("pagination", {}).get("last_page", page)
        page += 1
        time.sleep(pause)
    stations = []
    for i, number in enumerate(numbers, 1):
        try:
            station = parse_station(number, _get(client, f"{LUCHTMEETNET}/stations/{number}").get("data", {}))
        except httpx.HTTPError as e:
            log(f"  station {number} mislukt: {e}")
            station = None
        if station:
            stations.append(station)
        if i % 25 == 0:
            log(f"  stations: {i}/{len(numbers)}")
        time.sleep(pause)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(stations, ensure_ascii=False))
    return stations


def nearest(stations: list[dict], lat: float, lon: float, radius: int = STATION_RADIUS, n: int = MAX_STATIONS) -> list[dict]:
    """Dichtstbijzijnde stations die minstens één van de getoonde stoffen meten."""
    hits = []
    for s in stations:
        if not s["stoffen"]:
            continue
        d = distance_m(lat, lon, s["lat"], s["lon"])
        if d <= radius:
            hits.append({**s, "afstand": round(d)})
    return sorted(hits, key=lambda s: s["afstand"])[:n]


def latest(rows: list[dict]) -> dict[str, dict]:
    """Laatste waarde per stof: {'NO2': {'waarde': 15.5, 'tijd': '...'}}."""
    out: dict[str, dict] = {}
    for r in rows:
        f, v, t = r.get("formula"), r.get("value"), r.get("timestamp_measured")
        if f is None or v is None or not t:
            continue
        if f not in out or t > out[f]["tijd"]:
            out[f] = {"waarde": v, "tijd": t}
    return out


def fetch_metingen(client: httpx.Client, station: str, now: dt.datetime) -> dict[str, dict]:
    """Laatste uurwaarden en luchtkwaliteitsindex (LKI) van één station."""
    window = {
        "station_number": station,
        "start": (now - dt.timedelta(hours=6)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "order_by": "timestamp_measured",
        "order_direction": "desc",
    }
    rows = _get(client, f"{LUCHTMEETNET}/measurements", window).get("data", [])
    rows += _get(client, f"{LUCHTMEETNET}/lki", window).get("data", [])
    return {k: v for k, v in latest(rows).items() if k in STOFFEN or k == "LKI"}


def fetch_lucht(
    client: httpx.Client, lat: float, lon: float, cache: Path, log: Log = print, pause: float = PAUSE
) -> dict:
    stations = nearest(fetch_stations(client, cache, log, pause), lat, lon)
    now = dt.datetime.now(dt.timezone.utc)
    for s in stations:
        try:
            s["laatste"] = fetch_metingen(client, s["nummer"], now)
        except httpx.HTTPError as e:
            log(f"  metingen {s['nummer']} mislukt: {e}")
            s["laatste"] = {}
        time.sleep(pause)
    return {"bron": LUCHT_BRON, "stations": stations}


# ---------------------------------------------------------------- zwemwater

_CARD = re.compile(r'<div class="card"([^>]*\bdata-spotid="[^"]*"[^>]*)>')
_ATTR = re.compile(r'data-([a-z]+)="([^"]*)"')
_ADDRESS = re.compile(r'class="spot-address"[^>]*>(?:<i[^>]*></i>)?([^<]*)<')

# Statussen op zwemwater.nl, van goed naar slecht. Hoofdletters zijn daar niet consistent.
STATUS = {
    "goed": "Goed",
    "nader_onderzoek": "Nader onderzoek",
    "waarschuwing": "Waarschuwing",
    "negatief_zwemadvies": "Negatief zwemadvies",
    "zwemverbod": "Zwemverbod",
}


def parse_zwemplekken(page: str) -> list[dict]:
    spots = []
    cards = list(_CARD.finditer(page))
    for n, m in enumerate(cards):
        # De inhoud van een kaart loopt tot de volgende kaart (kaarten bevatten zelf ook divs).
        body = page[m.end() : cards[n + 1].start() if n + 1 < len(cards) else m.end() + 4000]
        attrs = dict(_ATTR.findall(m.group(1)))
        try:
            lat, lon = json.loads(attrs.get("coordinates", ""))  # [lat, lon]
        except (ValueError, TypeError):
            continue
        status = attrs.get("status", "").strip().lower()
        addr = _ADDRESS.search(body)
        spots.append(
            {
                "id": attrs.get("spotid", ""),
                "naam": html.unescape(attrs.get("title", "")).strip(),
                "adres": re.sub(r"\s+,", ",", html.unescape(addr.group(1)).strip()) if addr else "",
                "lat": float(lat),
                "lon": float(lon),
                "status": status,
                "status_label": STATUS.get(status, status.replace("_", " ").capitalize()),
            }
        )
    return spots


def parse_eu_oordelen(geojson: dict) -> list[dict]:
    out = []
    for f in geojson.get("features", []):
        coords = (f.get("geometry") or {}).get("coordinates") or []
        p = f.get("properties") or {}
        if len(coords) == 2 and p.get("eu_actueel"):
            out.append({"lat": coords[1], "lon": coords[0], "oordeel": p["eu_actueel"]})
    return out


def match_oordeel(spot: dict, oordelen: list[dict], max_m: int = 500) -> str | None:
    best = min(oordelen, key=lambda o: distance_m(spot["lat"], spot["lon"], o["lat"], o["lon"]), default=None)
    if best and distance_m(spot["lat"], spot["lon"], best["lat"], best["lon"]) <= max_m:
        return best["oordeel"]
    return None


def fetch_zwemwater(client: httpx.Client, lat: float, lon: float, log: Log = print) -> dict:
    resp = client.get(ZWEMWATER, follow_redirects=True)
    resp.raise_for_status()
    spots = []
    for s in parse_zwemplekken(resp.text):
        d = distance_m(lat, lon, s["lat"], s["lon"])
        if d <= ZWEM_RADIUS:
            spots.append({**s, "afstand": round(d)})
    spots.sort(key=lambda s: s["afstand"])
    try:
        bbox = f"{lon - 0.3},{lat - 0.2},{lon + 0.3},{lat + 0.2}"
        r = client.get(RWS_ZWEMLOCATIES, params={"f": "json", "bbox": bbox, "limit": 1000}, follow_redirects=True)
        r.raise_for_status()
        oordelen = parse_eu_oordelen(r.json())
        for s in spots:
            s["eu_oordeel"] = match_oordeel(s, oordelen)
    except (httpx.HTTPError, ValueError) as e:
        log(f"  EU-oordelen Rijkswaterstaat mislukt: {e}")
    return {"bron": ZWEM_BRON, "plekken": spots}


# ---------------------------------------------------------------- publiek


def public_omgeving(omgeving: dict) -> dict:
    """Publieke kopie: zonder de actuele status van zwemwater.nl (licentie nog onduidelijk)."""
    zwem = omgeving.get("zwemwater")
    if not zwem:
        return omgeving
    plekken = [
        {k: v for k, v in p.items() if k not in ("status", "status_label")}
        for p in zwem.get("plekken", [])
        if p.get("eu_oordeel")
    ]
    return {**omgeving, "zwemwater": {"bron": "Rijkswaterstaat, EU-zwemwateroordeel", "plekken": plekken}}

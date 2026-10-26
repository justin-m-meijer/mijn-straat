"""Politiedata: wijkagenten en nieuws (api.politie.nl) en misdrijven per buurt (CBS 47022NED).

De pijplijn haalt alles voor de hele gemeente op; de app matcht op het toestel met het adres.
Let op: api.politie.nl heeft geen duidelijke licentie. Prima voor de POC, vraag toestemming
(gegevensautoriteit@politie.nl) voor een publieke release.
"""
from __future__ import annotations

import datetime as dt
import json
import math
from typing import Any, Iterable

import httpx

from .models import Item
from .xmlutil import html_to_text

POLITIE_API = "https://api.politie.nl/v4"
# api.politie.nl geeft 403 op onze eigen User-Agent maar niet op de standaard van httpx.
# Bewuste keuze van Justin (2026-10-26) voor de privé-POC; vóór een publieke release
# toestemming vragen bij gegevensautoriteit@politie.nl en dan weer onze eigen naam sturen.
POLITIE_HEADERS = {"User-Agent": f"python-httpx/{httpx.__version__}"}
CBS_ODATA = "https://dataderden.cbs.nl/ODataApi/odata/47022NED"
LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"

# Soorten misdrijf die voor bewoners het meest zeggen; gezocht op titel zodat we niet op codes gokken.
CRIME_TYPES: list[tuple[str, tuple[str, ...]]] = [
    ("totaal", ("totaal misdrijven",)),
    ("woninginbraak", ("diefstal/inbraak woning",)),
    ("fiets", ("diefstal van brom-, snor-, fietsen", "fietsen")),
    ("auto", ("diefstal uit/vanaf motorvoertuigen",)),
    ("vernieling", ("vernieling",)),
    ("mishandeling", ("mishandeling",)),
]


def _records(payload: Any) -> list[dict]:
    """De politie-API verpakt lijsten onder wisselende sleutels; pak de eerste lijst met dicts."""
    if isinstance(payload, list):
        return [r for r in payload if isinstance(r, dict)]
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list) and (not value or isinstance(value[0], dict)):
                return value
    return []


def _first(d: dict, *keys: str) -> Any:
    for k in keys:
        if d.get(k) not in (None, "", []):
            return d[k]
    return None


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def centroid(points: Iterable[tuple[float, float]]) -> tuple[float, float] | None:
    pts = list(points)
    if not pts:
        return None
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def grid(points: Iterable[tuple[float, float]], step: float = 0.02) -> list[tuple[float, float]]:
    """Dun bekende punten in de gemeente uit tot één per rastercel (~2 km)."""
    cells: dict[tuple[int, int], tuple[float, float]] = {}
    for lat, lon in points:
        cells.setdefault((round(lat / step), round(lon / step)), (lat, lon))
    return list(cells.values())


# --- wijkagenten -----------------------------------------------------------------------------


def parse_wijkagent(raw: dict) -> dict | None:
    naam = _first(raw, "naam", "name")
    polygon = _first(raw, "werkgebiedpolygoon", "werkgebiedPolygoon")
    if isinstance(polygon, str):  # de API levert de GeoJSON als string
        try:
            polygon = json.loads(polygon)
        except ValueError:
            polygon = None
    if not naam or not polygon:
        return None
    twitter = raw.get("twitter")
    if isinstance(twitter, dict):  # {"list": ..., "accountnaam": ...}, vaak leeg
        account = str(twitter.get("accountnaam") or "").lstrip("@")
        twitter = f"https://x.com/{account}" if account else None
    return {
        "id": str(_first(raw, "uid", "id") or naam),
        "naam": naam,
        "functie": _first(raw, "functie", "titel") or "Wijkagent",
        "werkgebied": html_to_text(_first(raw, "werkgebied", "werkgebiedomschrijving") or ""),
        "telefoon": _first(raw, "telefoon", "telefoonnummer") or "0900-8844",
        "facebook": _first(raw, "facebookurl", "facebook"),
        "twitter": twitter or None,
        "instagram": _first(raw, "instagramurl", "instagram"),
        "url": _first(raw, "url"),
        "polygoon": polygon,
    }


def fetch_wijkagenten(client: httpx.Client, points: list[tuple[float, float]]) -> list[dict]:
    found: dict[str, dict] = {}
    for lat, lon in points:
        resp = client.get(f"{POLITIE_API}/wijkagenten", params={"lat": lat, "lon": lon, "radius": 2}, headers=POLITIE_HEADERS)
        if resp.status_code == 204:
            continue
        resp.raise_for_status()
        for raw in _records(resp.json()):
            agent = parse_wijkagent(raw)
            if agent:
                found.setdefault(agent["id"], agent)
    return sorted(found.values(), key=lambda a: a["naam"])


# --- politienieuws ---------------------------------------------------------------------------


def parse_news(raw: dict, center: tuple[float, float]) -> Item | None:
    url = _first(raw, "url")
    title = _first(raw, "titel", "title")
    published = str(_first(raw, "publicatiedatum", "datum") or "")[:10]
    if not url or not title or not published:
        return None
    points = [
        (float(p["latitude"]), float(p["longitude"]))
        for p in raw.get("locaties") or []
        if p.get("latitude") is not None and p.get("longitude") is not None
    ]
    # Bij meerdere locaties telt het punt dat het dichtst bij de gemeente ligt.
    nearest = min(points, key=lambda p: _distance_m(center[0], center[1], *p)) if points else None
    gebied = _first(raw, "gebied") or ""
    return Item(
        id=f"politie:{_first(raw, 'uid', 'id') or url}",
        source="politie",
        title=title,
        published=published,
        url=url,
        doc_type="Politienieuws",
        category="politie",
        summary=html_to_text(_first(raw, "introductie", "intro") or "")[:400],
        address=gebied if isinstance(gebied, str) else ", ".join(gebied),
        lat=nearest[0] if nearest else None,
        lon=nearest[1] if nearest else None,
    )


# De API accepteert alleen een straal van 0.5, 2, 5, 10 of 25 km; 15 geeft een 400.
def fetch_news(client: httpx.Client, center: tuple[float, float], days: int, radius_km: float = 10) -> list[Item]:
    since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    items: dict[str, Item] = {}
    offset = 0
    while offset < 200:
        resp = client.get(
            f"{POLITIE_API}/nieuws",
            params={"lat": center[0], "lon": center[1], "radius": radius_km, "maxnumberofitems": 25, "offset": offset},
            headers=POLITIE_HEADERS,
        )
        if resp.status_code == 204:  # offset voorbij het einde
            break
        resp.raise_for_status()
        payload = resp.json()
        page = [parse_news(r, center) for r in _records(payload)]
        page = [i for i in page if i]
        for item in page:
            if item.published >= since:
                items.setdefault(item.url, item)
        last = isinstance(payload, dict) and (payload.get("iterator") or {}).get("last")
        if last or len(page) < 25 or min(i.published for i in page) < since:
            break
        offset += 25
    return sorted(items.values(), key=lambda i: i.published, reverse=True)


# --- misdrijven per buurt (CBS) ---------------------------------------------------------------


def gemeentecode(client: httpx.Client, gemeente: str) -> str:
    resp = client.get(LOCATIESERVER, params={"q": gemeente, "fq": "type:gemeente", "rows": 1, "fl": "gemeentecode"})
    resp.raise_for_status()
    docs = resp.json().get("response", {}).get("docs", [])
    if not docs:
        raise ValueError(f"gemeentecode niet gevonden voor {gemeente}")
    return str(docs[0]["gemeentecode"]).zfill(4)


def select_crime_types(dimension: list[dict]) -> dict[str, str]:
    """Kies per soort de CBS-sleutel op basis van de titel. Geeft {sleutel: korte naam}."""
    chosen: dict[str, str] = {}
    for short, needles in CRIME_TYPES:
        for row in dimension:
            title = str(row.get("Title", "")).lower()
            if any(n in title for n in needles):
                chosen[str(row["Key"]).strip()] = short
                break
    return chosen


def last_periods(n: int, today: dt.date | None = None) -> list[str]:
    """De laatste n maanden als CBS-periodecodes ('2026MM09'), oudste eerst."""
    today = today or dt.date.today()
    y, m = today.year, today.month
    out = []
    for _ in range(n):
        m -= 1
        if m == 0:
            y, m = y - 1, 12
        out.append(f"{y}MM{m:02d}")
    return list(reversed(out))


def build_veiligheid(rows: list[dict], types: dict[str, str], buurten: dict[str, str], gm: str, periods: list[str]) -> dict:
    """Zet CBS-rijen om naar {buurt: {soort: [aantal per maand]}} plus het gemeentetotaal."""
    index = {p: i for i, p in enumerate(periods)}
    areas: dict[str, dict[str, list[int | None]]] = {}
    for row in rows:
        area = str(row["WijkenEnBuurten"]).strip()
        kind = types.get(str(row["SoortMisdrijf"]).strip())
        period = str(row["Perioden"]).strip()
        if kind is None or period not in index:
            continue
        series = areas.setdefault(area, {}).setdefault(kind, [None] * len(periods))
        value = row.get("GeregistreerdeMisdrijven_1")
        series[index[period]] = int(value) if value is not None else None

    # Maanden zonder enkele waarde (nog niet gepubliceerd) vallen af.
    filled = [i for i in range(len(periods)) if any(s[i] is not None for a in areas.values() for s in a.values())]
    keep = lambda s: [s[i] for i in filled]  # noqa: E731
    return {
        "bron": "© Politie, via CBS (tabel 47022NED)",
        "perioden": [periods[i] for i in filled],
        "soorten": list(dict.fromkeys(types.values())),
        "gemeente": {k: keep(v) for k, v in areas.get(gm, {}).items()},
        "buurten": {
            code: {"naam": buurten.get(code, code), "reeksen": {k: keep(v) for k, v in series.items()}}
            for code, series in sorted(areas.items())
            if code.startswith("BU")
        },
    }


def fetch_veiligheid(client: httpx.Client, gemeente: str, months: int = 24) -> dict:
    code = gemeentecode(client, gemeente)
    dimension = client.get(f"{CBS_ODATA}/SoortMisdrijf").raise_for_status().json()["value"]
    types = select_crime_types(dimension)
    # CBS vult sleutels aan met spaties ('0.0.0 ') en filtert daar exact op.
    raw_keys = {str(r["Key"]).strip(): str(r["Key"]) for r in dimension}
    area_filter = f"startswith(Key,'BU{code}')"
    buurten = {
        str(r["Key"]).strip(): str(r["Title"]).strip()
        for r in client.get(f"{CBS_ODATA}/WijkenEnBuurten", params={"$filter": area_filter}).raise_for_status().json()["value"]
    }
    periods = last_periods(months)
    type_filter = " or ".join(f"SoortMisdrijf eq '{raw_keys[k]}'" for k in types)
    flt = (
        f"(startswith(WijkenEnBuurten,'BU{code}') or startswith(WijkenEnBuurten,'GM{code}'))"
        f" and Perioden ge '{periods[0]}' and ({type_filter})"
    )
    rows: list[dict] = []
    url: str | None = f"{CBS_ODATA}/TypedDataSet"
    params: dict | None = {"$filter": flt}
    while url:
        payload = client.get(url, params=params).raise_for_status().json()
        rows += payload.get("value", [])
        url, params = payload.get("odata.nextLink"), None
    return build_veiligheid(rows, types, buurten, f"GM{code}", periods)

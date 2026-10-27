"""Wonen en economie uit open CBS-data (CC BY 4.0), per buurt waar het kan en anders per gemeente.

Alles komt uit CBS OData v3. Kolomnamen krijgen per tabel(jaar) een ander volgnummer
('GemiddeldeWOZWaardeVanWoningen_39' of '_36'), dus we zoeken op de naam zonder dat nummer.
Regiosleutels zijn soms aangevuld met spaties ('GM1705 '), dus we filteren met startswith.
Een werkloosheidspercentage per gemeente bestaat niet; het aantal WW-uitkeringen is het lokale signaal.
"""
from __future__ import annotations

import re
from typing import Any

import httpx

ODATA = "https://opendata.cbs.nl/ODataApi/odata"
LOCATIESERVER = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free"

# Kerncijfers wijken en buurten, één tabel per jaar. Buurtgrenzen zijn in 2022 herzien;
# eerdere jaren zijn per buurt niet vergelijkbaar.
KERNCIJFERS = {"2022": "85318NED", "2023": "85618NED", "2024": "85984NED", "2025": "86165NED"}
VERKOOPPRIJS_GEMEENTE = "83625NED"  # gemiddelde verkoopprijs per gemeente, per jaar
PRIJSINDEX_PROVINCIE = "85792NED"  # prijsindex bestaande koopwoningen, per kwartaal
UITKERINGEN = "80794ned"  # uitkeringsontvangers per gemeente, per maand
VESTIGINGEN = "81575NED"  # bedrijfsvestigingen per gemeente, per jaar
ALLE_BEDRIJFSTAKKEN = "T001081"

# korte naam -> kolomnaam zonder volgnummer
WONEN = {
    "woz": "GemiddeldeWOZWaardeVanWoningen",
    "woningen": "Woningvoorraad",
    "koop": "Koopwoningen",
    "huur": "HuurwoningenTotaal",
    "corporatie": "InBezitWoningcorporatie",
}
BUURT_ECONOMIE = {
    "inkomen": "GemiddeldInkomenPerInwoner",
    "participatie": "Nettoarbeidsparticipatie",
    "vestigingen": "BedrijfsvestigingenTotaal",
}
# korte naam -> kolomnaam zonder volgnummer in 80794ned. Let op: er zijn twee bijstandskolommen;
# 'BijstandGerelateerd...' telt ook IOAW/IOAZ mee, wij nemen de gewone bijstand tot de AOW-leeftijd.
UITKERING_SOORTEN = {"ww": "Werkloosheid", "bijstand": "BijstandTotDeAOWLeeftijd", "ao": "ArbeidsongeschiktheidTotaal"}

_SUFFIX = re.compile(r"^(.*)_\d+$")


def measures(row: dict) -> dict[str, str]:
    """{kolomnaam zonder volgnummer: echte kolomnaam} voor de meetwaarden van een rij."""
    out: dict[str, str] = {}
    for key in row:
        m = _SUFFIX.match(key)
        if m:
            out.setdefault(m.group(1), key)
    return out


def _num(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _value(row: dict, cols: dict[str, str], name: str) -> float | None:
    key = cols.get(name)
    return _num(row.get(key)) if key else None


def rows(client: httpx.Client, table: str, flt: str) -> list[dict]:
    out: list[dict] = []
    url: str | None = f"{ODATA}/{table}/TypedDataSet"
    params: dict | None = {"$filter": flt}
    while url:
        payload = client.get(url, params=params).raise_for_status().json()
        out += payload.get("value", [])
        url, params = payload.get("odata.nextLink"), None
    return out


def regio(client: httpx.Client, gemeente: str) -> dict[str, str]:
    """Gemeente- en provinciecode via PDOK: {'gm': 'GM1705', 'pv': 'PV25', 'provincie': 'Gelderland'}."""
    resp = client.get(
        LOCATIESERVER,
        params={"q": gemeente, "fq": "type:gemeente", "rows": 1, "fl": "gemeentecode,provinciecode,provincienaam"},
    )
    resp.raise_for_status()
    docs = resp.json().get("response", {}).get("docs", [])
    if not docs:
        raise ValueError(f"gemeente niet gevonden: {gemeente}")
    d = docs[0]
    return {
        "gm": "GM" + str(d["gemeentecode"]).zfill(4),
        "pv": str(d.get("provinciecode") or ""),
        "provincie": str(d.get("provincienaam") or ""),
    }


def _period_series(rs: list[dict], value, kind: str, last: int) -> dict:
    """Zet rijen om naar {perioden, waarden} voor periodes van één soort ('JJ', 'KW' of 'MM')."""
    points: dict[str, float] = {}
    for r in rs:
        period = str(r.get("Perioden", "")).strip()
        v = value(r)
        if kind in period and v is not None:
            points.setdefault(period, v)
    keys = sorted(points)[-last:]
    return {"perioden": keys, "waarden": [points[k] for k in keys]}


def build_uitkeringen(rs: list[dict], last: int = 24) -> dict:
    """Maandcijfers per soort uitkering, op gedeelde perioden (None waar een soort ontbreekt)."""
    by_period: dict[str, dict[str, float | None]] = {}
    for r in rs:
        period = str(r.get("Perioden", "")).strip()
        if "MM" not in period:
            continue
        cols = measures(r)
        values = {short: _value(r, cols, name) for short, name in UITKERING_SOORTEN.items()}
        if any(v is not None for v in values.values()):
            by_period.setdefault(period, values)
    keys = sorted(by_period)[-last:]
    return {"perioden": keys, **{short: [by_period[k][short] for k in keys] for short in UITKERING_SOORTEN}}


def build_kerncijfers(tables: dict[str, list[dict]], gm: str) -> dict:
    """{jaar: rijen} -> reeksen per buurt en voor de gemeente, met None waar een jaar ontbreekt."""
    jaren = sorted(tables)
    areas: dict[str, dict[str, list[float | None]]] = {}
    for idx, jaar in enumerate(jaren):
        for r in tables[jaar]:
            code = str(r.get("WijkenEnBuurten", "")).strip()
            if not (code.startswith("BU") or code == gm):
                continue
            cols = measures(r)
            series = areas.setdefault(code, {})
            for short, name in {**WONEN, **BUURT_ECONOMIE}.items():
                series.setdefault(short, [None] * len(jaren))[idx] = _value(r, cols, name)
    return {"jaren": jaren, "gebieden": areas}


def _latest(series: list[float | None], jaren: list[str]) -> dict | None:
    for v, jaar in zip(reversed(series), reversed(jaren)):
        if v is not None:
            return {"waarde": v, "jaar": jaar}
    return None


def build_cijfers(kern: dict, namen: dict[str, str], gm: str, verkoop: dict, index: dict, uitkeringen: dict, vestigingen: dict, provincie: str) -> dict:
    jaren, gebieden = kern["jaren"], kern["gebieden"]

    def wonen(series: dict) -> dict:
        return {k: series.get(k, [None] * len(jaren)) for k in WONEN}

    def economie(series: dict) -> dict:
        # Inkomen loopt een jaar achter; neem per cijfer het laatste jaar met een waarde.
        return {k: _latest(series.get(k, []), jaren) for k in BUURT_ECONOMIE}

    buurten = {code: s for code, s in gebieden.items() if code.startswith("BU")}
    return {
        "bron": "CBS, CC BY 4.0",
        "wonen": {
            "jaren": jaren,
            "gemeente": wonen(gebieden.get(gm, {})),
            "buurten": {code: {"naam": namen.get(code, code), **wonen(s)} for code, s in sorted(buurten.items())},
            "verkoopprijs": verkoop,
            "prijsindex": {"regio": provincie, **index},
        },
        "economie": {
            "uitkeringen": uitkeringen,
            "vestigingen": vestigingen,
            "gemeente": economie(gebieden.get(gm, {})),
            "buurten": {code: economie(s) for code, s in sorted(buurten.items())},
        },
    }


def fetch_cijfers(client: httpx.Client, gemeente: str, log=lambda msg: None) -> dict:
    r = regio(client, gemeente)
    gm, code = r["gm"], r["gm"][2:]
    area = f"startswith(WijkenEnBuurten,'BU{code}') or startswith(WijkenEnBuurten,'{gm}')"

    tables: dict[str, list[dict]] = {}
    for jaar, table in KERNCIJFERS.items():
        try:
            tables[jaar] = rows(client, table, area)
        except httpx.HTTPError as e:  # één ontbrekend jaar mag de rest niet tegenhouden
            log(f"  kerncijfers {jaar} ({table}) mislukt: {e}")
    namen: dict[str, str] = {}
    if tables:
        latest = KERNCIJFERS[max(tables)]
        dim = client.get(f"{ODATA}/{latest}/WijkenEnBuurten", params={"$filter": f"startswith(Key,'BU{code}')"})
        namen = {str(d["Key"]).strip(): str(d["Title"]).strip() for d in dim.raise_for_status().json()["value"]}

    def optional(label: str, fn) -> dict:
        try:
            return fn()
        except (httpx.HTTPError, KeyError, ValueError) as e:
            log(f"  {label} mislukt: {e}")
            return {"perioden": [], "waarden": []}

    def verkoop() -> dict:
        rs = rows(client, VERKOOPPRIJS_GEMEENTE, f"startswith(RegioS,'{gm}')")
        return _period_series(rs, lambda x: _value(x, measures(x), "GemiddeldeVerkoopprijs"), "JJ", 10)

    def index() -> dict:
        rs = rows(client, PRIJSINDEX_PROVINCIE, f"startswith(RegioS,'{r['pv']}')")
        prijs = _period_series(rs, lambda x: _value(x, measures(x), "GemiddeldeVerkoopprijs"), "KW", 12)
        idx = _period_series(rs, lambda x: _value(x, measures(x), "PrijsindexVerkoopprijzen"), "KW", 12)
        return {"perioden": idx["perioden"], "index": idx["waarden"], "prijs": prijs["waarden"]}

    def uitkeringen() -> dict:
        return build_uitkeringen(rows(client, UITKERINGEN, f"startswith(RegioS,'{gm}')"))

    def vestigingen() -> dict:
        flt = f"startswith(RegioS,'{gm}') and BedrijfstakkenBranchesSBI2008 eq '{ALLE_BEDRIJFSTAKKEN}'"
        rs = rows(client, VESTIGINGEN, flt)
        # De tabel heeft één meetwaarde: het aantal vestigingen.
        return _period_series(rs, lambda x: _num(x.get(next(iter(measures(x).values()), ""))), "JJ", 12)

    return build_cijfers(
        build_kerncijfers(tables, gm),
        namen,
        gm,
        optional("verkoopprijs", verkoop),
        optional("prijsindex", index),
        optional("uitkeringen", uitkeringen),
        optional("vestigingen", vestigingen),
        r["provincie"],
    )

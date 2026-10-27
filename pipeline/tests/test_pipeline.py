import json
from pathlib import Path

import httpx
import pytest

from mijnstraat import bekendmakingen, cli
from mijnstraat.categorize import categorize
from mijnstraat.geocode import Geocoder, guess_address
from mijnstraat.rd import rd_to_wgs84
from mijnstraat.summarize import Summarizer, parse_answer

FIXTURE = (Path(__file__).parent / "fixtures" / "sru_sample.xml").read_text()


def test_rd_to_wgs84_reference_points():
    assert rd_to_wgs84(155_000, 463_000) == pytest.approx((52.155174, 5.387206), abs=1e-6)
    # Een punt in Lingewaard (Huissen) moet ook in Lingewaard uitkomen
    lat, lon = rd_to_wgs84(191_000, 435_000)
    assert 51.85 < lat < 51.98 and 5.85 < lon < 6.0


def test_parse_records():
    items, nxt = bekendmakingen.parse_records(FIXTURE)
    assert nxt == 4
    assert [i.id for i in items] == ["bm:gmb-2026-900001", "bm:stcrt-2026-900002", "bm:gmb-2026-900003"]
    first, second, third = items
    assert first.published == "2026-10-20"
    assert first.doc_type == "Gemeenteblad"
    assert first.location_hint == "6851 AB 18"
    assert first.url.endswith("gmb-2026-900001.html")
    assert second.lat == pytest.approx(51.94, abs=0.05) and second.lon == pytest.approx(5.95, abs=0.05)
    assert third.url == "https://zoek.officielebekendmakingen.nl/gmb-2026-900003.html"


@pytest.mark.parametrize(
    "title,types,expected",
    [
        ("Vertrokken met onbekende bestemming van A.X. Zimmerman", ["uitschrijving basisregistratie personen"], True),
        ("Gemeente Lingewaard - vertrokken met onbekende bestemming - A. Mohsend", ["andere vergunning"], True),
        ("Omgevingsvergunning Dorpsstraat 1 Gendt", ["omgevingsvergunning"], False),
    ],
)
def test_is_personal(title, types, expected):
    assert bekendmakingen.is_personal(title, types) is expected


def test_build_query():
    import datetime as dt

    q = bekendmakingen.build_query("Lingewaard", dt.date(2026, 7, 28))
    assert 'dt.creator=="Lingewaard"' in q and "dt.available>=2026-07-28" in q


@pytest.mark.parametrize(
    "text,expected",
    [
        ("Aanvraag omgevingsvergunning, plaatsen dakkapel, Voorbeeldstraat 18 te Huissen", "Voorbeeldstraat 18"),
        ("Kapvergunning Van Heemstralaan 4a, Bemmel", "Van Heemstralaan 4a"),
        ("Melding activiteit 6851 AB 18", "6851 AB 18"),
        ("Bouwen woningen Pannerdenseweg 10-14", "Pannerdenseweg 10"),
        ("Verordening afvalstoffenheffing 2027", ""),
    ],
)
def test_guess_address(text, expected):
    assert guess_address(text) == expected


@pytest.mark.parametrize(
    "title,expected",
    [
        ("Aanvraag omgevingsvergunning dakkapel", "vergunning"),
        ("Verkeersbesluit tijdelijke afsluiting Kerkstraat", "verkeer"),
        ("Evenementenvergunning Huissen Kermis", "evenement"),
        ("Verordening afvalstoffenheffing 2027", "regels"),
        ("Benoeming lid rekenkamer", "overig"),
    ],
)
def test_categorize(title, expected):
    assert categorize(title) == expected


def test_parse_answer_handles_thinking_and_bad_category():
    out = parse_answer('<think>hmm</think>{"samenvatting": "Buren willen een dakkapel.", "categorie": "Vergunning", "locatie": "Voorbeeldstraat 18"}')
    assert out == {"summary": "Buren willen een dakkapel.", "category": "vergunning", "location": "Voorbeeldstraat 18"}
    assert parse_answer('{"samenvatting": "x", "categorie": "onzin"}')["category"] == ""


def _pdok_handler(request: httpx.Request) -> httpx.Response:
    fq = request.url.params.get_list("fq")
    assert "gemeentenaam:Lingewaard" in fq
    q = request.url.params["q"]
    if "type:adres" in fq and ("Voorbeeldstraat" in q or "6851" in q):
        doc = {"weergavenaam": "Voorbeeldstraat 18, 6851AB Huissen", "centroide_ll": "POINT(5.93 51.94)"}
        return httpx.Response(200, json={"response": {"docs": [doc]}})
    return httpx.Response(200, json={"response": {"docs": []}})


def test_geocoder_caches(tmp_path):
    calls = []

    def handler(request):
        calls.append(request)
        return _pdok_handler(request)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    geo = Geocoder(client, "Lingewaard", tmp_path / "geo.json")
    assert geo.lookup("Voorbeeldstraat 18") == ("Voorbeeldstraat 18, 6851AB Huissen", 51.94, 5.93)
    assert geo.lookup("Voorbeeldstraat 18") == ("Voorbeeldstraat 18, 6851AB Huissen", 51.94, 5.93)
    assert len(calls) == 1
    assert geo.lookup("Nergensweg 1") is None
    geo.save()
    assert json.loads((tmp_path / "geo.json").read_text())["Nergensweg 1"] is None


def test_system_prompt_rules():
    from mijnstraat.summarize import SYSTEM

    s = SYSTEM.lower()
    assert "aanvraag of melding" in s and "nog geen besluit" in s
    assert "wél een besluit" in s  # besluiten mogen niet als aanvraag worden samengevat
    assert "nooit een termijn" in s and "letterlijk in de tekst" in s
    assert "bezwaar" in s and "beroep" in s and "raad van state" in s


def test_summary_cache_key_changes_with_prompt(monkeypatch):
    from mijnstraat import summarize

    s = Summarizer(httpx.Client(), "http://localhost:11434", "gemma3:12b")
    before = s.cache_key
    assert before.startswith("gemma3_12b.")
    monkeypatch.setattr(summarize, "SYSTEM", summarize.SYSTEM + " Extra regel.")
    assert s.cache_key != before


def test_summarizer_request_shape():
    seen = {}

    def handler(request):
        seen.update(json.loads(request.content))
        return httpx.Response(200, json={"message": {"content": '{"samenvatting": "Kort.", "categorie": "verkeer", "locatie": ""}'}})

    s = Summarizer(httpx.Client(transport=httpx.MockTransport(handler)), "http://localhost:11434/", "qwen3:30b-a3b")
    assert s.summarize("Titel", "Tekst")["summary"] == "Kort."
    assert seen["model"] == "qwen3:30b-a3b" and seen["think"] is False and seen["format"] == "json"


def test_build_end_to_end(tmp_path, monkeypatch):
    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host == "repository.overheid.nl":
            return httpx.Response(200, text=FIXTURE.replace("<sru:nextRecordPosition>4</sru:nextRecordPosition>", ""))
        if host == "zoek.officielebekendmakingen.nl":
            if "900001" in request.url.path:
                return httpx.Response(200, text="<html><body><p>Op Voorbeeldstraat 18 wordt een dakkapel geplaatst.</p></body></html>")
            return httpx.Response(200, text="<html><body><p>Algemene regels voor de hele gemeente.</p></body></html>")
        if host == "api.pdok.nl":
            return _pdok_handler(request)
        if host == "localhost":
            return httpx.Response(200, json={"message": {"content": '{"samenvatting": "Samengevat.", "categorie": "", "locatie": ""}'}})
        raise AssertionError(f"onverwachte host {host}")

    monkeypatch.setattr(cli, "_client", lambda cfg: httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(bekendmakingen, "fetch", _fetch_without_date_filter(bekendmakingen.fetch))
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    monkeypatch.setenv("MIJNSTRAAT_OUT", str(tmp_path / "public"))
    monkeypatch.setenv("MIJNSTRAAT_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr(cli, "Config", lambda: _cfg(tmp_path))

    cli.main(["build", "--no-politie", "--no-cijfers"])

    feed = json.loads((tmp_path / "public" / "lingewaard" / "feed.json").read_text())
    assert feed["stats"] == {"items": 3, "located": 2}
    first = feed["items"][0]
    assert first["summary"] == "Samengevat."
    assert first["category"] == "vergunning"
    assert first["lat"] == 51.94 and "text" not in first


def _cfg(tmp_path):
    from mijnstraat.config import Config

    return Config(out_dir=str(tmp_path / "public"), cache_dir=str(tmp_path / "cache"))


def _fetch_without_date_filter(real):
    def fetch(client, gemeente, days, limit=None):
        return real(client, gemeente, days=3650, limit=limit)

    return fetch

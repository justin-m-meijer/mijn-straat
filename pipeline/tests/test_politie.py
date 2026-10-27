import datetime as dt
import json
from pathlib import Path

import httpx

from mijnstraat import bekendmakingen, cli, politie

FIXTURES = Path(__file__).parent / "fixtures"
RECENT = (dt.date.today() - dt.timedelta(days=3)).isoformat()


def _json(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text().replace("PUBLISHED_RECENT", RECENT))


SOORTEN = [
    {"Key": "0.0.0  ", "Title": "Totaal misdrijven"},
    {"Key": "1.1.1  ", "Title": "Diefstal/inbraak woning"},
    {"Key": "1.2.3  ", "Title": "Diefstal van brom-, snor-, fietsen"},
    {"Key": "2.2.1  ", "Title": "Vernieling cq. zaakbeschadiging"},
    {"Key": "9.9.9  ", "Title": "Iets anders"},
]


def _cbs_rows(periods):
    rows = []
    for i, p in enumerate(periods):
        rows.append({"WijkenEnBuurten": "BU17050102", "SoortMisdrijf": "0.0.0  ", "Perioden": p, "GeregistreerdeMisdrijven_1": i % 3})
        rows.append({"WijkenEnBuurten": "BU17050102", "SoortMisdrijf": "1.1.1  ", "Perioden": p, "GeregistreerdeMisdrijven_1": 0})
        rows.append({"WijkenEnBuurten": "GM1705    ", "SoortMisdrijf": "0.0.0  ", "Perioden": p, "GeregistreerdeMisdrijven_1": 100 + i})
    return rows


def test_parse_wijkagent_keeps_polygon_and_skips_incomplete():
    raw = _json("politie_wijkagenten.json")["wijkagenten"]
    agent = politie.parse_wijkagent(raw[0])
    assert agent["naam"] == "Marco Voorbeeld"
    assert agent["werkgebied"] == "Doornenburg en Gendt"
    assert agent["polygoon"]["type"] == "FeatureCollection"  # de API levert een JSON-string
    assert agent["facebook"] == "https://www.facebook.com/politielingewaard"
    assert agent["twitter"] is None and agent["instagram"] is None
    assert politie.parse_wijkagent(raw[1]) is None


def test_parse_news_uses_location_nearest_to_gemeente():
    raw = _json("politie_nieuws.json")["nieuwsberichten"][0]
    item = politie.parse_news(raw, (51.876, 5.976))
    assert item.category == "politie" and item.source == "politie"
    assert (item.lat, item.lon) == (51.877, 5.975)  # niet het punt in Amsterdam
    assert item.summary == "De politie zoekt getuigen van een inbraak in een woning."
    assert item.published == RECENT


def test_grid_thins_points():
    pts = [(51.876, 5.976), (51.877, 5.977), (51.93, 5.93)]
    assert len(politie.grid(pts)) == 2


def test_select_crime_types_by_title():
    chosen = politie.select_crime_types(SOORTEN)
    assert chosen == {"0.0.0": "totaal", "1.1.1": "woninginbraak", "1.2.3": "fiets", "2.2.1": "vernieling"}


def test_last_periods():
    assert politie.last_periods(3, dt.date(2026, 2, 10)) == ["2025MM11", "2025MM12", "2026MM01"]


def test_build_veiligheid_drops_unpublished_months():
    periods = ["2026MM08", "2026MM09", "2026MM10"]
    rows = [r for r in _cbs_rows(periods) if r["Perioden"] != "2026MM10"]
    out = politie.build_veiligheid(rows, politie.select_crime_types(SOORTEN), {"BU17050102": "Centrum Gendt"}, "GM1705", periods)
    assert out["perioden"] == ["2026MM08", "2026MM09"]
    assert out["buurten"]["BU17050102"]["naam"] == "Centrum Gendt"
    assert out["buurten"]["BU17050102"]["reeksen"]["totaal"] == [0, 1]
    assert out["gemeente"]["totaal"] == [100, 101]
    assert "GM1705" not in out["buurten"]


def _politie_handler(request: httpx.Request) -> httpx.Response:
    host, path = request.url.host, request.url.path
    if host == "api.politie.nl" and path.endswith("/wijkagenten"):
        return httpx.Response(200, json=_json("politie_wijkagenten.json"))
    if host == "api.politie.nl" and path.endswith("/nieuws"):
        assert request.url.params["radius"] in ("0.5", "2", "5", "10", "25")
        return httpx.Response(200, json=_json("politie_nieuws.json"))
    if host == "api.pdok.nl" and request.url.params.get("fq") == "type:gemeente":
        return httpx.Response(200, json={"response": {"docs": [{"gemeentecode": "1705"}]}})
    if host == "dataderden.cbs.nl":
        if path.endswith("/SoortMisdrijf"):
            return httpx.Response(200, json={"value": SOORTEN})
        if path.endswith("/WijkenEnBuurten"):
            return httpx.Response(200, json={"value": [{"Key": "BU17050102", "Title": "Centrum Gendt"}]})
        if path.endswith("/TypedDataSet"):
            assert "startswith(WijkenEnBuurten,'BU1705')" in request.url.params["$filter"]
            assert "SoortMisdrijf eq '0.0.0  '" in request.url.params["$filter"]  # sleutel mét opvulling
            return httpx.Response(200, json={"value": _cbs_rows(politie.last_periods(24))})
    return None


def test_build_writes_police_files(tmp_path, monkeypatch):
    from test_pipeline import FIXTURE, _cfg, _fetch_without_date_filter, _pdok_handler

    def handler(request: httpx.Request) -> httpx.Response:
        resp = _politie_handler(request)
        if resp is not None:
            return resp
        host = request.url.host
        if host == "repository.overheid.nl":
            return httpx.Response(200, text=FIXTURE.replace("<sru:nextRecordPosition>4</sru:nextRecordPosition>", ""))
        if host == "zoek.officielebekendmakingen.nl":
            return httpx.Response(200, text="<html><body><p>Op Voorbeeldstraat 18 wordt een dakkapel geplaatst.</p></body></html>")
        if host == "api.pdok.nl":
            return _pdok_handler(request)
        raise AssertionError(f"onverwachte host {host}")

    monkeypatch.setattr(cli, "_client", lambda cfg: httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(bekendmakingen, "fetch", _fetch_without_date_filter(bekendmakingen.fetch))
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    monkeypatch.setattr(cli, "Config", lambda: _cfg(tmp_path))

    cli.main(["build", "--no-llm", "--no-cijfers"])

    out = tmp_path / "public" / "lingewaard"
    agents = json.loads((out / "wijkagenten.json").read_text())["wijkagenten"]
    assert [a["naam"] for a in agents] == ["Marco Voorbeeld"]
    veiligheid = json.loads((out / "veiligheid.json").read_text())
    assert "BU17050102" in veiligheid["buurten"] and veiligheid["bron"].startswith("© Politie")
    feed = json.loads((out / "feed.json").read_text())
    police = [i for i in feed["items"] if i["category"] == "politie"]
    assert [i["title"] for i in police] == ["Getuigen gezocht van inbraak in Gendt"]


def test_build_survives_police_outage(tmp_path, monkeypatch):
    from test_pipeline import FIXTURE, _cfg, _fetch_without_date_filter, _pdok_handler

    def handler(request: httpx.Request) -> httpx.Response:
        host = request.url.host
        if host in ("api.politie.nl", "dataderden.cbs.nl", "opendata.cbs.nl"):
            return httpx.Response(503)
        if host == "api.pdok.nl" and request.url.params.get("fq") == "type:gemeente":
            return httpx.Response(200, json={"response": {"docs": [{"gemeentecode": "1705"}]}})
        if host == "repository.overheid.nl":
            return httpx.Response(200, text=FIXTURE.replace("<sru:nextRecordPosition>4</sru:nextRecordPosition>", ""))
        if host == "zoek.officielebekendmakingen.nl":
            return httpx.Response(200, text="<html><body><p>Op Voorbeeldstraat 18 wordt een dakkapel geplaatst.</p></body></html>")
        if host == "api.pdok.nl":
            return _pdok_handler(request)
        raise AssertionError(f"onverwachte host {host}")

    monkeypatch.setattr(cli, "_client", lambda cfg: httpx.Client(transport=httpx.MockTransport(handler)))
    monkeypatch.setattr(bekendmakingen, "fetch", _fetch_without_date_filter(bekendmakingen.fetch))
    monkeypatch.setattr(cli.time, "sleep", lambda s: None)
    monkeypatch.setattr(cli, "Config", lambda: _cfg(tmp_path))

    cli.main(["build", "--no-llm"])

    out = tmp_path / "public" / "lingewaard"
    assert json.loads((out / "feed.json").read_text())["stats"]["items"] == 3
    assert not (out / "wijkagenten.json").exists()
    # Zonder kerncijfers blijft er een leeg maar geldig cijfersbestand over.
    cijfers = json.loads((out / "cijfers.json").read_text())
    assert cijfers["wonen"]["buurten"] == {} and cijfers["economie"]["uitkeringen"]["perioden"] == []


def test_politie_requests_use_generic_user_agent():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.headers["user-agent"])
        return httpx.Response(204)

    client = httpx.Client(transport=httpx.MockTransport(handler), headers={"User-Agent": "MijnStraat-POC/0.1 (Jumpstart Media)"})
    politie.fetch_wijkagenten(client, [(51.876, 5.976)])
    politie.fetch_news(client, (51.876, 5.976), 90)
    assert seen and all(ua.startswith("python-httpx/") for ua in seen)

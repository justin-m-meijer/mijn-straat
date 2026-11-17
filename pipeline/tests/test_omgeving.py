import json
from pathlib import Path

import httpx

from mijnstraat import omgeving, publish

FIXTURES = Path(__file__).parent / "fixtures"
LINGEWAARD = (51.90, 5.93)

# Vormen zoals Luchtmeetnet ze op 2026-11-17 teruggaf.
STATIONS = {
    1: [{"number": "NL10741", "location": "Nijmegen-Graafseweg"}, {"number": "NL49017", "location": "Amsterdam-Stadhouderskade"}],
    2: [{"number": "NL54010", "location": "Arnhem GelreDome"}],
}
DETAILS = {
    "NL10741": {"type": "Traffic", "components": ["CO", "FN", "NO", "NO2", "PM10", "PM25", "BCWB"], "geometry": {"type": "point", "coordinates": [5.857777, 51.841372]}, "location": "Nijmegen-Graafseweg", "province": None},
    "NL49017": {"type": "Traffic", "components": ["C6H6", "NO2", "PM10"], "geometry": {"type": "point", "coordinates": [4.8997, 52.358039]}, "location": "Amsterdam-Stadhouderskade"},
    "NL54010": {"type": "Other", "components": ["PM10", "PM25"], "geometry": {"type": "point", "coordinates": [5.897657, 51.962296]}, "location": "Arnhem GelreDome"},
}


def _measurement(station, formula, value, hour):
    return {"station_number": station, "value": value, "timestamp_measured": f"2026-11-17T{hour:02d}:00:00+00:00", "formula": formula}


def _lucht_handler(seen):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url)
        path = request.url.path
        if path == "/open_api/stations":
            page = int(request.url.params["page"])
            return httpx.Response(200, json={"pagination": {"last_page": 2, "current_page": page}, "data": STATIONS[page]})
        if path.startswith("/open_api/stations/"):
            return httpx.Response(200, json={"data": DETAILS[path.rsplit("/", 1)[1]]})
        station = request.url.params["station_number"]
        assert "start" in request.url.params and "end" in request.url.params  # anders volgt een 302
        if path == "/open_api/measurements":
            rows = [_measurement(station, "NO2", 15.5, 18), _measurement(station, "NO2", 16.3, 17), _measurement(station, "FN", 1.0, 18)]
            return httpx.Response(200, json={"pagination": {"last_page": 1}, "data": rows})
        if path == "/open_api/lki":
            return httpx.Response(200, json={"data": [_measurement(station, "LKI", 3, 18), _measurement(station, "LKI", 5, 17)]})
        raise AssertionError(f"onverwacht pad {path}")

    return handler


def test_fetch_lucht_nearest_stations_with_latest_values(tmp_path):
    seen = []
    client = httpx.Client(transport=httpx.MockTransport(_lucht_handler(seen)))
    cache = tmp_path / "stations.json"
    lucht = omgeving.fetch_lucht(client, *LINGEWAARD, cache, log=lambda m: None, pause=0)

    assert lucht["bron"].startswith("www.luchtmeetnet.nl")
    # Amsterdam ligt buiten 25 km; Arnhem is dichterbij dan Nijmegen.
    assert [s["nummer"] for s in lucht["stations"]] == ["NL54010", "NL10741"]
    nijmegen = lucht["stations"][1]
    assert nijmegen["lat"] == 51.841372 and nijmegen["lon"] == 5.857777  # [lon, lat] omgedraaid
    assert nijmegen["stoffen"] == ["NO2", "PM10", "PM25"]  # alleen wat de app toont
    assert nijmegen["laatste"] == {
        "NO2": {"waarde": 15.5, "tijd": "2026-11-17T18:00:00+00:00"},
        "LKI": {"waarde": 3, "tijd": "2026-11-17T18:00:00+00:00"},
    }

    # Tweede run: stations uit de cache, alleen nog metingen.
    seen.clear()
    omgeving.fetch_lucht(client, *LINGEWAARD, cache, log=lambda m: None, pause=0)
    assert all("/stations" not in u.path for u in seen)


def test_parse_zwemplekken():
    spots = omgeving.parse_zwemplekken((FIXTURES / "zwemwater_home.html").read_text())
    assert [s["naam"] for s in spots] == ["De Bisonbaai", "Bemmelse Waard", "Diemerpark"]
    bison, bemmel = spots[0], spots[1]
    assert (bison["lat"], bison["lon"]) == (51.8668, 5.9335)  # data-coordinates is [lat, lon]
    assert bison["adres"] == "Ooijse Bandijk, Ooij"
    assert bemmel["status"] == "negatief_zwemadvies" and bemmel["status_label"] == "Negatief zwemadvies"


def test_fetch_zwemwater_filters_and_matches_eu_oordeel():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "www.zwemwater.nl":
            return httpx.Response(200, text=(FIXTURES / "zwemwater_home.html").read_text())
        if request.url.host == "geo.rijkswaterstaat.nl":
            assert "bbox" in request.url.params
            return httpx.Response(200, json={"type": "FeatureCollection", "features": [
                {"type": "Feature", "geometry": {"type": "Point", "coordinates": [5.9337, 51.8669]}, "properties": {"eu_naam": "BISONBAAI", "eu_actueel": "Uitstekend"}},
            ]})
        raise AssertionError(request.url)

    zwem = omgeving.fetch_zwemwater(httpx.Client(transport=httpx.MockTransport(handler)), *LINGEWAARD, log=lambda m: None)
    assert [p["naam"] for p in zwem["plekken"]] == ["Bemmelse Waard", "De Bisonbaai"]  # op afstand, zonder Amsterdam
    assert zwem["plekken"][1]["eu_oordeel"] == "Uitstekend"
    assert zwem["plekken"][0]["eu_oordeel"] is None


def test_public_copy_drops_zwemwater_status(tmp_path):
    g = tmp_path / "src" / "lingewaard"
    g.mkdir(parents=True)
    (g / "feed.json").write_text(json.dumps({"items": []}))
    (g / "omgeving.json").write_text(json.dumps({
        "lucht": {"bron": "www.luchtmeetnet.nl", "stations": [{"nummer": "NL54010"}]},
        "zwemwater": {"bron": "zwemwater.nl", "plekken": [
            {"naam": "A", "status": "goed", "status_label": "Goed", "eu_oordeel": "Uitstekend"},
            {"naam": "B", "status": "waarschuwing", "status_label": "Waarschuwing", "eu_oordeel": None},
        ]},
    }))
    publish.prepare(tmp_path / "src", tmp_path / "site")
    out = json.loads((tmp_path / "site" / "lingewaard" / "omgeving.json").read_text())
    assert out["lucht"]["stations"] == [{"nummer": "NL54010"}]
    assert out["zwemwater"]["plekken"] == [{"naam": "A", "eu_oordeel": "Uitstekend"}]
    assert "zwemwater.nl" not in out["zwemwater"]["bron"]

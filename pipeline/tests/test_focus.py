import httpx

from mijnstraat import focus
from mijnstraat.models import Item


def _item(cat, lat=None, lon=None):
    return Item(id=f"x{lat}{cat}", source="bekendmakingen", title="t", published="2026-11-01", url="", category=cat, lat=lat, lon=lon)


def test_distance_m():
    # Amsterdam Centraal -> Dam is ongeveer 800 m
    assert 700 < focus.distance_m(52.3791, 4.9003, 52.3731, 4.8926) < 900


def test_apply_keeps_nearby_and_gemeentebreed():
    lat, lon = 52.355, 4.99
    items = [
        _item("vergunning", 52.356, 4.991),  # ~150 m
        _item("vergunning", 52.38, 4.90),  # ~7 km
        _item("raad"),  # geen locatie, gemeentebreed
        _item("vergunning"),  # geen locatie, niet zichtbaar in de app
    ]
    kept = focus.apply(items, lat, lon, 3000)
    assert [(i.category, i.lat) for i in kept] == [("vergunning", 52.356), ("raad", None)]


def test_resolve():
    def handler(request):
        assert request.url.params["fq"] == "type:postcode" and request.url.params["q"] == "1087VX"
        doc = {"postcode": "1087VX", "centroide_ll": "POINT(4.99 52.355)", "gemeentenaam": "Amsterdam", "buurtnaam": "X"}
        return httpx.Response(200, json={"response": {"docs": [doc]}})

    area = focus.resolve(httpx.Client(transport=httpx.MockTransport(handler)), "1087 vx")
    assert area["lat"] == 52.355 and area["lon"] == 4.99 and area["gemeente"] == "Amsterdam"

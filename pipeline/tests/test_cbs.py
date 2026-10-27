import httpx

from mijnstraat import cbs


def _kern(code, woz, koop, inkomen=None, suffix=39):
    # Kolomnummers verschillen per jaartabel; de pijplijn moet ze negeren.
    return {
        "ID": 1,
        "WijkenEnBuurten": code,
        "Gemeentenaam_1": "Lingewaard",
        f"GemiddeldeWOZWaardeVanWoningen_{suffix}": woz,
        f"Woningvoorraad_{suffix - 5}": 635,
        f"Koopwoningen_{suffix + 1}": koop,
        f"HuurwoningenTotaal_{suffix + 2}": 100 - koop,
        f"InBezitWoningcorporatie_{suffix + 3}": 37,
        f"GemiddeldInkomenPerInwoner_{suffix + 30}": inkomen,
        f"Nettoarbeidsparticipatie_{suffix + 20}": 73.0,
        f"BedrijfsvestigingenTotaal_{suffix + 50}": 85,
    }


def test_measures_strips_sequence_numbers():
    row = {"ID": 1, "RegioS": "GM1705", "GemiddeldeVerkoopprijs_1": 501801, "Koopwoningen_40": 61}
    assert cbs.measures(row) == {"GemiddeldeVerkoopprijs": "GemiddeldeVerkoopprijs_1", "Koopwoningen": "Koopwoningen_40"}


def test_kerncijfers_across_years_with_different_column_numbers():
    tables = {
        "2023": [_kern("BU17050100  ", 298, 60, inkomen=28.3, suffix=36), _kern("GM1705    ", 380, 73, suffix=36)],
        "2024": [_kern("BU17050100  ", 316, 61), _kern("GM1705    ", 401, 73), _kern("WK170501  ", 1, 1)],
    }
    kern = cbs.build_kerncijfers(tables, "GM1705")
    assert kern["jaren"] == ["2023", "2024"]
    assert set(kern["gebieden"]) == {"BU17050100", "GM1705"}  # wijken vallen af
    assert kern["gebieden"]["BU17050100"]["woz"] == [298, 316]

    out = cbs.build_cijfers(kern, {"BU17050100": "Lootakkers"}, "GM1705", {}, {"perioden": []}, {}, {}, "Gelderland")
    buurt = out["wonen"]["buurten"]["BU17050100"]
    assert buurt["naam"] == "Lootakkers" and buurt["koop"] == [60, 61]
    assert out["wonen"]["gemeente"]["woz"] == [380, 401]
    # Inkomen ontbreekt in 2024: we tonen het laatste jaar met een waarde.
    assert out["economie"]["buurten"]["BU17050100"]["inkomen"] == {"waarde": 28.3, "jaar": "2023"}
    assert out["economie"]["buurten"]["BU17050100"]["participatie"] == {"waarde": 73.0, "jaar": "2024"}
    assert out["wonen"]["prijsindex"]["regio"] == "Gelderland"


def test_uitkeringen_share_periods_and_skip_years():
    rows = [
        {"RegioS": "GM1705", "Perioden": "2026MM03", "WWUitkering_1": 400, "BijstandTotAOWLeeftijd_2": 575, "Arbeidsongeschiktheid_3": 1890},
        {"RegioS": "GM1705", "Perioden": "2026MM04", "WWUitkering_1": 410, "BijstandTotAOWLeeftijd_2": None, "Arbeidsongeschiktheid_3": 1900},
        {"RegioS": "GM1705", "Perioden": "2025JJ00", "WWUitkering_1": 9999, "BijstandTotAOWLeeftijd_2": 1, "Arbeidsongeschiktheid_3": 1},
    ]
    out = cbs.build_uitkeringen(rows)
    assert out == {"perioden": ["2026MM03", "2026MM04"], "ww": [400, 410], "bijstand": [575, None], "ao": [1890, 1900]}


def test_fetch_cijfers_end_to_end_and_partial_outage():
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        seen.append(url)
        if request.url.host == "api.pdok.nl":
            return httpx.Response(200, json={"response": {"docs": [{"gemeentecode": "1705", "provinciecode": "PV25", "provincienaam": "Gelderland"}]}})
        if "/85984NED/TypedDataSet" in url:
            return httpx.Response(200, json={"value": [_kern("BU17050100  ", 316, 61)]})
        if "/85984NED/WijkenEnBuurten" in url:
            return httpx.Response(200, json={"value": [{"Key": "BU17050100  ", "Title": "Lootakkers"}]})
        if "/83625NED/" in url:
            rows = [{"RegioS": "GM1705  ", "Perioden": f"{y}JJ00", "GemiddeldeVerkoopprijs_1": 400000 + y} for y in range(2010, 2026)]
            return httpx.Response(200, json={"value": rows})
        if "/85792NED/" in url:
            rows = [
                {"RegioS": "PV25  ", "Perioden": "2026KW03", "PrijsindexBestaandeKoopwoningen_1": 166.2, "GemiddeldeVerkoopprijs_7": 510080},
                {"RegioS": "PV25  ", "Perioden": "2026JJ00", "PrijsindexBestaandeKoopwoningen_1": 160.0, "GemiddeldeVerkoopprijs_7": 1},
            ]
            return httpx.Response(200, json={"value": rows})
        if "/81575NED/" in url:
            return httpx.Response(200, json={"value": [{"RegioS": "GM1705 ", "Perioden": "2026JJ00", "Vestigingen_1": 5720}]})
        return httpx.Response(500)  # andere jaartabellen en uitkeringen liggen eruit

    logs = []
    out = cbs.fetch_cijfers(httpx.Client(transport=httpx.MockTransport(handler)), "Lingewaard", log=logs.append)
    assert out["wonen"]["jaren"] == ["2024"]
    assert out["wonen"]["buurten"]["BU17050100"]["naam"] == "Lootakkers"
    assert len(out["wonen"]["verkoopprijs"]["perioden"]) == 10 and out["wonen"]["verkoopprijs"]["waarden"][-1] == 402025
    assert out["wonen"]["prijsindex"] == {"regio": "Gelderland", "perioden": ["2026KW03"], "index": [166.2], "prijs": [510080]}
    assert out["economie"]["vestigingen"] == {"perioden": ["2026JJ00"], "waarden": [5720]}
    assert out["economie"]["uitkeringen"]["perioden"] == []
    assert any("uitkeringen mislukt" in line for line in logs)
    assert any("startswith(RegioS,'PV25')" in u.replace("%27", "'").replace("%28", "(").replace("%29", ")").replace("%2C", ",") for u in seen)

import json

from mijnstraat import cli, publish


def _write_source(root):
    g = root / "lingewaard"
    g.mkdir(parents=True)
    feed = {
        "gemeente": "Lingewaard",
        "stats": {"items": 3, "located": 3},
        "items": [
            {"id": "bm:1", "source": "bekendmakingen", "category": "vergunning", "lat": 51.9, "lon": 5.9},
            {"id": "bm:2", "source": "bekendmakingen", "category": "regels", "lat": None, "lon": None},
            {"id": "politie:1", "source": "politie", "category": "politie", "lat": 51.8, "lon": 5.8},
        ],
    }
    (g / "feed.json").write_text(json.dumps(feed))
    (g / "veiligheid.json").write_text('{"bron": "© Politie, via CBS"}')
    (g / "wijkagenten.json").write_text('{"wijkagenten": [{"naam": "X"}]}')
    return g


def test_prepare_drops_police_api_data(tmp_path):
    _write_source(tmp_path / "src")
    written = publish.prepare(tmp_path / "src", tmp_path / "site")
    out = tmp_path / "site" / "lingewaard"
    feed = json.loads((out / "feed.json").read_text())
    assert [i["id"] for i in feed["items"]] == ["bm:1", "bm:2"]
    assert feed["stats"] == {"items": 2, "located": 1}
    assert (out / "veiligheid.json").exists()
    assert not (out / "wijkagenten.json").exists()
    assert (tmp_path / "site" / ".nojekyll").exists()
    assert len(written) == 2


def test_publish_command(tmp_path, monkeypatch):
    from mijnstraat.config import Config

    _write_source(tmp_path / "public")
    monkeypatch.setattr(cli, "Config", lambda: Config(out_dir=str(tmp_path / "public"), cache_dir=str(tmp_path / "cache")))
    cli.main(["publish", "--dest", str(tmp_path / "site")])
    assert (tmp_path / "site" / "lingewaard" / "feed.json").exists()

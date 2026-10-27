"""Publieke kopie van de feed voor GitHub Pages.

Alleen open data gaat online: bekendmakingen (CC0), misdrijfcijfers per buurt en wonen/economie (CBS).
Wijkagenten en politienieuws komen via api.politie.nl, waarvan de licentie nog onduidelijk is;
die blijven op het thuisnetwerk tot de politie toestemming geeft (keuze van Justin, 2026-10-27).
"""
from __future__ import annotations

import json
from pathlib import Path

PUBLIC_FILES = ("veiligheid.json", "cijfers.json")
PRIVATE_SOURCES = {"politie"}


def public_feed(feed: dict) -> dict:
    items = [i for i in feed.get("items", []) if i.get("source") not in PRIVATE_SOURCES]
    return {
        **feed,
        "stats": {"items": len(items), "located": sum(1 for i in items if i.get("lat") is not None)},
        "items": items,
    }


def prepare(src: Path, dest: Path) -> list[Path]:
    """Schrijf per gemeente de publieke bestanden van src naar dest. Geeft de geschreven bestanden."""
    written: list[Path] = []
    dest.mkdir(parents=True, exist_ok=True)
    (dest / ".nojekyll").write_text("")  # GitHub Pages: bestanden as-is serveren
    for gemeente in sorted(p for p in src.iterdir() if p.is_dir()):
        feed_path = gemeente / "feed.json"
        if not feed_path.exists():
            continue
        out = dest / gemeente.name
        out.mkdir(parents=True, exist_ok=True)
        feed = public_feed(json.loads(feed_path.read_text()))
        (out / "feed.json").write_text(json.dumps(feed, ensure_ascii=False, indent=1))
        written.append(out / "feed.json")
        for name in PUBLIC_FILES:
            if (gemeente / name).exists():
                (out / name).write_text((gemeente / name).read_text())
                written.append(out / name)
    return written

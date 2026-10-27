"""Opdrachtregel: `mijnstraat build` en `mijnstraat compare`."""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import time
from pathlib import Path

import httpx

from . import bekendmakingen, cbs, politie, publish
from .categorize import categorize
from .config import Config
from .geocode import Geocoder, guess_address
from .models import Item
from .summarize import Summarizer


def _client(cfg: Config) -> httpx.Client:
    return httpx.Client(headers={"User-Agent": cfg.user_agent}, timeout=60)


def _slug(name: str) -> str:
    return name.lower().replace(" ", "-")


def _log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


def _load_texts(client: httpx.Client, items: list[Item], cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    for i, item in enumerate(items, 1):
        path = cache / f"{item.id.replace(':', '_')}.txt"
        if path.exists():
            item.text = path.read_text()
            continue
        try:
            item.text = bekendmakingen.fetch_text(client, item)
            path.write_text(item.text)
        except httpx.HTTPError as e:
            _log(f"  tekst mislukt voor {item.id}: {e}")
        if i % 25 == 0:
            _log(f"  teksten: {i}/{len(items)}")
        time.sleep(0.2)  # vriendelijk voor de bron


def _summarize(summarizer: Summarizer, items: list[Item], cache: Path) -> None:
    cache.mkdir(parents=True, exist_ok=True)
    for i, item in enumerate(items, 1):
        path = cache / f"{item.id.replace(':', '_')}.{summarizer.cache_key}.json"
        if path.exists():
            result = json.loads(path.read_text())
        else:
            started = time.monotonic()
            try:
                result = summarizer.summarize(item.title, item.text or item.title)
            except (httpx.HTTPError, ValueError) as e:
                _log(f"  samenvatten mislukt voor {item.id}: {e}")
                continue
            result["seconds"] = round(time.monotonic() - started, 1)
            path.write_text(json.dumps(result, ensure_ascii=False))
            _log(f"  [{i}/{len(items)}] {result['seconds']}s  {item.title[:70]}")
        item.summary = result["summary"]
        if result["category"]:
            item.category = result["category"]
        if result["location"]:
            item.location_hint = item.location_hint or result["location"]


def _geocode(geocoder: Geocoder, items: list[Item]) -> None:
    for item in items:
        if item.lat is not None:
            continue
        for query in (item.location_hint, guess_address(item.title), guess_address(item.text[:3000])):
            hit = geocoder.lookup(query) if query else None
            if hit:
                item.address, item.lat, item.lon = hit
                break
    geocoder.save()


def _politie(client: httpx.Client, cfg: Config, items: list[Item], out: Path) -> list[Item]:
    """Wijkagenten en misdrijfcijfers als losse bestanden; politienieuws als extra feedberichten.

    Een storing bij de politie of het CBS mag de feed met bekendmakingen niet tegenhouden."""
    points = [(i.lat, i.lon) for i in items if i.lat is not None and i.lon is not None]
    center = politie.centroid(points)
    news: list[Item] = []
    if center:
        try:
            _log("Wijkagenten ophalen...")
            agents = politie.fetch_wijkagenten(client, politie.grid(points))
            (out / "wijkagenten.json").write_text(json.dumps({"wijkagenten": agents}, ensure_ascii=False, indent=1))
            _log(f"  {len(agents)} wijkagenten")
        except (httpx.HTTPError, ValueError) as e:
            _log(f"  wijkagenten mislukt: {e}")
        try:
            _log("Politienieuws ophalen...")
            news = politie.fetch_news(client, center, cfg.days)
            _log(f"  {len(news)} berichten")
        except (httpx.HTTPError, ValueError) as e:
            _log(f"  politienieuws mislukt: {e}")
    try:
        _log("Misdrijven per buurt ophalen (CBS)...")
        veiligheid = politie.fetch_veiligheid(client, cfg.gemeente)
        (out / "veiligheid.json").write_text(json.dumps(veiligheid, ensure_ascii=False, indent=1))
        _log(f"  {len(veiligheid['buurten'])} buurten, {len(veiligheid['perioden'])} maanden")
    except (httpx.HTTPError, ValueError, KeyError) as e:
        _log(f"  misdrijfcijfers mislukt: {e}")
    return news


def _cijfers(client: httpx.Client, cfg: Config, out: Path) -> None:
    """Wonen en economie (CBS). Ook hier: een storing houdt de feed niet tegen."""
    try:
        _log("Wonen en economie ophalen (CBS)...")
        cijfers = cbs.fetch_cijfers(client, cfg.gemeente, log=_log)
        (out / "cijfers.json").write_text(json.dumps(cijfers, ensure_ascii=False, indent=1))
        _log(f"  {len(cijfers['wonen']['buurten'])} buurten, jaren {', '.join(cijfers['wonen']['jaren'])}")
    except (httpx.HTTPError, ValueError, KeyError) as e:
        _log(f"  wonen en economie mislukt: {e}")


def build(args: argparse.Namespace, cfg: Config) -> None:
    out = Path(cfg.out_dir) / _slug(cfg.gemeente)
    cache = Path(cfg.cache_dir) / _slug(cfg.gemeente)
    with _client(cfg) as client:
        _log(f"Bekendmakingen ophalen voor {cfg.gemeente}, laatste {cfg.days} dagen...")
        items = bekendmakingen.fetch(client, cfg.gemeente, cfg.days, limit=args.limit)
        _log(f"  {len(items)} gevonden")
        for item in items:
            item.category = categorize(item.title, item.subjects)
            item.location_hint = item.location_hint or guess_address(item.title)
        _load_texts(client, items, cache / "text")
        if not args.no_llm:
            _log(f"Samenvatten met {cfg.model}...")
            _summarize(Summarizer(client, cfg.ollama_url, args.model or cfg.model), items, cache / "summaries")
        _log("Geocoderen via PDOK...")
        _geocode(Geocoder(client, cfg.gemeente, cache / "geocode.json"), items)
        out.mkdir(parents=True, exist_ok=True)
        if not args.no_politie:
            items += _politie(client, cfg, items, out)
        if not args.no_cijfers:
            _cijfers(client, cfg, out)

    items.sort(key=lambda i: i.published, reverse=True)
    located = sum(1 for i in items if i.lat is not None)
    feed = {
        "gemeente": cfg.gemeente,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "model": None if args.no_llm else (args.model or cfg.model),
        "stats": {"items": len(items), "located": located},
        "items": [i.to_public() for i in items],
    }
    (out / "feed.json").write_text(json.dumps(feed, ensure_ascii=False, indent=1))
    _log(f"Klaar: {len(items)} berichten, {located} met locatie -> {out / 'feed.json'}")


def compare(args: argparse.Namespace, cfg: Config) -> None:
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    cache = Path(cfg.cache_dir) / _slug(cfg.gemeente)
    with _client(cfg) as client:
        items = bekendmakingen.fetch(client, cfg.gemeente, cfg.days, limit=args.n)
        _load_texts(client, items, cache / "text")
        rows: dict[str, dict[str, Item]] = {}
        for model in models:
            _log(f"Model {model}...")
            copies = [Item(**{**i.__dict__}) for i in items]
            _summarize(Summarizer(client, cfg.ollama_url, model), copies, cache / "summaries")
            rows[model] = {c.id: c for c in copies}

    lines = [f"# Modelvergelijking {cfg.gemeente}", "", f"{len(items)} bekendmakingen, modellen: {', '.join(models)}", ""]
    for item in items:
        lines += [f"## {item.title}", "", f"[bron]({item.url}) · {item.published}", ""]
        for model in models:
            c = rows[model][item.id]
            lines.append(f"- **{model}** ({c.category}): {c.summary or '_mislukt_'}")
        lines.append("")
    path = Path(cfg.cache_dir).parent / f"vergelijking-{_slug(cfg.gemeente)}.md"
    path.write_text("\n".join(lines))
    _log(f"Vergelijking geschreven naar {path}")


def publish_cmd(args: argparse.Namespace, cfg: Config) -> None:
    written = publish.prepare(Path(cfg.out_dir), Path(args.dest))
    _log(f"Publieke kopie: {len(written)} bestanden -> {args.dest} (zonder politie-API)")


def main(argv: list[str] | None = None) -> None:
    cfg = Config()
    parser = argparse.ArgumentParser(prog="mijnstraat")
    sub = parser.add_subparsers(dest="cmd", required=True)

    b = sub.add_parser("build", help="Haal bronnen op en schrijf feed.json")
    b.add_argument("--limit", type=int, default=None, help="Maximaal aantal bekendmakingen")
    b.add_argument("--model", default=None, help=f"Ollama-model (standaard {cfg.model})")
    b.add_argument("--no-llm", action="store_true", help="Sla samenvatten over")
    b.add_argument("--no-politie", action="store_true", help="Sla wijkagenten, politienieuws en misdrijfcijfers over")
    b.add_argument("--no-cijfers", action="store_true", help="Sla wonen en economie (CBS) over")
    b.set_defaults(func=build)

    c = sub.add_parser("compare", help="Vergelijk samenvattingen van meerdere modellen")
    c.add_argument("--models", default="gemma3:12b,qwen3:8b,qwen3:30b-a3b")
    c.add_argument("--n", type=int, default=20)
    c.set_defaults(func=compare)

    p = sub.add_parser("publish", help="Maak de publieke kopie voor GitHub Pages (zonder politie-API)")
    p.add_argument("--dest", required=True, help="Doelmap")
    p.set_defaults(func=publish_cmd)

    args = parser.parse_args(argv)
    args.func(args, cfg)


if __name__ == "__main__":
    main()

# Mijn Straat

Wat gebeurt er in jouw straat? Mijn Straat bundelt open overheidsdata per adres: vergunningen, verkeersbesluiten, evenementen en besluiten van de gemeente. Elk bericht staat in gewone taal, samengevat door een taalmodel dat lokaal draait.

Dit is een proof of concept voor de gemeente **Lingewaard**. Alles draait op je eigen Mac, zonder cloudkosten en zonder dat de gemeente hoeft mee te doen.

```
officiële bekendmakingen (SRU, CC0) ──┐
                                      ├─► pipeline (Python) ─► Ollama (lokaal model) ─► data/public/lingewaard/feed.json
PDOK Locatieserver / BAG (CC0)  ──────┘                                                         │
                                                                                                 ▼
                                                                  app (Expo, iOS + Android) haalt feed.json op
                                                                  en rekent afstanden uit op het toestel
```

Het adres van de gebruiker blijft op de telefoon. De app haalt de hele gemeentefeed op en filtert zelf op afstand.

## Vereisten

- macOS met Python 3.11 of nieuwer en Node 20 of nieuwer
- [Ollama](https://ollama.com) met minstens één model, bijvoorbeeld `ollama pull qwen3:30b-a3b`
- Expo Go op je telefoon, op hetzelfde wifi-netwerk als je Mac

## 1. Pijplijn

```bash
cd pipeline
python3.12 -m venv .venv.nosync && ln -s .venv.nosync .venv   # macOS-systeem-Python is 3.9: brew install python@3.12
source .venv/bin/activate
pip install -e '.[dev]'
pytest                                  # 20 tests, zonder netwerk

mijnstraat build --no-llm --limit 20    # snelle rooktest: ophalen + geocoderen
mijnstraat build                        # volledige run, laatste 90 dagen, met samenvattingen
```

Waarom `.venv.nosync`: als `~/Documents` via iCloud synchroniseert, zet macOS de `hidden`-vlag op bestanden in `.venv`. Python 3.12+ slaat verborgen `.pth`-bestanden over, waardoor `mijnstraat` faalt met `ModuleNotFoundError: No module named 'mijnstraat'`. `chflags nohidden` helpt maar even, want de vlag komt terug. iCloud slaat mappen die op `.nosync` eindigen over.

Instellingen via omgevingsvariabelen:

| Variabele | Standaard | Betekenis |
| --- | --- | --- |
| `MIJNSTRAAT_GEMEENTE` | `Lingewaard` | Naam zoals in `dt.creator` van de bekendmakingen |
| `MIJNSTRAAT_DAYS` | `90` | Hoe ver terug |
| `MIJNSTRAAT_MODEL` | `qwen3:30b-a3b` | Ollama-model |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama-adres |

Samenvattingen, teksten en geocodes worden gecachet in `data/cache/`. Een nachtelijke run doet dus alleen nieuwe stukken.

### Modellen vergelijken

```bash
ollama pull gemma3:27b && ollama pull mistral-small3.2:24b
mijnstraat compare --n 20 --models qwen3:30b-a3b,gemma3:27b,mistral-small3.2:24b
open ../data/vergelijking-lingewaard.md
```

## 2. Feed serveren

```bash
./scripts/serve.sh
```

Dit print de URL van de feed op je lokale netwerk. Zet die in `app/.env`:

```
EXPO_PUBLIC_FEED_URL=http://192.168.x.x:8787/lingewaard/feed.json
```

## 3. App

```bash
cd app
npm install
npx expo start
```

Scan de QR-code met Expo Go. Zonder `EXPO_PUBLIC_FEED_URL` toont de app duidelijk gemarkeerde voorbeelddata.

## 4. Elke nacht verversen

Pas het pad aan in `scripts/nl.jumpstartmedia.mijnstraat.plist`. Daarna:

```bash
cp scripts/nl.jumpstartmedia.mijnstraat.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/nl.jumpstartmedia.mijnstraat.plist
```

## Nog te verifiëren bij de eerste echte run

- De CQL-velden van de SRU-zoekservice (`dt.creator`, `dt.available`). Komen er 0 resultaten terug, controleer dan de [SRU-handleiding](https://data.overheid.nl/dataset/officiele-bekendmakingen).
- Welke locatie-metadata bekendmakingen van Lingewaard echt meesturen. De parser zoekt naar postcode/huisnummer en coördinaten, en valt anders terug op het adres uit de titel of tekst.

## Bronnen en licenties

- Officiële bekendmakingen (KOOP), CC0
- BAG via PDOK Locatieserver (Kadaster), CC0

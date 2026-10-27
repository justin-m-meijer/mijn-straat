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
- [Ollama](https://ollama.com) met minstens één model, bijvoorbeeld `ollama pull gemma3:12b` (8 GB, standaard)
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

Zet de repo bij voorkeur in een map buiten iCloud, bijvoorbeeld `~/code/mijn-straat`. In een iCloud-map (`~/Documents`, `~/Desktop`) maakt iCloud bij branchwissels conflictkopieën zoals `FeedScreen 2.tsx`. Daarbuiten is een gewone `.venv` genoeg.

Waarom `.venv.nosync` als de repo toch in iCloud staat: als `~/Documents` via iCloud synchroniseert, zet macOS de `hidden`-vlag op bestanden in `.venv`. Python 3.12+ slaat verborgen `.pth`-bestanden over, waardoor `mijnstraat` faalt met `ModuleNotFoundError: No module named 'mijnstraat'`. `chflags nohidden` helpt maar even, want de vlag komt terug. iCloud slaat mappen die op `.nosync` eindigen over.

Instellingen via omgevingsvariabelen:

| Variabele | Standaard | Betekenis |
| --- | --- | --- |
| `MIJNSTRAAT_GEMEENTE` | `Lingewaard` | Naam zoals in `dt.creator` van de bekendmakingen |
| `MIJNSTRAAT_DAYS` | `90` | Hoe ver terug |
| `MIJNSTRAAT_MODEL` | `gemma3:12b` | Ollama-model |
| `OLLAMA_URL` | `http://localhost:11434` | Ollama-adres |

Samenvattingen, teksten en geocodes worden gecachet in `data/cache/`. Een nachtelijke run doet dus alleen nieuwe stukken.

### Modellen vergelijken

```bash
ollama pull qwen3:8b && ollama pull qwen3:30b-a3b
mijnstraat compare --n 20 --models gemma3:12b,qwen3:8b,qwen3:30b-a3b
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

`scripts/install-nightly.sh` zet een launchd-job klaar die `scripts/nightly.sh` elke nacht om 03:00 draait, met het pad van deze map erin:

```bash
scripts/install-nightly.sh                # installeren of bijwerken
launchctl kickstart gui/$(id -u)/nl.jumpstartmedia.mijnstraat   # nu één keer draaien
scripts/install-nightly.sh --uninstall    # weer verwijderen
```

Elke run schrijft naar `data/nightly.log` (met tijdstempel per run). Draait Ollama niet, dan start de run hem zelf. De Mac moet om 03:00 wakker zijn; slaapt hij, dan draait launchd de job pas bij het ontwaken.

## 5. Online zetten (GitHub Pages)

`scripts/publish.sh` maakt een publieke kopie van `data/public` en zet die als één verse commit op de branch `gh-pages`:

```bash
scripts/publish.sh                        # handmatig publiceren
scripts/install-nightly.sh --publish      # nachtjob die na elke run ook publiceert
```

De feed staat dan op `https://justin-m-meijer.github.io/mijn-straat/lingewaard/feed.json`. Alleen open data gaat online: bekendmakingen en CBS-cijfers. Wijkagenten en politienieuws (api.politie.nl, licentie onduidelijk) blijven op je thuisnetwerk.

In `app/.env` kun je meerdere feeds opgeven, gescheiden door komma's. De app probeert ze op volgorde, dus thuis de volledige feed van je Mac en onderweg de online feed:

```
EXPO_PUBLIC_FEED_URL=http://192.168.x.x:8787/lingewaard/feed.json,https://justin-m-meijer.github.io/mijn-straat/lingewaard/feed.json
```

## Nog te verifiëren bij de eerste echte run

- De CQL-velden van de SRU-zoekservice (`dt.creator`, `dt.available`). Komen er 0 resultaten terug, controleer dan de [SRU-handleiding](https://data.overheid.nl/dataset/officiele-bekendmakingen).
- Welke locatie-metadata bekendmakingen van Lingewaard echt meesturen. De parser zoekt naar postcode/huisnummer en coördinaten, en valt anders terug op het adres uit de titel of tekst.

## Bronnen en licenties

- Officiële bekendmakingen (KOOP), CC0
- BAG via PDOK Locatieserver (Kadaster), CC0
- Misdrijven per buurt: © Politie, via CBS (tabel 47022NED)
- Wonen en economie: CBS, CC BY 4.0. Kerncijfers wijken en buurten 2022–2025 (85318NED, 85618NED, 85984NED, 86165NED), verkoopprijzen per gemeente (83625NED), prijsindex per provincie (85792NED), uitkeringen per gemeente per maand (80794ned) en bedrijfsvestigingen (81575NED). Buurtgrenzen zijn in 2022 herzien, dus buurtreeksen beginnen in 2022. Een werkloosheidspercentage per gemeente publiceert het CBS niet.

#!/usr/bin/env bash
# Nachtelijke run: nieuwe bekendmakingen ophalen en samenvatten. Eerder samengevatte stukken komen uit de cache.
# Gemaakt voor launchd (zie install-nightly.sh): eigen PATH, eigen map, log in data/nightly.log, exitcode ≠ 0 bij een fout.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/data/nightly.log"
mkdir -p "$ROOT/data"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Ollama moet draaien voor de samenvattingen. Draait hij niet, dan starten we hem voor deze run.
OLLAMA_PID=""
if ! ollama list >/dev/null 2>&1; then
  log "Ollama draait niet; ollama serve gestart voor deze run"
  ollama serve >> "$ROOT/data/ollama.log" 2>&1 &
  OLLAMA_PID=$!
  for _ in $(seq 30); do ollama list >/dev/null 2>&1 && break; sleep 1; done
  ollama list >/dev/null 2>&1 || log "Ollama start niet; samenvatten zal mislukken"
fi
trap '[ -n "$OLLAMA_PID" ] && kill "$OLLAMA_PID" 2>/dev/null || true' EXIT

log "Start nachtelijke run"
cd "$ROOT/pipeline"
status=0
.venv/bin/mijnstraat build "$@" >> "$LOG" 2>&1 || status=$?
if [ "$status" -eq 0 ]; then
  log "Klaar"
  # Alleen als de job met --publish is geïnstalleerd: publieke kopie naar GitHub Pages.
  if [ "${MIJNSTRAAT_PUBLISH:-0}" = "1" ]; then
    if "$ROOT/scripts/publish.sh" >> "$LOG" 2>&1; then log "Gepubliceerd"; else status=$?; log "Publiceren mislukt (exitcode $status)"; fi
  fi
else
  log "Mislukt (exitcode $status)"
fi
exit "$status"

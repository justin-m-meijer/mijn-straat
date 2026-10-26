#!/usr/bin/env bash
# Serveer data/public op je lokale netwerk zodat de app op je telefoon de feed kan laden.
set -euo pipefail
cd "$(dirname "$0")/../data/public"
PORT="${PORT:-8787}"
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo localhost)"
echo "Feed: http://$IP:$PORT/lingewaard/feed.json"
echo "Zet in app/.env:  EXPO_PUBLIC_FEED_URL=http://$IP:$PORT/lingewaard/feed.json"
exec python3 -m http.server "$PORT" --bind 0.0.0.0

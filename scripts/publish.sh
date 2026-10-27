#!/usr/bin/env bash
# Zet de publieke kopie van de feed op GitHub Pages (branch gh-pages van origin).
# Alleen open data: bekendmakingen en CBS-cijfers. Wijkagenten en politienieuws blijven thuis.
# Elke run maakt één verse commit en overschrijft gh-pages, zodat de branch niet groeit.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE="$(git -C "$ROOT" remote get-url origin)"
SITE="$(mktemp -d)"
trap 'rm -rf "$SITE"' EXIT

(cd "$ROOT/pipeline" && .venv/bin/mijnstraat publish --dest "$SITE")

cd "$SITE"
git init -q -b gh-pages
git add -A
git -c user.name="Mijn Straat" -c user.email="noreply@jumpstartmedia.nl" commit -q -m "Feed $(date '+%Y-%m-%d %H:%M')"
git push -q --force "$REMOTE" gh-pages
echo "Gepubliceerd naar gh-pages van $REMOTE"

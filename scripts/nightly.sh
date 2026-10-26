#!/usr/bin/env bash
# Nachtelijke run: nieuwe bekendmakingen ophalen en samenvatten. Eerder samengevatte stukken komen uit de cache.
set -euo pipefail
cd "$(dirname "$0")/../pipeline"
source .venv/bin/activate
mijnstraat build "$@" 2>&1 | tee -a ../data/nightly.log

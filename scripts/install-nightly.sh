#!/usr/bin/env bash
# Installeer (of verwijder met --uninstall) de launchd-job die nightly.sh elke nacht om 03:00 draait.
# Met --publish zet de job na elke geslaagde run de publieke feed op GitHub Pages (scripts/publish.sh).
set -euo pipefail

LABEL="nl.jumpstartmedia.mijnstraat"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Een eerder geladen versie eerst uitladen; dat mag mislukken als hij er niet is.
launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$PLIST"
  echo "Verwijderd: $LABEL"
  exit 0
fi

PUBLISH=0
[ "${1:-}" = "--publish" ] && PUBLISH=1

chmod +x "$ROOT/scripts/nightly.sh" "$ROOT/scripts/publish.sh"
mkdir -p "$ROOT/data" "$(dirname "$PLIST")"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$ROOT/scripts/nightly.sh</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>EnvironmentVariables</key>
  <dict><key>MIJNSTRAAT_PUBLISH</key><string>$PUBLISH</string></dict>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>3</integer><key>Minute</key><integer>0</integer></dict>
  <key>StandardOutPath</key><string>$ROOT/data/nightly.out.log</string>
  <key>StandardErrorPath</key><string>$ROOT/data/nightly.err.log</string>
</dict>
</plist>
EOF
plutil -lint "$PLIST" >/dev/null
launchctl bootstrap "$DOMAIN" "$PLIST"
echo "Geïnstalleerd: $PLIST (elke nacht om 03:00$([ "$PUBLISH" = 1 ] && echo ', daarna publiceren naar GitHub Pages'))"
echo "Nu één keer draaien: launchctl kickstart $DOMAIN/$LABEL"

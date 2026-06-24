#!/bin/bash
set -euo pipefail

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Append URL to Daily
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🔗
# @raycast.packageName Obsidian Lab

# Documentation:
# @raycast.author tkoyasak
# @raycast.authorURL https://raycast.com/tkoyasak

# Grab the URL of the active tab from the frontmost Chromium-based browser
# (Arc, Chrome, Brave, Edge, ...). The front app name is dynamic, so
# `using terms from` pins the Chromium scripting dictionary at compile time;
# Arc shares it with Chrome/Brave/Edge. Bails out if the front app has no
# `active tab of front window` (e.g. Safari or a non-browser app).
url=$(osascript <<'EOF' 2>/dev/null || true
tell application "System Events" to set frontApp to name of first application process whose frontmost is true
using terms from application "Arc"
  tell application frontApp to get URL of active tab of front window
end using terms from
EOF
)

if [ -z "$url" ]; then
  echo "frontmost app is not a Chromium-based browser"
  exit 1
fi

# The "Append fleeting to daily" choice resolves the URL into [title](url).
result=$(obsidian vault=vault quickadd choice="Append fleeting to daily" input="$url")

if ! echo "$result" | jq -e '.ok' > /dev/null 2>&1; then
  echo "$result"
fi

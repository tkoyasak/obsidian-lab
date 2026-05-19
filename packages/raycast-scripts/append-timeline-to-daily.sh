#!/bin/bash
set -euo pipefail

# Required parameters:
# @raycast.schemaVersion 1
# @raycast.title Append Timeline to Daily
# @raycast.mode silent

# Optional parameters:
# @raycast.icon 🌏
# @raycast.packageName Obsidian Lab
# @raycast.argument1 { "type": "text", "placeholder": "What's happening?" }

# Documentation:
# @raycast.author tkoyasak
# @raycast.authorURL https://raycast.com/tkoyasak

result=$(obsidian vault=vault quickadd choice="Append timeline to daily" input="$1")

if ! echo "$result" | jq -e '.ok' > /dev/null 2>&1; then
  echo "$result"
fi

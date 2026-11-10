#!/usr/bin/env bash
# Start NEXRON Flow for local / Try Live use.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -d node_modules ]]; then
  npm install
fi

# 0.0.0.0 so loopback and any desktop browser on this VM can connect.
# Default Vite port 5173.
exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort

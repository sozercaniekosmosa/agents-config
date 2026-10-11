#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Starting Local Confluence UI..."
node --env-file=.env scripts/serve_ui.cjs &
SERVER_PID=$!
sleep 1
if command -v xdg-open > /dev/null; then
  xdg-open http://localhost:8080
elif command -v open > /dev/null; then
  open http://localhost:8080
fi
echo "UI started at http://localhost:8080 (PID: $SERVER_PID)"
wait $SERVER_PID

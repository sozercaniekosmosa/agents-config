@echo off
cd /d "%~dp0"
echo Starting Local Confluence UI...
start /b node scripts/serve_ui.cjs
ping 127.0.0.1 -n 2 > nul
start "" "http://localhost:8080"
echo UI started at http://localhost:8080
echo Close this window to stop the server.
pause > nul

@echo off
cd /d "%~dp0"
node sync.cjs pull %*

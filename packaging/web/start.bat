@echo off
setlocal
cd /d "%~dp0"
echo.
echo   Lumo Task - local web server
echo   -----------------------------
echo   Starting... your browser will open at http://localhost:47291
echo   (first run takes a few seconds while it sets up).
echo.
echo   To let others on your Wi-Fi use it, share the LAN address the server
echo   prints below. To keep it to THIS computer only, set LUMO_HOST=127.0.0.1.
echo.
rem Open the default browser a few seconds after the server begins listening.
start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:47291'"
rem Boot the server (generates per-install secrets on first run, then serves).
node.exe launcher.mjs
echo.
echo   Server stopped. Press any key to close this window.
pause >nul

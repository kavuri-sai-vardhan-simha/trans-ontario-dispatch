@echo off
REM Trans Ontario Live Dispatch - prototype. Needs Python 3.10+ (python.org) and internet for the map.
cd /d "%~dp0backend"
python -m pip install -q -r requirements.txt
set IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do if not defined IP set IP=%%a
set IP=%IP: =%
echo.
echo   On this laptop:
echo     Dispatcher : http://localhost:8000/dispatch
echo     Elite desk : http://localhost:8000/elite   (stand-in for Elite order entry)
echo     Driver     : http://localhost:8000/driver
echo   On a phone on the same Wi-Fi:
echo     Driver     : http://%IP%:8000/driver
echo     Audience   : http://%IP%:8000/book   (or press "Audience QR" on the dispatcher)
if exist "%~dp0cloudflared.exe" echo   Public link for the audience QR: starting automatically (cloudflared.exe found).
echo   (If Windows asks about the firewall, allow Private networks.)
echo.
start "" http://localhost:8000/dispatch
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

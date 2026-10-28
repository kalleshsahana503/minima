@echo off
rem Stops only Minima's own server, not other Python programs.
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*backend.server:app*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo.
echo   Minima's agent server was stopped.
echo.
pause

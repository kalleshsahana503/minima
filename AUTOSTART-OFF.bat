@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Navi.lnk" 2>nul
echo.
echo   Minima will no longer start automatically with Windows.
echo   Run STOP-NAVI.bat to stop the copy that is running right now.
echo.
pause

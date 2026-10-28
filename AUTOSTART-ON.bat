@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv\.navi-installed" (
  echo   Run START-HERE.bat once first, so Minima is installed and your Groq key is saved.
  pause
  exit /b 1
)
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:APPDATA+'\Microsoft\Windows\Start Menu\Programs\Startup\Navi.lnk'); $s.TargetPath='%~dp0start-navi-hidden.vbs'; $s.WorkingDirectory='%~dp0'; $s.Save()"
if errorlevel 1 (
  echo   Could not create the startup shortcut.
  pause
  exit /b 1
)
echo.
echo   Done. Minima's agent now starts quietly in the background every time you sign in to Windows.
echo   To start it right now without restarting, double-click start-navi-hidden.vbs.
echo   To turn this off later, run AUTOSTART-OFF.bat.
echo.
pause

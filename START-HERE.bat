@echo off
setlocal
cd /d "%~dp0"
title Minima agent server
echo.
echo   Minima - starting the agent server
echo   ---------------------------------

rem ---- 1. find Python ----
set "PY="
where py >nul 2>nul && set "PY=py -3"
if not defined PY where python >nul 2>nul && set "PY=python"
if not defined PY (
  echo.
  echo   Python 3.10 or newer was not found on this computer.
  echo   Install it from https://www.python.org/downloads/
  echo   and TICK "Add python.exe to PATH" in the installer, then run this file again.
  echo.
  pause
  exit /b 1
)

rem ---- 2. private Python environment, created once next to this file ----
if not exist ".venv\Scripts\python.exe" (
  echo   Creating a private Python environment - first run only...
  %PY% -m venv .venv
  if errorlevel 1 (
    echo   Could not create the environment.
    pause
    exit /b 1
  )
)

rem ---- 3. packages, installed once ----
if not exist ".venv\.navi-installed2" (
  echo   Installing packages. This takes a few minutes the first time...
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul 2>nul
  ".venv\Scripts\python.exe" -m pip install -r backend\requirements.txt
  if errorlevel 1 (
    echo.
    echo   The install failed. Check your internet connection and run this file again.
    pause
    exit /b 1
  )
  echo done> ".venv\.navi-installed2"
)

rem ---- 4. Groq key (checked by a small Python script, which is more reliable than findstr) ----
if not exist "backend\.env" copy "backend\.env.example" "backend\.env" >nul
".venv\Scripts\python.exe" backend\check_key.py >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Your Groq key is not set yet.
  echo   Notepad is opening. Replace the text after GROQ_API_KEY= with your key from
  echo   https://console.groq.com/keys
  echo   then press Ctrl+S to save and close Notepad.
  echo.
  notepad "backend\.env"
  echo   When you have saved the file and closed Notepad, press any key here.
  pause >nul
  ".venv\Scripts\python.exe" backend\check_key.py
  if errorlevel 1 (
    echo.
    echo   Fix the key line as described above, then run this file again.
    pause
    exit /b 1
  )
)

rem ---- 5. run ----
echo.
echo   Minima is running at http://127.0.0.1:8000
echo   Keep this window open while you use Minima. Close it or press Ctrl+C to stop.
echo.
".venv\Scripts\python.exe" -m uvicorn backend.server:app --host 127.0.0.1 --port 8000
echo.
echo   Minima stopped.
pause

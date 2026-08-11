@echo off
cd /d "%~dp0"

set "NODE=C:\Users\zhudengshan\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not exist "%NODE%" (
  where node >nul 2>&1
  if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js LTS and check "Add to PATH".
    pause
    exit /b 1
  )
  set "NODE=node"
)

echo ========================================
echo  THIRD3 local server starting...
echo  After it shows "started", open in browser:
echo  http://localhost:8777
echo  Keep this window open. Close it to stop.
echo ========================================
echo.

"%NODE%" "%~dp0server.js"

echo.
echo Server stopped. Press any key to close.
pause >nul

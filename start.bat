@echo off
chcp 65001 >nul 2>&1
cd /d "%~dp0"

REM 优先用 WorkBuddy 自带的 node 绝对路径（你电脑上确定有，且不需要 node 在 PATH 里）
set "NODE=C:\Users\zhudengshan\.workbuddy\binaries\node\versions\22.22.2\node.exe"
if not exist "%NODE%" (
  REM 没有就用系统 PATH 里的 node（朋友下载后若装了 Node 会走这里）
  where node >nul 2>&1
  if errorlevel 1 (
    echo 错误：找不到 Node.js 运行环境。
    echo 请先安装 Node.js：https://nodejs.org （选 LTS 版，安装时勾选 “Add to PATH”）
    pause
    exit /b 1
  )
  set "NODE=node"
)

echo ================================================
echo   THIRD3 本地启动器
echo ================================================
echo.
echo   正在后台启动本地服务器...
echo   （会弹出一个小黑窗口，那就是服务器）
echo.

REM 后台最小化启动服务器，并把日志写入 server.log 方便排查
start "" /MIN "%NODE%" "%~dp0server.js" > "%~dp0server.log" 2>&1

echo   等待服务器就绪（约 3 秒）...
ping -n 4 127.0.0.1 >nul 2>&1

echo   打开浏览器...
start "" "http://localhost:8777"

echo.
echo   完成！浏览器应已打开本应用。
echo   不用时：关闭那个小黑窗口（或本窗口）即可停止服务器。
echo   （万一打不开，请看同目录 server.log 里的报错）
timeout /t 5 /nobreak >nul 2>&1
exit

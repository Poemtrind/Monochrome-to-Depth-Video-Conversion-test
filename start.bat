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

echo ========================================
echo  THIRD3 本地服务器启动中...
echo  启动后浏览器会自动打开 http://localhost:8777
echo  本窗口请保持打开；关闭它即可停止服务器
echo ========================================
echo.

REM 前台直接运行 node（窗口保持打开，出错也能看到）；server.js 会在就绪后自动打开浏览器
"%NODE%" "%~dp0server.js"

echo.
echo 服务器已停止。按任意键关闭本窗口。
pause >nul

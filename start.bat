@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未检测到 Node.js，请先安装：https://nodejs.org 然后重试。
  pause
  exit /b
)
if not exist node_modules (
  echo 首次运行，正在安装依赖，请稍候...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo 依赖安装失败，请检查网络后重试。
    pause
    exit /b
  )
)
echo 启动服务，请稍候...

rem 若服务已在运行，直接打开浏览器
powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing http://localhost:3210/api/health -TimeoutSec 2 | Out-Null; exit 0}catch{exit 1}" >nul 2>nul
if not errorlevel 1 goto open

rem 后台启动服务，日志写入 server.log
if exist server.log del server.log
start /b "" cmd /c "node server.js > server.log 2>&1"

rem 等待端口就绪（最多等 20 秒）
for /L %%i in (1,1,20) do (
  powershell -NoProfile -Command "try{Invoke-WebRequest -UseBasicParsing http://localhost:3210/api/health -TimeoutSec 1 | Out-Null; exit 0}catch{exit 1}" >nul 2>nul
  if not errorlevel 1 goto open
  timeout /t 1 /nobreak >nul
)

echo.
echo 服务启动超时，以下为启动日志：
type server.log
echo.
echo 若提示端口被占用，请先结束占用 3210 端口的进程后重试。
pause
exit /b

:open
echo.
echo 服务已就绪，正在打开浏览器...
start "" "http://localhost:3210"
echo 如需停止服务：任务管理器中结束 node.exe 进程即可。
pause

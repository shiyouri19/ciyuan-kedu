@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem 优先使用随包携带的 node.exe，其次用系统 PATH 中的 node
if exist "%~dp0node.exe" (
  set "NODE=%~dp0node.exe"
) else (
  set "NODE=node"
)

"%NODE%" --version >nul 2>&1
if errorlevel 1 (
  echo [错误] 未找到 Node.js。
  echo 请安装 Node.js 22 或以上版本，或把 node.exe 放在本目录下。
  pause
  exit /b 1
)

echo 正在启动次元刻度…
echo 服务就绪后会自动打开浏览器；若没有自动打开，请手动访问 http://127.0.0.1:7345
echo.
"%NODE%" --disable-warning=ExperimentalWarning server\index.js --open

pause

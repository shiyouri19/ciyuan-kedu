@chcp 65001 >nul
@echo off
title 次元刻度 · 个人动画观看账本
cd /d "%~dp0"

set "NODE=node"
where node >nul 2>&1
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" set "NODE=%ProgramFiles%\nodejs\node.exe"
)
if "%NODE%"=="node" (
  where node >nul 2>&1
  if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE=%LOCALAPPDATA%\Programs\nodejs\node.exe"
  )
)
if "%NODE%"=="node" (
  where node >nul 2>&1
  if errorlevel 1 (
    if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
  )
)

echo 正在启动次元刻度，服务就绪后将自动打开浏览器 (http://127.0.0.1:7345)...
echo.
"%NODE%" --disable-warning=ExperimentalWarning "%~dp0server\index.js" --open
if errorlevel 1 (
  echo.
  echo [提示] 检测到当前 Node.js 版本可能需要显式开启 --experimental-sqlite 标志，正在重试...
  "%NODE%" --disable-warning=ExperimentalWarning --experimental-sqlite "%~dp0server\index.js" --open
)

pause

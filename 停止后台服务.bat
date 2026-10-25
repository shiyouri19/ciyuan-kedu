@chcp 65001 >nul
@echo off
title 停止次元刻度后台服务
echo 正在通知次元刻度后台服务安全保存并退出...
curl.exe -s -X POST "http://127.0.0.1:7345/api/shutdown" >nul 2>&1
if not errorlevel 1 (
  echo [完成] 次元刻度后台服务已安全退出。
) else (
  echo [提示] 当前未检测到正在运行的次元刻度后台服务（端口 7345）。
)
timeout /t 2 >nul

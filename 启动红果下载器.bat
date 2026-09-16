@echo off
title 红果短剧下载器 - 启动器
cd /d "%~dp0"

REM 优先运行免安装版；若不存在则提示安装
if exist "dist\win-unpacked\红果短剧下载器.exe" (
    echo 正在启动红果短剧下载器（绿色版）...
    start "" "dist\win-unpacked\红果短剧下载器.exe"
    exit /b
)

if exist "dist\红果短剧下载器-Setup-1.0.0.exe" (
    echo 未找到绿色版，将打开安装包，请安装后使用。
    start "" "dist\红果短剧下载器-Setup-1.0.0.exe"
    exit /b
)

echo 未找到可执行文件，请先运行 npm run build 打包。
pause

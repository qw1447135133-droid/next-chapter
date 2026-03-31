@echo off
echo ========================================
echo 强制清理并重新构建
echo ========================================

echo.
echo [1/5] 停止所有 Node 和 Electron 进程...
taskkill /F /IM node.exe 2>nul
taskkill /F /IM electron.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo [2/5] 清理 Vite 缓存...
if exist "node_modules\.vite" (
    rmdir /S /Q "node_modules\.vite"
    echo Vite 缓存已清理
) else (
    echo Vite 缓存不存在，跳过
)

echo.
echo [3/5] 清理 dist 目录...
if exist "dist" (
    rmdir /S /Q "dist"
    echo dist 目录已清理
) else (
    echo dist 目录不存在，跳过
)

echo.
echo [4/5] 清理 Electron 构建缓存...
if exist "dist-electron" (
    rmdir /S /Q "dist-electron"
    echo dist-electron 目录已清理
) else (
    echo dist-electron 目录不存在，跳过
)

echo.
echo [5/5] 启动开发服务器...
echo.
echo ========================================
echo 清理完成！正在启动...
echo ========================================
echo.

npm run electron:dev

@echo off
echo ========================================
echo Next Chapter 闪退诊断工具
echo ========================================
echo.

echo [1/5] 检查 Node.js 环境...
node --version
npm --version
echo.

echo [2/5] 检查项目依赖...
if exist node_modules (
    echo ✓ node_modules 存在
) else (
    echo ✗ node_modules 不存在，需要运行 npm install
)
echo.

echo [3/5] 检查崩溃日志...
set CRASH_LOG=%APPDATA%\vite_react_shadcn_ts\crash-log.json
if exist "%CRASH_LOG%" (
    echo ✓ 找到崩溃日志:
    type "%CRASH_LOG%"
) else (
    echo ✗ 未找到崩溃日志
)
echo.

echo [4/5] 检查大图像文件...
powershell -Command "Get-ChildItem -Path 'files\projects' -Recurse -Include *.jpg,*.png -ErrorAction SilentlyContinue | Where-Object {$_.Length -gt 5MB} | Select-Object -First 5 | ForEach-Object {Write-Host \"  $($_.Name) - $([math]::Round($_.Length/1MB,2)) MB\"}"
echo.

echo [5/5] 系统内存信息...
powershell -Command "Get-CimInstance Win32_OperatingSystem | Select-Object @{Name='TotalMemory(GB)';Expression={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}}, @{Name='FreeMemory(GB)';Expression={[math]::Round($_.FreePhysicalMemory/1MB,2)}}"
echo.

echo ========================================
echo 诊断完成
echo ========================================
echo.
echo 建议操作:
echo 1. 如果有大于 5MB 的图像，可能导致内存问题
echo 2. 如果有崩溃日志，查看 reason 和 exitCode
echo 3. 确保系统有足够的可用内存 (建议 4GB+)
echo.
pause

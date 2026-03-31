# 测试图像生成修复
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试 Next Chapter 图像生成修复" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 检查修复的文件
$filesToCheck = @(
    "src\lib\gemini-client.ts",
    "src\lib\image-compress.ts",
    "electron\main.ts"
)

Write-Host "[1] 检查修复的文件..." -ForegroundColor Yellow
foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file 不存在" -ForegroundColor Red
    }
}
Write-Host ""

# 检查是否使用了分块处理
Write-Host "[2] 验证修复代码..." -ForegroundColor Yellow
$geminiClient = Get-Content "src\lib\gemini-client.ts" -Raw
if ($geminiClient -match "chunkSize = 8192") {
    Write-Host "  ✓ 找到分块处理代码 (chunkSize = 8192)" -ForegroundColor Green
} else {
    Write-Host "  ✗ 未找到分块处理代码" -ForegroundColor Red
}

if ($geminiClient -match "reduce\(\s*\(data,\s*byte\)") {
    Write-Host "  ⚠ 警告: 仍然存在 reduce() 方法" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ 已移除危险的 reduce() 方法" -ForegroundColor Green
}
Write-Host ""

# 检查大图像文件
Write-Host "[3] 检查大图像文件..." -ForegroundColor Yellow
$largeImages = Get-ChildItem -Path "files\projects" -Recurse -Include *.jpg,*.png -ErrorAction SilentlyContinue |
    Where-Object {$_.Length -gt 5MB} |
    Select-Object -First 5

if ($largeImages) {
    Write-Host "  ⚠ 发现大图像文件:" -ForegroundColor Yellow
    foreach ($img in $largeImages) {
        $sizeMB = [math]::Round($img.Length/1MB, 2)
        Write-Host "    - $($img.Name): ${sizeMB} MB" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ 未发现超过 5MB 的图像" -ForegroundColor Green
}
Write-Host ""

# 检查崩溃日志
Write-Host "[4] 检查崩溃日志..." -ForegroundColor Yellow
$crashLog = "$env:APPDATA\vite_react_shadcn_ts\crash-log.json"
if (Test-Path $crashLog) {
    Write-Host "  ⚠ 发现崩溃日志:" -ForegroundColor Yellow
    $crashes = Get-Content $crashLog | ConvertFrom-Json
    $recentCrash = $crashes | Select-Object -First 1
    Write-Host "    最近崩溃时间: $($recentCrash.timestamp)" -ForegroundColor Yellow
    Write-Host "    崩溃原因: $($recentCrash.reason)" -ForegroundColor Yellow
    Write-Host "    退出码: $($recentCrash.exitCode)" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ 未发现崩溃日志" -ForegroundColor Green
}
Write-Host ""

# 系统内存
Write-Host "[5] 系统内存状态..." -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$totalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
$freeGB = [math]::Round($os.FreePhysicalMemory/1MB, 2)
$usedGB = $totalGB - $freeGB
$usedPercent = [math]::Round(($usedGB / $totalGB) * 100, 1)

Write-Host "  总内存: ${totalGB} GB" -ForegroundColor Cyan
Write-Host "  已使用: ${usedGB} GB (${usedPercent}%)" -ForegroundColor Cyan
Write-Host "  可用: ${freeGB} GB" -ForegroundColor Cyan

if ($freeGB -lt 2) {
    Write-Host "  ⚠ 警告: 可用内存不足 2GB" -ForegroundColor Yellow
} else {
    Write-Host "  ✓ 可用内存充足" -ForegroundColor Green
}
Write-Host ""

# 总结
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "测试完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "下一步操作:" -ForegroundColor Yellow
Write-Host "1. 运行 'npm run electron:dev' 测试应用" -ForegroundColor White
Write-Host "2. 尝试生成图像，观察是否还会闪退" -ForegroundColor White
Write-Host "3. 如果仍然闪退，请提供崩溃日志内容" -ForegroundColor White
Write-Host ""

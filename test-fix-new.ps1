# 娴嬭瘯鍥惧儚鐢熸垚淇
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "娴嬭瘯 Next Chapter 鍥惧儚鐢熸垚淇" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 妫€鏌ヤ慨澶嶇殑鏂囦欢
$filesToCheck = @(
    "src\lib\gemini-client.ts",
    "src\lib\image-compress.ts",
    "electron\main.ts"
)

Write-Host "[1] 妫€鏌ヤ慨澶嶇殑鏂囦欢..." -ForegroundColor Yellow
foreach ($file in $filesToCheck) {
    if (Test-Path $file) {
        Write-Host "  鉁?$file" -ForegroundColor Green
    } else {
        Write-Host "  鉁?$file 涓嶅瓨鍦? -ForegroundColor Red
    }
}
Write-Host ""

# 妫€鏌ユ槸鍚︿娇鐢ㄤ簡鍒嗗潡澶勭悊
Write-Host "[2] 楠岃瘉淇浠ｇ爜..." -ForegroundColor Yellow
$geminiClient = Get-Content "src\lib\gemini-client.ts" -Raw
if ($geminiClient -match "chunkSize = 8192") {
    Write-Host "  鉁?鎵惧埌鍒嗗潡澶勭悊浠ｇ爜 (chunkSize = 8192)" -ForegroundColor Green
} else {
    Write-Host "  鉁?鏈壘鍒板垎鍧楀鐞嗕唬鐮? -ForegroundColor Red
}

if ($geminiClient -match "reduce\(\s*\(data,\s*byte\)") {
    Write-Host "  鈿?璀﹀憡: 浠嶇劧瀛樺湪 reduce() 鏂规硶" -ForegroundColor Yellow
} else {
    Write-Host "  鉁?宸茬Щ闄ゅ嵄闄╃殑 reduce() 鏂规硶" -ForegroundColor Green
}
Write-Host ""

# 妫€鏌ュぇ鍥惧儚鏂囦欢
Write-Host "[3] 妫€鏌ュぇ鍥惧儚鏂囦欢..." -ForegroundColor Yellow
$largeImages = Get-ChildItem -Path "files\projects" -Recurse -Include *.jpg,*.png -ErrorAction SilentlyContinue |
    Where-Object {$_.Length -gt 5MB} |
    Select-Object -First 5

if ($largeImages) {
    Write-Host "  鈿?鍙戠幇澶у浘鍍忔枃浠?" -ForegroundColor Yellow
    foreach ($img in $largeImages) {
        $sizeMB = [math]::Round($img.Length/1MB, 2)
        Write-Host "    - $($img.Name): ${sizeMB} MB" -ForegroundColor Yellow
    }
} else {
    Write-Host "  鉁?鏈彂鐜拌秴杩?5MB 鐨勫浘鍍? -ForegroundColor Green
}
Write-Host ""

# 妫€鏌ュ穿婧冩棩蹇?Write-Host "[4] 妫€鏌ュ穿婧冩棩蹇?.." -ForegroundColor Yellow
$crashLog = "$env:APPDATA\vite_react_shadcn_ts\crash-log.json"
if (Test-Path $crashLog) {
    Write-Host "  鈿?鍙戠幇宕╂簝鏃ュ織:" -ForegroundColor Yellow
    $crashes = Get-Content $crashLog | ConvertFrom-Json
    $recentCrash = $crashes | Select-Object -First 1
    Write-Host "    鏈€杩戝穿婧冩椂闂? $($recentCrash.timestamp)" -ForegroundColor Yellow
    Write-Host "    宕╂簝鍘熷洜: $($recentCrash.reason)" -ForegroundColor Yellow
    Write-Host "    閫€鍑虹爜: $($recentCrash.exitCode)" -ForegroundColor Yellow
} else {
    Write-Host "  鉁?鏈彂鐜板穿婧冩棩蹇? -ForegroundColor Green
}
Write-Host ""

# 绯荤粺鍐呭瓨
Write-Host "[5] 绯荤粺鍐呭瓨鐘舵€?.." -ForegroundColor Yellow
$os = Get-CimInstance Win32_OperatingSystem
$totalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
$freeGB = [math]::Round($os.FreePhysicalMemory/1MB, 2)
$usedGB = $totalGB - $freeGB
$usedPercent = [math]::Round(($usedGB / $totalGB) * 100, 1)

Write-Host "  鎬诲唴瀛? ${totalGB} GB" -ForegroundColor Cyan
Write-Host "  宸蹭娇鐢? ${usedGB} GB (${usedPercent}%)" -ForegroundColor Cyan
Write-Host "  鍙敤: ${freeGB} GB" -ForegroundColor Cyan

if ($freeGB -lt 2) {
    Write-Host "  鈿?璀﹀憡: 鍙敤鍐呭瓨涓嶈冻 2GB" -ForegroundColor Yellow
} else {
    Write-Host "  鉁?鍙敤鍐呭瓨鍏呰冻" -ForegroundColor Green
}
Write-Host ""

# 鎬荤粨
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "娴嬭瘯瀹屾垚" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "涓嬩竴姝ユ搷浣?" -ForegroundColor Yellow
Write-Host "1. 杩愯 'npm run electron:dev' 娴嬭瘯搴旂敤" -ForegroundColor White
Write-Host "2. 灏濊瘯鐢熸垚鍥惧儚锛岃瀵熸槸鍚﹁繕浼氶棯閫€" -ForegroundColor White
Write-Host "3. 濡傛灉浠嶇劧闂€€锛岃鎻愪緵宕╂簝鏃ュ織鍐呭" -ForegroundColor White
Write-Host ""

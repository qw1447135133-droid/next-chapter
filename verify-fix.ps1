# Test Image Generation Fix
Write-Host "========================================"
Write-Host "Testing Next Chapter Image Fix"
Write-Host "========================================"
Write-Host ""

# Check fixed files
Write-Host "[1] Checking fixed files..."
$files = @("src\lib\gemini-client.ts", "src\lib\workspace-cache-export.ts", "src\lib\upload-base64-to-storage.ts")
foreach ($f in $files) {
    if (Test-Path $f) {
        Write-Host "  OK: $f" -ForegroundColor Green
    } else {
        Write-Host "  MISSING: $f" -ForegroundColor Red
    }
}
Write-Host ""

# Check for chunk processing
Write-Host "[2] Verifying fix..."
$content = Get-Content "src\lib\gemini-client.ts" -Raw -ErrorAction SilentlyContinue
if ($content -match "chunkSize = 8192") {
    Write-Host "  OK: Found chunk processing" -ForegroundColor Green
} else {
    Write-Host "  ERROR: Chunk processing not found" -ForegroundColor Red
}

# Check for dangerous patterns
$dangerous = $false
foreach ($f in $files) {
    if (Test-Path $f) {
        $c = Get-Content $f -Raw
        if ($c -match "for \(const byte of.*\) binary \+= String\.fromCharCode\(byte\)") {
            Write-Host "  WARNING: Dangerous pattern in $f" -ForegroundColor Yellow
            $dangerous = $true
        }
    }
}
if (-not $dangerous) {
    Write-Host "  OK: No dangerous patterns found" -ForegroundColor Green
}
Write-Host ""

# Check large images
Write-Host "[3] Checking large images..."
$large = Get-ChildItem -Path "files\projects" -Recurse -Include *.jpg,*.png -ErrorAction SilentlyContinue | Where-Object {$_.Length -gt 5MB} | Select-Object -First 5
if ($large) {
    Write-Host "  WARNING: Found large images:" -ForegroundColor Yellow
    foreach ($img in $large) {
        $mb = [math]::Round($img.Length/1MB, 2)
        Write-Host "    - $($img.Name): $mb MB"
    }
} else {
    Write-Host "  OK: No large images" -ForegroundColor Green
}
Write-Host ""

# Check crash log
Write-Host "[4] Checking crash log..."
$log = "$env:APPDATA\vite_react_shadcn_ts\crash-log.json"
if (Test-Path $log) {
    Write-Host "  WARNING: Crash log found" -ForegroundColor Yellow
    $crashes = Get-Content $log | ConvertFrom-Json
    $recent = $crashes | Select-Object -First 1
    Write-Host "    Time: $($recent.timestamp)"
    Write-Host "    Reason: $($recent.reason)"
    Write-Host "    Exit code: $($recent.exitCode)"
} else {
    Write-Host "  OK: No crash log" -ForegroundColor Green
}
Write-Host ""

# Memory
Write-Host "[5] System memory..."
$os = Get-CimInstance Win32_OperatingSystem
$totalGB = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
$freeGB = [math]::Round($os.FreePhysicalMemory/1MB, 2)
Write-Host "  Total: $totalGB GB"
Write-Host "  Free: $freeGB GB"
if ($freeGB -lt 2) {
    Write-Host "  WARNING: Low memory" -ForegroundColor Yellow
} else {
    Write-Host "  OK: Sufficient memory" -ForegroundColor Green
}
Write-Host ""

Write-Host "========================================"
Write-Host "Test Complete"
Write-Host "========================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1. Run: npm run electron:dev"
Write-Host "2. Generate an image with gemini-3-pro-image-preview-2k"
Write-Host "3. Check if it still crashes"
Write-Host ""

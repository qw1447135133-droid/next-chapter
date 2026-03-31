param(
  [string]$Source = "build/icon.png",
  [string]$Destination = "build/icon.ico"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot $Source
$destinationPath = Join-Path $repoRoot $Destination
$destinationDir = Split-Path -Parent $destinationPath

if (-not (Test-Path -LiteralPath $sourcePath)) {
  throw "Icon source not found: $sourcePath"
}

if (-not (Test-Path -LiteralPath $destinationDir)) {
  New-Item -ItemType Directory -Path $destinationDir | Out-Null
}

$iconSizes = @(16, 32, 48, 64, 128, 256)

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$canvasSize = [Math]::Max($sourceImage.Width, $sourceImage.Height)

try {
  $squareCanvas = New-Object System.Drawing.Bitmap $canvasSize, $canvasSize
  try {
    $graphics = [System.Drawing.Graphics]::FromImage($squareCanvas)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

      $offsetX = [int](($canvasSize - $sourceImage.Width) / 2)
      $offsetY = [int](($canvasSize - $sourceImage.Height) / 2)
      $graphics.DrawImage($sourceImage, $offsetX, $offsetY, $sourceImage.Width, $sourceImage.Height)
    } finally {
      $graphics.Dispose()
    }

    $frameStreams = New-Object System.Collections.Generic.List[System.IO.MemoryStream]
    try {
      foreach ($iconSize in $iconSizes) {
        $frameBitmap = New-Object System.Drawing.Bitmap $iconSize, $iconSize
        try {
          $frameGraphics = [System.Drawing.Graphics]::FromImage($frameBitmap)
          try {
            $frameGraphics.Clear([System.Drawing.Color]::Transparent)
            $frameGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $frameGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $frameGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $frameGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $frameGraphics.DrawImage($squareCanvas, 0, 0, $iconSize, $iconSize)
          } finally {
            $frameGraphics.Dispose()
          }

          $frameStream = New-Object System.IO.MemoryStream
          $frameBitmap.Save($frameStream, [System.Drawing.Imaging.ImageFormat]::Png)
          $frameStreams.Add($frameStream)
        } finally {
          $frameBitmap.Dispose()
        }
      }

      $fileStream = [System.IO.File]::Create($destinationPath)
      try {
        $writer = New-Object System.IO.BinaryWriter $fileStream
        try {
          $writer.Write([UInt16]0)
          $writer.Write([UInt16]1)
          $writer.Write([UInt16]$frameStreams.Count)

          $dataOffset = 6 + (16 * $frameStreams.Count)
          foreach ($index in 0..($frameStreams.Count - 1)) {
            $size = $iconSizes[$index]
            $stream = $frameStreams[$index]
            $dimensionByte = if ($size -ge 256) { 0 } else { [byte]$size }

            $writer.Write($dimensionByte)
            $writer.Write($dimensionByte)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]32)
            $writer.Write([UInt32]$stream.Length)
            $writer.Write([UInt32]$dataOffset)

            $dataOffset += [int]$stream.Length
          }

          foreach ($stream in $frameStreams) {
            $stream.Position = 0
            $stream.CopyTo($fileStream)
          }
        } finally {
          $writer.Dispose()
        }
      } finally {
        $fileStream.Dispose()
      }
    } finally {
      foreach ($stream in $frameStreams) {
        $stream.Dispose()
      }
    }
  } finally {
    $squareCanvas.Dispose()
  }
} finally {
  $sourceImage.Dispose()
}

Write-Output "Generated square Windows icon: $destinationPath"

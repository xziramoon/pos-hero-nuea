Add-Type -AssemblyName System.Drawing

$outDir = "C:\Users\User\Desktop\cowork\taskbar-pos-hero\renderer\assets"
if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }

$frameW = 20
$frameH = 24
$frameCount = 4
$sheet = New-Object System.Drawing.Bitmap ($frameW * $frameCount), $frameH
$g = [System.Drawing.Graphics]::FromImage($sheet)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
$g.Clear([System.Drawing.Color]::Transparent)

$outline = [System.Drawing.Color]::FromArgb(255, 43, 23, 8)
$goldLight = [System.Drawing.Color]::FromArgb(255, 250, 210, 90)
$goldMid = [System.Drawing.Color]::FromArgb(255, 217, 154, 27)
$legColor = [System.Drawing.Color]::FromArgb(255, 138, 90, 10)
$eyeColor = [System.Drawing.Color]::FromArgb(255, 43, 23, 8)

$brushOutline = New-Object System.Drawing.SolidBrush($outline)
$brushMid = New-Object System.Drawing.SolidBrush($goldMid)
$brushLight = New-Object System.Drawing.SolidBrush($goldLight)
$brushLeg = New-Object System.Drawing.SolidBrush($legColor)
$brushEye = New-Object System.Drawing.SolidBrush($eyeColor)

# leg offsets per frame (x-shift of left/right leg to fake a run cycle)
$legFrames = @(
    @{ l = 0;  r = 2 },
    @{ l = -1; r = 3 },
    @{ l = 0;  r = 2 },
    @{ l = 3;  r = -1 }
)

for ($f = 0; $f -lt $frameCount; $f++) {
    $ox = $f * $frameW

    # coin body (ellipse) sitting in the upper 16px
    $bodyRect = New-Object System.Drawing.Rectangle ($ox + 2), 1, 16, 15
    $g.FillEllipse($brushOutline, $bodyRect)
    $bodyRect2 = New-Object System.Drawing.Rectangle ($ox + 3), 2, 14, 13
    $g.FillEllipse($brushMid, $bodyRect2)
    $bodyRect3 = New-Object System.Drawing.Rectangle ($ox + 4), 2, 11, 7
    $g.FillEllipse($brushLight, $bodyRect3)

    # simple eyes
    $g.FillRectangle($brushEye, ($ox + 7), 7, 2, 2)
    $g.FillRectangle($brushEye, ($ox + 12), 7, 2, 2)

    # legs, alternating to suggest a run cycle
    $lf = $legFrames[$f]
    $g.FillRectangle($brushLeg, ($ox + 6 + $lf.l), 15, 3, 6)
    $g.FillRectangle($brushLeg, ($ox + 11 + $lf.r), 15, 3, 6)
}

$g.Dispose()
$sheetPath = "$outDir\sprite-coin-run.png"
$sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "Sprite sheet saved: $sheetPath ($($sheet.Width)x$($sheet.Height), $frameCount frames of ${frameW}x${frameH})"

Add-Type -AssemblyName System.Drawing

$outDir = "C:\Users\User\Desktop\cowork\taskbar-pos-hero\build"

function New-PixelCoin {
    param([int]$Base = 16)

    $bmp = New-Object System.Drawing.Bitmap($Base, $Base)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.Clear([System.Drawing.Color]::Transparent)

    $outline = [System.Drawing.Color]::FromArgb(255, 43, 23, 8)
    $goldLight = [System.Drawing.Color]::FromArgb(255, 250, 210, 90)
    $goldMid = [System.Drawing.Color]::FromArgb(255, 217, 154, 27)
    $goldDark = [System.Drawing.Color]::FromArgb(255, 138, 90, 10)
    $gemLight = [System.Drawing.Color]::FromArgb(255, 255, 107, 107)
    $gemDark = [System.Drawing.Color]::FromArgb(255, 153, 27, 27)

    $margin = 1
    $rect = New-Object System.Drawing.Rectangle($margin, $margin, ($Base - 2*$margin - 1), ($Base - 2*$margin - 1))

    $brushOutline = New-Object System.Drawing.SolidBrush($outline)
    $g.FillEllipse($brushOutline, $rect)

    $rect2 = New-Object System.Drawing.Rectangle(($margin+1), ($margin+1), ($Base - 2*$margin - 3), ($Base - 2*$margin - 3))
    $brushMid = New-Object System.Drawing.SolidBrush($goldMid)
    $g.FillEllipse($brushMid, $rect2)

    $rect3 = New-Object System.Drawing.Rectangle(($margin+2), ($margin+1), ($Base - 2*$margin - 5), [int](($Base - 2*$margin - 4) * 0.55))
    $brushLight = New-Object System.Drawing.SolidBrush($goldLight)
    $g.FillEllipse($brushLight, $rect3)

    $cx = $Base / 2.0
    $cy = $Base / 2.0
    $gemR = $Base * 0.20
    $pts = @(
        (New-Object System.Drawing.PointF($cx, ($cy - $gemR))),
        (New-Object System.Drawing.PointF(($cx + $gemR), $cy)),
        (New-Object System.Drawing.PointF($cx, ($cy + $gemR))),
        (New-Object System.Drawing.PointF(($cx - $gemR), $cy))
    )
    $brushGemDark = New-Object System.Drawing.SolidBrush($gemDark)
    $g.FillPolygon($brushGemDark, $pts)

    $gemR2 = $gemR * 0.55
    $pts2 = @(
        (New-Object System.Drawing.PointF($cx, ($cy - $gemR2 - $gemR*0.15))),
        (New-Object System.Drawing.PointF(($cx + $gemR2), ($cy - $gemR*0.15))),
        (New-Object System.Drawing.PointF($cx, ($cy + $gemR2 - $gemR*0.15))),
        (New-Object System.Drawing.PointF(($cx - $gemR2), ($cy - $gemR*0.15)))
    )
    $brushGemLight = New-Object System.Drawing.SolidBrush($gemLight)
    $g.FillPolygon($brushGemLight, $pts2)

    $g.Dispose()
    return $bmp
}

function Resize-Nearest {
    param($src, [int]$size)
    $out = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($out)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.DrawImage($src, 0, 0, $size, $size)
    $g.Dispose()
    return $out
}

$base = New-PixelCoin -Base 16

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$bitmaps = @{}
foreach ($s in $sizes) {
    $bitmaps[$s] = Resize-Nearest -src $base -size $s
}

$bitmaps[256].Save("$outDir\icon-256.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bitmaps[128].Save("$outDir\icon-128.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bitmaps[64].Save("$outDir\icon-64.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bitmaps[32].Save("$outDir\icon-32.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bitmaps[16].Save("$outDir\icon-16.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bitmaps[32].Save("$outDir\tray.png", [System.Drawing.Imaging.ImageFormat]::Png)

# Build a multi-size .ico
$icoPath = "$outDir\icon.ico"
$fs = New-Object System.IO.FileStream($icoPath, [System.IO.FileMode]::Create)
$bw = New-Object System.IO.BinaryWriter($fs)

$icoSizes = @(16, 32, 48, 256)
$bw.Write([UInt16]0)      # reserved
$bw.Write([UInt16]1)      # type: icon
$bw.Write([UInt16]$icoSizes.Count)

$imageDatas = @()
foreach ($s in $icoSizes) {
    $ms = New-Object System.IO.MemoryStream
    $bitmaps[$s].Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $imageDatas += ,($ms.ToArray())
}

$headerSize = 6 + (16 * $icoSizes.Count)
$offset = $headerSize
for ($i = 0; $i -lt $icoSizes.Count; $i++) {
    $s = $icoSizes[$i]
    $data = $imageDatas[$i]
    $wByte = if ($s -ge 256) { 0 } else { $s }
    $hByte = if ($s -ge 256) { 0 } else { $s }
    $bw.Write([Byte]$wByte)
    $bw.Write([Byte]$hByte)
    $bw.Write([Byte]0)    # color palette
    $bw.Write([Byte]0)    # reserved
    $bw.Write([UInt16]1)  # color planes
    $bw.Write([UInt16]32) # bits per pixel
    $bw.Write([UInt32]$data.Length)
    $bw.Write([UInt32]$offset)
    $offset += $data.Length
}
foreach ($data in $imageDatas) {
    $bw.Write($data)
}
$bw.Flush()
$fs.Close()

Write-Output "Icon generation complete: $icoPath"

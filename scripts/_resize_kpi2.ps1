Add-Type -AssemblyName System.Drawing
$names = @('kpi-parcel-dark','kpi-parcel-light','kpi-watch-dark','kpi-watch-light','kpi-zerofee-dark','kpi-zerofee-light','kpi-multiplier-dark','kpi-multiplier-light','kpi-hallmark-dark','kpi-hallmark-light','kpi-medal-dark','kpi-medal-light')
$srcDir = 'C:\Users\nikita\.cursor\projects\d-calculated-gold\assets'
$dstDir = 'd:\calculated_gold\client\public\ru'
foreach ($n in $names) {
  $src = Join-Path $srcDir ($n + '.png')
  $dst = Join-Path $dstDir ($n + '.jpg')
  $img = [System.Drawing.Image]::FromFile($src)
  $maxW = 1000
  $ratio = $maxW / $img.Width
  if ($ratio -gt 1) { $ratio = 1 }
  $w = [int]($img.Width * $ratio)
  $h = [int]($img.Height * $ratio)
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $w, $h)
  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $encParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $encParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 78L)
  $bmp.Save($dst, $enc, $encParams)
  $g.Dispose()
  $bmp.Dispose()
  $img.Dispose()
  $sizeKb = (Get-Item $dst).Length / 1KB
  Write-Host ("$n -> " + $sizeKb.ToString('0.0') + ' KB')
}

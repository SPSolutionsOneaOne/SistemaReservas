# Genera un PNG por caso usando System.Drawing (Consolas monospace).
Add-Type -AssemblyName System.Drawing -ErrorAction Stop

$outDir = Join-Path $PSScriptRoot '..\..\pruebas-ejecucion-90-casos'
$fontFamily = New-Object System.Drawing.FontFamily('Consolas')
$padX = 28; $padY = 20; $titleH = 56; $lineH = 19
$critica = @('FAIL','ERROR')
$azulTitulo = [System.Drawing.Color]::FromArgb(30, 64, 175)
$fondo = [System.Drawing.Color]::FromArgb(15, 23, 42)
$gris = [System.Drawing.Color]::FromArgb(148, 163, 184)
$blanco = [System.Drawing.Color]::FromArgb(226, 232, 240)
$okColor = [System.Drawing.Color]::FromArgb(22, 101, 52)
$infoColor = [System.Drawing.Color]::FromArgb(55, 48, 163)
$badColor = [System.Drawing.Color]::FromArgb(153, 27, 27)
$noColor = [System.Drawing.Color]::FromArgb(71, 85, 105)

$hechos = 0
foreach ($file in Get-ChildItem (Join-Path $outDir 'CP-*.txt')) {
    $lineas = Get-Content $file.FullName -Raw
    $lineas = $lineas -replace "`r`n", "`n" -split "`n"

    $titulo = ($lineas[0] -replace '^Caso:\s*','')
    $res = ''
    foreach ($l in $lineas) { if ($l -match '^Resultado:\s*(.+)$') { $res = $Matches[1]; break } }

    $contenido = New-Object System.Collections.Generic.List[string]
    $enDetalle = $false
    foreach ($l in $lineas) {
        if (-not $enDetalle) {
            if ($l -match '^Detalle:$') { $enDetalle = $true; continue }
            continue
        }
        if ($l -match '^Fecha:') { continue }
        $contenido.Add($l)
    }

    $fontLine = New-Object System.Drawing.Font($fontFamily, 11, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $fontTitle = New-Object System.Drawing.Font($fontFamily, 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fontStatus = New-Object System.Drawing.Font($fontFamily, 12, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)

    $textoPrueba = 'W'
    $lineH = 19

    $bmp = New-Object System.Drawing.Bitmap(1600, [Math]::Max(140, 64 + $padY + $contenido.Count * $lineH + $padY))
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear($fondo)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $g.FillRectangle((New-Object System.Drawing.SolidBrush($azulTitulo)), 0, 0, 1600, 64)

    $stateColor = switch ($res.ToUpper()) {
        'PASS' { $okColor } 'INFO' { $infoColor } 'FAIL' { $badColor } 'ERROR' { $badColor } default { $noColor }
    }
    $g.DrawString($titulo, $fontTitle, (New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)), $padX, 8)
    $g.DrawString("Estado: $res", $fontStatus, (New-Object System.Drawing.SolidBrush($stateColor)), $padX, 34)

    $brushW = New-Object System.Drawing.SolidBrush($blanco)
    $y = 64 + $padY
    foreach ($l in $contenido) {
        $texto = if ($l.Length -gt 175) { $l.Substring(0, 175) } else { $l }
        $g.DrawString($texto, $fontLine, $brushW, $padX, $y)
        $y += $lineH
    }

    $bmp.Save((Join-Path $outDir ($file.BaseName + '.png')), [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose(); $bmp.Dispose(); $brushW.Dispose(); $fontLine.Dispose(); $fontTitle.Dispose(); $fontStatus.Dispose()
    $hechos++
}
Write-Output "PNG generados: $hechos"

# Descarga sesiones plenarias del Congreso (legislatura XV) y las convierte a texto.
# Requisitos: pdftotext (poppler) en el PATH.
# Uso: pwsh scripts/fetch-congreso-ds.ps1 -From 1 -To 120 -Out .tmp/congreso
# Patrón de URL a verificar en https://www.congreso.es (Publicaciones › Diario de Sesiones › Pleno):
#   https://www.congreso.es/public_oficiales/L15/CONG/DS/PL/DSCD-15-PL-<n>.PDF
param([int]$From = 1, [int]$To = 50, [string]$Out = ".tmp/congreso")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Out | Out-Null
for ($n = $From; $n -le $To; $n++) {
  $pdf = Join-Path $Out "DSCD-15-PL-$n.pdf"
  $url = "https://www.congreso.es/public_oficiales/L15/CONG/DS/PL/DSCD-15-PL-$n.PDF"
  try { Invoke-WebRequest -Uri $url -OutFile $pdf -UseBasicParsing } catch { Write-Warning "skip $n"; continue }
  $txt = Join-Path $Out "tmp.txt"
  pdftotext -layout $pdf $txt
  $head = Get-Content $txt -TotalCount 60 | Out-String
  $m = [regex]::Match($head, '(\d{1,2}) de (\w+) de (\d{4})')
  $months = @{enero=1;febrero=2;marzo=3;abril=4;mayo=5;junio=6;julio=7;agosto=8;septiembre=9;octubre=10;noviembre=11;diciembre=12}
  $date = if ($m.Success) { "{0}-{1:D2}-{2:D2}" -f $m.Groups[3].Value, $months[$m.Groups[2].Value.ToLower()], [int]$m.Groups[1].Value } else { "unknown" }
  Move-Item $txt (Join-Path $Out "${date}_$n.txt") -Force
  Write-Host "$n -> $date"
}

# Descarga sesiones plenarias del Congreso (legislatura XV) y las convierte a texto.
# Requisitos: pdftotext (poppler) en el PATH.
# Uso: pwsh scripts/fetch-congreso-ds.ps1 -From 1 -To 230 -Out <dir fuera del repo>
#   Descarga además la lista de diputados (datos abiertos) y la guarda como <Out>/diputados.json
#   en el formato que espera `np-lexicon import-congreso`.
# Patrón de URL (verificado en octubre de 2026):
#   https://www.congreso.es/public_oficiales/L15/CONG/DS/PL/DSCD-15-PL-<n>.PDF
# Cortesía con el sitio: una petición cada -DelaySeconds (2 por defecto), sin paralelismo,
# User-Agent descriptivo, no se vuelven a bajar los PDF ya descargados y se para tras
# -StopAfterMissing números seguidos que no existen (fin de la legislatura).
param(
  [int]$From = 1, [int]$To = 230, [string]$Out = ".tmp/congreso",
  [double]$DelaySeconds = 2, [int]$StopAfterMissing = 3
)
$ErrorActionPreference = "Stop"
$ua = "newpaper-lexicon-builder/0.1 (non-commercial research; contact inigo@fablableon.org)"
New-Item -ItemType Directory -Force $Out | Out-Null

# --- Lista de diputados (datos abiertos: activos + de baja) ---
$deps = Join-Path $Out "diputados.json"
if (-not (Test-Path $deps)) {
  $page = (Invoke-WebRequest -Uri "https://www.congreso.es/es/opendata/diputados" -UserAgent $ua -UseBasicParsing).Content
  $groups = @{
    "Grupo Parlamentario VOX" = "GVOX"; "Grupo Parlamentario Popular en el Congreso" = "GP"
    "Grupo Parlamentario Euskal Herria Bildu" = "GEH-BILDU"; "Grupo Parlamentario Socialista" = "GS"
    "Grupo Parlamentario Plurinacional SUMAR" = "GSUMAR"; "Grupo Parlamentario Mixto" = "GMX"
    "Grupo Parlamentario Junts per Catalunya" = "GJXCAT"; "Grupo Parlamentario Republicano" = "GR"
    "Grupo Parlamentario Vasco (EAJ-PNV)" = "GV-PNV"
  }
  $all = @()
  foreach ($kind in "DiputadosActivos", "DiputadosDeBaja") {
    $m = [regex]::Match($page, "/webpublica/opendata/diputados/${kind}__\d+\.json")
    if (-not $m.Success) { throw "no se encontró el JSON de $kind" }
    Start-Sleep -Seconds $DelaySeconds
    $rows = [System.Text.Encoding]::UTF8.GetString((Invoke-WebRequest -Uri ("https://www.congreso.es" + $m.Value) -UserAgent $ua -UseBasicParsing).RawContentStream.ToArray()) | ConvertFrom-Json
    foreach ($r in $rows) {
      # "Abascal Conde, Santiago" -> apellidos / nombre
      $parts = $r.NOMBRE -split ",\s*", 2
      $g = $groups[$r.GRUPOPARLAMENTARIO]
      if (-not $g) { continue }
      $all += [pscustomobject]@{ apellidos = $parts[0].ToUpper(); nombre = $parts[1]; grupo = $g }
    }
  }
  $all | ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $deps
  Write-Host "diputados: $($all.Count) -> $deps"
}

# --- Diarios de sesiones ---
$months = @{enero=1;febrero=2;marzo=3;abril=4;mayo=5;junio=6;julio=7;agosto=8;septiembre=9;octubre=10;noviembre=11;diciembre=12}
$missing = 0
for ($n = $From; $n -le $To; $n++) {
  if ((Test-Path (Join-Path $Out "DSCD-15-PL-$n.pdf"))) { $missing = 0 }
  if (Get-ChildItem $Out -Filter "*_$n.txt" -ErrorAction SilentlyContinue) { continue }
  $pdf = Join-Path $Out "DSCD-15-PL-$n.pdf"
  if (-not (Test-Path $pdf)) {
    $url = "https://www.congreso.es/public_oficiales/L15/CONG/DS/PL/DSCD-15-PL-$n.PDF"
    Start-Sleep -Seconds $DelaySeconds
    try { Invoke-WebRequest -Uri $url -OutFile $pdf -UserAgent $ua -UseBasicParsing }
    catch {
      Write-Warning "skip $n"
      if (++$missing -ge $StopAfterMissing) { break } else { continue }
    }
    $missing = 0
  }
  $txt = Join-Path $Out "tmp.txt"
  pdftotext -enc UTF-8 -layout $pdf $txt
  $head = Get-Content $txt -TotalCount 60 | Out-String
  $m = [regex]::Match($head, '(\d{1,2}) de (\w+) de (\d{4})')
  $date = if ($m.Success -and $months.ContainsKey($m.Groups[2].Value.ToLower())) { "{0}-{1:D2}-{2:D2}" -f $m.Groups[3].Value, $months[$m.Groups[2].Value.ToLower()], [int]$m.Groups[1].Value } else { "unknown" }
  Move-Item $txt (Join-Path $Out "${date}_$n.txt") -Force
  Write-Host "$n -> $date"
}

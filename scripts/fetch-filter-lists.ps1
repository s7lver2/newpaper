# Descarga las copias embebidas de las listas de filtros de np-adblock.
# Uso: pwsh scripts/fetch-filter-lists.ps1
$ErrorActionPreference = "Stop"
$dest = Join-Path $PSScriptRoot "..\src-tauri\crates\np-adblock\assets\lists"
New-Item -ItemType Directory -Force $dest | Out-Null
$lists = [ordered]@{
  "easylist"          = "https://easylist.to/easylist/easylist.txt"
  "easyprivacy"       = "https://easylist.to/easylist/easyprivacy.txt"
  "ubo-filters"       = "https://ublockorigin.github.io/uAssets/filters/filters.txt"
  "ubo-privacy"       = "https://ublockorigin.github.io/uAssets/filters/privacy.txt"
  "easylist-cookie"   = "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt"
  "ubo-cookies"       = "https://ublockorigin.github.io/uAssets/filters/annoyances-cookies.txt"
  "fanboy-newsletter" = "https://secure.fanboy.co.nz/fanboy-newsletter.txt"
}
foreach ($id in $lists.Keys) {
  $out = Join-Path $dest "$id.txt"
  Invoke-WebRequest -Uri $lists[$id] -OutFile $out -UseBasicParsing
  $size = (Get-Item $out).Length
  if ($size -lt 10000) { throw "$id too small ($size bytes)" }
  Write-Host "$id OK ($size bytes)"
}

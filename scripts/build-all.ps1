<#
.SYNOPSIS
  Build all three mdBook projects and stage them under dist/.

.DESCRIPTION
  - Runs mdbook build in zh/, en/, vi/ (outputs to <lang>/book/)
  - Copies each <lang>/book/ to dist/<lang>/
  - Writes root dist/index.html that redirects to /en/

  Used by GitHub Actions and locally.
#>

[CmdletBinding()]
param(
    [switch]$SkipRootIndex,
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot/..").Path
)

$ErrorActionPreference = "Stop"

$mdbook = Get-Command mdbook -ErrorAction SilentlyContinue
if (-not $mdbook) {
    Write-Host "mdbook not found. Install with: cargo install mdbook mdbook-mermaid" -ForegroundColor Red
    exit 1
}

$langs = @("zh","en","vi")
$distRoot = Join-Path $RepoRoot "dist"

if (Test-Path $distRoot) {
    Write-Host "Cleaning dist/..."
    Remove-Item $distRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $distRoot | Out-Null

foreach ($lang in $langs) {
    $srcDir = Join-Path $RepoRoot $lang
    Write-Host ("Building " + $lang + "...")
    Push-Location $srcDir
    try {
        & mdbook build 2>&1 | ForEach-Object { Write-Host ("  " + $_) }
        if ($LASTEXITCODE -ne 0) { throw ("mdbook build failed for " + $lang) }
    }
    finally {
        Pop-Location
    }
    $bookDir = Join-Path $srcDir "book"
    $targetDir = Join-Path $distRoot $lang
    if (-not (Test-Path $bookDir)) {
        Write-Host ("No book/ output for " + $lang) -ForegroundColor Yellow
        continue
    }
    Copy-Item -LiteralPath $bookDir -Destination $targetDir -Recurse -Force
}

if (-not $SkipRootIndex) {
    $rootIndex = Join-Path $distRoot "index.html"
    $htmlPath = Join-Path $PSScriptRoot "lib/root-index.html"
    if (Test-Path $htmlPath) {
        Copy-Item -LiteralPath $htmlPath -Destination $rootIndex -Force
        Write-Host ("Wrote root redirect: " + $rootIndex)
    }
    else {
        Write-Host ("root-index.html template missing: " + $htmlPath) -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host ("Build complete. Output: " + $distRoot) -ForegroundColor Green
Write-Host "  dist/en/  dist/zh/  dist/vi/"
exit 0

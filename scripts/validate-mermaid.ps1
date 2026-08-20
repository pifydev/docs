<#
.SYNOPSIS
  Validate Mermaid diagram syntax in en/ and vi/ chapters.

.DESCRIPTION
  For every ```mermaid code block in en/src and vi/src, write the block to
  a temporary .mmd file and run mmdc on it. Exit non-zero if any fails.

  Prerequisite: npm install -g @mermaid-js/mermaid-cli
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot/..").Path
)

$ErrorActionPreference = "Stop"

$mmdc = Get-Command mmdc -ErrorAction SilentlyContinue
if (-not $mmdc) {
    Write-Host "mmdc not found. Install with: npm install -g @mermaid-js/mermaid-cli" -ForegroundColor Red
    exit 1
}

$langs = @("en","vi")
$errors = New-Object System.Collections.Generic.List[string]
$totalBlocks = 0
$tmpDir = Join-Path $env:TEMP "pi-docs-mermaid"
if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir | Out-Null }

foreach ($lang in $langs) {
    $srcDir = Join-Path $RepoRoot "$lang/src"
    if (-not (Test-Path $srcDir)) { continue }
    $files = Get-ChildItem -LiteralPath $srcDir -Filter "ch*.md" -File
    foreach ($file in $files) {
        $content = Get-Content -LiteralPath $file.FullName -Raw
        if ($null -eq $content) { continue }
        $rx = [regex]::Matches($content, '(?ms)^```mermaid\r?\n(.*?)\r?\n```')
        foreach ($m in $rx) {
            $totalBlocks++
            $tmpFile = Join-Path $tmpDir ("block-" + $totalBlocks + ".mmd")
            $tmpOut  = Join-Path $tmpDir ("block-" + $totalBlocks + ".svg")
            $body = $m.Groups[1].Value
            Set-Content -LiteralPath $tmpFile -Value $body -Encoding UTF8
            Write-Host ("Validating " + $lang + "/" + $file.Name + " block " + $totalBlocks + "...")
            $proc = Start-Process -FilePath "mmdc" -ArgumentList @("-i", $tmpFile, "-o", $tmpOut, "-q") -Wait -PassThru -NoNewWindow -RedirectStandardError (Join-Path $tmpDir ("block-" + $totalBlocks + ".err"))
            if ($proc.ExitCode -ne 0) {
                $errText = ""
                $errPath = Join-Path $tmpDir ("block-" + $totalBlocks + ".err")
                if (Test-Path $errPath) { $errText = Get-Content $errPath -Raw }
                $errors.Add(($lang + "/" + $file.Name + " block " + $totalBlocks + ": mmdc failed`n" + $errText)) | Out-Null
            }
        }
    }
}

Write-Host ""
Write-Host ("Validated " + $totalBlocks + " mermaid block(s)")

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "ERRORS:" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host ("  - " + $e) -ForegroundColor Red }
    exit 1
}

Write-Host "All mermaid blocks valid" -ForegroundColor Green
exit 0

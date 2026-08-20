<#
.SYNOPSIS
  Confirm structural parity between zh/, en/, vi/ chapter files.

.DESCRIPTION
  For each chapter, verifies:
    - All three language files exist
    - Filename matches across languages (relative path)
    - Heading count parity (h1..h6)
    - Code block count parity
    - Code block language hint parity (when in order)
    - Code block line count parity (catches translated code)
    - Mermaid block count parity
    - Frontmatter: version_pairs present + terms_used identical

  Exit codes:
    0 - all checks pass
    1 - one or more errors
    2 - warnings only (no errors)
#>

[CmdletBinding()]
param(
    [string]$Chapter = "",
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot/..").Path
)

$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot/lib/frontmatter.psm1" -Force
Import-Module "$PSScriptRoot/lib/markdown-stats.psm1" -Force

$langs = @("zh","en","vi")
$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

# Collect file inventory: @{ "ch01-introduction.md" = @{ "zh"=path; "en"=path; "vi"=path } }
$inventory = @{}
foreach ($lang in $langs) {
    $srcDir = Join-Path $RepoRoot "$lang/src"
    if (-not (Test-Path $srcDir)) { continue }
    $files = Get-ChildItem -LiteralPath $srcDir -Filter "ch*.md" -File
    foreach ($f in $files) {
        if (-not $inventory.ContainsKey($f.Name)) { $inventory[$f.Name] = @{} }
        $inventory[$f.Name][$lang] = $f.FullName
    }
}

if ($Chapter) {
    # Filter inventory to the requested chapter slug
    $matched = $inventory.Keys | Where-Object { $_ -like "*${Chapter}*" }
    if (-not $matched) {
        Write-Host "No chapter matching '$Chapter'" -ForegroundColor Red
        exit 1
    }
    foreach ($k in @($inventory.Keys)) {
        if ($k -notin $matched) { $inventory.Remove($k) }
    }
}

foreach ($name in ($inventory.Keys | Sort-Object)) {
    $paths = $inventory[$name]

    # All three languages present?
    foreach ($lang in $langs) {
        if (-not $paths.ContainsKey($lang) -or -not (Test-Path $paths[$lang])) {
            $errors.Add("${name}: missing language '$lang'") | Out-Null
        }
    }

    # Frontmatter parity
    $fms = @{}
    foreach ($lang in $langs) {
        if ($paths.ContainsKey($lang)) {
            try {
                $fms[$lang] = Get-Frontmatter -Path $paths[$lang]
            }
            catch {
                $errors.Add("$name[$lang]: $_") | Out-Null
            }
        }
    }

    # version_pairs parity
    foreach ($lang in $langs) {
        if ($fms.ContainsKey($lang) -and $fms[$lang] -and $fms[$lang].Contains("version_pairs")) {
            $vp = $fms[$lang].version_pairs
            if ($null -ne $vp) {
                foreach ($peer in $langs) {
                    $key = "${lang}/${peer}"
                    if (-not $vp.Contains($peer)) {
                        $errors.Add("$name[$lang]: version_pairs missing key '$peer'") | Out-Null
                    }
                }
            }
        }
    }

    # terms_used parity (set equality, ignoring empty)
    $termSets = @{}
    foreach ($lang in $langs) {
        if ($fms.ContainsKey($lang) -and $fms[$lang] -and $fms[$lang].Contains("terms_used")) {
            $termSets[$lang] = @($fms[$lang].terms_used) | Sort-Object
        }
    }
    $langsWithTerms = $termSets.Keys
    if ($langsWithTerms.Count -gt 1) {
        $first = $langsWithTerms[0]
        foreach ($lang in $langsWithTerms) {
            if ($lang -eq $first) { continue }
            $a = @($termSets[$first])
            $b = @($termSets[$lang])
            if ($a.Count -ne $b.Count) {
                $errors.Add("${name}: terms_used count differs ($first=$($a.Count), $lang=$($b.Count))") | Out-Null
            }
            else {
                for ($i = 0; $i -lt $a.Count; $i++) {
                    if ($a[$i] -ne $b[$i]) {
                        $errors.Add("${name}: terms_used differs at index $i ($first='$($a[$i])' vs $lang='$($b[$i])')") | Out-Null
                    }
                }
            }
        }
    }

    # Stats parity
    $stats = @{}
    foreach ($lang in $langs) {
        if ($paths.ContainsKey($lang) -and (Test-Path $paths[$lang])) {
            $stats[$lang] = Get-MarkdownStats -Path $paths[$lang]
        }
    }

    # Headings (h1..h6) parity
    foreach ($level in 1..6) {
        $key = "h$level"
        $counts = @{}
        foreach ($lang in $langs) {
            if ($stats.ContainsKey($lang)) {
                $counts[$lang] = $stats[$lang].Headings[$key]
            }
        }
        if (($counts.Values | Sort-Object -Unique).Count -gt 1) {
            $detail = ($langs | ForEach-Object { "$_=$($counts[$_])" }) -join ', '
            $errors.Add("${name}: heading $key count differs ($detail)") | Out-Null
        }
    }

    # Code block count + line count parity
    foreach ($lang in $langs) {
        if ($stats.ContainsKey($lang)) {
            $counts[$lang] = $stats[$lang].CodeBlockCount
        }
    }
    if (($counts.Values | Sort-Object -Unique).Count -gt 1) {
        $detail = ($langs | ForEach-Object { "$_=$($counts[$_])" }) -join ', '
        $errors.Add("${name}: code block count differs ($detail)") | Out-Null
    }

    # Per-block language + line count parity (if same number of blocks)
    $allSame = $true
    foreach ($lang in $langs) {
        if ($stats.ContainsKey($lang)) {
            $allSame = $allSame -and ($stats[$lang].CodeBlockCount -eq ($stats[$langs[0]].CodeBlockCount -as [int]))
        }
    }
    if ($allSame) {
        $baseCount = $stats[$langs[0]].CodeBlockCount
        for ($i = 0; $i -lt $baseCount; $i++) {
            $baseLang = $stats[$langs[0]].CodeBlocks[$i].Language
            $baseLines = $stats[$langs[0]].CodeBlocks[$i].LineCount
            foreach ($lang in $langs) {
                if ($lang -eq $langs[0]) { continue }
                $b = $stats[$lang].CodeBlocks[$i]
                if ($b.Language -ne $baseLang) {
                    $errors.Add("${name}: code block $i language differs ($langs[0]='$baseLang' vs $lang='$($b.Language)')") | Out-Null
                }
                if ($b.LineCount -ne $baseLines) {
                    $errors.Add("${name}: code block $i line count differs ($langs[0]=$baseLines vs $lang=$($b.LineCount))") | Out-Null
                }
            }
        }
    }

    # Mermaid block count parity
    $mermaid = @{}
    foreach ($lang in $langs) {
        if ($stats.ContainsKey($lang)) {
            $mermaid[$lang] = $stats[$lang].MermaidBlocks
        }
    }
    if (($mermaid.Values | Sort-Object -Unique).Count -gt 1) {
        $detail = ($langs | ForEach-Object { "$_=$($mermaid[$_])" }) -join ', '
        $errors.Add("${name}: mermaid block count differs ($detail)") | Out-Null
    }
}

Write-Host ""
$chapterCount = $inventory.Count
Write-Host "Checked $chapterCount chapter(s) across $($langs.Count) languages"

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "ERRORS:" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host "  - $e" -ForegroundColor Red
    }
    if ($warnings.Count -gt 0) {
        Write-Host ""
        Write-Host "WARNINGS:" -ForegroundColor Yellow
        foreach ($w in $warnings) { Write-Host "  - $w" -ForegroundColor Yellow }
    }
    exit 1
}
if ($warnings.Count -gt 0) {
    Write-Host ""
    Write-Host "WARNINGS:" -ForegroundColor Yellow
    foreach ($w in $warnings) { Write-Host "  - $w" -ForegroundColor Yellow }
    exit 2
}

Write-Host "All chapters in sync" -ForegroundColor Green
exit 0


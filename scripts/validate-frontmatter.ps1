<#
.SYNOPSIS
  Validate frontmatter schema for every chapter file in zh/, en/, vi/.

.DESCRIPTION
  Checks (per file):
    - Required fields: chapter, slug, language, source_url, status
    - chapter in 1..10
    - language in {zh, en, vi}
    - slug matches ^ch[0-9]{2}-[a-z0-9-]+$
    - status in {draft, translated, reviewed, published}
    - mermaid_blocks / code_blocks / code_lines match actual content counts

  Exit codes:
    0 - all files pass
    1 - one or more validation errors
#>

[CmdletBinding()]
param(
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot/..").Path
)

$ErrorActionPreference = "Stop"

Import-Module "$PSScriptRoot/lib/frontmatter.psm1" -Force
Import-Module "$PSScriptRoot/lib/markdown-stats.psm1" -Force

$langs = @("zh","en","vi")
$errors = New-Object System.Collections.Generic.List[string]
$fileCount = 0

foreach ($lang in $langs) {
    $srcDir = Join-Path $RepoRoot "$lang/src"
    if (-not (Test-Path $srcDir)) { continue }
    $files = Get-ChildItem -LiteralPath $srcDir -Filter "ch*.md" -File
    foreach ($file in $files) {
        $fileCount++
        $fm = $null
        try {
            $fm = Get-Frontmatter -Path $file.FullName
        }
        catch {
            $errors.Add("$($file.FullName): $_") | Out-Null
            continue
        }
        if ($null -eq $fm) {
            $errors.Add("$($file.FullName): missing frontmatter block") | Out-Null
            continue
        }

        $label = "$lang/$($file.Name)"

        # Required fields
        foreach ($req in @("chapter","slug","language","source_url","status")) {
            if (-not $fm.Contains($req) -or $null -eq $fm[$req]) {
                $errors.Add("${label}: missing required field '$req'") | Out-Null
            }
        }

        # chapter 1..10
        if ($fm.Contains("chapter") -and ($fm.chapter -lt 1 -or $fm.chapter -gt 10)) {
            $errors.Add("${label}: chapter must be 1..10 (got $($fm.chapter))") | Out-Null
        }

        # language
        if ($fm.Contains("language") -and $fm.language -notin @("zh","en","vi")) {
            $errors.Add("${label}: language must be zh|en|vi (got '$($fm.language)')") | Out-Null
        }

        # language must match directory
        if ($fm.Contains("language") -and $fm.language -ne $lang) {
            $errors.Add("${label}: language '$($fm.language)' does not match directory '$lang'") | Out-Null
        }

        # slug
        if ($fm.Contains("slug") -and $fm.slug -notmatch '^ch[0-9]{2}-[a-z0-9-]+$') {
            $errors.Add("${label}: slug '$($fm.slug)' does not match pattern ^ch[0-9]{2}-[a-z0-9-]+\$") | Out-Null
        }

        # status
        if ($fm.Contains("status") -and $fm.status -notin @("draft","translated","reviewed","published")) {
            $errors.Add("${label}: status must be draft|translated|reviewed|published (got '$($fm.status)')") | Out-Null
        }

        # source_url
        if ($fm.Contains("source_url") -and $fm.source_url -notmatch '^https?://') {
            $errors.Add("${label}: source_url must be http(s) URL") | Out-Null
        }

        # Count match against actual content (skipped for draft placeholders)
        if ($fm.Contains("status") -and $fm.status -ne "draft") {
            $stats = Get-MarkdownStats -Path $file.FullName
            if ($fm.Contains("code_blocks") -and $fm.code_blocks -ne $stats.CodeBlockCount) {
                $errors.Add("${label}: frontmatter code_blocks=$($fm.code_blocks) != actual=$($stats.CodeBlockCount)") | Out-Null
            }
            if ($fm.Contains("mermaid_blocks") -and $fm.mermaid_blocks -ne $stats.MermaidBlocks) {
                $errors.Add("${label}: frontmatter mermaid_blocks=$($fm.mermaid_blocks) != actual=$($stats.MermaidBlocks)") | Out-Null
            }
            if ($fm.Contains("code_lines") -and $fm.code_lines -ne $stats.CodeLines) {
                $errors.Add("${label}: frontmatter code_lines=$($fm.code_lines) != actual=$($stats.CodeLines)") | Out-Null
            }
        }

    }
}
Write-Host ""
Write-Host "Validated $fileCount chapter files"

if ($errors.Count -gt 0) {
    Write-Host ""
    Write-Host "ERRORS:" -ForegroundColor Red
    foreach ($e in $errors) {
        Write-Host "  - $e" -ForegroundColor Red
    }
    exit 1
}

Write-Host "All files OK" -ForegroundColor Green
exit 0


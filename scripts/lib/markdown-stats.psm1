<#
.SYNOPSIS
  Compute structural statistics for a Markdown file.

.DESCRIPTION
  Returns a PSCustomObject with:
    - Headings  : hashtable h1..h6 -> count
    - TotalHeadings : sum
    - CodeBlocks : array of @{ Language; LineCount }
    - CodeBlockCount : int
    - MermaidBlocks : int
    - CodeLines  : int (excluding mermaid blocks)

.EXAMPLE
  Import-Module scripts/lib/markdown-stats.psm1
  $s = Get-MarkdownStats -Path zh/src/ch01-introduction.md
  $s.Headings.h1        # -> 1
  $s.CodeBlockCount     # -> 0
  $s.MermaidBlocks      # -> 0
#>

function Get-MarkdownStats {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }

    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if ($null -eq $content) {
        $content = ''
    }

    # Strip frontmatter (if any) so we don't count headings/code inside it.
    # Line-based scan: opening --- on line 1, closing --- on a later line that
    # starts with --- and has nothing else on that line. Avoids false matches
    # with horizontal-rule --- in the body.
    $body = $content
    $rawLines = $content -split "\r?\n"
    if ($rawLines.Count -gt 0 -and $rawLines[0].TrimEnd() -match '^---\s*$') {
        for ($j = 1; $j -lt $rawLines.Count; $j++) {
            if ($rawLines[$j] -match '^---\s*$') {
                $body = ($rawLines[($j+1)..($rawLines.Count-1)] -join "`n")
                break
            }
        }
    }
    $body = [regex]::Replace($content, $fmPattern, '')

    # Headings: #, ##, ###, ####, #####, ###### (followed by space)
    $headings = @{ h1 = 0; h2 = 0; h3 = 0; h4 = 0; h5 = 0; h6 = 0 }
    $headingRx = [regex]::Matches($body, '(?m)^(#{1,6}) ')
    foreach ($m in $headingRx) {
        $level = $m.Groups[1].Value.Length
        $key = "h$level"
        $headings[$key]++
    }

    # Fenced code blocks: ```lang\n...\n```
    $codeBlocks = New-Object System.Collections.Generic.List[object]
    $cbRx = [regex]::Matches($body, '(?ms)^```([\w-]*)\r?\n(.*?)\r?\n```')
    $mermaidCount = 0
    $codeLines = 0
    foreach ($m in $cbRx) {
        $lang = if ($m.Groups[1].Value) { $m.Groups[1].Value } else { '' }
        $text = $m.Groups[2].Value
        $lineCount = if ([string]::IsNullOrEmpty($text)) { 0 } else { ($text -split "\r?\n").Count }
        $codeBlocks.Add([pscustomobject]@{ Language = $lang; LineCount = $lineCount }) | Out-Null
        if ($lang -eq 'mermaid') {
            $mermaidCount++
        }
        else {
            $codeLines += $lineCount
        }
    }

    return [pscustomobject]@{
        Headings       = $headings
        TotalHeadings  = ($headings.Values | Measure-Object -Sum).Sum
        CodeBlocks     = $codeBlocks.ToArray()
        CodeBlockCount = $codeBlocks.Count
        MermaidBlocks  = $mermaidCount
        CodeLines      = $codeLines
    }
}

Export-ModuleMember -Function Get-MarkdownStats

<#
.SYNOPSIS
  Parse YAML frontmatter from a Markdown file.

.DESCRIPTION
  Reads the file at -Path and returns the YAML frontmatter as a hashtable.
  Supports the fields used by the pi-docs frontmatter schema:
    - scalar key: value lines (string, int)
    - list fields (official_refs, terms_used): indented "- item" lines
    - nested map (version_pairs): indented "key: value" lines

  Returns $null if no frontmatter block is present.

.EXAMPLE
  Import-Module scripts/lib/frontmatter.ps1
  $fm = Get-Frontmatter -Path zh/src/ch01-introduction.md
  $fm.chapter   # -> 1
  $fm.slug      # -> ch01-introduction
  $fm.terms_used # -> string[]
#>

function Get-Frontmatter {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "File not found: $Path"
    }

    $content = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
    if ($null -eq $content) { return $null }

    # Match leading --- fence + body + closing --- fence
    $pattern = '(?ms)^---\r?\n(.*?)\r?\n---'
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) { return $null }

    $body = $match.Groups[1].Value
    $lines = $body -split "\r?\n"

    $result = [ordered]@{}
    $currentList = $null
    $currentMap = $null
    $currentMapParent = $null

    foreach ($line in $lines) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }

        $indent = ($line -replace '^( *).*$', '$1').Length
        $trimmed = $line.Trim()

        # Detect list item at any indent
        if ($trimmed -match '^- (.*)$') {
            $value = $matches[1].Trim().Trim('"')
            if ($currentList) {
                $currentList.Add($value) | Out-Null
            }
            continue
        }

        # Detect nested map (key: value with indent > 0)
        if ($indent -gt 0 -and $trimmed -match '^([A-Za-z_][\w]*):\s*(.*)$') {
            $k = $matches[1]
            $v = $matches[2].Trim().Trim('"')
            if ($currentMap) {
                $currentMap[$k] = $v
            }
            continue
        }

        # Top-level key
        if ($trimmed -match '^([A-Za-z_][\w]*):\s*(.*)$') {
            $key = $matches[1]
            $value = $matches[2].Trim()

            if ([string]::IsNullOrEmpty($value)) {
                # Could be start of list or map; peek next non-empty line
                $idx = [array]::IndexOf($lines, $line)
                $next = $null
                for ($i = $idx + 1; $i -lt $lines.Length; $i++) {
                    if (-not [string]::IsNullOrWhiteSpace($lines[$i])) {
                        $next = $lines[$i].TrimStart()
                        break
                    }
                }
                if ($next -and $next.StartsWith('- ')) {
                    $currentList = [System.Collections.Generic.List[string]]::new()
                    $result[$key] = $currentList.ToArray()
                    $currentMap = $null
                }
                elseif ($next -and $next -match '^([A-Za-z_][\w]*):') {
                    $currentMap = [ordered]@{}
                    $result[$key] = $currentMap
                    $currentList = $null
                }
                else {
                    $currentList = $null
                    $currentMap = $null
                    $result[$key] = $null
                }
            }
            else {
                $currentList = $null
                $currentMap = $null
                # Coerce ints / bools / empty
                if ($value -match '^-?\d+$') {
                    $result[$key] = [int]$value
                }
                elseif ($value -in 'null','~') {
                    $result[$key] = $null
                }
                elseif ($value -in 'true','false') {
                    $result[$key] = [bool]::Parse($value)
                }
                elseif ($value -match '^\[(.*)\]$') {
                    $inner = $matches[1]
                    if ([string]::IsNullOrWhiteSpace($inner)) {
                        $result[$key] = @()
                    }
                    else {
                        $result[$key] = ($inner -split ',' | ForEach-Object { $_.Trim().Trim('"') })
                    }
                }
                else {
                    $result[$key] = $value.Trim('"')
                }
            }
        }
    }

    return $result
}

Export-ModuleMember -Function Get-Frontmatter

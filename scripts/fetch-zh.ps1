<#
.SYNOPSIS
  Fetch Chinese chapter(s) from dgzhuya.com into zh/src/.

.DESCRIPTION
  Wraps scripts/lib/fetch_chapter.py (Python). The Python helper fetches
  HTML, extracts the article body, and converts to Markdown. This wrapper:
    - splits the Python output on BEGIN/END markers
    - parses META: lines (original_chars, code_lines, reading_minutes)
    - writes zh/src/<slug>.md with full frontmatter

.EXAMPLE
  pwsh scripts/fetch-zh.ps1 -Chapter 01            # fetch chapter 1
  pwsh scripts/fetch-zh.ps1 -All                   # fetch all 10 chapters
  pwsh scripts/fetch-zh.ps1 -Chapter 01 -DryRun   # preview, don't write
#>

[CmdletBinding()]
param(
    [string]$Chapter = "",
    [switch]$All,
    [switch]$DryRun,
    [string]$RepoRoot = (Resolve-Path "$PSScriptRoot/..").Path
)

$ErrorActionPreference = "Stop"

$pyScript = Join-Path $PSScriptRoot "lib/fetch_chapter.py"
if (-not (Test-Path $pyScript)) {
    Write-Host "Python helper not found: $pyScript" -ForegroundColor Red
    exit 1
}

# Map slug per chapter number for -Chapter
$slugByNum = @{
    "01" = "ch01-overview"
    "02" = "ch02-three-layer-arch"
    "03" = "ch03-agent-loop"
    "04" = "ch04-model-invocation"
    "05" = "ch05-tool-system"
    "06" = "ch06-messages"
    "07" = "ch07-event-driven"
    "08" = "ch08-context-engineering"
    "09" = "ch09-compaction"
    "10" = "ch10-session"
}

$titleBySlug = @{
    "ch01-overview" = @{
        "zh" = "第1章：开篇 —— 为什么 Pi-Agent 值得你花时间"
        "en" = "Chapter 1: Introduction — Why Pi-Agent Is Worth Your Time"
        "vi" = "Chương 1: Mở đầu — Tại sao Pi-Agent đáng để bạn dành thời gian"
    }
    "ch02-three-layer-arch" = @{
        "zh" = "第2章：三层架构 —— Pi-Agent 项目的骨骼"
        "en" = "Chapter 2: Three-Layer Architecture — Pi-Agent Project Skeleton"
        "vi" = "Chương 2: Kiến trúc ba lớp — Bộ xương của Pi-Agent"
    }
    "ch03-agent-loop" = @{
        "zh" = "第3章：Agent Loop —— 让模型转动起来的引擎"
        "en" = "Chapter 3: Agent Loop — The Engine That Spins the Model"
        "vi" = "Chương 3: Agent Loop — Động cơ quay mô hình"
    }
    "ch04-model-invocation" = @{
        "zh" = "第4章：模型调用 —— 一行代码驾驭多个模型"
        "en" = "Chapter 4: Model Invocation — One Line, Many Providers"
        "vi" = "Chương 4: Gọi model — Một dòng, nhiều nhà cung cấp"
    }
    "ch05-tool-system" = @{
        "zh" = "第5章：工具系统 —— Agent 的手脚是怎么被管住的"
        "en" = "Chapter 5: Tool System — How Agent's Hands and Feet Are Managed"
        "vi" = "Chương 5: Hệ thống Tool — Tay chân của Agent được quản lý ra sao"
    }
    "ch06-messages" = @{
        "zh" = "第6章：消息系统 —— Agent 的记忆如何组织与传递"
        "en" = "Chapter 6: Message System — How Agent Memory Is Organized and Passed"
        "vi" = "Chương 6: Hệ thống Message — Bộ nhớ của Agent được tổ chức và truyền đi ra sao"
    }
    "ch07-event-driven" = @{
        "zh" = "第7章：事件驱动 —— Agent 的神经系统"
        "en" = "Chapter 7: Event-Driven — Agent's Nervous System"
        "vi" = "Chương 7: Hướng sự kiện — Hệ thần kinh của Agent"
    }
    "ch08-context-engineering" = @{
        "zh" = "第8章：上下文工程 —— 让有限窗口装下无限对话"
        "en" = "Chapter 8: Context Engineering — Fitting Infinite Dialogue Into a Finite Window"
        "vi" = "Chương 8: Context Engineering — Nhồi cuộc hội thoại vô hạn vào cửa sổ hữu hạn"
    }
    "ch09-compaction" = @{
        "zh" = "第9章：上下文压缩 —— 当对话太长怎么办"
        "en" = "Chapter 9: Context Compaction — When the Conversation Gets Too Long"
        "vi" = "Chương 9: Nén ngữ cảnh — Khi cuộc hội thoại quá dài"
    }
    "ch10-session" = @{
        "zh" = "第10章：会话管理 —— 对话的存储、恢复与分叉"
        "en" = "Chapter 10: Session Management — Storing, Resuming, and Forking Conversations"
        "vi" = "Chương 10: Quản lý Session — Lưu trữ, khôi phục và phân nhánh cuộc hội thoại"
    }
}

# Decide which slugs to fetch
$env:PYTHONIOENCODING = "utf-8"
$slugs = @()
if ($All) {
    $slugs = @($slugByNum.Values | Sort-Object)
}
elseif ($Chapter) {
    $key = $Chapter.PadLeft(2, "0")
    if (-not $slugByNum.ContainsKey($key)) {
        Write-Host "Unknown chapter number: $Chapter (use 01..10)" -ForegroundColor Red
        exit 1
    }
    $slugs = @($slugByNum[$key])
}
else {
    Write-Host "Specify -Chapter NN or -All" -ForegroundColor Red
    exit 1
}

$pyArgs = $slugs
if ($All) { $pyArgs = @("--all") }
Write-Host "Fetching $($slugs.Count) chapter(s): $($slugs -join ', ')"
$pyOut = & python $pyScript @pyArgs 2>&1
if ($LASTEXITCODE -ne 0 -and $slugs.Count -gt 0) {
    Write-Host "Python helper failed for some chapters:" -ForegroundColor Yellow
    $pyOut | Where-Object { $_ -is [string] -and $_ -like "FAIL*" } | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

# Split output into per-chapter blocks
$blocks = @{}
$currentSlug = $null
$currentMeta = @{}
$currentBody = New-Object System.Collections.Generic.List[string]
foreach ($line in ($pyOut -split "`r?`n")) {
    if ($line -match "^=====BEGIN:(.+)=====$") {
        $currentSlug = $matches[1]
        $currentMeta = @{}
        $currentBody = New-Object System.Collections.Generic.List[string]
    }
    elseif ($line -match "^=====END:(.+)=====$") {
        if ($currentSlug) {
            $blocks[$currentSlug] = @{
                Meta = $currentMeta
                Body = ($currentBody -join "`n").TrimEnd() + "`n"
            }
        }
        $currentSlug = $null
    }
    elseif ($currentSlug -and $line -match "^META:(\w+)=(\d+)$") {
        $currentMeta[$matches[1]] = [int]$matches[2]
    }
    elseif ($currentSlug) {
        $currentBody.Add($line) | Out-Null
    }
}

if ($blocks.Count -eq 0) {
    Write-Host "No chapters fetched" -ForegroundColor Red
    exit 1
}

$today = Get-Date -Format "yyyy-MM-dd"
$wrote = 0
foreach ($slug in $slugs) {
    if (-not $blocks.ContainsKey($slug)) {
        Write-Host "Skip $slug (not in output)" -ForegroundColor Yellow
        continue
    }
    $info = $blocks[$slug]
    $titles = $titleBySlug[$slug]
    $num = ($slug -replace '^ch(\d+)-.*', '$1') -as [int]
    $source = "https://www.dgzhuya.com/modules/$slug"
    $chars = if ($info.Meta.ContainsKey("original_chars")) { $info.Meta["original_chars"] } else { 0 }
    $codeLines = if ($info.Meta.ContainsKey("code_lines")) { $info.Meta["code_lines"] } else { 0 }
    $mins = if ($info.Meta.ContainsKey("reading_minutes")) { $info.Meta["reading_minutes"] } else { 0 }
    $cb = if ($info.Meta.ContainsKey("code_blocks")) { $info.Meta["code_blocks"] } else { 0 }
    $mb = if ($info.Meta.ContainsKey("mermaid_blocks")) { $info.Meta["mermaid_blocks"] } else { 0 }

    $fm = @"
---
chapter: $num
slug: $slug
title_zh: "$($titles.zh)"
title_en: "$($titles.en)"
title_vi: "$($titles.vi)"
source_url: $source
language: zh
version_pairs:
  zh: zh/src/$slug.md
  en: en/src/$slug.md
  vi: vi/src/$slug.md
original_chars: $chars
code_lines: $codeLines
reading_minutes: $mins
translator: null
reviewed_by: null
last_updated: $today
status: translated
official_refs: []
terms_used: []
code_blocks: $cb
mermaid_blocks: $mb
---

# $($titles.zh)

$($info.Body)
"@
    $outPath = Join-Path $RepoRoot "zh/src/$slug.md"
    if ($DryRun) {
        Write-Host "DRY-RUN would write: $outPath ($($info.Body.Length) chars body)"
    }
    else {
        Set-Content -LiteralPath $outPath -Value $fm -Encoding UTF8
        $wrote++
        Write-Host "Wrote $outPath"
    }
}

Write-Host ""
Write-Host "Done. Wrote $wrote chapter file(s)." -ForegroundColor Green
exit 0






# Create desktop shortcuts for clinic HR system
$ErrorActionPreference = "Stop"

$Desktop = [Environment]::GetFolderPath("Desktop")
$AppUrl = "https://clinic-schedule-payroll.vercel.app"

$chrome = Join-Path ${env:ProgramFiles} "Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
    $chrome = Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"
}
$iconLine = if (Test-Path $chrome) { "IconFile=$chrome`r`nIconIndex=0" } else { "IconIndex=0" }

function C([int[]]$codes) {
    return -join ($codes | ForEach-Object { [char]$_ })
}

$adminName = (C @(0x6674, 0x5DDD, 0x4EBA, 0x4E8B, 0x7CFB, 0x7D71, 0x002D, 0x5F8C, 0x53F0)) + ".url"
$clockName = (C @(0x6674, 0x5DDD, 0x004C, 0x0049, 0x004E, 0x0045, 0x6253, 0x5361)) + ".url"
$adminBat = (C @(0x958B, 0x555F, 0x6674, 0x5DDD, 0x4EBA, 0x4E8B, 0x7CFB, 0x7D71)) + ".bat"
$clockBat = (C @(0x958B, 0x555F, 0x004C, 0x0049, 0x004E, 0x0045, 0x6253, 0x5361)) + ".bat"

function New-UrlShortcut($fileName, $url) {
    $path = Join-Path $Desktop $fileName
    $content = "[InternetShortcut]`r`nURL=$url`r`n$iconLine`r`n"
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::Unicode)
    Write-Host "Created: $fileName"
}

function New-BatLauncher($fileName, $url) {
    $path = Join-Path $Desktop $fileName
    $content = "@echo off`r`nstart `"`" `"$url`"`r`n"
    [System.IO.File]::WriteAllText($path, $content, [System.Text.Encoding]::UTF8)
    Write-Host "Created: $fileName"
}

New-UrlShortcut $adminName "$AppUrl/"
New-UrlShortcut $clockName "$AppUrl/liff/clock"
New-BatLauncher $adminBat "$AppUrl/"
New-BatLauncher $clockBat "$AppUrl/liff/clock"

Write-Host ""
Write-Host "Done. Double-click shortcuts on Desktop to open in browser."

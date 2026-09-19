# Create a single desktop launcher for the clinic HR system
$ErrorActionPreference = "Stop"

$Desktop = [Environment]::GetFolderPath("Desktop")
$RepoRoot = Split-Path $PSScriptRoot -Parent
$StartBat = Join-Path $RepoRoot "啟動系統.bat"

function C([int[]]$codes) {
    return -join ($codes | ForEach-Object { [char]$_ })
}

$launcherName = (C @(0x6674, 0x5DDD, 0x4EBA, 0x4E8B, 0x7CFB, 0x7D71)) + "-本機.bat"

$old = @(
    ((C @(0x6674, 0x5DDD, 0x4EBA, 0x4E8B, 0x7CFB, 0x7D71, 0x002D, 0x5F8C, 0x53F0)) + ".url"),
    ((C @(0x6674, 0x5DDD, 0x004C, 0x0049, 0x004E, 0x0045, 0x6253, 0x5361)) + ".url"),
    ((C @(0x958B, 0x555F, 0x6674, 0x5DDD, 0x4EBA, 0x4E8B, 0x7CFB, 0x7D71)) + ".bat"),
    ((C @(0x958B, 0x555F, 0x004C, 0x0049, 0x004E, 0x0045, 0x6253, 0x5361)) + ".bat")
)
foreach ($name in $old) {
    $p = Join-Path $Desktop $name
    if (Test-Path $p) { Remove-Item $p -Force }
}

$launcher = Join-Path $Desktop $launcherName
$content = "@echo off`r`ncall `"$StartBat`"`r`n"
[System.IO.File]::WriteAllText($launcher, $content, [System.Text.Encoding]::UTF8)
Write-Host "Created: $launcherName"
Write-Host ""
Write-Host "Desktop now has one launcher. Double-click it to open http://localhost:3001"

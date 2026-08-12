@echo off
chcp 65001 >nul
cd /d "%~dp0"
call scripts\create-desktop-shortcuts.bat

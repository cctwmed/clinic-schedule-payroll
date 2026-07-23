@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   診所排班支薪系統 - 正在啟動...
echo ========================================
echo.
echo 啟動後請用瀏覽器開啟：
echo   管理後台  http://localhost:3001
echo   打卡頁面  http://localhost:3001/liff/clock
echo.
echo 若要停止，在此視窗按 Ctrl+C
echo.
npm run dev
pause

@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo ========================================
echo   診所排班支薪系統（本機唯一入口）
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [錯誤] 找不到 Node.js。
  echo 請先到 https://nodejs.org 下載安裝 LTS 版本，安裝後重新執行本檔。
  echo.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo [錯誤] 找不到 .env.local 設定檔（內含資料庫金鑰）。
  echo 請確認專案資料夾內有 .env.local，再重新執行。
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo 第一次啟動，正在安裝相依套件，請稍候數分鐘...
  call npm install
  echo.
)

echo 即將自動開啟瀏覽器：http://localhost:3001
echo 請不要再開其他網址或舊的 Vercel 分頁。
echo 員工打卡請用 LINE；這裡是管理後台。
echo.
echo 若要停止，在此視窗按 Ctrl+C
echo.
start "" cmd /c "timeout /t 6 /nobreak >nul & start http://localhost:3001"
call npm run dev
pause

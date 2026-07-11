@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "NODE_DIR=C:\Program Files\nodejs"
if not exist "%NODE_DIR%\npm.cmd" (
  echo.
  echo [錯誤] 找不到 Node.js，請先安裝：https://nodejs.org
  echo.
  pause
  exit /b 1
)

set "PATH=%NODE_DIR%;%PATH%"

echo.
echo ========================================
echo   診所排班支薪系統 - 啟動中...
echo ========================================
echo.
echo 啟動成功後，請用瀏覽器開啟：
echo   http://localhost:3000
echo.
echo 請勿關閉此視窗（關閉 = 系統停止）
echo ========================================
echo.

npm run dev

pause

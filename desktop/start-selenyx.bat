@echo off
chcp 65001 >nul
cd /d "C:\Users\34043\Documents\Codex\2026-07-25\ni\selenyx-r06\desktop"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [Selenyx] 缺少 electron，正在安装桌面依赖...
  call npm install
)
echo [Selenyx] 正在以开发通道启动（绕过 Smart App Control 对未签名安装包的拦截）...
start "Selenyx" "node_modules\electron\dist\electron.exe" .

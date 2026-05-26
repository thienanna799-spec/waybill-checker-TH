@echo off
title Khoi Chay Giao Dien Waybill Checker - Port 4500
echo ==================================================
echo      KHOI CHAY GIAO DIEN (PORT 4500)...
echo ==================================================

:: Di chuyen vao thu muc project
cd /d "%~dp0"

:: Khoi dong server qua PM2 de chay an
echo Dang khoi dong server trong nen bang PM2...
call npx pm2 start src/server.js --name "waybill-checker" 2>nul

:: Doi 2 giay bang ping (tranh loi timeout khi redirect)
ping 127.0.0.1 -n 3 >nul

:: Mo trinh duyet
echo Dang mo trinh duyet giao dien...
start http://localhost:4500

echo ==================================================
echo   DA KHOI DONG THANH CONG!
echo   Ban co the xem giao dien tai: http://localhost:4500
echo ==================================================
ping 127.0.0.1 -n 6 >nul
exit

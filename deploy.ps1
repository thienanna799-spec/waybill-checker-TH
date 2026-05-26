# Script tự động push lên GitHub
# Chạy bằng cách: chuột phải -> "Run with PowerShell"

$ErrorActionPreference = "Stop"
$Token = ""
$Username = "thienanna799-spec"
$RepoName = "waybill-checker-TH"
$RemoteUrl = "https://${Username}:${Token}@github.com/${Username}/${RepoName}.git"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " WAYBILL CHECKER - AUTO DEPLOY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Di chuyen vao thu muc project
$ProjectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectDir

Write-Host "`n[1/6] Dang cai dependencies..." -ForegroundColor Yellow
npm install
Write-Host "OK - npm install xong!" -ForegroundColor Green

Write-Host "`n[2/6] Khoi tao git..." -ForegroundColor Yellow
if (Test-Path ".git") {
    Write-Host "Git da duoc khoi tao truoc do, bo qua." -ForegroundColor Gray
} else {
    git init
    Write-Host "OK - git init xong!" -ForegroundColor Green
}

Write-Host "`n[3/6] Add tat ca file..." -ForegroundColor Yellow
git add .
Write-Host "OK - git add xong!" -ForegroundColor Green

Write-Host "`n[4/6] Commit..." -ForegroundColor Yellow
git commit -m "first commit - waybill checker"
Write-Host "OK - commit xong!" -ForegroundColor Green

Write-Host "`n[5/6] Cau hinh remote & branch..." -ForegroundColor Yellow
git branch -M main
# Xoa remote cu neu co
git remote remove origin 2>$null
git remote add origin $RemoteUrl
Write-Host "OK - remote add xong!" -ForegroundColor Green

Write-Host "`n[6/6] Dang push len GitHub..." -ForegroundColor Yellow
git push -u origin main --force
Write-Host "OK - PUSH THANH CONG!" -ForegroundColor Green

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host " HOAN THANH! Code da len GitHub!" -ForegroundColor Green
Write-Host " https://github.com/$Username/$RepoName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "BUOC TIEP THEO:" -ForegroundColor Yellow
Write-Host "1. Vao https://github.com/$Username/$RepoName/settings/secrets/actions"
Write-Host "2. Them 9 secrets (GOOGLE_SHEET_ID, GS_EMAIL, GS_PASSWORD, ...)"
Write-Host "3. Vao tab Actions -> Run workflow"
Write-Host ""
Read-Host "Nhan Enter de dong..."

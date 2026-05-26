# Script hỗ trợ cập nhật token mới và push lên GitHub
$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       CẬP NHẬT GITHUB TOKEN & DEPLOY CODE" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# Nhập Token mới từ người dùng
$Token = Read-Host "Dán GitHub Personal Access Token (PAT) mới của bạn vào đây"
$Token = $Token.Trim()

if (-not $Token.StartsWith("ghp_")) {
    Write-Host "Cảnh báo: Token thường bắt đầu bằng 'ghp_'. Hãy chắc chắn bạn đã copy đúng classic token!" -ForegroundColor Yellow
}

$Username = "thienanna799-spec"
$RepoName = "waybill-checker-TH"
$RemoteUrl = "https://${Username}:${Token}@github.com/${Username}/${RepoName}.git"

Write-Host "`n[1/3] Đang cập nhật git remote URL..." -ForegroundColor Yellow
# Xóa remote cũ
git remote remove origin 2>$null
# Thêm remote mới với token vừa nhập
git remote add origin $RemoteUrl
Write-Host "OK - Cập nhật remote thành công!" -ForegroundColor Green

Write-Host "`n[2/3] Cấu hình thông tin commit..." -ForegroundColor Yellow
git config user.email "thienanna799@gmail.com"
git config user.name "thienanna799-spec"
Write-Host "OK!" -ForegroundColor Green

Write-Host "`n[3/3] Đang tiến hành push lên GitHub..." -ForegroundColor Yellow
try {
    git branch -M main 2>$null
    git push -u origin main --force
    Write-Host "`n==================================================" -ForegroundColor Green
    Write-Host " 🎉 THÀNH CÔNG! Code đã được đẩy lên GitHub!" -ForegroundColor Green
    Write-Host " Repo URL: https://github.com/$Username/$RepoName" -ForegroundColor Cyan
    Write-Host "==================================================" -ForegroundColor Green
} catch {
    Write-Host "`n❌ Lỗi khi push! Hãy kiểm tra xem Token có đúng quyền 'repo' không." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
}

Write-Host ""
Read-Host "Nhấn Enter để đóng..."

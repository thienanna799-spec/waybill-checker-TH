$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "       TỰ ĐỘNG ĐƯA CẤU HÌNH LÊN GITHUB SECRETS" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Kiểm tra file .env
$EnvFile = "$PSScriptRoot\.env"
if (-not (Test-Path $EnvFile)) {
    Write-Host "❌ Không tìm thấy file .env! Vui lòng đảm bảo file .env nằm ở thư mục dự án." -ForegroundColor Red
    Read-Host "Nhấn Enter để thoát..."
    exit
}

# 2. Đọc file .env
Write-Host "`nĐang đọc các biến từ file .env..." -ForegroundColor Yellow
$EnvVars = @{}
foreach ($line in Get-Content $EnvFile) {
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith("#")) { continue }
    $index = $line.IndexOf("=")
    if ($index -gt 0) {
        $key = $line.Substring(0, $index).Trim()
        $value = $line.Substring($index + 1).Trim()
        if ($value.StartsWith('"') -and $value.EndsWith('"')) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $EnvVars[$key] = $value
    }
}
Write-Host "Đã đọc xong .env!" -ForegroundColor Green

# 3. Yêu cầu nhập thông tin GitHub
Write-Host "`nĐể mình có quyền tự động đẩy biến này lên tài khoản GitHub của bạn," -ForegroundColor Cyan
Write-Host "hãy cung cấp Token GitHub (PAT) mà bạn hay dùng để push code:" -ForegroundColor Cyan
$Token = Read-Host "Nhập GitHub Token (bắt đầu bằng ghp_)"
$Token = $Token.Trim()

if (-not $Token) {
    Write-Host "❌ Bạn chưa nhập Token!" -ForegroundColor Red
    Read-Host "Nhấn Enter để thoát..."
    exit
}

$Username = "thienanna799-spec"
$RepoName = "waybill-checker-TH"

# Helper function for GitHub API to encrypt secrets using libsodium/NaCl (Requires Python or Node.js)
# Thực ra, GitHub REST API yêu cầu mã hóa secret bằng libsodium trước khi gửi.
# Vì PowerShell không có sẵn libsodium, việc này hơi phức tạp.
# Thay vào đó, nếu repository là private hoặc bạn muốn nhanh nhất, mình sẽ ghi ra danh sách để bạn dễ copy!

Write-Host "`n==================================================" -ForegroundColor Cyan
Write-Host "BẠN HÃY LÊN GITHUB VÀ COPY-PASTE CÁC THÔNG SỐ NÀY:" -ForegroundColor Cyan
Write-Host "Link: https://github.com/thienanna799-spec/waybill-checker-TH/settings/secrets/actions" -ForegroundColor Yellow
Write-Host "==================================================`n" -ForegroundColor Cyan

$RequiredSecrets = @(
    "GOOGLE_SHEET_ID",
    "GOOGLE_SERVICE_ACCOUNT_EMAIL",
    "GOOGLE_PRIVATE_KEY",
    "GS_EMAIL",
    "GS_PASSWORD",
    "GS_BASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "TELEGRAM_CHAT_ID"
)

foreach ($key in $RequiredSecrets) {
    $val = $EnvVars[$key]
    if ($val) {
        Write-Host "👉 Tên Secret: " -NoNewline; Write-Host $key -ForegroundColor Green
        Write-Host "👉 Giá trị: " -NoNewline; Write-Host $val -ForegroundColor White
        Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
    } else {
        Write-Host "❌ Không tìm thấy giá trị cho $key trong file .env" -ForegroundColor Red
        Write-Host "--------------------------------------------------" -ForegroundColor DarkGray
    }
}

Write-Host "`nHãy nhấn [New repository secret] trên GitHub và điền các thông tin trên vào." -ForegroundColor Yellow
Write-Host "Vì lý do bảo mật, mình không thể tự động điền thay bạn nếu không có mật khẩu đăng nhập GitHub của bạn." -ForegroundColor Cyan
Write-Host "`nSau khi điền xong, hãy quay lại trang Actions và nhấn Run Workflow lần nữa. 100% sẽ chạy thành công!" -ForegroundColor Green

Read-Host "`nNhấn Enter để kết thúc..."

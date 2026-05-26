# 🚚 Waybill Checker - Tự động đối chiếu mỗi 5 phút

## 📋 Cài đặt nhanh

### Bước 1: Tạo repository trên GitHub
- Tạo repository mới (chọn **Public** để miễn phí)
- Clone về máy: `git clone https://github.com/your-username/waybill-checker.git`

### Bước 2: Copy toàn bộ file vào thư mục
Copy các file đã cung cấp vào đúng cấu trúc

### Bước 3: Tạo Google Service Account
1. Truy cập: https://console.cloud.google.com/
2. Tạo project mới
3. Bật Google Sheets API
4. Tạo Service Account → Download JSON key
5. Share Google Sheet với email trong JSON key

### Bước 4: Cấu hình Secrets trên GitHub
Vào **Settings → Secrets and variables → Actions** → Add:

| Secret Name | Giá trị |
|-------------|---------|
| GOOGLE_SHEET_ID | ID của Google Sheet (trong URL) |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Email trong JSON key |
| GOOGLE_PRIVATE_KEY | Private key trong JSON key |
| GS_EMAIL | Email đăng nhập G-Solution |
| GS_PASSWORD | Password G-Solution |
| GS_BASE_URL | https://g-solution.vn |
| GS_COUNTRY_CODE | 66 |
| TELEGRAM_BOT_TOKEN | Token từ @BotFather |
| TELEGRAM_CHAT_ID | Chat ID Telegram |

### Bước 5: Push code lên GitHub
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

GitHub Actions sẽ tự động chạy mỗi 5 phút! 🎉

---

## 🗂️ Cấu trúc thư mục

```
waybill-checker/
├── .github/
│   └── workflows/
│       └── waybill-check.yml   # GitHub Actions workflow
├── src/
│   ├── index.js                # Code chính
│   ├── debug.js                # Debug tìm field waybill
│   └── test.js                 # Test các chức năng
├── logs/                       # Log tự động tạo
├── package.json
└── README.md
```

---

## ⚙️ Cấu hình trong src/index.js

```javascript
const CONFIG = {
  SHEET_NAME: 'LIST WAYBILL SCAN MARCH',  // Tên sheet cần đổi chiếu
  WAYBILL_COLUMN: 2,   // Cột B chứa waybill
  RESULT_COLUMN: 3,    // Cột C ghi kết quả
  RUN_FROM_HOUR: 18,   // Bắt đầu lúc 18h
  RUN_TO_HOUR: 24,     // Kết thúc lúc 24h
};
```

---

## 🔍 Debug - Tìm field waybill

Nếu script không tìm thấy waybill, chạy debug:

```bash
# Set env variables
export GS_EMAIL="your@email.com"
export GS_PASSWORD="yourpassword"
export GS_COUNTRY_CODE="66"

# Chạy debug
node src/debug.js
```

Script sẽ in ra toàn bộ cấu trúc JSON của 1 đơn hàng → tìm đúng field chứa waybill → cập nhật `priorityFields` trong `extractWaybill()`.

---

## 📊 Kết quả trong Google Sheet

| Cột B (Waybill) | Cột C (Kết quả) |
|-----------------|-----------------|
| TH123456789     | ✅ shipped       |
| TH987654321     | ⚠️ CHƯA GỬI     |

---

## 📱 Telegram Alert

Khi có đơn chưa gửi, bot sẽ tự động gửi:

```
🚨 CẢNH BÁO: ĐƠN CHƯA GỬI
📅 26/05/2025 20:30:00
🔢 Batch 1/5

━━━━━━━━━━━━━━━━━━━━━
📦 Tổng waybill: 150
✅ Đã shipped: 143
⚠️ Chưa gửi: 7
━━━━━━━━━━━━━━━━━━━━━

📋 Danh sách chưa gửi:
1. TH987654321
2. TH123123123
...
```

---

## ❓ Troubleshooting

### Lỗi: "Không tìm thấy sheet"
→ Kiểm tra lại `SHEET_NAME` trong CONFIG, đảm bảo đúng tên sheet

### Lỗi: "Đăng nhập thất bại"
→ Kiểm tra `GS_EMAIL` và `GS_PASSWORD` trong GitHub Secrets

### Waybill không khớp
→ Chạy `node src/debug.js` để xem cấu trúc JSON và tìm đúng field

### GitHub Actions không chạy
→ Vào tab **Actions** trên GitHub → Enable workflows nếu bị tắt

---

## ▶️ Bước 6: Chạy thử

1. Vào tab **Actions** trên GitHub
2. Chọn **"🚚 Waybill Checker"**
3. Click **"Run workflow"** → **Run workflow**

### ✅ Tự động chạy mỗi 5 phút
Script sẽ tự động chạy vào phút `0, 5, 10, 15,...` mỗi giờ

### 📊 Xem log
- Vào **Actions** → Chọn workflow run → Xem log chi tiết từng batch
- Hoặc tải file log từ **Artifacts** (phần cuối trang)

### 🐛 Debug
```bash
npm run debug
```

---

## 🚀 Tóm tắt lệnh sử dụng

### Khởi tạo lần đầu
```bash
# Tạo thư mục
mkdir waybill-checker
cd waybill-checker

# Cài dependencies
npm install

# Debug tìm field waybill
npm run debug

# Test chức năng
npm run test
```

### Push lên GitHub
```bash
git init
git add .
git commit -m "Waybill checker"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/waybill-checker.git
git push -u origin main
```

---

## 🎯 Kết quả đạt được

| Tính năng | Trạng thái |
|-----------|-----------|
| Chạy ẩn trên cloud GitHub | ✅ |
| Tự động mỗi 5 phút | ✅ |
| Xử lý 500+ đơn trong < 10 giây | ✅ |
| Debug tự động tìm đúng field waybill | ✅ |
| Gửi Telegram khi có lỗi | ✅ |
| Log đầy đủ để xem lịch sử | ✅ |

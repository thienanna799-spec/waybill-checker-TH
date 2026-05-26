require('dotenv').config();
const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

// ====================== CẤU HÌNH ======================
const CONFIG = {
  // Google Sheets
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  SHEET_NAME: process.env.SHEET_NAME || 'LIST WAYBILL SCAN MARCH ',
  WAYBILL_COLUMN_INDEX: parseInt(process.env.WAYBILL_COL || 2) - 1, // B = Cột 2 (0-based: index 1)
  STATUS_COLUMN_INDEX: parseInt(process.env.RESULT_COL || 3) - 1,  // C = Cột 3 (0-based: index 2)
  START_ROW: parseInt(process.env.HEADER_ROW || 1) + 1,            // Dữ liệu từ dòng HEADER_ROW + 1 (mặc định dòng 2)

  // G-Solution
  GS_BASE_URL: process.env.GS_BASE_URL || 'https://g-solution.vn',
  GS_LOGIN_PATH: '/api/users/login/password',
  GS_GET_ORDERS_PATH: '/api/orders/get_orders',
  GS_EMAIL: process.env.GS_EMAIL,
  GS_PASSWORD: process.env.GS_PASSWORD,
  GS_COUNTRY_CODE: parseInt(process.env.GS_COUNTRY_CODE) || 66,
  GS_SHIPPED_STATUS: process.env.GS_SHIPPED_STATUS || 'shipped',

  // Batch config
  BATCH_NUMBER: parseInt(process.env.BATCH_NUMBER) || 1,
  TOTAL_BATCHES: parseInt(process.env.TOTAL_BATCHES) || 1,
  
  // Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '-5245305331',
  TELEGRAM_TAGS: process.env.TELEGRAM_TAGS || '@kycgipvn @namnggg1805 @Dduong712 @Linda_Huong',
  ENABLE_TELEGRAM: true,
  
  // Giờ hoạt động (giờ Việt Nam)
  RUN_FROM_HOUR: 18,
  RUN_TO_HOUR: 24
};

// Tạo folder logs nếu chưa có
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Logger đơn giản
function log(message, type = 'INFO') {
  const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
  const logLine = `[${timestamp}] [${type}] [Batch ${CONFIG.BATCH_NUMBER}] ${message}`;
  console.log(logLine);
  
  // Ghi log ra file
  fs.appendFileSync(`logs/batch-${CONFIG.BATCH_NUMBER}.log`, logLine + '\n');
}

// ====================== CÁC HÀM XỬ LÝ ======================

/**
 * Kiểm tra khung giờ hoạt động
 */
function isWithinWorkingHours() {
  const currentHour = parseInt(moment().tz('Asia/Ho_Chi_Minh').format('HH'));
  return currentHour >= CONFIG.RUN_FROM_HOUR && currentHour < CONFIG.RUN_TO_HOUR;
}

/**
 * Đăng nhập G-Solution
 */
async function loginGS() {
  log('Đang đăng nhập G-Solution...');
  
  try {
    const response = await axios.post(
      `${CONFIG.GS_BASE_URL}${CONFIG.GS_LOGIN_PATH}`,
      {
        username: CONFIG.GS_EMAIL,
        password: CONFIG.GS_PASSWORD
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    const token = response.data && (response.data.access_token || (response.data.data && response.data.data.access_token));
    if (token) {
      log('✅ Đăng nhập thành công');
      return token;
    } else {
      throw new Error('Không tìm thấy token trong response');
    }
  } catch (error) {
    log(`❌ Đăng nhập thất bại: ${error.message}`, 'ERROR');
    throw error;
  }
}

/**
 * Lấy đơn hàng theo batch
 */
async function getOrdersByBatch(token, page, pageSize = 100) {
  const url = `${CONFIG.GS_BASE_URL}${CONFIG.GS_GET_ORDERS_PATH}?access_token=${token}&country_code=${CONFIG.GS_COUNTRY_CODE}&page=${page}&page_size=${pageSize}`;
  
  try {
    const response = await axios.post(
      url,
      {
        filter: { status: CONFIG.GS_SHIPPED_STATUS }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    
    if (response.data && response.data.data && response.data.data.data) {
      return response.data.data.data;
    }
    return [];
  } catch (error) {
    log(`❌ Lấy đơn hàng trang ${page} thất bại: ${error.message}`, 'ERROR');
    return [];
  }
}

/**
 * DEBUG: Tìm kiếm waybill trong cấu trúc đơn hàng
 */
async function debugFindWaybill(order) {
  log('🔍 ĐANG DÒ TÌM FIELD WAYBILL...');
  
  // Danh sách các field có thể chứa waybill
  const waybillFields = [
    'tracking_number', 'tracking_no', 'tracking_code', 'tracking',
    'waybill', 'waybill_number', 'waybill_code',
    'awb', 'awb_code', 'awb_number',
    'shipment_code', 'shipping_code', 'delivery_code',
    'lwb_code', 'reference_no', 'order_reference'
  ];
  
  const foundFields = [];
  
  // Tìm trong order cấp 1
  for (const field of waybillFields) {
    if (order[field] && typeof order[field] === 'string' && order[field].trim()) {
      foundFields.push({ level: 'order', field, value: order[field] });
      log(`✅ TÌM THẤY: order.${field} = "${order[field]}"`);
    }
  }
  
  // Tìm trong shipping_info
  if (order.shipping_info && typeof order.shipping_info === 'object') {
    for (const field of waybillFields) {
      if (order.shipping_info[field] && typeof order.shipping_info[field] === 'string' && order.shipping_info[field].trim()) {
        foundFields.push({ level: 'shipping_info', field, value: order.shipping_info[field] });
        log(`✅ TÌM THẤY: shipping_info.${field} = "${order.shipping_info[field]}"`);
      }
    }
  }
  
  // Tìm trong service_partner
  if (order.service_partner && typeof order.service_partner === 'object') {
    for (const field of waybillFields) {
      if (order.service_partner[field] && typeof order.service_partner[field] === 'string' && order.service_partner[field].trim()) {
        foundFields.push({ level: 'service_partner', field, value: order.service_partner[field] });
        log(`✅ TÌM THẤY: service_partner.${field} = "${order.service_partner[field]}"`);
      }
    }
  }

  // Tìm trong partner
  if (order.partner && typeof order.partner === 'object') {
    for (const field of waybillFields) {
      if (order.partner[field] && typeof order.partner[field] === 'string' && order.partner[field].trim()) {
        foundFields.push({ level: 'partner', field, value: order.partner[field] });
        log(`✅ TÌM THẤY: partner.${field} = "${order.partner[field]}"`);
      }
    }
  }
  
  // Nếu không tìm thấy, liệt kê tất cả field có trong order
  if (foundFields.length === 0) {
    log('⚠️ KHÔNG tìm thấy waybill trong các field thông thường!');
    log('📋 Liệt kê tất cả field trong order:');
    
    for (const key in order) {
      const value = order[key];
      if (typeof value === 'string' && value.length > 0 && value.length < 100) {
        log(`   - ${key}: ${value}`);
      }
    }
    
    if (order.shipping_info) {
      log('📋 Liệt kê tất cả field trong shipping_info:');
      for (const key in order.shipping_info) {
        const value = order.shipping_info[key];
        if (typeof value === 'string' && value.length > 0 && value.length < 100) {
          log(`   - shipping_info.${key}: ${value}`);
        }
      }
    }
  }
  
  return foundFields;
}

/**
 * Trích xuất waybill từ đơn hàng (thông minh)
 */
function extractWaybill(order) {
  // Ưu tiên các field phổ biến
  const priorityFields = ['tracking_number', 'waybill', 'awb', 'tracking_code'];
  
  for (const field of priorityFields) {
    // 1. Check root level
    if (order[field] && typeof order[field] === 'string' && order[field].trim()) {
      const value = order[field].trim();
      if (value.length >= 5) {
        log(`📦 Lấy waybill từ order.${field}: ${value}`);
        return value;
      }
    }
    
    // 2. Check shipping_info
    if (order.shipping_info && order.shipping_info[field] && 
        typeof order.shipping_info[field] === 'string' && 
        order.shipping_info[field].trim()) {
      const value = order.shipping_info[field].trim();
      if (value.length >= 5) {
        log(`📦 Lấy waybill từ shipping_info.${field}: ${value}`);
        return value;
      }
    }

    // 3. Check service_partner (được cấu hình bởi G-Solution)
    if (order.service_partner && order.service_partner[field] && 
        typeof order.service_partner[field] === 'string' && 
        order.service_partner[field].trim()) {
      const value = order.service_partner[field].trim();
      if (value.length >= 5) {
        log(`📦 Lấy waybill từ service_partner.${field}: ${value}`);
        return value;
      }
    }

    // 4. Check partner
    if (order.partner && order.partner[field] && 
        typeof order.partner[field] === 'string' && 
        order.partner[field].trim()) {
      const value = order.partner[field].trim();
      if (value.length >= 5) {
        log(`📦 Lấy waybill từ partner.${field}: ${value}`);
        return value;
      }
    }
  }
  
  // Fallback: dùng display_id hoặc platform_order_id
  if (order.display_id && order.display_id.length >= 5) {
    log(`⚠️ Dùng display_id làm waybill: ${order.display_id}`);
    return order.display_id;
  }
  
  if (order.platform_order_id && order.platform_order_id.length >= 5) {
    log(`⚠️ Dùng platform_order_id làm waybill: ${order.platform_order_id}`);
    return order.platform_order_id;
  }
  
  log('❌ Không thể trích xuất waybill từ đơn hàng này', 'WARN');
  return null;
}

/**
 * Đọc waybill từ Google Sheet
 */
async function readWaybillsFromSheet() {
  log('📖 Đang đọc waybill từ Google Sheet...');
  
  try {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
    
    // Xác thực
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[CONFIG.SHEET_NAME];
    
    if (!sheet) {
      throw new Error(`Không tìm thấy sheet: ${CONFIG.SHEET_NAME}`);
    }
    
    const rows = await sheet.getRows();
    const waybills = {};
    
    rows.forEach((row, index) => {
      const waybill = row._rawData[CONFIG.WAYBILL_COLUMN - 1];
      if (waybill && waybill.trim()) {
        waybills[waybill.trim()] = {
          row: index + 2, // +2 vì dòng 1 là header
          currentStatus: row._rawData[CONFIG.RESULT_COLUMN - 1] || ''
        };
      }
    });
    
    log(`✅ Đã đọc ${Object.keys(waybills).length} waybill từ sheet`);
    return waybills;
    
  } catch (error) {
    log(`❌ Lỗi đọc sheet: ${error.message}`, 'ERROR');
    throw error;
  }
}

/**
 * Ghi kết quả vào Google Sheet
 */
async function writeResultsToSheet(results) {
  if (results.length === 0) {
    log('Không có kết quả để ghi');
    return;
  }
  
  log(`✍️ Đang ghi ${results.length} kết quả vào sheet...`);
  
  try {
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID);
    
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    });
    
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[CONFIG.SHEET_NAME];
    
    // Cập nhật từng dòng
    for (const result of results) {
      const row = await sheet.getRows({ offset: result.row - 2, limit: 1 });
      if (row.length > 0) {
        row[0]._rawData[CONFIG.RESULT_COLUMN - 1] = result.text;
        await row[0].save();
      }
    }
    
    log(`✅ Đã ghi kết quả thành công`);
    
  } catch (error) {
    log(`❌ Lỗi ghi sheet: ${error.message}`, 'ERROR');
  }
}

/**
 * Gửi tin nhắn Telegram
 */
async function sendTelegram(message) {
  if (!CONFIG.ENABLE_TELEGRAM) {
    log('Telegram đã tắt');
    return;
  }
  
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN || CONFIG.TELEGRAM_BOT_TOKEN;
    let chatId = process.env.TELEGRAM_CHAT_ID || CONFIG.TELEGRAM_CHAT_ID;
    
    // Tự động chuẩn hóa Chat ID của Telegram (thêm -100 cho Supergroup nếu thiếu)
    if (chatId && chatId.startsWith('-') && !chatId.startsWith('-100')) {
      chatId = '-100' + chatId.substring(1);
    }
    
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    
    await axios.post(url, {
      chat_id: chatId,
      text: message,
      parse_mode: 'HTML'
    });
    
    log('✅ Đã gửi Telegram');
  } catch (error) {
    log(`❌ Gửi Telegram thất bại: ${error.message}`, 'ERROR');
  }
}

/**
 * Tạo nội dung Telegram
 */
function createTelegramMessage(stats, unshippedWaybills) {
  const now = moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY HH:mm:ss');
  const displayCount = Math.min(unshippedWaybills.length, 20);
  
  let message = `<b>🚨 CẢNH BÁO: ĐƠN CHƯA GỬI</b>\n`;
  message += `<i>📅 ${now}</i>\n`;
  message += `<i>🔢 Batch ${CONFIG.BATCH_NUMBER}/${CONFIG.TOTAL_BATCHES}</i>\n\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📦 Tổng waybill: <b>${stats.total}</b>\n`;
  message += `✅ Đã shipped: <b>${stats.shipped}</b>\n`;
  message += `⚠️ Chưa gửi: <b>${stats.unshipped}</b>\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (unshippedWaybills.length > 0) {
    message += `<b>📋 Danh sách chưa gửi:</b>\n`;
    for (let i = 0; i < displayCount; i++) {
      message += `${i + 1}. <code>${unshippedWaybills[i]}</code>\n`;
    }
    if (unshippedWaybills.length > displayCount) {
      message += `<i>... và ${unshippedWaybills.length - displayCount} mã khác</i>\n`;
    }
  }
  
  return message;
}

// ====================== HÀM CHÍNH ======================

async function main() {
  const startTime = Date.now();
  log(`🚀 BẮT ĐẦU BATCH ${CONFIG.BATCH_NUMBER}/${CONFIG.TOTAL_BATCHES}`);
  
  // Kiểm tra khung giờ
  if (!isWithinWorkingHours()) {
    const currentHour = moment().tz('Asia/Ho_Chi_Minh').format('HH');
    log(`⏰ Ngoài khung giờ hoạt động (${CONFIG.RUN_FROM_HOUR}h-${CONFIG.RUN_TO_HOUR}h). Hiện tại: ${currentHour}h. Bỏ qua.`);
    return;
  }
  
  let token = null;
  let debugMode = false;
  
  try {
    // B1: Đăng nhập
    token = await loginGS();
    
    // B2: Lấy đơn hàng (phân trang theo batch)
    const pageSize = 100;
    const startPage = (CONFIG.BATCH_NUMBER - 1) * 5 + 1;
    const endPage = startPage + 4;
    
    let allOrders = [];
    for (let page = startPage; page <= endPage; page++) {
      const orders = await getOrdersByBatch(token, page, pageSize);
      allOrders = allOrders.concat(orders);
      
      // Nếu là batch đầu tiên và page đầu, debug tìm waybill
      if (CONFIG.BATCH_NUMBER === 1 && page === startPage && orders.length > 0 && !debugMode) {
        await debugFindWaybill(orders[0]);
        debugMode = true;
      }
    }
    
    log(`📦 Đã lấy ${allOrders.length} đơn shipped từ API`);
    
    // B3: Trích xuất waybill
    const shippedWaybills = new Set();
    for (const order of allOrders) {
      const waybill = extractWaybill(order);
      if (waybill) {
        shippedWaybills.add(waybill);
      }
    }
    
    log(`📋 Có ${shippedWaybills.size} waybill unique đã shipped`);
    
    // B4: Đọc waybill từ sheet
    const scannedWaybills = await readWaybillsFromSheet();
    const allWaybills = Object.keys(scannedWaybills);
    
    if (allWaybills.length === 0) {
      log('Không có waybill nào trong sheet');
      return;
    }
    
    // B5: Đối chiếu
    const unshipped = [];
    const results = [];
    
    // Phân phối work trong batch
    const batchSize = Math.ceil(allWaybills.length / CONFIG.TOTAL_BATCHES);
    const startIdx = (CONFIG.BATCH_NUMBER - 1) * batchSize;
    const endIdx = Math.min(startIdx + batchSize, allWaybills.length);
    const myWaybills = allWaybills.slice(startIdx, endIdx);
    
    for (const waybill of myWaybills) {
      const isShipped = shippedWaybills.has(waybill);
      const result = {
        row: scannedWaybills[waybill].row,
        text: isShipped ? '✅ shipped' : '⚠️ CHƯA GỬI',
        waybill: waybill
      };
      results.push(result);
      
      if (!isShipped) {
        unshipped.push(waybill);
      }
    }
    
    log(`📊 Batch ${CONFIG.BATCH_NUMBER}: ${results.length} đơn xử lý, ${unshipped.length} đơn chưa gửi`);
    
    // B6: Ghi kết quả
    if (results.length > 0) {
      await writeResultsToSheet(results);
    }
    
    // B7: Gửi Telegram (chỉ batch 1 gửi để tránh spam)
    if (CONFIG.BATCH_NUMBER === 1 && unshipped.length > 0) {
      const stats = {
        total: allWaybills.length,
        shipped: allWaybills.length - unshipped.length,
        unshipped: unshipped.length
      };
      const message = createTelegramMessage(stats, unshipped);
      await sendTelegram(message);
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ HOÀN THÀNH trong ${elapsed} giây`);
    
  } catch (error) {
    log(`❌ LỖI NGHIÊM TRỌNG: ${error.message}`, 'ERROR');
    
    // Gửi thông báo lỗi qua Telegram
    if (CONFIG.BATCH_NUMBER === 1) {
      await sendTelegram(`🔥 <b>LỖI SCRIPT</b>\nBatch ${CONFIG.BATCH_NUMBER}\n${error.message}`);
    }
  }
}

// Chạy chương trình
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main, debugFindWaybill, extractWaybill };

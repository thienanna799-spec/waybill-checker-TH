const axios = require('axios');
const moment = require('moment-timezone');
const { CONFIG, STATUS_DISPLAY_MAP, log } = require('./config');

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
 * Tạo nội dung Telegram thông báo trạng thái chi tiết cho tất cả các trạng thái
 */
function createTelegramMessage(stats, unshippedList, statusCounts = {}, shipperCounts = {}) {
  const now = moment().tz('Asia/Ho_Chi_Minh').format('DD/MM/YYYY HH:mm:ss');
  
  let message = `📊 <b>ĐỐI CHIẾU HỆ THỐNG G-SOLUTION</b>\n`;
  message += `<i>📅 ${now}</i>\n\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `📦 Tổng scan trong sheet: <b>${stats.total}</b> mã unique\n\n`;
  
  // Liệt kê chi tiết số lượng của từng trạng thái ghi nhận được
  message += `📋 <b>Trạng thái chi tiết:</b>\n`;
  const sortedStatuses = Object.entries(statusCounts).sort((a, b) => b[1] - a[1]); // Sắp xếp theo số lượng giảm dần
  
  for (const [status, count] of sortedStatuses) {
    message += `• ${status}: <b>${count}</b> đơn\n`;
  }
  message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;

  // Liệt kê chi tiết số lượng của từng nhà vận chuyển
  if (Object.keys(shipperCounts).length > 0) {
    message += `🚚 <b>Đơn vị vận chuyển (Couriers):</b>\n`;
    const sortedShippers = Object.entries(shipperCounts).sort((a, b) => b[1] - a[1]);
    for (const [shipper, count] of sortedShippers) {
      message += `• ${shipper}: <b>${count}</b> đơn\n`;
    }
    message += `━━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  
  if (unshippedList.length > 0) {
    // Nhóm các đơn theo trạng thái tiếng Anh thực tế
    const groups = {};
    for (const x of unshippedList) {
      const status = x.status || 'cần kiểm tra';
      if (!groups[status]) {
        groups[status] = [];
      }
      groups[status].push(x.waybill);
    }
    
    // Sắp xếp và in chi tiết từng nhóm trạng thái
    for (const [status, waybills] of Object.entries(groups)) {
      message += `<b>${status} (${waybills.length}):</b>\n`;
      waybills.slice(0, 15).forEach(wb => message += `• <code>${wb}</code>\n`);
      if (waybills.length > 15) {
        message += `<i>... và ${waybills.length - 15} mã khác</i>\n`;
      }
      message += `\n`;
    }
    
    if (CONFIG.TELEGRAM_TAGS) {
      message += `${CONFIG.TELEGRAM_TAGS}`;
    }
  } else {
    message += `Tuyệt vời! Tất cả các đơn đều đang hoạt động tốt trên hệ thống.`;
  }
  
  return message;
}

module.exports = {
  sendTelegram,
  createTelegramMessage
};

require('dotenv').config();
const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');

const STATUS_DISPLAY_MAP = {
  'sale_pending': 'Pending',
  'confirmed': 'Confirmed',
  'wait_print': 'Wait Print',
  'printed': 'Printed',
  'packing': 'Packing',
  'pending': 'Waiting for pick up',
  'shipped': 'Shipped',
  'delivered': 'Delivered',
  'returning': 'Returning',
  'returned': 'Returned',
  'cancel': 'Canceled',
  'cancelled': 'Canceled',
  'canceled': 'Canceled',
  'undeliverable': 'Undeliverable',
  'picked_up': 'Picked up',
  'packed': 'Packing'
};

let CONFIG = {
  GOOGLE_SHEET_ID: process.env.GOOGLE_SHEET_ID,
  SHEET_NAME: process.env.SHEET_NAME || 'LIST WAYBILL SCAN MARCH ',
  WAYBILL_COLUMN_INDEX: parseInt(process.env.WAYBILL_COL || 2) - 1,
  STATUS_COLUMN_INDEX: parseInt(process.env.RESULT_COL || 3) - 1,
  START_ROW: parseInt(process.env.HEADER_ROW || 1) + 1,
  
  WAYBILL_COLUMN: parseInt(process.env.WAYBILL_COL || 2),
  RESULT_COLUMN: parseInt(process.env.RESULT_COL || 3),

  GS_BASE_URL: process.env.GS_BASE_URL || 'https://g-solution.vn',
  GS_LOGIN_PATH: '/api/users/login/password',
  GS_GET_ORDERS_PATH: '/api/orders/get_orders',
  GS_EMAIL: process.env.GS_EMAIL,
  GS_PASSWORD: process.env.GS_PASSWORD,
  GS_COUNTRY_CODE: parseInt(process.env.GS_COUNTRY_CODE) || 66,
  GS_SHIPPED_STATUS: process.env.GS_SHIPPED_STATUS || 'shipped',

  BATCH_NUMBER: parseInt(process.env.BATCH_NUMBER) || 1,
  TOTAL_BATCHES: parseInt(process.env.TOTAL_BATCHES) || 1,
  
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '-5245305331',
  TELEGRAM_TAGS: process.env.TELEGRAM_TAGS || '@kycgipvn @namnggg1805 @Dduong712 @Linda_Huong',
  ENABLE_TELEGRAM: true,
  SEND_TELEGRAM_TEXT_LIST: true,
  SEND_TELEGRAM_TXT_FILE: true,
  
  RUN_FROM_HOUR: 18,
  RUN_TO_HOUR: 24
};

function loadActiveConfig() {
  const configPath = path.join(__dirname, '../logs/config.json');
  let fileConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      console.error('Lỗi đọc config.json:', e.message);
    }
  }

  const merged = {
    googleSheetId: fileConfig.googleSheetId || process.env.GOOGLE_SHEET_ID,
    sheetName: fileConfig.sheetName !== undefined ? fileConfig.sheetName : (process.env.SHEET_NAME || 'LIST WAYBILL SCAN MARCH '),
    waybillCol: parseInt(fileConfig.waybillCol || process.env.WAYBILL_COL || 2),
    resultCol: parseInt(fileConfig.resultCol || process.env.RESULT_COL || 3),
    headerRow: parseInt(fileConfig.headerRow !== undefined ? fileConfig.headerRow : (process.env.HEADER_ROW || 1)),
    
    gsBaseUrl: fileConfig.gsBaseUrl || process.env.GS_BASE_URL || 'https://g-solution.vn',
    gsLoginPath: '/api/users/login/password',
    gsGetOrdersPath: '/api/orders/get_orders',
    gsEmail: fileConfig.gsEmail || process.env.GS_EMAIL,
    gsPassword: fileConfig.gsPassword || process.env.GS_PASSWORD,
    gsCountryCode: parseInt(fileConfig.gsCountryCode || process.env.GS_COUNTRY_CODE || 66),
    
    telegramBotToken: fileConfig.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN,
    telegramChatId: fileConfig.telegramChatId || process.env.TELEGRAM_CHAT_ID || '-5245305331',
    telegramTags: fileConfig.telegramTags !== undefined ? fileConfig.telegramTags : (process.env.TELEGRAM_TAGS || '@kycgipvn @namnggg1805 @Dduong712 @Linda_Huong'),
    enableTelegram: fileConfig.enableTelegram !== undefined ? !!fileConfig.enableTelegram : true,
    sendTelegramTextList: fileConfig.sendTelegramTextList !== undefined ? !!fileConfig.sendTelegramTextList : true,
    sendTelegramTxtFile: fileConfig.sendTelegramTxtFile !== undefined ? !!fileConfig.sendTelegramTxtFile : true,
    
    bypassHours: fileConfig.bypassHours !== undefined ? fileConfig.bypassHours : (process.env.BYPASS_HOURS === 'true'),
    runFromHour: parseInt(fileConfig.runFromHour !== undefined ? fileConfig.runFromHour : 18),
    runToHour: parseInt(fileConfig.runToHour !== undefined ? fileConfig.runToHour : 24),
    
    syncIntervalHours: fileConfig.syncIntervalHours !== undefined ? parseInt(fileConfig.syncIntervalHours) : 0,
    syncIntervalMinutes: fileConfig.syncIntervalMinutes !== undefined ? parseInt(fileConfig.syncIntervalMinutes) : (fileConfig.syncInterval !== undefined ? parseInt(fileConfig.syncInterval) : 5),
    syncIntervalSeconds: fileConfig.syncIntervalSeconds !== undefined ? parseInt(fileConfig.syncIntervalSeconds) : 0,
    syncInterval: parseInt(fileConfig.syncInterval || 5),
    shipperCol: fileConfig.shipperCol !== undefined && fileConfig.shipperCol !== null ? parseInt(fileConfig.shipperCol) : null,
    telegramTitle: fileConfig.telegramTitle !== undefined ? fileConfig.telegramTitle : '📊 <b>ĐỐI CHIẾU HỆ THỐNG G-SOLUTION</b>'
  };

  if (!fs.existsSync(configPath)) {
    try {
      const dir = path.dirname(configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
    } catch (err) {
      console.error('Không thể ghi khởi tạo config.json:', err.message);
    }
  }

  return merged;
}

function updateConfigFromJSON() {
  const active = loadActiveConfig();
  CONFIG.GOOGLE_SHEET_ID = active.googleSheetId;
  CONFIG.SHEET_NAME = active.sheetName;
  CONFIG.WAYBILL_COLUMN = active.waybillCol;
  CONFIG.RESULT_COLUMN = active.resultCol;
  CONFIG.SHIPPER_COLUMN = active.shipperCol || null;
  CONFIG.START_ROW = active.headerRow + 1;
  CONFIG.WAYBILL_COLUMN_INDEX = active.waybillCol - 1;
  CONFIG.STATUS_COLUMN_INDEX = active.resultCol - 1;
  
  CONFIG.GS_BASE_URL = active.gsBaseUrl;
  CONFIG.GS_EMAIL = active.gsEmail;
  CONFIG.GS_PASSWORD = active.gsPassword;
  CONFIG.GS_COUNTRY_CODE = active.gsCountryCode;
  
  CONFIG.TELEGRAM_BOT_TOKEN = active.telegramBotToken;
  CONFIG.TELEGRAM_CHAT_ID = active.telegramChatId;
  CONFIG.TELEGRAM_TAGS = active.telegramTags;
  CONFIG.TELEGRAM_TITLE = active.telegramTitle || '📊 <b>ĐỐI CHIẾU HỆ THỐNG G-SOLUTION</b>';
  CONFIG.ENABLE_TELEGRAM = active.enableTelegram;
  CONFIG.SEND_TELEGRAM_TEXT_LIST = active.sendTelegramTextList;
  CONFIG.SEND_TELEGRAM_TXT_FILE = active.sendTelegramTxtFile;
  
  CONFIG.RUN_FROM_HOUR = active.runFromHour;
  CONFIG.RUN_TO_HOUR = active.runToHour;
  CONFIG.BYPASS_HOURS = active.bypassHours;
}

// Khởi chạy đồng bộ ngay khi load module
updateConfigFromJSON();

if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

function log(message, type = 'INFO') {
  const timestamp = moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss');
  const logLine = `[${timestamp}] [${type}] [Batch ${CONFIG.BATCH_NUMBER}] ${message}`;
  console.log(logLine);
  fs.appendFileSync(`logs/batch-${CONFIG.BATCH_NUMBER}.log`, logLine + '\n');
}

function saveLatestStatus(data) {
  try {
    if (!fs.existsSync('logs')) {
      fs.mkdirSync('logs');
    }
    fs.writeFileSync('logs/latest-status.json', JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Không thể lưu trạng thái mới nhất:', err.message);
  }
}

function isWithinWorkingHours() {
  if (CONFIG.BYPASS_HOURS !== undefined) {
    if (CONFIG.BYPASS_HOURS === true) return true;
  } else if (process.env.BYPASS_HOURS === 'true') {
    return true;
  }
  const currentHour = parseInt(moment().tz('Asia/Ho_Chi_Minh').format('HH'));
  return currentHour >= CONFIG.RUN_FROM_HOUR && currentHour < CONFIG.RUN_TO_HOUR;
}

module.exports = {
  CONFIG,
  STATUS_DISPLAY_MAP,
  loadActiveConfig,
  updateConfigFromJSON,
  log,
  saveLatestStatus,
  isWithinWorkingHours
};

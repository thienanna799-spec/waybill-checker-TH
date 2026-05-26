const express = require('express');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const { main, syncDvvcOnly } = require('./index');
const { loadActiveConfig, updateConfigFromJSON, isWithinWorkingHours } = require('./config');
const axios = require('axios');

// Nạp biến môi trường
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4500;

app.use(express.json());

// Middleware chống cache các API response cho trình duyệt
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
});

// Serve giao diện tĩnh
app.use(express.static(path.join(__dirname, '../public')));

// Trạng thái khóa tránh xung đột khi chạy đè
let isRunning = false;

/**
 * Endpoint lấy trạng thái mới nhất
 */
app.get('/api/status', (req, res) => {
  const statusPath = path.join(__dirname, '../logs/latest-status.json');
  let statusData = {
    lastRun: 'Chưa chạy lần nào',
    status: 'idle',
    stats: { total: 0, shipped: 0, unshipped: 0 },
    unshippedWaybills: []
  };

  try {
    if (fs.existsSync(statusPath)) {
      statusData = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    }
  } catch (err) {
    console.error('Không thể đọc file status JSON:', err.message);
  }

  // Nếu bộ nhớ đang chạy, ép trạng thái là running
  if (isRunning) {
    statusData.status = 'running';
  }

  res.json(statusData);
});

/**
 * Endpoint lấy logs hoạt động mới nhất
 */
app.get('/api/logs', (req, res) => {
  const logPath = path.join(__dirname, '../logs/batch-1.log');
  let logs = 'Chưa có dữ liệu nhật ký.';

  try {
    if (fs.existsSync(logPath)) {
      const allLines = fs.readFileSync(logPath, 'utf8').split('\n');
      // Lấy 150 dòng cuối cùng
      logs = allLines.slice(-150).join('\n');
    }
  } catch (err) {
    logs = `Không thể đọc file log: ${err.message}`;
  }

  res.json({ logs });
});

/**
 * Endpoint kích hoạt chạy thủ công với tham số lọc động
 */
app.post('/api/trigger', async (req, res) => {
  if (isRunning) {
    return res.status(400).json({ success: false, message: 'Hệ thống đang chạy đối chiếu rồi.' });
  }

  isRunning = true;
  
  const pagesToFetch = parseInt(req.body.pagesToFetch) || 15;
  const filterDate = req.body.filterDate || null;

  console.log(`[Dashboard] Kích hoạt đối chiếu thủ công: Pages=${pagesToFetch}, Date=${filterDate || 'All'}...`);

  try {
    await main({ pagesToFetch, filterDate, silent: false });
    res.json({ success: true, message: 'Đã hoàn thành đối chiếu thành công.' });
  } catch (err) {
    console.error('[Dashboard] Lỗi chạy đối chiếu thủ công:', err.message);
    res.status(500).json({ success: false, message: err.message });
  } finally {
    isRunning = false;
  }
});

/**
 * Ghi cấu hình hoạt động vào file JSON và đồng bộ bộ nhớ
 */
const configPath = path.join(__dirname, '../logs/config.json');

function writeConfig(config) {
  try {
    if (!fs.existsSync(path.dirname(configPath))) {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    // Cập nhật cấu hình hiện tại trong index.js ngay lập tức
    updateConfigFromJSON();
  } catch (e) {
    console.error('Lỗi ghi config.json:', e.message);
  }
}

// Quản lý các bộ hẹn giờ tự động
let dvvcIntervalId = null;
let statusIntervalId = null;
let reportIntervalId = null;

let isDvvcRunning = false;
let isStatusRunning = false;
let isReportRunning = false;
let lastReportMinuteStr = '';

const runDvvcLoop = async () => {
  if (isRunning || isDvvcRunning) return;
  isDvvcRunning = true;
  try {
    console.log('[Scheduler] Bắt đầu quét ĐVVC nhanh...');
    await syncDvvcOnly();
  } catch (err) {
    console.error('[Dvvc Sync Error]:', err.message);
  } finally {
    isDvvcRunning = false;
  }
};

const runStatusLoop = async () => {
  if (isRunning || isStatusRunning) return;
  if (!isWithinWorkingHours()) return;
  isStatusRunning = true;
  try {
    console.log('[Scheduler] Bắt đầu quét Trạng thái tự động (Chế độ im lặng)...');
    await main({ pagesToFetch: 15, silent: true });
  } catch (err) {
    console.error('[Status Sync Error]:', err.message);
  } finally {
    isStatusRunning = false;
  }
};

let reportTimeoutId = null;

const runReportLoop = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    await main({ pagesToFetch: 15, silent: false });
  } catch (err) {
    console.error('[Report Scheduler Error]:', err.message);
  } finally {
    isRunning = false;
  }
};

const scheduleNextReportRun = (totalSeconds) => {
  if (reportTimeoutId) {
    clearTimeout(reportTimeoutId);
  }

  const msToWait = totalSeconds * 1000;
  const nextRun = moment().tz('Asia/Ho_Chi_Minh').add(totalSeconds, 'seconds');
  console.log(`[Scheduler] Sẽ chạy Báo cáo Telegram tự động sau: ${(totalSeconds / 60).toFixed(2)} phút (vào lúc ${nextRun.format('HH:mm:ss')}) với chu kỳ ${totalSeconds} giây`);
  
  reportTimeoutId = setTimeout(async () => {
    await runReportLoop();
    const active = loadActiveConfig();
    const secs = (active.syncIntervalHours || 0) * 3600 + (active.syncIntervalMinutes !== undefined ? active.syncIntervalMinutes : 20) * 60 + (active.syncIntervalSeconds || 0);
    scheduleNextReportRun(secs >= 5 ? secs : 1200);
  }, msToWait);
};

const startDvvcScheduler = () => {
  if (dvvcIntervalId) {
    clearInterval(dvvcIntervalId);
    dvvcIntervalId = null;
  }
  const active = loadActiveConfig();
  const secs = active.dvvcIntervalSeconds !== undefined ? active.dvvcIntervalSeconds : 60;
  if (secs > 0) {
    console.log(`[Scheduler] Bắt đầu quét ĐVVC tự động mỗi ${secs} giây.`);
    dvvcIntervalId = setInterval(runDvvcLoop, secs * 1000);
  } else {
    console.log('[Scheduler] Quét ĐVVC tự động đã tắt.');
  }
};

const startStatusScheduler = () => {
  if (statusIntervalId) {
    clearInterval(statusIntervalId);
    statusIntervalId = null;
  }
  const active = loadActiveConfig();
  const secs = active.statusIntervalSeconds !== undefined ? active.statusIntervalSeconds : 300;
  if (secs > 0) {
    console.log(`[Scheduler] Bắt đầu quét Trạng thái tự động mỗi ${secs} giây.`);
    statusIntervalId = setInterval(runStatusLoop, secs * 1000);
  } else {
    console.log('[Scheduler] Quét Trạng thái tự động đã tắt.');
  }
};

const startReportScheduler = () => {
  if (reportTimeoutId) {
    clearTimeout(reportTimeoutId);
    reportTimeoutId = null;
  }
  const active = loadActiveConfig();
  const secs = (active.syncIntervalHours || 0) * 3600 + (active.syncIntervalMinutes !== undefined ? active.syncIntervalMinutes : 20) * 60 + (active.syncIntervalSeconds || 0);
  const validSecs = secs >= 5 ? secs : 1200; // default 20 minutes if invalid
  
  console.log(`[Scheduler] Đã lên lịch gửi Báo cáo Telegram chu kỳ ${validSecs} giây.`);
  scheduleNextReportRun(validSecs);
};

const restartAllSchedulers = () => {
  console.log('[Scheduler] Đang cập nhật và khởi động lại toàn bộ lịch hẹn...');
  startDvvcScheduler();
  startStatusScheduler();
  startReportScheduler();
};

/**
 * Endpoint lấy cấu hình hiện tại
 */
app.get('/api/config', (req, res) => {
  res.json(loadActiveConfig());
});

/**
 * Endpoint cập nhật toàn bộ cấu hình hệ thống
 */
app.post('/api/config', (req, res) => {
  const newConfig = req.body;
  const config = loadActiveConfig();

  if (newConfig.syncIntervalHours !== undefined) config.syncIntervalHours = parseInt(newConfig.syncIntervalHours);
  if (newConfig.syncIntervalMinutes !== undefined) config.syncIntervalMinutes = parseInt(newConfig.syncIntervalMinutes);
  if (newConfig.syncIntervalSeconds !== undefined) config.syncIntervalSeconds = parseInt(newConfig.syncIntervalSeconds);
  
  const h = config.syncIntervalHours || 0;
  const m = config.syncIntervalMinutes !== undefined ? config.syncIntervalMinutes : 20;
  const s = config.syncIntervalSeconds || 0;
  config.syncInterval = Math.round(((h * 3600) + (m * 60) + s) / 60) || 20;
  
  if (newConfig.dvvcIntervalSeconds !== undefined) {
    const val = parseInt(newConfig.dvvcIntervalSeconds);
    if (val !== 0 && val < 5) {
      return res.status(400).json({ success: false, message: 'Chu kỳ quét ĐVVC tối thiểu là 5 giây (hoặc bằng 0 để Tắt).' });
    }
    config.dvvcIntervalSeconds = val;
  }
  
  if (newConfig.statusIntervalSeconds !== undefined) {
    const val = parseInt(newConfig.statusIntervalSeconds);
    if (val !== 0 && val < 5) {
      return res.status(400).json({ success: false, message: 'Chu kỳ quét Trạng thái tối thiểu là 5 giây (hoặc bằng 0 để Tắt).' });
    }
    config.statusIntervalSeconds = val;
  }
  
  config.bypassHours = newConfig.bypassHours !== undefined ? !!newConfig.bypassHours : config.bypassHours;
  config.runFromHour = newConfig.runFromHour !== undefined ? parseInt(newConfig.runFromHour) : config.runFromHour;
  config.runToHour = newConfig.runToHour !== undefined ? parseInt(newConfig.runToHour) : config.runToHour;
  
  config.enableTelegram = newConfig.enableTelegram !== undefined ? !!newConfig.enableTelegram : config.enableTelegram;
  config.sendTelegramTextList = newConfig.sendTelegramTextList !== undefined ? !!newConfig.sendTelegramTextList : config.sendTelegramTextList;
  config.sendTelegramTxtFile = newConfig.sendTelegramTxtFile !== undefined ? !!newConfig.sendTelegramTxtFile : config.sendTelegramTxtFile;
  if (newConfig.telegramBotToken !== undefined) config.telegramBotToken = newConfig.telegramBotToken.trim();
  if (newConfig.telegramChatId !== undefined) config.telegramChatId = newConfig.telegramChatId.trim();
  if (newConfig.telegramTags !== undefined) config.telegramTags = newConfig.telegramTags.trim();
  if (newConfig.telegramTitle !== undefined) config.telegramTitle = newConfig.telegramTitle;
  
  if (newConfig.googleSheetId !== undefined) config.googleSheetId = newConfig.googleSheetId.trim();
  if (newConfig.sheetName !== undefined) config.sheetName = newConfig.sheetName;
  if (newConfig.waybillCol !== undefined) config.waybillCol = parseInt(newConfig.waybillCol);
  if (newConfig.shipperCol !== undefined) config.shipperCol = newConfig.shipperCol !== null && newConfig.shipperCol !== '' ? parseInt(newConfig.shipperCol) : null;
  if (newConfig.resultCol !== undefined) config.resultCol = parseInt(newConfig.resultCol);
  if (newConfig.headerRow !== undefined) config.headerRow = parseInt(newConfig.headerRow);
  
  writeConfig(config);
  
  if (process.env.RUN_AS_SERVICE === 'true') {
    restartAllSchedulers();
  }
  
  res.json({ success: true, config });
});

/**
 * Endpoint kiểm tra Telegram Bot với các thông số truyền trực tiếp (để test nhanh)
 */
app.post('/api/test-telegram', async (req, res) => {
  const config = loadActiveConfig();
  const token = (req.body.telegramBotToken || config.telegramBotToken || '').trim();
  const chatId = (req.body.telegramChatId || config.telegramChatId || '').trim();

  if (!token || !chatId) {
    return res.status(400).json({ success: false, message: 'Thiếu bot token hoặc chat ID để gửi tin nhắn test.' });
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    await axios.post(url, {
      chat_id: chatId,
      text: `🔔 <b>Test Telegram Alert Bot</b>\n\nCấu hình kết nối thành công và đã được kiểm tra trực tiếp từ giao diện Web Dashboard!`,
      parse_mode: 'HTML'
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Khởi động các scheduler nếu chạy ở dạng dịch vụ nền
if (process.env.RUN_AS_SERVICE === 'true') {
  console.log('[Dashboard Server] Khởi chạy các dịch vụ tự động đồng bộ...');
  restartAllSchedulers();
}

// Start Server
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 DASHBOARD SERVER ĐANG CHẠY TẠI:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});

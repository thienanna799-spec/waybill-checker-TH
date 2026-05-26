const express = require('express');
const path = require('path');
const fs = require('fs');
const moment = require('moment-timezone');
const { main, loadActiveConfig, updateConfigFromJSON } = require('./index');
const axios = require('axios');

// Nạp biến môi trường
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4500;

app.use(express.json());

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
    await main({ pagesToFetch, filterDate });
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

// Đọc cấu hình hiện tại lúc startup và chuyển đổi sang giây
const activeCfg = loadActiveConfig();
let currentIntervalSeconds = (activeCfg.syncIntervalHours || 0) * 3600 + (activeCfg.syncIntervalMinutes !== undefined ? activeCfg.syncIntervalMinutes : 5) * 60 + (activeCfg.syncIntervalSeconds || 0);
if (currentIntervalSeconds < 5) {
  currentIntervalSeconds = 300; // default 5 minutes
}
let nextRunTimeoutId = null;

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
  
  const h = parseInt(newConfig.syncIntervalHours !== undefined ? newConfig.syncIntervalHours : 0);
  const m = parseInt(newConfig.syncIntervalMinutes !== undefined ? newConfig.syncIntervalMinutes : 5);
  const s = parseInt(newConfig.syncIntervalSeconds !== undefined ? newConfig.syncIntervalSeconds : 0);
  
  let hoursVal = h;
  let minutesVal = m;
  let secondsVal = s;
  
  if (hoursVal >= 24) {
    hoursVal = 24;
    minutesVal = 0;
    secondsVal = 0;
  }
  
  const totalSeconds = (hoursVal * 3600) + (minutesVal * 60) + secondsVal;
  
  if (totalSeconds >= 5) {
    const config = loadActiveConfig();
    
    // Cập nhật các trường cấu hình
    config.syncIntervalHours = hoursVal;
    config.syncIntervalMinutes = minutesVal;
    config.syncIntervalSeconds = secondsVal;
    config.syncInterval = Math.round(totalSeconds / 60) || 1; // Hỗ trợ backward compatibility
    
    config.bypassHours = newConfig.bypassHours !== undefined ? !!newConfig.bypassHours : config.bypassHours;
    config.runFromHour = newConfig.runFromHour !== undefined ? parseInt(newConfig.runFromHour) : config.runFromHour;
    config.runToHour = newConfig.runToHour !== undefined ? parseInt(newConfig.runToHour) : config.runToHour;
    
    config.enableTelegram = newConfig.enableTelegram !== undefined ? !!newConfig.enableTelegram : config.enableTelegram;
    if (newConfig.telegramBotToken !== undefined) config.telegramBotToken = newConfig.telegramBotToken.trim();
    if (newConfig.telegramChatId !== undefined) config.telegramChatId = newConfig.telegramChatId.trim();
    if (newConfig.telegramTags !== undefined) config.telegramTags = newConfig.telegramTags.trim();
    
    if (newConfig.googleSheetId !== undefined) config.googleSheetId = newConfig.googleSheetId.trim();
    if (newConfig.sheetName !== undefined) config.sheetName = newConfig.sheetName;
    if (newConfig.waybillCol !== undefined) config.waybillCol = parseInt(newConfig.waybillCol);
    if (newConfig.resultCol !== undefined) config.resultCol = parseInt(newConfig.resultCol);
    if (newConfig.headerRow !== undefined) config.headerRow = parseInt(newConfig.headerRow);
    
    writeConfig(config);
    
    currentIntervalSeconds = totalSeconds;
    console.log(`[Config] Đã cập nhật cấu hình mới vào config.json và đồng bộ sang index.js.`);
    
    // Nếu chế độ Service đang bật, lập tức tính toán lại lịch hẹn
    if (process.env.RUN_AS_SERVICE === 'true') {
      scheduleNextRun(currentIntervalSeconds);
    }
    
    res.json({ success: true, config });
  } else {
    res.status(400).json({ success: false, message: 'Chu kỳ quét quá ngắn. Phải tối thiểu là 5 giây.' });
  }
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

// Chạy vòng lặp tự động đồng bộ theo đúng các mốc thời gian (ví dụ chu kỳ 5p thì check lúc 0, 5, 10... phút của mỗi giờ)
const runLoop = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    // Mặc định chạy dịch vụ ẩn sẽ quét 15 trang (~1500 đơn) để bao quát 3 ngày gần nhất
    await main({ pagesToFetch: 15 });
  } catch (err) {
    console.error('[Dashboard Service Error]:', err.message);
  } finally {
    isRunning = false;
  }
};

// Lên lịch chạy đồng bộ chính xác tại các mốc giây tiếp theo
const scheduleNextRun = (totalSeconds) => {
  if (nextRunTimeoutId) {
    clearTimeout(nextRunTimeoutId);
  }

  const msToWait = totalSeconds * 1000;
  const nextRun = moment().tz('Asia/Ho_Chi_Minh').add(totalSeconds, 'seconds');
  console.log(`[Scheduler] Sẽ chạy tự động sau: ${(totalSeconds / 60).toFixed(2)} phút (vào lúc ${nextRun.format('HH:mm:ss')}) với chu kỳ ${totalSeconds} giây`);
  
  nextRunTimeoutId = setTimeout(async () => {
    await runLoop();
    scheduleNextRun(currentIntervalSeconds);
  }, msToWait);
};

if (process.env.RUN_AS_SERVICE === 'true') {
  console.log('[Dashboard Server] Khởi động vòng lặp tự động đồng bộ...');
  
  // Khởi chạy ngay lần đầu sau 5 giây
  setTimeout(async () => {
    await runLoop();
    scheduleNextRun(currentIntervalSeconds);
  }, 5000);
}

// Start Server
app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 DASHBOARD SERVER ĐANG CHẠY TẠI:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});

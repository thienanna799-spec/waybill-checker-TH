require('dotenv').config();
const moment = require('moment-timezone');

const {
  CONFIG,
  STATUS_DISPLAY_MAP,
  loadActiveConfig,
  updateConfigFromJSON,
  log,
  saveLatestStatus,
  isWithinWorkingHours
} = require('./config');

const {
  readWaybillsFromSheet,
  writeResultsToSheet
} = require('./sheets');

const {
  loginGS,
  getOrdersByKeywords,
  debugFindWaybill,
  extractWaybill
} = require('./api');

const {
  sendTelegram,
  createTelegramMessage
} = require('./telegram');

// ====================== HÀM CHÍNH ======================

async function main(options = {}) {
  // Đồng bộ cấu hình mới nhất từ file cấu hình
  updateConfigFromJSON();

  const startTime = Date.now();
  const pagesToFetch = options.pagesToFetch || 15;
  const filterDate = options.filterDate || null; // YYYY-MM-DD
  
  log(`🚀 BẮT ĐẦU CHECK TOÀN BỘ TRẠNG THÁI (Số trang: ${pagesToFetch}, Ngày: ${filterDate || 'Tất cả'})`);
  
  saveLatestStatus({
    lastRun: moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss'),
    status: 'running',
    batch: CONFIG.BATCH_NUMBER,
    totalBatches: CONFIG.TOTAL_BATCHES
  });
  
  // Kiểm tra khung giờ
  if (!isWithinWorkingHours()) {
    const currentHour = moment().tz('Asia/Ho_Chi_Minh').format('HH');
    log(`⏰ Ngoài khung giờ hoạt động (${CONFIG.RUN_FROM_HOUR}h-${CONFIG.RUN_TO_HOUR}h). Hiện tại: ${currentHour}h. Bỏ qua.`);
    return;
  }
  
  let token = null;
  
  try {
    // B1: Đọc danh sách waybill cần check từ Google Sheet trước (lọc theo ngày được chọn)
    const scannedWaybills = await readWaybillsFromSheet(filterDate);
    const allWaybills = Object.keys(scannedWaybills);
    
    if (allWaybills.length === 0) {
      log('Không có waybill nào trong sheet');
      return;
    }

    // B2: Đăng nhập G-Solution
    token = await loginGS();
    
    // B3: Lấy các đơn hàng trực tiếp bằng danh sách mã vận đơn (keyword array)
    let allOrders = [];
    const chunkSize = 50; // Quét mỗi đợt tối đa 50 mã để đảm bảo hiệu suất tốt nhất
    
    log(`📦 Đang tìm kiếm trực tiếp ${allWaybills.length} mã vận đơn trên G-Solution theo từng lô...`);
    for (let i = 0; i < allWaybills.length; i += chunkSize) {
      const chunk = allWaybills.slice(i, i + chunkSize);
      log(`   Quét lô mã [${i + 1} - ${Math.min(i + chunkSize, allWaybills.length)}] (${chunk.length} mã)...`);
      const orders = await getOrdersByKeywords(token, chunk, 100);
      
      allOrders = allOrders.concat(orders);
    }
    
    log(`📦 Tổng số đơn hàng tìm thấy từ API sau khi lọc: ${allOrders.length}`);
    
    // B4: Lập bản đồ trạng thái của toàn bộ định danh nhận diện (Display ID & Tracking Number)
    const waybillStatusMap = new Map();
    for (const order of allOrders) {
      const rawStatus = order.status || 'unknown';
      const statusStr = rawStatus.toLowerCase();
      
      let shipper = '';
      if (order.partner) {
        if (order.partner.name) {
          shipper = order.partner.name.toUpperCase();
        } else if (order.partner.partner && order.partner.partner.name) {
          shipper = order.partner.partner.name.toUpperCase();
        }
      }
      
      const statusInfo = {
        status: statusStr,
        shipper: shipper,
        date: order.inserted_at ? order.inserted_at.substring(0, 10) : ''
      };
      
      if (order.display_id) {
        waybillStatusMap.set(order.display_id.trim(), statusInfo);
      }
      if (order.platform_order_id) {
        waybillStatusMap.set(order.platform_order_id.trim(), statusInfo);
      }
      if (order.partner && order.partner.tracking_number) {
        waybillStatusMap.set(order.partner.tracking_number.trim(), statusInfo);
      }
      if (order.shipping_info && order.shipping_info.tracking_number) {
        waybillStatusMap.set(order.shipping_info.tracking_number.trim(), statusInfo);
      }
    }
    
    log(`📋 Có ${waybillStatusMap.size} định danh đơn hàng hợp lệ được lập bản đồ trạng thái`);
    
    // B5: Đối chiếu
    const unshipped = [];
    const results = [];
    let totalProcessedRows = 0;
    
    for (const waybill of allWaybills) {
      const info = waybillStatusMap.get(waybill);
      
      let text = 'cần kiểm tra';
      let statusStr = 'cần kiểm tra';
      let shipper = '';
      if (info) {
        statusStr = info.status;
        shipper = info.shipper;
        text = STATUS_DISPLAY_MAP[statusStr] || (statusStr.charAt(0).toUpperCase() + statusStr.slice(1));
      }
      
      // Ghi nhận kết quả cho tất cả các dòng trùng mã này
      const occurrences = scannedWaybills[waybill];
      for (const occ of occurrences) {
        results.push({
          row: occ.row,
          text: text,
          shipper: shipper,
          waybill: waybill
        });
        totalProcessedRows++;
      }
      
      const isOk = info && (statusStr === 'delivered' || statusStr === 'shipped' || statusStr === 'picked_up' || statusStr === 'packed');
      if (!isOk) {
        unshipped.push({
          waybill: waybill,
          status: text,
          date: info ? info.date : ''
        });
      }
    }
    
    log(`📊 Kết quả đối chiếu: ${results.length} đơn xử lý, ${unshipped.length} đơn lỗi/chưa gửi`);
    
    // B6: Ghi kết quả vào Sheet bằng Batch Update cực nhanh
    if (results.length > 0) {
      await writeResultsToSheet(results);
    }
    
    // B7: Gửi báo cáo chi tiết qua Telegram
    const statusCounts = {};
    const shipperCounts = {};
    for (const waybill of allWaybills) {
      const info = waybillStatusMap.get(waybill);
      const statusStr = info ? info.status : 'cần kiểm tra';
      const displayStatus = info ? (STATUS_DISPLAY_MAP[statusStr] || (statusStr.charAt(0).toUpperCase() + statusStr.slice(1))) : 'cần kiểm tra';
      statusCounts[displayStatus] = (statusCounts[displayStatus] || 0) + 1;
      
      if (info && info.shipper) {
        const shipperName = info.shipper;
        shipperCounts[shipperName] = (shipperCounts[shipperName] || 0) + 1;
      }
    }

    const stats = {
      total: allWaybills.length,
      shipped: allWaybills.length - unshipped.length,
      unshipped: unshipped.length
    };
    const message = createTelegramMessage(stats, unshipped, statusCounts, shipperCounts);
    await sendTelegram(message, unshipped);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    log(`✅ HOÀN THÀNH trong ${elapsed} giây`);
    
    saveLatestStatus({
      lastRun: moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss'),
      status: 'success',
      elapsedSeconds: parseFloat(elapsed),
      batch: CONFIG.BATCH_NUMBER,
      totalBatches: CONFIG.TOTAL_BATCHES,
      stats: stats,
      unshippedWaybills: unshipped
    });
    
  } catch (error) {
    log(`❌ LỖI NGHIÊM TRỌNG: ${error.message}`, 'ERROR');
    
    saveLatestStatus({
      lastRun: moment().tz('Asia/Ho_Chi_Minh').format('YYYY-MM-DD HH:mm:ss'),
      status: 'failed',
      error: error.message,
      batch: CONFIG.BATCH_NUMBER,
      totalBatches: CONFIG.TOTAL_BATCHES
    });
    
    await sendTelegram(`🔥 <b>LỖI SCRIPT</b>\nBatch ${CONFIG.BATCH_NUMBER}\n${error.message}`);
  }
}

// Chạy chương trình
if (require.main === module) {
  if (process.env.RUN_AS_SERVICE === 'true') {
    const active = loadActiveConfig();
    const intervalSec = (active.syncIntervalHours || 0) * 3600 + (active.syncIntervalMinutes !== undefined ? active.syncIntervalMinutes : 5) * 60 + (active.syncIntervalSeconds || 0);
    const ms = (intervalSec >= 5 ? intervalSec : 300) * 1000;
    
    log(`🚀 Khởi động chế độ SERVICE (Tự động chạy mỗi ${(ms / 60000).toFixed(2)} phút)...`);
    
    const runService = async () => {
      try {
        await main();
      } catch (err) {
        log(`❌ Lỗi service: ${err.message}`, 'ERROR');
      }
      
      const latestCfg = loadActiveConfig();
      const nextSec = (latestCfg.syncIntervalHours || 0) * 3600 + (latestCfg.syncIntervalMinutes !== undefined ? latestCfg.syncIntervalMinutes : 5) * 60 + (latestCfg.syncIntervalSeconds || 0);
      const nextMs = (nextSec >= 5 ? nextSec : 300) * 1000;
      log(`⏳ Đang chờ ${(nextMs / 60000).toFixed(2)} phút cho lần chạy tiếp theo...`);
      
      setTimeout(runService, nextMs);
    };
    
    runService();
  } else {
    main().catch(console.error);
  }
}

module.exports = {
  main,
  debugFindWaybill,
  extractWaybill,
  loadActiveConfig,
  updateConfigFromJSON
};

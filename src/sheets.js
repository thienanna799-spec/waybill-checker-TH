const moment = require('moment-timezone');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const { CONFIG, log } = require('./config');

/**
 * Hàm so khớp ngày trong Google Sheet với filterDate dạng YYYY-MM-DD
 */
function matchSheetDate(cellValue, filterDateYMD) {
  if (!cellValue) return false;
  const valStr = String(cellValue).trim();
  
  // filterDateYMD: "YYYY-MM-DD" -> target: "DD/MM/YYYY" hoặc "DD/MM"
  const targetDDMMYYYY = moment(filterDateYMD, 'YYYY-MM-DD').format('DD/MM/YYYY');
  const targetDDMM = moment(filterDateYMD, 'YYYY-MM-DD').format('DD/MM');
  
  if (valStr.includes(targetDDMMYYYY) || valStr.startsWith(targetDDMM)) {
    return true;
  }
  
  const num = parseFloat(valStr);
  if (!isNaN(num) && num > 40000 && num < 60000) {
    const dateObj = new Date((num - 25569) * 86400 * 1000);
    const dateMoment = moment(dateObj);
    if (dateMoment.format('YYYY-MM-DD') === filterDateYMD) {
      return true;
    }
  }
  
  return false;
}

/**
 * Khởi tạo tài liệu Google Spreadsheet với xác thực JWT (v4)
 */
function getSpreadsheetDoc() {
  const serviceAccountAuth = new JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file'
    ]
  });
  return new GoogleSpreadsheet(CONFIG.GOOGLE_SHEET_ID || process.env.GOOGLE_SHEET_ID, serviceAccountAuth);
}

/**
 * Đọc waybill từ Google Sheet (Hỗ trợ trùng lặp và lọc theo ngày)
 */
async function readWaybillsFromSheet(filterDate = null, dvvcOnly = false) {
  log('📖 Đang đọc waybill từ Google Sheet...');
  
  try {
    const doc = getSpreadsheetDoc();
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[CONFIG.SHEET_NAME];
    
    if (!sheet) {
      throw new Error(`Không tìm thấy sheet: ${CONFIG.SHEET_NAME}`);
    }
    
    // Tự động tìm cột ĐVVC theo tên cột tiêu đề nếu không cấu hình rõ ràng
    let shipperColIndex = CONFIG.SHIPPER_COLUMN ? (CONFIG.SHIPPER_COLUMN - 1) : null;
    if (shipperColIndex === null) {
      const headerRowIndex = CONFIG.START_ROW - 2 >= 0 ? CONFIG.START_ROW - 2 : 0;
      try {
        await sheet.loadCells({
          startRowIndex: headerRowIndex,
          endRowIndex: headerRowIndex + 1,
          startColumnIndex: 0,
          endColumnIndex: Math.min(30, sheet.columnCount || 30)
        });
        for (let c = 0; c < 30; c++) {
          const cell = sheet.getCell(headerRowIndex, c);
          if (cell && cell.value) {
            const valStr = String(cell.value).toUpperCase().trim();
            if (
              valStr === 'SHIPPING UNIT' || 
              valStr === 'SHIPPING' || 
              valStr === 'SHIPPER' || 
              valStr === 'ĐƠN VỊ VẬN CHUYỂN' || 
              valStr === 'ĐVVC'
            ) {
              shipperColIndex = c;
              break;
            }
          }
        }
      } catch (err) {
        log(`⚠️ Không thể tự động quét cột ĐVVC từ header: ${err.message}`);
      }
    }
    
    const rows = await sheet.getRows();
    const waybills = {};
    let totalCount = 0;
    
    rows.forEach((row, index) => {
      // Lọc theo ngày nếu có yêu cầu
      if (filterDate) {
        const dateVal = row._rawData[0];
        if (!matchSheetDate(dateVal, filterDate)) {
          return; // Bỏ qua dòng không đúng ngày được chọn
        }
      }
      
      const waybill = row._rawData[CONFIG.WAYBILL_COLUMN - 1];
      if (waybill && waybill.trim()) {
        const wb = waybill.trim();
        
        // Trạng thái hiện tại trong sheet
        const currentStatus = (row._rawData[CONFIG.RESULT_COLUMN - 1] || '').trim();
        
        // ĐVVC hiện tại trong sheet (nếu tìm thấy hoặc cấu hình)
        const currentShipper = shipperColIndex !== null ? (row._rawData[shipperColIndex] || '').trim() : '';
        
        if (dvvcOnly) {
          // Chế độ quét ĐVVC liên tục: chỉ quét dòng chưa có ĐVVC
          if (currentShipper) {
            return;
          }
        } else {
          // Chế độ quét trạng thái định kỳ: bỏ qua dòng đã giao/huỷ/hoàn thành
          const isFinalStatus = currentStatus === 'Delivered' || currentStatus === 'Canceled' || currentStatus === 'Returned';
          if (isFinalStatus) {
            return; 
          }
        }
        
        if (!waybills[wb]) {
          waybills[wb] = [];
        }
        waybills[wb].push({
          row: row.rowNumber, // Sử dụng thuộc tính rowNumber gốc của google-spreadsheet
          currentStatus: currentStatus
        });
        totalCount++;
      }
    });
    
    log(`✅ Đã đọc ${totalCount} dòng waybill (${Object.keys(waybills).length} mã unique) từ sheet`);
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
  
  log(`✍️ Đang ghi ${results.length} kết quả vào sheet bằng Batch Update...`);
  
  try {
    const doc = getSpreadsheetDoc();
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle[CONFIG.SHEET_NAME];
    
    if (!sheet) {
      throw new Error(`Không tìm thấy sheet: ${CONFIG.SHEET_NAME}`);
    }
    
    const maxRow = Math.max(...results.map(r => r.row));
    const colIndex = CONFIG.RESULT_COLUMN - 1;
    
    // Xác định cột SHIPPING UNIT
    let shipperColIndex = CONFIG.SHIPPER_COLUMN ? (CONFIG.SHIPPER_COLUMN - 1) : null;
    
    // Dòng header (dòng tiêu đề là CONFIG.START_ROW - 2)
    const headerRowIndex = CONFIG.START_ROW - 2 >= 0 ? CONFIG.START_ROW - 2 : 0;
    
    // Tính toán maxColIndex động để bao phủ đầy đủ tất cả các cột đích
    const colIndices = [colIndex];
    if (shipperColIndex !== null) {
      colIndices.push(shipperColIndex);
    }
    const maxColIndex = Math.min(Math.max(...colIndices) + 1, sheet.columnCount || 20);
    
    // Tải toàn bộ vùng dữ liệu để đọc header và cập nhật
    await sheet.loadCells({
      startRowIndex: 0,
      endRowIndex: maxRow,
      startColumnIndex: 0,
      endColumnIndex: maxColIndex
    });
    
    // Nếu không cấu hình rõ ràng, tự động tìm cột theo tên cột tiêu đề
    if (shipperColIndex === null) {
      shipperColIndex = colIndex + 1; // Fallback mặc định là cột bên phải cột Status
      for (let c = 0; c < maxColIndex; c++) {
        const cell = sheet.getCell(headerRowIndex, c);
        if (cell && cell.value) {
          const valStr = String(cell.value).toUpperCase().trim();
          if (
            valStr === 'SHIPPING UNIT' || 
            valStr === 'SHIPPING' || 
            valStr === 'SHIPPER' || 
            valStr === 'ĐƠN VỊ VẬN CHUYỂN' || 
            valStr === 'ĐVVC'
          ) {
            shipperColIndex = c;
            break;
          }
        }
      }
    }
    
    log(`📊 Định vị cột: Status ở cột ${colIndex + 1}, Shipping Unit ở cột ${shipperColIndex + 1}`);
    
    for (const result of results) {
      const cellStatus = sheet.getCell(result.row - 1, colIndex);
      cellStatus.value = result.text;
      
      const cellShipper = sheet.getCell(result.row - 1, shipperColIndex);
      cellShipper.value = result.shipper || '';
    }
    
    await sheet.saveUpdatedCells();
    log(`✅ Đã ghi kết quả thành công`);
    
  } catch (error) {
    log(`❌ Lỗi ghi sheet: ${error.message}`, 'ERROR');
  }
}

module.exports = {
  readWaybillsFromSheet,
  writeResultsToSheet
};

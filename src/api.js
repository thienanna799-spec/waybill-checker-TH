const axios = require('axios');
const { CONFIG, log } = require('./config');

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
 * Lấy các đơn hàng khớp với danh sách mã vận đơn (keyword) theo lô (chunk)
 */
async function getOrdersByKeywords(token, keywords, pageSize = 100) {
  const url = `${CONFIG.GS_BASE_URL}${CONFIG.GS_GET_ORDERS_PATH}?access_token=${token}&country_code=${CONFIG.GS_COUNTRY_CODE}&page=1&page_size=${pageSize}`;
  
  try {
    const response = await axios.post(
      url,
      {
        filter: {
          keyword: keywords
        }
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
    log(`❌ Lấy đơn hàng theo danh sách mã thất bại: ${error.message}`, 'ERROR');
    throw error;
  }
}

/**
 * DEBUG: Tìm kiếm waybill trong cấu trúc đơn hàng
 */
async function debugFindWaybill(order) {
  log('🔍 ĐANG DÒ TÌM FIELD WAYBILL...');
  
  const waybillFields = [
    'tracking_number', 'tracking_no', 'tracking_code', 'tracking',
    'waybill', 'waybill_number', 'waybill_code',
    'awb', 'awb_code', 'awb_number',
    'shipment_code', 'shipping_code', 'delivery_code',
    'lwb_code', 'reference_no', 'order_reference'
  ];
  
  const foundFields = [];
  
  for (const field of waybillFields) {
    if (order[field] && typeof order[field] === 'string' && order[field].trim()) {
      foundFields.push({ level: 'order', field, value: order[field] });
      log(`✅ TÌM THẤY: order.${field} = "${order[field]}"`);
    }
  }
  
  if (order.shipping_info && typeof order.shipping_info === 'object') {
    for (const field of waybillFields) {
      if (order.shipping_info[field] && typeof order.shipping_info[field] === 'string' && order.shipping_info[field].trim()) {
        foundFields.push({ level: 'shipping_info', field, value: order.shipping_info[field] });
        log(`✅ TÌM THẤY: shipping_info.${field} = "${order.shipping_info[field]}"`);
      }
    }
  }
  
  if (order.service_partner && typeof order.service_partner === 'object') {
    for (const field of waybillFields) {
      if (order.service_partner[field] && typeof order.service_partner[field] === 'string' && order.service_partner[field].trim()) {
        foundFields.push({ level: 'service_partner', field, value: order.service_partner[field] });
        log(`✅ TÌM THẤY: service_partner.${field} = "${order.service_partner[field]}"`);
      }
    }
  }

  if (order.partner && typeof order.partner === 'object') {
    for (const field of waybillFields) {
      if (order.partner[field] && typeof order.partner[field] === 'string' && order.partner[field].trim()) {
        foundFields.push({ level: 'partner', field, value: order.partner[field] });
        log(`✅ TÌM THẤY: partner.${field} = "${order.partner[field]}"`);
      }
    }
  }
  
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
  const priorityFields = ['tracking_number', 'waybill', 'awb', 'tracking_code'];
  
  for (const field of priorityFields) {
    if (order[field] && typeof order[field] === 'string' && order[field].trim()) {
      const value = order[field].trim();
      if (value.length >= 5) {
        log(`📦 Lấy waybill từ order.${field}: ${value}`);
        return value;
      }
    }
    
    if (order.shipping_info && order.shipping_info[field] && 
        typeof order.shipping_info[field] === 'string' && 
        order.shipping_info[field].trim()) {
      const value = order.shipping_info[field].trim();
      if (value.length >= 5) {
        log(`📦 Lấy waybill từ shipping_info.${field}: ${value}`);
        return value;
      }
    }

    if (order.service_partner && order.service_partner[field] && 
        typeof order.service_partner[field] === 'string' && 
        order.service_partner[field].trim()) {
      const value = order.service_partner[field].trim();
      if (value.length >= 5) {
        log(`📦 Lấy waybill từ service_partner.${field}: ${value}`);
        return value;
      }
    }

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

module.exports = {
  loginGS,
  getOrdersByKeywords,
  debugFindWaybill,
  extractWaybill
};

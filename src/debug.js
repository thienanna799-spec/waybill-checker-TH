const { main, debugFindWaybill, extractWaybill } = require('./index');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');

async function debugComplete() {
  console.log('🔍 ===== DEBUG HOÀN CHỈNH =====\n');
  
  // Đăng nhập
  console.log('1. Đăng nhập G-Solution...');
  const loginResponse = await axios.post(
    'https://g-solution.vn/api/users/login/password',
    {
      username: process.env.GS_EMAIL,
      password: process.env.GS_PASSWORD
    }
  );
  
  const token = loginResponse.data.data.access_token;
  console.log('✅ Đăng nhập thành công\n');
  
  // Lấy 1 đơn hàng mẫu
  console.log('2. Lấy đơn hàng mẫu...');
  const orderResponse = await axios.post(
    `https://g-solution.vn/api/orders/get_orders?access_token=${token}&country_code=${process.env.GS_COUNTRY_CODE}&page=1&page_size=1`,
    { filter: { status: 'shipped' } }
  );
  
  const sampleOrder = orderResponse.data.data.data[0];
  console.log('✅ Đã lấy đơn hàng mẫu\n');
  
  // In toàn bộ cấu trúc
  console.log('3. CẤU TRÚC ĐẦY ĐỦ CỦA ĐƠN HÀNG:');
  console.log(JSON.stringify(sampleOrder, null, 2));
  console.log('\n');
  
  // Tìm waybill
  console.log('4. TÌM KIẾM WAYBILL:');
  await debugFindWaybill(sampleOrder);
  
  // Thử extract
  console.log('\n5. THỬ EXTRACT WAYBILL:');
  const waybill = extractWaybill(sampleOrder);
  console.log(`Kết quả: ${waybill || 'KHÔNG TÌM THẤY'}`);
  
  console.log('\n===== KẾT THÚC DEBUG =====');
}

debugComplete();

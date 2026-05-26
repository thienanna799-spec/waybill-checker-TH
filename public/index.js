let isChecking = false;
let unshippedList = [];

// Tự động load dữ liệu khi mở trang
document.addEventListener("DOMContentLoaded", () => {
  populateDates();
  fetchStatus();
  fetchConfig();
  loadLogs();
  // Polling để cập nhật trạng thái mới nhất
  setInterval(fetchStatus, 5000);
  setInterval(loadLogs, 10000);
});

function populateDates() {
  const selectDate = document.getElementById('select-date');
  const dates = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    const displayDate = `${dd}/${mm}`;
    
    let label = '';
    if (i === 0) label = 'Hôm nay';
    else if (i === 1) label = 'Hôm qua';
    else if (i === 2) label = 'Hôm kia';
    
    dates.push({ value: dateStr, text: `${label} (${displayDate})` });
  }
  
  selectDate.innerHTML = `<option value="">Cả 3 ngày gần đây</option>` + 
    dates.map(d => `<option value="${d.value}">${d.text}</option>`).join('');
}

function validateSyncInputs() {
  const h = parseInt(document.getElementById('cfg-sync-hours').value) || 0;
  if (h >= 24) {
    document.getElementById('cfg-sync-minutes').value = 0;
    document.getElementById('cfg-sync-seconds').value = 0;
  }
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    
    // Đổ dữ liệu vào select chu kỳ
    const hoursSelect = document.getElementById('cfg-sync-hours');
    let hoursOpts = '';
    for (let h = 0; h <= 24; h++) {
      hoursOpts += `<option value="${h}">${h} giờ</option>`;
    }
    hoursSelect.innerHTML = hoursOpts;

    const minutesSelect = document.getElementById('cfg-sync-minutes');
    let minutesOpts = '';
    for (let m = 0; m < 60; m++) {
      minutesOpts += `<option value="${m}">${m} phút</option>`;
    }
    minutesSelect.innerHTML = minutesOpts;

    const secondsSelect = document.getElementById('cfg-sync-seconds');
    let secondsOpts = '';
    for (let s = 0; s < 60; s++) {
      secondsOpts += `<option value="${s}">${s} giây</option>`;
    }
    secondsSelect.innerHTML = secondsOpts;

    let hours = data.syncIntervalHours || 0;
    let minutes = data.syncIntervalMinutes !== undefined ? data.syncIntervalMinutes : 5;
    let seconds = data.syncIntervalSeconds || 0;

    // Backward compatibility fallback
    if (hours === 0 && minutes === 0 && seconds === 0 && data.syncInterval) {
      hours = Math.floor(data.syncInterval / 60);
      minutes = data.syncInterval % 60;
    }

    hoursSelect.value = hours;
    minutesSelect.value = minutes;
    secondsSelect.value = seconds;

    const pad = (num) => String(num).padStart(2, '0');
    document.getElementById('display-sync-interval').innerText = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

    // Đổ dữ liệu vào select Giờ bắt đầu/kết thúc
    const fromSelect = document.getElementById('cfg-run-from');
    const toSelect = document.getElementById('cfg-run-to');
    
    let fromOpts = '';
    for (let h = 0; h < 24; h++) {
      fromOpts += `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`;
    }
    fromSelect.innerHTML = fromOpts;
    
    let toOpts = '';
    for (let h = 1; h <= 24; h++) {
      toOpts += `<option value="${h}">${String(h).padStart(2, '0')}:00</option>`;
    }
    toSelect.innerHTML = toOpts;
    
    // Gán các giá trị từ config
    document.getElementById('cfg-bypass-hours').checked = !!data.bypassHours;
    document.getElementById('cfg-run-from').value = data.runFromHour !== undefined ? data.runFromHour : 18;
    document.getElementById('cfg-run-to').value = data.runToHour !== undefined ? data.runToHour : 24;
    
    document.getElementById('cfg-enable-telegram').checked = !!data.enableTelegram;
    document.getElementById('cfg-telegram-send-text').checked = data.sendTelegramTextList !== undefined ? !!data.sendTelegramTextList : true;
    document.getElementById('cfg-telegram-send-file').checked = data.sendTelegramTxtFile !== undefined ? !!data.sendTelegramTxtFile : true;
    document.getElementById('cfg-telegram-token').value = data.telegramBotToken || '';
    document.getElementById('cfg-telegram-chat').value = data.telegramChatId || '';
    document.getElementById('cfg-telegram-tags').value = data.telegramTags || '';
    
    document.getElementById('cfg-sheet-id').value = data.googleSheetId || '';
    document.getElementById('cfg-sheet-name').value = data.sheetName || '';
    document.getElementById('cfg-col-waybill').value = data.waybillCol !== undefined ? data.waybillCol : 2;
    document.getElementById('cfg-col-shipper').value = data.shipperCol !== undefined && data.shipperCol !== null ? data.shipperCol : '';
    document.getElementById('cfg-col-result').value = data.resultCol !== undefined ? data.resultCol : 3;
    document.getElementById('cfg-row-header').value = data.headerRow !== undefined ? data.headerRow : 1;
    
    toggleHoursFields();
  } catch (err) {
    console.error('Lỗi khi tải cấu hình:', err);
  }
}

function toggleHoursFields() {
  const bypass = document.getElementById('cfg-bypass-hours').checked;
  const group = document.getElementById('cfg-hours-group');
  if (bypass) {
    group.style.opacity = '0.35';
    document.getElementById('cfg-run-from').disabled = true;
    document.getElementById('cfg-run-to').disabled = true;
  } else {
    group.style.opacity = '1';
    document.getElementById('cfg-run-from').disabled = false;
    document.getElementById('cfg-run-to').disabled = false;
  }
}

async function saveConfig() {
  const h = parseInt(document.getElementById('cfg-sync-hours').value) || 0;
  let m = parseInt(document.getElementById('cfg-sync-minutes').value) || 0;
  let s = parseInt(document.getElementById('cfg-sync-seconds').value) || 0;

  if (h >= 24) {
    m = 0;
    s = 0;
    document.getElementById('cfg-sync-minutes').value = 0;
    document.getElementById('cfg-sync-seconds').value = 0;
  }

  const shipperVal = document.getElementById('cfg-col-shipper').value.trim();

  const payload = {
    syncIntervalHours: h,
    syncIntervalMinutes: m,
    syncIntervalSeconds: s,
    bypassHours: document.getElementById('cfg-bypass-hours').checked,
    runFromHour: parseInt(document.getElementById('cfg-run-from').value),
    runToHour: parseInt(document.getElementById('cfg-run-to').value),
    
    enableTelegram: document.getElementById('cfg-enable-telegram').checked,
    sendTelegramTextList: document.getElementById('cfg-telegram-send-text').checked,
    sendTelegramTxtFile: document.getElementById('cfg-telegram-send-file').checked,
    telegramBotToken: document.getElementById('cfg-telegram-token').value,
    telegramChatId: document.getElementById('cfg-telegram-chat').value,
    telegramTags: document.getElementById('cfg-telegram-tags').value,
    
    googleSheetId: document.getElementById('cfg-sheet-id').value,
    sheetName: document.getElementById('cfg-sheet-name').value,
    waybillCol: parseInt(document.getElementById('cfg-col-waybill').value),
    shipperCol: shipperVal !== '' ? parseInt(shipperVal) : null,
    resultCol: parseInt(document.getElementById('cfg-col-result').value),
    headerRow: parseInt(document.getElementById('cfg-row-header').value)
  };
  
  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      alert('Đã lưu cấu hình thành công!');
      const pad = (num) => String(num).padStart(2, '0');
      document.getElementById('display-sync-interval').innerText = `${pad(h)}:${pad(m)}:${pad(s)}`;
    } else {
      alert('Lỗi khi lưu cấu hình: ' + result.message);
    }
  } catch (err) {
    alert('Lỗi kết nối: ' + err.message);
  }
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    
    // Cập nhật card trạng thái hệ thống
    const cardSys = document.getElementById('card-system');
    const pulse = document.getElementById('status-pulse');
    const statusLabel = document.getElementById('status-label');
    
    if (data.status === 'running' || isChecking) {
      cardSys.className = "card card-status-running";
      pulse.className = "pulse-dot pulse-dot-warning";
      statusLabel.innerText = "Đang check...";
      document.getElementById('btn-trigger').disabled = true;
      document.getElementById('btn-trigger').innerHTML = `<span class="spinner"></span> Chạy đối chiếu...`;
    } else if (data.status === 'failed') {
      cardSys.className = "card card-status-failed";
      pulse.className = "pulse-dot pulse-dot-danger";
      statusLabel.innerText = "Lỗi check";
      document.getElementById('btn-trigger').disabled = false;
      document.getElementById('btn-trigger').innerText = `Chạy đối chiếu ngay`;
    } else {
      cardSys.className = "card card-status-success";
      pulse.className = "pulse-dot pulse-dot-success";
      statusLabel.innerText = "Đang chạy";
      document.getElementById('btn-trigger').disabled = false;
      document.getElementById('btn-trigger').innerText = `Chạy đối chiếu ngay`;
    }

    // Cập nhật stats
    if (data.stats) {
      document.getElementById('stats-total').innerText = data.stats.total || 0;
      document.getElementById('stats-shipped').innerText = data.stats.shipped || 0;
      document.getElementById('stats-unshipped').innerText = data.stats.unshipped || 0;
      
      if (data.stats.total > 0) {
        const percent = (data.stats.shipped / data.stats.total) * 100;
        document.getElementById('progress-bar').style.width = `${percent}%`;
      } else {
        document.getElementById('progress-bar').style.width = `0%`;
      }
    }

    // Cập nhật thời gian thực thi
    if (data.elapsedSeconds !== undefined) {
      document.getElementById('exec-elapsed').innerHTML = `${data.elapsedSeconds} <span class="card-value-small">giây</span>`;
    }
    if (data.lastRun) {
      document.getElementById('exec-last-run').innerText = data.lastRun;
    }

    // Lưu trữ danh sách chưa gửi và render ra bảng
    if (data.unshippedWaybills) {
      unshippedList = data.unshippedWaybills;
      renderWaybillsTable(unshippedList);
    }
  } catch (err) {
    console.error('Lỗi khi fetch status:', err);
  }
}

function renderWaybillsTable(list) {
  const tbody = document.getElementById('waybills-list-body');
  
  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="3">
          <div class="empty-state">
            <div class="empty-icon" style="color: var(--success);">✓</div>
            <p>Tuyệt vời! Tất cả đơn hàng đều hoạt động tốt.</p>
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = list.map((item, idx) => {
    const waybill = typeof item === 'string' ? item : item.waybill;
    const status = typeof item === 'string' ? 'chưa gửi' : item.status;
    
    let badgeClass = 'waybill-badge-unshipped';
    if (status === 'cancel' || status === 'cancelled') {
      badgeClass = 'waybill-badge-cancel';
    } else if (status !== 'chưa gửi') {
      badgeClass = 'waybill-badge-other';
    }

    return `
      <tr>
        <td style="color: var(--text-muted); font-family: var(--font-mono);">${idx + 2}</td>
        <td style="font-family: var(--font-mono); font-weight: 500;">${waybill}</td>
        <td style="text-align: center;">
          <span class="waybill-badge ${badgeClass}">${status}</span>
        </td>
      </tr>
    `;
  }).join('');
}

async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    const term = document.getElementById('terminal-body');
    term.innerText = data.logs || 'Chưa có dữ liệu nhật ký.';
    term.scrollTop = term.scrollHeight;
  } catch (err) {
    console.error('Lỗi tải logs:', err);
  }
}

async function triggerCheck() {
  if (isChecking) return;
  isChecking = true;
  
  const filterDate = document.getElementById('select-date').value;
  const pagesToFetch = document.getElementById('select-pages').value;

  const btn = document.getElementById('btn-trigger');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> Đang chạy...`;
  
  try {
    const res = await fetch('/api/trigger', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filterDate, pagesToFetch })
    });
    const result = await res.json();
    
    if (result.success) {
      alert('Check hoàn thành thành công!');
    } else {
      alert('Lỗi: ' + result.message);
    }
  } catch (err) {
    alert('Lỗi kết nối: ' + err.message);
  } finally {
    isChecking = false;
    fetchStatus();
    loadLogs();
  }
}

async function testTelegram() {
  const token = document.getElementById('cfg-telegram-token').value.trim();
  const chatId = document.getElementById('cfg-telegram-chat').value.trim();
  
  const btn = document.getElementById('btn-test-telegram');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Đang gửi...';
  }
  
  try {
    const res = await fetch('/api/test-telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramBotToken: token, telegramChatId: chatId })
    });
    const result = await res.json();
    if (result.success) {
      alert('Đã gửi tin nhắn test qua Telegram bot thành công! Vui lòng kiểm tra nhóm/kênh Telegram của bạn.');
    } else {
      alert('Gửi Telegram thất bại: ' + result.message);
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Test Bot';
    }
  }
}

function copyUnshippedList() {
  if (unshippedList.length === 0) {
    alert('Không có mã nào để copy');
    return;
  }
  const text = unshippedList.map(item => typeof item === 'string' ? item : item.waybill).join('\n');
  navigator.clipboard.writeText(text)
    .then(() => alert(`Đã copy ${unshippedList.length} mã waybill vào Clipboard!`))
    .catch(err => alert('Không thể copy: ' + err));
}

function filterWaybills() {
  const q = document.getElementById('search-waybill').value.toLowerCase().trim();
  if (!q) {
    renderWaybillsTable(unshippedList);
    return;
  }
  const filtered = unshippedList.filter(item => {
    const waybill = typeof item === 'string' ? item : item.waybill;
    return waybill.toLowerCase().includes(q);
  });
  renderWaybillsTable(filtered);
}

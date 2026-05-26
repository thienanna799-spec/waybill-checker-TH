const { exec } = require('child_process');
const path = require('path');

// 10 minutes interval
const INTERVAL_MS = 10 * 60 * 1000;

function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr });
      } else {
        resolve(stdout);
      }
    });
  });
}

async function autoPush() {
  const timestamp = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  console.log(`[${timestamp}] Đang kiểm tra thay đổi git...`);
  
  try {
    // Check if we are inside a git repo
    try {
      await runCommand('git rev-parse --is-inside-work-tree');
    } catch (err) {
      console.log(`[${timestamp}] Chưa khởi tạo git. Đang tiến hành git init...`);
      await runCommand('git init');
      await runCommand('git branch -M main');
    }

    // Check if remote origin is configured
    let hasRemote = false;
    try {
      const remotes = await runCommand('git remote');
      if (remotes.includes('origin')) {
        hasRemote = true;
      }
    } catch (err) {
      // Ignored
    }

    if (!hasRemote) {
      console.log(`[${timestamp}] Đang cấu hình remote origin...`);
      await runCommand('git remote add origin https://github.com/thienanna799-spec/waybill-checker-TH.git');
      await runCommand('git branch -M main');
    }

    // Check status
    const status = await runCommand('git status --porcelain');
    if (!status.trim()) {
      console.log(`[${timestamp}] Không có thay đổi nào cần commit.`);
      return;
    }
    
    console.log(`[${timestamp}] Phát hiện thay đổi. Đang thêm file (git add .)...`);
    await runCommand('git add .');
    
    const commitMsg = `auto-commit: ${timestamp}`;
    console.log(`[${timestamp}] Đang commit: "${commitMsg}"`);
    await runCommand(`git commit -m "${commitMsg}"`);
    
    console.log(`[${timestamp}] Đang push lên GitHub...`);
    const pushOutput = await runCommand('git push origin main');
    console.log(`[${timestamp}] Đã đẩy code thành công lên GitHub!\n${pushOutput}`);
  } catch (err) {
    console.error(`[${timestamp}] Lỗi xảy ra khi tự động push:`, err.stderr || err.error || err);
  }
}

// Chạy lần đầu ngay khi start
autoPush();

// Lặp lại mỗi 10 phút
setInterval(autoPush, INTERVAL_MS);
console.log(`Dịch vụ Git Pusher đã khởi động. Sẽ tự động push mỗi 10 phút.`);

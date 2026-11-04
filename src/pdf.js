// .pptx -> .pdf (LibreOffice orqali). LibreOffice yo'q bo'lsa xato beradi, bot esa faqat .pptx yuboradi.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const config = require('./config');

function candidates() {
  const list = [];
  if (config.SOFFICE_PATH) list.push(config.SOFFICE_PATH);
  list.push('soffice', 'libreoffice');
  if (process.platform === 'win32') {
    list.push('C:\\Program Files\\LibreOffice\\program\\soffice.exe');
    list.push('C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe');
  }
  if (process.platform === 'darwin') list.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  return list;
}

function run(cmd, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'ignore' });
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('PDF konvertatsiya vaqti tugadi'));
    }, timeoutMs);
    p.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    p.on('exit', (code) => {
      clearTimeout(t);
      code === 0 ? resolve() : reject(new Error('soffice chiqish kodi ' + code));
    });
  });
}

// LibreOffice bir vaqtda bitta jarayonni yaxshi ko'taradi, shuning uchun navbatga qo'yamiz.
let queue = Promise.resolve();

function toPdf(pptxPath) {
  const job = queue.then(async () => {
    const outDir = path.dirname(pptxPath);
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lo-'));
    const args = [
      '--headless',
      '-env:UserInstallation=' + pathToFileURL(profile).href,
      '--convert-to',
      'pdf',
      '--outdir',
      outDir,
      pptxPath,
    ];
    let lastErr = null;
    try {
      for (const cmd of candidates()) {
        try {
          await run(cmd, args, 180000);
          const pdf = pptxPath.replace(/\.pptx$/i, '.pdf');
          if (fs.existsSync(pdf)) return pdf;
        } catch (e) {
          lastErr = e;
        }
      }
    } finally {
      fs.rmSync(profile, { recursive: true, force: true });
    }
    throw lastErr || new Error('LibreOffice topilmadi');
  });
  queue = job.catch(() => {});
  return job;
}

module.exports = { toPdf };

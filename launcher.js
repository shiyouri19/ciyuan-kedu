/**
 * 桌面启动器。
 *
 * 由「次元刻度.vbs」用 wscript 无窗口调用，负责：
 *   1. 读出端口
 *   2. 服务已经在跑就直接开窗口（不重复起进程）
 *   3. 没跑就后台起服务，日志写到 logs/startup.log
 *   4. 轮询等待就绪，成功才开窗口
 *   5. 起不来就弹中文提示 + 日志路径，而不是静默失败
 *
 * 以前是 .vbs 里直接 `cmd /c node ...`，一旦 node 不在 PATH、
 * 端口被占、依赖的数据库损坏，用户看到的就是「双击没反应」。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'startup.log');

function readPort() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    return Number(cfg.port) || 7345;
  } catch {
    return 7345;
  }
}

async function isAlive(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(1200)
    });
    if (!res.ok) return false;
    const body = await res.json().catch(() => null);
    // 认准是自己的服务：7345 可能被别的程序占着，光看端口通不通会误判
    return body?.app === '次元刻度' || body?.ok === true;
  } catch {
    return false;
  }
}

/**
 * 找一个真的在跑的实例。
 *
 * server/index.js 在端口被占时会自动顺延（7345 → 7346 → …），
 * 只盯着配置里那一个端口的话，服务明明起在 7346 也会被判成「启动失败」。
 */
async function findRunningPort(preferred) {
  const candidates = [preferred];
  for (let p = preferred + 1; p <= preferred + 9; p += 1) candidates.push(p);
  for (const p of candidates) {
    if (await isAlive(p)) return p;
  }
  return null;
}

function findBrowser() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** 用独立应用窗口打开（没有地址栏和标签页，像原生程序） */
function openWindow(port, { appMode = true } = {}) {
  const url = `http://127.0.0.1:${port}`;
  const browser = appMode ? findBrowser() : null;
  const args = browser ? ['/c', 'start', '', browser, `--app=${url}`] : ['/c', 'start', '', url];
  spawn('cmd', args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

/** 用 PowerShell 弹一个中文提示框（wscript 的 MsgBox 受编码限制） */
function alert(title, message) {
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.MessageBox]::Show(@'
${message}
'@, @'
${title}
'@, 'OK', 'Warning') | Out-Null
`;
  const child = spawn(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps],
    { detached: true, stdio: 'ignore', windowsHide: true }
  );
  child.unref();
}

function tailLog(lines = 12) {
  try {
    const text = fs.readFileSync(LOG_FILE, 'utf8');
    return text.split(/\r?\n/).filter(Boolean).slice(-lines).join('\n');
  } catch {
    return '(没有日志)';
  }
}

async function main() {
  const basePort = readPort();

  // 已经在跑：直接开窗口（可能是顺延到 7346 的实例）
  const running = await findRunningPort(basePort);
  if (running) {
    openWindow(running);
    return;
  }

  // 起服务，输出落盘
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logStream = fs.openSync(LOG_FILE, 'a');
  const stamp = new Date().toLocaleString('zh-CN');
  fs.writeSync(logStream, `\n===== ${stamp} 启动 =====\n`);

  const child = spawn(
    process.execPath,
    ['--disable-warning=ExperimentalWarning', path.join(ROOT, 'server', 'index.js')],
    {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', logStream, logStream],
      windowsHide: true,
      // 两个变量都传：老代码认 NO_OPEN，新代码两个都认，避免再出现「传了没生效」
      env: { ...process.env, NO_OPEN: '1', APP_NO_OPEN: '1' }
    }
  );
  child.unref();

  // 轮询等待就绪（首次启动要跑迁移，给足 30 秒）。
  // 端口可能被占后顺延，所以每轮都扫一段端口，而不是死等 basePort。
  const deadline = Date.now() + 30000;
  let readyPort = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    readyPort = await findRunningPort(basePort);
    if (readyPort) break;
    if (child.exitCode !== null && child.exitCode !== 0) break;
  }

  if (readyPort) {
    openWindow(readyPort);
    return;
  }

  alert(
    '次元刻度 启动失败',
    `服务没能在 30 秒内就绪（尝试端口 ${basePort} ~ ${basePort + 9}）。\n\n` +
      `常见原因：这些端口都被别的程序占用、Node 版本过低、数据库文件损坏。\n\n` +
      `日志：${LOG_FILE}\n\n最近的输出：\n${tailLog()}`
  );
}

main().catch((err) => {
  alert('次元刻度 启动失败', `启动器自己出错了：\n${err?.message ?? err}`);
});

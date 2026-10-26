// UI 交互探针：用 CDP 驱动 Edge 无头模式，执行一段 JS 后截图。
// 用法：node .uiprobe.mjs <url> <输出png> "<要执行的JS>"
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9223;
const url = process.argv[2] ?? 'http://127.0.0.1:7345';
const out = process.argv[3] ?? '.shot.png';
const script = process.argv[4] ?? '';

const proc = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--incognito',
    '--disable-application-cache',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${path.resolve('.edge-tmp')}`,
    '--window-size=1280,960',
    url
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(250);
  }
  throw new Error('CDP 未就绪');
}

const wsUrl = await findTarget();
const ws = new WebSocket(wsUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error('WebSocket 连接失败'));
});

let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  }
};

function send(method, params = {}) {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

try {
  await send('Page.enable');
  await send('Runtime.enable');
  await sleep(1400);

  if (script) {
    const r = await send('Runtime.evaluate', {
      expression: script,
      awaitPromise: true,
      returnByValue: true
    });
    if (r.result?.exceptionDetails) {
      console.error('脚本异常:', JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    } else if (r.result?.result?.value !== undefined) {
      console.log('脚本返回:', JSON.stringify(r.result.result.value).slice(0, 300));
    }
    await sleep(7000);
  }

  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  if (!shot.result?.data) throw new Error('截图失败');
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  console.log(`已截图 ${out}`);
} finally {
  try {
    ws.close();
  } catch {}
  proc.kill();
  await sleep(300);
}

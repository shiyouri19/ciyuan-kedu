import { exec, execFile } from 'node:child_process';
import fs from 'node:fs';
import { loadConfig } from './config.js';
import { openDatabase, closeDatabase } from './db/index.js';
import { seedInitialLibraryIfNeeded } from './db/seed.js';
import { createServer } from './http.js';
import { configure as configureBangumi, apiBase as bangumiApiBase } from './providers/bangumi.js';
import { configure as configureDandanplay } from './providers/dandanplay.js';

const MAX_PORT_ATTEMPTS = 10;

function listenWithFallback(server, startPort, host, attempt = 0) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('error', onError);
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
        console.warn(`[server] 端口 ${startPort + attempt} 被占用，尝试下一个`);
        listenWithFallback(server, startPort, host, attempt + 1).then(resolve, reject);
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(startPort + attempt, host, () => {
      server.removeListener('error', onError);
      resolve(server.address().port);
    });
  });
}

function openBrowserCrossPlatform(url, { appWindow = false } = {}) {
  const platform = process.platform;
  if (platform === 'win32') {
    if (appWindow) {
      // 优先以 Edge / Chrome 独立桌面应用窗口模式（无地址栏、无标签栏）打开
      exec(`start "" msedge --app="${url}"`, (edgeErr) => {
        if (!edgeErr) return;
        exec(`start "" chrome --app="${url}"`, (chromeErr) => {
          if (!chromeErr) return;
          exec(`start "" "${url}"`);
        });
      });
      return;
    }
    // Windows 下使用 exec('start "" "url"')（Node 自动启用 windowsVerbatimArguments），失败时回退 rundll32 与 explorer
    exec(`start "" "${url}"`, (err) => {
      if (!err) return;
      execFile('rundll32.exe', ['url.dll,FileProtocolHandler', url], (err2) => {
        if (!err2) return;
        execFile('explorer.exe', [url], (err3) => {
          if (err3) {
            console.warn(`[server] 自动打开浏览器失败，请手动在浏览器访问 ${url}`);
          }
        });
      });
    });
  } else if (platform === 'darwin') {
    execFile('open', [url], (err) => {
      if (err) console.warn(`[server] 自动打开浏览器失败，请手动访问 ${url}`);
    });
  } else {
    execFile('xdg-open', [url], (err) => {
      if (err) console.warn(`[server] 自动打开浏览器失败，请手动访问 ${url}`);
    });
  }
}

const cfg = loadConfig();
const HOST = process.env.HOST || cfg.host || '127.0.0.1';
const PORT = Number(process.env.PORT) || Number(cfg.port) || 7345;

configureBangumi({ apiBase: cfg.bangumiApiBase });
configureDandanplay({
  appId: cfg.dandanplayAppId,
  appSecret: cfg.dandanplayAppSecret,
  apiBase: cfg.dandanplayApiBase
});

let opened;
try {
  opened = openDatabase(cfg.dataDir);
} catch (err) {
  console.error(`[server] 数据库初始化失败：${err.message}`);
  console.error(`[server] 数据目录：${cfg.dataDir}`);
  process.exit(1);
}

const { db, file, migrations, schemaVersion } = opened;

if (migrations.applied.length > 0) {
  console.log(
    `[db] 已应用迁移：${migrations.applied.map((m) => m.file).join(', ')}（版本 ${migrations.from} → ${migrations.to}）`
  );
}

if (process.env.SEED_DEMO === '1' || cfg.seedDemo === true) {
  try {
    const seedRes = seedInitialLibraryIfNeeded(db);
    if (seedRes.seeded) {
      console.log(`[db] 已预置 ${seedRes.count} 部示例番剧`);
    }
  } catch (err) {
    console.warn(`[db] 示例数据初始化跳过：${err.message}`);
  }
}

// 版本号从 package.json 读，别在代码里再写一份（写死必然和发布版本对不上）
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const server = createServer({ db, cfg, schemaVersion, appVersion: pkg.version });

try {
  const port = await listenWithFallback(server, PORT, HOST);
  const displayHost = HOST === '0.0.0.0' || HOST === '::' ? '127.0.0.1' : HOST;
  const targetUrl = `http://${displayHost}:${port}`;
  console.log('');
  console.log('  次元刻度 · 服务已启动');
  console.log('  ─────────────────────────────');
  console.log(`  地址      ${targetUrl}`);
  console.log(`  数据目录  ${cfg.dataDir}`);
  console.log(`  数据库    ${file}`);
  console.log(`  架构版本  v${schemaVersion}`);
  console.log(`  数据源    ${(cfg.enabledSources || ['dandanplay', 'bangumi']).join(', ')}`);
  console.log(`  Bangumi   ${bangumiApiBase()}`);
  console.log('');
  console.log('  Ctrl+C 停止服务');
  console.log('');

  const shouldOpen =
    !process.argv.includes('--no-open') &&
    process.env.NO_OPEN !== '1' &&
    process.env.CI !== 'true';
  const useAppWindow = process.argv.includes('--app-window') || process.env.APP_WINDOW === '1';
  if (shouldOpen) {
    setTimeout(() => {
      openBrowserCrossPlatform(targetUrl, { appWindow: useAppWindow });
    }, 200);
  }
} catch (err) {
  console.error(`[server] 启动失败：${err.message}`);
  process.exit(1);
}

function shutdown(signal) {
  console.log(`\n[server] 收到 ${signal}，正在关闭…`);
  server.close(() => {
    closeDatabase(db);
    process.exit(0);
  });
  setTimeout(() => {
    closeDatabase(db);
    process.exit(0);
  }, 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

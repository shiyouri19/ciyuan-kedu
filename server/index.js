import { exec } from 'node:child_process';
import { loadConfig } from './config.js';
import { openDatabase, closeDatabase } from './db/index.js';
import { createServer } from './http.js';
import { configure as configureBangumi, apiBase as bangumiApiBase } from './providers/bangumi.js';

const HOST = '127.0.0.1';
const MAX_PORT_ATTEMPTS = 10;

function listenWithFallback(server, startPort, attempt = 0) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      server.removeListener('error', onError);
      if (err.code === 'EADDRINUSE' && attempt < MAX_PORT_ATTEMPTS) {
        console.warn(`[server] 端口 ${startPort + attempt} 被占用，尝试下一个`);
        listenWithFallback(server, startPort, attempt + 1).then(resolve, reject);
      } else {
        reject(err);
      }
    };
    server.once('error', onError);
    server.listen(startPort + attempt, HOST, () => {
      server.removeListener('error', onError);
      resolve(server.address().port);
    });
  });
}

const cfg = loadConfig();
configureBangumi({ apiBase: cfg.bangumiApiBase });

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

const server = createServer({ db, cfg, schemaVersion });

try {
  const port = await listenWithFallback(server, cfg.port);
  console.log('');
  console.log('  次元刻度 · 骨架已启动');
  console.log('  ─────────────────────────────');
  console.log(`  地址      http://${HOST}:${port}`);
  console.log(`  数据目录  ${cfg.dataDir}`);
  console.log(`  数据库    ${file}`);
  console.log(`  架构版本  v${schemaVersion}`);
  console.log(`  Bangumi   ${bangumiApiBase()}`);
  console.log('');
  console.log('  Ctrl+C 停止服务');
  console.log('');

  // 只有服务真正开始监听之后才打开浏览器，避免「拒绝连接」
  if (process.argv.includes('--open')) {
    setTimeout(() => {
      exec(`start "" "http://${HOST}:${port}"`, (err) => {
        if (err) {
          console.warn(`[server] 自动打开浏览器失败，请手动访问 http://${HOST}:${port}`);
        }
      });
    }, 150);
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

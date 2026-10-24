import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const WEB_DIR = path.join(ROOT, 'web');
const CONFIG_PATH = path.join(ROOT, 'config.json');

export const DEFAULTS = {
  dataDir: 'E:\\次元刻度',
  port: 7345,
  proxy: '',
  proxyProbe: ['127.0.0.1:7897', '127.0.0.1:7890', '127.0.0.1:10809', '127.0.0.1:1080'],
  // Bangumi API 基址。默认官方地址，在大陆直连不通（域名被墙）；
  // 填一个没被墙的中转地址即可免代理使用，例如自建的反向代理。
  bangumiApiBase: 'https://api.bgm.tv',
  userAgent: 'fan-zhang/0.1 (personal anime ledger)'
};

export function loadConfig() {
  let user = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      user = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.warn('[config] config.json 解析失败，改用默认配置:', e.message);
    }
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2), 'utf8');
  }
  return { ...DEFAULTS, ...user };
}

export function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf8');
}

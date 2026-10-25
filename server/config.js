import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..');
export const WEB_DIR = path.join(ROOT, 'web');
const CONFIG_PATH = path.join(ROOT, 'config.json');

export const DEFAULT_DISCOVERY_TEMPLATES = [
  {
    id: 'mikan',
    name: '蜜柑计划 Mikan',
    url: 'https://mikanani.me/Home/Search?searchstr={keyword}',
    enabled: true
  },
  {
    id: 'dmhy',
    name: '动漫花园 DMHY',
    url: 'https://share.dmhy.org/topics/list?keyword={keyword}',
    enabled: true
  },
  {
    id: 'bangumi',
    name: 'Bangumi 番组计划',
    url: 'https://bgm.tv/subject_search/{keyword}?cat=2',
    enabled: true
  },
  {
    id: 'nyaa',
    name: 'Nyaa',
    url: 'https://nyaa.si/?f=0&c=1_0&q={keyword}',
    enabled: true
  }
];

export const DEFAULTS = {
  dataDir: process.env.DATA_DIR || process.env.FANZHANG_DATA_DIR || path.join(ROOT, 'data'),
  port: Number(process.env.PORT) || 7345,
  host: process.env.HOST || '127.0.0.1',
  proxy: '',
  proxyProbe: ['127.0.0.1:7897', '127.0.0.1:7890', '127.0.0.1:10809'],
  enabledSources: ['dandanplay', 'bangumi'],
  // Bangumi API 基址：支持替换为任意国内可直连的反向代理或镜像地址
  bangumiApiBase: process.env.BANGUMI_API_BASE || 'https://api.bgm.tv',
  // 弹弹Play开放平台密钥（B-006）：填入即可启用弹弹Play搜索、新番导览与视频文件指纹匹配
  dandanplayAppId: process.env.DANDANPLAY_APP_ID || '',
  dandanplayAppSecret: process.env.DANDANPLAY_APP_SECRET || '',
  dandanplayApiBase: process.env.DANDANPLAY_API_BASE || 'https://api.dandanplay.net',
  dandanplayStrategy: 'economy',
  dandanplaySafetyRatio: 0.9,
  // 资源发现中心 URL 模板（Stage 8）：使用 {keyword} 占位符并自动 URL 编码
  discoveryTemplates: DEFAULT_DISCOVERY_TEMPLATES,
  // CORS 默认不发。前端是同源加载的，不需要这个头；
  // 发 `*` 等于允许本机任意网页跨域调这个服务（含 /api/shutdown）。
  // 真要做云端 + 独立前端部署时再在 config.json 里显式写来源。
  corsOrigin: process.env.CORS_ORIGIN || '',
  accessToken: process.env.ACCESS_TOKEN || '',
  userAgent: 'fan-zhang/0.5 (personal anime ledger)',
  seedDemo: false,
  // 空闲多少分钟后自动退出服务（0 = 不自动退出）。
  // 前端页面开着会每 30 秒发心跳，所以关掉网页后开始计时。
  idleShutdownMinutes: 5
};

export function loadConfig(overrides = {}) {
  /**
   * 配置可能有两份：
   * - 项目根 config.json（CONFIG_PATH）——「程序放到哪」
   * - 数据目录 config.json——「数据放到哪」，saveConfig 会写到这里
   *
   * 以前只读项目根那份，而保存写的是数据目录那份，结果是：
   * 在界面上填的密钥重启后就没了。现在两份都读，数据目录优先，
   * 但 dataDir 字段以项目根为准（否则两边互相覆盖就定不下来了）。
   */
  const readJsonSafe = (p) => {
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.warn('[config] 解析失败:', p, e.message);
      return null;
    }
  };

  let user = readJsonSafe(CONFIG_PATH) ?? {};
  let needsSave = !fs.existsSync(CONFIG_PATH);

  const probeDir = path.resolve(user.dataDir || DEFAULTS.dataDir);
  const dataCfgPath = path.join(probeDir, 'config.json');
  if (dataCfgPath !== path.resolve(CONFIG_PATH)) {
    const dataCfg = readJsonSafe(dataCfgPath);
    if (dataCfg) {
      user = { ...user, ...dataCfg, dataDir: user.dataDir || dataCfg.dataDir || DEFAULTS.dataDir };
    }
  }

  // 在非 Windows 环境下自动修正旧版遗留的 Windows 盘符路径（不强行覆写用户端口或代理探测列表）
  if (!user.dataDir || user.dataDir === 'E:\\次元刻度' || /^[A-Za-z]:\\/.test(String(user.dataDir))) {
    if (process.platform !== 'win32') {
      user.dataDir = DEFAULTS.dataDir;
      needsSave = true;
    }
  }
  if (!Array.isArray(user.enabledSources) || user.enabledSources.length === 0) {
    user.enabledSources = DEFAULTS.enabledSources;
    needsSave = true;
  } else {
    // 清理已移除的旧源（bilibili / anilist），仅保留 dandanplay 与 bangumi
    const cleaned = user.enabledSources.filter((s) => s === 'dandanplay' || s === 'bangumi');
    if (cleaned.length !== user.enabledSources.length || cleaned.length === 0) {
      user.enabledSources = cleaned.length > 0 ? cleaned : DEFAULTS.enabledSources;
      needsSave = true;
    }
  }

  const merged = { ...DEFAULTS, ...user, ...overrides };
  if (process.env.PORT) merged.port = Number(process.env.PORT) || 7345;
  if (process.env.HOST) merged.host = process.env.HOST;
  if (process.env.ACCESS_TOKEN !== undefined) merged.accessToken = process.env.ACCESS_TOKEN;
  if (process.env.DATA_DIR || process.env.FANZHANG_DATA_DIR) {
    merged.dataDir = process.env.DATA_DIR || process.env.FANZHANG_DATA_DIR;
  }

  if (needsSave) {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
    } catch {
      /* 只读文件系统下忽略写配置失败 */
    }
  }
  return merged;
}

export function saveConfig(cfgOrDataDir, maybeUpdates) {
  const cfg = typeof cfgOrDataDir === 'object' && cfgOrDataDir !== null ? cfgOrDataDir : maybeUpdates || {};
  const next = { ...DEFAULTS, ...cfg };
  try {
    const targetFile =
      typeof cfgOrDataDir === 'string'
        ? path.join(path.resolve(cfgOrDataDir), 'config.json')
        : cfg?.dataDir && path.resolve(cfg.dataDir) !== path.resolve(DEFAULTS.dataDir)
          ? path.join(path.resolve(cfg.dataDir), 'config.json')
          : CONFIG_PATH;
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, JSON.stringify(next, null, 2), 'utf8');
  } catch {
    /* ignore write error on read-only fs */
  }
  return next;
}

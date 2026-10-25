import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requestJson } from '../net.js';
import { normalize } from './bangumi.js';
import { NotFoundError } from '../errors.js';

const API_BASE = 'https://api.dandanplay.net';

/**
 * 弹弹Play开放平台官方配额上限（对应官方「功能组当前状态」面板）：
 * - 搜索 (search): 当日 100 / 当月 2,400
 * - 番剧详情 (bangumi): 当日 200 / 当月 4,800
 * - 获取弹幕 (comment_get): 当日 100 / 当月 2,400
 * - 发送弹幕 (comment_send): 当日 10 / 当月 240
 * - 文件识别 (match): 当日 200 / 当月 4,800
 */
export const QUOTA_DEFINITIONS = [
  { key: 'search', label: '搜索', dailyLimit: 100, monthlyLimit: 2400 },
  { key: 'bangumi', label: '番剧详情', dailyLimit: 200, monthlyLimit: 4800 },
  { key: 'comment_get', label: '获取弹幕', dailyLimit: 100, monthlyLimit: 2400 },
  { key: 'comment_send', label: '发送弹幕', dailyLimit: 10, monthlyLimit: 240 },
  { key: 'match', label: '文件识别', dailyLimit: 200, monthlyLimit: 4800 }
];

const QUOTA_DEF_MAP = new Map(QUOTA_DEFINITIONS.map((d) => [d.key, d]));

const RESPONSE_CACHE = new Map();
const CACHE_TTL = {
  search: 24 * 60 * 60 * 1000, // 搜索缓存 24 小时
  bangumi: 7 * 24 * 60 * 60 * 1000, // 番剧详情缓存 7 天
  seasonal: 24 * 60 * 60 * 1000, // 季度番表缓存 24 小时
  calendar: 12 * 60 * 60 * 1000, // 每日放送缓存 12 小时
  match: 30 * 24 * 60 * 60 * 1000 // 视频文件指纹匹配缓存 30 天
};

let quotaState = null;
let quotaFilePath = null;

function currentDayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function currentMonthKey() {
  return currentDayKey().slice(0, 7);
}

function createFreshQuotaState() {
  const day = currentDayKey();
  const month = currentMonthKey();
  const groups = {};
  for (const def of QUOTA_DEFINITIONS) {
    groups[def.key] = {
      dailyUsed: 0,
      monthlyUsed: 0,
      blockedCount: 0,
      cacheHits: 0
    };
  }
  return {
    dayKey: day,
    monthKey: month,
    updatedAt: new Date().toISOString(),
    groups
  };
}

function resolveQuotaFilePath(cfg) {
  if (cfg?.dataDir) {
    return path.join(cfg.dataDir, 'dandanplay-quota.json');
  }
  return quotaFilePath;
}

function ensureQuotaState(cfg) {
  const targetPath = resolveQuotaFilePath(cfg);
  if (!quotaState || (targetPath && targetPath !== quotaFilePath)) {
    quotaFilePath = targetPath;
    if (quotaFilePath && fs.existsSync(quotaFilePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(quotaFilePath, 'utf8'));
        quotaState = raw && typeof raw === 'object' ? raw : createFreshQuotaState();
      } catch {
        quotaState = createFreshQuotaState();
      }
    } else if (!quotaState) {
      quotaState = createFreshQuotaState();
    }
  }

  const today = currentDayKey();
  const thisMonth = currentMonthKey();
  let changed = false;

  if (!quotaState.groups || typeof quotaState.groups !== 'object') {
    quotaState.groups = {};
    changed = true;
  }

  for (const def of QUOTA_DEFINITIONS) {
    if (!quotaState.groups[def.key]) {
      quotaState.groups[def.key] = {
        dailyUsed: 0,
        monthlyUsed: 0,
        blockedCount: 0,
        cacheHits: 0
      };
      changed = true;
    }
  }

  if (quotaState.monthKey !== thisMonth) {
    quotaState.monthKey = thisMonth;
    quotaState.dayKey = today;
    for (const def of QUOTA_DEFINITIONS) {
      quotaState.groups[def.key].dailyUsed = 0;
      quotaState.groups[def.key].monthlyUsed = 0;
    }
    changed = true;
  } else if (quotaState.dayKey !== today) {
    quotaState.dayKey = today;
    for (const def of QUOTA_DEFINITIONS) {
      quotaState.groups[def.key].dailyUsed = 0;
    }
    changed = true;
  }

  if (changed) {
    persistQuotaState();
  }
  return quotaState;
}

function persistQuotaState() {
  if (!quotaState) return;
  quotaState.updatedAt = new Date().toISOString();
  if (!quotaFilePath) return;
  try {
    const dir = path.dirname(quotaFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(quotaFilePath, JSON.stringify(quotaState, null, 2), 'utf8');
  } catch {
    /* ignore write error on read-only fs */
  }
}

export function normalizeSafetyRatio(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0.9;
  return Math.max(0.5, Math.min(1.0, Math.round(n * 100) / 100));
}

export function getQuotaStatus(cfg = {}) {
  const st = ensureQuotaState(cfg);
  const safetyRatio = normalizeSafetyRatio(cfg?.dandanplaySafetyRatio ?? 0.9);
  const strategy = cfg?.dandanplayStrategy === 'always' ? 'always' : 'economy';

  const groups = QUOTA_DEFINITIONS.map((def) => {
    const g = st.groups[def.key] || { dailyUsed: 0, monthlyUsed: 0, blockedCount: 0, cacheHits: 0 };
    const dailySafeCap = Math.max(1, Math.floor(def.dailyLimit * safetyRatio));
    const monthlySafeCap = Math.max(1, Math.floor(def.monthlyLimit * safetyRatio));
    const dailyPct = Math.min(100, Math.round((g.dailyUsed / def.dailyLimit) * 100));
    const monthlyPct = Math.min(100, Math.round((g.monthlyUsed / def.monthlyLimit) * 100));
    return {
      key: def.key,
      label: def.label,
      dailyUsed: g.dailyUsed,
      dailyLimit: def.dailyLimit,
      dailySafeCap,
      dailyPercent: dailyPct,
      monthlyUsed: g.monthlyUsed,
      monthlyLimit: def.monthlyLimit,
      monthlySafeCap,
      monthlyPercent: monthlyPct,
      cacheHits: g.cacheHits || 0,
      blockedCount: g.blockedCount || 0,
      exhausted: g.dailyUsed >= dailySafeCap || g.monthlyUsed >= monthlySafeCap
    };
  });

  return {
    dayKey: st.dayKey,
    monthKey: st.monthKey,
    updatedAt: st.updatedAt,
    safetyRatio,
    strategy,
    cacheEntries: RESPONSE_CACHE.size,
    groups
  };
}

/**
 * 手动校准或重置配额读数（例如用户在其他客户端使用了额度，或希望重置计数）。
 */
export function updateQuotaReadings(cfg = {}, { resetAll = false, groups = {} } = {}) {
  const st = ensureQuotaState(cfg);
  if (resetAll) {
    for (const def of QUOTA_DEFINITIONS) {
      st.groups[def.key] = {
        dailyUsed: 0,
        monthlyUsed: 0,
        blockedCount: 0,
        cacheHits: 0
      };
    }
  } else if (groups && typeof groups === 'object') {
    for (const def of QUOTA_DEFINITIONS) {
      const patch = groups[def.key];
      if (!patch || typeof patch !== 'object') continue;
      if (patch.dailyUsed !== undefined) {
        st.groups[def.key].dailyUsed = Math.max(0, Math.min(def.dailyLimit, Number(patch.dailyUsed) || 0));
      }
      if (patch.monthlyUsed !== undefined) {
        st.groups[def.key].monthlyUsed = Math.max(
          st.groups[def.key].dailyUsed,
          Math.min(def.monthlyLimit, Number(patch.monthlyUsed) || 0)
        );
      }
    }
  }
  persistQuotaState();
  return getQuotaStatus(cfg);
}

/**
 * 检查当前功能组是否允许发起真实网络调用（未超安全上限）。
 */
export function canConsumeQuota(groupKey, cfg = {}) {
  const def = QUOTA_DEF_MAP.get(groupKey);
  if (!def) return true;
  const st = ensureQuotaState(cfg);
  const g = st.groups[groupKey];
  const ratio = normalizeSafetyRatio(cfg?.dandanplaySafetyRatio ?? 0.9);
  const dailySafeCap = Math.max(1, Math.floor(def.dailyLimit * ratio));
  const monthlySafeCap = Math.max(1, Math.floor(def.monthlyLimit * ratio));
  return g.dailyUsed < dailySafeCap && g.monthlyUsed < monthlySafeCap;
}

function recordCacheHit(groupKey, cfg = {}) {
  const st = ensureQuotaState(cfg);
  if (st.groups[groupKey]) {
    st.groups[groupKey].cacheHits = (st.groups[groupKey].cacheHits || 0) + 1;
  }
}

function checkAndConsumeQuota(groupKey, cfg = {}) {
  const def = QUOTA_DEF_MAP.get(groupKey);
  if (!def) return;
  const st = ensureQuotaState(cfg);
  const g = st.groups[groupKey];
  const ratio = normalizeSafetyRatio(cfg?.dandanplaySafetyRatio ?? 0.9);
  const dailySafeCap = Math.max(1, Math.floor(def.dailyLimit * ratio));
  const monthlySafeCap = Math.max(1, Math.floor(def.monthlyLimit * ratio));

  if (g.dailyUsed >= dailySafeCap) {
    g.blockedCount = (g.blockedCount || 0) + 1;
    persistQuotaState();
    const err = new Error(
      `弹弹Play「${def.label}」今日调用已达自动保护上限 (${g.dailyUsed}/${dailySafeCap}，官方日限额 ${def.dailyLimit})，已自动拦截避免超额`
    );
    err.code = 'dandanplay_quota_exceeded';
    throw err;
  }

  if (g.monthlyUsed >= monthlySafeCap) {
    g.blockedCount = (g.blockedCount || 0) + 1;
    persistQuotaState();
    const err = new Error(
      `弹弹Play「${def.label}」本月调用已达自动保护上限 (${g.monthlyUsed}/${monthlySafeCap}，官方月限额 ${def.monthlyLimit})，已自动拦截避免超额`
    );
    err.code = 'dandanplay_quota_exceeded';
    throw err;
  }

  g.dailyUsed += 1;
  g.monthlyUsed += 1;
  persistQuotaState();
}

export function getCachedResponse(cacheKey, groupKey, cfg = {}) {
  const hit = RESPONSE_CACHE.get(cacheKey);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    RESPONSE_CACHE.delete(cacheKey);
    return null;
  }
  if (groupKey) recordCacheHit(groupKey, cfg);
  return hit.value;
}

function setCachedResponse(cacheKey, value, ttl) {
  if (RESPONSE_CACHE.size > 600) {
    const firstKey = RESPONSE_CACHE.keys().next().value;
    if (firstKey) RESPONSE_CACHE.delete(firstKey);
  }
  RESPONSE_CACHE.set(cacheKey, { at: Date.now(), ttl, value });
}

export function clearDandanCache() {
  RESPONSE_CACHE.clear();
}

/**
 * 计算弹弹Play开放平台 API v2 签名：
 * base64(sha256(AppId + Timestamp + Path + AppSecret))
 */
let currentAppId = '';
let currentAppSecret = '';

export function configure({ appId, appSecret } = {}) {
  if (typeof appId === 'string') currentAppId = appId.trim();
  if (typeof appSecret === 'string' && appSecret !== '********') {
    currentAppSecret = appSecret.trim();
  }
}

export function computeSignature(appId, timestamp, apiPath, appSecret) {
  const cleanPath = String(apiPath ?? '').split('?')[0];
  const raw = `${appId}${timestamp}${cleanPath}${appSecret}`;
  return crypto.createHash('sha256').update(raw, 'utf8').digest('base64');
}

export function buildSignature({ appId, appSecret, path, timestamp }) {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  return computeSignature(appId ?? currentAppId, ts, path, appSecret ?? currentAppSecret);
}

export function hasCredentials(cfg) {
  if (cfg) {
    return Boolean(
      typeof cfg.dandanplayAppId === 'string' &&
        cfg.dandanplayAppId.trim() &&
        typeof cfg.dandanplayAppSecret === 'string' &&
        cfg.dandanplayAppSecret.trim()
    );
  }
  return Boolean(currentAppId && currentAppSecret);
}

export function buildAuthHeaders(arg1, appSecret, apiPath, ua) {
  if (arg1 && typeof arg1 === 'object') {
    const id = String(arg1.appId ?? currentAppId ?? '').trim();
    const secret = String(arg1.appSecret ?? currentAppSecret ?? '').trim();
    const p = String(arg1.path ?? '').split('?')[0];
    const ts = arg1.timestamp ?? Math.floor(Date.now() / 1000);
    const sig = computeSignature(id, ts, p, secret);
    return {
      Accept: 'application/json',
      'User-Agent': arg1.ua || 'fan-zhang/0.4 (personal anime ledger)',
      'X-AppId': id,
      'X-Timestamp': String(ts),
      'X-Signature': sig
    };
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = computeSignature(arg1, timestamp, apiPath, appSecret);
  return {
    Accept: 'application/json',
    'User-Agent': ua || 'fan-zhang/0.4 (personal anime ledger)',
    'X-AppId': arg1,
    'X-Timestamp': String(timestamp),
    'X-Signature': signature
  };
}

/**
 * 弹弹Play 番剧搜索（带 24h 缓存与「搜索」100次/日配额守卫）。
 */
export async function search(
  keyword,
  { proxy = '', ua, limit = 8, appId = '', appSecret = '', cfg = null } = {}
) {
  const id = String(appId || cfg?.dandanplayAppId || '').trim();
  const secret = String(appSecret || cfg?.dandanplayAppSecret || '').trim();
  if (!id || !secret) {
    throw new Error('弹弹Play 密钥待配置（请在设置中填入 AppId 与 AppSecret）');
  }

  const kw = String(keyword ?? '').trim();
  const cacheKey = `search::${kw.toLowerCase()}`;
  const cached = getCachedResponse(cacheKey, 'search', cfg);
  if (cached) {
    return cached.slice(0, limit);
  }

  checkAndConsumeQuota('search', cfg);

  const apiPath = '/api/v2/search/anime';
  const url = `${API_BASE}${apiPath}?keyword=${encodeURIComponent(kw)}`;
  const res = await requestJson(url, {
    proxy,
    timeout: 8000,
    headers: buildAuthHeaders(id, secret, apiPath, ua)
  });

  if (res.status !== 200 || !res.json || res.json.success === false) {
    throw new Error(res.json?.errorMessage || `弹弹Play 返回 HTTP ${res.status}`);
  }

  const list = Array.isArray(res.json.animes) ? res.json.animes : [];
  const normalizedList = list.map((it) => {
    const startDate = String(it.startDate ?? '');
    const yearMatch = startDate.match(/^(\d{4})/);
    return normalize(
      {
        externalId: String(it.animeId),
        title: it.animeTitle || '',
        titleNative: it.animeTitle || '',
        titleAlt: '',
        year: yearMatch ? Number(yearMatch[1]) : null,
        episodes: Number(it.episodeCount) > 0 ? Number(it.episodeCount) : null,
        coverUrl: it.imageUrl || '',
        summary: '',
        score: Number(it.rating) > 0 ? Math.round(Number(it.rating) * 10) / 10 : null,
        tags: it.typeDescription ? [String(it.typeDescription).trim()] : []
      },
      'dandanplay'
    );
  });

  setCachedResponse(cacheKey, normalizedList, CACHE_TTL.search);
  return normalizedList.slice(0, limit);
}

/**
 * 弹弹Play 番剧详情（带 7 天缓存与「番剧详情」200次/日配额守卫）。
 */
export async function detail(
  externalId,
  { proxy = '', ua, appId = '', appSecret = '', cfg = null } = {}
) {
  const id = String(appId || cfg?.dandanplayAppId || '').trim();
  const secret = String(appSecret || cfg?.dandanplayAppSecret || '').trim();
  if (!id || !secret) {
    throw new Error('弹弹Play 密钥待配置（请在设置中填入 AppId 与 AppSecret）');
  }

  const cleanId = encodeURIComponent(String(externalId).trim());
  const cacheKey = `detail::${cleanId}`;
  const cached = getCachedResponse(cacheKey, 'bangumi', cfg);
  if (cached) return cached;

  checkAndConsumeQuota('bangumi', cfg);

  const apiPath = `/api/v2/bangumi/${cleanId}`;
  const url = `${API_BASE}${apiPath}`;
  const res = await requestJson(url, {
    proxy,
    timeout: 8000,
    headers: buildAuthHeaders(id, secret, apiPath, ua)
  });

  if (res.status !== 200 || !res.json?.bangumi) {
    // 番剧 ID 不存在是「查无此条」，不是服务器故障，
    // 之前抛普通 Error 会被上层统一兜成 500，误导排查方向
    if (res.status === 404 || res.status === 400 || !res.json?.bangumi) {
      throw new NotFoundError(
        res.json?.errorMessage || `弹弹Play 上没有这个番剧条目 (ID ${externalId})`
      );
    }
    throw new Error(res.json?.errorMessage || `弹弹Play 详情拉取失败 (HTTP ${res.status})`);
  }

  const b = res.json.bangumi;
  const pubDate = String(b.publishDate ?? '');
  const yearMatch = pubDate.match(/^(\d{4})/);
  const episodes = Array.isArray(b.episodes) && b.episodes.length > 0 ? b.episodes.length : null;
  const tags = Array.isArray(b.tags)
    ? b.tags.map((t) => t.name).filter(Boolean).slice(0, 4)
    : [];

  const norm = normalize(
    {
      externalId: String(b.animeId ?? externalId),
      title: b.animeTitle || '',
      titleNative: b.animeTitle || '',
      titleAlt: '',
      year: yearMatch ? Number(yearMatch[1]) : null,
      episodes,
      coverUrl: b.imageUrl || '',
      summary: b.summary || '',
      score: Number(b.rating) > 0 ? Math.round(Number(b.rating) * 10) / 10 : null,
      tags
    },
    'dandanplay'
  );

  norm.episodeList = Array.isArray(b.episodes)
    ? b.episodes
        .map((ep, idx) => ({
          ep: Number(ep.episodeNumber) || idx + 1,
          title: String(ep.episodeTitle ?? '').trim()
        }))
        .filter((x) => x.ep > 0 && x.title)
    : [];

  setCachedResponse(cacheKey, norm, CACHE_TTL.bangumi);
  return norm;
}

const SEASON_TO_MONTH = {
  winter: 1,
  spring: 4,
  summer: 7,
  autumn: 10
};

/**
 * 按年份与季度从弹弹Play拉取季度番剧列表（带 24h 缓存与「番剧详情」配额守卫）。
 */
export async function seasonal(
  year,
  season = 'winter',
  { proxy = '', ua, appId = '', appSecret = '', cfg = null } = {}
) {
  const id = String(appId || cfg?.dandanplayAppId || '').trim();
  const secret = String(appSecret || cfg?.dandanplayAppSecret || '').trim();
  if (!id || !secret) {
    throw new Error('弹弹Play 密钥待配置（请在设置中填入 AppId 与 AppSecret）');
  }

  const y = Number(year) || new Date().getFullYear();
  const m = SEASON_TO_MONTH[String(season || 'winter').toLowerCase()] || 1;
  const cacheKey = `seasonal::${y}::${m}`;
  const cached = getCachedResponse(cacheKey, 'bangumi', cfg);
  if (cached) return cached;

  checkAndConsumeQuota('bangumi', cfg);

  const apiPath = `/api/v2/bangumi/season/anime/${y}/${m}`;
  const url = `${API_BASE}${apiPath}`;

  const res = await requestJson(url, {
    proxy,
    timeout: 10000,
    headers: buildAuthHeaders(id, secret, apiPath, ua)
  });

  if (res.status !== 200 || !res.json || res.json.success === false) {
    throw new Error(res.json?.errorMessage || `弹弹Play 季度番表返回 HTTP ${res.status}`);
  }

  const list = Array.isArray(res.json.bangumiList) ? res.json.bangumiList : [];
  const normalizedList = list.map((it) => {
    const norm = normalize(
      {
        externalId: String(it.animeId),
        title: it.animeTitle || '',
        titleNative: it.animeTitle || '',
        titleAlt: '',
        year: y,
        episodes: null,
        coverUrl: it.imageUrl || '',
        summary: '',
        score: Number(it.rating) > 0 ? Math.round(Number(it.rating) * 10) / 10 : null,
        tags: []
      },
      'dandanplay'
    );
    norm.airDay = typeof it.airDay === 'number' ? it.airDay : null;
    return norm;
  });

  setCachedResponse(cacheKey, normalizedList, CACHE_TTL.seasonal);
  return normalizedList;
}

/**
 * 拉取弹弹Play新番连载每日放送表（带 12h 缓存与「番剧详情」配额守卫）。
 */
export async function calendar({ proxy = '', ua, appId = '', appSecret = '', cfg = null } = {}) {
  const id = String(appId || cfg?.dandanplayAppId || '').trim();
  const secret = String(appSecret || cfg?.dandanplayAppSecret || '').trim();
  if (!id || !secret) {
    throw new Error('弹弹Play 密钥待配置');
  }

  const cacheKey = 'calendar::shin';
  const cached = getCachedResponse(cacheKey, 'bangumi', cfg);
  if (cached) return cached;

  checkAndConsumeQuota('bangumi', cfg);

  const apiPath = '/api/v2/bangumi/shin';
  const url = `${API_BASE}${apiPath}`;
  const res = await requestJson(url, {
    proxy,
    timeout: 10000,
    headers: buildAuthHeaders(id, secret, apiPath, ua)
  });

  if (res.status !== 200 || !res.json || res.json.success === false) {
    throw new Error(res.json?.errorMessage || `弹弹Play 放送表返回 HTTP ${res.status}`);
  }

  const WEEKDAY_CN = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
  const groups = Array.from({ length: 7 }, (_, i) => ({
    weekday: { id: i + 1, cn: WEEKDAY_CN[i], en: '', ja: '' },
    items: []
  }));

  const list = Array.isArray(res.json.bangumiList) ? res.json.bangumiList : [];
  for (const it of list) {
    const rawDay = Number(it.airDay);
    const weekdayId = rawDay === 0 ? 7 : rawDay >= 1 && rawDay <= 6 ? rawDay : 1;
    const norm = normalize(
      {
        externalId: String(it.animeId),
        title: it.animeTitle || '',
        titleNative: it.animeTitle || '',
        titleAlt: '',
        year: new Date().getFullYear(),
        episodes: null,
        coverUrl: it.imageUrl || '',
        summary: '',
        score: Number(it.rating) > 0 ? Math.round(Number(it.rating) * 10) / 10 : null,
        tags: []
      },
      'dandanplay'
    );
    norm.weekday = weekdayId;
    groups[weekdayId - 1].items.push(norm);
  }

  setCachedResponse(cacheKey, groups, CACHE_TTL.calendar);
  return groups;
}

/**
 * 弹弹Play 视频文件智能匹配接口 (POST /api/v2/match，带 30 天缓存与「文件识别」200次/日配额守卫)。
 */
export async function matchFile(
  { fileName = '', fileHash = '00000000000000000000000000000000', fileSize = 0 } = {},
  { proxy = '', ua, appId = '', appSecret = '', cfg = null } = {}
) {
  const id = String(appId || cfg?.dandanplayAppId || '').trim();
  const secret = String(appSecret || cfg?.dandanplayAppSecret || '').trim();
  if (!id || !secret) {
    throw new Error('弹弹Play 密钥待配置（请在设置中填入 AppId 与 AppSecret）');
  }

  const cleanName = String(fileName ?? '').replace(/\.[^.]+$/, '').trim();
  if (!cleanName) {
    throw new Error('fileName 不能为空');
  }

  const cacheKey = `match::${cleanName.toLowerCase()}::${Number(fileSize) || 0}::${fileHash}`;
  const cached = getCachedResponse(cacheKey, 'match', cfg);
  if (cached) return cached;

  checkAndConsumeQuota('match', cfg);

  const apiPath = '/api/v2/match';
  const url = `${API_BASE}${apiPath}`;
  const res = await requestJson(url, {
    method: 'POST',
    proxy,
    timeout: 8000,
    headers: {
      ...buildAuthHeaders(id, secret, apiPath, ua),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      fileName: cleanName,
      fileHash: String(fileHash || '00000000000000000000000000000000'),
      fileSize: Number(fileSize) || 0,
      matchMode: 'hashAndFileName'
    })
  });

  if (res.status !== 200 || !res.json || res.json.success === false) {
    throw new Error(res.json?.errorMessage || `弹弹Play 文件匹配返回 HTTP ${res.status}`);
  }

  const matches = Array.isArray(res.json.matches) ? res.json.matches : [];
  const result = {
    isMatched: Boolean(res.json.isMatched),
    matches: matches.map((m) => ({
      episodeId: m.episodeId,
      animeId: String(m.animeId || ''),
      animeTitle: m.animeTitle || '',
      episodeTitle: m.episodeTitle || '',
      type: m.type || 'tvseries',
      shift: m.shift || 0
    }))
  };

  setCachedResponse(cacheKey, result, CACHE_TTL.match);
  return result;
}

export function testUrl() {
  return `${API_BASE}/api/v2/search/anime?keyword=test`;
}



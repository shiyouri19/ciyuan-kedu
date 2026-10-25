import { resolveProxy, requestText, DEFAULT_UA } from '../net.js';
import { ValidationError } from '../errors.js';
import { toProxyUrl, bgmResize } from './coverService.js';
import * as bilibili from '../providers/bilibili.js';
import * as bangumi from '../providers/bangumi.js';
import * as anilist from '../providers/anilist.js';
import * as dandanplay from '../providers/dandanplay.js';

export const PROVIDER_MAP = {
  bilibili,
  bangumi,
  anilist,
  dandanplay
};

// Stage 15：移除 AniList 源，仅使用 Bangumi 与 弹弹Play 作为活跃数据源
export const ACTIVE_SOURCES = ['dandanplay', 'bangumi'];
export const ALL_SOURCES = ['dandanplay', 'bangumi', 'anilist', 'bilibili'];

function decorate(items) {
  return items.map((it) => ({
    ...it,
    remoteCoverUrl: it.coverUrl,
    coverUrl: toProxyUrl(bgmResize(it.coverUrl, 200))
  }));
}

/** 搜索缓存：同一关键词 10 分钟内不重复打网络 */
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

function getActiveSources(cfg) {
  const list = Array.isArray(cfg?.enabledSources) ? cfg.enabledSources : ACTIVE_SOURCES;
  const filtered = list.filter((s) => {
    if (!ACTIVE_SOURCES.includes(s)) return false;
    if (s === 'dandanplay' && !dandanplay.hasCredentials(cfg)) return false;
    return true;
  });
  return filtered.length > 0 ? filtered : ['bangumi'];
}

/** 判断标题是否包含汉字且不含日文假名 */
function hasPureChineseTitle(str) {
  const s = String(str ?? '').trim();
  if (!s) return false;
  return /[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff]/.test(s);
}

/**
 * 双源并行/省流搜索（支持 弹弹Play + Bangumi 聚合去重）。
 */
export async function searchAll(cfg, keyword, { limit = 8, forceDandan = false } = {}) {
  const kw = String(keyword ?? '').trim();
  if (!kw) throw new ValidationError('请输入搜索关键词', 'keyword');
  if (kw.length < 1) throw new ValidationError('关键词太短', 'keyword');

  const activeSources = getActiveSources(cfg);
  const strategy = cfg?.dandanplayStrategy === 'always' ? 'always' : 'economy';
  const cacheKey = `${kw.toLowerCase()}::${limit}::${activeSources.join(',')}::${strategy}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return { ...hit.value, cached: true };
  }

  const runSource = async (src) => {
    const provider = PROVIDER_MAP[src];
    const isDirect = src === 'dandanplay';
    const proxy = isDirect ? '' : await resolveProxy(cfg, provider.testUrl());
    const items = await provider.search(kw, {
      proxy,
      ua: cfg?.userAgent,
      limit,
      appId: cfg?.dandanplayAppId || '',
      appSecret: cfg?.dandanplayAppSecret || '',
      cfg
    });
    return { src, proxy, items };
  };

  const freeSources = activeSources.filter((s) => s !== 'dandanplay');
  const wantDandan = activeSources.includes('dandanplay');

  const settledMap = new Map();

  if (wantDandan && (strategy === 'always' || forceDandan)) {
    const allSettled = await Promise.allSettled(activeSources.map((src) => runSource(src)));
    activeSources.forEach((src, i) => settledMap.set(src, allSettled[i]));
  } else {
    // 智能省流模式 (economy)：先并发请求无配额限制的 Bangumi
    const freeSettled = await Promise.allSettled(freeSources.map((src) => runSource(src)));
    freeSources.forEach((src, i) => settledMap.set(src, freeSettled[i]));

    if (wantDandan) {
      const ddpCached = dandanplay.getCachedResponse(`search::${kw.toLowerCase()}`, null, cfg);
      const bgmRes = settledMap.get('bangumi');
      const bgmCount = bgmRes?.status === 'fulfilled' ? bgmRes.value.items.length : 0;
      const curatedHits = bilibili.searchCurated(kw, limit, 'bangumi');
      const needDandanFallback = bgmCount === 0 && curatedHits.length === 0;

      if (ddpCached || (needDandanFallback && dandanplay.canConsumeQuota('search', cfg))) {
        const [ddpSettled] = await Promise.allSettled([runSource('dandanplay')]);
        settledMap.set('dandanplay', ddpSettled);
      } else {
        settledMap.set('dandanplay', {
          status: 'fulfilled',
          value: {
            src: 'dandanplay',
            proxy: null,
            items: [],
            skippedByEconomy: true
          }
        });
      }
    }
  }

  const meta = {};
  const merged = [];
  const byDedupKey = new Map();

  // 按 Bangumi -> 弹弹Play 顺序进行跨源同番合并去重与字段互补
  const mergeOrder = [...activeSources].sort((a, b) => {
    const rank = { bangumi: 1, dandanplay: 2 };
    return (rank[a] || 9) - (rank[b] || 9);
  });

  for (const src of activeSources) {
    const r = settledMap.get(src);
    if (r && r.status === 'fulfilled') {
      meta[src] = {
        ok: true,
        count: r.value.items.length,
        proxy: r.value.proxy || null,
        skippedByEconomy: Boolean(r.value.skippedByEconomy),
        error: null
      };
    } else if (r) {
      meta[src] = {
        ok: false,
        count: 0,
        proxy: null,
        error: r.reason?.message ?? '连接失败'
      };
    }
  }

  for (const src of mergeOrder) {
    const r = settledMap.get(src);
    if (!r || r.status !== 'fulfilled') continue;

    for (const it of r.value.items) {
      const cnHit = bilibili.lookupCuratedChineseEntry(it.title, it.titleNative, it.titleAlt);
      const bestTitle = !hasPureChineseTitle(it.title) && cnHit?.title ? cnHit.title : it.title;
      const normalizedItem = {
        ...it,
        title: bestTitle,
        summary: it.summary || cnHit?.summary || '',
        sources: [it.source],
        sourceExternalIds: { [it.source]: String(it.externalId) }
      };

      const keys = bangumi.buildAnimeDedupKeys(
        normalizedItem.title,
        normalizedItem.titleNative,
        normalizedItem.titleAlt,
        cnHit?.title,
        ...(Array.isArray(cnHit?.aliases) ? cnHit.aliases : [])
      );

      const hitKey = keys.find((k) => byDedupKey.has(k));
      if (hitKey) {
        const target = byDedupKey.get(hitKey);
        if (!target.sources.includes(normalizedItem.source)) {
          target.sources.push(normalizedItem.source);
        }
        target.sourceExternalIds[normalizedItem.source] = String(normalizedItem.externalId);
        if (!hasPureChineseTitle(target.title) && hasPureChineseTitle(normalizedItem.title)) {
          target.title = normalizedItem.title;
        }
        if (!target.summary && normalizedItem.summary) target.summary = normalizedItem.summary;
        if (!target.episodes && normalizedItem.episodes) target.episodes = normalizedItem.episodes;
        if (!target.year && normalizedItem.year) target.year = normalizedItem.year;
        if (!target.score && normalizedItem.score) target.score = normalizedItem.score;
        if ((!target.tags || target.tags.length === 0) && normalizedItem.tags?.length) {
          target.tags = normalizedItem.tags;
        }
        if (!target.coverUrl && normalizedItem.coverUrl) target.coverUrl = normalizedItem.coverUrl;
        for (const k of keys) byDedupKey.set(k, target);
      } else {
        merged.push(normalizedItem);
        for (const k of keys) byDedupKey.set(k, normalizedItem);
      }
    }
  }

  // 当远程源未返回或处于离线环境时，补充内置精选词典兜底（标记为 bangumi）
  if (merged.length === 0) {
    const fallbackItems = bilibili.searchCurated(kw, limit, 'bangumi');
    for (const it of fallbackItems) {
      merged.push(it);
    }
  }

  const value = {
    keyword: kw,
    data: decorate(merged.slice(0, limit * 2)),
    meta,
    cached: false
  };

  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** 拉详情。source 决定用哪个 Provider。 */
export async function fetchDetail(cfg, source, externalId) {
  const src = String(source ?? '').trim().toLowerCase();
  if (!ALL_SOURCES.includes(src)) {
    throw new ValidationError('未知的数据源', 'source');
  }
  if (!externalId) throw new ValidationError('缺少外部 ID', 'externalId');

  const provider = PROVIDER_MAP[src];
  const isDirect = src === 'bilibili' || src === 'dandanplay';
  const proxy = isDirect ? '' : await resolveProxy(cfg, provider.testUrl());
  const item = await provider.detail(externalId, {
    proxy,
    ua: cfg?.userAgent,
    appId: cfg?.dandanplayAppId || '',
    appSecret: cfg?.dandanplayAppSecret || '',
    cfg
  });
  return decorate([item])[0];
}

/**
 * 探测两大数据源（弹弹Play / Bangumi）的可用状态。
 * 注意：为保护弹弹Play 每日 100 次搜索配额，默认打开设置时不发起无谓的 search('test') 请求（0 配额消耗），
 * 仅当用户显式点击「实测连接 (消耗1次配额)」传 liveDandan=true 时才发起真实 API 请求。
 */
export async function probeSources(cfg, { liveDandan = false } = {}) {
  const checkOne = async (src) => {
    if (src === 'dandanplay') {
      const quota = dandanplay.getQuotaStatus(cfg);
      if (!dandanplay.hasCredentials(cfg)) {
        return {
          reachable: false,
          configured: false,
          latencyMs: 0,
          proxy: null,
          mode: 'direct',
          quota,
          error: '待填密钥（填入 AppId 与 AppSecret 后即启用）'
        };
      }
      if (!liveDandan) {
        return {
          reachable: true,
          configured: true,
          latencyMs: 0,
          proxy: null,
          mode: 'quota_guard',
          quota,
          error: null
        };
      }
      const start = Date.now();
      try {
        await dandanplay.search('无职转生', {
          proxy: '',
          ua: cfg?.userAgent || DEFAULT_UA,
          limit: 1,
          appId: cfg?.dandanplayAppId,
          appSecret: cfg?.dandanplayAppSecret,
          cfg
        });
        return {
          reachable: true,
          configured: true,
          latencyMs: Date.now() - start,
          proxy: null,
          mode: 'direct',
          quota: dandanplay.getQuotaStatus(cfg),
          error: null
        };
      } catch (err) {
        return {
          reachable: false,
          configured: true,
          latencyMs: Date.now() - start,
          proxy: null,
          mode: 'direct',
          quota: dandanplay.getQuotaStatus(cfg),
          error: err.message
        };
      }
    }

    const provider = PROVIDER_MAP[src];
    const url = provider.testUrl();
    const start = Date.now();
    try {
      const proxy = await resolveProxy(cfg, url);
      const res = await requestText(url, {
        method: 'GET',
        proxy,
        timeout: 6000,
        headers: {
          'User-Agent': cfg?.userAgent || DEFAULT_UA,
          Accept: 'application/json'
        }
      });
      const ok = res.status >= 200 && res.status < 500;
      return {
        reachable: ok,
        configured: true,
        latencyMs: Date.now() - start,
        proxy: proxy || null,
        mode: proxy ? 'proxy' : 'direct',
        error: ok ? null : `HTTP ${res.status}`
      };
    } catch (err) {
      return {
        reachable: false,
        configured: true,
        latencyMs: Date.now() - start,
        proxy: null,
        mode: 'direct',
        error: err.message
      };
    }
  };

  const [dandanStatus, bgmStatus] = await Promise.all([
    checkOne('dandanplay'),
    checkOne('bangumi')
  ]);

  return {
    dandanplay: dandanStatus,
    bangumi: bgmStatus
  };
}

export function clearSearchCache() {
  cache.clear();
  dandanplay.clearDandanCache();
}

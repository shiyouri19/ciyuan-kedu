import { resolveProxy } from '../net.js';
import { ValidationError } from '../errors.js';
import { toProxyUrl, bgmResize } from './coverService.js';
import * as bangumi from '../providers/bangumi.js';
import * as anilist from '../providers/anilist.js';

/**
 * 把封面地址换成同源代理地址。
 * 浏览器直连图床会被跨域和代理问题拦住，统一走本地服务中转。
 * 同时保留 remoteCoverUrl，将来入库时用它去下载并落地封面文件。
 */
function decorate(items) {
  return items.map((it) => ({
    ...it,
    // 原图地址：入库时存这个，显示时再按用途缩放
    remoteCoverUrl: it.coverUrl,
    // 搜索候选的缩略图只有 44px 宽，用 r/200 就够，别为一张小图去下整张原图
    coverUrl: toProxyUrl(bgmResize(it.coverUrl, 200))
  }));
}

/** 搜索缓存：同一关键词 10 分钟内不重复打网络 */
const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

/**
 * 双源搜索。
 *
 * 分工的依据是实测结果：
 * - Bangumi 中文检索质量高（连「芙莉莲」这种简称都能命中），但需要代理，排在前。
 * - AniList 中文检索差（「葬送的芙莉莲」零命中），但对日文/英文名有效，且直连可用，作为补充。
 *
 * 这里合并的是「候选列表」，不是同一部作品的字段——用户选中哪个源，
 * 后续就只从那个源拉详情并记录对应的 external_id，因此不会产生集数定义冲突。
 */
export async function searchAll(cfg, keyword, { limit = 8 } = {}) {
  const kw = String(keyword ?? '').trim();
  if (!kw) throw new ValidationError('请输入搜索关键词', 'keyword');
  if (kw.length < 1) throw new ValidationError('关键词太短', 'keyword');

  const cacheKey = `${kw.toLowerCase()}::${limit}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) {
    return { ...hit.value, cached: true };
  }

  const [bgmProxy, aniProxy] = await Promise.all([
    resolveProxy(cfg, bangumi.testUrl()),
    resolveProxy(cfg, anilist.testUrl())
  ]);

  const [bgmResult, aniResult] = await Promise.allSettled([
    bangumi.search(kw, { proxy: bgmProxy, ua: cfg.userAgent, limit }),
    anilist.search(kw, { proxy: aniProxy, ua: cfg.userAgent, limit })
  ]);

  const meta = {
    bangumi: {
      ok: bgmResult.status === 'fulfilled',
      count: bgmResult.status === 'fulfilled' ? bgmResult.value.length : 0,
      proxy: bgmProxy || null,
      error: bgmResult.status === 'rejected' ? bgmResult.reason?.message ?? '未知错误' : null
    },
    anilist: {
      ok: aniResult.status === 'fulfilled',
      count: aniResult.status === 'fulfilled' ? aniResult.value.length : 0,
      proxy: aniProxy || null,
      error: aniResult.status === 'rejected' ? aniResult.reason?.message ?? '未知错误' : null
    }
  };

  const bgmItems = bgmResult.status === 'fulfilled' ? bgmResult.value : [];
  const aniItems = aniResult.status === 'fulfilled' ? aniResult.value : [];

  // AniList 的结果如果与 Bangumi 已有条目同名，就不重复展示
  const seenNames = new Set(bgmItems.map((it) => (it.titleNative || it.title || '').toLowerCase()));
  const aniDeduped = aniItems.filter((it) => {
    const name = (it.title || it.titleNative || '').toLowerCase();
    return name && !seenNames.has(name);
  });

  const value = {
    keyword: kw,
    data: decorate([...bgmItems, ...aniDeduped]),
    meta,
    cached: false
  };

  cache.set(cacheKey, { at: Date.now(), value });
  return value;
}

/** 拉详情。source 决定用哪个 Provider。 */
export async function fetchDetail(cfg, source, externalId) {
  if (!['bangumi', 'anilist'].includes(source)) {
    throw new ValidationError('未知的数据源', 'source');
  }
  if (!externalId) throw new ValidationError('缺少外部 ID', 'externalId');

  const provider = source === 'bangumi' ? bangumi : anilist;
  const proxy = await resolveProxy(cfg, source === 'bangumi' ? bangumi.testUrl() : anilist.testUrl());
  const item = await provider.detail(externalId, { proxy, ua: cfg.userAgent });
  return decorate([item])[0];
}

/** 探测两个源当前的可用性，供设置页或状态栏展示 */
export async function probeSources(cfg) {
  const [bgmProxy, aniProxy] = await Promise.all([
    resolveProxy(cfg, bangumi.testUrl()),
    resolveProxy(cfg, anilist.testUrl())
  ]);
  return {
    bangumi: { reachable: Boolean(bgmProxy), proxy: bgmProxy || null },
    anilist: { reachable: Boolean(aniProxy), proxy: aniProxy || null }
  };
}

export function clearSearchCache() {
  cache.clear();
}

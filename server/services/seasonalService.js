import { ValidationError } from '../errors.js';
import { resolveProxy, DEFAULT_UA } from '../net.js';
import { toProxyUrl, bgmResize } from './coverService.js';
import * as bangumi from '../providers/bangumi.js';
import * as bilibili from '../providers/bilibili.js';
import * as dandanplay from '../providers/dandanplay.js';

export const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
export const SEASONAL_SOURCES = ['all', 'bangumi', 'dandanplay'];

const MONTH_MAP = {
  '1': 'winter',
  '4': 'spring',
  '7': 'summer',
  '10': 'autumn',
  q1: 'winter',
  q2: 'spring',
  q3: 'summer',
  q4: 'autumn',
  winter: 'winter',
  spring: 'spring',
  summer: 'summer',
  autumn: 'autumn',
  fall: 'autumn'
};

const SEASONAL_CACHE = new Map();
const CALENDAR_CACHE = { ts: 0, data: null };
const CACHE_TTL_MS = 10 * 60 * 1000;

export function clearSeasonalCache() {
  SEASONAL_CACHE.clear();
  CALENDAR_CACHE.ts = 0;
  CALENDAR_CACHE.data = null;
}

export function normalizeSeason(raw) {
  if (!raw) {
    const m = new Date().getMonth() + 1;
    if (m <= 3) return 'winter';
    if (m <= 6) return 'spring';
    if (m <= 9) return 'summer';
    return 'autumn';
  }
  const key = String(raw).trim().toLowerCase();
  const hit = MONTH_MAP[key];
  if (!hit) {
    throw new ValidationError('season 需为 winter(1月) / spring(4月) / summer(7月) / autumn(10月)', 'season');
  }
  return hit;
}

export function normalizeYear(raw) {
  if (!raw) return new Date().getFullYear();
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1990 || n > 2100) {
    throw new ValidationError('年份需为 1990–2100 之间的整数', 'year');
  }
  return n;
}

export function normalizeSeasonalSource(raw) {
  const s = String(raw || 'all').trim().toLowerCase();
  // 兼容旧版调用传 bilibili 时平滑映射至 bangumi
  if (s === 'bilibili') return 'bangumi';
  if (!SEASONAL_SOURCES.includes(s)) {
    throw new ValidationError('source 需为 all / bangumi / dandanplay', 'source');
  }
  return s;
}

function normalizeTitleKey(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s·・!！?？:：,，。.~～\-—_'"“”‘’()（）[\]【】/\\]+/g, '');
}

function getLocalTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 构建当前账本作品的匹配器（含 external_ids、主标题、排序名、作品别名与繁简/季度归一键）。
 */
function buildLibraryMatcher(db) {
  const libRows = db
    .prepare(
      `SELECT a.id, a.canonical_title, a.sort_title, s.status
       FROM anime a
       LEFT JOIN user_anime_state s ON s.anime_id = a.id
       WHERE a.deleted_at IS NULL`
    )
    .all();

  const extRows = db
    .prepare(
      `SELECT e.provider, e.external_id, e.anime_id, s.status
       FROM external_ids e
       JOIN anime a ON a.id = e.anime_id
       LEFT JOIN user_anime_state s ON s.anime_id = a.id
       WHERE a.deleted_at IS NULL`
    )
    .all();

  let aliasRows = [];
  try {
    aliasRows = db
      .prepare(
        `SELECT al.alias, al.anime_id, s.status
         FROM anime_aliases al
         JOIN anime a ON a.id = al.anime_id
         LEFT JOIN user_anime_state s ON s.anime_id = a.id
         WHERE a.deleted_at IS NULL`
      )
      .all();
  } catch {
    /* ignore if table not ready */
  }

  const byExternal = new Map();
  for (const r of extRows) {
    byExternal.set(`${r.provider}:${r.external_id}`, {
      anime_id: r.anime_id,
      status: r.status || 'want'
    });
  }

  const byTitle = new Map();
  for (const r of libRows) {
    const info = { anime_id: r.id, status: r.status || 'want' };
    for (const k of [
      normalizeTitleKey(r.canonical_title),
      normalizeTitleKey(r.sort_title),
      ...bangumi.buildAnimeDedupKeys(r.canonical_title, r.sort_title)
    ]) {
      if (k) byTitle.set(k, info);
    }
  }
  for (const r of aliasRows) {
    const info = { anime_id: r.anime_id, status: r.status || 'want' };
    for (const k of [normalizeTitleKey(r.alias), ...bangumi.buildAnimeDedupKeys(r.alias)]) {
      if (k && !byTitle.has(k)) {
        byTitle.set(k, info);
      }
    }
  }

  return function matchItem(it) {
    const extKey = `${it.source}:${it.externalId}`;
    if (byExternal.has(extKey)) return byExternal.get(extKey);
    if (it.sourceExternalIds && typeof it.sourceExternalIds === 'object') {
      for (const [src, eid] of Object.entries(it.sourceExternalIds)) {
        if (eid && byExternal.has(`${src}:${eid}`)) {
          return byExternal.get(`${src}:${eid}`);
        }
      }
    }
    const candidateKeys = [
      normalizeTitleKey(it.title),
      normalizeTitleKey(it.titleNative),
      normalizeTitleKey(it.titleAlt),
      ...bangumi.buildAnimeDedupKeys(it.title, it.titleNative, it.titleAlt)
    ];
    for (const k of candidateKeys) {
      if (k && byTitle.has(k)) return byTitle.get(k);
    }
    return null;
  };
}

export const SEASONAL_SORTS = ['default', 'score_desc', 'score_asc', 'title_asc'];

function normalizeScoreValue(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const scaled = n > 10 ? n / 10 : n;
  return Math.round(scaled * 10) / 10;
}

/** 判断标题是否包含简体/繁体汉字且不含日文假名 */
function hasPureChineseTitle(str) {
  const s = String(str ?? '').trim();
  if (!s) return false;
  return /[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff]/.test(s);
}

/**
 * 合并并深度去重来自 Bangumi 与 弹弹Play（及必要时内置词典）的季度新番条目：
 * 1. 自动识别繁简异体字（如「藥屋少女的呢喃」与「药屋少女的呢喃」）、季度后缀异写（「第2期」「第二季」「Season 2」「S2」）、
 *    以及副标题差异（「我独自升级 第二季 -起于暗影-」与「我独自升级 第二季」）；
 * 2. 跨源互补字段：保留最规范的简体中文标题、合并简介、集数、标签、开播日期、放送星期与双源评分/ID。
 */
export function mergeSeasonalItems(sourceLists, maxTotal = 200) {
  const byKey = new Map();
  const ordered = [];

  for (const raw of sourceLists) {
    if (!raw || !raw.title) continue;

    const cnHit = bilibili.lookupCuratedChineseEntry(
      raw.title,
      raw.titleNative,
      raw.titleAlt,
      ...(Array.isArray(raw.aliases) ? raw.aliases : [])
    );
    const rawScore = normalizeScoreValue(raw.score) ?? normalizeScoreValue(cnHit?.score);

    // 若原条目只有日文/外文名而词典有对应中文名，自动补上规范中文名
    const bestTitle =
      !hasPureChineseTitle(raw.title) && cnHit?.title ? cnHit.title : raw.title;

    const item = {
      ...raw,
      title: bestTitle,
      titleNative: raw.titleNative || cnHit?.titleNative || raw.title,
      summary: raw.summary || cnHit?.summary || '',
      score: rawScore,
      coverUrl: raw.coverUrl || cnHit?.coverUrl || '',
      episodes: raw.episodes || cnHit?.episodes || null,
      tags: Array.isArray(raw.tags) && raw.tags.length > 0 ? raw.tags : cnHit?.tags ?? [],
      airDate: raw.airDate || cnHit?.airDate || '',
      sources: Array.isArray(raw.sources) && raw.sources.length ? [...raw.sources] : [raw.source],
      sourceExternalIds: {
        ...(raw.sourceExternalIds || {}),
        [raw.source]: String(raw.externalId)
      }
    };

    const keys = bangumi.buildAnimeDedupKeys(
      item.title,
      item.titleNative,
      item.titleAlt,
      cnHit?.title,
      cnHit?.titleNative,
      ...(Array.isArray(item.aliases) ? item.aliases : []),
      ...(Array.isArray(cnHit?.aliases) ? cnHit.aliases : [])
    );

    const existingKey = keys.find((k) => byKey.has(k));
    if (existingKey) {
      const target = byKey.get(existingKey);
      for (const s of item.sources) {
        if (!target.sources.includes(s)) {
          target.sources.push(s);
        }
      }
      if (item.source && item.externalId) {
        target.sourceExternalIds = target.sourceExternalIds || {};
        target.sourceExternalIds[item.source] = String(item.externalId);
      }

      // 若原条目不是纯中文名而新合并条目是纯中文名，优先升级为纯中文标题
      if (!hasPureChineseTitle(target.title) && hasPureChineseTitle(item.title)) {
        target.title = item.title;
      }
      if (!target.titleAlt && item.title && item.title !== target.title) {
        target.titleAlt = item.title;
      }
      if (!target.summary && item.summary) target.summary = item.summary;
      if (!target.episodes && item.episodes) target.episodes = item.episodes;
      if (!target.score && item.score) target.score = item.score;
      if ((!target.tags || target.tags.length === 0) && item.tags?.length) {
        target.tags = item.tags;
      }
      if (!target.coverUrl && item.coverUrl) target.coverUrl = item.coverUrl;
      if (!target.airDate && item.airDate) target.airDate = item.airDate;
      if (target.airDay === undefined && item.airDay !== undefined) target.airDay = item.airDay;

      for (const k of keys) byKey.set(k, target);
    } else {
      ordered.push(item);
      for (const k of keys) byKey.set(k, item);
    }
  }

  return ordered.slice(0, maxTotal);
}

/**
 * 判断某个季度是否为「当前正在连载放送的季度」
 */
function isCurrentAiringSeason(year, season) {
  const now = new Date();
  const curY = now.getFullYear();
  const curS = normalizeSeason(String(now.getMonth() + 1));
  return Number(year) === curY && season === curS;
}

/**
 * 获取指定年份与季度的新番导览列表（仅使用 Bangumi + 弹弹Play，支持多页全量拉取、未放送占位词条过滤、跨源深度去重聚合、按评分排序与翻页）。
 */
export async function getSeasonalLineup(
  db,
  cfg,
  {
    year,
    season,
    source = 'all',
    page = 1,
    pageSize,
    limit,
    keyword = '',
    filter = 'all',
    sort = 'default',
    includeUnreleased = false,
    refresh = false
  } = {}
) {
  const safeYear = normalizeYear(year);
  const safeSeason = normalizeSeason(season);
  const safeSource = normalizeSeasonalSource(source);
  const safeSort = SEASONAL_SORTS.includes(String(sort || 'default').trim())
    ? String(sort || 'default').trim()
    : 'default';
  const safePage = Math.max(1, Number.isInteger(Number(page)) ? Number(page) : 1);
  const rawPageSize = pageSize !== undefined && pageSize !== null && pageSize !== ''
    ? Number(pageSize)
    : limit !== undefined && limit !== null && limit !== ''
      ? Number(limit)
      : 24;
  const safePageSize = Math.max(1, Math.min(rawPageSize || 24, 200));
  const pullLimit = 180;
  const ua = cfg?.userAgent || DEFAULT_UA;
  const allowUnreleased = Boolean(includeUnreleased);

  const dandanReady = dandanplay.hasCredentials(cfg);
  const strategy = cfg?.dandanplayStrategy === 'always' ? 'always' : 'economy';
  const cacheKey = `${safeYear}:${safeSeason}:${safeSource}:${dandanReady ? 'ddp1' : 'ddp0'}:${strategy}:${allowUnreleased ? 'unrel1' : 'unrel0'}`;
  let cachedPayload = null;
  if (!refresh && SEASONAL_CACHE.has(cacheKey)) {
    const entry = SEASONAL_CACHE.get(cacheKey);
    if (Date.now() - entry.ts < CACHE_TTL_MS) {
      cachedPayload = entry.payload;
    }
  }

  if (!cachedPayload) {
    const activeSources = [];
    const sourceErrors = {};
    const collected = [];

    const wantBangumi = safeSource === 'all' || safeSource === 'bangumi';
    const wantDandan = safeSource === 'all' || safeSource === 'dandanplay';

    const [seasonStart, seasonEnd] = bangumi.getSeasonDateWindow(safeYear, safeSeason);
    const todayIso = getLocalTodayIso();
    // 若用户未勾选“包含未开播预告”，且所选整个季度的起始日都在今天之后（如未来季度），则属于未放送季度
    const isEntireSeasonInFuture = !allowUnreleased && seasonStart > todayIso;

    const freeTasks = [];

    if (wantBangumi && !isEntireSeasonInFuture) {
      freeTasks.push(
        (async () => {
          try {
            const proxy = await resolveProxy(cfg, bangumi.testUrl());
            const items = await bangumi.seasonal(safeYear, safeSeason, {
              proxy,
              ua,
              limit: pullLimit,
              includeUnreleased: allowUnreleased
            });

            // 若查询的是当前正在放送的季度，同步结合 Bangumi /calendar 每日放送表补齐（防止部分跨季连载或特定开播日新番漏拉）
            if (isCurrentAiringSeason(safeYear, safeSeason)) {
              try {
                const calDays = await bangumi.calendar({ proxy, ua });
                for (const d of calDays || []) {
                  for (const calIt of d.items || []) {
                    const ad = String(calIt.airDate || '').trim();
                    if (ad && ad >= seasonStart && ad <= seasonEnd && (allowUnreleased || ad <= todayIso)) {
                      items.push(calIt);
                    }
                  }
                }
              } catch {
                /* ignore calendar supplement error */
              }
            }

            if (items.length > 0) {
              activeSources.push('bangumi');
              return { source: 'bangumi', items };
            }
          } catch (err) {
            sourceErrors.bangumi = err.message;
          }
          return { source: 'bangumi', items: [] };
        })()
      );
    }

    const runDandanTask = async () => {
      if (isEntireSeasonInFuture) {
        return { source: 'dandanplay', items: [] };
      }
      if (!dandanReady) {
        if (safeSource === 'dandanplay') {
          sourceErrors.dandanplay = '尚未配置弹弹Play AppId 与 AppSecret，已自动使用内置中文新番目录兜底';
        }
        return { source: 'dandanplay', items: [] };
      }
      try {
        const items = await dandanplay.seasonal(safeYear, safeSeason, {
          proxy: '',
          ua,
          limit: pullLimit,
          appId: cfg?.dandanplayAppId || '',
          appSecret: cfg?.dandanplayAppSecret || '',
          cfg
        });
        if (items.length > 0) {
          activeSources.push('dandanplay');
          return { source: 'dandanplay', items };
        }
      } catch (err) {
        sourceErrors.dandanplay = err.message;
      }
      return { source: 'dandanplay', items: [] };
    };

    const results = [];
    if (wantDandan && !isEntireSeasonInFuture) {
      if (safeSource === 'dandanplay' || strategy === 'always') {
        const allResults = await Promise.all([...freeTasks, runDandanTask()]);
        results.push(...allResults);
      } else {
        const freeResults = await Promise.all(freeTasks);
        results.push(...freeResults);

        if (dandanReady) {
          const monthNum = { winter: 1, spring: 4, summer: 7, autumn: 10 }[safeSeason] || 1;
          const ddpCached = dandanplay.getCachedResponse(`seasonal::${safeYear}::${monthNum}`, null, cfg);
          // 季度番表每季仅拉取 1 次并缓存 24 小时，只要配额处于安全线内即可与 Bangumi 聚合并补全弹弹Play番剧库
          if (ddpCached || dandanplay.canConsumeQuota('bangumi', cfg)) {
            results.push(await runDandanTask());
          }
        }
      }
    } else {
      const freeResults = await Promise.all(freeTasks);
      results.push(...freeResults);
    }

    // 按优先级合并：Bangumi -> 弹弹Play
    const orderRank = { bangumi: 1, dandanplay: 2 };
    results.sort((a, b) => (orderRank[a.source] || 9) - (orderRank[b.source] || 9));
    for (const r of results) {
      collected.push(...r.items);
    }

    // 关键改进：仅当远端 API 均不可达（collected.length === 0）且并非未来未开播季度时，才启用离线兜底目录，
    // 绝不把未放送/占位的虚构词条混入真实的在线季度番表中！
    let fallbackUsed = false;
    if (collected.length === 0 && !isEntireSeasonInFuture) {
      const curatedSourceTag = safeSource === 'dandanplay' ? 'dandanplay' : 'bangumi';
      const curatedItems = bilibili.getCuratedSeasonal(safeYear, safeSeason, curatedSourceTag, {
        includeUnreleased: allowUnreleased
      });
      if (curatedItems.length > 0) {
        fallbackUsed = true;
        if (!activeSources.includes(curatedSourceTag)) activeSources.push(curatedSourceTag);
        collected.push(...curatedItems);
      }
    }

    // 最终二次过滤：若未开启 includeUnreleased，确保所有具有 airDate 且大于今天的未放送条目一律剔除
    const filteredByAirDate = collected.filter((it) => {
      if (allowUnreleased) return true;
      if (it.isUnreleased) return false;
      const ad = String(it.airDate || '').trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(ad) && ad > todayIso) {
        return false;
      }
      return true;
    });

    const merged = mergeSeasonalItems(filteredByAirDate, 200);
    cachedPayload = {
      merged,
      activeSources,
      sourceErrors,
      fallbackUsed
    };
    SEASONAL_CACHE.set(cacheKey, { ts: Date.now(), payload: cachedPayload });
  }

  const matchItem = buildLibraryMatcher(db);
  const allDecorated = cachedPayload.merged.map((it) => {
    const match = matchItem(it);
    return {
      ...it,
      remoteCoverUrl: it.coverUrl,
      coverUrl: toProxyUrl(bgmResize(it.coverUrl, 400)),
      in_library: Boolean(match),
      library_anime_id: match?.anime_id ?? null,
      library_status: match?.status ?? null
    };
  });

  const kw = String(keyword || '').trim().toLowerCase();
  const safeFilter = ['all', 'unadded', 'in_library'].includes(filter) ? filter : 'all';

  const filtered = allDecorated.filter((it) => {
    if (safeFilter === 'unadded' && it.in_library) return false;
    if (safeFilter === 'in_library' && !it.in_library) return false;
    if (kw) {
      const hay = [
        it.title,
        it.titleNative,
        it.titleAlt,
        it.summary,
        ...(Array.isArray(it.tags) ? it.tags : [])
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(kw)) return false;
    }
    return true;
  });

  // 按用户选择的排序规则对季度目录排序（默认综合热度 / 评分从高到低 / 评分从低到高 / 番名 A→Z）
  const sorted = [...filtered];
  if (safeSort === 'score_desc') {
    sorted.sort((a, b) => {
      const sa = Number(a.score) > 0 ? Number(a.score) : -1;
      const sb = Number(b.score) > 0 ? Number(b.score) : -1;
      if (sb !== sa) return sb - sa;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
    });
  } else if (safeSort === 'score_asc') {
    sorted.sort((a, b) => {
      const sa = Number(a.score) > 0 ? Number(a.score) : 999;
      const sb = Number(b.score) > 0 ? Number(b.score) : 999;
      if (sa !== sb) return sa - sb;
      return String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN');
    });
  } else if (safeSort === 'title_asc') {
    sorted.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'zh-CN'));
  }

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.min(safePage, totalPages);
  const startIdx = (currentPage - 1) * safePageSize;
  const pageData = sorted.slice(startIdx, startIdx + safePageSize);

  return {
    year: safeYear,
    season: safeSeason,
    source: safeSource,
    sort: safeSort,
    include_unreleased: allowUnreleased,
    active_sources: cachedPayload.activeSources,
    fallback_used: cachedPayload.fallbackUsed,
    source_errors: cachedPayload.sourceErrors,
    season_total: allDecorated.length,
    total,
    page: currentPage,
    page_size: safePageSize,
    total_pages: totalPages,
    has_prev: currentPage > 1,
    has_next: currentPage < totalPages,
    count: pageData.length,
    data: pageData
  };
}

/**
 * 获取每周每日放送表（同时拉取并聚合 Bangumi /calendar 与 弹弹Play /shin，自动跨源去重，离线时降级至内置周历）。
 */
export async function getWeeklyCalendar(db, cfg, { refresh = false } = {}) {
  const ua = cfg?.userAgent || DEFAULT_UA;
  let rawDays = null;
  let source = 'bangumi';
  let errorMsg = null;

  if (!refresh && CALENDAR_CACHE.data && Date.now() - CALENDAR_CACHE.ts < CACHE_TTL_MS) {
    rawDays = CALENDAR_CACHE.data.rawDays;
    source = CALENDAR_CACHE.data.source;
    errorMsg = CALENDAR_CACHE.data.errorMsg;
  } else {
    let bgmDays = null;
    let ddpDays = null;

    try {
      const proxy = await resolveProxy(cfg, bangumi.testUrl());
      const fetchedBgm = await bangumi.calendar({ proxy, ua });
      if (Array.isArray(fetchedBgm) && fetchedBgm.some((d) => d.items?.length > 0)) {
        bgmDays = fetchedBgm;
      }
    } catch (err) {
      errorMsg = err.message;
    }

    if (dandanplay.hasCredentials(cfg)) {
      const ddpCached = dandanplay.getCachedResponse('calendar::shin', null, cfg);
      if (ddpCached || (!bgmDays && dandanplay.canConsumeQuota('bangumi', cfg)) || cfg?.dandanplayStrategy === 'always') {
        try {
          const fetchedDdp = await dandanplay.calendar({
            proxy: '',
            ua,
            appId: cfg?.dandanplayAppId || '',
            appSecret: cfg?.dandanplayAppSecret || '',
            cfg
          });
          if (Array.isArray(fetchedDdp) && fetchedDdp.some((d) => d.items?.length > 0)) {
            ddpDays = fetchedDdp;
            errorMsg = null;
          }
        } catch (err) {
          if (!bgmDays) errorMsg = err.message;
        }
      }
    }

    if (bgmDays && ddpDays) {
      source = 'bangumi+dandanplay';
      rawDays = bgmDays.map((dayGroup, idx) => {
        const ddpGroup = ddpDays[idx] || { items: [] };
        const mergedDayItems = mergeSeasonalItems(
          [...(dayGroup.items || []), ...(ddpGroup.items || [])],
          40
        );
        return {
          weekday: dayGroup.weekday,
          items: mergedDayItems
        };
      });
    } else if (bgmDays) {
      rawDays = bgmDays;
      source = 'bangumi';
    } else if (ddpDays) {
      rawDays = ddpDays;
      source = 'dandanplay';
    } else {
      rawDays = bilibili.getCuratedCalendar('bangumi');
      source = 'bangumi_curated';
    }

    CALENDAR_CACHE.ts = Date.now();
    CALENDAR_CACHE.data = { rawDays, source, errorMsg };
  }

  const matchItem = buildLibraryMatcher(db);
  const days = rawDays.map((dayGroup) => {
    const items = (dayGroup.items ?? []).slice(0, 30).map((it) => {
      const match = matchItem(it);
      return {
        ...it,
        remoteCoverUrl: it.coverUrl,
        coverUrl: toProxyUrl(bgmResize(it.coverUrl, 400)),
        in_library: Boolean(match),
        library_anime_id: match?.anime_id ?? null,
        library_status: match?.status ?? null
      };
    });
    return {
      weekday: dayGroup.weekday,
      count: items.length,
      items
    };
  });

  return {
    source,
    fallback_reason: errorMsg,
    days
  };
}

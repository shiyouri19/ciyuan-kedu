import { withTransaction } from '../db/index.js';
import {
  getAnime,
  updateAnime,
  listExternals,
  linkExternal,
  addAlias,
  getLockedFieldSet,
  listMetadataFields,
  setMetadataFieldLock,
  LOCKABLE_METADATA_FIELDS
} from '../repositories/anime.js';
import { getOrCreateTag, attachTag, listTagsOfAnime } from '../repositories/meta.js';
import { searchAll, fetchDetail } from './searchService.js';
import { fetchCover } from './coverService.js';
import { lookupCuratedChineseEntry } from '../providers/bilibili.js';
import { computeProgress, ensureEpisodes } from './episodeService.js';
import { NotFoundError, ValidationError } from '../errors.js';

const PROVIDERS = ['bilibili', 'bangumi', 'anilist', 'dandanplay'];

const normalize = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\s·・:：!！?？、,，.。'"“”‘’\-—–_/\\()（）[\]【】~～;；×]/g, '');

/** 判断是否为纯正中文标题（含汉字且不含日文平假名/片假名） */
function isChineseTitle(str) {
  const s = String(str ?? '').trim();
  if (!s) return false;
  return /[\u4e00-\u9fff]/.test(s) && !/[\u3040-\u30ff]/.test(s);
}

function titleMatchesExactly(query, item) {
  const q = normalize(query);
  if (!q) return false;
  if (
    normalize(item.title) === q ||
    normalize(item.titleNative) === q ||
    normalize(item.titleAlt) === q
  ) {
    return true;
  }
  if (Array.isArray(item.aliases) && item.aliases.some((a) => normalize(a) === q)) {
    return true;
  }
  return false;
}

async function isCoverReachable(cfg, coverUrl) {
  if (!coverUrl) return false;
  try {
    await fetchCover(cfg, coverUrl);
    return true;
  } catch {
    return false;
  }
}

function resolveBestChineseTitle(info, preferredTitle, currentTitle) {
  const curated = lookupCuratedChineseEntry(
    preferredTitle,
    info?.title,
    info?.titleNative,
    info?.titleAlt,
    currentTitle
  );
  const pref = String(preferredTitle ?? '').trim();
  const infoTitle = String(info?.title ?? '').trim();

  if (isChineseTitle(pref)) return pref;
  if (isChineseTitle(infoTitle)) return infoTitle;
  if (curated?.title && isChineseTitle(curated.title)) return curated.title;
  if (pref) return pref;
  if (infoTitle) return infoTitle;
  return '';
}

/**
 * 元数据来源优先级：手动锁定 > Bangumi > 弹弹Play > 其他。
 *
 * 规则不是「谁先填谁赢」，而是「谁更权威谁赢」：
 * 先被弹弹Play 补上的封面，之后 Bangumi 再补时可以覆盖它。
 * 用户手动改过的字段会被锁成 manual，任何来源都动不了。
 */
const SOURCE_RANK = {
  manual: 100,
  bangumi: 60,
  anilist: 50,
  dandanplay: 40,
  bilibili: 20,
  filename: 10,
  enrich: 30
};

export function outranks(newSource, currentSource) {
  return (SOURCE_RANK[String(newSource || '')] ?? 0) > (SOURCE_RANK[String(currentSource || '')] ?? 0);
}

function applyInfo(
  db,
  anime,
  source,
  info,
  { isCandidatePick = false, coverBroken = false, preferredTitle = '' } = {}
) {
  const filled = [];
  const lockedSet = getLockedFieldSet(db, anime.id);
  const fieldSources = new Map(
    listMetadataFields(db, anime.id).map((r) => [r.field_key, r.source_provider])
  );

  /**
   * 该不该用新值写这个字段。
   * - 有值但没有来源记录 → 不动（来源不明就当它不可覆盖，保守优先）
   * - 有新来源且比当前来源权威 → 覆盖（Bangumi 可以盖掉弹弹Play 的封面）
   */
  const shouldFill = (field, currentValue, newValue) => {
    if (!newValue) return false;
    if (lockedSet.has(field)) return false;
    if (!currentValue) return true;
    const cur = fieldSources.get(field);
    if (!cur) return false;
    return outranks(source, cur);
  };
  const curated = lookupCuratedChineseEntry(
    preferredTitle,
    info?.title,
    info?.titleNative,
    info?.titleAlt,
    anime.canonical_title
  );

  withTransaction(db, () => {
    const patch = {};
    const oldTitle = anime.canonical_title;
    const bestTitle = resolveBestChineseTitle(info, preferredTitle, oldTitle);

    // 当用户主动点选候选条目，或原番剧名为英文/罗马音/日文文件名而匹配到了中文名时，自动将卡片主标题更新为中文名称（但严格尊重手工锁定字段）
    if (!lockedSet.has('canonical_title') && bestTitle && bestTitle !== oldTitle) {
      const shouldUpdateTitle =
        isCandidatePick || (!isChineseTitle(oldTitle) && isChineseTitle(bestTitle));
      if (shouldUpdateTitle) {
        patch.canonical_title = bestTitle;
        if (!lockedSet.has('sort_title')) {
          patch.sort_title = bestTitle;
        }
        filled.push('中文标题');
        // 将原来的文件名标题存入别名表，保证后续扫描本地同名视频文件依然能精准关联
        addAlias(db, anime.id, oldTitle, { sourceProvider: 'filename' });
      }
    }

    const bestCover = info.remoteCoverUrl || curated?.coverUrl || '';
    if (
      shouldFill('cover_path', anime.cover_path, bestCover) ||
      // 封面地址挂了就该换，不管原来是谁给的
      coverBroken ||
      // 用户主动点选的候选条目，以他选的为准
      (isCandidatePick && bestCover && anime.cover_path !== bestCover)
    ) {
      patch.cover_path = bestCover;
      filled.push('封面');
    }

    const bestSummary = info.summary || curated?.summary || '';
    if (shouldFill('synopsis', anime.synopsis, bestSummary)) {
      patch.synopsis = bestSummary;
      filled.push('简介');
    }

    const bestYear = info.year || curated?.year || null;
    if (shouldFill('release_year', anime.release_year, bestYear)) {
      patch.release_year = bestYear;
      filled.push('年份');
    }

    if (Object.keys(patch).length > 0) {
      updateAnime(db, anime.id, patch);
      /**
       * 记录来源，顺带处理两种情况：
       * - 用户主动点选候选条目 → 这是他的决定，记成 manual 并锁定，
       *   否则下次 Bangumi 补全会把他挑的封面/标题又改回去
       * - 封面地址失效被强制替换 → 只记来源不锁定（不是用户选的）
       */
      const isUserChoice = Boolean(isCandidatePick);
      for (const fieldKey of Object.keys(patch)) {
        if (!LOCKABLE_METADATA_FIELDS.includes(fieldKey)) continue;
        if (isUserChoice) {
          setMetadataFieldLock(db, anime.id, fieldKey, {
            isUserLocked: true,
            sourceProvider: 'manual'
          });
        } else if (source) {
          setMetadataFieldLock(db, anime.id, fieldKey, {
            isUserLocked: false,
            sourceProvider: source
          });
        }
      }
    }

    if (source && info.externalId) {
      linkExternal(db, anime.id, source, String(info.externalId));
    }

    const finalCanonicalTitle = patch.canonical_title || anime.canonical_title;
    for (const candidateAlias of [
      info.title,
      info.titleNative,
      info.titleAlt,
      ...(curated?.aliases ?? [])
    ]) {
      const clean = String(candidateAlias ?? '').trim();
      if (clean && clean !== finalCanonicalTitle) {
        addAlias(db, anime.id, clean, { sourceProvider: source || 'enrich' });
      }
    }

    const before = computeProgress(db, anime.id);
    const bestEpisodes = info.episodes || curated?.episodes || null;
    if (before.total === 0 && bestEpisodes) {
      ensureEpisodes(db, anime.id, bestEpisodes);
      filled.push(`${bestEpisodes} 集`);
    }

    const existingTags = listTagsOfAnime(db, anime.id);
    const bestTags =
      Array.isArray(info.tags) && info.tags.length > 0 ? info.tags : curated?.tags ?? [];
    if (existingTags.length === 0 && bestTags.length > 0) {
      for (const name of bestTags) {
        attachTag(db, anime.id, getOrCreateTag(db, name).id);
      }
      filled.push('标签');
    }
  });

  return filled;
}

export async function enrichAnime(db, cfg, animeId) {
  const anime = getAnime(db, animeId);
  if (!anime) throw new NotFoundError('作品不存在或已被删除');

  const coverOk = await isCoverReachable(cfg, anime.cover_path);
  const coverBroken = Boolean(anime.cover_path && !coverOk);
  const externals = listExternals(db, animeId);

  if (externals.length > 0) {
    const e = externals[0];
    let info;
    try {
      info = await fetchDetail(cfg, e.provider, String(e.external_id));
    } catch (err) {
      return { matched: false, reason: 'network', message: `拉取失败：${err.message}` };
    }

    // 若原外部源返回的是非中文标题或封面同样失效，尝试结合搜索结果获取可用封面与中文名
    if (
      (coverBroken && !(await isCoverReachable(cfg, info.remoteCoverUrl))) ||
      (!isChineseTitle(anime.canonical_title) && !isChineseTitle(info.title))
    ) {
      try {
        const sRes = await searchAll(cfg, anime.canonical_title, { limit: 6 });
        const cnHit = (sRes.data ?? []).find((it) => isChineseTitle(it.title));
        if (cnHit) {
          if (!isChineseTitle(info.title)) info.title = cnHit.title;
          if (cnHit.remoteCoverUrl && (await isCoverReachable(cfg, cnHit.remoteCoverUrl))) {
            info.remoteCoverUrl = cnHit.remoteCoverUrl;
          }
        }
      } catch {
        /* ignore fallback search error */
      }
    }

    const filled = applyInfo(db, anime, e.provider, info, { coverBroken });
    const updatedAnime = getAnime(db, animeId);
    return {
      matched: true,
      source: e.provider,
      matched_title: updatedAnime?.canonical_title || info.title,
      filled,
      changed: filled.length > 0,
      progress: computeProgress(db, animeId)
    };
  }

  let res;
  try {
    res = await searchAll(cfg, anime.canonical_title, { limit: 6 });
  } catch (err) {
    return { matched: false, reason: 'network', message: `搜索失败：${err.message}` };
  }

  const candidates = res.data ?? [];
  // 优先挑出中文标题的精确匹配项
  const exactMatches = candidates.filter((it) => titleMatchesExactly(anime.canonical_title, it));
  const exact = exactMatches.find((it) => isChineseTitle(it.title)) || exactMatches[0] || null;

  if (!exact) {
    return {
      matched: false,
      reason: candidates.length ? 'ambiguous' : 'not_found',
      message: candidates.length
        ? '没有完全同名的条目，请在上方候选列表中点击正确的中文番名'
        : '数据源暂未搜到同名条目，可以手动编辑或在设置中检查数据源连接',
      candidates: candidates.slice(0, 6)
    };
  }

  let info;
  try {
    info = await fetchDetail(cfg, exact.source, exact.externalId);
  } catch (err) {
    return { matched: false, reason: 'network', message: `拉取详情失败：${err.message}` };
  }

  const filled = applyInfo(db, anime, exact.source, info, {
    coverBroken,
    preferredTitle: exact.title
  });
  const updatedAnime = getAnime(db, animeId);
  return {
    matched: true,
    source: exact.source,
    matched_title: updatedAnime?.canonical_title || info.title,
    filled,
    changed: filled.length > 0,
    progress: computeProgress(db, animeId)
  };
}

export async function applyCandidate(
  db,
  cfg,
  animeId,
  { source, external_id, title: preferredTitle = '' } = {}
) {
  const anime = getAnime(db, animeId);
  if (!anime) throw new NotFoundError('作品不存在或已被删除');

  const src = String(source ?? '').trim().toLowerCase();
  if (!PROVIDERS.includes(src)) {
    throw new ValidationError(`数据源需为 ${PROVIDERS.join(' / ')} 之一`, 'source');
  }
  if (!external_id) throw new ValidationError('缺少外部 ID', 'external_id');

  let info;
  try {
    info = await fetchDetail(cfg, src, String(external_id));
  } catch (err) {
    return { matched: false, reason: 'network', message: `拉取失败：${err.message}` };
  }

  const coverOk = await isCoverReachable(cfg, anime.cover_path);
  const coverBroken = Boolean(anime.cover_path && !coverOk);

  const filled = applyInfo(db, anime, src, info, {
    isCandidatePick: true,
    coverBroken,
    preferredTitle
  });
  const updatedAnime = getAnime(db, animeId);
  return {
    matched: true,
    source: src,
    matched_title: updatedAnime?.canonical_title || info.title,
    filled,
    changed: filled.length > 0,
    progress: computeProgress(db, animeId)
  };
}

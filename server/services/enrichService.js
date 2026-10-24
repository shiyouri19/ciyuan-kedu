import { withTransaction } from '../db/index.js';
import { getAnime, updateAnime, listExternals, linkExternal } from '../repositories/anime.js';
import { getOrCreateTag, attachTag, listTagsOfAnime } from '../repositories/meta.js';
import { searchAll, fetchDetail } from './searchService.js';
import { computeProgress, ensureEpisodes } from './episodeService.js';
import { NotFoundError, ValidationError } from '../errors.js';

/**
 * 补全已有作品的元数据：封面、集数、简介、年份、标签。
 *
 * 两条路径：
 * 1. 已有外部 ID → 直接拉详情，最可靠。
 * 2. 没有外部 ID → 按标题搜索，**只有标题规范化后完全相等才自动绑定**。
 *    不做「取第一条」式的模糊匹配——搜「进击的巨人」第一条很可能是「最终季」，
 *    一旦绑错，集数、封面、简介全跟着错，而且用户很难发现。
 *    匹配不上就把候选返回给界面，让人来点（对应 REFERENCE_RESEARCH 里 The-Order 的做法）。
 *
 * 只填空白字段，**不覆盖任何已有数据**：封面、简介、年份、标签有值就不动，
 * 集数只在从未设过时补。这是「外部元数据不得覆盖个人数据」红线的延伸。
 */

const PROVIDERS = ['bangumi', 'anilist'];

const normalize = (s) =>
  String(s ?? '')
    .toLowerCase()
    // 去掉空白与中英文标点，避免「Re:从零开始」与「Re 从零开始」被判为不同
    .replace(/[\s·・:：!！?？、,，.。'"“”‘’\-—–_/\\()（）[\]【】~～]/g, '');

function titleMatchesExactly(query, item) {
  const q = normalize(query);
  if (!q) return false;
  return normalize(item.title) === q || normalize(item.titleNative) === q;
}

/**
 * 把拿到的详情写进库，只补空白。
 * 返回实际填了哪些字段，用于给用户「补了什么」的反馈。
 */
function applyInfo(db, anime, source, info) {
  const filled = [];

  withTransaction(db, () => {
    const patch = {};
    // 必须用 remoteCoverUrl：coverUrl 已经换成了本地代理地址，存进去就会套娃
    if (!anime.cover_path && info.remoteCoverUrl) {
      patch.cover_path = info.remoteCoverUrl;
      filled.push('封面');
    }
    if (!anime.synopsis && info.summary) {
      patch.synopsis = info.summary;
      filled.push('简介');
    }
    if (!anime.release_year && info.year) {
      patch.release_year = info.year;
      filled.push('年份');
    }
    if (Object.keys(patch).length > 0) updateAnime(db, anime.id, patch);

    if (source && info.externalId) {
      linkExternal(db, anime.id, source, String(info.externalId));
    }

    // 集数只在从未设过时补，已有集数一律不动（避免冲掉用户改过的值）
    const before = computeProgress(db, anime.id);
    if (before.total === 0 && info.episodes) {
      ensureEpisodes(db, anime.id, info.episodes);
      filled.push(`${info.episodes} 集`);
    }

    // 标签同理：只在完全没有标签时补，不覆盖用户自己的分类
    const existingTags = listTagsOfAnime(db, anime.id);
    if (existingTags.length === 0 && Array.isArray(info.tags) && info.tags.length > 0) {
      for (const name of info.tags) {
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

  const externals = listExternals(db, animeId);

  if (externals.length > 0) {
    const e = externals[0];
    let info;
    try {
      info = await fetchDetail(cfg, e.provider, String(e.external_id));
    } catch (err) {
      return { matched: false, reason: 'network', message: `拉取失败：${err.message}` };
    }
    const filled = applyInfo(db, anime, e.provider, info);
    return {
      matched: true,
      source: e.provider,
      matched_title: info.title,
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
  const exact = candidates.find((it) => titleMatchesExactly(anime.canonical_title, it));

  if (!exact) {
    return {
      matched: false,
      reason: candidates.length ? 'ambiguous' : 'not_found',
      message: candidates.length
        ? '没有完全同名的条目，需要你确认是哪一个'
        : '两个数据源都没搜到，可能名字不一致，或者数据源连不上',
      candidates: candidates.slice(0, 5)
    };
  }

  let info;
  try {
    info = await fetchDetail(cfg, exact.source, exact.externalId);
  } catch (err) {
    return { matched: false, reason: 'network', message: `拉取详情失败：${err.message}` };
  }

  const filled = applyInfo(db, anime, exact.source, info);
  return {
    matched: true,
    source: exact.source,
    matched_title: info.title,
    filled,
    changed: filled.length > 0,
    progress: computeProgress(db, animeId)
  };
}

/** 用户在候选里挑了一个：绑定它并补全 */
export async function applyCandidate(db, cfg, animeId, { source, external_id } = {}) {
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

  const filled = applyInfo(db, anime, src, info);
  return {
    matched: true,
    source: src,
    matched_title: info.title,
    filled,
    changed: filled.length > 0,
    progress: computeProgress(db, animeId)
  };
}

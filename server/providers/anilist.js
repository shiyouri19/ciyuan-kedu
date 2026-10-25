import { requestJson } from '../net.js';

const API = 'https://graphql.anilist.co';
const TEST_URL = API;

const MEDIA_FIELDS = `
  id
  title { native romaji english }
  startDate { year }
  episodes
  coverImage { large medium }
  description(asHtml: false)
  averageScore
  format
  seasonYear
  genres
`;

/**
 * AniList 搜索。
 * 注意：对中文关键词的检索很不可靠（实测「葬送的芙莉莲」零命中），
 * 日文原名与罗马字效果好。因此作为 Bangumi 的补充与兜底，而不是首选。
 */
const FALLBACK_UA = 'ciyuan-kedu/0.1 (local anime ledger)';

export async function search(keyword, { proxy = '', ua = FALLBACK_UA, limit = 8 } = {}) {
  const query = `
    query ($search: String, $perPage: Int) {
      Page(perPage: $perPage) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
      }
    }
  `;

  const res = await requestJson(API, {
    method: 'POST',
    body: JSON.stringify({ query, variables: { search: keyword, perPage: limit } }),
    proxy,
    headers: { 'User-Agent': ua || FALLBACK_UA, 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 12000
  });

  if (res.status !== 200) throw new Error(`AniList 搜索返回 HTTP ${res.status}`);

  const list = res.json?.data?.Page?.media ?? [];
  return list.map(toNormalized);
}

export async function detail(externalId, { proxy = '', ua = FALLBACK_UA } = {}) {
  const query = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`;
  const res = await requestJson(API, {
    method: 'POST',
    body: JSON.stringify({ query, variables: { id: Number(externalId) } }),
    proxy,
    headers: { 'User-Agent': ua || FALLBACK_UA, 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 12000
  });

  if (res.status !== 200) throw new Error(`AniList 详情返回 HTTP ${res.status}`);
  const media = res.json?.data?.Media;
  if (!media) throw new Error('AniList 上找不到这个条目');
  return toNormalized(media);
}

const SEASON_TO_ANILIST = {
  winter: 'WINTER',
  spring: 'SPRING',
  summer: 'SUMMER',
  autumn: 'FALL',
  fall: 'FALL'
};

/**
 * 按年份与季度从 AniList 获取完整季度新番列表（支持自动翻页拉取最多 100 部当季动画）。
 */
export async function seasonal(year, season = 'winter', { proxy = '', ua = FALLBACK_UA, limit = 100 } = {}) {
  const y = Number(year) || new Date().getFullYear();
  const alSeason = SEASON_TO_ANILIST[String(season || 'winter').toLowerCase()] || 'WINTER';
  const maxItems = Math.min(Math.max(Number(limit) || 100, 1), 150);
  const perPage = Math.min(maxItems, 50);

  const query = `
    query ($page: Int, $year: Int, $season: MediaSeason, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          total
        }
        media(season: $season, seasonYear: $year, type: ANIME, format_in: [TV, TV_SHORT, ONA], sort: [POPULARITY_DESC, SCORE_DESC]) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  const fetchPage = async (pageNum) => {
    const res = await requestJson(API, {
      method: 'POST',
      body: JSON.stringify({
        query,
        variables: { page: pageNum, year: y, season: alSeason, perPage }
      }),
      proxy,
      headers: {
        'User-Agent': ua || FALLBACK_UA,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      timeout: 12000
    });
    if (res.status !== 200) {
      throw new Error(`AniList 季度番表返回 HTTP ${res.status}`);
    }
    return {
      hasNextPage: Boolean(res.json?.data?.Page?.pageInfo?.hasNextPage),
      media: res.json?.data?.Page?.media ?? []
    };
  };

  const p1 = await fetchPage(1);
  const allMedia = [...p1.media];

  if (maxItems > 50 && p1.hasNextPage && p1.media.length >= 50) {
    try {
      const p2 = await fetchPage(2);
      allMedia.push(...p2.media);
    } catch {
      /* ignore page 2 error */
    }
  }

  return allMedia.slice(0, maxItems).map(toNormalized);
}

function toNormalized(media) {
  const title = media.title ?? {};
  const year = media.seasonYear ?? media.startDate?.year ?? null;
  // AniList 的 averageScore 是 0-100，换算成 10 分制以便和 Bangumi 对齐
  const score = typeof media.averageScore === 'number' ? Math.round(media.averageScore) / 10 : null;

  return {
    source: 'anilist',
    externalId: String(media.id),
    title: title.native || title.romaji || title.english || '',
    titleNative: title.native || '',
    titleAlt: title.romaji || title.english || '',
    year: year ?? null,
    episodes: media.episodes ?? null,
    coverUrl: media.coverImage?.large || media.coverImage?.medium || '',
    summary: cleanDescription(media.description),
    score,
    // AniList 的标签是英文分类，作为兜底（中文场景下 Bangumi 的标签质量更高）
    tags: Array.isArray(media.genres) ? media.genres.slice(0, 3) : []
  };
}

function cleanDescription(text) {
  return String(text ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function testUrl() {
  return API;
}

export const TEST_URLS = [TEST_URL];

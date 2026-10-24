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
export async function search(keyword, { proxy = '', ua, limit = 8 } = {}) {
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
    headers: { 'User-Agent': ua, 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 12000
  });

  if (res.status !== 200) throw new Error(`AniList 搜索返回 HTTP ${res.status}`);

  const list = res.json?.data?.Page?.media ?? [];
  return list.map(toNormalized);
}

export async function detail(externalId, { proxy = '', ua } = {}) {
  const query = `query ($id: Int) { Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} } }`;
  const res = await requestJson(API, {
    method: 'POST',
    body: JSON.stringify({ query, variables: { id: Number(externalId) } }),
    proxy,
    headers: { 'User-Agent': ua, 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 12000
  });

  if (res.status !== 200) throw new Error(`AniList 详情返回 HTTP ${res.status}`);
  const media = res.json?.data?.Media;
  if (!media) throw new Error('AniList 上找不到这个条目');
  return toNormalized(media);
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

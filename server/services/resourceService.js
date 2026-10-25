import { randomUUID } from 'node:crypto';
import { withTransaction } from '../db/index.js';
import { getAnime } from '../repositories/anime.js';
import { requestText, resolveProxy, DEFAULT_UA } from '../net.js';
import { parseVideoFilename } from './mediaParser.js';
import { NotFoundError, ValidationError } from '../errors.js';

const DEFAULT_RSS_TEMPLATES = [
  {
    name: '蜜柑计划 RSS',
    url: 'https://mikanani.me/RSS/Search?searchstr={keyword}'
  },
  {
    name: '动漫花园 RSS',
    url: 'https://share.dmhy.org/topics/rss/rss.xml?keyword={keyword}'
  }
];

function decodeXmlEntities(str) {
  return String(str ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractTagContent(block, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

function extractAttr(block, tagName, attrName) {
  const re = new RegExp(`<${tagName}[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : '';
}

function formatByteSize(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(n / 1024)} KB`;
}

/**
 * 解析 RSS 2.0 / Atom XML 文本并结合字幕组文件名解析器提取分辨率、字幕组、集数与磁力/种子链接。
 * 纯函数，便于独立单元测试。
 */
export function parseRssXml(xmlText, providerName = 'RSS 源') {
  const xml = String(xmlText ?? '');
  if (!xml.trim()) return [];

  const blocks = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    blocks.push(m[1]);
  }
  if (blocks.length === 0) {
    const entryRe = /<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi;
    while ((m = entryRe.exec(xml)) !== null) {
      blocks.push(m[1]);
    }
  }

  const results = [];
  for (const b of blocks.slice(0, 60)) {
    const title = extractTagContent(b, 'title');
    if (!title) continue;

    let link = extractTagContent(b, 'link') || extractAttr(b, 'link', 'href');
    const enclosureUrl = extractAttr(b, 'enclosure', 'url');
    const enclosureLen = extractAttr(b, 'enclosure', 'length');
    const pubDateRaw =
      extractTagContent(b, 'pubDate') ||
      extractTagContent(b, 'published') ||
      extractTagContent(b, 'updated');

    let magnetUrl = null;
    if (enclosureUrl.startsWith('magnet:')) {
      magnetUrl = enclosureUrl;
    } else if (link.startsWith('magnet:')) {
      magnetUrl = link;
    } else {
      const magMatch = b.match(/magnet:\?xt=urn:btih:[A-Za-z0-9%&=\-._~]+/i);
      if (magMatch) magnetUrl = decodeXmlEntities(magMatch[0]);
    }

    const resourceUrl = link || enclosureUrl || magnetUrl || '';
    if (!resourceUrl) continue;

    let publishedAt = null;
    if (pubDateRaw) {
      const d = new Date(pubDateRaw);
      if (!Number.isNaN(d.getTime())) {
        publishedAt = d.toISOString().slice(0, 10);
      } else {
        publishedAt = pubDateRaw.slice(0, 10);
      }
    }

    const parsed = parseVideoFilename(`${title}.mkv`);
    let fansub = parsed.fansub || null;
    if (!fansub) {
      const leadBracket = title.match(/^\s*(?:\[([^\][]{1,32})\]|【([^】【]{1,32})】)/);
      const cand = (leadBracket?.[1] || leadBracket?.[2] || '').trim();
      if (cand && !/^(1080p|720p|2160p|4k|mp4|mkv|hevc|x264|x265|\d{2,4})$/i.test(cand)) {
        fansub = cand;
      }
    }
    results.push({
      provider_name: providerName,
      title,
      resource_url: resourceUrl,
      magnet_url: magnetUrl || (enclosureUrl && !enclosureUrl.startsWith('magnet:') ? enclosureUrl : null),
      file_size: formatByteSize(enclosureLen),
      published_at: publishedAt,
      resolution: parsed.resolution || null,
      subtitle_info: parsed.subtitleInfo || null,
      fansub,
      episode_number: parsed.episodeNumber ?? null
    });
  }

  return results;
}

/**
 * 将资源条目列表按字幕组 (fansub) 分类聚合，方便前端按字幕组分栏查看与批量复制磁力链。
 */
export function groupResourcesByFansub(items = []) {
  const UNLABELED = '未标注字幕组';
  const groupMap = new Map();

  for (const it of items) {
    let groupName = String(it.fansub ?? '').trim();
    if (!groupName) {
      const leadBracket = String(it.title ?? '').match(/^\s*(?:\[([^\][]{1,32})\]|【([^】【]{1,32})】)/);
      const cand = (leadBracket?.[1] || leadBracket?.[2] || '').trim();
      if (cand && !/^(1080p|720p|2160p|4k|mp4|mkv|hevc|x264|x265|\d{2,4})$/i.test(cand)) {
        groupName = cand;
      } else {
        groupName = UNLABELED;
      }
    }

    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, {
        fansub: groupName,
        is_unlabeled: groupName === UNLABELED,
        items: [],
        resolutions: new Set(),
        subtitle_infos: new Set(),
        magnet_count: 0
      });
    }
    const g = groupMap.get(groupName);
    g.items.push({ ...it, fansub: groupName === UNLABELED ? it.fansub : groupName });
    if (it.resolution) g.resolutions.add(it.resolution);
    if (it.subtitle_info) g.subtitle_infos.add(it.subtitle_info);
    if (it.magnet_url) g.magnet_count += 1;
  }

  const groups = [...groupMap.values()].map((g) => {
    const sortedItems = [...g.items].sort((a, b) => {
      const epA = a.episode_number ?? -1;
      const epB = b.episode_number ?? -1;
      if (epA !== epB) return epB - epA;
      return String(b.published_at || '').localeCompare(String(a.published_at || ''));
    });

    return {
      fansub: g.fansub,
      is_unlabeled: g.is_unlabeled,
      count: sortedItems.length,
      magnet_count: g.magnet_count,
      resolutions: [...g.resolutions],
      subtitle_infos: [...g.subtitle_infos],
      items: sortedItems
    };
  });

  groups.sort((a, b) => {
    if (a.is_unlabeled !== b.is_unlabeled) return a.is_unlabeled ? 1 : -1;
    if (b.count !== a.count) return b.count - a.count;
    return a.fansub.localeCompare(b.fansub, 'zh-CN');
  });

  return groups;
}

/**
 * 读取某部作品已缓存的站内资源列表（离线可用），同时返回按字幕组分类的聚合结构。
 */
export function listCachedResources(db, animeId) {
  const anime = getAnime(db, animeId);
  if (!anime) throw new NotFoundError('作品不存在或已被删除');

  const items = db
    .prepare(
      `SELECT id, provider_id, provider_name, anime_id, title, resource_url, magnet_url,
              file_size, published_at, resolution, subtitle_info, fansub, episode_number, cached_at
         FROM resource_items
        WHERE anime_id = ?
        ORDER BY COALESCE(published_at, cached_at) DESC, episode_number DESC
        LIMIT 120`
    )
    .all(animeId);

  const groupsByFansub = groupResourcesByFansub(items);

  return {
    anime_id: animeId,
    title: anime.canonical_title,
    count: items.length,
    fansub_count: groupsByFansub.length,
    groups_by_fansub: groupsByFansub,
    data: items
  };
}

/**
 * 将解析出的资源列表写入 SQLite `resource_items` 缓存表。
 */
export function saveResourceItems(db, animeId, items = []) {
  const anime = getAnime(db, animeId);
  if (!anime) throw new NotFoundError('作品不存在或已被删除');

  let saved = 0;
  const ts = new Date().toISOString();

  withTransaction(db, () => {
    for (const it of items) {
      const title = String(it.title ?? '').trim();
      const resourceUrl = String(it.resource_url ?? '').trim();
      if (!title || !resourceUrl) continue;

      db.prepare(
        `INSERT INTO resource_items (
           id, provider_id, provider_name, anime_id, title, resource_url, magnet_url,
           file_size, published_at, resolution, subtitle_info, fansub, episode_number, cached_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(anime_id, resource_url)
         DO UPDATE SET title          = excluded.title,
                       magnet_url     = COALESCE(excluded.magnet_url, resource_items.magnet_url),
                       file_size      = COALESCE(excluded.file_size, resource_items.file_size),
                       published_at   = COALESCE(excluded.published_at, resource_items.published_at),
                       resolution     = COALESCE(excluded.resolution, resource_items.resolution),
                       subtitle_info  = COALESCE(excluded.subtitle_info, resource_items.subtitle_info),
                       fansub         = COALESCE(excluded.fansub, resource_items.fansub),
                       episode_number = COALESCE(excluded.episode_number, resource_items.episode_number),
                       cached_at      = excluded.cached_at`
      ).run(
        randomUUID(),
        it.provider_id ?? null,
        it.provider_name ?? 'RSS 聚合',
        animeId,
        title,
        resourceUrl,
        it.magnet_url ?? null,
        it.file_size ?? null,
        it.published_at ?? null,
        it.resolution ?? null,
        it.subtitle_info ?? null,
        it.fansub ?? null,
        it.episode_number ?? null,
        ts
      );
      saved += 1;
    }
  });

  return saved;
}

/**
 * 从公开 RSS 源拉取番剧资源列表并缓存到 `resource_items`。
 * 支持传入自定义 rssUrl 或 xmlText（用于测试或离线导入 RSS 内容），网络不可达时返回已有缓存与清晰原因。
 */
export async function fetchAnimeResources(
  db,
  cfg,
  animeId,
  { keyword = '', rssUrl = '', xmlText = '', providerName = '' } = {}
) {
  const anime = getAnime(db, animeId);
  if (!anime) throw new NotFoundError('作品不存在或已被删除');

  const queryKeyword = String(keyword || anime.canonical_title || '').trim();
  if (!queryKeyword) {
    throw new ValidationError('搜索关键词不能为空', 'keyword');
  }

  // 如果调用方直接提供了 XML 文本（如测试或手动粘贴 RSS），直接解析并落库
  if (xmlText && String(xmlText).trim()) {
    const parsed = parseRssXml(xmlText, providerName || '自定义 RSS');
    const saved = saveResourceItems(db, animeId, parsed);
    const cached = listCachedResources(db, animeId);
    return {
      ok: true,
      source: providerName || '自定义 RSS',
      fetched: parsed.length,
      saved,
      from_cache: false,
      ...cached
    };
  }

  const candidateFeeds = rssUrl
    ? [{ name: providerName || '自定义 RSS', url: rssUrl }]
    : DEFAULT_RSS_TEMPLATES.map((t) => ({
        name: t.name,
        url: t.url.replace('{keyword}', encodeURIComponent(queryKeyword))
      }));

  const errors = [];
  for (const feed of candidateFeeds) {
    try {
      const targetUrl = feed.url.includes('{keyword}')
        ? feed.url.replace('{keyword}', encodeURIComponent(queryKeyword))
        : feed.url;
      const u = new URL(targetUrl);
      const proxy = await resolveProxy(cfg, `${u.protocol}//${u.host}`);
      const res = await requestText(targetUrl, {
        proxy,
        timeout: 6500,
        headers: {
          'User-Agent': cfg?.userAgent || DEFAULT_UA,
          Accept: 'application/rss+xml, application/xml, text/xml, */*'
        }
      });
      if (res.status < 200 || res.status >= 300) {
        errors.push(`${feed.name}: HTTP ${res.status}`);
        continue;
      }
      const xml = res.text;
      const parsed = parseRssXml(xml, feed.name);
      if (parsed.length > 0) {
        const saved = saveResourceItems(db, animeId, parsed);
        const cached = listCachedResources(db, animeId);
        return {
          ok: true,
          source: feed.name,
          fetched: parsed.length,
          saved,
          from_cache: false,
          ...cached
        };
      }
      errors.push(`${feed.name}: 未解析到匹配条目`);
    } catch (err) {
      errors.push(`${feed.name}: ${err.message}`);
    }
  }

  const cached = listCachedResources(db, animeId);
  return {
    ok: false,
    from_cache: true,
    message:
      cached.count > 0
        ? `远程 RSS 暂不可达（${errors.join('；')}），已展示本地缓存的 ${cached.count} 条资源记录`
        : `远程 RSS 暂不可达（${errors.join('；')}），可直接点击上方站点按钮在浏览器打开搜索`,
    errors,
    ...cached
  };
}

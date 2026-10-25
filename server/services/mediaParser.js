import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { withTransaction } from '../db/index.js';
import { ValidationError, NotFoundError } from '../errors.js';
import { createAnimeEntry } from './animeService.js';
import { getAnime, updateAnime, linkExternal, addAlias } from '../repositories/anime.js';
import { getOrCreateTag, attachTag, listTagsOfAnime } from '../repositories/meta.js';
import { lookupCuratedChineseEntry } from '../providers/bilibili.js';
import { ensureEpisodes, getEpisodesView, markEpisode, addSpecialEpisode } from './episodeService.js';

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mkv',
  '.avi',
  '.mov',
  '.flv',
  '.webm',
  '.ts',
  '.m2ts',
  '.rmvb',
  '.wmv'
]);

export function isVideoFile(filename) {
  const ext = path.extname(String(filename ?? '')).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

const NOISE_TAG_RE =
  /^(?:1080p|2160p|1440p|720p|576p|480p|4k|1920x1080|3840x2160|1280x720|hevc|x264|x265|h264|h265|avc|aac|flac|ac3|opus|10bit|8bit|ma10p|hi10p|hdr|dv|web-?dl|webrip|bdrip|bdremux|bluray|bd|dvdrip|tvrip|baha|b-?global|viu|cr|at-?x|chs|cht|jpsc|jptc|jpst|jpn|gb|big5|mp4|mkv|简日|繁日|简繁|简体|繁体|内嵌|内封|外挂|双语|字幕|简繁日.*|简日双语.*|繁日双语.*)$/i;

const SUBTITLE_TAG_RE =
  /^(?:chs|cht|jpsc|jptc|jpst|gb|big5|简日|繁日|简繁|简体|繁体|内嵌|内封|外挂|双语|字幕|简繁日.*|简日双语.*|繁日双语.*|chs&cht)$/i;

const EPISODE_NUMBER_BLACKLIST = new Set([
  480, 576, 720, 1080, 1440, 2160, 4320, 264, 265
]);

function isPlausibleEpisodeNum(n, allowYearRange = false) {
  if (!Number.isInteger(n) || n < 0 || n > 1999) return false;
  if (EPISODE_NUMBER_BLACKLIST.has(n)) return false;
  if (!allowYearRange && n >= 1970 && n <= 2039) return false;
  return true;
}

function isNoiseBracketContent(content) {
  const tokens = String(content ?? '')
    .trim()
    .split(/[\s_+&/,，·-]+/)
    .filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every((tk) => NOISE_TAG_RE.test(tk) || /^[0-9a-f]{8}$/i.test(tk));
}

function cleanAnimeTitle(raw) {
  let s = String(raw ?? '').trim();
  if (s.includes(' / ')) {
    const parts = s.split(' / ').map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) s = parts[0];
  }
  s = s
    .replace(
      /\b(?:1080p|2160p|1440p|720p|576p|480p|4k|x264|x265|h264|h265|hevc|avc|aac|flac|web-?dl|webrip|bdrip|10bit|8bit|ma10p|hi10p)\b/gi,
      ' '
    )
    .replace(/\((?:19|20)\d{2}\)/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/(?:\s+[-~～]+\s*|[-~～]+\s+)$/g, '')
    .replace(/^\s*[-~～&]+\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/**
 * 字幕组视频文件名分步清洗与解析管线（遵循 REFERENCE_RESEARCH.md 规范与防踩坑策略）：
 * 1. 剥离视频扩展名与提取 8 位十六进制 CRC32 校验码
 * 2. 提取分辨率、字幕信息与版本标签
 * 3. 剥离字幕组前缀 [Group]
 * 4. 优先识别 NCOP/NCED/PV/CM/Menu 特典（isExtra: true，绝不误判为正片第 1 集）与 SP/OVA/OAD 特别篇
 * 5. 提取季度号（S2 / 第2季 / 2nd Season）与集数（[01] / - 01 / S01E01 / 第01话），过滤分辨率/编码/年份黑名单并保护数字番名（如 86 -Eighty Six-）
 * 6. 清洗出干净的番剧名称候选（若文件名为纯集数如 01.mp4，则自动回退取上级文件夹名）
 */
export function parseVideoFilename(rawFilename, folderName = '') {
  const rawStr = String(rawFilename ?? '').trim();
  const baseName = rawStr.split(/(?<!\s)[/\\](?!\s)/).pop() || rawStr;
  const ext = path.extname(baseName);
  let stem = ext ? baseName.slice(0, -ext.length) : baseName;

  const resMatch = stem.match(/\b(2160p|1440p|1080p|720p|576p|480p|4K|1920x1080|3840x2160)\b/i);
  const resolution = resMatch ? resMatch[1].toUpperCase().replace('P', 'p') : null;

  let crc32 = null;
  const crcMatch = stem.match(/\[([0-9A-Fa-f]{8})\]/);
  if (crcMatch) {
    crc32 = crcMatch[1].toUpperCase();
  }
  stem = stem.replace(/\[[0-9A-Fa-f]{8}\]/g, ' ');

  let fansub = null;
  let subtitleInfo = null;
  let episodeNumber = null;
  let episodeKey = null;
  let isSpecial = false;
  let isExtra = false;
  let seasonNumber = 1;
  let explicitSeason = null;

  const brackets = [];
  const bracketRe = /\[([^\]]+)\]|\(([^)]+)\)|【([^】]+)】/g;
  let m;
  while ((m = bracketRe.exec(stem)) !== null) {
    brackets.push({
      full: m[0],
      inner: (m[1] ?? m[2] ?? m[3] ?? '').trim(),
      index: m.index
    });
  }

  for (const b of brackets) {
    const tokens = b.inner.split(/[\s_+&/,，·-]+/).filter(Boolean);
    const subHit = tokens.find((tk) => SUBTITLE_TAG_RE.test(tk));
    if (subHit && !subtitleInfo) {
      subtitleInfo = subHit.toUpperCase();
    }
  }

  const seMatch = stem.match(/\bS(\d{1,2})E(\d{1,3})(?:v\d+)?\b/i);
  if (seMatch) {
    seasonNumber = Number(seMatch[1]);
    explicitSeason = seasonNumber;
    episodeNumber = Number(seMatch[2]);
    episodeKey = String(episodeNumber);
    stem = stem.replace(seMatch[0], ' ');
  }

  const nonNoiseBrackets = [];
  for (let i = 0; i < brackets.length; i += 1) {
    const b = brackets[i];
    const inner = b.inner;

    if (isNoiseBracketContent(inner)) {
      continue;
    }

    // 优先检测括号内的 NCOP / NCED / PV / CM / Menu 特典
    const extraBracketMatch = inner.match(/^(NCOP|NCED|OP|ED|PV|CM|Preview|Menu|映像特典)\s*(\d{0,2}[a-z]?)$/i);
    if (extraBracketMatch && episodeNumber === null) {
      isSpecial = true;
      isExtra = true;
      episodeKey = `${extraBracketMatch[1].toUpperCase()}${extraBracketMatch[2] || ''}`;
      continue;
    }

    const spMatch = inner.match(/^(SP|OVA|OAD|Special|番外)\s*(\d{1,2})?$/i);
    if (spMatch && episodeNumber === null && !isExtra) {
      isSpecial = true;
      const prefix = spMatch[1].toUpperCase().startsWith('OVA')
        ? 'OVA'
        : spMatch[1].toUpperCase().startsWith('OAD')
          ? 'OAD'
          : 'SP';
      episodeNumber = spMatch[2] ? Number(spMatch[2]) : 1;
      episodeKey = `${prefix}${episodeNumber}`;
      continue;
    }

    const epBracketMatch = inner.match(/^(\d{1,3})(?:v\d+|\s*END|\s*完)?$/i);
    if (epBracketMatch && episodeNumber === null && !isExtra) {
      const n = Number(epBracketMatch[1]);
      if (isPlausibleEpisodeNum(n)) {
        episodeNumber = n;
        episodeKey = String(n);
        continue;
      }
    }

    nonNoiseBrackets.push(b);
  }

  const outsideText = stem
    .replace(/\[[^\]]*\]|\([^)]*\)|【[^】]*】/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let workingTitle = '';

  if (outsideText && outsideText.replace(/[-_~～&\s\d]/g, '').length >= 2) {
    if (nonNoiseBrackets.length > 0) {
      fansub = nonNoiseBrackets[0].inner;
    }
    workingTitle = outsideText;
  } else if (nonNoiseBrackets.length >= 2) {
    fansub = nonNoiseBrackets[0].inner;
    workingTitle = nonNoiseBrackets[1].inner;
  } else if (nonNoiseBrackets.length === 1) {
    workingTitle = nonNoiseBrackets[0].inner;
  } else {
    workingTitle = outsideText;
  }

  // 检测括号外的 NCOP / NCED / PV / CM / Preview / Menu 特典
  if (episodeNumber === null && !isExtra) {
    const extraOutside = workingTitle.match(
      /(?:[-~～\s]|^)(NCOP|NCED|Creditless\s*OP|Creditless\s*ED|OP|ED|PV|CM|Preview|预告|Menu)\s*(\d{0,2}[a-z]?)(?:\b|$)/i
    );
    if (extraOutside) {
      isSpecial = true;
      isExtra = true;
      episodeKey = `${extraOutside[1].replace(/\s+/g, '').toUpperCase()}${extraOutside[2] || ''}`;
      workingTitle = workingTitle.slice(0, extraOutside.index);
    }
  }

  if (episodeNumber === null && !isExtra) {
    const spOutside = workingTitle.match(/\b(SP|OVA|OAD)\s*(\d{1,2})?\b/i);
    const cnEp = workingTitle.match(/第\s*(\d{1,3})\s*[话話集回]/);
    const epTag = workingTitle.match(/\b(?:EP|E)(\d{1,3})(?:v\d+)?\b/i);
    // 取最后一个 `- 05` 形式的分隔符，防止破坏 `86 -Eighty Six- - 05` 的标题前缀
    const dashMatches = [...workingTitle.matchAll(/(?:^|\s)[-~～]\s*(\d{1,3})(?:v\d+|\s*END)?(?:\s|$)/gi)];
    const dashEp = dashMatches.length > 0 ? dashMatches[dashMatches.length - 1] : null;
    const tailEp = workingTitle.match(/\s+(\d{1,3})(?:v\d+)?$/);
    const pureEp = workingTitle.match(/^(\d{1,3})(?:v\d+)?$/);

    if (spOutside) {
      isSpecial = true;
      const prefix = spOutside[1].toUpperCase();
      episodeNumber = spOutside[2] ? Number(spOutside[2]) : 1;
      episodeKey = `${prefix}${episodeNumber}`;
      workingTitle = workingTitle.slice(0, spOutside.index);
    } else if (cnEp && isPlausibleEpisodeNum(Number(cnEp[1]), true)) {
      episodeNumber = Number(cnEp[1]);
      episodeKey = String(episodeNumber);
      workingTitle = workingTitle.slice(0, cnEp.index);
    } else if (epTag && isPlausibleEpisodeNum(Number(epTag[1]), true)) {
      episodeNumber = Number(epTag[1]);
      episodeKey = String(episodeNumber);
      workingTitle = workingTitle.slice(0, epTag.index);
    } else if (dashEp && isPlausibleEpisodeNum(Number(dashEp[1]))) {
      episodeNumber = Number(dashEp[1]);
      episodeKey = String(episodeNumber);
      workingTitle = workingTitle.slice(0, dashEp.index);
    } else if (tailEp && Number(tailEp[1]) <= 500 && isPlausibleEpisodeNum(Number(tailEp[1]))) {
      episodeNumber = Number(tailEp[1]);
      episodeKey = String(episodeNumber);
      workingTitle = workingTitle.slice(0, tailEp.index);
    } else if (pureEp && Number(pureEp[1]) <= 500 && isPlausibleEpisodeNum(Number(pureEp[1]))) {
      episodeNumber = Number(pureEp[1]);
      episodeKey = String(episodeNumber);
      workingTitle = '';
    }
  }

  const seasonPatterns = [
    { re: /\b(?:Season|S)\s*0?(\d{1,2})\b/i, group: 1 },
    { re: /第\s*([一二三四五六七八九十123456789]+)\s*[季期部分]/, group: 1 },
    { re: /\b([2345])(?:nd|rd|th)\s+Season\b/i, group: 1 },
    { re: /(?:[\s·/_-]+)(II|III|IV|Ⅱ|Ⅲ|Ⅳ)(?:\s|$)/, group: 1 }
  ];
  const cnNumMap = {
    一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
    II: 2, III: 3, IV: 4, 'Ⅱ': 2, 'Ⅲ': 3, 'Ⅳ': 4
  };
  for (const sp of seasonPatterns) {
    const sm = workingTitle.match(sp.re);
    if (sm) {
      const rawS = sm[sp.group];
      seasonNumber = cnNumMap[rawS] || Number(rawS) || 1;
      explicitSeason = seasonNumber;
      workingTitle = workingTitle.replace(sm[0], ' ');
      break;
    }
  }

  let titleCandidate = cleanAnimeTitle(workingTitle);

  if (folderName) {
    let rawFolder = String(folderName)
      .replace(/\[[^\]]*\]/g, ' ')
      .trim();
    for (const sp of seasonPatterns) {
      const sm = rawFolder.match(sp.re);
      if (sm) {
        if (explicitSeason === null) {
          const rawS = sm[sp.group];
          seasonNumber = cnNumMap[rawS] || Number(rawS) || 1;
          explicitSeason = seasonNumber;
        }
        rawFolder = rawFolder.replace(sm[0], ' ');
        break;
      }
    }
    if (!titleCandidate || /^\d+$/.test(titleCandidate)) {
      const cleanedFolder = cleanAnimeTitle(rawFolder);
      if (cleanedFolder) titleCandidate = cleanedFolder;
    }
  }

  const versionBits = [fansub, resolution, subtitleInfo].filter(Boolean);
  const versionLabel = versionBits.length > 0 ? versionBits.join(' · ') : '本地视频';
  const finalTitle = titleCandidate || '未识别标题';
  const resUpper = resolution ? resolution.toUpperCase() : null;

  return {
    fileName: baseName,
    titleCandidate: finalTitle,
    seasonNumber,
    explicitSeason,
    episodeNumber,
    episodeKey,
    isSpecial,
    isExtra,
    fansub,
    resolution,
    subtitleInfo,
    crc32,
    versionLabel,
    // 兼容防踩坑测试字段别名
    parsed_title: finalTitle === '未识别标题' ? null : finalTitle,
    parsed_season: seasonNumber,
    explicit_season: explicitSeason,
    parsed_episode: episodeNumber,
    parsed_episode_key: episodeKey,
    is_special: isSpecial,
    is_extra: isExtra,
    subtitle_group: fansub,
    subtitle_info: subtitleInfo,
    resolution_upper: resUpper
  };
}

export const parseMediaFilename = parseVideoFilename;

function normalizeMatchKey(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s·!！?？:：,，。.~～\-_/'"]+/g, '');
}

function isMovieOrOvaTitle(str) {
  return /(?:剧场版|劇場版|Movie|The\s*Movie|映画|总集篇|總集篇)/i.test(String(str ?? ''));
}

/**
 * 加载库内所有活跃作品及其别名，用于高精度匹配与歧义检测（遵循 REFERENCE_RESEARCH.md）
 * 支持：
 * 1. 自动通过内置词典关联罗马音/英文别名（如 Sousou no Frieren -> 葬送的芙莉莲）
 * 2. 剧场版/总集篇负样本降权（当文件名不含剧场版字样时，优先匹配 TV 正片而非同系列剧场版）
 */
function loadLibraryMatcher(db) {
  const animeRows = db
    .prepare(
      `SELECT a.id, a.canonical_title, a.sort_title, a.anime_type, s.status,
              (SELECT COUNT(*) FROM episodes e JOIN seasons se ON se.id = e.season_id WHERE se.anime_id = a.id AND e.is_special = 0) AS episode_total,
              (SELECT COUNT(*) FROM episode_watch_state w JOIN episodes e ON e.id = w.episode_id JOIN seasons se ON se.id = e.season_id WHERE se.anime_id = a.id AND w.is_watched = 1 AND e.is_special = 0) AS episode_watched
       FROM anime a
       LEFT JOIN user_anime_state s ON s.anime_id = a.id
       WHERE a.deleted_at IS NULL`
    )
    .all();

  let aliasRows = [];
  try {
    aliasRows = db.prepare('SELECT anime_id, alias FROM anime_aliases').all();
  } catch {
    aliasRows = [];
  }

  const aliasesByAnime = new Map();
  for (const r of aliasRows) {
    if (!aliasesByAnime.has(r.anime_id)) aliasesByAnime.set(r.anime_id, []);
    aliasesByAnime.get(r.anime_id).push(r.alias);
  }

  const enriched = animeRows.map((row) => {
    const keys = new Set();
    const k1 = normalizeMatchKey(row.canonical_title);
    const k2 = normalizeMatchKey(row.sort_title);
    if (k1) keys.add(k1);
    if (k2) keys.add(k2);
    for (const al of aliasesByAnime.get(row.id) || []) {
      const ka = normalizeMatchKey(al);
      if (ka) keys.add(ka);
    }
    // 结合内置精选词典扩展同义别名（例如库里只有中文「葬送的芙莉莲」，自动补充 Sousou no Frieren 匹配键）
    const curated = lookupCuratedChineseEntry(row.canonical_title, row.sort_title || '');
    if (curated && normalizeMatchKey(curated.title) === k1) {
      if (curated.titleNative) keys.add(normalizeMatchKey(curated.titleNative));
      for (const ca of curated.aliases || []) {
        const kca = normalizeMatchKey(ca);
        if (kca) keys.add(kca);
      }
    }
    const isMovieEntry = row.anime_type === 'movie' || isMovieOrOvaTitle(row.canonical_title);
    return { ...row, matchKeys: [...keys], isMovieEntry };
  });

  /**
   * 返回 { matchType: 'exact_unique' | 'ambiguous' | 'none', matched: row | null, candidates: row[] }
   */
  return function evaluateCandidate(candidateTitle, { rawFileName = '' } = {}) {
    const key = normalizeMatchKey(candidateTitle);
    if (!key || candidateTitle === '未识别标题') {
      return { matchType: 'none', matched: null, candidates: [] };
    }

    const fileIsMovie = isMovieOrOvaTitle(rawFileName) || isMovieOrOvaTitle(candidateTitle);

    const exactHits = enriched.filter((r) => r.matchKeys.includes(key));
    if (exactHits.length === 1) {
      return { matchType: 'exact_unique', matched: exactHits[0], candidates: exactHits };
    }
    if (exactHits.length > 1) {
      // 若文件本身不是剧场版，且精确命中里只有 1 部非剧场版 TV 作品，则优先选中 TV 正片
      if (!fileIsMovie) {
        const nonMovieExact = exactHits.filter((r) => !r.isMovieEntry);
        if (nonMovieExact.length === 1) {
          return { matchType: 'exact_unique', matched: nonMovieExact[0], candidates: exactHits };
        }
      }
      return { matchType: 'ambiguous', matched: null, candidates: exactHits };
    }

    if (key.length >= 2) {
      const fuzzyHits = enriched.filter((r) =>
        r.matchKeys.some((k) => k && (k.includes(key) || key.includes(k)))
      );
      if (fuzzyHits.length === 1 && key.length >= 3) {
        return { matchType: 'exact_unique', matched: fuzzyHits[0], candidates: fuzzyHits };
      }
      if (fuzzyHits.length > 1 && !fileIsMovie) {
        const nonMovieFuzzy = fuzzyHits.filter((r) => !r.isMovieEntry);
        if (nonMovieFuzzy.length === 1 && key.length >= 3) {
          return { matchType: 'exact_unique', matched: nonMovieFuzzy[0], candidates: fuzzyHits };
        }
      }
      if (fuzzyHits.length >= 1) {
        return { matchType: 'ambiguous', matched: null, candidates: fuzzyHits.slice(0, 6) };
      }
    }

    return { matchType: 'none', matched: null, candidates: [] };
  };
}

/**
 * 将解析后的文件列表按作品分组，并与 SQLite 账本中的现有作品进行匹配评估。
 */
export function matchMediaFiles(db, rawFiles = []) {
  if (!Array.isArray(rawFiles)) {
    throw new ValidationError('files 需为文件信息数组', 'files');
  }

  const videoFiles = rawFiles.filter((f) => f && isVideoFile(f.name || f.fileName || f.relativePath));
  const evaluateCandidate = loadLibraryMatcher(db);
  const groupsMap = new Map();

  for (const item of videoFiles) {
    const name = String(item.name || item.fileName || path.basename(item.relativePath || '')).trim();
    const relPath = String(item.relativePath || name).trim();
    const parts = relPath.split(/[/\\]+/).filter(Boolean);
    const parentFolder = parts.length >= 2 ? parts[parts.length - 2] : '';

    const parsed = parseVideoFilename(name, parentFolder);
    const groupKey = `${normalizeMatchKey(parsed.titleCandidate)}::s${parsed.seasonNumber}`;

    if (!groupsMap.has(groupKey)) {
      const curated = lookupCuratedChineseEntry(parsed.titleCandidate, parentFolder);
      let evalRes = evaluateCandidate(parsed.titleCandidate, { rawFileName: name });
      if (evalRes.matchType === 'none' && curated?.title) {
        evalRes = evaluateCandidate(curated.title, { rawFileName: name });
      }
      const matched = evalRes.matched;
      groupsMap.set(groupKey, {
        groupKey,
        titleCandidate: parsed.titleCandidate,
        suggestedChineseTitle: curated?.title || null,
        suggestedMeta: curated
          ? {
              source: 'bangumi',
              external_id: String(curated.externalId),
              title: curated.title,
              title_native: curated.titleNative || null,
              year: curated.year || null,
              episodes: curated.episodes || null,
              cover_url: curated.coverUrl || null,
              synopsis: curated.summary || null,
              tags: curated.tags || []
            }
          : null,
        seasonNumber: parsed.seasonNumber,
        fansub: parsed.fansub,
        resolution: parsed.resolution,
        subtitleInfo: parsed.subtitleInfo,
        versionLabel: parsed.versionLabel,
        matchConfidence: evalRes.matchType,
        matchedAnime: matched
          ? {
              id: matched.id,
              canonical_title: matched.canonical_title,
              status: matched.status || 'want',
              episode_total: Number(matched.episode_total ?? 0),
              episode_watched: Number(matched.episode_watched ?? 0)
            }
          : null,
        candidates: evalRes.candidates.map((c) => ({
          id: c.id,
          canonical_title: c.canonical_title,
          status: c.status || 'want'
        })),
        episodes: []
      });
    }

    const group = groupsMap.get(groupKey);
    if (!group.fansub && parsed.fansub) group.fansub = parsed.fansub;
    if (!group.resolution && parsed.resolution) group.resolution = parsed.resolution;

    group.episodes.push({
      fileName: name,
      relativePath: relPath,
      size: Number(item.size) || 0,
      episodeNumber: parsed.episodeNumber,
      isSpecial: parsed.isSpecial,
      isExtra: parsed.isExtra,
      resolution: parsed.resolution,
      subtitleInfo: parsed.subtitleInfo,
      versionLabel: parsed.versionLabel
    });
  }

  const groups = [...groupsMap.values()].map((g) => {
    g.episodes.sort((a, b) => (a.episodeNumber ?? 9999) - (b.episodeNumber ?? 9999));
    const regularEps = g.episodes
      .filter((e) => !e.isSpecial && Number.isInteger(e.episodeNumber) && e.episodeNumber > 0)
      .map((e) => e.episodeNumber);
    const uniqueEps = [...new Set(regularEps)];
    const maxEpisode = uniqueEps.length > 0 ? Math.max(...uniqueEps) : g.episodes.length;

    return {
      ...g,
      fileCount: g.episodes.length,
      recognizedEpisodes: uniqueEps,
      maxEpisode
    };
  });

  return {
    totalFiles: rawFiles.length,
    videoFiles: videoFiles.length,
    groups
  };
}

/**
 * 扫描服务端本地磁盘路径（适配本地部署或 NAS 挂载目录场景）。
 */
export function scanServerDirectory(db, dirPath) {
  const target = String(dirPath ?? '').trim();
  if (!target) throw new ValidationError('请填写服务端目录路径', 'dirPath');
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new ValidationError(`服务端路径不存在或不是文件夹：${target}`, 'dirPath');
  }

  const collected = [];
  const walk = (currentDir, depth = 0) => {
    if (depth > 4 || collected.length >= 1500) return;
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && isVideoFile(entry.name)) {
        let size = 0;
        let mtime = null;
        try {
          const st = fs.statSync(fullPath);
          size = st.size;
          mtime = st.mtime.toISOString();
        } catch {
          size = 0;
        }
        collected.push({
          name: entry.name,
          fullPath,
          relativePath: path.relative(target, fullPath),
          size,
          modifiedAt: mtime
        });
      }
    }
  };

  walk(target, 0);
  return {
    dirPath: target,
    ...matchMediaFiles(db, collected)
  };
}

/**
 * 将单个媒体文件记录写入或更新至 media_files 表（支持同一集关联多个版本）。
 */
function upsertMediaFileRecord(
  db,
  {
    animeId = null,
    episodeId = null,
    libraryRootId = null,
    filePath,
    fileName,
    fileSizeBytes = null,
    modifiedAt = null,
    resolution = null,
    subtitleInfo = null,
    versionLabel = null,
    parsedTitle = null,
    parsedSeason = 1,
    parsedEpisode = null,
    isSpecial = false,
    candidates = [],
    availabilityStatus = 'available'
  }
) {
  const ts = new Date().toISOString();
  const cleanPath = String(filePath || fileName).trim();
  const existing = db.prepare('SELECT id FROM media_files WHERE path = ?').get(cleanPath);
  const candJson = Array.isArray(candidates) && candidates.length > 0 ? JSON.stringify(candidates) : null;

  if (existing) {
    db.prepare(
      `UPDATE media_files
          SET anime_id = COALESCE(?, anime_id),
              episode_id = COALESCE(?, episode_id),
              library_root_id = COALESCE(?, library_root_id),
              file_name = ?,
              file_size_bytes = ?,
              modified_at = COALESCE(?, modified_at),
              resolution = COALESCE(?, resolution),
              subtitle_info = COALESCE(?, subtitle_info),
              version_label = COALESCE(?, version_label),
              parsed_title = COALESCE(?, parsed_title),
              parsed_season = COALESCE(?, parsed_season),
              parsed_episode = COALESCE(?, parsed_episode),
              is_special = ?,
              candidate_json = ?,
              availability_status = ?,
              updated_at = ?
        WHERE id = ?`
    ).run(
      animeId,
      episodeId,
      libraryRootId,
      fileName,
      fileSizeBytes,
      modifiedAt,
      resolution,
      subtitleInfo,
      versionLabel,
      parsedTitle,
      parsedSeason,
      parsedEpisode,
      isSpecial ? 1 : 0,
      candJson,
      availabilityStatus,
      ts,
      existing.id
    );
    return existing.id;
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO media_files (
       id, anime_id, episode_id, library_root_id, path, file_name, file_size_bytes,
       modified_at, resolution, subtitle_info, version_label, parsed_title,
       parsed_season, parsed_episode, is_special, candidate_json, availability_status,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    animeId,
    episodeId,
    libraryRootId,
    cleanPath,
    fileName,
    fileSizeBytes,
    modifiedAt,
    resolution,
    subtitleInfo,
    versionLabel,
    parsedTitle,
    parsedSeason,
    parsedEpisode,
    isSpecial ? 1 : 0,
    candJson,
    availabilityStatus,
    ts,
    ts
  );
  return id;
}

/**
 * 将识别出的媒体分组一键同步至 SQLite 账本（支持自动建档、补齐集数、写入多版本文件关联、可选标记已看）。
 * 严格遵守 D-002：若未知时长则保持 null，绝不硬编码为 24 分钟。
 */
export function applyMediaGroups(db, { groups = [], markWatched = false, defaultStatus = 'watching' } = {}) {
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new ValidationError('请至少选择一组识别出的番剧', 'groups');
  }

  let createdCount = 0;
  let updatedCount = 0;
  let markedEpisodesCount = 0;
  let linkedFilesCount = 0;

  withTransaction(db, () => {
    for (const g of groups) {
      let animeId = g.matchedAnimeId || g.matchedAnime?.id || null;
      const rawCandidate = String(g.titleCandidate || '').trim();
      const curated = lookupCuratedChineseEntry(g.title, rawCandidate);
      const title = String(g.title || g.suggestedChineseTitle || curated?.title || rawCandidate).trim();
      const sNum = Number(g.seasonNumber) || 1;
      const maxEp = Math.max(
        Number(g.maxEpisode) || 0,
        Array.isArray(g.recognizedEpisodes) ? g.recognizedEpisodes.length : 0
      );
      const targetEpCount = Math.max(
        maxEp,
        Number(g.totalEpisodes) || 0,
        sNum === 1 ? Number(curated?.episodes) || 0 : 0
      );

      const bestCover = g.cover_url || curated?.coverUrl || null;
      const bestYear = g.release_year || curated?.year || null;
      const bestSynopsis = g.synopsis || curated?.summary || null;
      const bestTags =
        Array.isArray(g.tags) && g.tags.length > 0 ? g.tags : curated?.tags ?? [];
      const bestSource = g.source || (curated ? 'bangumi' : null);
      const bestExtId = g.external_id || curated?.externalId || null;

      if (!animeId) {
        if (!title) continue;
        const existing = db
          .prepare('SELECT id FROM anime WHERE canonical_title = ? AND deleted_at IS NULL')
          .get(title);
        if (existing) {
          animeId = existing.id;
          updatedCount += 1;
        } else {
          const aliasSet = new Set();
          if (rawCandidate && rawCandidate !== title) aliasSet.add(rawCandidate);
          if (g.titleNative && g.titleNative !== title) aliasSet.add(g.titleNative);
          if (curated?.titleNative && curated.titleNative !== title) aliasSet.add(curated.titleNative);
          for (const al of curated?.aliases ?? []) {
            if (al && al !== title) aliasSet.add(al);
          }

          // 注意：此处 episodes 传 null，避免当 sNum = 3 时被 createAnimeEntry 默认自动建出第 1 季
          // 同时严格遵守 D-002：不把未知单集时长默认为 24 分钟
          const created = createAnimeEntry(db, {
            canonical_title: title,
            aliases: [...aliasSet],
            release_year: bestYear,
            anime_type: 'TV',
            default_episode_duration_minutes: g.default_episode_duration_minutes
              ? Number(g.default_episode_duration_minutes)
              : null,
            status: defaultStatus,
            episodes: null,
            cover_url: bestCover,
            synopsis: bestSynopsis,
            tags: bestTags,
            source: bestSource,
            external_id: bestExtId ? String(bestExtId) : null
          });
          animeId = created.anime.id;
          createdCount += 1;
        }
      } else {
        updatedCount += 1;
      }

      if (rawCandidate && rawCandidate !== title) {
        addAlias(db, animeId, rawCandidate, { sourceProvider: 'filename' });
      }
      if (g.titleNative && g.titleNative !== title) {
        addAlias(db, animeId, g.titleNative, { sourceProvider: bestSource || 'search' });
      }

      // 若是匹配到已有作品但原本缺少封面/简介/年份/标签，同步用本次联想到的资料补齐
      const curAnime = getAnime(db, animeId);
      if (curAnime) {
        const patch = {};
        if (!curAnime.cover_path && bestCover) patch.cover_path = bestCover;
        if (!curAnime.synopsis && bestSynopsis) patch.synopsis = bestSynopsis;
        if (!curAnime.release_year && bestYear) patch.release_year = bestYear;
        if (Object.keys(patch).length > 0) updateAnime(db, animeId, patch);
        if (bestSource && bestExtId) {
          linkExternal(db, animeId, bestSource, String(bestExtId));
        }
        const curTags = listTagsOfAnime(db, animeId);
        if (curTags.length === 0 && bestTags.length > 0) {
          for (const tName of bestTags) {
            attachTag(db, animeId, getOrCreateTag(db, tName).id);
          }
        }
      }

      if (targetEpCount > 0) {
        ensureEpisodes(db, animeId, targetEpCount, sNum);
      }

      const epView = getEpisodesView(db, animeId);
      const targetSeason =
        epView.seasons.find((s) => Number(s.season_number) === sNum) ?? epView.seasons[0] ?? null;
      const epList = targetSeason?.episodes ?? [];
      const byNum = new Map(
        epList.filter((e) => !e.is_special).map((e) => [Number(e.episode_number), e])
      );

      if (Array.isArray(g.episodes)) {
        for (const epFile of g.episodes) {
          const parsed = parseVideoFilename(epFile.fileName || epFile.name || '');
          const epNum = epFile.episodeNumber ?? parsed.episodeNumber;
          const targetEp = epNum ? byNum.get(Number(epNum)) : null;

          upsertMediaFileRecord(db, {
            animeId,
            episodeId: targetEp ? targetEp.id : null,
            filePath: epFile.fullPath || epFile.relativePath || epFile.fileName,
            fileName: epFile.fileName || parsed.fileName,
            fileSizeBytes: Number(epFile.size) || null,
            resolution: epFile.resolution || parsed.resolution || g.resolution || null,
            subtitleInfo: epFile.subtitleInfo || parsed.subtitleInfo || null,
            versionLabel: epFile.versionLabel || parsed.versionLabel || g.fansub || '本地视频',
            parsedTitle: title,
            parsedSeason: sNum,
            parsedEpisode: epNum,
            isSpecial: Boolean(epFile.isSpecial || parsed.isSpecial),
            availabilityStatus: targetEp ? 'available' : 'needs_review'
          });
          linkedFilesCount += 1;
        }
      }

      if (markWatched && Array.isArray(g.recognizedEpisodes) && g.recognizedEpisodes.length > 0) {
        for (const epNum of g.recognizedEpisodes) {
          const target = byNum.get(Number(epNum));
          if (target && !target.is_watched) {
            markEpisode(db, target.id, true);
            markedEpisodesCount += 1;
          }
        }
      }
    }
  });

  return {
    ok: true,
    createdAnime: createdCount,
    updatedAnime: updatedCount,
    markedEpisodes: markedEpisodesCount,
    linkedFiles: linkedFilesCount
  };
}

/* ---------------- Stage 6: 媒体根目录管理与非破坏性扫描 ---------------- */

export function listMediaRoots(db) {
  const roots = db.prepare('SELECT * FROM library_roots ORDER BY created_at ASC').all();
  return roots.map((r) => {
    const counts = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN availability_status = 'available' THEN 1 ELSE 0 END) AS available,
           SUM(CASE WHEN availability_status = 'missing' THEN 1 ELSE 0 END) AS missing,
           SUM(CASE WHEN availability_status = 'needs_review' THEN 1 ELSE 0 END) AS needs_review,
           SUM(CASE WHEN availability_status = 'unmatched' THEN 1 ELSE 0 END) AS unmatched
         FROM media_files
         WHERE library_root_id = ?`
      )
      .get(r.id);

    return {
      ...r,
      is_enabled: Boolean(r.is_enabled),
      counts: {
        total: Number(counts?.total ?? 0),
        available: Number(counts?.available ?? 0),
        missing: Number(counts?.missing ?? 0),
        needs_review: Number(counts?.needs_review ?? 0),
        unmatched: Number(counts?.unmatched ?? 0)
      }
    };
  });
}

export function addMediaRoot(db, { path: rawPath, displayName = null } = {}) {
  const cleanPath = String(rawPath ?? '').trim();
  if (!cleanPath) throw new ValidationError('媒体根目录路径不能为空', 'path');

  const resolved = path.resolve(cleanPath);
  const name = String(displayName || path.basename(resolved) || resolved).trim().slice(0, 100);
  const ts = new Date().toISOString();

  const existing = db.prepare('SELECT * FROM library_roots WHERE path = ?').get(resolved);
  if (existing) {
    db.prepare('UPDATE library_roots SET display_name = ?, is_enabled = 1, updated_at = ? WHERE id = ?').run(
      name,
      ts,
      existing.id
    );
    return db.prepare('SELECT * FROM library_roots WHERE id = ?').get(existing.id);
  }

  const id = randomUUID();
  db.prepare(
    `INSERT INTO library_roots (id, path, display_name, is_enabled, last_scanned_at, created_at, updated_at)
     VALUES (?, ?, ?, 1, NULL, ?, ?)`
  ).run(id, resolved, name, ts, ts);

  return db.prepare('SELECT * FROM library_roots WHERE id = ?').get(id);
}

export function removeMediaRoot(db, rootId) {
  const existing = db.prepare('SELECT * FROM library_roots WHERE id = ?').get(rootId);
  if (!existing) throw new NotFoundError('媒体根目录不存在');
  db.prepare('DELETE FROM library_roots WHERE id = ?').run(rootId);
  return { ok: true, id: rootId, path: existing.path };
}

/**
 * 扫描单个已登记的媒体根目录（Stage 6 核心验收）：
 * 1. 非破坏性：绝不删除作品、集数或观看记录。
 * 2. 丢失检测：此前在该根目录下登记但磁盘上已不存在的文件，标记 availability_status = 'missing'。
 * 3. 移动/重命名重定位：若发现同根目录下有 missing 记录且文件名+字节大小相同，则原地更新路径并恢复为 available。
 * 4. 唯一高置信度自动关联与跨季保护：
 *    - 仅当唯一命中 1 部作品、集数明确且非 NCOP/PV 特典时才自动关联
 *    - 若文件显式标注了 S02+，但库内目标作品尚未创建对应季度（仅有第 1 季且标题不含该季），则归入 needs_review 防止静默绑错季度
 */
export function scanMediaRoot(db, rootId) {
  const root = db.prepare('SELECT * FROM library_roots WHERE id = ?').get(rootId);
  if (!root) throw new NotFoundError('媒体根目录不存在');

  const rootPath = root.path;
  const rootExists = fs.existsSync(rootPath) && fs.statSync(rootPath).isDirectory();

  const diskFiles = [];
  if (rootExists) {
    const walk = (cur, depth = 0) => {
      if (depth > 5 || diskFiles.length >= 2000) return;
      let entries = [];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(cur, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
        } else if (entry.isFile() && isVideoFile(entry.name)) {
          let size = 0;
          let mtime = null;
          try {
            const st = fs.statSync(fullPath);
            size = st.size;
            mtime = st.mtime.toISOString();
          } catch {
            size = 0;
          }
          const rel = path.relative(rootPath, fullPath);
          const parts = rel.split(/[/\\]+/).filter(Boolean);
          const parentFolder = parts.length >= 2 ? parts[parts.length - 2] : path.basename(rootPath);
          diskFiles.push({
            fullPath: path.resolve(fullPath),
            fileName: entry.name,
            parentFolder,
            size,
            modifiedAt: mtime
          });
        }
      }
    };
    walk(rootPath, 0);
  }

  const evaluateCandidate = loadLibraryMatcher(db);
  const ts = new Date().toISOString();

  let matchedCount = 0;
  let reviewCount = 0;
  let unmatchedCount = 0;
  let missingCount = 0;
  let relocatedCount = 0;

  withTransaction(db, () => {
    const previousFiles = db
      .prepare('SELECT * FROM media_files WHERE library_root_id = ?')
      .all(root.id);
    const seenPaths = new Set(diskFiles.map((f) => f.fullPath));

    const missingPool = [];
    for (const prev of previousFiles) {
      if (!seenPaths.has(prev.path)) {
        db.prepare('UPDATE media_files SET availability_status = ?, updated_at = ? WHERE id = ?').run(
          'missing',
          ts,
          prev.id
        );
        missingPool.push(prev);
      }
    }

    for (const f of diskFiles) {
      // 检查是否为移动位置的旧文件（同名且文件大小相同）
      const movedIdx = missingPool.findIndex(
        (m) => m.file_name === f.fileName && (m.file_size_bytes === f.size || !m.file_size_bytes)
      );
      if (movedIdx !== -1) {
        const movedRecord = missingPool.splice(movedIdx, 1)[0];
        const nextStatus = movedRecord.episode_id
          ? 'available'
          : movedRecord.anime_id
            ? 'needs_review'
            : 'unmatched';
        db.prepare(
          `UPDATE media_files
              SET path = ?, file_size_bytes = ?, modified_at = ?, availability_status = ?, updated_at = ?
            WHERE id = ?`
        ).run(f.fullPath, f.size, f.modifiedAt, nextStatus, ts, movedRecord.id);
        relocatedCount += 1;
        if (nextStatus === 'available') matchedCount += 1;
        else if (nextStatus === 'needs_review') reviewCount += 1;
        else unmatchedCount += 1;
        continue;
      }

      // 若已是人工确认绑定过的现有路径，保持绑定关系并确保状态为 available
      const existingAtPath = previousFiles.find((p) => p.path === f.fullPath);
      if (existingAtPath && existingAtPath.episode_id) {
        db.prepare(
          `UPDATE media_files
              SET file_size_bytes = ?, modified_at = ?, availability_status = 'available', updated_at = ?
            WHERE id = ?`
        ).run(f.size, f.modifiedAt, ts, existingAtPath.id);
        matchedCount += 1;
        continue;
      }

      const parsed = parseVideoFilename(f.fileName, f.parentFolder);
      const evalRes = evaluateCandidate(parsed.titleCandidate, { rawFileName: f.fileName });

      // 跨季保护：若文件明确标有 S02+，检查目标作品是否已开启该季
      let seasonMismatch = false;
      if (
        evalRes.matchType === 'exact_unique' &&
        evalRes.matched &&
        parsed.explicitSeason &&
        parsed.explicitSeason > 1
      ) {
        const existingSeasons = db
          .prepare('SELECT season_number FROM seasons WHERE anime_id = ?')
          .all(evalRes.matched.id)
          .map((s) => Number(s.season_number));
        if (existingSeasons.length > 0 && !existingSeasons.includes(Number(parsed.explicitSeason))) {
          seasonMismatch = true;
        }
      }

      if (
        evalRes.matchType === 'exact_unique' &&
        evalRes.matched &&
        parsed.episodeNumber !== null &&
        !parsed.isExtra &&
        !seasonMismatch
      ) {
        const animeId = evalRes.matched.id;
        const sNum = Number(parsed.seasonNumber) || 1;
        let episodeId = null;

        if (parsed.isSpecial) {
          const epView = getEpisodesView(db, animeId);
          const season = epView.seasons.find((s) => Number(s.season_number) === sNum) ?? epView.seasons[0];
          const spKey = parsed.episodeKey || `SP${parsed.episodeNumber}`;
          const existingSp = season?.episodes?.find((e) => e.is_special && e.episode_key === spKey);
          if (existingSp) {
            episodeId = existingSp.id;
          } else {
            const added = addSpecialEpisode(db, animeId, { seasonNumber: sNum, key: spKey });
            episodeId = added.episode.id;
          }
        } else {
          const curTotal = Number(evalRes.matched.episode_total) || 0;
          const targetMax = Math.max(curTotal, Number(parsed.episodeNumber));
          ensureEpisodes(db, animeId, targetMax, sNum);
          const epView = getEpisodesView(db, animeId);
          const season = epView.seasons.find((s) => Number(s.season_number) === sNum) ?? epView.seasons[0];
          const hitEp = season?.episodes?.find(
            (e) => !e.is_special && Number(e.episode_number) === Number(parsed.episodeNumber)
          );
          if (hitEp) episodeId = hitEp.id;
        }

        upsertMediaFileRecord(db, {
          animeId,
          episodeId,
          libraryRootId: root.id,
          filePath: f.fullPath,
          fileName: f.fileName,
          fileSizeBytes: f.size,
          modifiedAt: f.modifiedAt,
          resolution: parsed.resolution,
          subtitleInfo: parsed.subtitleInfo,
          versionLabel: parsed.versionLabel,
          parsedTitle: parsed.titleCandidate,
          parsedSeason: sNum,
          parsedEpisode: parsed.episodeNumber,
          isSpecial: parsed.isSpecial,
          candidates: [],
          availabilityStatus: episodeId ? 'available' : 'needs_review'
        });

        if (episodeId) matchedCount += 1;
        else reviewCount += 1;
      } else if (
        evalRes.matchType === 'ambiguous' ||
        seasonMismatch ||
        (evalRes.matchType === 'exact_unique' && parsed.episodeNumber === null && !parsed.isExtra)
      ) {
        const cands = evalRes.candidates.map((c) => ({
          id: c.id,
          canonical_title: c.canonical_title
        }));
        upsertMediaFileRecord(db, {
          animeId: evalRes.matched?.id ?? null,
          episodeId: null,
          libraryRootId: root.id,
          filePath: f.fullPath,
          fileName: f.fileName,
          fileSizeBytes: f.size,
          modifiedAt: f.modifiedAt,
          resolution: parsed.resolution,
          subtitleInfo: parsed.subtitleInfo,
          versionLabel: parsed.versionLabel,
          parsedTitle: parsed.titleCandidate,
          parsedSeason: parsed.seasonNumber,
          parsedEpisode: parsed.episodeNumber,
          isSpecial: parsed.isSpecial,
          candidates: cands,
          availabilityStatus: 'needs_review'
        });
        reviewCount += 1;
      } else {
        upsertMediaFileRecord(db, {
          animeId: null,
          episodeId: null,
          libraryRootId: root.id,
          filePath: f.fullPath,
          fileName: f.fileName,
          fileSizeBytes: f.size,
          modifiedAt: f.modifiedAt,
          resolution: parsed.resolution,
          subtitleInfo: parsed.subtitleInfo,
          versionLabel: parsed.versionLabel,
          parsedTitle: parsed.titleCandidate,
          parsedSeason: parsed.seasonNumber,
          parsedEpisode: parsed.episodeNumber,
          isSpecial: parsed.isSpecial,
          candidates: [],
          availabilityStatus: 'unmatched'
        });
        unmatchedCount += 1;
      }
    }

    missingCount = missingPool.length;
    db.prepare('UPDATE library_roots SET last_scanned_at = ?, updated_at = ? WHERE id = ?').run(
      ts,
      ts,
      root.id
    );
  });

  return {
    ok: true,
    rootId: root.id,
    path: rootPath,
    rootExists,
    scannedFiles: diskFiles.length,
    matched: matchedCount,
    needsReview: reviewCount,
    unmatched: unmatchedCount,
    missing: missingCount,
    relocated: relocatedCount,
    // 兼容 snake_case 字段
    scanned_files: diskFiles.length,
    auto_matched: matchedCount,
    needs_review: reviewCount,
    marked_missing: missingCount
  };
}

/**
 * 查询本地媒体文件索引列表（支持按作品、状态或根目录过滤）。
 */
export function listMediaFiles(db, { animeId = '', status = '', rootId = '' } = {}) {
  const clauses = ['1 = 1'];
  const params = [];

  if (animeId) {
    clauses.push('m.anime_id = ?');
    params.push(animeId);
  }
  if (status) {
    clauses.push('m.availability_status = ?');
    params.push(status);
  }
  if (rootId) {
    clauses.push('m.library_root_id = ?');
    params.push(rootId);
  }

  const rows = db
    .prepare(
      `SELECT m.*,
              a.canonical_title AS anime_title,
              e.episode_number,
              e.episode_key,
              s.season_number
         FROM media_files m
         LEFT JOIN anime a ON a.id = m.anime_id
         LEFT JOIN episodes e ON e.id = m.episode_id
         LEFT JOIN seasons s ON s.id = e.season_id
        WHERE ${clauses.join(' AND ')}
        ORDER BY m.updated_at DESC, m.file_name ASC
        LIMIT 500`
    )
    .all(...params);

  return rows.map((r) => {
    let candidates = [];
    if (r.candidate_json) {
      try {
        candidates = JSON.parse(r.candidate_json);
      } catch {
        candidates = [];
      }
    }
    return {
      ...r,
      is_special: Boolean(r.is_special),
      bind_state: r.episode_id ? 'bound' : r.availability_status === 'needs_review' ? 'pending' : 'unmatched',
      candidates
    };
  });
}

/**
 * 人工确认或修改媒体文件与作品/集数的关联绑定（Stage 6 人工确认闭环）。
 * 严格遵守 D-002：新建作品时不默认设置 24 分钟。
 */
export function bindMediaFile(
  db,
  fileId,
  { animeId = null, createTitle = null, seasonNumber = 1, episodeNumber = 1, isSpecial = false } = {}
) {
  const fileRow = db.prepare('SELECT * FROM media_files WHERE id = ?').get(fileId);
  if (!fileRow) throw new NotFoundError('媒体文件记录不存在');

  const sNum = Number(seasonNumber) || 1;
  const epNum = Number(episodeNumber) || 1;
  if (epNum < 1 || epNum > 2000) {
    throw new ValidationError('集号需为 1–2000 之间的整数', 'episodeNumber');
  }

  return withTransaction(db, () => {
    let targetAnimeId = animeId;
    if (!targetAnimeId) {
      const titleToCreate = String(createTitle || fileRow.parsed_title || '').trim();
      if (!titleToCreate || titleToCreate === '未识别标题') {
        throw new ValidationError('请选择要关联的作品或填写新建作品标题', 'animeId');
      }
      const existing = db
        .prepare('SELECT id FROM anime WHERE canonical_title = ? AND deleted_at IS NULL')
        .get(titleToCreate);
      if (existing) {
        targetAnimeId = existing.id;
      } else {
        const created = createAnimeEntry(db, {
          canonical_title: titleToCreate,
          anime_type: 'TV',
          default_episode_duration_minutes: null,
          status: 'watching',
          episodes: epNum
        });
        targetAnimeId = created.anime.id;
      }
    }

    let targetEpisodeId = null;
    if (isSpecial) {
      const spKey = `SP${epNum}`;
      const epView = getEpisodesView(db, targetAnimeId);
      const season = epView.seasons.find((s) => Number(s.season_number) === sNum) ?? epView.seasons[0];
      const existingSp = season?.episodes?.find((e) => e.is_special && e.episode_key === spKey);
      if (existingSp) {
        targetEpisodeId = existingSp.id;
      } else {
        const added = addSpecialEpisode(db, targetAnimeId, { seasonNumber: sNum, key: spKey });
        targetEpisodeId = added.episode.id;
      }
    } else {
      const epViewBefore = getEpisodesView(db, targetAnimeId);
      const seasonBefore = epViewBefore.seasons.find((s) => Number(s.season_number) === sNum);
      const curCount = seasonBefore
        ? seasonBefore.episodes.filter((e) => !e.is_special).length
        : 0;
      ensureEpisodes(db, targetAnimeId, Math.max(curCount, epNum), sNum);

      const epViewAfter = getEpisodesView(db, targetAnimeId);
      const seasonAfter =
        epViewAfter.seasons.find((s) => Number(s.season_number) === sNum) ?? epViewAfter.seasons[0];
      const hit = seasonAfter?.episodes?.find(
        (e) => !e.is_special && Number(e.episode_number) === epNum
      );
      if (hit) targetEpisodeId = hit.id;
    }

    const diskExists = fs.existsSync(fileRow.path);
    const nextStatus = diskExists || !path.isAbsolute(fileRow.path) ? 'available' : 'missing';

    db.prepare(
      `UPDATE media_files
          SET anime_id = ?,
              episode_id = ?,
              parsed_season = ?,
              parsed_episode = ?,
              is_special = ?,
              candidate_json = NULL,
              availability_status = ?,
              updated_at = ?
        WHERE id = ?`
    ).run(
      targetAnimeId,
      targetEpisodeId,
      sNum,
      epNum,
      isSpecial ? 1 : 0,
      nextStatus,
      new Date().toISOString(),
      fileId
    );

    return listMediaFiles(db, {}).find((f) => f.id === fileId);
  });
}

/**
 * 手动重定位已缺失或移动位置的本地媒体文件。
 */
export function relocateMediaFile(db, fileId, newPath) {
  const fileRow = db.prepare('SELECT * FROM media_files WHERE id = ?').get(fileId);
  if (!fileRow) throw new NotFoundError('媒体文件记录不存在');

  const cleanNewPath = String(newPath ?? '').trim();
  if (!cleanNewPath) throw new ValidationError('新文件路径不能为空', 'newPath');
  const resolved = path.resolve(cleanNewPath);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new ValidationError(`指定的新文件路径不存在：${resolved}`, 'newPath');
  }

  const st = fs.statSync(resolved);
  const ts = new Date().toISOString();
  withTransaction(db, () => {
    db.prepare('DELETE FROM media_files WHERE path = ? AND id != ?').run(resolved, fileId);
    db.prepare(
      `UPDATE media_files
          SET path = ?, file_name = ?, file_size_bytes = ?, modified_at = ?, availability_status = 'available', updated_at = ?
        WHERE id = ?`
    ).run(resolved, path.basename(resolved), st.size, st.mtime.toISOString(), ts, fileId);
  });

  return listMediaFiles(db, {}).find((f) => f.id === fileId);
}

/**
 * Stage 7：安全调用系统默认关联播放器打开本地视频文件。
 * 严格约束：
 * 1. 使用参数数组直接调用系统启动器，绝不拼接 shell 命令字符串。
 * 2. 若文件不存在或已丢失，更新状态为 missing 并返回可理解的错误。
 * 3. 打开视频绝不自动标记已看（遵守 ACCEPTANCE.md 3.10 与 6.7）。
 */
export async function openMediaFileWithPlayer(db, fileId, { dryRun = false, spawner = spawn } = {}) {
  const fileRow = db.prepare('SELECT * FROM media_files WHERE id = ?').get(fileId);
  if (!fileRow) throw new NotFoundError('媒体文件记录不存在');

  const targetPath = String(fileRow.path ?? '').trim();
  if (!targetPath || !isVideoFile(fileRow.file_name || targetPath)) {
    throw new ValidationError('该记录不是受支持的本地视频文件', 'path');
  }

  const isServerRootFile = Boolean(fileRow.library_root_id) || path.isAbsolute(targetPath);

  if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
    if (isServerRootFile) {
      db.prepare("UPDATE media_files SET availability_status = 'missing', updated_at = ? WHERE id = ?").run(
        new Date().toISOString(),
        fileId
      );
      const err = new ValidationError(`本地视频文件不存在或已被移走：${fileRow.file_name}`, 'path');
      err.status = 404;
      err.code = 'media_file_missing';
      throw err;
    }
    const err = new Error(
      `该视频为浏览器本地文件（${fileRow.file_name}），未上传至远端服务器，请在当前页面选择本机文件直接播放`
    );
    err.status = 422;
    err.code = 'browser_local_file';
    throw err;
  }

  let command = '';
  let args = [];
  if (process.platform === 'win32') {
    command = 'rundll32.exe';
    args = ['url.dll,FileProtocolHandler', targetPath];
  } else if (process.platform === 'darwin') {
    command = 'open';
    args = [targetPath];
  } else {
    command = 'xdg-open';
    args = [targetPath];
  }

  if (dryRun) {
    return {
      ok: true,
      dryRun: true,
      fileId: fileRow.id,
      fileName: fileRow.file_name,
      path: targetPath,
      launcher: { command, args },
      watchedAutoMarked: false,
      auto_marked_watched: false
    };
  }

  await new Promise((resolve, reject) => {
    try {
      const child = spawner(command, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false
      });
      child.once('error', (spawnErr) => {
        const err = new Error(
          `启动系统默认播放器失败（${spawnErr.code || spawnErr.message}），请检查本机是否安装了视频播放器或复制路径手动打开`
        );
        err.status = 502;
        err.code = 'player_launch_failed';
        reject(err);
      });
      child.once('spawn', () => {
        child.unref?.();
        resolve();
      });
    } catch (spawnErr) {
      const err = new Error(`启动系统默认播放器失败：${spawnErr.message}`);
      err.status = 502;
      err.code = 'player_launch_failed';
      reject(err);
    }
  });

  return {
    ok: true,
    fileId: fileRow.id,
    fileName: fileRow.file_name,
    path: targetPath,
    watchedAutoMarked: false,
    auto_marked_watched: false
  };
}

export const openMediaWithDefaultPlayer = openMediaFileWithPlayer;

/**
 * Stage 12：调用弹弹Play /api/v2/match 对本地视频文件进行指纹与文件名精准匹配（当未填密钥时平滑回退至内置规则+词典）。
 */
export async function matchFilesWithDandanplay(db, cfg, rawFiles = [], { forceLive = false } = {}) {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    throw new ValidationError('请提供要匹配的本地视频文件列表', 'files');
  }

  const dandanplay = await import('../providers/dandanplay.js');
  const configured = dandanplay.hasCredentials(cfg);
  const strategy = cfg?.dandanplayStrategy === 'always' ? 'always' : 'economy';
  const results = [];
  const folderMatchMemo = new Map();

  for (const item of rawFiles.slice(0, 30)) {
    const fileName = String(item?.fileName || item?.name || '').trim();
    if (!fileName) continue;
    const fileHash = String(item?.fileHash || '00000000000000000000000000000000').trim();
    const fileSize = Number(item?.fileSize || item?.size || 0);
    const hasRealHash = fileHash !== '00000000000000000000000000000000' && /^[0-9a-fA-F]{32}$/.test(fileHash);

    const parsed = parseVideoFilename(fileName);
    const curated = lookupCuratedChineseEntry(parsed.titleCandidate);
    const seriesMemoKey = `${normalizeMatchKey(parsed.titleCandidate)}::s${parsed.seasonNumber}`;

    let ddpRes = null;
    let errorMsg = null;
    let skippedByEconomy = false;

    if (configured) {
      if (!hasRealHash && folderMatchMemo.has(seriesMemoKey)) {
        ddpRes = folderMatchMemo.get(seriesMemoKey);
      } else if (strategy === 'economy' && !forceLive && !hasRealHash && curated) {
        skippedByEconomy = true;
      } else if (dandanplay.canConsumeQuota('match', cfg)) {
        try {
          ddpRes = await dandanplay.matchFile(
            { fileName, fileHash, fileSize },
            {
              proxy: '',
              ua: cfg?.userAgent,
              appId: cfg?.dandanplayAppId || '',
              appSecret: cfg?.dandanplayAppSecret || '',
              cfg
            }
          );
          if (!hasRealHash && ddpRes) {
            folderMatchMemo.set(seriesMemoKey, ddpRes);
          }
        } catch (err) {
          errorMsg = err.message;
        }
      } else {
        errorMsg = '今日或本月弹弹Play「文件识别」配额已达安全保护上限，已自动切换至本地规则识别';
      }
    }

    const bestMatch = ddpRes?.matches?.[0] || null;

    results.push({
      fileName,
      configured,
      skippedByEconomy,
      isMatched: Boolean(ddpRes?.isMatched || bestMatch || curated),
      source: bestMatch ? 'dandanplay' : curated ? 'bangumi' : 'parser',
      animeId: bestMatch ? String(bestMatch.animeId) : curated ? String(curated.externalId) : null,
      animeTitle: bestMatch?.animeTitle || curated?.title || parsed.titleCandidate,
      episodeTitle: bestMatch?.episodeTitle || null,
      episodeNumber: parsed.episodeNumber,
      seasonNumber: parsed.seasonNumber,
      matches: ddpRes?.matches ?? [],
      error: errorMsg
    });
  }

  return {
    ok: true,
    configured,
    quota: dandanplay.getQuotaStatus(cfg),
    count: results.length,
    results
  };
}



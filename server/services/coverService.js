import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requestBuffer, resolveProxy } from '../net.js';
import { ValidationError } from '../errors.js';

/**
 * 允许的图床域名白名单（涵盖 Bangumi、弹弹Play、哔哩哔哩、AniList 及常见镜像）。
 * 白名单是安全边界，防止服务端沦为任意内网探测（SSRF）跳板。
 */
const ALLOWED_HOSTS = new Set([
  'lain.bgm.tv',
  'bgm.tv',
  'chii.in',
  'img.dandanplay.net',
  'dandanplay.net',
  'api.dandanplay.net',
  's4.anilist.co',
  'img.anili.st',
  'anilist.co',
  'i0.hdslb.com',
  'i1.hdslb.com',
  'i2.hdslb.com',
  'archive.biliimg.com'
]);

export function normalizeCoverUrl(rawUrl) {
  const s = String(rawUrl ?? '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return `https:${s}`;
  return s;
}

export function isAllowedCoverUrl(rawUrl) {
  try {
    const normalized = normalizeCoverUrl(rawUrl);
    const u = new URL(normalized);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
    const h = u.hostname.toLowerCase();
    if (ALLOWED_HOSTS.has(h)) return true;
    if (
      h.endsWith('.bgm.tv') ||
      h.endsWith('.chii.in') ||
      h.endsWith('.dandanplay.net') ||
      h.endsWith('.dandanplay.com') ||
      h.endsWith('.hdslb.com') ||
      h.endsWith('.biliimg.com') ||
      h.endsWith('.myqcloud.com') ||
      h.endsWith('.alicdn.com')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** 把远程封面地址转换成同源代理地址，前端直接引用即可 */
export function toProxyUrl(coverUrl) {
  const normalized = normalizeCoverUrl(coverUrl);
  if (!normalized) return '';
  return `/api/cover?u=${encodeURIComponent(normalized)}`;
}

/**
 * Bangumi 图床支持 `/r/{宽}/` 前缀做动态缩放（只接受 100 / 200 / 400 / 600 / 800 / 1200 六档）。
 */
export const BGM_WIDTHS = [100, 200, 400, 600, 800, 1200];

export function bgmResize(url, width) {
  const normalized = normalizeCoverUrl(url);
  if (!normalized || !width) return normalized;
  if (!/^https?:\/\/lain\.bgm\.tv\//.test(normalized)) return normalized;

  const want = Number(width);
  const w = BGM_WIDTHS.find((x) => x >= want) ?? BGM_WIDTHS[BGM_WIDTHS.length - 1];

  const stripped = normalized.replace(/^(https?:\/\/lain\.bgm\.tv)\/r\/\d+\//, '$1/');
  return stripped.replace(/^(https?:\/\/lain\.bgm\.tv)\//, `$1/r/${w}/`);
}

function refererForHost(hostname) {
  const h = String(hostname ?? '').toLowerCase();
  if (h.includes('hdslb.com') || h.includes('biliimg.com')) {
    return 'https://www.bilibili.com/';
  }
  if (h.includes('bgm.tv') || h.includes('chii.in')) {
    return 'https://bgm.tv/';
  }
  if (h.includes('dandanplay')) {
    return 'https://www.dandanplay.com/';
  }
  return '';
}

function buildFallbackCandidates(urlStr) {
  const list = [urlStr];
  // 若是 Bangumi 动态缩放地址 /r/400/pic/cover/l/...，当缩略图节点超时或 404 时自动回退到原图与 medium 尺寸
  const stripped = urlStr.replace(/^(https?:\/\/lain\.bgm\.tv)\/r\/\d+\//, '$1/');
  if (stripped !== urlStr && !list.includes(stripped)) {
    list.push(stripped);
  }
  const medium = stripped.replace(/\/pic\/cover\/l\//, '/pic/cover/m/');
  if (medium !== stripped && !list.includes(medium)) {
    list.push(medium);
  }
  return list;
}

/**
 * 取封面。优先用本地缓存；没有就下载并落盘（支持缩放失败自动回退原图与代理切换）。
 */
export async function fetchCover(cfg, rawUrl) {
  const normalized = normalizeCoverUrl(rawUrl);
  if (!normalized) throw new ValidationError('缺少封面地址');

  let u;
  try {
    u = new URL(normalized);
  } catch {
    throw new ValidationError('封面地址不合法');
  }
  if (!isAllowedCoverUrl(normalized)) {
    throw new ValidationError('不允许的封面域名');
  }

  const cacheDir = path.join(cfg.dataDir, 'cache', 'covers');
  fs.mkdirSync(cacheDir, { recursive: true });

  const key = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 20);
  const ext = (path.extname(u.pathname) || '.jpg').toLowerCase();
  const file = path.join(cacheDir, `${key}${ext}`);

  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    if (buf.length > 0) {
      return { buffer: buf, contentType: guessType(ext), fromCache: true };
    }
  }

  const isDomesticCdn =
    u.hostname.includes('dandanplay') ||
    u.hostname.includes('hdslb.com') ||
    u.hostname.includes('biliimg.com');
  const proxy = isDomesticCdn ? '' : await resolveProxy(cfg, 'https://api.bgm.tv/v0/subjects/253');
  const referer = refererForHost(u.hostname);
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
  };
  if (referer) headers.Referer = referer;

  const candidates = buildFallbackCandidates(normalized);
  let lastErr = null;

  for (const candidateUrl of candidates) {
    try {
      const res = await requestBuffer(candidateUrl, {
        proxy,
        headers,
        timeout: 10000
      });
      if (res.status === 200 && res.buffer.length > 0) {
        fs.writeFileSync(file, res.buffer);
        return { buffer: res.buffer, contentType: res.contentType || guessType(ext), fromCache: false };
      }
      // 如果走了代理但返回非 200，尝试直连一次（lain.bgm.tv 在国内大部分网络可直连）
      if (proxy) {
        const directRes = await requestBuffer(candidateUrl, {
          proxy: '',
          headers,
          timeout: 8000
        });
        if (directRes.status === 200 && directRes.buffer.length > 0) {
          fs.writeFileSync(file, directRes.buffer);
          return {
            buffer: directRes.buffer,
            contentType: directRes.contentType || guessType(ext),
            fromCache: false
          };
        }
      }
      lastErr = new Error(`封面下载失败（HTTP ${res.status}）`);
    } catch (err) {
      lastErr = err;
      if (proxy) {
        try {
          const directRes = await requestBuffer(candidateUrl, {
            proxy: '',
            headers,
            timeout: 8000
          });
          if (directRes.status === 200 && directRes.buffer.length > 0) {
            fs.writeFileSync(file, directRes.buffer);
            return {
              buffer: directRes.buffer,
              contentType: directRes.contentType || guessType(ext),
              fromCache: false
            };
          }
        } catch {
          /* ignore direct fallback error */
        }
      }
    }
  }

  throw lastErr || new Error('封面下载失败');
}

function guessType(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

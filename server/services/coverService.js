import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { requestBuffer, resolveProxy } from '../net.js';
import { ValidationError } from '../errors.js';

/**
 * 只允许这些图床域名。
 * 白名单是安全边界：这个接口会按请求里的 URL 主动发请求，
 * 不加限制就成了内网探测工具（SSRF）。
 */
const ALLOWED_HOSTS = new Set(['lain.bgm.tv', 's4.anilist.co', 'img.anili.st', 'anilist.co']);

export function isAllowedCoverUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    return u.protocol === 'https:' && ALLOWED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

/** 把远程封面地址转换成同源代理地址，前端直接引用即可 */
export function toProxyUrl(coverUrl) {
  if (!coverUrl) return '';
  return `/api/cover?u=${encodeURIComponent(coverUrl)}`;
}

/**
 * Bangumi 图床支持 `/r/{宽}/` 前缀做动态缩放，从原图当前缩放。
 *
 * 这比用预生成的尺寸档好得多：实测 `c`(common) 档只有 150×207，
 * 放在 180px 宽的卡片上、再被高分屏放大，必然糊；而 `/r/400/` 是 400×552、49KB，
 * 同一个 URL 换个数字就能拿到合适尺寸，不用维护多份地址。
 *
 * 非 Bangumi 的图（AniList 等）没有这个服务，原样返回。
 */
export function bgmResize(url, width) {
  if (!url || !width) return url;
  if (!/^https?:\/\/lain\.bgm\.tv\//.test(url)) return url;
  // 先剥掉已有的 /r/{n}/ 前缀，避免重复叠加
  const stripped = url.replace(/^(https?:\/\/lain\.bgm\.tv)\/r\/\d+\//, '$1/');
  return stripped.replace(/^(https?:\/\/lain\.bgm\.tv)\//, `$1/r/${width}/`);
}

/**
 * 取封面。优先用本地缓存；没有就下载并落盘。
 * 浏览器直连 Bangumi 图床通常会被拦（跨域 + 需要代理），
 * 因此封面必须经本地服务转发，顺带也解决了离线查看和将来 canvas 合成的问题。
 */
export async function fetchCover(cfg, rawUrl) {
  if (!rawUrl) throw new ValidationError('缺少封面地址');

  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new ValidationError('封面地址不合法');
  }
  if (!isAllowedCoverUrl(rawUrl)) {
    throw new ValidationError('不允许的封面域名');
  }

  const cacheDir = path.join(cfg.dataDir, 'cache', 'covers');
  fs.mkdirSync(cacheDir, { recursive: true });

  const key = crypto.createHash('sha1').update(rawUrl).digest('hex').slice(0, 20);
  const ext = (path.extname(u.pathname) || '.jpg').toLowerCase();
  const file = path.join(cacheDir, `${key}${ext}`);

  if (fs.existsSync(file)) {
    const buf = fs.readFileSync(file);
    return { buffer: buf, contentType: guessType(ext), fromCache: true };
  }

  const proxy = await resolveProxy(cfg, rawUrl);
  const res = await requestBuffer(rawUrl, {
    proxy,
    headers: { 'User-Agent': cfg.userAgent, Referer: 'https://bgm.tv/' }
  });

  if (res.status !== 200 || res.buffer.length === 0) {
    throw new Error(`封面下载失败（HTTP ${res.status}）`);
  }

  fs.writeFileSync(file, res.buffer);
  return { buffer: res.buffer, contentType: res.contentType || guessType(ext), fromCache: false };
}

function guessType(ext) {
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'image/jpeg';
}

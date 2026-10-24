import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WEB_DIR } from './config.js';
import {
  searchLibrary,
  getAnimeDetail,
  createAnimeEntry,
  updateAnimeEntry,
  changeStatus,
  setTags,
  assessArchive,
  archiveAnimeEntry,
  restoreAnimeEntry,
  ANIME_TYPES,
  STATUSES,
  SORT_FIELDS
} from './services/animeService.js';
import { listTags } from './repositories/meta.js';
import { searchAll, probeSources, fetchDetail } from './services/searchService.js';
import { fetchCover } from './services/coverService.js';
import {
  getEpisodesView,
  setEpisodeCount,
  markEpisode,
  advanceProgress,
  setProgress
} from './services/episodeService.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const MAX_BODY = 1024 * 1024;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendError(res, status, code, message, extra = {}) {
  sendJson(res, status, { error: { code, message, ...extra } });
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

/** 静态文件服务。web 目录之外一律拒绝，防止路径穿越。 */
function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(WEB_DIR, rel);
  const root = path.resolve(WEB_DIR) + path.sep;

  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return sendError(res, 404, 'not_found', '页面不存在');
  }
  sendFile(res, target);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const err = new Error('请求体超过 1 MB 限制');
        err.status = 413;
        err.code = 'payload_too_large';
        reject(err);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) return resolve({});
      try {
        const parsed = JSON.parse(text);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          const err = new Error('请求体需为 JSON 对象');
          err.status = 400;
          err.code = 'invalid_json';
          return reject(err);
        }
        resolve(parsed);
      } catch {
        const err = new Error('请求体不是合法 JSON');
        err.status = 400;
        err.code = 'invalid_json';
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function errorToResponse(res, err) {
  if (err?.status) {
    return sendError(res, err.status, err.code ?? 'error', err.message, err.field ? { field: err.field } : {});
  }
  console.error('[http] 未处理异常:', err?.stack ?? err);
  return sendError(res, 500, 'internal_error', '服务内部错误，请查看控制台日志');
}

export function createServer({ db, cfg, schemaVersion, appVersion = '0.1.0' }) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) errorToResponse(res, err);
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const p = url.pathname;
    const method = req.method ?? 'GET';

    const json = (status, data) => sendJson(res, status, data);

    // ---- 基础信息 ----
    if (method === 'GET' && p === '/api/health') {
      const animeCount = Number(db.prepare('SELECT COUNT(*) AS c FROM anime').get()?.c ?? 0);
      return json(200, {
        ok: true,
        app: '次元刻度',
        version: appVersion,
        schemaVersion,
        dataDir: cfg.dataDir,
        counts: { anime: animeCount },
        time: new Date().toISOString()
      });
    }

    // ---- 前端需要的枚举白名单 ----
    if (method === 'GET' && p === '/api/meta') {
      return json(200, { animeTypes: ANIME_TYPES, statuses: STATUSES, sortFields: SORT_FIELDS });
    }

    // ---- 标签列表 ----
    if (method === 'GET' && p === '/api/tags') {
      return json(200, { data: listTags(db) });
    }

    // ---- 外部数据源搜索（双源）----
    if (method === 'GET' && p === '/api/search') {
      const keyword = url.searchParams.get('keyword') ?? '';
      const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 8, 20));
      const result = await searchAll(cfg, keyword, { limit });
      return json(200, result);
    }

    // ---- 数据源可用性 ----
    if (method === 'GET' && p === '/api/source-status') {
      return json(200, await probeSources(cfg));
    }

    // ---- 封面代理（同源、带本地缓存）----
    if (method === 'GET' && p === '/api/cover') {
      const raw = url.searchParams.get('u') ?? '';
      try {
        const { buffer, contentType, fromCache } = await fetchCover(cfg, raw);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': buffer.length,
          'Cache-Control': 'public, max-age=604800',
          'X-Cover-Cache': fromCache ? 'hit' : 'miss'
        });
        res.end(buffer);
        return;
      } catch (err) {
        return sendError(res, err.status ?? 502, err.code ?? 'cover_failed', err.message);
      }
    }

    // ---- 列表 ----
    if (method === 'GET' && p === '/api/anime') {
      const data = searchLibrary(db, {
        keyword: url.searchParams.get('keyword') ?? '',
        status: url.searchParams.get('status') ?? '',
        sortBy: url.searchParams.get('sortBy') ?? 'updated_at',
        order: url.searchParams.get('order') ?? 'desc',
        archived: url.searchParams.get('archived') === '1'
      });
      return json(200, { data });
    }

    // ---- 新建 ----
    if (method === 'POST' && p === '/api/anime') {
      const body = await readJsonBody(req);
      return json(201, createAnimeEntry(db, body));
    }

    // ---- 详情 / 更新 ----
    let m = p.match(/^\/api\/anime\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === 'GET') return json(200, getAnimeDetail(db, id));
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        return json(200, updateAnimeEntry(db, id, body));
      }
      return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
    }

    // ---- 状态 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/status$/);
    if (m) {
      if (method !== 'POST') return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, { state: changeStatus(db, id, body) });
    }

    // ---- 标签 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/tags$/);
    if (m) {
      if (method !== 'PUT') return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, { tags: setTags(db, id, body.tags ?? []) });
    }

    // ---- 季集列表 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/episodes$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === 'GET') return json(200, getEpisodesView(db, id));
      if (method === 'PUT') {
        const body = await readJsonBody(req);
        return json(200, setEpisodeCount(db, id, body.count));
      }
      return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
    }

    // ---- 进度推进（+1 / -1 / 看到第 N 集）----
    m = p.match(/^\/api\/anime\/([^/]+)\/progress$/);
    if (m) {
      if (method !== 'POST') return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      const action = String(body.action ?? '').trim();

      if (action === 'next') return json(200, advanceProgress(db, id, 1));
      if (action === 'prev') return json(200, advanceProgress(db, id, -1));
      if (action === 'set') return json(200, setProgress(db, id, body.episode_number));
      return sendError(res, 400, 'invalid_action', 'action 需为 next / prev / set');
    }

    // ---- 单集标记 ----
    m = p.match(/^\/api\/episodes\/([^/]+)\/watch$/);
    if (m) {
      if (method !== 'POST') return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, markEpisode(db, id, body.watched !== false, body.date ?? null));
    }

    // ---- 归档影响评估 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/archive-check$/);    if (m) {
      if (method !== 'GET') return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
      return json(200, assessArchive(db, decodeURIComponent(m[1])));
    }

    // ---- 归档 / 恢复 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/(archive|restore)$/);
    if (m) {
      if (method !== 'POST') return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      return json(200, m[2] === 'archive' ? archiveAnimeEntry(db, id) : restoreAnimeEntry(db, id));
    }

    // ---- 单个外部条目详情（用户选中后补全标签与集数）----
    m = p.match(/^\/api\/external\/(bangumi|anilist)\/([^/]+)$/);
    if (m) {
      if (method !== 'GET') return sendError(res, 405, 'method_not_allowed', `不支持 ${method}`);
      const info = await fetchDetail(cfg, m[1], decodeURIComponent(m[2]));
      return json(200, info);
    }

    // ---- 已知接口的路径判断 ----
    // ---- 未知接口 ----
    if (p.startsWith('/api/')) {
      // 路径存在但方法不对 → 405；路径也不存在 → 404
      const knownPath =
        /^\/api\/(health|meta|tags|anime|search|source-status|cover)$/.test(p) ||
        /^\/api\/anime\/[^/]+$/.test(p) ||
        /^\/api\/anime\/[^/]+\/(status|tags|archive-check|archive|restore|episodes|progress)$/.test(p) ||
        /^\/api\/episodes\/[^/]+\/watch$/.test(p) ||
        /^\/api\/external\/[^/]+\/[^/]+$/.test(p);

      if (knownPath) {
        return sendError(res, 405, 'method_not_allowed', `该接口不支持 ${method}`);
      }
      return sendError(res, 404, 'no_such_endpoint', `接口不存在：${p}`);
    }

    // ---- 静态资源 ----
    if (method !== 'GET') {
      return sendError(res, 405, 'method_not_allowed', '该路径只支持 GET');
    }
    return serveStatic(res, p);
  }

  return server;
}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { WEB_DIR, saveConfig, DEFAULT_DISCOVERY_TEMPLATES } from './config.js';
import { clearProxyCache } from './net.js';
import { configure as configureBangumi } from './providers/bangumi.js';
import {
  getQuotaStatus,
  updateQuotaReadings,
  normalizeSafetyRatio
} from './providers/dandanplay.js';
import {
  searchLibrary,
  getAnimeDetail,
  createAnimeEntry,
  batchCreateAnimeEntries,
  batchUpdateAnimeEntries,
  updateAnimeEntry,
  changeStatus,
  setTags,
  setAliases,
  setFieldLocks,
  assessArchive,
  archiveAnimeEntry,
  restoreAnimeEntry,
  deleteAnimeEntry,
  exportLibraryData,
  importLibraryData,
  ANIME_TYPES,
  STATUSES,
  SORT_FIELDS,
  PROVIDERS
} from './services/animeService.js';
import { listTags } from './repositories/meta.js';
import { searchAll, probeSources, fetchDetail, clearSearchCache, ACTIVE_SOURCES } from './services/searchService.js';
import { getSeasonalLineup, getWeeklyCalendar, clearSeasonalCache } from './services/seasonalService.js';
import {
  matchMediaFiles,
  matchFilesWithDandanplay,
  scanServerDirectory,
  applyMediaGroups,
  listMediaRoots,
  addMediaRoot,
  removeMediaRoot,
  scanMediaRoot,
  listMediaFiles,
  bindMediaFile,
  openMediaFileWithPlayer
} from './services/mediaParser.js';
import {
  listBackups,
  createDatabaseBackup,
  restoreDatabaseBackup
} from './services/backupService.js';
import { fetchCover } from './services/coverService.js';
import {
  getEpisodesView,
  setEpisodeCount,
  deleteSeason,
  addSpecialEpisode,
  updateEpisodeMeta,
  markEpisode,
  setWatchedDate,
  advanceProgress,
  setProgress,
  markRange,
  syncEpisodeTitles
} from './services/episodeService.js';
import { enrichAnime, applyCandidate } from './services/enrichService.js';
import { listCachedResources, fetchAnimeResources } from './services/resourceService.js';
import { getStats } from './services/statsService.js';

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

const MAX_BODY = 5 * 1024 * 1024;

/**
 * CORS 只在显式配置了 corsOrigin 时才发。
 *
 * 前端是同源加载的（服务自己吐 index.html），压根不需要 CORS 头。
 * 默认发 `*` 等于允许你本机任何一个网页跨域调用这个服务，
 * 包括 POST /api/shutdown 和读 /api/health。默认不发才是安全的。
 */
function corsHeaders(cfg) {
  const origin = cfg?.corsOrigin;
  if (!origin) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Access-Token'
  };
}

function sendJson(res, status, data, cfg) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...corsHeaders(cfg),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function sendError(res, status, code, message, extra = {}, cfg) {
  sendJson(res, status, { error: { code, message, ...extra } }, cfg);
}

function sendFile(res, filePath, cfg) {
  const ext = path.extname(filePath).toLowerCase();
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    ...corsHeaders(cfg),
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-cache'
  });
  res.end(body);
}

/** 静态文件服务。web 目录之外一律拒绝，防止路径穿越。 */
function serveStatic(res, pathname, cfg) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(WEB_DIR, rel);
  const root = path.resolve(WEB_DIR) + path.sep;

  if (!target.startsWith(root) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    return sendError(res, 404, 'not_found', '页面不存在', {}, cfg);
  }
  sendFile(res, target, cfg);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        const err = new Error('请求体超过大小限制');
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

function errorToResponse(res, err, cfg) {
  if (err?.status) {
    return sendError(res, err.status, err.code ?? 'error', err.message, err.field ? { field: err.field } : {}, cfg);
  }
  console.error('[http] 未处理异常:', err?.stack ?? err);
  return sendError(res, 500, 'internal_error', '服务内部错误，请查看控制台日志', {}, cfg);
}

export function createServer({ db, cfg = {}, schemaVersion, appVersion = '0.3.0' }) {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) errorToResponse(res, err, cfg);
    });
  });

  async function handle(req, res) {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const p = url.pathname;
    const method = req.method ?? 'GET';

    if (method === 'OPTIONS') {
      res.writeHead(204, corsHeaders(cfg));
      res.end();
      return;
    }

    const json = (status, data) => sendJson(res, status, data, cfg);
    const errOut = (status, code, msg, extra) => sendError(res, status, code, msg, extra, cfg);

    // ---- 基础信息（探活用）----
    // 不在这里返回数据目录和作品数：这个接口在鉴权之前，任何本机网页都能读到
    if (method === 'GET' && p === '/api/health') {
      return json(200, {
        ok: true,
        app: '次元刻度',
        version: appVersion,
        schemaVersion,
        authRequired: Boolean(cfg.accessToken && String(cfg.accessToken).trim()),
        time: new Date().toISOString()
      });
    }

    // ---- Stage 14: 可选云端访问口令守卫 (ACCESS_TOKEN) ----
    if (p.startsWith('/api/') && p !== '/api/cover' && cfg.accessToken && String(cfg.accessToken).trim()) {
      const expected = String(cfg.accessToken).trim();
      const headerToken = String(req.headers['x-access-token'] || '').trim();
      const authHeader = String(req.headers['authorization'] || '').trim();
      const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
        ? authHeader.slice(7).trim()
        : '';
      const queryToken = String(url.searchParams.get('token') || '').trim();
      const provided = headerToken || bearerToken || queryToken;
      if (provided !== expected) {
        return errOut(
          401,
          'unauthorized',
          '此云服务器已启用访问口令保护，请在「设置 → 云端服务器接口配置」中填入正确的访问口令 (Access Token)'
        );
      }
    }

    // ---- 退出后台服务（供无黑框静默模式使用）----
    // 必须放在鉴权之后：这是有副作用、能直接停掉整个服务的接口。
    // 之前它在口令检查之前，任何本机网页都能 POST 一下把服务关掉。
    if (method === 'POST' && p === '/api/shutdown') {
      json(200, { ok: true, message: '次元刻度后台服务已安全关闭' });
      setTimeout(() => {
        server.close(() => {
          try {
            db.close();
          } catch {}
          process.exit(0);
        });
        setTimeout(() => process.exit(0), 500).unref();
      }, 150);
      return;
    }

    // ---- 前端需要的枚举白名单 ----
    if (method === 'GET' && p === '/api/meta') {
      return json(200, {
        animeTypes: ANIME_TYPES,
        statuses: STATUSES,
        sortFields: SORT_FIELDS,
        providers: PROVIDERS
      });
    }

    // ---- 运行时数据源、资源发现模板、弹弹Play配额策略与网络设置 ----
    if (p === '/api/config') {
      if (method === 'GET') {
        const cleanSources = Array.isArray(cfg.enabledSources)
          ? cfg.enabledSources.filter((s) => ACTIVE_SOURCES.includes(s))
          : [];
        return json(200, {
          enabledSources: cleanSources.length > 0 ? cleanSources : ACTIVE_SOURCES,
          bangumiApiBase: cfg.bangumiApiBase || 'https://api.bgm.tv',
          dandanplayAppId: cfg.dandanplayAppId || '',
          dandanplayConfigured: Boolean(cfg.dandanplayAppId && cfg.dandanplayAppSecret),
          dandanplayStrategy: cfg.dandanplayStrategy === 'always' ? 'always' : 'economy',
          dandanplaySafetyRatio: normalizeSafetyRatio(cfg.dandanplaySafetyRatio ?? 0.9),
          dandanplayQuota: getQuotaStatus(cfg),
          discoveryTemplates: Array.isArray(cfg.discoveryTemplates) && cfg.discoveryTemplates.length
            ? cfg.discoveryTemplates
            : DEFAULT_DISCOVERY_TEMPLATES,
          proxy: cfg.proxy || '',
          proxyProbe: Array.isArray(cfg.proxyProbe) ? cfg.proxyProbe : [],
          dataDir: cfg.dataDir
        });
      }
      if (method === 'PUT') {
        const body = await readJsonBody(req);
        if (Array.isArray(body.enabledSources)) {
          const valid = body.enabledSources.filter((s) => ACTIVE_SOURCES.includes(s));
          if (valid.length === 0) {
            return errOut(400, 'validation_error', '请至少启用一个数据源');
          }
          cfg.enabledSources = valid;
        }
        if (typeof body.bangumiApiBase === 'string') {
          const base = body.bangumiApiBase.trim() || 'https://api.bgm.tv';
          try {
            const u = new URL(base);
            if (u.protocol !== 'https:' && u.protocol !== 'http:') {
              return errOut(400, 'validation_error', 'Bangumi 接口地址需为 http(s) URL');
            }
          } catch {
            return errOut(400, 'validation_error', 'Bangumi 接口地址不是合法 URL');
          }
          cfg.bangumiApiBase = base.replace(/\/+$/, '');
          configureBangumi({ apiBase: cfg.bangumiApiBase });
        }
        if (typeof body.dandanplayAppId === 'string') {
          cfg.dandanplayAppId = body.dandanplayAppId.trim();
        }
        if (typeof body.dandanplayAppSecret === 'string' && body.dandanplayAppSecret !== '********') {
          cfg.dandanplayAppSecret = body.dandanplayAppSecret.trim();
        }
        if (typeof body.dandanplayStrategy === 'string') {
          cfg.dandanplayStrategy = body.dandanplayStrategy === 'always' ? 'always' : 'economy';
        }
        if (body.dandanplaySafetyRatio !== undefined) {
          cfg.dandanplaySafetyRatio = normalizeSafetyRatio(body.dandanplaySafetyRatio);
        }
        if (Array.isArray(body.discoveryTemplates)) {
          const cleanTpls = [];
          for (const item of body.discoveryTemplates) {
            const name = String(item?.name ?? '').trim();
            const tplUrl = String(item?.url ?? '').trim();
            if (!name || !tplUrl) continue;
            if (!/^https?:\/\//i.test(tplUrl) || !tplUrl.includes('{keyword}')) {
              return errOut(
                400,
                'validation_error',
                `资源模板「${name}」URL 需以 http(s):// 开头且包含 {keyword} 占位符`
              );
            }
            cleanTpls.push({
              id: String(item?.id || name).trim(),
              name: name.slice(0, 30),
              url: tplUrl.slice(0, 300),
              enabled: item?.enabled !== false
            });
          }
          if (cleanTpls.length > 0) {
            cfg.discoveryTemplates = cleanTpls;
          }
        }
        if (typeof body.proxy === 'string') {
          cfg.proxy = body.proxy.trim();
        }
        if (Array.isArray(body.proxyProbe)) {
          cfg.proxyProbe = body.proxyProbe.map((s) => String(s).trim()).filter(Boolean);
        }

        clearProxyCache();
        clearSearchCache();
        clearSeasonalCache();
        try {
          saveConfig(cfg);
        } catch {
          /* 测试或只读环境允许仅内存更新 */
        }
        return json(200, {
          ok: true,
          enabledSources: cfg.enabledSources,
          bangumiApiBase: cfg.bangumiApiBase,
          dandanplayAppId: cfg.dandanplayAppId,
          dandanplayConfigured: Boolean(cfg.dandanplayAppId && cfg.dandanplayAppSecret),
          dandanplayStrategy: cfg.dandanplayStrategy === 'always' ? 'always' : 'economy',
          dandanplaySafetyRatio: normalizeSafetyRatio(cfg.dandanplaySafetyRatio ?? 0.9),
          dandanplayQuota: getQuotaStatus(cfg),
          discoveryTemplates: cfg.discoveryTemplates || DEFAULT_DISCOVERY_TEMPLATES,
          proxy: cfg.proxy,
          proxyProbe: cfg.proxyProbe
        });
      }
      return errOut(405, 'method_not_allowed', `不支持 ${method}`);
    }

    // ---- 弹弹Play 功能组配额查询与校准 ----
    if (p === '/api/dandanplay/quota') {
      if (method === 'GET') {
        return json(200, getQuotaStatus(cfg));
      }
      if (method === 'PUT') {
        const body = await readJsonBody(req);
        return json(200, updateQuotaReadings(cfg, body));
      }
      return errOut(405, 'method_not_allowed', `不支持 ${method}`);
    }

    // ---- 账本导出、导入与 Stage 14 云端一键双向同步 ----
    if (method === 'GET' && p === '/api/export') {
      return json(200, exportLibraryData(db));
    }

    if (method === 'POST' && p === '/api/import') {
      const body = await readJsonBody(req);
      return json(200, importLibraryData(db, body));
    }

    if (p === '/api/sync') {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const body = await readJsonBody(req);
      let syncResult = { ok: true, strategy: 'sync', imported: 0, merged: 0, skipped: 0, conflicts: [] };
      if (Array.isArray(body.items) && body.items.length > 0) {
        syncResult = importLibraryData(db, { ...body, conflictStrategy: 'sync' });
      }
      const snapshot = exportLibraryData(db);
      return json(200, {
        ok: true,
        sync: syncResult,
        snapshot
      });
    }

    // ---- Stage 9: SQLite 数据库物理备份、校验与恢复 ----
    if (p === '/api/backups') {
      if (method === 'GET') return json(200, listBackups(db, cfg));
      if (method === 'POST') {
        const body = await readJsonBody(req);
        return json(201, createDatabaseBackup(db, cfg, body));
      }
      return errOut(405, 'method_not_allowed', `不支持 ${method}`);
    }

    if (p === '/api/backups/restore') {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const body = await readJsonBody(req);
      return json(200, restoreDatabaseBackup(db, cfg, body));
    }

    // ---- 季度新番导览（B-003 多源全量获取 + 按评分排序 + 翻页与筛选） ----
    if (method === 'GET' && p === '/api/seasonal') {
      const year = url.searchParams.get('year');
      const season = url.searchParams.get('season');
      const source = url.searchParams.get('source') || 'all';
      const page = url.searchParams.get('page');
      const pageSize = url.searchParams.get('pageSize');
      const limit = url.searchParams.get('limit');
      const keyword = url.searchParams.get('keyword') || '';
      const filter = url.searchParams.get('filter') || 'all';
      const sort = url.searchParams.get('sort') || 'default';
      const includeUnreleased = url.searchParams.get('includeUnreleased') === '1';
      const refresh = url.searchParams.get('refresh') === '1';
      return json(
        200,
        await getSeasonalLineup(db, cfg, { year, season, source, page, pageSize, limit, keyword, filter, sort, includeUnreleased, refresh })
      );
    }

    // ---- Stage 11/12: 每日放送周历表（Bangumi /calendar + 弹弹Play /shin + 账本状态映射） ----
    if (method === 'GET' && p === '/api/calendar') {
      const refresh = url.searchParams.get('refresh') === '1';
      return json(200, await getWeeklyCalendar(db, cfg, { refresh }));
    }

    // ---- 本地媒体文件名识别与同步（Stage 6-7 & Stage 12 弹弹Play指纹匹配） ----
    if (method === 'POST' && p === '/api/media/parse-filenames') {
      const body = await readJsonBody(req);
      return json(200, matchMediaFiles(db, body.files ?? []));
    }

    if (method === 'POST' && p === '/api/media/dandan-match') {
      const body = await readJsonBody(req);
      return json(
        200,
        await matchFilesWithDandanplay(db, cfg, body.files ?? [], { forceLive: Boolean(body.forceLive) })
      );
    }

    if (method === 'POST' && p === '/api/media/scan-server-dir') {
      const body = await readJsonBody(req);
      return json(200, scanServerDirectory(db, body.dirPath));
    }

    if (method === 'POST' && p === '/api/media/apply') {
      const body = await readJsonBody(req);
      return json(200, applyMediaGroups(db, body));
    }

    // ---- Stage 6: 媒体根目录管理与非破坏性扫描 ----
    if (p === '/api/media/roots') {
      if (method === 'GET') return json(200, { data: listMediaRoots(db) });
      if (method === 'POST') {
        const body = await readJsonBody(req);
        return json(201, addMediaRoot(db, body));
      }
      return errOut(405, 'method_not_allowed', `不支持 ${method}`);
    }

    let m = p.match(/^\/api\/media\/roots\/([^/]+)$/);
    if (m) {
      if (method !== 'DELETE') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      return json(200, removeMediaRoot(db, decodeURIComponent(m[1])));
    }

    m = p.match(/^\/api\/media\/roots\/([^/]+)\/scan$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      return json(200, scanMediaRoot(db, decodeURIComponent(m[1])));
    }

    // ---- Stage 6-7: 持久媒体文件列表、人工确认绑定与安全调用系统默认播放器 ----
    if (p === '/api/media/files') {
      if (method !== 'GET') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      return json(200, {
        data: listMediaFiles(db, {
          animeId: url.searchParams.get('animeId') ?? '',
          status: url.searchParams.get('status') ?? '',
          rootId: url.searchParams.get('rootId') ?? ''
        })
      });
    }

    m = p.match(/^\/api\/media\/files\/([^/]+)\/bind$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const body = await readJsonBody(req);
      return json(200, { file: bindMediaFile(db, decodeURIComponent(m[1]), body) });
    }

    m = p.match(/^\/api\/media\/files\/([^/]+)\/open$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const body = await readJsonBody(req);
      return json(200, await openMediaFileWithPlayer(db, decodeURIComponent(m[1]), { dryRun: Boolean(body.dryRun) }));
    }

    // ---- 标签列表 ----
    if (method === 'GET' && p === '/api/tags') {
      return json(200, { data: listTags(db) });
    }

    // ---- 外部数据源搜索（多源）----
    if (method === 'GET' && p === '/api/search') {
      const keyword = url.searchParams.get('keyword') ?? '';
      const limit = Math.max(1, Math.min(Number(url.searchParams.get('limit')) || 8, 20));
      const result = await searchAll(cfg, keyword, { limit });
      return json(200, result);
    }

    // ---- 数据源可用性 ----
    if (method === 'GET' && p === '/api/source-status') {
      const liveDandan = url.searchParams.get('liveDandan') === '1';
      return json(200, await probeSources(cfg, { liveDandan }));
    }

    // ---- 封面代理（同源、带本地缓存）----
    if (method === 'GET' && p === '/api/cover') {
      const raw = url.searchParams.get('u') ?? '';
      try {
        const { buffer, contentType, fromCache } = await fetchCover(cfg, raw);
        res.writeHead(200, {
          ...corsHeaders(cfg),
          'Content-Type': contentType,
          'Content-Length': buffer.length,
          'Cache-Control': 'public, max-age=604800',
          'X-Cover-Cache': fromCache ? 'hit' : 'miss'
        });
        res.end(buffer);
        return;
      } catch (err) {
        return errOut(err.status ?? 502, err.code ?? 'cover_failed', err.message);
      }
    }

    // ---- 观看统计 ----
    if (method === 'GET' && p === '/api/stats') {
      const raw = url.searchParams.get('year');
      return json(200, getStats(db, { year: raw ? raw : undefined }));
    }

    // ---- 列表 ----
    if (method === 'GET' && p === '/api/anime') {
      const data = searchLibrary(db, {
        keyword: url.searchParams.get('keyword') ?? '',
        status: url.searchParams.get('status') ?? '',
        tag: url.searchParams.get('tag') ?? '',
        sortBy: url.searchParams.get('sortBy') ?? 'updated_at',
        order: url.searchParams.get('order') ?? 'desc',
        archived: url.searchParams.get('archived') === '1',
        favorite: url.searchParams.get('favorite') === '1'
      });
      return json(200, { data });
    }

    // ---- 新建（单条） ----
    if (method === 'POST' && p === '/api/anime') {
      const body = await readJsonBody(req);
      return json(201, createAnimeEntry(db, body));
    }

    // ---- 批量新建（B-003 季度新番多选入库） ----
    if (method === 'POST' && p === '/api/anime/batch') {
      const body = await readJsonBody(req);
      return json(201, batchCreateAnimeEntries(db, body));
    }

    // ---- Stage 12: 账本批量操作（批量改状态 / 批量加标签 / 批量归档） ----
    if (method === 'POST' && p === '/api/anime/batch-action') {
      const body = await readJsonBody(req);
      return json(200, batchUpdateAnimeEntries(db, body));
    }

    // ---- 详情 / 更新 ----
    m = p.match(/^\/api\/anime\/([^/]+)$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === 'GET') return json(200, getAnimeDetail(db, id));
      if (method === 'PATCH') {
        const body = await readJsonBody(req);
        return json(200, updateAnimeEntry(db, id, body));
      }
      if (method === 'DELETE') return json(200, deleteAnimeEntry(db, id));
      return errOut(405, 'method_not_allowed', `不支持 ${method}`);
    }

    // ---- 状态 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/status$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, { state: changeStatus(db, id, body) });
    }

    // ---- 标签 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/tags$/);
    if (m) {
      if (method !== 'PUT') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, { tags: setTags(db, id, body.tags ?? []) });
    }

    // ---- 作品别名 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/aliases$/);
    if (m) {
      if (method !== 'PUT') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, { aliases: setAliases(db, id, body.aliases ?? []) });
    }

    // ---- P2: 手工字段锁定保护 (anime_metadata_fields) ----
    m = p.match(/^\/api\/anime\/([^/]+)\/locks$/);
    if (m) {
      if (method !== 'PUT') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, setFieldLocks(db, id, body.locked_fields ?? []));
    }

    // ---- P2: 站内 RSS 资源列表查询与拉取缓存 (resource_items) ----
    m = p.match(/^\/api\/anime\/([^/]+)\/resources$/);
    if (m) {
      if (method !== 'GET') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      return json(200, listCachedResources(db, id));
    }

    m = p.match(/^\/api\/anime\/([^/]+)\/resources\/fetch$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, await fetchAnimeResources(db, cfg, id, body));
    }

    // ---- 季集列表与多季集数设定 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/episodes$/);
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (method === 'GET') return json(200, getEpisodesView(db, id));
      if (method === 'PUT') {
        const body = await readJsonBody(req);
        return json(200, setEpisodeCount(db, id, body.count, body.season_number ?? 1));
      }
      return errOut(405, 'method_not_allowed', `不支持 ${method}`);
    }

    // ---- P2: 一键同步分集标题 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/episodes\/sync-titles$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, await syncEpisodeTitles(db, cfg, id, body));
    }

    // ---- 删除指定季度 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/seasons\/(\d+)$/);
    if (m) {
      if (method !== 'DELETE') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const sNum = Number(m[2]);
      return json(200, deleteSeason(db, id, sNum));
    }

    // ---- 新增 SP / OVA 特别篇 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/specials$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(201, addSpecialEpisode(db, id, body));
    }

    // ---- 进度推进（+1 / -1 / 看到第 N 集）----
    m = p.match(/^\/api\/anime\/([^/]+)\/progress$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      const action = String(body.action ?? '').trim();

      if (action === 'next') return json(200, advanceProgress(db, id, 1));
      if (action === 'prev') return json(200, advanceProgress(db, id, -1));
      if (action === 'set') return json(200, setProgress(db, id, body.episode_number));
      if (action === 'range') return json(200, markRange(db, id, body.from, body.to, body.date ?? null));
      return errOut(400, 'invalid_action', 'action 需为 next / prev / set / range');
    }

    // ---- 单集标记 ----
    m = p.match(/^\/api\/episodes\/([^/]+)\/watch$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, markEpisode(db, id, body.watched !== false, body.date ?? null));
    }

    // ---- 单集元数据（标题、单集时长）编辑 ----
    m = p.match(/^\/api\/episodes\/([^/]+)\/meta$/);
    if (m) {
      if (method !== 'PUT') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      return json(200, updateEpisodeMeta(db, id, body));
    }

    // ---- 改某集的观看日期 ----
    m = p.match(/^\/api\/episodes\/([^/]+)\/watched-at$/);
    if (m) {
      if (method !== 'PUT') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      if (!('date' in body)) {
        return errOut(400, 'validation_error', '缺少 date 字段（传 null 表示日期不详）', { field: 'date' });
      }
      return json(200, setWatchedDate(db, id, body.date));
    }

    // ---- 补全元数据（封面、集数、简介、标签）----
    m = p.match(/^\/api\/anime\/([^/]+)\/enrich$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      const body = await readJsonBody(req);
      if (body.source) {
        return json(200, await applyCandidate(db, cfg, id, body));
      }
      return json(200, await enrichAnime(db, cfg, id));
    }

    // ---- 归档影响评估 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/archive-check$/);
    if (m) {
      if (method !== 'GET') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      return json(200, assessArchive(db, decodeURIComponent(m[1])));
    }

    // ---- 归档 / 恢复 ----
    m = p.match(/^\/api\/anime\/([^/]+)\/(archive|restore)$/);
    if (m) {
      if (method !== 'POST') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const id = decodeURIComponent(m[1]);
      return json(200, m[2] === 'archive' ? archiveAnimeEntry(db, id) : restoreAnimeEntry(db, id));
    }

    // ---- 单个外部条目详情（支持 bilibili / bangumi / anilist / dandanplay）----
    m = p.match(/^\/api\/external\/(bilibili|bangumi|anilist|dandanplay)\/([^/]+)$/);
    if (m) {
      if (method !== 'GET') return errOut(405, 'method_not_allowed', `不支持 ${method}`);
      const info = await fetchDetail(cfg, m[1], decodeURIComponent(m[2]));
      return json(200, info);
    }

    // ---- 未知接口 ----
    if (p.startsWith('/api/')) {
      const knownPath =
        /^\/api\/(health|meta|tags|anime|search|source-status|cover|stats|config|export|import|sync|seasonal|calendar|backups)$/.test(p) ||
        p === '/api/dandanplay/quota' ||
        p === '/api/anime/batch' ||
        p === '/api/anime/batch-action' ||
        p === '/api/backups/restore' ||
        p === '/api/media/roots' ||
        p === '/api/media/files' ||
        /^\/api\/media\/(parse-filenames|dandan-match|scan-server-dir|apply)$/.test(p) ||
        /^\/api\/media\/roots\/[^/]+(\/scan)?$/.test(p) ||
        /^\/api\/media\/files\/[^/]+\/(bind|open)$/.test(p) ||
        /^\/api\/anime\/[^/]+$/.test(p) ||
        /^\/api\/anime\/[^/]+\/(status|tags|aliases|locks|resources|archive-check|archive|restore|episodes|specials|progress|enrich)$/.test(p) ||
        /^\/api\/anime\/[^/]+\/resources\/fetch$/.test(p) ||
        /^\/api\/anime\/[^/]+\/episodes\/sync-titles$/.test(p) ||
        /^\/api\/anime\/[^/]+\/seasons\/\d+$/.test(p) ||
        /^\/api\/episodes\/[^/]+\/(watch|watched-at|meta)$/.test(p) ||
        /^\/api\/external\/[^/]+\/[^/]+$/.test(p);

      if (knownPath) {
        return errOut(405, 'method_not_allowed', `该接口不支持 ${method}`);
      }
      return errOut(404, 'no_such_endpoint', `接口不存在：${p}`);
    }

    // ---- 静态资源 ----
    if (method !== 'GET') {
      return errOut(405, 'method_not_allowed', '该路径只支持 GET');
    }
    return serveStatic(res, p, cfg);
  }

  return server;
}

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

export const DEFAULT_UA = 'fan-zhang/0.1 (personal anime ledger)';

/**
 * 走 HTTP 代理访问 HTTPS 的 Agent。
 * Node 的 fetch 不读取 HTTP_PROXY 环境变量，必须自己实现 CONNECT 隧道，
 * 否则在需要代理的网络里所有对外请求都会以「fetch failed」告终，且看不出是代理问题。
 */
class HttpsProxyAgent extends https.Agent {
  constructor(proxyUrl) {
    super({ keepAlive: false, maxSockets: 4 });
    this.proxy = new URL(proxyUrl);
  }

  createConnection(options, callback) {
    const proxy = this.proxy;
    const targetHost = options.host || options.servername;
    const targetPort = Number(options.port) || 443;

    const raw = net.connect({
      host: proxy.hostname,
      port: Number(proxy.port) || 8080
    });

    let settled = false;
    const finish = (err, socket) => {
      if (settled) return;
      settled = true;
      callback(err, socket);
    };

    raw.setTimeout(12000, () => {
      raw.destroy();
      finish(new Error('代理连接超时'));
    });
    raw.once('error', (e) => finish(new Error(`代理连接失败：${e.message}`)));

    raw.once('connect', () => {
      const auth = proxy.username
        ? 'Proxy-Authorization: Basic ' +
          Buffer.from(
            `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password || '')}`
          ).toString('base64') +
          '\r\n'
        : '';
      raw.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          auth +
          'Proxy-Connection: keep-alive\r\n\r\n'
      );
    });

    let buf = Buffer.alloc(0);
    const onData = (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      const idx = buf.indexOf('\r\n\r\n');
      if (idx < 0) return;

      raw.removeListener('data', onData);
      const head = buf.subarray(0, idx).toString('latin1');
      const statusLine = head.split('\r\n')[0] || '';

      if (!/^HTTP\/1\.[01] 200/.test(statusLine)) {
        raw.destroy();
        return finish(new Error(`代理拒绝 CONNECT：${statusLine}`));
      }

      const rest = buf.subarray(idx + 4);
      if (rest.length) raw.unshift(rest);

      const secured = tls.connect({ socket: raw, servername: targetHost }, () => finish(null, secured));
      secured.once('error', (e) => finish(new Error(`TLS 握手失败：${e.message}`)));
    };

    raw.on('data', onData);
  }
}

/** 底层请求：默认请求 identity 编码，避免自己解压 gzip */
export function requestText(url, { method = 'GET', body = null, headers = {}, proxy = '', timeout = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error(`非法 URL：${url}`));
    }

    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;

    const finalHeaders = { 'Accept-Encoding': 'identity', ...headers };
    if (body && !finalHeaders['Content-Type']) finalHeaders['Content-Type'] = 'application/json';
    if (body) finalHeaders['Content-Length'] = Buffer.byteLength(body);

    const opts = {
      method,
      host: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      headers: finalHeaders,
      timeout
    };
    if (isHttps && proxy) opts.agent = new HttpsProxyAgent(proxy);

    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          text: Buffer.concat(chunks).toString('utf8')
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error(`请求超时（${timeout}ms）：${url}`)));
    req.on('error', (e) => reject(e));

    if (body) req.write(body);
    req.end();
  });
}

export async function requestJson(url, opts = {}) {
  const res = await requestText(url, opts);
  let json = null;
  try {
    json = JSON.parse(res.text);
  } catch {
    /* 非 JSON 响应 */
  }
  return { ...res, json };
}

/** 下载二进制内容（封面图等），不经过 utf8 转换，避免图片损坏 */
export function requestBuffer(url, { method = 'GET', headers = {}, proxy = '', timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch {
      return reject(new Error(`非法 URL：${url}`));
    }

    const isHttps = u.protocol === 'https:';
    const mod = isHttps ? https : http;

    const opts = {
      method,
      host: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname + u.search,
      headers: { 'Accept-Encoding': 'identity', ...headers },
      timeout
    };
    if (isHttps && proxy) opts.agent = new HttpsProxyAgent(proxy);

    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: res.statusCode ?? 0,
          contentType: res.headers['content-type'] ?? 'application/octet-stream',
          buffer: Buffer.concat(chunks)
        })
      );
    });

    req.on('timeout', () => req.destroy(new Error(`请求超时（${timeout}ms）`)));
    req.on('error', reject);
    req.end();
  });
}

/* ---------------- 代理探测 ---------------- */

const proxyCache = new Map();

/**
 * 为某个目标地址决定用哪个代理。
 * 优先级：设置里手填 > 常见本地端口 > 环境变量 > 直连。
 * 注意环境变量优先级最低——某些工具链会注入自己的内部代理，那个代理未必放行我们的目标站点。
 */
export async function resolveProxy(cfg, testUrl) {
  if (proxyCache.has(testUrl)) return proxyCache.get(testUrl);

  const candidates = [];
  if (cfg.proxy) candidates.push(cfg.proxy);
  for (const hp of cfg.proxyProbe ?? []) candidates.push(`http://${hp}`);
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    if (process.env[key]) {
      candidates.push(process.env[key]);
      break;
    }
  }

  const unique = [...new Set(candidates)].filter(Boolean);

  const probe = async (proxy) => {
    const res = await requestText(testUrl, {
      proxy,
      timeout: 6000,
      headers: { 'User-Agent': cfg.userAgent || DEFAULT_UA, Accept: 'application/json' }
    });
    if (res.status < 200 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return proxy;
  };

  let winner = null;
  if (unique.length > 0) {
    winner = await Promise.any(unique.map(probe)).catch(() => null);
  }

  proxyCache.set(testUrl, winner ?? '');
  return winner ?? '';
}

/** 清空探测结果（改了配置后调用） */
export function clearProxyCache() {
  proxyCache.clear();
}

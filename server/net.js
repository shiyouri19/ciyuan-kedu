import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';

export const DEFAULT_UA = 'fan-zhang/0.2 (personal anime ledger)';

/**
 * 走 HTTP 代理访问 HTTPS 的 Agent。
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

    raw.setTimeout(10000, () => {
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

/** 底层文本请求（支持最多 3 次 301/302/307/308 重定向跟随） */
export function requestText(
  url,
  { method = 'GET', body = null, headers = {}, proxy = '', timeout = 12000, redirectsLeft = 3 } = {}
) {
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
      const code = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, u).toString();
        const nextMethod = code === 303 ? 'GET' : method;
        const nextBody = code === 303 ? null : body;
        requestText(nextUrl, {
          method: nextMethod,
          body: nextBody,
          headers,
          proxy,
          timeout,
          redirectsLeft: redirectsLeft - 1
        }).then(resolve, reject);
        return;
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: code,
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

/** 下载二进制内容（封面图等），支持重定向跟随 */
export function requestBuffer(
  url,
  { method = 'GET', headers = {}, proxy = '', timeout = 15000, redirectsLeft = 3 } = {}
) {
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
      const code = res.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(code) && res.headers.location && redirectsLeft > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, u).toString();
        requestBuffer(nextUrl, {
          method: 'GET',
          headers,
          proxy,
          timeout,
          redirectsLeft: redirectsLeft - 1
        }).then(resolve, reject);
        return;
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () =>
        resolve({
          status: code,
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

/**
 * 探测结果缓存。
 *
 * 这里**必须有 TTL**。以前是永不过期的 Map，一旦某次探测失败（比如服务启动时代理
 * 还没起来、或者刚好在一次网络抖动中），就把「直连」这个结论缓存到进程退出为止，
 * 之后所有请求都直连——用户看到的表现就是「远端源网络受限」，新番导览永远只有几条
 * 内置数据兜底，而命令行里跑同样的代码却是通的（新进程缓存空）。
 *
 * 探到了结果复用久一点，没探到就很快重试：代理恢复后最多 1 分钟自动接上。
 */
const proxyCache = new Map();
const PROXY_HIT_TTL = 10 * 60 * 1000;
const PROXY_MISS_TTL = 60 * 1000;

/**
 * 为某个目标地址决定用哪个代理。
 * 若用户未配置代理且无候选端口，直接返回空字符串（直连），不阻塞请求。
 */
export async function resolveProxy(cfg, testUrl) {
  if (!cfg) return '';

  const cached = proxyCache.get(testUrl);
  if (cached) {
    const ttl = cached.value ? PROXY_HIT_TTL : PROXY_MISS_TTL;
    if (Date.now() - cached.at < ttl) return cached.value;
    proxyCache.delete(testUrl);
  }

  const candidates = [];
  if (cfg.proxy) candidates.push(cfg.proxy);
  for (const hp of cfg.proxyProbe ?? []) {
    if (hp) candidates.push(/^https?:\/\//.test(hp) ? hp : `http://${hp}`);
  }
  for (const key of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
    if (process.env[key]) {
      candidates.push(process.env[key]);
      break;
    }
  }

  const unique = [...new Set(candidates)].filter(Boolean);
  if (unique.length === 0) {
    proxyCache.set(testUrl, { value: '', at: Date.now() });
    return '';
  }

  const probe = async (proxy) => {
    const res = await requestText(testUrl, {
      proxy,
      timeout: 4500,
      headers: { 'User-Agent': cfg.userAgent || DEFAULT_UA, Accept: 'application/json' }
    });
    if (res.status < 200 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    return proxy;
  };

  const winner = await Promise.any(unique.map(probe)).catch(() => null);
  proxyCache.set(testUrl, { value: winner ?? '', at: Date.now() });
  return winner ?? '';
}

export function clearProxyCache() {
  proxyCache.clear();
}

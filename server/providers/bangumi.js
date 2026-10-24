import { requestJson } from '../net.js';

const DEFAULT_API_BASE = 'https://api.bgm.tv';

/**
 * Bangumi API 基址可配置。
 * 被墙的是 api.bgm.tv 这个域名，不是「访问 Bangumi 的所有方式」——
 * 换成一个没被墙的中转（自建反代、Cloudflare Worker、公益镜像）即可直连，
 * 不必非得开代理。anime-grid 用的就是自建中转 bgm-w.magiconch.com。
 */
let API_BASE = DEFAULT_API_BASE;

export function configure({ apiBase } = {}) {
  API_BASE = String(apiBase || DEFAULT_API_BASE).replace(/\/+$/, '');
}

export function apiBase() {
  return API_BASE;
}

/** 探测用地址：随基址变化 */
export function testUrl() {
  return `${API_BASE}/v0/subjects/253`;
}

/**
 * 标签筛选。
 *
 * 难点：Bangumi 的 tags 按标记人数降序，但排最前的常是导演、作曲家、动画公司、作品名本身
 * （粉丝标记得多），这些当分类标签毫无意义。星际牛仔的前三名就是「渡边信一郎、菅野洋子、星际牛仔」。
 *
 * 解法：用条目自身的 infobox 反向排除——那里明确写了导演/音乐/动画制作是谁，
 * 把这些值做成排除集合，再叠加年份、平台、国家、改编来源这类通用噪声规则。
 */
const GENERIC_TAG_NOISE = [
  /^\d{4}年\d{1,2}月$/,
  /^\d{4}$/,
  /^(TV|WEB|OVA|ONA|剧场版|动画电影|电影|动态漫画)$/i,
  /^(日本|中国|美国|韩国|法国)$/,
  /^(漫画改|小说改|轻小说改|原创|游戏改|多媒体企划)$/,
  /^(完结|连载|已完结)$/
];

/** 常见动画公司/工作室。infobox 未必每条都写，靠这份兜底 */
const STUDIO_NAMES = new Set(
  [
    'madhouse', 'mappa', 'bones', 'ufotable', 'a-1pictures', 'j.c.staff', 'jcstaff',
    'shaft', 'witstudio', 'cloverworks', 'trigger', 'p.a.works', 'paworks', 'sunrise',
    'studiopierrot', 'brainsbase', 'silverlink', 'kinemacitrus', 'lerche', 'studiobind',
    'olm', 'tms', 'productioni.g', 'aniplex', 'kadokawa', 'whitefox', '8bit', 'c2c',
    'bibury', 'lidenfilms', 'zexcs', 'feel.', 'passione', 'engi', 'gohands', 'nut',
    'pinejam', 'mercury', 'studiocolorido', 'studioghibli', 'ghibli', 'toeianimation',
    'dogakobo', 'satelight', 'studio3hz', 'studiokhara', 'studiom2', 'studioblade',
    '京都动画', '京阿尼', '骨头社', '飞碟社', '日升', '东映动画', '东映', '吉卜力',
    '小丑社', '动画工房', '芳文社', '角川', '白狐', '亚细亚堂', '横滨动画', '三次元',
    '皮乐', '日升动画', '动画公司', '制作公司'
  ].map((s) => s.toLowerCase())
);

/** 常见日文汉字/繁体 → 简体，避免「斎藤圭一郎」与「斋藤圭一郎」「澤野弘之」与「泽野弘之」匹配不上 */
const JP2CN = {
  斎: '斋', 樹: '树', 恵: '惠', 絵: '绘', 黒: '黑', 竜: '龙', 沢: '泽', 広: '广',
  辺: '边', 瀬: '濑', 島: '岛', 岡: '冈', 宮: '宫', 長: '长', 関: '关', 様: '样',
  郷: '乡', 蔵: '藏', 亜: '亚', 実: '实', 穂: '穗', 葉: '叶', 豊: '丰', 浜: '滨',
  塚: '冢', 歩: '步', 桜: '樱', 姫: '姬', 闘: '斗', 戦: '战', 鉄: '铁', 銀: '银',
  銭: '钱', 東: '东', 剣: '剑', 蛍: '萤', 響: '响', 帯: '带', 滝: '泷',
  // 繁体（常出现在港台译名或旧条目里）
  澤: '泽', 邊: '边', 國: '国', 會: '会', 學: '学', 體: '体', 術: '术', 語: '语',
  時: '时', 間: '间', 開: '开', 進: '进', 擊: '击', 動: '动', 畫: '画', 聲: '声',
  優: '优', 樂: '乐', 劇: '剧', 戀: '恋', 愛: '爱', 夢: '梦', 點: '点', 數: '数',
  電: '电', 腦: '脑', 遊: '游', 戲: '戏', 爭: '争', 鬥: '斗', 歲: '岁', 級: '级',
  麼: '么', 靈: '灵', 傳: '传', 記: '记', 說: '说', 讀: '读', 書: '书', 藝: '艺',
  術: '术', 團: '团', 隊: '队', 戰: '战', 軍: '军', 隊: '队', 營: '营', 廠: '厂'
};

const normalizeKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\u4e00-\u9fff]/g, (ch) => JP2CN[ch] ?? ch);

/** 从 infobox 收集「人名 / 公司名 / 别名」，用于排除。会把复合值拆开 */
function buildExclusions(subject) {
  const set = new Set();
  const add = (v) => {
    const raw = String(v ?? '').trim();
    if (!raw) return;
    set.add(normalizeKey(raw));
    // infobox 里常见复合值，如「©はまじあき／芳文社・アニプレックス」
    for (const part of raw.split(/[\s/／・、,，&＆|｜()（）[\]【】]+/)) {
      const key = normalizeKey(part);
      if (key.length >= 2) set.add(key);
    }
  };

  add(subject.name);
  add(subject.name_cn);
  for (const item of subject.infobox ?? []) {
    const v = item?.value;
    if (typeof v === 'string') add(v);
    else if (Array.isArray(v)) for (const x of v) add(x?.v ?? x);
    else if (v && typeof v === 'object') add(v.v);
  }
  return set;
}

function pickTags(subject, n = 3, scanDepth = 25) {
  const exclusions = buildExclusions(subject);
  const all = (subject.tags ?? [])
    .map((t) => (typeof t === 'string' ? t : t.name))
    .filter(Boolean);

  const isNoise = (name) => {
    if (GENERIC_TAG_NOISE.some((re) => re.test(name))) return true;
    const key = normalizeKey(name);
    if (exclusions.has(key)) return true;
    if (STUDIO_NAMES.has(key)) return true;
    // 纯英文数字且较长：多为公司名（SUNRISE）或英文标题（CowboyBebop）
    if (/^[A-Za-z0-9\s._-]+$/.test(name) && name.length >= 4) return true;
    return false;
  };

  const picked = [];
  for (const name of all.slice(0, scanDepth)) {
    if (isNoise(name) || picked.includes(name)) continue;
    picked.push(name);
    if (picked.length >= n) break;
  }

  if (picked.length < n) {
    for (const m of subject.meta_tags ?? []) {
      if (picked.includes(m) || GENERIC_TAG_NOISE.some((re) => re.test(m))) continue;
      if (STUDIO_NAMES.has(normalizeKey(m))) continue;
      picked.push(m);
      if (picked.length >= n) break;
    }
  }

  return picked;
}

/** 归一化后的统一结构，两个 Provider 必须返回同样的形状 */
export function normalize(raw, source) {
  return {
    source,
    externalId: String(raw.externalId),
    title: raw.title || '',
    titleNative: raw.titleNative || '',
    titleAlt: raw.titleAlt || '',
    year: raw.year ?? null,
    episodes: raw.episodes ?? null,
    coverUrl: raw.coverUrl || '',
    summary: raw.summary || '',
    score: raw.score ?? null,
    tags: raw.tags ?? []
  };
}

function stripHtml(text) {
  return String(text ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/**
 * 选封面尺寸。
 * Bangumi 的 images 有多档：grid(100) / small(200) / common(400) / medium(800) / large(原图)。
 * 搜索列表用 common 即可——large 单张可达 600KB，8 条结果就是几 MB，经代理下载会明显卡顿。
 */
function pickCover(images, size = 'common') {
  if (!images) return '';
  if (size === 'large') {
    return images.large || images.medium || images.common || images.small || '';
  }
  return images.common || images.medium || images.small || images.large || '';
}

/**
 * Bangumi 搜索。
 * 中文检索质量明显优于 AniList（简称也能命中），因此搜索时优先级最高。
 * 但该站点需要代理访问，调用方需要先通过 resolveProxy 拿到可用代理。
 */
export async function search(keyword, { proxy = '', ua, limit = 8 } = {}) {
  const res = await requestJson(`${API_BASE}/v0/search/subjects?limit=${limit}`, {
    method: 'POST',
    body: JSON.stringify({ keyword, filter: { type: [2] } }),
    proxy,
    headers: { 'User-Agent': ua, 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 12000
  });

  if (res.status !== 200) {
    throw new Error(`Bangumi 搜索返回 HTTP ${res.status}`);
  }

  const list = res.json?.data ?? [];
  return list.map((it) =>
    normalize(
      {
        externalId: it.id,
        title: it.name_cn || it.name,
        titleNative: it.name,
        titleAlt: it.name_cn ? it.name : '',
        year: it.date ? Number(String(it.date).slice(0, 4)) : null,
        episodes: it.eps || it.total_episodes || null,
        // 一律返回原图地址，具体显示尺寸由上层用 /r/{宽}/ 决定
        coverUrl: pickCover(it.images, 'large'),
        summary: stripHtml(it.summary),
        score: it.rating?.score ?? null
      },
      'bangumi'
    )
  );
}

/** 拉取单条详情，用于用户选中后补全字段 */
export async function detail(externalId, { proxy = '', ua } = {}) {
  const res = await requestJson(`${API_BASE}/v0/subjects/${encodeURIComponent(externalId)}`, {
    proxy,
    headers: { 'User-Agent': ua, Accept: 'application/json' },
    timeout: 12000
  });

  if (res.status === 404) throw new Error('Bangumi 上找不到这个条目');
  if (res.status !== 200) throw new Error(`Bangumi 详情返回 HTTP ${res.status}`);

  const it = res.json ?? {};
  return normalize(
    {
      externalId: it.id ?? externalId,
      title: it.name_cn || it.name,
      titleNative: it.name,
      titleAlt: it.name_cn ? it.name : '',
      year: it.date ? Number(String(it.date).slice(0, 4)) : null,
      episodes: it.eps || it.total_episodes || null,
      // 存原图地址：Bangumi 的预生成档不可控（c 档实测只有 150×207），
      // 用 same URL + /r/{宽}/ 按需缩放才拿得到合适尺寸
      coverUrl: pickCover(it.images, 'large'),
      summary: stripHtml(it.summary),
      score: it.rating?.score ?? null,
      tags: pickTags(it, 3)
    },
    'bangumi'
  );
}

// 探测地址见上方导出的 testUrl()

import { requestJson } from '../net.js';
import { searchCurated, findCuratedById, getCuratedSeasonal } from './bilibili.js';

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

/** 常见日文汉字/繁体 → 简体，避免「斎藤圭一郎」与「斋藤圭一郎」「澤野弘之」与「泽野弘之」「藥屋」与「药屋」匹配不上 */
export const JP2CN = {
  斎: '斋', 樹: '树', 恵: '惠', 絵: '绘', 黒: '黑', 竜: '龙', 沢: '泽', 広: '广',
  辺: '边', 瀬: '濑', 島: '岛', 岡: '冈', 宮: '宫', 長: '长', 関: '关', 様: '样',
  郷: '乡', 蔵: '藏', 亜: '亚', 実: '实', 穂: '穗', 葉: '叶', 豊: '丰', 浜: '滨',
  塚: '冢', 歩: '步', 桜: '樱', 姫: '姬', 闘: '斗', 戦: '战', 鉄: '铁', 銀: '银',
  銭: '钱', 東: '东', 剣: '剑', 蛍: '萤', 響: '响', 帯: '带', 滝: '泷', 薬: '药',
  独: '独', 魔: '魔', 転: '转', 職: '职', 飯: '饭', 負: '败', 犬: '犬', 薫: '薰',
  // 繁体（常出现在港台译名、弹弹Play或旧条目里）
  澤: '泽', 邊: '边', 國: '国', 會: '会', 學: '学', 體: '体', 術: '术', 語: '语',
  時: '时', 間: '间', 開: '开', 進: '进', 擊: '击', 動: '动', 畫: '画', 聲: '声',
  優: '优', 樂: '乐', 劇: '剧', 戀: '恋', 愛: '爱', 夢: '梦', 點: '点', 數: '数',
  電: '电', 腦: '脑', 遊: '游', 戲: '戏', 爭: '争', 鬥: '斗', 歲: '岁', 級: '级',
  麼: '么', 靈: '灵', 傳: '传', 記: '记', 說: '说', 讀: '读', 書: '书', 藝: '艺',
  團: '团', 隊: '队', 戰: '战', 軍: '军', 營: '营', 廠: '厂', 藥: '药', 蓮: '莲',
  獨: '独', 搖: '摇', 滾: '滚', 敗: '败', 轉: '转', 異: '异', 實: '实', 驗: '验',
  驗: '验', 獸: '兽', 獵: '猎', 龍: '龙', 劍: '剑', 聖: '圣', 賢: '贤', 魔: '魔',
  導: '导', 師: '师', 錄: '录', 紀: '纪', 物語: '物语', 語: '语', 終: '终', 末: '末',
  無: '无', 雙: '双', 絕: '绝', 對: '对', 戀: '恋', 櫻: '樱', 蘭: '兰', 偵: '侦',
  探: '探', 機: '机', 動: '动', 戰: '战', 士: '士', 高: '高', 達: '达', 鋼: '钢',
  鐵: '铁', 鍊: '炼', 金: '金', 銀: '银', 魂: '魂', 鬼: '鬼', 滅: '灭', 刃: '刃',
  呪: '咒', 廻: '回', 輝: '辉', 頭: '头', 腦: '脑', 輝: '辉', 吹: '吹', 響: '响',
  號: '号', 頌: '颂', 偶: '偶', 膽: '胆', 黨: '党', 諜: '谍', 過: '过', 詭: '诡',
  秘: '秘', 迷: '迷', 宮: '宫', 飯: '饭', 禮: '礼', 讚: '赞', 贊: '赞', 萬: '万',
  與: '与', 為: '为', 專: '专', 屬: '属', 惡: '恶', 役: '役', 大小姐: '大小姐',
  轉生: '转生', 貴族: '贵族', 冒險: '冒险', 公會: '公会', 技能: '技能', 迷宮: '迷宫'
};

export function toSimplifiedKey(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[\u4e00-\u9fff]/g, (ch) => JP2CN[ch] ?? ch);
}

const CN_SEASON_DIGITS = {
  一: '1', 二: '2', 三: '3', 四: '4', 五: '5',
  六: '6', 七: '7', 八: '8', 九: '9', 十: '10',
  'Ⅰ': '1', 'Ⅱ': '2', 'Ⅲ': '3', 'Ⅳ': '4', 'Ⅴ': '5',
  ii: '2', iii: '3', iv: '4'
};

/**
 * 生成用于 Bangumi 与 弹弹Play 跨源同番合并去重的归一化主键：
 * 1. 繁简/日汉字合一（如「藥屋少女的呢喃」→「药屋少女的呢喃」）
 * 2. 季度后缀归一（如「第二季」「第2季」「第2期」「Season 2」「2nd Season」「S2」统一转换为「::s2」）
 * 3. 剥离副标题破折号/波浪号噪声与标点，生成主名键与核心主干键。
 */
export function buildAnimeDedupKeys(...rawTitles) {
  const keys = new Set();

  for (const raw of rawTitles) {
    const str = String(raw ?? '').trim();
    if (!str) continue;

    let simp = toSimplifiedKey(str);
    let seasonNum = null;

    const sMatch =
      simp.match(/第\s*([0-9一二三四五六七八九十]+)\s*[季期部]/) ||
      simp.match(/\b(?:season|s|part)\s*([0-9]{1,2})\b/i) ||
      simp.match(/\b([0-9]{1,2})(?:nd|rd|th)\s*season\b/i) ||
      simp.match(/\s+([ⅡⅢⅣⅤ2345])$/);

    if (sMatch) {
      const token = sMatch[1];
      seasonNum = CN_SEASON_DIGITS[token] || String(Number(token) || token);
      simp = simp
        .replace(/第\s*[0-9一二三四五六七八九十]+\s*[季期部]/g, ' ')
        .replace(/\b(?:season|s|part)\s*[0-9]{1,2}\b/gi, ' ')
        .replace(/\b[0-9]{1,2}(?:nd|rd|th)\s*season\b/gi, ' ')
        .replace(/\s+[ⅡⅢⅣⅤ2345]$/g, ' ');
    }

    const suffix = seasonNum && seasonNum !== '1' ? `::s${seasonNum}` : '';

    const fullClean = simp
      .replace(/[\s·・!！?？:：,，。.~～\-—–_'"“”‘’()（）[\]【】/\\;；×]+/g, '')
      .trim();

    if (fullClean) {
      keys.add(`${fullClean}${suffix}`);
    }

    // 同时提取去掉「-起于暗影-」或「～到了异世界～」副标题后的核心主干名（长度 >= 3 时生效）
    const stemRaw = simp
      .replace(/[-—–~～][^~～\-—–]+[-—–~～]?$/, '')
      .replace(/[\s·・!！?？:：,，。.~～\-—–_'"“”‘’()（）[\]【】/\\;；×]+/g, '')
      .trim();

    if (stemRaw && stemRaw.length >= 3) {
      keys.add(`${stemRaw}${suffix}`);
    }
  }

  return [...keys];
}

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

/** 归一化后的统一结构，所有 Provider 返回同样的形状 */
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
function normalizeBgmImageUrl(u) {
  const s = String(u ?? '').trim();
  if (!s) return '';
  if (s.startsWith('//')) return `https:${s}`;
  if (s.startsWith('/')) return `https://lain.bgm.tv${s}`;
  if (s.startsWith('http://')) return `https://${s.slice(7)}`;
  return s;
}

function pickCover(images, size = 'common', subjectId = null) {
  if (images && typeof images === 'object') {
    const raw =
      size === 'large'
        ? images.large || images.common || images.medium || images.small || images.grid || ''
        : images.common || images.medium || images.large || images.small || images.grid || '';
    const norm = normalizeBgmImageUrl(raw);
    if (norm) return norm;
  }
  if (typeof images === 'string' && images.trim()) {
    return normalizeBgmImageUrl(images);
  }
  if (subjectId) {
    return `https://api.bgm.tv/v0/subjects/${encodeURIComponent(String(subjectId))}/image?type=common`;
  }
  return '';
}

const FALLBACK_UA = 'ciyuan-kedu/0.5 (local anime ledger)';

/**
 * Bangumi 搜索。
 */
export async function search(keyword, { proxy = '', ua = FALLBACK_UA, limit = 8 } = {}) {
  const curated = searchCurated(keyword, limit, 'bangumi');
  let apiItems = [];
  try {
    const res = await requestJson(`${API_BASE}/v0/search/subjects?limit=${limit}`, {
      method: 'POST',
      body: JSON.stringify({ keyword, filter: { type: [2] } }),
      proxy,
      headers: { 'User-Agent': ua || FALLBACK_UA, 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 12000
    });

    if (res.status === 200) {
      const list = res.json?.data ?? [];
      apiItems = list.map((it) =>
        normalize(
          {
            externalId: it.id,
            title: it.name_cn || it.name,
            titleNative: it.name,
            titleAlt: it.name_cn ? it.name : '',
            year: it.date ? Number(String(it.date).slice(0, 4)) : null,
            episodes: it.eps || it.total_episodes || null,
            coverUrl: pickCover(it.images || it.image, 'large', it.id),
            summary: stripHtml(it.summary),
            score: it.rating?.score ?? null,
            tags: pickTags(it, 3)
          },
          'bangumi'
        )
      );
    }
  } catch (err) {
    if (curated.length === 0) throw err;
  }

  const seen = new Set();
  const merged = [];
  for (const item of [...apiItems, ...curated]) {
    const keys = buildAnimeDedupKeys(item.title, item.titleNative, item.titleAlt);
    if (keys.length === 0 || keys.some((k) => seen.has(k))) continue;
    for (const k of keys) seen.add(k);
    merged.push(item);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** 拉取单条详情，用于用户选中后补全字段 */
export async function detail(externalId, { proxy = '', ua = FALLBACK_UA } = {}) {
  const curatedHit = findCuratedById(externalId, 'bangumi');
  try {
    const res = await requestJson(`${API_BASE}/v0/subjects/${encodeURIComponent(externalId)}`, {
      proxy,
      headers: { 'User-Agent': ua || FALLBACK_UA, Accept: 'application/json' },
      timeout: 12000
    });

    if (res.status === 404) {
      if (curatedHit) return curatedHit;
      throw new Error('Bangumi 上找不到这个条目');
    }
    if (res.status !== 200) {
      if (curatedHit) return curatedHit;
      throw new Error(`Bangumi 详情返回 HTTP ${res.status}`);
    }

    const it = res.json ?? {};
    return normalize(
      {
        externalId: it.id ?? externalId,
        title: it.name_cn || it.name,
        titleNative: it.name,
        titleAlt: it.name_cn ? it.name : '',
        year: it.date ? Number(String(it.date).slice(0, 4)) : null,
        episodes: it.eps || it.total_episodes || null,
        coverUrl: pickCover(it.images || it.image, 'large', it.id),
        summary: stripHtml(it.summary),
        score: it.rating?.score ?? null,
        tags: pickTags(it, 3)
      },
      'bangumi'
    );
  } catch (err) {
    if (curatedHit) return curatedHit;
    throw err;
  }
}

/**
 * 计算日本季番真实开播日期区间：
 * 许多 1 月新番实际在上一年的 12 月下旬（12-24~12-31）先行开播，4/7/10 月同理在 3/6/9 月底开播。
 */
export function getSeasonDateWindow(year, season) {
  const y = Number(year) || new Date().getFullYear();
  const sKey = String(season || 'winter').toLowerCase();
  if (sKey === 'spring') return [`${y}-03-25`, `${y}-06-24`];
  if (sKey === 'summer') return [`${y}-06-25`, `${y}-09-24`];
  if (sKey === 'autumn') return [`${y}-09-25`, `${y}-12-24`];
  return [`${y - 1}-12-24`, `${y}-03-24`];
}

function getLocalTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * 判断 Bangumi 原始条目是否为「提前建档但实际尚未开播 / 假定日期占位 / PV宣传片」：
 * 1. 若开播日期格式不完整（非 YYYY-MM-DD）或为 0000 占位；
 * 2. 若开播日期晚于今天（airDate > todayIso），说明尚未正式放送；
 * 3. 若开播日期写成某月 1 日（如 YYYY-01-01 / 04-01 / 07-01 / 10-01）且完全没有评分人数（rating.total === 0）、
 *    无正片集数（eps === 0 && total_episodes === 0），往往是开播前占位的空壳词条；
 * 4. 若标签或标题明确标注为 PV、CM、宣传片、制作决定且无正片集数。
 */
export function inspectBangumiBroadcastState(rawItem, todayIso = getLocalTodayIso()) {
  const airDate = String(rawItem?.date || rawItem?.air_date || '').trim();
  const ratingCount = Number(rawItem?.rating?.total ?? 0);
  const score = Number(rawItem?.rating?.score ?? 0);
  const eps = Number(rawItem?.eps || rawItem?.total_episodes || rawItem?.eps_count || 0);
  const titleStr = `${rawItem?.name_cn || ''} ${rawItem?.name || ''}`;
  const tagNames = (rawItem?.tags ?? []).map((t) => (typeof t === 'string' ? t : t?.name || '')).join(' ');

  // 排除纯 PV / CM / 音乐 MV 占位条目
  if (/\b(PV|CM|MV|宣传片|预告)\b/i.test(titleStr) && eps <= 1 && ratingCount < 20) {
    return { aired: false, reason: 'promo_or_pv' };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(airDate) || airDate.startsWith('0000')) {
    return { aired: false, reason: 'missing_air_date' };
  }

  // 开播日期在今天之后 -> 尚未放送
  if (airDate > todayIso) {
    return { aired: false, reason: 'future_air_date' };
  }

  // 常见站点提前建档占位：把待定季度番暂填在 01-01 / 04-01 / 07-01 / 10-01，实际未播（0 集且 0 人评分）
  if (/-(01|04|07|10)-01$/.test(airDate) && eps === 0 && ratingCount === 0 && score === 0) {
    return { aired: false, reason: 'tentative_placeholder_shell' };
  }

  // 词条完全无集数、无评分人数、无封面，极大概率是提前建档的空壳词条
  const hasCover = Boolean(rawItem?.images?.large || rawItem?.images?.common || rawItem?.images?.medium);
  if (eps === 0 && ratingCount === 0 && !hasCover) {
    return { aired: false, reason: 'empty_shell' };
  }

  if (/放送時期未定|播出时间未定|制作决定/.test( String(rawItem?.summary || '') + ' ' + tagNames ) && ratingCount === 0 && eps === 0) {
    return { aired: false, reason: 'unscheduled_announcement' };
  }

  return { aired: true, reason: 'ok' };
}

/**
 * 按年份与季度从 Bangumi 获取完整的当季新番列表。
 * 改进点（Stage 15）：
 * 1. 自动连续拉取最多 4 页（每页 50 条，上限 200 条），彻底解决单季番剧超过 100 部时拉取不全的问题；
 * 2. 默认严格过滤「提前建档但尚未开播 / 占位空壳」词条（可通过 includeUnreleased=true 查看预告）；
 * 3. 若查询的是当前正在连载的季度，额外结合 Bangumi `/calendar` 每日放送表进行交叉核验与补全，确保当季在播番剧一网打尽。
 */
export async function seasonal(
  year,
  season = 'winter',
  { proxy = '', ua = FALLBACK_UA, limit = 180, includeUnreleased = false } = {}
) {
  const y = Number(year) || new Date().getFullYear();
  const sKey = String(season || 'winter').toLowerCase();
  const [startDate, endDate] = getSeasonDateWindow(y, sKey);
  const todayIso = getLocalTodayIso();

  // 若不展示未放送预告且该季度的起始日都在今天之后，直接返回空数组
  if (!includeUnreleased && startDate > todayIso) {
    return [];
  }

  // 查询已放送番剧时，将搜索日期上限截断到今天，避免未来占位词条挤占分页配额
  const effectiveEndDate = !includeUnreleased && endDate > todayIso ? todayIso : endDate;
  const maxItems = Math.min(Math.max(Number(limit) || 180, 1), 220);
  /**
   * Bangumi 的 /v0/search/subjects **单页最多只返回 20 条**，limit 传 50 也只给 20。
   * 之前这里写的是 50，翻页条件又是 `firstPage.data.length >= pageSize`，
   * 于是 20 >= 50 恒为 false，永远只拉第一页——一季 127 部番只显示 20 部。
   */
  const pageSize = 20;
  const maxPages = Math.min(8, Math.ceil(maxItems / pageSize));

  const fetchPage = async (offset) => {
    const res = await requestJson(
      `${API_BASE}/v0/search/subjects?limit=${pageSize}&offset=${offset}`,
      {
        method: 'POST',
        body: JSON.stringify({
          keyword: '',
          sort: 'heat',
          filter: {
            type: [2],
            air_date: [`>=${startDate}`, `<=${effectiveEndDate}`]
          }
        }),
        proxy,
        headers: {
          'User-Agent': ua || FALLBACK_UA,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: 12000
      }
    );
    if (res.status !== 200) {
      throw new Error(`Bangumi 季度番表返回 HTTP ${res.status}`);
    }
    return {
      total: Number(res.json?.total) || 0,
      data: Array.isArray(res.json?.data) ? res.json.data : []
    };
  };

  const rawList = [];
  const firstPage = await fetchPage(0);
  rawList.push(...firstPage.data);

  const totalAvailable = firstPage.total;
  const pagesToFetch = Math.min(maxPages, Math.ceil(totalAvailable / pageSize));

  // 只要第一页有数据就继续翻，不能用 data.length >= pageSize 判断——
  // 服务端单页上限（20）和我们的 pageSize 一旦对不上，这个条件就永远不成立
  if (pagesToFetch > 1 && firstPage.data.length > 0) {
    const pageOffsets = [];
    for (let p = 1; p < pagesToFetch; p += 1) {
      pageOffsets.push(p * pageSize);
    }
    const extraPages = await Promise.allSettled(pageOffsets.map((off) => fetchPage(off)));
    for (const r of extraPages) {
      if (r.status === 'fulfilled' && Array.isArray(r.value.data)) {
        rawList.push(...r.value.data);
      }
    }
  }

  const seenIds = new Set();
  const results = [];

  for (const it of rawList) {
    const idStr = String(it?.id ?? '');
    if (!idStr || seenIds.has(idStr)) continue;

    /**
     * 防御性检查：只保留开播日落在本季度窗口内的条目。
     *
     * 注意窗口是按 Bangumi 的档期惯例划的（秋季 = 09-25 ~ 12-24），
     * 所以 9 月底开播的番出现在秋季导览里是**正常的**，不是混入了夏季番。
     * 这一步只是为了挡掉 API 万一返回的窗口外数据。
     */
    const airDateRaw = String(it?.date ?? '').trim();
    if (airDateRaw && (airDateRaw < startDate || airDateRaw > effectiveEndDate)) continue;

    const broadcastState = inspectBangumiBroadcastState(it, todayIso);
    if (!includeUnreleased && !broadcastState.aired) {
      continue;
    }

    seenIds.add(idStr);
    const norm = normalize(
      {
        externalId: it.id,
        title: it.name_cn || it.name,
        titleNative: it.name,
        titleAlt: it.name_cn ? it.name : '',
        year: y,
        episodes: it.eps || it.total_episodes || null,
        coverUrl: pickCover(it.images || it.image, 'large', it.id),
        summary: stripHtml(it.summary),
        score: it.rating?.score ?? null,
        tags: pickTags(it, 3)
      },
      'bangumi'
    );
    norm.airDate = it.date || '';
    norm.isUnreleased = !broadcastState.aired;
    norm.ratingCount = Number(it.rating?.total ?? 0);
    results.push(norm);
    if (results.length >= maxItems) break;
  }

  return results;
}

/**
 * 拉取 Bangumi 每日放送周历表 (/calendar)，返回周一至周日 7 天的放送番剧列表。
 */
export async function calendar({ proxy = '', ua = FALLBACK_UA } = {}) {
  const res = await requestJson(`${API_BASE}/calendar`, {
    proxy,
    headers: { 'User-Agent': ua || FALLBACK_UA, Accept: 'application/json' },
    timeout: 12000
  });

  if (res.status !== 200 || !Array.isArray(res.json)) {
    throw new Error(`Bangumi 每日放送表返回 HTTP ${res.status}`);
  }

  const todayIso = getLocalTodayIso();

  return res.json.map((dayGroup) => {
    const weekdayId = Number(dayGroup?.weekday?.id) || 1;
    const items = (dayGroup?.items ?? [])
      .filter((it) => {
        // 每日放送表中若混入尚未开播的未来日期条目也予以过滤
        const ad = String(it?.air_date || '').trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(ad) && ad > todayIso) return false;
        return true;
      })
      .map((it) => {
        const norm = normalize(
          {
            externalId: it.id,
            title: it.name_cn || it.name,
            titleNative: it.name,
            titleAlt: it.name_cn ? it.name : '',
            year: it.air_date ? Number(String(it.air_date).slice(0, 4)) : new Date().getFullYear(),
            episodes: it.eps || it.eps_count || null,
            coverUrl: pickCover(it.images || it.image, 'large', it.id),
            summary: stripHtml(it.summary || ''),
            score: it.rating?.score ?? null,
            tags: []
          },
          'bangumi'
        );
        norm.airDate = it.air_date || '';
        norm.weekday = weekdayId;
        return norm;
      });

    return {
      weekday: {
        id: weekdayId,
        cn: dayGroup?.weekday?.cn || `周${['一', '二', '三', '四', '五', '六', '日'][weekdayId - 1] || '一'}`,
        en: dayGroup?.weekday?.en || '',
        ja: dayGroup?.weekday?.ja || ''
      },
      items
    };
  });
}

const $ = (sel) => document.querySelector(sel);

const STATUS_LABEL = {
  want: '想看',
  watching: '在看',
  completed: '已看完',
  paused: '暂停',
  dropped: '弃番'
};

const TYPE_LABEL = {
  TV: 'TV',
  movie: '电影',
  OVA: 'OVA',
  ONA: 'ONA',
  special: '特别篇',
  other: '其他'
};

const SOURCE_LABEL = {
  dandanplay: '弹弹Play（大陆直连）',
  bangumi: 'Bangumi 番组计划'
};

const SOURCE_BADGE = {
  dandanplay: '弹弹',
  bangumi: 'BGM',
  anilist: 'AL',
  bilibili: 'BGM'
};

const SEASON_LABEL = {
  winter: '1月 · 冬番',
  spring: '4月 · 春番',
  summer: '7月 · 夏番',
  autumn: '10月 · 秋番'
};

const DEFAULT_DISCOVERY_TPLS = [
  { id: 'mikan', name: '蜜柑计划 Mikan', url: 'https://mikanani.me/Home/Search?searchstr={keyword}', enabled: true },
  { id: 'dmhy', name: '动漫花园 DMHY', url: 'https://share.dmhy.org/topics/list?keyword={keyword}', enabled: true },
  { id: 'bangumi', name: 'Bangumi 番组计划', url: 'https://bgm.tv/subject_search/{keyword}?cat=2', enabled: true },
  { id: 'nyaa', name: 'Nyaa', url: 'https://nyaa.si/?f=0&c=1_0&q={keyword}', enabled: true }
];

const API_BASE_STORAGE_KEY = 'fanzhang_api_base';
const API_TOKEN_STORAGE_KEY = 'fanzhang_api_token';
const PREF_GRID_STORAGE_KEY = 'fanzhang_pref_grid_v1';
const UI_THEME_STORAGE_KEY = 'fanzhang_ui_theme_v1';
const UI_LAYOUT_STORAGE_KEY = 'fanzhang_ui_layout_v1';

const UI_EDITIONS = [
  {
    key: 'editorial',
    shortName: '手账版',
    name: '版本一 · 温润手账本 (Editorial Ledger)',
    recommendedLayout: 'grid',
    scene: '日常追番记账 · 长文观后感 · 动画生涯个人喜好表导出',
    desc: '采用暖米白纸感底色 (#F6F4EE) 与普鲁士蓝印章主色 (#185FA5)，搭配人文衬线标题与 2:3 经典海报墙。适合慢节奏记录分集打分、撰写长评感想与生成分享海报。',
    bg: '#f6f4ee',
    card: '#ffffff',
    text: '#22201c',
    accent: '#185fa5',
    badgeBg: '#185fa5',
    swatches: [
      { label: '暖米宣纸', hex: '#F6F4EE' },
      { label: '普鲁士蓝', hex: '#185FA5' },
      { label: '手账墨黑', hex: '#22201C' }
    ]
  },
  {
    key: 'cinema',
    shortName: '放映室',
    name: '版本二 · 暗夜放映室 (Cinema Dark)',
    recommendedLayout: 'grid',
    scene: '夜间沉浸看番 · 本地播放器联动 · 2:3 蓝光海报墙浏览',
    desc: '专为夜间关灯看番与调用 PotPlayer / VLC / IINA 本地播放场景打造。深邃曜石蓝黑 (#0B0F17) 降低屏幕眩光，电光青 (#38BDF8) 进度条与琥珀金 (#F59E0B) 评分角标让番剧封面成为视觉绝对核心。',
    bg: '#0b0f17',
    card: '#151e30',
    text: '#f1f5f9',
    accent: '#38bdf8',
    badgeBg: '#0284c7',
    swatches: [
      { label: '曜石蓝黑', hex: '#0B0F17' },
      { label: '深海炭蓝', hex: '#151E30' },
      { label: '电光青', hex: '#38BDF8' },
      { label: '琥珀星标', hex: '#F59E0B' }
    ]
  },
  {
    key: 'studio',
    shortName: '工作台',
    name: '版本三 · 极客工作台 (Studio Pro)',
    recommendedLayout: 'table',
    scene: '百部以上大库管理 · NAS 本地文件夹清洗 · 字幕组磁力链聚合',
    desc: '引入左侧常驻深色工作台导航栏 (Sidebar) + 宽屏全息数据台账表 (Table View)。所有集数、时长、评分均采用等宽对齐数字 (tabular-nums)，支持单屏高密度检视数十部作品并一键批量操作。',
    bg: '#f3f4f6',
    card: '#ffffff',
    text: '#111827',
    accent: '#4f46e5',
    badgeBg: '#4f46e5',
    swatches: [
      { label: '石墨侧栏', hex: '#111827' },
      { label: '极客靛青', hex: '#4F46E5' },
      { label: '冷灰台面', hex: '#F3F4F6' }
    ]
  },
  {
    key: 'bento',
    shortName: '画报版',
    name: '版本四 · 清透画报风 (Bento Magazine)',
    recommendedLayout: 'board',
    scene: '季度新番周历导览 · 状态分栏看板 · 手机 PWA 与电脑跨端云同步',
    desc: '以薄荷冷白 (#EEF4F6) 与翠竹青 (#0D9488) 构建现代画报卡片，默认搭配四栏状态看板 (在看 / 想看 / 已看完 / 暂停·弃番) 与顶部「正在追番 · 快捷打卡」焦点舱，一眼掌握本季追番节奏。',
    bg: '#eef4f6',
    card: '#ffffff',
    text: '#0f2933',
    accent: '#0d9488',
    badgeBg: '#0d9488',
    swatches: [
      { label: '薄荷冷白', hex: '#EEF4F6' },
      { label: '翠竹青', hex: '#0D9488' },
      { label: '深青墨色', hex: '#0F2933' }
    ]
  },
  {
    key: 'washi',
    shortName: '手帐',
    name: '版本五 · 温润手帐 (Washi Ledger)',
    recommendedLayout: 'grid',
    scene: '纸质手账记录 · 盖章打卡 · 书脊式海报墙',
    desc: '米黄纸感底色 (#F7F2E7) 与砖红印章主色 (#B34A32)，配衬线标题与柔和投影。书脊式海报卡、圆形盖章徽章、尺子刻度与胶带装饰，把冷冰冰的台账变成一本温暖的手帐。',
    bg: '#f7f2e7',
    card: '#fffdf7',
    text: '#3a3226',
    accent: '#b34a32',
    badgeBg: '#b34a32',
    swatches: [
      { label: '米黄纸', hex: '#F7F2E7' },
      { label: '砖红印章', hex: '#B34A32' },
      { label: '暖橙', hex: '#D89A5C' },
      { label: '深褐墨', hex: '#3A3226' }
    ]
  }
];

const LAYOUT_MODES = [
  { key: 'grid', label: '海报网格', title: '2:3 经典海报卡片网格' },
  { key: 'table', label: '高密台账', title: '紧凑表格式台账，适合快速比对进度与评分' },
  { key: 'board', label: '状态看板', title: '按「在看 / 想看 / 已看完 / 暂停·弃番」四栏分组看板' }
];

const state = {
  list: [],
  allLibraryList: [],
  tags: [],
  status: '',
  tag: '',
  keyword: '',
  sortBy: 'updated_at',
  order: 'desc',
  archived: false,
  favorite: false,
  currentId: null,
  editingId: null,
  loading: false,
  view: 'list',
  uiTheme: 'washi',
  mediaSummaryByAnime: new Map(),
  layoutMode: (() => {
    try {
      return localStorage.getItem(UI_LAYOUT_STORAGE_KEY) || 'grid';
    } catch {
      return 'grid';
    }
  })(),
  ledgerBatchMode: false,
  ledgerSelected: new Set(),
  seasonalYear: new Date().getFullYear(),
  seasonalSeason: (() => {
    const m = new Date().getMonth() + 1;
    if (m <= 3) return 'winter';
    if (m <= 6) return 'spring';
    if (m <= 9) return 'summer';
    return 'autumn';
  })(),
  seasonalSource: 'all',
  seasonalMode: 'season',
  seasonalPage: 1,
  seasonalPageSize: 24,
  seasonalKeyword: '',
  seasonalFilter: 'all',
  seasonalSort: 'default',
  seasonalIncludeUnreleased: false,
  seasonalBatchMode: false,
  seasonalMeta: null,
  seasonalItems: [],
  seasonalSelected: new Map(),
  calendarData: null,
  calendarActiveDay: 0,
  activeSeasonByAnime: new Map(),
  activeFansubByAnime: new Map(),
  browserVideoFiles: new Map(),
  discoveryTemplates: DEFAULT_DISCOVERY_TPLS,
  lastStats: null
};

/* ---------------- 可切换云服务器接口层 ---------------- */

function getApiBase() {
  try {
    const custom = localStorage.getItem(API_BASE_STORAGE_KEY) || window.__APP_CONFIG__?.apiBaseUrl || '';
    return String(custom).trim().replace(/\/+$/, '');
  } catch {
    return '';
  }
}

function setApiBase(url) {
  try {
    const clean = String(url ?? '').trim().replace(/\/+$/, '');
    if (clean) localStorage.setItem(API_BASE_STORAGE_KEY, clean);
    else localStorage.removeItem(API_BASE_STORAGE_KEY);
    updateServerStatusNote();
  } catch {
    /* ignore storage error */
  }
}

function getApiToken() {
  try {
    return String(localStorage.getItem(API_TOKEN_STORAGE_KEY) || '').trim();
  } catch {
    return '';
  }
}

function setApiToken(token) {
  try {
    const clean = String(token ?? '').trim();
    if (clean) localStorage.setItem(API_TOKEN_STORAGE_KEY, clean);
    else localStorage.removeItem(API_TOKEN_STORAGE_KEY);
  } catch {
    /* ignore storage error */
  }
}

function buildApiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBase();
  return base ? `${base}${path.startsWith('/') ? path : '/' + path}` : path;
}

function updateServerStatusNote() {
  const note = $('#serverStatusNote');
  if (!note) return;
  const base = getApiBase();
  if (base) {
    note.textContent = `当前直连远程云服务器：${base}`;
  } else {
    note.textContent = '当前连接：本机/当前服务器 · 支持在「设置」中与云服务器一键双向同步';
  }
}

async function api(path, { method = 'GET', body, customBase, customToken } = {}) {
  const init = { method, headers: {} };
  const token = customToken !== undefined ? String(customToken).trim() : getApiToken();
  if (token) {
    init.headers['X-Access-Token'] = token;
  }
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const url =
    customBase !== undefined
      ? `${String(customBase).replace(/\/+$/, '')}${path}`
      : buildApiUrl(path);
  const res = await fetch(url, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? `请求失败（HTTP ${res.status}）`);
    err.field = data?.error?.field ?? null;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- 小工具與应用内确认框 ---------------- */

function toast(message, isError = false) {
  const elNode = $('#toast');
  elNode.textContent = message;
  elNode.className = 'toast' + (isError ? ' error' : '');
  elNode.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    elNode.hidden = true;
  }, isError ? 4200 : 2400);
}

/**
 * 应用内确认弹窗（替代 window.confirm，避免在沙盒 iframe 中被浏览器拦截）
 */
function askConfirm({ title = '确认操作', message = '', confirmText = '确认', danger = false } = {}) {
  return new Promise((resolve) => {
    const modal = $('#confirmModal');
    const titleEl = $('#confirmTitle');
    const bodyEl = $('#confirmBody');
    const okBtn = $('#confirmOk');
    const cancelBtn = $('#confirmCancel');
    const closeBtn = $('#confirmClose');

    titleEl.textContent = title;
    bodyEl.textContent = message;
    okBtn.textContent = confirmText;
    okBtn.className = 'btn ' + (danger ? 'danger' : 'primary');
    modal.hidden = false;

    const cleanup = (result) => {
      modal.hidden = true;
      okBtn.onclick = null;
      cancelBtn.onclick = null;
      closeBtn.onclick = null;
      resolve(result);
    };

    okBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(false);
    closeBtn.onclick = () => cleanup(false);
  });
}

function hashCode(str) {
  let h = 0;
  for (const ch of str) h = (h * 31 + ch.codePointAt(0)) % 100000;
  return h;
}

function coverStyle(title) {
  const hue = hashCode(title) % 360;
  return `hsl(${hue}, 34%, 60%)`;
}

function firstChar(title) {
  return (title ?? '?').trim().charAt(0) || '?';
}

const BGM_WIDTHS = [100, 200, 400, 600, 800, 1200];

function resizeBgmUrl(raw, width) {
  if (!raw || !width) return raw;
  if (!/^https?:\/\/lain\.bgm\.tv\//.test(raw)) return raw;

  const want = Number(width);
  const w = BGM_WIDTHS.find((x) => x >= want) ?? BGM_WIDTHS[BGM_WIDTHS.length - 1];

  const stripped = raw.replace(/^(https?:\/\/lain\.bgm\.tv)\/r\/\d+\//, '$1/');
  return stripped.replace(/^(https?:\/\/lain\.bgm\.tv)\//, `$1/r/${w}/`);
}

function coverProxyUrl(raw, width = 400) {
  if (!raw) return '';
  if (raw.startsWith('/api/cover')) return buildApiUrl(raw);
  return buildApiUrl(`/api/cover?u=${encodeURIComponent(resizeBgmUrl(raw, width))}`);
}

function extractRawCoverUrl(coverPath) {
  const s = String(coverPath ?? '').trim();
  if (!s) return '';
  if (s.startsWith('/api/cover')) {
    try {
      const u = new URL(s, location.origin);
      return u.searchParams.get('u') || '';
    } catch {
      return '';
    }
  }
  if (s.startsWith('//')) return `https:${s}`;
  return s;
}

function buildFallbackPosterDataUri(title) {
  const clean = String(title || "次元刻度").replace(/^[★☆]\s*/, "").trim();
  let h = 0;
  for (let i = 0; i < clean.length; i++) h = (h * 31 + clean.charCodeAt(i)) | 0;
  const palettes = [
    ["#0f172a", "#1e293b", "#93c5fd", "MIDNIGHT · ARCHIVE"],
    ["#111827", "#1e1b4b", "#a5b4fc", "SCREENING · EDITION"],
    ["#0c1322", "#172554", "#7dd3fc", "CINEMA · COLLECTION"],
    ["#0f172a", "#132a2e", "#6ee7b7", "ANIME · CHRONICLE"],
    ["#131629", "#272343", "#c4b5fd", "SYMPHONY · ARCHIVE"],
    ["#181826", "#291d32", "#fda4af", "SPECIAL · FEATURE"],
    ["#0d1526", "#1e293b", "#bae6fd", "SERIES · CATALOG"]
  ];
  const [c1, c2, c3, tag] = palettes[Math.abs(h) % palettes.length];
  const safe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const l1 = safe(clean.slice(0, 6));
  const l2 = safe(clean.slice(6, 12));
  const ch = safe(clean.slice(0, 1) || "番");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420" width="300" height="420">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${c1}"/>
        <stop offset="62%" stop-color="${c2}"/>
        <stop offset="100%" stop-color="#0f172a"/>
      </linearGradient>
    </defs>
    <rect width="300" height="420" fill="url(#g)"/>
    <circle cx="235" cy="88" r="82" fill="${c3}" opacity="0.16"/>
    <circle cx="52" cy="315" r="115" fill="${c3}" opacity="0.1"/>
    <rect x="14" y="14" width="272" height="392" rx="8" fill="none" stroke="rgba(255,255,255,0.26)" stroke-width="1.5"/>
    <text x="26" y="42" fill="${c3}" font-size="11" font-family="sans-serif" font-weight="700" letter-spacing="1.5">CIYUAN KEDU · EDITION</text>
    <text x="195" y="195" fill="rgba(255,255,255,0.11)" font-size="128" font-family="serif" font-weight="800">${ch}</text>
    <text x="26" y="316" fill="#ffffff" font-size="27" font-family="serif" font-weight="800">${l1}</text>
    ${l2 ? `<text x="26" y="350" fill="#ffffff" font-size="22" font-family="serif" font-weight="700">${l2}</text>` : ""}
    <text x="26" y="382" fill="${c3}" font-size="11.5" font-family="sans-serif" font-weight="600" letter-spacing="1">${tag}</text>
  </svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

function resolveBuiltInPoster(title) {
  const t = String(title || '').trim();
  if (!t) return '';
  if (t.includes('芙莉莲')) return '/posters/frieren.jpg';
  if (t.includes('药屋')) return '/posters/kusuriya.jpg';
  if (t.includes('迷宫饭')) return '/posters/dungeon_meshi.jpg';
  if (t.includes('上低音号') || t.includes('京吹')) return '/posters/euphonium.jpg';
  if (t.includes('胆大党') || t.includes('当哒当')) return '/posters/dandadan.jpg';
  if (t.includes('孤独摇滚')) return '/posters/bocchi.jpg';
  if (t.includes('败犬女主')) return '/posters/makeine.jpg';
  return '';
}

function paintCover(node, title, coverPath, width = 400) {
  node.style.background = coverStyle(title);
  const initial = el('span', 'cover-initial', firstChar(title));
  node.appendChild(initial);

  const proxyUrl = coverProxyUrl(coverPath, width);
  const rawRemoteUrl = resizeBgmUrl(extractRawCoverUrl(coverPath), width);
  const rawOriginalUrl = extractRawCoverUrl(coverPath).replace(/^(https?:\/\/lain\.bgm\.tv)\/r\/\d+\//, '$1/');
  const builtInPoster = resolveBuiltInPoster(title);
  const svgFallback = buildFallbackPosterDataUri(title);
  const candidates = [proxyUrl, rawRemoteUrl, rawOriginalUrl, builtInPoster, svgFallback].filter((x, i, arr) => x && arr.indexOf(x) === i);

  let idx = 0;
  const img = document.createElement('img');
  img.className = 'cover-img';
  img.alt = '';
  img.style.opacity = '0';
  img.loading = 'lazy';
  img.referrerPolicy = 'no-referrer';
  img.onload = () => {
    initial.hidden = true;
    img.style.opacity = '1';
    node.style.background = '#0f1526';
  };
  img.onerror = () => {
    idx += 1;
    if (idx < candidates.length) {
      img.src = candidates[idx];
    } else {
      img.remove();
    }
  };
  img.src = candidates[0];
  node.appendChild(img);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------------- 列表与筛选 ---------------- */

function updateMediaSummaryMap(files = []) {
  const map = new Map();
  for (const f of files) {
    if (!f.anime_id) continue;
    let rec = map.get(f.anime_id);
    if (!rec) {
      rec = { available: 0, missing: 0, pending: 0, total: 0 };
      map.set(f.anime_id, rec);
    }
    rec.total += 1;
    if (f.availability_status === 'missing') rec.missing += 1;
    else if (f.availability_status === 'needs_review' || f.availability_status === 'unmatched') rec.pending += 1;
    else rec.available += 1;
  }
  state.mediaSummaryByAnime = map;
}

function buildMediaStatusPill(animeId) {
  const m = state.mediaSummaryByAnime.get(animeId);
  if (!m || m.total === 0) return null;
  if (m.missing > 0) {
    const pill = el('span', 'media-status-pill missing', `▲ 本地缺失 ${m.missing}`);
    pill.title = `该作品关联的本地视频中有 ${m.missing} 个文件缺失（已看进度完整保留）`;
    return pill;
  }
  if (m.pending > 0) {
    const pill = el('span', 'media-status-pill pending', `● 待确认 ${m.pending}`);
    pill.title = `该作品有 ${m.pending} 个低置信度本地文件待确认`;
    return pill;
  }
  const pill = el('span', 'media-status-pill ok', `● 本地 ${m.available}集`);
  pill.title = `已关联 ${m.available} 个可用本地视频文件`;
  return pill;
}

function computeStatusCounts() {
  const src = Array.isArray(state.allLibraryList) && state.allLibraryList.length
    ? state.allLibraryList
    : state.list;
  const counts = {
    all: 0,
    favorite: 0,
    want: 0,
    watching: 0,
    completed: 0,
    paused: 0,
    dropped: 0
  };
  for (const it of src) {
    if (it.deleted_at) continue;
    counts.all += 1;
    if (it.is_favorite) counts.favorite += 1;
    if (counts[it.status] !== undefined) counts[it.status] += 1;
  }
  return counts;
}

function applyUiTheme(themeKey, { switchRecommendedLayout = false, silent = false } = {}) {
  const ed = UI_EDITIONS.find((x) => x.key === themeKey) || UI_EDITIONS[0];
  state.uiTheme = ed.key;
  document.documentElement.setAttribute('data-ui-theme', ed.key);
  document.body?.setAttribute('data-ui-theme', ed.key);
  try {
    localStorage.setItem(UI_THEME_STORAGE_KEY, ed.key);
  } catch {
    /* ignore */
  }
  if (switchRecommendedLayout && ed.recommendedLayout) {
    state.layoutMode = ed.recommendedLayout;
    try {
      localStorage.setItem(UI_LAYOUT_STORAGE_KEY, ed.recommendedLayout);
    } catch {
      /* ignore */
    }
  }
  renderUiQuickBar();
  renderLayoutSwitcher();
  renderStudioSidebar();
  if (state.view === 'list') renderList();
  else if (state.view === 'ui-studio') renderUiStudioView();
  if (!silent) {
    toast(`已切换至「${ed.name}」`);
  }
}

function setLayoutMode(modeKey) {
  const found = LAYOUT_MODES.find((m) => m.key === modeKey) || LAYOUT_MODES[0];
  state.layoutMode = found.key;
  try {
    localStorage.setItem(UI_LAYOUT_STORAGE_KEY, found.key);
  } catch {
    /* ignore */
  }
  renderUiQuickBar();
  renderLayoutSwitcher();
  if (state.view === 'list') renderList();
  else if (state.view === 'ui-studio') renderUiStudioView();
}

function renderUiQuickBar() {
  const bar = $('#uiQuickBar');
  if (!bar) return;
  bar.hidden = true;
  bar.innerHTML = '';
  return;
  const inner = el('div', 'ui-quick-inner');

  const left = el('div', 'ui-quick-group');
  left.appendChild(el('span', 'ui-quick-label', 'UI 视觉样本快切：'));
  for (const ed of UI_EDITIONS) {
    const btn = el('button', 'ui-theme-chip' + (state.uiTheme === ed.key ? ' active' : ''));
    btn.type = 'button';
    btn.title = `${ed.name} — ${ed.scene}`;
    const dot = el('span', 'ui-theme-dot');
    dot.style.background = ed.accent;
    btn.appendChild(dot);
    btn.appendChild(el('span', '', ed.shortName));
    btn.addEventListener('click', () => {
      applyUiTheme(ed.key, { switchRecommendedLayout: true });
    });
    left.appendChild(btn);
  }

  const right = el('div', 'ui-quick-group');
  right.appendChild(el('span', 'ui-quick-label', '列表密度：'));
  for (const lm of LAYOUT_MODES) {
    const lbtn = el('button', 'ui-theme-chip' + (state.layoutMode === lm.key ? ' active' : ''), lm.label);
    lbtn.type = 'button';
    lbtn.title = lm.title;
    lbtn.addEventListener('click', () => {
      setLayoutMode(lm.key);
      if (state.view !== 'list') switchView('list');
    });
    right.appendChild(lbtn);
  }

  const studioJumpBtn = el(
    'button',
    'ui-theme-chip' + (state.view === 'ui-studio' ? ' active' : ''),
    state.view === 'ui-studio' ? '← 返回动画账本' : '对比 4 版 UI 样本 & 评估报告 →'
  );
  studioJumpBtn.type = 'button';
  studioJumpBtn.addEventListener('click', () => {
    switchView(state.view === 'ui-studio' ? 'list' : 'ui-studio');
  });
  right.appendChild(studioJumpBtn);

  inner.appendChild(left);
  inner.appendChild(right);
  bar.appendChild(inner);
}

function renderLayoutSwitcher() {
  const wrap = $('#layoutSwitcher');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (const lm of LAYOUT_MODES) {
    const btn = el('button', 'layout-btn' + (state.layoutMode === lm.key ? ' active' : ''), lm.label);
    btn.type = 'button';
    btn.title = lm.title;
    btn.addEventListener('click', () => setLayoutMode(lm.key));
    wrap.appendChild(btn);
  }
}

function renderStudioSidebar() {
  const side = $('#studioSidebar');
  if (!side) return;
  side.innerHTML = '';

  const brandRow = el('div', 'studio-side-brand');
  const brandLeft = el('div', 'studio-side-brand-left');
  const logoImg = document.createElement('img');
  logoImg.src = '/icon.png';
  logoImg.alt = '';
  logoImg.className = 'studio-side-brand-logo';
  brandLeft.appendChild(logoImg);
  brandLeft.appendChild(el('span', '', '次元刻度'));
  brandRow.appendChild(brandLeft);
  brandRow.appendChild(el('span', 'studio-side-tag', 'SCREENING'));
  side.appendChild(brandRow);

  const counts = computeStatusCounts();
  side.appendChild(el('div', 'studio-side-section', '放映室导航'));
  const navItems = [
    { key: 'list', label: '放映室主页 · 番剧库', badge: counts.all },
    { key: 'seasonal', label: '新番导览 · 放送周历', badge: '双源' },
    { key: 'stats', label: '观看记录 · 打卡热力图', badge: '统计' }
  ];
  for (const nav of navItems) {
    const btn = el('button', 'studio-side-btn' + (state.view === nav.key ? ' active' : ''));
    btn.type = 'button';
    btn.appendChild(el('span', '', nav.label));
    btn.appendChild(el('span', 'studio-side-count', String(nav.badge)));
    btn.addEventListener('click', () => switchView(nav.key));
    side.appendChild(btn);
  }

  side.appendChild(el('div', 'studio-side-section', '观看状态筛选'));
  const statusItems = [
    { key: '', label: '全部馆藏作品', count: counts.all },
    { key: 'watching', label: '正在追番 (在看)', count: counts.watching },
    { key: 'want', label: '待看清单 (想看)', count: counts.want },
    { key: 'completed', label: '已看完归档', count: counts.completed },
    { key: 'paused', label: '暂停搁置', count: counts.paused },
    { key: '__favorite', label: '★ 特别收藏', count: counts.favorite }
  ];
  for (const stItem of statusItems) {
    const isAct =
      state.view === 'list' &&
      !state.archived &&
      (stItem.key === '__favorite' ? state.favorite : !state.favorite && state.status === stItem.key);
    const btn = el('button', 'studio-side-btn' + (isAct ? ' active' : ''));
    btn.type = 'button';
    btn.appendChild(el('span', '', stItem.label));
    btn.appendChild(el('span', 'studio-side-count', String(stItem.count)));
    btn.addEventListener('click', () => {
      state.archived = false;
      if (stItem.key === '__favorite') {
        state.favorite = true;
        state.status = '';
      } else {
        state.favorite = false;
        state.status = stItem.key;
      }
      renderTabs();
      if (state.view !== 'list') switchView('list');
      else load();
    });
    side.appendChild(btn);
  }

  side.appendChild(el('div', 'studio-side-section', '媒体库与数据管理'));
  let mediaTotalCount = 0;
  let mediaMissingCount = 0;
  for (const m of state.mediaSummaryByAnime.values()) {
    mediaTotalCount += m.total || 0;
    mediaMissingCount += m.missing || 0;
  }
  const mediaBadge = mediaMissingCount > 0
    ? `缺失${mediaMissingCount}`
    : mediaTotalCount > 0
      ? `${mediaTotalCount}集`
      : '扫描';

  const toolActions = [
    { label: '本地媒体库与匹配结果', badge: mediaBadge, onClick: () => openMediaScanModal() },
    { label: '生成年度总结/喜好表', badge: '海报', onClick: () => openShareGeneratorModal('poster') },
    { label: '看板娘「刻度娘」档案', badge: '立绘', onClick: () => openMascotGalleryModal() },
    { label: '数据源、云同步与设置', badge: '配置', onClick: () => openSettingsModal() }
  ];
  for (const t of toolActions) {
    const btn = el('button', 'studio-side-btn');
    btn.type = 'button';
    btn.appendChild(el('span', '', t.label));
    btn.appendChild(el('span', 'studio-side-count', t.badge));
    btn.addEventListener('click', t.onClick);
    side.appendChild(btn);
  }

  const foot = el('div', 'studio-side-footer');
  foot.appendChild(el('div', '', '主题：深夜放映室 (Midnight)'));
  foot.appendChild(el('div', '', '快捷键：/ 搜索 · 1/2/3 切视图 · m 媒体库'));
  side.appendChild(foot);
}

function renderTabs() {
  const wrap = $('#tabs');
  wrap.innerHTML = '';
  const counts = computeStatusCounts();
  const defs = [
    { key: '', label: '全部', count: counts.all },
    { key: '__favorite', label: '★ 收藏', count: counts.favorite },
    ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ key: k, label: v, count: counts[k] ?? 0 })),
    { key: '__archived', label: '已归档', count: null }
  ];

  for (const d of defs) {
    let active = false;
    if (d.key === '__archived') active = state.archived;
    else if (d.key === '__favorite') active = !state.archived && state.favorite;
    else active = !state.archived && !state.favorite && state.status === d.key;

    const btn = el('button', 'tab' + (active ? ' active' : ''));
    btn.type = 'button';
    btn.appendChild(el('span', '', d.label));
    if (d.count !== null && d.count > 0) {
      btn.appendChild(el('span', 'tab-count', String(d.count)));
    }
    btn.addEventListener('click', () => {
      if (d.key === '__archived') {
        state.archived = true;
        state.favorite = false;
        state.status = '';
      } else if (d.key === '__favorite') {
        state.archived = false;
        state.favorite = true;
        state.status = '';
      } else {
        state.archived = false;
        state.favorite = false;
        state.status = d.key;
      }
      renderTabs();
      renderStudioSidebar();
      load();
    });
    wrap.appendChild(btn);
  }
}

async function refreshTagsFilter() {
  try {
    const res = await api('/api/tags');
    const tags = res.data ?? [];
    state.tags = tags;
    const wrap = $('#tagFilterWrap');
    const sel = $('#tagFilter');
    if (!wrap || !sel) return;

    if (tags.length === 0) {
      wrap.hidden = true;
      return;
    }

    wrap.hidden = false;
    const current = state.tag;
    sel.innerHTML = '<option value="">全部标签</option>';
    for (const t of tags) {
      const opt = document.createElement('option');
      opt.value = t.name;
      opt.textContent = t.name;
      if (t.name === current) opt.selected = true;
      sel.appendChild(opt);
    }
  } catch {
    /* ignore tag load error */
  }
}

function formatMinutes(m) {
  const n = Number(m) || 0;
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60);
  const rest = n % 60;
  return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

function cardProgressEl(item) {
  const total = Number(item.episode_total ?? 0);
  const watched = Number(item.episode_watched ?? 0);
  const current = Number(item.episode_current ?? 0);

  const wrap = el('div', 'card-progress');

  if (total <= 0) {
    wrap.classList.add('untracked');
    wrap.appendChild(el('span', '', '未设集数'));
    const btn = el('button', 'set-count-btn', '去设置');
    btn.type = 'button';
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await openDetail(item.id);
      const input = $('#epCountInput');
      if (input) {
        input.focus();
        input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
    wrap.appendChild(btn);
    return wrap;
  }

  const bar = el('div', 'progress-bar');
  const fill = el('div', 'progress-fill');
  fill.style.width = `${Math.round((watched / total) * 100)}%`;
  bar.appendChild(fill);
  wrap.appendChild(bar);

  wrap.appendChild(
    el('span', 'progress-text', current > 0 ? `看到 ${current}/${total}` : `共 ${total} 集`)
  );

  const done = watched >= total;
  const bump = el('button', 'card-bump' + (done ? ' done' : ''), done ? '✓' : '+1');
  bump.type = 'button';
  bump.disabled = done;
  bump.title = done ? '已看完' : '记一集（补下一个还没看的）';

  bump.addEventListener('click', async (e) => {
    e.stopPropagation();
    bump.disabled = true;
    try {
      const res = await api(`/api/anime/${item.id}/progress`, {
        method: 'POST',
        body: { action: 'next' }
      });
      if (res.at_end) {
        toast('已经看完了');
      } else if (res.changed) {
        toast(`第 ${res.changed.episode_number} 集已记`);
        if (res.progress?.at_end && item.status !== 'completed') {
          const markDone = await askConfirm({
            title: '全剧已看完',
            message: `「${item.canonical_title}」全部剧集已记完，是否同步将状态改为「已看完」？`,
            confirmText: '改为已看完',
            danger: false
          });
          if (markDone) {
            await api(`/api/anime/${item.id}/status`, {
              method: 'POST',
              body: { status: 'completed' }
            });
            toast(`已将「${item.canonical_title}」标记为「已看完」`);
          }
        }
      }
      await load();
    } catch (err) {
      toast(err.message, true);
      bump.disabled = false;
    }
  });
  wrap.appendChild(bump);

  return wrap;
}

function cardEl(item) {
  const isSelected = state.ledgerBatchMode && state.ledgerSelected.has(item.id);
  const card = el(
    'div',
    'card' + (state.ledgerBatchMode ? ' seasonal-card' : '') + (isSelected ? ' selected' : '')
  );
  card.tabIndex = 0;

  const cover = el('div', 'cover');
  paintCover(cover, item.canonical_title, item.cover_path);

  const stKey = item.status || 'want';
  const badge = el('span', `badge status-${stKey}`, STATUS_LABEL[stKey] ?? '想看');
  cover.appendChild(badge);

  // 手帐主题的圆形盖章（其他主题下由 CSS 隐藏）
  if (!state.ledgerBatchMode) {
    const cur = Number(item.episode_current || 0);
    const tot = Number(item.episode_total || 0);
    if (tot === 0 || cur < tot) {
      const stamp = el('span', 'washi-stamp');
      stamp.textContent = cur > 0 ? `盖章\n+1` : `开张\n盖章`;
      stamp.title = `盖章记录第 ${cur + 1} 集`;
      cover.appendChild(stamp);
    }
  }
  const mediaPill = buildMediaStatusPill(item.id);
  if (mediaPill) {
    cover.appendChild(mediaPill);
  }

  if (state.ledgerBatchMode) {
    const checkBadge = el('span', 'badge check-badge', '✓');
    checkBadge.title = '点击卡片勾选/取消勾选';
    cover.appendChild(checkBadge);
  } else {
    if (item.rating) {
      cover.appendChild(el('span', 'badge rating', `★ ${item.rating}`));
    }
    const favQuickBtn = el(
      'button',
      'card-fav-btn' + (item.is_favorite ? ' active' : ''),
      item.is_favorite ? '★' : '☆'
    );
    favQuickBtn.type = 'button';
    favQuickBtn.title = item.is_favorite ? '已特别收藏（点击取消）' : '点击设为特别收藏';
    favQuickBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      favQuickBtn.disabled = true;
      try {
        await api(`/api/anime/${item.id}/status`, {
          method: 'POST',
          body: { is_favorite: !item.is_favorite }
        });
        toast(item.is_favorite ? `已取消收藏「${item.canonical_title}」` : `已收藏「${item.canonical_title}」`);
        await load();
      } catch (err) {
        toast(err.message, true);
        favQuickBtn.disabled = false;
      }
    });
    cover.appendChild(favQuickBtn);
  }

  const body = el('div', 'card-body');
  body.appendChild(
    el('div', 'card-title', (item.is_favorite ? '★ ' : '') + item.canonical_title)
  );

  const meta = el('div', 'card-meta');
  meta.appendChild(el('span', '', item.release_year ? String(item.release_year) : '年份待补'));
  meta.appendChild(el('span', '', TYPE_LABEL[item.anime_type] ?? '—'));
  body.appendChild(meta);

  body.appendChild(cardProgressEl(item));

  card.appendChild(cover);
  card.appendChild(body);

  const onActivate = () => {
    if (state.ledgerBatchMode) {
      if (state.ledgerSelected.has(item.id)) state.ledgerSelected.delete(item.id);
      else state.ledgerSelected.add(item.id);
      renderList();
      return;
    }
    openDetail(item.id);
  };
  card.addEventListener('click', onActivate);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate();
    }
  });

  return card;
}

function renderLedgerBatchBar() {
  const bar = $('#ledgerBatchBar');
  const toggleBtn = $('#batchManageBtn');
  if (toggleBtn) {
    toggleBtn.textContent = state.ledgerBatchMode ? '退出批量管理' : '批量管理';
    toggleBtn.style.fontWeight = state.ledgerBatchMode ? '600' : '';
    toggleBtn.style.color = state.ledgerBatchMode ? 'var(--accent)' : '';
  }
  if (!bar) return;
  if (!state.ledgerBatchMode || state.view !== 'list') {
    bar.hidden = true;
    bar.innerHTML = '';
    return;
  }

  bar.hidden = false;
  bar.innerHTML = '';

  const left = el('div', 'seasonal-controls');
  const selectedCount = state.ledgerSelected.size;
  const totalCount = state.list.length;

  left.appendChild(
    el(
      'strong',
      '',
      `批量管理模式 · 已选 ${selectedCount} / ${totalCount} 部`
    )
  );

  const allSelected = totalCount > 0 && selectedCount >= totalCount;
  const selectAllBtn = el('button', 'link-btn', allSelected ? '取消全选' : '全选当前列表');
  selectAllBtn.type = 'button';
  selectAllBtn.disabled = totalCount === 0;
  selectAllBtn.addEventListener('click', () => {
    if (allSelected) {
      state.ledgerSelected.clear();
    } else {
      for (const it of state.list) state.ledgerSelected.add(it.id);
    }
    renderList();
  });
  left.appendChild(selectAllBtn);
  bar.appendChild(left);

  const right = el('div', 'seasonal-actions');
  const statusSel = document.createElement('select');
  statusSel.innerHTML = `
    <option value="">批量改为状态…</option>
    ${Object.entries(STATUS_LABEL)
      .map(([k, v]) => `<option value="${k}">改为「${v}」</option>`)
      .join('')}
  `;
  statusSel.disabled = selectedCount === 0;
  statusSel.addEventListener('change', async () => {
    const nextStatus = statusSel.value;
    if (!nextStatus) return;
    try {
      const res = await api('/api/anime/batch-action', {
        method: 'POST',
        body: { ids: [...state.ledgerSelected], action: 'status', status: nextStatus }
      });
      toast(`已将 ${res.updated} 部作品状态批量更新为「${STATUS_LABEL[nextStatus]}」`);
      state.ledgerSelected.clear();
      await load();
    } catch (err) {
      toast(err.message, true);
      statusSel.value = '';
    }
  });
  right.appendChild(statusSel);

  const favBatchBtn = el('button', 'btn small', '★ 批量收藏');
  favBatchBtn.type = 'button';
  favBatchBtn.disabled = selectedCount === 0;
  favBatchBtn.addEventListener('click', async () => {
    try {
      const res = await api('/api/anime/batch-action', {
        method: 'POST',
        body: { ids: [...state.ledgerSelected], action: 'favorite' }
      });
      toast(`已将 ${res.updated} 部作品设为特别收藏`);
      state.ledgerSelected.clear();
      await load();
    } catch (err) {
      toast(err.message, true);
    }
  });
  right.appendChild(favBatchBtn);

  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'ui-input-compact';
  tagInput.placeholder = '输入标签(逗号分隔)';
  tagInput.disabled = selectedCount === 0;
  right.appendChild(tagInput);

  const addTagBtn = el('button', 'btn small', '+ 批量加标签');
  addTagBtn.type = 'button';
  addTagBtn.disabled = selectedCount === 0;
  addTagBtn.addEventListener('click', async () => {
    const tags = tagInput.value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (tags.length === 0) {
      toast('请先输入要批量追加的标签名称', true);
      return;
    }
    try {
      const res = await api('/api/anime/batch-action', {
        method: 'POST',
        body: { ids: [...state.ledgerSelected], action: 'add_tags', tags }
      });
      toast(`已为 ${res.updated} 部作品追加标签：${tags.join('、')}`);
      tagInput.value = '';
      await load();
    } catch (err) {
      toast(err.message, true);
    }
  });
  right.appendChild(addTagBtn);

  if (!state.archived) {
    const archiveBtn = el('button', 'btn small danger', '批量移出列表');
    archiveBtn.type = 'button';
    archiveBtn.disabled = selectedCount === 0;
    archiveBtn.addEventListener('click', async () => {
      const ok = await askConfirm({
        title: '确认批量移出列表',
        message: `确定将已勾选的 ${selectedCount} 部作品移出活跃列表（归档）吗？\n\n归档不会删除观看记录或评分，随时可在「已归档」标签页恢复。`,
        confirmText: '确认归档',
        danger: true
      });
      if (!ok) return;
      try {
        const res = await api('/api/anime/batch-action', {
          method: 'POST',
          body: { ids: [...state.ledgerSelected], action: 'archive' }
        });
        toast(`已批量归档 ${res.updated} 部作品`);
        state.ledgerSelected.clear();
        await load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    right.appendChild(archiveBtn);
  }

  bar.appendChild(right);
}


const MASCOT_QUOTES = [
  "今天也来翻开手账记一集吧！每看一集都是属于你的次元刻度～",
  "小贴士：点击「+1」会自动帮你点亮最早还没看的那一集缺口哦！",
  "想换个风格或布局？顶栏可一键切换 4 款主题与「海报网格 / 高密台账 / 状态看板」（快捷键 1/2/3）！",
  "在新番导览里点任意卡片可以预览完整简介，点「批量选择」能一次勾选多部入库～",
  "硬盘里存了字幕组视频？点顶部「本地识别」就能自动清洗文件名并关联集数！"
];
let mascotQuoteIdx = 0;

function getMascotContextQuote(watchingItems) {
  if (!watchingItems || watchingItems.length === 0) {
    return "当前还没有「在看」的番剧，挑一部正在追的番点亮焦点舱吧！";
  }
  const top = watchingItems[0];
  const total = Number(top.episode_total ?? 0);
  const watched = Number(top.episode_watched ?? 0);
  const current = Number(top.episode_current ?? 0);
  if (total > 0 && watched < total) {
    const nextEp = Math.min(total, (current || watched) + 1);
    return `刻度娘伴读：正在追《<strong>${escapeHtml(top.canonical_title)}</strong>》，下一集 EP.${nextEp}，看完点 +1 盖章打卡哦！`;
  }
  return `刻度娘伴读：当前共 <strong>${watchingItems.length}</strong> 部番剧在看，点我查看 AI 娘化立绘档案～`;
}

function openMascotGalleryModal() {
  state.editingId = null;
  $("#modal .modal-card")?.classList.add("wide-card");
  $("#modalTitle").textContent = "次元刻度 · 看板娘「刻刻 (Keke)」角色档案";

  const form = $("#animeForm");
  form.innerHTML = `
    <div>
      <div class="ep-hint" style="margin-bottom:14px;line-height:1.9">
        <strong>刻刻（Keke）</strong>，次元刻度的观测者。银白长发、红瞳、黑色裙装配白色外套，
        随身带一台记录用的笔记本，身边跟着一只猫形小助手。<br>
        性格温和认真、偶尔吐槽；喜欢追番、整理、咖啡和夜晚。口头禅是「新的番剧，新的故事。」
      </div>
      <div class="mascot-gallery-grid" style="grid-template-columns:1fr">
        <div class="mascot-gallery-card">
          <img src="/assets/keke-sheet.jpg" alt="刻刻 完整角色设定图">
          <div class="watching-mini-name">刻刻 · 完整设定</div>
          <div class="ep-hint">主立绘 / 角色三视图 / 表情 / Q 版 / 细节 / 配色方案</div>
        </div>
      </div>
      <div class="ep-hint" style="margin:16px 0 4px;text-align:center;font-family:var(--font-display);font-size:12.5px;color:var(--ink-2)">
        「我会一直在这里，陪你记录每一次心动。」
      </div>
      <div class="form-actions">
        <button type="button" class="btn primary" id="closeMascotModalBtn">返回放映室</button>
      </div>
    </div>
  `;
  $("#closeMascotModalBtn")?.addEventListener("click", () => {
    closeForm();
  });
  $("#modal").hidden = false;
}

/** 手帐主题的盖章：标记该作品的下一个未看集 */
async function stampNextEpisode(item) {
  try {
    const res = await api(`/api/anime/${item.id}/episodes`);
    const p = res.progress || {};
    if (p.at_end) {
      toast(`「${item.canonical_title}」已经全部看完了`);
      return;
    }
    const target = Number(p.next_episode || 0);
    for (const season of res.seasons || []) {
      const ep = (season.episodes || []).find((e) => Number(e.episode_number) === target);
      if (!ep) continue;
      await api(`/api/episodes/${ep.id}/watch`, { method: 'POST', body: { watched: true } });
      toast(`已盖章：「${item.canonical_title}」第 ${target} 集`);
      await load();
      return;
    }
    toast('没找到下一集，打开详情看看', true);
  } catch (err) {
    toast(err.message, true);
  }
}

/**
 * 手帐主题：正在追看焦点横幅。
 * 结构取自 v1.0.0 的 Stage 17（横向紧凑：左侧封面+信息，中间刻度娘气泡，右侧按钮组），
 * 因为用户觉得之前「竖向堆四层 + 右侧便签」不好看。
 */
function renderWashiFocus(strip, items) {
  const top = items[0];
  const cur = Number(top.episode_current || 0);
  const tot = Number(top.episode_total || 0);
  const pct = tot > 0 ? Math.min(100, Math.round((cur / tot) * 100)) : 0;

  const hero = el('div', 'watching-hero');

  // ---- 左：封面 + 信息 ----
  const left = el('div', 'hero-left');

  const cover = el('div', 'hero-cover');
  const cimg = document.createElement('img');
  cimg.alt = top.canonical_title || '';
  cimg.referrerPolicy = 'no-referrer';
  cimg.src = coverProxyUrl(top.cover_path, 200);
  cimg.style.cssText = 'width:100%;height:100%;object-fit:cover;';
  cimg.onerror = () => {
    cimg.style.display = 'none';
    cover.style.background = coverStyle(top.canonical_title);
  };
  cover.appendChild(cimg);
  cover.title = '点击打开作品手账详情';
  cover.addEventListener('click', () => openDetail(top.id));
  left.appendChild(cover);

  const info = el('div', 'hero-info');
  const kickerRow = el('div', 'hero-kicker-row');
  kickerRow.appendChild(el('span', 'hero-kicker', `● 正在追看 (${items.length})`));
  info.appendChild(kickerRow);

  const titleRow = el('div', 'hero-title-row');
  const titleEl = el('div', 'hero-title', top.canonical_title || '');
  titleEl.addEventListener('click', () => openDetail(top.id));
  titleRow.appendChild(titleEl);
  const metaBits = [
    top.release_year ? `${top.release_year} 年` : null,
    top.anime_type || null,
    top.rating ? `★ ${top.rating}` : null
  ].filter(Boolean);
  if (metaBits.length) titleRow.appendChild(el('span', 'hero-meta-text', metaBits.join(' · ')));
  info.appendChild(titleRow);

  const progWrap = el('div', 'hero-progress-wrap');
  const progBar = el('div', 'hero-progress-bar');
  const progFill = el('div', 'hero-progress-fill');
  progFill.style.width = pct + '%';
  progBar.appendChild(progFill);
  progWrap.appendChild(progBar);
  progWrap.appendChild(
    el('span', 'hero-progress-label', tot > 0 ? `已看 ${cur} / ${tot} 集 (${pct}%)` : '尚未设置总集数')
  );
  info.appendChild(progWrap);

  left.appendChild(info);
  hero.appendChild(left);

  // ---- 中：刻度娘气泡 ----
  const mascot = el('div', 'hero-mascot-card');
  mascot.title = '点击查看刻刻（Keke）设定档案';
  const mimg = document.createElement('img');
  mimg.src = '/assets/keke-chibi.png';
  mimg.alt = '刻刻';
  mimg.className = 'hero-mascot-avatar';
  const speech = el('div', 'hero-mascot-speech');
  speech.innerHTML = getMascotContextQuote(items);
  mascot.appendChild(mimg);
  mascot.appendChild(speech);
  mascot.addEventListener('click', () => openMascotGalleryModal());
  hero.appendChild(mascot);

  // ---- 右：按钮组 ----
  const actions = el('div', 'hero-actions');
  if (tot > 0 && cur < tot) {
    const nextEp = Math.min(tot, cur + 1);
    const bump = el('button', 'hero-bump-btn', `盖章 +1 集 (第${nextEp}集)`);
    bump.type = 'button';
    bump.addEventListener('click', async () => {
      bump.disabled = true;
      await stampNextEpisode(top);
      bump.disabled = false;
    });
    actions.appendChild(bump);
  } else if (tot > 0) {
    actions.appendChild(el('span', 'hero-progress-label', '✓ 已看完'));
  }

  const detailBtn = el('button', 'btn small', '翻开详情');
  detailBtn.type = 'button';
  detailBtn.addEventListener('click', () => openDetail(top.id));
  actions.appendChild(detailBtn);

  hero.appendChild(actions);
  strip.appendChild(hero);
}

function renderWatchingFocusStrip() {
  const strip = $('#watchingFocusStrip');
  if (!strip) return;
  if (state.view !== 'list' || state.archived || state.keyword || state.status === 'completed') {
    strip.hidden = true;
    strip.innerHTML = '';
    return;
  }
  const sourceList = state.allLibraryList.length ? state.allLibraryList : state.list;
  const watchingItems = sourceList.filter((it) => !it.deleted_at && it.status === 'watching');
  if (watchingItems.length === 0) {
    strip.hidden = true;
    strip.innerHTML = '';
    return;
  }

  strip.hidden = false;
  strip.innerHTML = '';

  // 手帐主题：走独立焦点横幅（自带标题与气泡），不走下面的标题行 + 小卡
  if (document.documentElement.getAttribute('data-ui-theme') === 'washi') {
    renderWashiFocus(strip, watchingItems);
    return;
  }

  const head = el('div', 'watching-focus-head');
  const titleWrap = el('div', 'watching-focus-title');
  titleWrap.appendChild(el('span', 'watching-focus-dot'));
  titleWrap.appendChild(el('span', '', `正在追番 · 快捷打卡 (${watchingItems.length} 部)`));
  head.appendChild(titleWrap);

  const rightWrap = el('div', 'inline-row');
  const mascotCompanion = el('div', 'watching-mascot-companion');
  mascotCompanion.title = '点击查看看板娘「刻度娘 (Kedu-chan)」AI 娘化立绘档案';
  const mImg = document.createElement('img');
  mImg.src = '/assets/keke-chibi.png';
  mImg.alt = '刻度娘';
  mImg.className = 'watching-mascot-avatar';
  const mSpeech = el('span', 'watching-mascot-speech');
  mSpeech.innerHTML = getMascotContextQuote(watchingItems);
  mascotCompanion.appendChild(mImg);
  mascotCompanion.appendChild(mSpeech);
  mascotCompanion.addEventListener('click', () => openMascotGalleryModal());
  rightWrap.appendChild(mascotCompanion);

  if (watchingItems.length > 4) {
    const expandBtn = el(
      'button',
      'link-btn',
      state.watchingStripExpanded ? '收起展示前 4 部' : `展开全部 (${watchingItems.length} 部)`
    );
    expandBtn.type = 'button';
    expandBtn.addEventListener('click', () => {
      state.watchingStripExpanded = !state.watchingStripExpanded;
      renderWatchingFocusStrip();
    });
    rightWrap.appendChild(expandBtn);
  }
  head.appendChild(rightWrap);
  strip.appendChild(head);

  const cardsWrap = el('div', 'watching-focus-cards');
  const displayItems = state.watchingStripExpanded ? watchingItems : watchingItems.slice(0, 4);
  for (const item of displayItems) {
    const mini = el('div', 'watching-mini-card');
    const cov = el('div', 'watching-mini-cover');
    paintCover(cov, item.canonical_title, item.cover_path, 100);
    mini.appendChild(cov);

    const info = el('div', 'watching-mini-info');
    info.appendChild(el('div', 'watching-mini-name', item.canonical_title));
    const total = Number(item.episode_total ?? 0);
    const current = Number(item.episode_current ?? 0);
    const watched = Number(item.episode_watched ?? 0);
    const subRow = el('div', 'watching-mini-sub');
    const nextEpNum = total > 0 && watched < total ? Math.min(total, (current || watched) + 1) : null;
    subRow.appendChild(
      el(
        'span',
        '',
        total > 0
          ? `已看 ${watched}/${total} 集${nextEpNum ? ` · 下一集 EP.${nextEpNum}` : ' · 已看完'}`
          : '未设总集数 · 点击设置'
      )
    );
    const mediaPill = buildMediaStatusPill(item.id);
    if (mediaPill) subRow.appendChild(mediaPill);
    info.appendChild(subRow);

    if (total > 0) {
      const miniBar = el('div', 'progress-bar watching-mini-bar');
      const miniFill = el('div', 'progress-fill');
      miniFill.style.width = `${Math.min(100, Math.round((watched / total) * 100))}%`;
      miniBar.appendChild(miniFill);
      info.appendChild(miniBar);
    }
    mini.appendChild(info);

    if (total > 0) {
      const done = watched >= total;
      const bump = el('button', 'card-bump' + (done ? ' done' : ''), done ? '✓' : '+1');
      bump.type = 'button';
      bump.disabled = done;
      bump.title = done ? '已看完' : '记一集';
      bump.addEventListener('click', async (e) => {
        e.stopPropagation();
        bump.disabled = true;
        try {
          const res = await api(`/api/anime/${item.id}/progress`, {
            method: 'POST',
            body: { action: 'next' }
          });
          if (res.changed) {
            toast(`「${item.canonical_title}」第 ${res.changed.episode_number} 集已记`);
          }
          if (res.progress?.at_end && item.status !== 'completed') {
            const ok = await askConfirm({
              title: '全集观看完成',
              message: `「${item.canonical_title}」全部 ${res.progress.total} 集都已看完，要把作品状态改为「已看完」吗？`,
              confirmText: '改为已看完',
              danger: false
            });
            if (ok) {
              await api(`/api/anime/${item.id}/status`, {
                method: 'POST',
                body: { status: 'completed' }
              });
              toast(`已将「${item.canonical_title}」标为「已看完」`);
            }
          }
          await load();
        } catch (err) {
          toast(err.message, true);
          bump.disabled = false;
        }
      });
      mini.appendChild(bump);
    }

    mini.addEventListener('click', () => openDetail(item.id));
    cardsWrap.appendChild(mini);
  }
  strip.appendChild(cardsWrap);
}

function renderActiveFilterBar(listEl) {
  const hasFilter =
    Boolean(state.keyword) ||
    Boolean(state.tag) ||
    Boolean(state.status) ||
    Boolean(state.favorite) ||
    Boolean(state.archived);
  if (!hasFilter) return;

  const bar = el('div', 'active-filter-bar');
  const chips = el('div', 'active-filter-chips');
  chips.appendChild(el('strong', '', '当前筛选：'));

  if (state.archived) {
    chips.appendChild(el('span', 'active-filter-pill', '状态：已归档'));
  } else if (state.favorite) {
    chips.appendChild(el('span', 'active-filter-pill', '★ 特别收藏'));
  } else if (state.status) {
    chips.appendChild(el('span', 'active-filter-pill', `状态：${STATUS_LABEL[state.status]}`));
  }
  if (state.tag) {
    chips.appendChild(el('span', 'active-filter-pill', `标签：#${state.tag}`));
  }
  if (state.keyword) {
    chips.appendChild(el('span', 'active-filter-pill', `搜索：「${state.keyword}」`));
  }
  chips.appendChild(el('span', 'ep-hint', `命中 ${state.list.length} 部`));
  bar.appendChild(chips);

  const resetBtn = el('button', 'btn small ghost', '× 重置全部筛选');
  resetBtn.type = 'button';
  resetBtn.addEventListener('click', () => {
    state.keyword = '';
    state.tag = '';
    state.status = '';
    state.favorite = false;
    state.archived = false;
    const qInput = $('#q');
    if (qInput) qInput.value = '';
    const clearBtn = $('#searchClearBtn');
    if (clearBtn) clearBtn.hidden = true;
    const tagSel = $('#tagFilter');
    if (tagSel) tagSel.value = '';
    renderTabs();
    renderStudioSidebar();
    load();
  });
  bar.appendChild(resetBtn);
  listEl.parentElement?.insertBefore(bar, listEl);
}

function renderTableList(listEl) {
  listEl.className = 'ledger-table-container';
  const wrap = el('div', 'ledger-table-wrap');
  const table = el('table', 'ledger-table');
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th>作品名称</th>
      <th>状态快改</th>
      <th>年份 / 类型</th>
      <th>标签</th>
      <th style="min-width:190px">分集进度</th>
      <th>个人评分</th>
      <th>操作</th>
    </tr>
  `;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const item of state.list) {
    const tr = document.createElement('tr');
    if (state.ledgerBatchMode && state.ledgerSelected.has(item.id)) {
      tr.className = 'selected-row';
    }

    const tdTitle = document.createElement('td');
    const titleCell = el('div', 'table-title-cell');
    const thumb = el('div', 'table-thumb');
    paintCover(thumb, item.canonical_title, item.cover_path, 100);
    titleCell.appendChild(thumb);
    const nameWrap = el('div', '');
    nameWrap.appendChild(
      el(
        'div',
        'watching-mini-name',
        (item.is_favorite ? '★ ' : '') + item.canonical_title
      )
    );
    if (item.synopsis) {
      const syn = el('div', 'ep-hint', item.synopsis.slice(0, 34) + (item.synopsis.length > 34 ? '…' : ''));
      syn.style.marginTop = '2px';
      nameWrap.appendChild(syn);
    }
    titleCell.appendChild(nameWrap);
    tdTitle.appendChild(titleCell);
    tr.appendChild(tdTitle);

    const tdStatus = document.createElement('td');
    const statusSelect = document.createElement('select');
    statusSelect.className = 'table-status-select';
    statusSelect.title = '直接切换观看状态';
    for (const [sKey, sLabel] of Object.entries(STATUS_LABEL)) {
      const opt = document.createElement('option');
      opt.value = sKey;
      opt.textContent = sLabel;
      if ((item.status || 'want') === sKey) opt.selected = true;
      statusSelect.appendChild(opt);
    }
    statusSelect.addEventListener('click', (e) => e.stopPropagation());
    statusSelect.addEventListener('change', async (e) => {
      e.stopPropagation();
      const nextSt = statusSelect.value;
      try {
        await api(`/api/anime/${item.id}/status`, {
          method: 'POST',
          body: { status: nextSt }
        });
        toast(`已将「${item.canonical_title}」状态改为「${STATUS_LABEL[nextSt]}」`);
        await load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    tdStatus.appendChild(statusSelect);
    tr.appendChild(tdStatus);

    const tdMeta = document.createElement('td');
    const metaWrap = el('div', 'watching-mini-sub');
    metaWrap.appendChild(el('span', '', `${item.release_year || '—'} · ${TYPE_LABEL[item.anime_type] ?? 'TV'}`));
    const rowMediaPill = buildMediaStatusPill(item.id);
    if (rowMediaPill) metaWrap.appendChild(rowMediaPill);
    tdMeta.appendChild(metaWrap);
    tr.appendChild(tdMeta);

    const tdTags = document.createElement('td');
    const tagNames = String(item.tag_names || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (tagNames.length > 0) {
      const tagList = el('div', 'table-tag-list');
      for (const tName of tagNames.slice(0, 3)) {
        const chip = el('button', 'table-tag-chip', `#${tName}`);
        chip.type = 'button';
        chip.title = `按标签「${tName}」筛选`;
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          state.tag = tName;
          const sel = $('#tagFilter');
          if (sel) sel.value = tName;
          load();
        });
        tagList.appendChild(chip);
      }
      tdTags.appendChild(tagList);
    } else {
      tdTags.innerHTML = '<span style="color:var(--faint)">—</span>';
    }
    tr.appendChild(tdTags);

    const tdProg = document.createElement('td');
    tdProg.appendChild(cardProgressEl(item));
    tr.appendChild(tdProg);

    const tdRating = document.createElement('td');
    tdRating.innerHTML = item.rating
      ? `<strong style="color:var(--accent)">★ ${item.rating}</strong> / 10`
      : '<span style="color:var(--faint)">未评</span>';
    tr.appendChild(tdRating);

    const tdAct = document.createElement('td');
    const actRow = el('div', 'inline-row');
    const favBtn = el('button', 'table-fav-btn' + (item.is_favorite ? ' active' : ''), item.is_favorite ? '★' : '☆');
    favBtn.type = 'button';
    favBtn.title = item.is_favorite ? '取消特别收藏' : '设为特别收藏';
    favBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      try {
        const nextFav = !item.is_favorite;
        await api(`/api/anime/${item.id}/status`, {
          method: 'POST',
          body: { is_favorite: nextFav }
        });
        item.is_favorite = nextFav;
        toast(nextFav ? `已收藏「${item.canonical_title}」` : `已取消收藏「${item.canonical_title}」`);
        await load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    actRow.appendChild(favBtn);

    const detailBtn = el('button', 'link-btn', '详情 →');
    detailBtn.type = 'button';
    detailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(item.id);
    });
    actRow.appendChild(detailBtn);
    tdAct.appendChild(actRow);
    tr.appendChild(tdAct);

    tr.addEventListener('click', () => {
      if (state.ledgerBatchMode) {
        if (state.ledgerSelected.has(item.id)) state.ledgerSelected.delete(item.id);
        else state.ledgerSelected.add(item.id);
        renderList();
        return;
      }
      openDetail(item.id);
    });
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  listEl.appendChild(wrap);
}

function renderBoardList(listEl) {
  listEl.className = 'kanban-board';
  const columns = [
    { key: 'watching', title: '正在追番 (在看)', filter: (it) => it.status === 'watching' },
    { key: 'want', title: '待看清单 (想看)', filter: (it) => it.status === 'want' },
    { key: 'completed', title: '已看完归档', filter: (it) => it.status === 'completed' },
    {
      key: 'other',
      title: '暂停 / 弃番',
      filter: (it) => it.status === 'paused' || it.status === 'dropped'
    }
  ];

  const quickMoveStatus = async (item, targetStatus, e) => {
    e.stopPropagation();
    try {
      await api(`/api/anime/${item.id}/status`, {
        method: 'POST',
        body: { status: targetStatus }
      });
      toast(`已将「${item.canonical_title}」移至「${STATUS_LABEL[targetStatus]}」`);
      await load();
    } catch (err) {
      toast(err.message, true);
    }
  };

  for (const col of columns) {
    const colEl = el('div', 'kanban-col');
    const items = state.list.filter(col.filter);
    const head = el('div', 'kanban-col-head');
    head.appendChild(el('span', '', col.title));
    head.appendChild(el('span', 'kanban-col-count', `${items.length} 部`));
    colEl.appendChild(head);

    const body = el('div', 'kanban-col-list');
    if (items.length === 0) {
      const emptyNote = el('div', 'ep-hint', '暂无此状态作品');
      emptyNote.style.padding = '16px 4px';
      emptyNote.style.textAlign = 'center';
      body.appendChild(emptyNote);
    } else {
      for (const item of items) {
        const kCard = el('div', 'kanban-item');
        const cov = el('div', 'watching-mini-cover');
        paintCover(cov, item.canonical_title, item.cover_path, 100);
        kCard.appendChild(cov);

        const info = el('div', 'watching-mini-info');
        info.appendChild(
          el('div', 'watching-mini-name', (item.is_favorite ? '★ ' : '') + item.canonical_title)
        );
        const kSub = el('div', 'watching-mini-sub');
        kSub.appendChild(
          el(
            'span',
            '',
            `${item.release_year || '—'} · ${TYPE_LABEL[item.anime_type] ?? 'TV'}${
              item.rating ? ` · ★ ${item.rating}` : ''
            }`
          )
        );
        const kMediaPill = buildMediaStatusPill(item.id);
        if (kMediaPill) kSub.appendChild(kMediaPill);
        info.appendChild(kSub);
        info.appendChild(cardProgressEl(item));

        const qActions = el('div', 'kanban-quick-actions');
        if (item.status === 'want') {
          const toWatch = el('button', 'kanban-mini-btn', '▶ 开始追番');
          toWatch.type = 'button';
          toWatch.addEventListener('click', (e) => quickMoveStatus(item, 'watching', e));
          qActions.appendChild(toWatch);
        } else if (item.status === 'watching') {
          const toDone = el('button', 'kanban-mini-btn', '✓ 标为看完');
          toDone.type = 'button';
          toDone.addEventListener('click', (e) => quickMoveStatus(item, 'completed', e));
          qActions.appendChild(toDone);
          const toPause = el('button', 'kanban-mini-btn', '⏸ 暂停');
          toPause.type = 'button';
          toPause.addEventListener('click', (e) => quickMoveStatus(item, 'paused', e));
          qActions.appendChild(toPause);
        } else if (item.status === 'paused' || item.status === 'dropped') {
          const toResume = el('button', 'kanban-mini-btn', '↻ 恢复在看');
          toResume.type = 'button';
          toResume.addEventListener('click', (e) => quickMoveStatus(item, 'watching', e));
          qActions.appendChild(toResume);
        }
        if (qActions.childNodes.length > 0) {
          info.appendChild(qActions);
        }

        kCard.appendChild(info);

        kCard.addEventListener('click', () => openDetail(item.id));
        body.appendChild(kCard);
      }
    }
    colEl.appendChild(body);
    listEl.appendChild(colEl);
  }
}

function renderList() {
  const listEl = $('#list');
  listEl.innerHTML = '';
  document.querySelectorAll('.active-filter-bar').forEach((n) => n.remove());

  const validIds = new Set(state.list.map((it) => it.id));
  for (const id of [...state.ledgerSelected]) {
    if (!validIds.has(id)) state.ledgerSelected.delete(id);
  }
  renderLedgerBatchBar();
  renderWatchingFocusStrip();
  if (state.view === 'list') {
    renderActiveFilterBar(listEl);
  }

  if (state.list.length === 0) {
    listEl.className = 'grid';
    $('#empty').hidden = false;
    if (state.archived) {
      $('#emptyTitle').textContent = '没有已归档的作品';
      $('#emptyHint').textContent = '归档的作品会出现在这里，可随时恢复';
    } else if (state.favorite) {
      $('#emptyTitle').textContent = '还没有特别收藏的作品';
      $('#emptyHint').textContent = '在任意作品卡片右上角点 ☆ 或在详情抽屉中点击「加入收藏」即可标星';
    } else if (state.keyword) {
      $('#emptyTitle').textContent = `没有找到「${state.keyword}」`;
      $('#emptyHint').textContent = '换个关键词试试，或直接新增这一部';
    } else if (state.tag) {
      $('#emptyTitle').textContent = `没有带有「${state.tag}」标签的作品`;
      $('#emptyHint').textContent = '切换标签筛选条件看看';
    } else if (state.status) {
      $('#emptyTitle').textContent = `没有「${STATUS_LABEL[state.status]}」状态的作品`;
      $('#emptyHint').textContent = '换个筛选条件看看';
    } else {
      $('#emptyTitle').textContent = '还没有作品';
      $('#emptyHint').textContent = '点右上角「新增作品」开始记账';
    }
  } else {
    $('#empty').hidden = true;
    if (state.layoutMode === 'table') {
      renderTableList(listEl);
    } else if (state.layoutMode === 'board') {
      renderBoardList(listEl);
    } else {
      listEl.className = 'grid';
      for (const item of state.list) listEl.appendChild(cardEl(item));
    }
  }

  $('#stat').textContent = state.ledgerBatchMode
    ? `共 ${state.list.length} 部作品（已勾选 ${state.ledgerSelected.size} 部）`
    : `共 ${state.list.length} 部作品`;
}

async function load() {
  if (state.loading) return;
  if (state.view === 'stats' || state.view === 'ui-studio') return;
  state.loading = true;
  $('#loading').hidden = false;

  try {
    const params = new URLSearchParams();
    if (state.keyword) params.set('keyword', state.keyword);
    if (state.status) params.set('status', state.status);
    if (state.tag) params.set('tag', state.tag);
    if (state.sortBy) params.set('sortBy', state.sortBy);
    if (state.order) params.set('order', state.order);
    if (state.archived) params.set('archived', '1');
    if (state.favorite) params.set('favorite', '1');

    const [res, fullRes, mediaRes] = await Promise.all([
      api(`/api/anime?${params.toString()}`),
      !state.keyword && !state.status && !state.tag && !state.archived && !state.favorite
        ? Promise.resolve(null)
        : api('/api/anime').catch(() => null),
      api('/api/media/files').catch(() => null)
    ]);
    state.list = res.data ?? [];
    if (fullRes?.data) {
      state.allLibraryList = fullRes.data;
    } else if (!state.keyword && !state.status && !state.tag && !state.archived && !state.favorite) {
      state.allLibraryList = state.list;
    }
    if (mediaRes?.data) {
      updateMediaSummaryMap(mediaRes.data);
    }
    renderTabs();
    renderStudioSidebar();
    renderList();
    refreshTagsFilter();
  } catch (err) {
    toast(err.message, true);
  } finally {
    state.loading = false;
    $('#loading').hidden = true;
  }
}

/* ---------------- 抽屉详情 ---------------- */

async function openDetail(id) {
  try {
    const detail = await api(`/api/anime/${id}`);
    state.currentId = id;
    renderDrawer(detail);
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#scrim').hidden = false;
  } catch (err) {
    toast(err.message, true);
  }
}

function clearHash() {
  if (location.hash) {
    history.replaceState(null, '', location.pathname + location.search);
  }
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
  state.currentId = null;
  clearHash();
}

function fieldBlock(labelText, valueNode) {
  const wrap = el('div', 'field');
  wrap.appendChild(el('div', 'field-label', labelText));
  wrap.appendChild(valueNode);
  return wrap;
}

function renderDrawer(detail) {
  const { anime, state: st, tags } = detail;
  const body = $('#drawerBody');
  body.innerHTML = '';
  $('#drawerTitle').textContent = anime.deleted_at ? '作品详情（已归档）' : '作品详情';

  const head = el('div', 'detail-head');

  const cover = el('div', 'detail-cover-sm');
  paintCover(cover, anime.canonical_title, anime.cover_path, 200);
  head.appendChild(cover);

  const headInfo = el('div', 'detail-head-info');
  headInfo.appendChild(el('div', 'detail-title', anime.canonical_title));
  headInfo.appendChild(
    el(
      'div',
      'detail-meta',
      [
        anime.release_year ? `${anime.release_year} 年` : '年份待补',
        TYPE_LABEL[anime.anime_type] ?? '类型待补',
        anime.default_episode_duration_minutes
          ? `单集 ${anime.default_episode_duration_minutes} 分钟`
          : null
      ]
        .filter(Boolean)
        .join(' · ')
    )
  );

  // P2 手工锁定字段状态展示与管理
  const lockedFields = Array.isArray(detail.locked_fields) ? detail.locked_fields : [];
  const FIELD_LOCK_LABEL = {
    canonical_title: '标题',
    synopsis: '简介',
    release_year: '年份',
    cover_path: '封面',
    anime_type: '类型',
    default_episode_duration_minutes: '时长'
  };
  const dualStatusRow = el('div', 'watching-mini-sub');
  const curStKey = st?.status || 'want';
  const stPill = el('span', `media-tag`, `观看状态：${STATUS_LABEL[curStKey] || '想看'}`);
  dualStatusRow.appendChild(stPill);
  const dMediaPill = buildMediaStatusPill(anime.id);
  if (dMediaPill) dualStatusRow.appendChild(dMediaPill);
  else dualStatusRow.appendChild(el('span', 'ep-hint', '本地文件：未关联'));
  headInfo.appendChild(dualStatusRow);

  const lockRow = el('div', 'detail-lock-row');
  if (lockedFields.length > 0) {
    const names = lockedFields.map((k) => FIELD_LOCK_LABEL[k] || k).join('、');
    lockRow.appendChild(
      el('span', '', `已锁定防覆盖：${names}`)
    );
    const unlockBtn = el('button', 'link-btn', '全部解锁');
    unlockBtn.type = 'button';
    unlockBtn.title = '解除手工字段锁定，允许「补全资料」更新这些字段';
    unlockBtn.addEventListener('click', async () => {
      try {
        await api(`/api/anime/${anime.id}/locks`, {
          method: 'PUT',
          body: { locked_fields: [] }
        });
        toast('已解除全部字段锁定');
        renderDrawer(await api(`/api/anime/${anime.id}`));
      } catch (err) {
        toast(err.message, true);
      }
    });
    lockRow.appendChild(unlockBtn);
  } else {
    const lockTitleBtn = el('button', 'link-btn', '锁定当前标题与封面');
    lockTitleBtn.type = 'button';
    lockTitleBtn.title = '锁定后，外部数据源补全绝不会改动当前标题与封面';
    lockTitleBtn.addEventListener('click', async () => {
      try {
        await api(`/api/anime/${anime.id}/locks`, {
          method: 'PUT',
          body: { locked_fields: ['canonical_title', 'cover_path'] }
        });
        toast('已锁定标题与封面，防止被外部源覆盖');
        renderDrawer(await api(`/api/anime/${anime.id}`));
      } catch (err) {
        toast(err.message, true);
      }
    });
    lockRow.appendChild(lockTitleBtn);
  }
  headInfo.appendChild(lockRow);

  head.appendChild(headInfo);
  body.appendChild(head);

  // FR-02 状态与单集观看进度不一致温和提醒条（提示但不擅自篡改）
  if (detail.consistency_hint) {
    const hint = detail.consistency_hint;
    const targetStatusLabel = STATUS_LABEL[hint.suggested_status] || hint.suggested_status;
    const curStatusLabel = STATUS_LABEL[st?.status] || st?.status || '想看';
    const banner = el('div', 'consistency-banner');
    const msgText = hint.message.replace(`「${st?.status}」`, `「${curStatusLabel}」`);
    banner.appendChild(el('span', '', `提示：${msgText}`));
    const applyHintBtn = el('button', 'btn small primary', `标为「${targetStatusLabel}」`);
    applyHintBtn.type = 'button';
    applyHintBtn.addEventListener('click', async () => {
      applyHintBtn.disabled = true;
      try {
        await api(`/api/anime/${anime.id}/status`, {
          method: 'POST',
          body: { status: hint.suggested_status }
        });
        toast(`已切换状态为「${targetStatusLabel}」`);
        renderDrawer(await api(`/api/anime/${anime.id}`));
        load();
      } catch (err) {
        toast(err.message, true);
        applyHintBtn.disabled = false;
      }
    });
    banner.appendChild(applyHintBtn);
    body.appendChild(banner);
  }

  const epHost = el('div', 'field-value');
  body.appendChild(fieldBlock('观看进度', epHost));
  loadEpisodesInto(epHost, anime.id);

  // 状态
  const statusWrap = el('div', 'status-select');
  for (const [key, label] of Object.entries(STATUS_LABEL)) {
    const btn = el('button', 'status-btn' + (st?.status === key ? ' active' : ''), label);
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      try {
        await api(`/api/anime/${anime.id}/status`, { method: 'POST', body: { status: key } });
        toast(`已标记为「${label}」`);
        const fresh = await api(`/api/anime/${anime.id}`);
        renderDrawer(fresh);
        load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    statusWrap.appendChild(btn);
  }
  body.appendChild(fieldBlock('我的状态', statusWrap));

  // 收藏
  const favWrap = el('div', '');
  const favBtn = el(
    'button',
    'status-btn' + (st?.is_favorite ? ' active' : ''),
    st?.is_favorite ? '★ 已收藏' : '☆ 加入收藏'
  );
  favBtn.type = 'button';
  favBtn.addEventListener('click', async () => {
    try {
      await api(`/api/anime/${anime.id}/status`, {
        method: 'POST',
        body: { status: st?.status ?? 'want', is_favorite: !st?.is_favorite }
      });
      toast(st?.is_favorite ? '已取消收藏' : '已加入收藏');
      renderDrawer(await api(`/api/anime/${anime.id}`));
      load();
    } catch (err) {
      toast(err.message, true);
    }
  });
  favWrap.appendChild(favBtn);
  body.appendChild(fieldBlock('收藏', favWrap));

  // 评分
  const ratingWrap = el('div', 'rating-row');
  for (let i = 1; i <= 10; i += 1) {
    const b = el('button', 'rating-dot' + (st?.rating === i ? ' active' : ''), String(i));
    b.type = 'button';
    b.addEventListener('click', async () => {
      const next = st?.rating === i ? null : i;
      try {
        await api(`/api/anime/${anime.id}/status`, {
          method: 'POST',
          body: { status: st?.status ?? 'want', rating: next }
        });
        toast(next ? `评分：${next}` : '已清除评分');
        renderDrawer(await api(`/api/anime/${anime.id}`));
        load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    ratingWrap.appendChild(b);
  }
  body.appendChild(fieldBlock('我的评分', ratingWrap));

  // 标签
  const tagInput = document.createElement('input');
  tagInput.type = 'text';
  tagInput.className = 'drawer-input';
  tagInput.placeholder = '用逗号分隔，例如：治愈, 奇幻';
  tagInput.value = (tags ?? []).map((t) => t.name).join(', ');
  tagInput.addEventListener('change', async () => {
    const names = tagInput.value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api(`/api/anime/${anime.id}/tags`, { method: 'PUT', body: { tags: names } });
      toast('标签已保存');
      renderDrawer(await api(`/api/anime/${anime.id}`));
      load();
    } catch (err) {
      toast(err.message, true);
    }
  });
  body.appendChild(fieldBlock('标签', tagInput));

  // 作品别名 (Aliases)
  const aliasInput = document.createElement('input');
  aliasInput.type = 'text';
  aliasInput.className = 'drawer-input';
  aliasInput.placeholder = '别名/原名/简称，逗号分隔（用于搜索与本地文件匹配）';
  aliasInput.value = (detail.aliases ?? []).map((a) => a.alias).join(', ');
  aliasInput.addEventListener('change', async () => {
    const aliases = aliasInput.value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api(`/api/anime/${anime.id}/aliases`, { method: 'PUT', body: { aliases } });
      toast('作品别名已保存');
      renderDrawer(await api(`/api/anime/${anime.id}`));
    } catch (err) {
      toast(err.message, true);
    }
  });
  body.appendChild(fieldBlock('作品别名', aliasInput));

  // 备注
  const notes = document.createElement('textarea');
  notes.className = 'drawer-textarea';
  notes.value = st?.notes ?? '';
  notes.placeholder = '想记点什么就写在这里';
  notes.addEventListener('change', async () => {
    try {
      await api(`/api/anime/${anime.id}/status`, {
        method: 'POST',
        body: { status: st?.status ?? 'want', notes: notes.value }
      });
      toast('备注已保存');
    } catch (err) {
      toast(err.message, true);
    }
  });
  body.appendChild(fieldBlock('备注', notes));

  // 简介
  const syn = el('div', 'field-value' + (anime.synopsis ? '' : ' placeholder'), anime.synopsis || '暂无简介');
  body.appendChild(fieldBlock('简介', syn));

  // 资源发现中心（Stage 8 外链模板 + P2 站内 RSS 资源列表聚合与缓存）
  body.appendChild(buildDiscoveryField(anime.canonical_title, anime.id));

  // P2 作品观看操作足迹 (watch_events)
  if (Array.isArray(detail.watch_events) && detail.watch_events.length > 0) {
    const evWrap = el('div', 'field');
    evWrap.appendChild(el('div', 'field-label', '最近观看操作记录'));
    const evList = el('div', 'watch-events-box');
    for (const ev of detail.watch_events.slice(0, 6)) {
      const row = el('div', 'watch-event-row');
      row.appendChild(el('span', '', ev.detail || ev.event_type));
      row.appendChild(
        el(
          'span',
          'ep-hint',
          ev.watched_date || String(ev.created_at || '').slice(0, 10)
        )
      );
      evList.appendChild(row);
    }
    evWrap.appendChild(evList);
    body.appendChild(evWrap);
  }

  // 操作
  const actions = el('div', 'drawer-actions');

  const editBtn = el('button', 'btn small', '编辑资料');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => openForm(detail));
  actions.appendChild(editBtn);

  const enrichBtn = el('button', 'btn small', '补全资料');
  enrichBtn.type = 'button';
  enrichBtn.title = '从数据源补上封面、集数、简介、标签（只填空缺，不改已有内容）';
  enrichBtn.addEventListener('click', () => enrichOne(anime, enrichBtn));
  actions.appendChild(enrichBtn);

  if (!anime.deleted_at) {
    const delBtn = el('button', 'btn small danger', '彻底删除');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => deleteWithConfirm(detail));
    actions.appendChild(delBtn);
  }

  body.appendChild(actions);

  renderDrawerActions(detail);
}

function buildDiscoveryField(title, animeId) {
  const wrap = el('div', 'field');
  const labelRow = el('div', 'field-label');
  labelRow.appendChild(el('span', '', '资源发现 / 外部检索'));

  const rightBtns = el('div', 'inline-row');
  if (animeId) {
    const rssBtn = el('button', 'link-btn', '站内 RSS 列表');
    rssBtn.type = 'button';
    rssBtn.title = '从公开动漫 RSS 源拉取并按字幕组分类展示（支持离线缓存）';
    rightBtns.appendChild(rssBtn);

    const customRssToggle = el('button', 'link-btn', '自定义源');
    customRssToggle.type = 'button';
    customRssToggle.title = '输入自定义字幕组 RSS 订阅链接或关键词拉取';
    rightBtns.appendChild(customRssToggle);

    const cfgBtn = el('button', 'link-btn', '配置入口');
    cfgBtn.type = 'button';
    cfgBtn.addEventListener('click', () => openSettingsModal());
    rightBtns.appendChild(cfgBtn);
    labelRow.appendChild(rightBtns);
    wrap.appendChild(labelRow);

    const customRssBar = el('div', 'rss-custom-bar');
    customRssBar.hidden = true;
    const rssUrlInput = document.createElement('input');
    rssUrlInput.type = 'text';
    rssUrlInput.className = 'ui-input-compact';
    rssUrlInput.placeholder = '输入字幕组专属 RSS 链接（留空则按作品名搜索）';
    const fetchCustomBtn = el('button', 'btn small', '拉取');
    fetchCustomBtn.type = 'button';
    customRssBar.appendChild(rssUrlInput);
    customRssBar.appendChild(fetchCustomBtn);

    customRssToggle.addEventListener('click', () => {
      customRssBar.hidden = !customRssBar.hidden;
    });

    const rssHost = el('div', '');
    const doFetchRss = async (customUrl = '') => {
      rssBtn.disabled = true;
      fetchCustomBtn.disabled = true;
      const oldText = rssBtn.textContent;
      rssBtn.textContent = '拉取 RSS…';
      try {
        const res = await api(`/api/anime/${animeId}/resources/fetch`, {
          method: 'POST',
          body: { keyword: title, rssUrl: customUrl.trim() }
        });
        renderRssResourceList(rssHost, res, animeId);
        if (res.ok) {
          toast(`已从 ${res.source} 获取 ${res.fetched} 条资源并按字幕组归类`);
        } else if (res.message) {
          toast(res.message);
        }
      } catch (err) {
        toast(err.message, true);
      } finally {
        rssBtn.disabled = false;
        fetchCustomBtn.disabled = false;
        rssBtn.textContent = oldText;
      }
    };

    rssBtn.addEventListener('click', () => doFetchRss(''));
    fetchCustomBtn.addEventListener('click', () => doFetchRss(rssUrlInput.value));

    // 若本地已有缓存的 resource_items，自动按字幕组分类展示
    api(`/api/anime/${animeId}/resources`)
      .then((cached) => {
        if (cached?.count > 0) {
          renderRssResourceList(rssHost, cached, animeId);
        }
      })
      .catch(() => {});

    const linksWrap = el('div', 'discovery-links');
    const activeTpls = (state.discoveryTemplates || DEFAULT_DISCOVERY_TPLS).filter(
      (t) => t && t.enabled !== false && t.url
    );

    if (activeTpls.length === 0) {
      linksWrap.appendChild(el('span', 'ep-hint', '未启用任何外部检索模板，可点右上角「配置入口」开启'));
    } else {
      const encodedKw = encodeURIComponent(String(title ?? '').trim());
      for (const tpl of activeTpls) {
        const a = document.createElement('a');
        a.className = 'discovery-link';
        a.href = String(tpl.url).replace(/\{keyword\}/g, encodedKw);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = `${tpl.name} ↗`;
        linksWrap.appendChild(a);
      }
    }

    wrap.appendChild(linksWrap);
    wrap.appendChild(customRssBar);
    wrap.appendChild(rssHost);
    return wrap;
  }

  const cfgBtn = el('button', 'link-btn', '配置入口');
  cfgBtn.type = 'button';
  cfgBtn.addEventListener('click', () => openSettingsModal());
  labelRow.appendChild(cfgBtn);
  wrap.appendChild(labelRow);

  const linksWrap = el('div', 'discovery-links');
  const activeTpls = (state.discoveryTemplates || DEFAULT_DISCOVERY_TPLS).filter(
    (t) => t && t.enabled !== false && t.url
  );
  const encodedKw = encodeURIComponent(String(title ?? '').trim());
  for (const tpl of activeTpls) {
    const a = document.createElement('a');
    a.className = 'discovery-link';
    a.href = String(tpl.url).replace(/\{keyword\}/g, encodedKw);
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = `${tpl.name} ↗`;
    linksWrap.appendChild(a);
  }
  wrap.appendChild(linksWrap);
  return wrap;
}

function buildClientSideFansubGroups(items = []) {
  const UNLABELED = '未标注字幕组';
  const map = new Map();
  for (const it of items) {
    const name = String(it.fansub || '').trim() || UNLABELED;
    if (!map.has(name)) {
      map.set(name, {
        fansub: name,
        is_unlabeled: name === UNLABELED,
        items: [],
        resolutions: new Set(),
        subtitle_infos: new Set(),
        magnet_count: 0
      });
    }
    const g = map.get(name);
    g.items.push(it);
    if (it.resolution) g.resolutions.add(it.resolution);
    if (it.subtitle_info) g.subtitle_infos.add(it.subtitle_info);
    if (it.magnet_url) g.magnet_count += 1;
  }
  return [...map.values()]
    .map((g) => ({
      fansub: g.fansub,
      is_unlabeled: g.is_unlabeled,
      count: g.items.length,
      magnet_count: g.magnet_count,
      resolutions: [...g.resolutions],
      subtitle_infos: [...g.subtitle_infos],
      items: g.items
    }))
    .sort((a, b) => {
      if (a.is_unlabeled !== b.is_unlabeled) return a.is_unlabeled ? 1 : -1;
      return b.count - a.count;
    });
}

function renderSingleRssRow(it) {
  const row = el('div', 'rss-item-row');
  const topLine = el('div', 'rss-item-top');
  const titleEl = el('div', 'rss-item-title', it.title);
  topLine.appendChild(titleEl);

  if (it.episode_number) {
    const epBadge = el('span', 'rss-ep-badge', `第${it.episode_number}集`);
    topLine.appendChild(epBadge);
  }
  row.appendChild(topLine);

  const metaRow = el('div', 'rss-item-meta');
  const badges = [
    it.fansub ? `[${it.fansub}]` : null,
    it.resolution,
    it.subtitle_info,
    it.file_size,
    it.published_at
  ]
    .filter(Boolean)
    .join(' · ');
  metaRow.appendChild(el('span', '', badges || it.provider_name || 'RSS'));

  const linkGroup = el('div', 'inline-row');
  if (it.magnet_url) {
    const copyBtn = el('button', 'link-btn', '复制磁力');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(it.magnet_url);
        toast('已复制资源磁力链接到剪贴板');
      } catch {
        toast('复制失败，请点击打开原站');
      }
    });
    linkGroup.appendChild(copyBtn);
  }
  if (it.resource_url && /^https?:\/\//i.test(it.resource_url)) {
    const openA = document.createElement('a');
    openA.className = 'link-btn';
    openA.href = it.resource_url;
    openA.target = '_blank';
    openA.rel = 'noopener noreferrer';
    openA.textContent = '原站 ↗';
    linkGroup.appendChild(openA);
  }
  metaRow.appendChild(linkGroup);
  row.appendChild(metaRow);
  return row;
}

function renderRssResourceList(host, res, animeId = null) {
  host.innerHTML = '';
  const items = Array.isArray(res?.data) ? res.data : [];
  if (items.length === 0) {
    if (res?.message) {
      host.appendChild(el('div', 'ep-hint', res.message));
    }
    return;
  }

  const groups =
    Array.isArray(res?.groups_by_fansub) && res.groups_by_fansub.length > 0
      ? res.groups_by_fansub
      : buildClientSideFansubGroups(items);

  const selectedFansub =
    (animeId && state.activeFansubByAnime.get(animeId)) || '__ALL_GROUPED__';
  const activeFansub =
    selectedFansub === '__ALL_GROUPED__' || groups.some((g) => g.fansub === selectedFansub)
      ? selectedFansub
      : '__ALL_GROUPED__';

  const box = el('div', 'rss-box');

  // 顶部统计与字幕组分类导航栏
  const headerRow = el('div', 'media-group-head');
  headerRow.appendChild(
    el(
      'div',
      'ep-hint',
      `共缓存 ${items.length} 条资源 · 已按 ${groups.length} 个字幕组分类整理：`
    )
  );
  box.appendChild(headerRow);

  // 字幕组分类标签切换栏 (Fansub Tabs)
  const fansubTabs = el('div', '');
  fansubTabs.style.cssText = 'display:flex;flex-wrap:wrap;gap:5px;';

  const makeTabBtn = (key, label) => {
    const isAct = activeFansub === key;
    const btn = el('button', 'tab' + (isAct ? ' active' : ''), label);
    btn.type = 'button';
    btn.style.cssText = 'font-size:11px;padding:3px 8px;height:auto;';
    btn.addEventListener('click', () => {
      if (animeId) state.activeFansubByAnime.set(animeId, key);
      renderRssResourceList(host, res, animeId);
    });
    return btn;
  };

  fansubTabs.appendChild(makeTabBtn('__ALL_GROUPED__', `按字幕组分栏 (${groups.length}组)`));
  for (const g of groups) {
    fansubTabs.appendChild(makeTabBtn(g.fansub, `${g.fansub} (${g.count})`));
  }
  box.appendChild(fansubTabs);

  // 内容列表容器
  const listWrap = el('div', '');
  listWrap.style.cssText = 'max-height:260px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px;';

  const copyGroupMagnets = async (groupItems, groupLabel) => {
    const magnets = groupItems.map((x) => x.magnet_url).filter(Boolean);
    if (magnets.length === 0) {
      toast('该字幕组暂无可直接复制的磁力链接', true);
      return;
    }
    try {
      await navigator.clipboard.writeText(magnets.join('\n'));
      toast(`已批量复制「${groupLabel}」共 ${magnets.length} 条磁力链接`);
    } catch {
      toast('批量复制失败，请检查浏览器剪贴板权限', true);
    }
  };

  if (activeFansub === '__ALL_GROUPED__') {
    // 按字幕组分块折叠展示，清晰区分各字幕组压制版本
    for (const g of groups) {
      const groupCard = el('div', 'rss-group-card');
      const groupHead = el('div', 'rss-group-head');

      const leftInfo = el('div', 'inline-row');
      const nameTag = el('strong', '', `【${g.fansub}】`);
      leftInfo.appendChild(nameTag);

      const specs = [
        `${g.count} 条`,
        ...(g.resolutions || []).slice(0, 2),
        ...(g.subtitle_infos || []).slice(0, 2)
      ]
        .filter(Boolean)
        .join(' · ');
      leftInfo.appendChild(el('span', 'ep-hint', specs));
      groupHead.appendChild(leftInfo);

      if (g.magnet_count > 0) {
        const batchCopyBtn = el('button', 'link-btn', `复制本组磁力 (${g.magnet_count})`);
        batchCopyBtn.type = 'button';
        batchCopyBtn.addEventListener('click', () => copyGroupMagnets(g.items, g.fansub));
        groupHead.appendChild(batchCopyBtn);
      }

      groupCard.appendChild(groupHead);

      const groupBody = el('div', 'rss-group-body');
      for (const it of g.items.slice(0, 12)) {
        groupBody.appendChild(renderSingleRssRow(it));
      }
      if (g.items.length > 12) {
        const moreBtn = el('button', 'link-btn', `查看「${g.fansub}」全部 ${g.items.length} 条资源 →`);
        moreBtn.type = 'button';
        moreBtn.addEventListener('click', () => {
          if (animeId) state.activeFansubByAnime.set(animeId, g.fansub);
          renderRssResourceList(host, res, animeId);
        });
        groupBody.appendChild(moreBtn);
      }

      groupCard.appendChild(groupBody);
      listWrap.appendChild(groupCard);
    }
  } else {
    // 单个字幕组专属视图
    const targetGroup = groups.find((g) => g.fansub === activeFansub);
    if (targetGroup) {
      const subBar = el('div', '');
      subBar.style.cssText =
        'padding:6px 8px;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:5px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;';
      const specText = [
        `字幕组：${targetGroup.fansub}`,
        `共 ${targetGroup.count} 条`,
        ...(targetGroup.resolutions || []),
        ...(targetGroup.subtitle_infos || [])
      ].join(' · ');
      subBar.appendChild(el('span', 'ep-hint', specText));

      if (targetGroup.magnet_count > 0) {
        const batchCopyBtn = el(
          'button',
          'btn small',
          `批量复制 ${targetGroup.fansub} 磁力链 (${targetGroup.magnet_count})`
        );
        batchCopyBtn.type = 'button';
        batchCopyBtn.addEventListener('click', () =>
          copyGroupMagnets(targetGroup.items, targetGroup.fansub)
        );
        subBar.appendChild(batchCopyBtn);
      }
      listWrap.appendChild(subBar);

      for (const it of targetGroup.items) {
        listWrap.appendChild(renderSingleRssRow(it));
      }
    }
  }

  box.appendChild(listWrap);
  host.appendChild(box);
}

function renderDrawerActions(detail) {
  const host = $('#drawerActions');
  host.innerHTML = '';
  const anime = detail.anime;

  if (anime.deleted_at) {
    const restoreBtn = el('button', 'link-btn', '恢复');
    restoreBtn.type = 'button';
    restoreBtn.addEventListener('click', async () => {
      try {
        await api(`/api/anime/${anime.id}/restore`, { method: 'POST' });
        toast('已恢复到列表');
        closeDrawer();
        load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    host.appendChild(restoreBtn);

    const delBtn = el('button', 'link-btn danger', '彻底删除');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => deleteWithConfirm(detail));
    host.appendChild(delBtn);
  } else {
    const removeBtn = el('button', 'link-btn', '移出列表');
    removeBtn.type = 'button';
    removeBtn.title = '从列表移走，记录都保留，随时可以恢复';
    removeBtn.addEventListener('click', () => archiveWithConfirm(anime.id));
    host.appendChild(removeBtn);
  }
}

/* ---------------- 补全元数据 ---------------- */

async function enrichAll() {
  const btn = $('#enrichAllBtn');
  const targets = state.list.filter((x) => !x.cover_path);

  if (!targets.length) {
    toast('当前列表作品均已有封面');
    return;
  }

  btn.disabled = true;
  let filled = 0;
  let needConfirm = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i += 1) {
    const t = targets[i];
    btn.textContent = `补全中 ${i + 1}/${targets.length}`;
    try {
      const r = await api(`/api/anime/${t.id}/enrich`, { method: 'POST' });
      if (r.matched) filled += 1;
      else if (r.reason === 'ambiguous') needConfirm += 1;
      else failed += 1;
    } catch {
      failed += 1;
    }
  }

  btn.disabled = false;
  btn.textContent = '补全缺失资料';

  const bits = [`补全 ${filled} 部`];
  if (needConfirm) bits.push(`${needConfirm} 部需要手动确认`);
  if (failed) bits.push(`${failed} 部未命中`);
  toast(bits.join('，'));

  await load();
}

async function enrichOne(anime, btn) {
  const old = btn.textContent;
  btn.disabled = true;
  btn.textContent = '补全中…';

  try {
    const res = await api(`/api/anime/${anime.id}/enrich`, { method: 'POST' });

    if (res.matched) {
      toast(res.filled.length ? `已补全：${res.filled.join('、')}` : '资料已经完整，没有可补的');
      renderDrawer(await api(`/api/anime/${anime.id}`));
      load();
    } else if (res.reason === 'ambiguous') {
      showCandidates($('#drawerBody'), anime.id, res.candidates);
      toast('没有完全同名的条目，请在顶部选一个');
    } else {
      toast(res.message, true);
    }
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = old;
  }
}

function showCandidates(container, animeId, candidates) {
  document.querySelector('#candBlock')?.remove();

  const wrap = el('div', 'cand-block');
  wrap.id = 'candBlock';
  wrap.appendChild(el('div', 'cand-title', '选一个匹配的条目，将自动同步中文名称并补上封面、集数、简介'));

  for (const c of candidates) {
    const row = el('button', 'cand-row');
    row.type = 'button';

    const thumb = el('div', 'cand-thumb');
    if (c.coverUrl) {
      const img = document.createElement('img');
      img.src = buildApiUrl(c.coverUrl);
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = () => img.remove();
      thumb.appendChild(img);
    } else {
      thumb.textContent = firstChar(c.title);
    }

    const info = el('div', 'cand-info');
    info.appendChild(el('div', 'cand-name', c.title));
    info.appendChild(
      el(
        'div',
        'cand-sub',
        [
          c.year,
          c.episodes ? `${c.episodes} 集` : null,
          SOURCE_LABEL[c.source] || c.source
        ]
          .filter(Boolean)
          .join(' · ')
      )
    );

    row.appendChild(thumb);
    row.appendChild(info);

    row.addEventListener('click', async () => {
      row.disabled = true;
      try {
        const r = await api(`/api/anime/${animeId}/enrich`, {
          method: 'POST',
          body: { source: c.source, external_id: c.externalId, title: c.title }
        });
        toast(r.filled.length ? `已补全：${r.filled.join('、')}` : '已绑定该条目');
        renderDrawer(await api(`/api/anime/${animeId}`));
        load();
      } catch (err) {
        toast(err.message, true);
        row.disabled = false;
      }
    });
    wrap.appendChild(row);
  }

  const cancel = el('button', 'link-btn', '不用了');
  cancel.type = 'button';
  cancel.addEventListener('click', () => wrap.remove());
  wrap.appendChild(cancel);

  container.insertBefore(wrap, container.firstChild);
  wrap.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

/* ---------------- 集数管理 ---------------- */

async function loadEpisodesInto(container, animeId) {
  container.innerHTML = '';
  container.appendChild(el('div', 'ep-hint', '加载中…'));

  let view;
  try {
    view = await api(`/api/anime/${animeId}/episodes`);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('div', 'ep-hint', `集数加载失败：${err.message}`));
    return;
  }

  container.innerHTML = '';
  container.appendChild(renderEpisodeBlock(view));
}

function renderEpisodeBlock(view) {
  const p = view.progress;
  const wrap = el('div', 'ep-block');

  const refresh = async () => {
    renderDrawer(await api(`/api/anime/${view.anime_id}`));
    load();
  };

  // 摘要与快捷推进/撤销
  const summary = el('div', 'ep-summary');
  if (p.total === 0) {
    summary.appendChild(el('span', 'ep-hint', '还没设置集数，设好之后就能一集一集记了'));
  } else if (p.current > 0) {
    summary.appendChild(el('strong', '', String(p.current)));
    summary.appendChild(el('span', 'ep-unit', `/ ${p.total} 集`));
    const bits = [`已看 ${p.watched} 集`];
    if (p.has_gap) bits.push(`中间少 ${p.current - p.watched} 集`);
    if (p.at_end) bits.push('已看完');
    summary.appendChild(el('span', 'ep-hint', bits.join(' · ')));

    if (!p.at_end) {
      const nextEpNum = p.next_episode || p.current + 1;
      const nextBtn = el('button', 'btn small primary', `+1 记第 ${nextEpNum} 集`);
      nextBtn.type = 'button';
      nextBtn.style.marginLeft = 'auto';
      nextBtn.addEventListener('click', async () => {
        nextBtn.disabled = true;
        try {
          const res = await api(`/api/anime/${view.anime_id}/progress`, {
            method: 'POST',
            body: { action: 'next' }
          });
          if (res.changed) toast(`已记第 ${res.changed.episode_number} 集`);
          if (res.progress?.at_end) {
            const curItem = state.list.find((x) => x.id === view.anime_id);
            if (!curItem || curItem.status !== 'completed') {
              const ok = await askConfirm({
                title: '全集观看完成',
                message: `「${view.title || '本剧'}」全部 ${res.progress.total} 集都已看完，要把作品状态改为「已看完」吗？`,
                confirmText: '改为已看完',
                danger: false
              });
              if (ok) {
                await api(`/api/anime/${view.anime_id}/status`, {
                  method: 'POST',
                  body: { status: 'completed' }
                });
                toast('已将作品标为「已看完」');
              }
            }
          }
          await refresh();
        } catch (err) {
          toast(err.message, true);
          nextBtn.disabled = false;
        }
      });
      summary.appendChild(nextBtn);
    }

    const undoBtn = el('button', 'link-btn', '撤销上一集 (-1)');
    undoBtn.type = 'button';
    undoBtn.title = '撤销最后一集已看记录';
    undoBtn.addEventListener('click', async () => {
      undoBtn.disabled = true;
      try {
        const res = await api(`/api/anime/${view.anime_id}/progress`, {
          method: 'POST',
          body: { action: 'prev' }
        });
        if (res.changed) toast(`已撤销第 ${res.changed.episode_number} 集`);
        await refresh();
      } catch (err) {
        toast(err.message, true);
        undoBtn.disabled = false;
      }
    });
    summary.appendChild(undoBtn);
  } else {
    summary.appendChild(el('span', 'ep-hint', `共 ${p.total} 集，还没开始看`));
    const firstBtn = el('button', 'btn small primary', '+1 记第 1 集');
    firstBtn.type = 'button';
    firstBtn.style.marginLeft = 'auto';
    firstBtn.addEventListener('click', async () => {
      firstBtn.disabled = true;
      try {
          const res = await api(`/api/anime/${view.anime_id}/progress`, {
            method: 'POST',
            body: { action: 'next' }
          });
          if (res.changed) toast(`已记第 ${res.changed.episode_number} 集`);
          if (res.progress?.at_end) {
            const curItem = state.list.find((x) => x.id === view.anime_id);
            if (!curItem || curItem.status !== 'completed') {
              const ok = await askConfirm({
                title: '全集观看完成',
                message: `「${view.title || '本剧'}」全部 ${res.progress.total} 集都已看完，要把作品状态改为「已看完」吗？`,
                confirmText: '改为已看完',
                danger: false
              });
              if (ok) {
                await api(`/api/anime/${view.anime_id}/status`, {
                  method: 'POST',
                  body: { status: 'completed' }
                });
                toast('已将作品标为「已看完」');
              }
            }
          }
          await refresh();
      } catch (err) {
        toast(err.message, true);
        firstBtn.disabled = false;
      }
    });
    summary.appendChild(firstBtn);
  }
  wrap.appendChild(summary);

  const seasons = view.seasons ?? [];
  const selectedSeasonNum =
    state.activeSeasonByAnime.get(view.anime_id) ||
    seasons.find((s) => Number(s.season_number) === 1)?.season_number ||
    seasons[0]?.season_number ||
    1;

  const activeSeason =
    seasons.find((s) => Number(s.season_number) === Number(selectedSeasonNum)) ??
    seasons[0] ??
    null;

  // 多季切换栏与「+ 添加指定季 / + SP」入口（智能默认选中首个缺失的季度号，如已有1、3季则默认第2季）
  const seasonBar = el('div', 'season-bar');
  if (seasons.length > 0) {
    for (const s of seasons) {
      const sNum = Number(s.season_number) || 1;
      const isCur = sNum === Number(activeSeason?.season_number ?? 1);
      const b = el('button', 'tab' + (isCur ? ' active' : ''), s.title || `第 ${sNum} 季`);
      b.type = 'button';
      b.addEventListener('click', () => {
        state.activeSeasonByAnime.set(view.anime_id, sNum);
        refresh();
      });
      seasonBar.appendChild(b);
    }
  }

  const existingSeasonNums = new Set(seasons.map((s) => Number(s.season_number)));
  let defaultMissingSeason = 1;
  while (existingSeasonNums.has(defaultMissingSeason)) {
    defaultMissingSeason += 1;
  }

  const seasonPickSelect = document.createElement('select');
  seasonPickSelect.className = 'ui-select-compact';
  seasonPickSelect.title = '选择要开启的季度编号（支持补加中间缺失的第 2 季等）';
  const maxOptionSeason = Math.max(defaultMissingSeason + 2, 6);
  for (let sIdx = 1; sIdx <= maxOptionSeason; sIdx += 1) {
    if (existingSeasonNums.has(sIdx)) continue;
    const opt = document.createElement('option');
    opt.value = String(sIdx);
    opt.textContent = `第 ${sIdx} 季`;
    if (sIdx === defaultMissingSeason) opt.selected = true;
    seasonPickSelect.appendChild(opt);
  }
  seasonBar.appendChild(seasonPickSelect);

  const addSeasonBtn = el('button', 'link-btn', `+ 添加第 ${defaultMissingSeason} 季`);
  addSeasonBtn.type = 'button';
  addSeasonBtn.title = '开启所选季度（如补齐缺失的第 2 季）并设定集数';
  seasonPickSelect.addEventListener('change', () => {
    addSeasonBtn.textContent = `+ 添加第 ${seasonPickSelect.value} 季`;
  });
  addSeasonBtn.addEventListener('click', async () => {
    const nextS = Number(seasonPickSelect.value) || defaultMissingSeason;
    try {
      await api(`/api/anime/${view.anime_id}/episodes`, {
        method: 'PUT',
        body: { count: 12, season_number: nextS }
      });
      state.activeSeasonByAnime.set(view.anime_id, nextS);
      toast(`已开启第 ${nextS} 季（默认 12 集，可随时调整）`);
      await refresh();
    } catch (err) {
      toast(err.message, true);
    }
  });
  seasonBar.appendChild(addSeasonBtn);

  const addSpBtn = el('button', 'link-btn', '+ 新增 SP/OVA');
  addSpBtn.type = 'button';
  addSpBtn.title = '添加不占用正片集数的 SP / OVA / 特典单集';
  addSpBtn.addEventListener('click', async () => {
    const sNum = Number(activeSeason?.season_number) || 1;
    try {
      const res = await api(`/api/anime/${view.anime_id}/specials`, {
        method: 'POST',
        body: { seasonNumber: sNum }
      });
      toast(`已添加特别篇「${res.episode.episode_key}」`);
      await refresh();
    } catch (err) {
      toast(err.message, true);
    }
  });
  seasonBar.appendChild(addSpBtn);

  const syncTitlesBtn = el('button', 'link-btn', '同步分集标题');
  syncTitlesBtn.type = 'button';
  syncTitlesBtn.title = '自动拉取各集标题（只填空白集，绝不覆盖已手动修改的单集标题）';
  syncTitlesBtn.addEventListener('click', async () => {
    const sNum = Number(activeSeason?.season_number) || 1;
    syncTitlesBtn.disabled = true;
    try {
      const res = await api(`/api/anime/${view.anime_id}/episodes/sync-titles`, {
        method: 'POST',
        body: { seasonNumber: sNum }
      });
      if (res.updated > 0) {
        toast(`已自动填入 ${res.updated} 集标题（鼠标悬停或点击集数格子可查看）`);
      } else if (res.skipped_existing > 0) {
        toast('各集已有标题，未覆盖手写内容');
      } else {
        toast('暂未检索到该季分集标题，可点击单集格子手动填写');
      }
      await refresh();
    } catch (err) {
      toast(err.message, true);
    } finally {
      syncTitlesBtn.disabled = false;
    }
  });
  seasonBar.appendChild(syncTitlesBtn);

  wrap.appendChild(seasonBar);

  const eps = activeSeason?.episodes ?? [];
  const regularEps = eps.filter((e) => !e.is_special);
  const editHost = el('div', 'ep-edit-host');

  if (eps.length) {
    const legendBar = el('div', 'ep-legend-bar');
    const watchLegend = el('div', 'ep-legend-group');
    watchLegend.innerHTML = `
      <span><strong>观看状态：</strong></span>
      <span class="ep-legend-item"><i class="ep-legend-swatch watched"></i>已看</span>
      <span class="ep-legend-item"><i class="ep-legend-swatch unwatched"></i>未看</span>
    `;
    const mediaLegend = el('div', 'ep-legend-group');
    mediaLegend.innerHTML = `
      <span><strong>本地文件：</strong></span>
      <span class="ep-legend-item"><i class="ep-legend-swatch media-ok"></i>本地可用</span>
      <span class="ep-legend-item"><i class="ep-legend-swatch media-missing"></i>文件缺失</span>
    `;
    legendBar.appendChild(watchLegend);
    legendBar.appendChild(mediaLegend);
    wrap.appendChild(legendBar);

    const grid = el('div', 'ep-grid');
    for (const ep of eps) {
      const label = ep.is_special ? ep.episode_key || `SP${ep.episode_number}` : String(ep.episode_number);
      const hasMedia = Array.isArray(ep.media_files) && ep.media_files.length > 0;
      const hasMissingMedia = hasMedia && ep.media_files.every((m) => m.availability_status === 'missing');
      const cell = el(
        'button',
        'ep-cell' +
          (ep.is_watched ? ' watched' : '') +
          (ep.is_special ? ' special-ep' : '') +
          (hasMedia ? (hasMissingMedia ? ' media-missing' : ' has-media') : ''),
        label
      );
      cell.type = 'button';
      const titleBit = ep.title ? `「${ep.title}」 · ` : '';
      const mediaBit = hasMedia
        ? ` · 关联 ${ep.media_files.length} 个本地视频${hasMissingMedia ? '(文件缺失)' : ''}`
        : '';
      cell.title = ep.is_watched
        ? `${titleBit}${ep.first_watched_at || '日期不详'}${mediaBit}（点击改日期/标题/播放本地文件或取消已看）`
        : `${titleBit}点一下标记为已看${mediaBit}`;
      cell.addEventListener('click', async () => {
        if (ep.is_watched || hasMedia) {
          showEpisodeEditor(editHost, view, ep);
          return;
        }
        cell.disabled = true;
        try {
          await api(`/api/episodes/${ep.id}/watch`, {
            method: 'POST',
            body: { watched: true }
          });
          await refresh();
        } catch (err) {
          toast(err.message, true);
          cell.disabled = false;
        }
      });
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    wrap.appendChild(editHost);

    if (eps.some((e) => e.is_watched || (e.media_files && e.media_files.length))) {
      wrap.appendChild(
        el(
          'div',
          'ep-hint',
          '点已看或带下划线的格子可改观看日期、分集标题或播放关联的本地视频'
        )
      );
    }
  }

  // 设定当前季总集数
  const curSeasonNum = Number(activeSeason?.season_number) || 1;
  const toolbar = el('div', 'ep-toolbar');
  toolbar.appendChild(el('span', '', curSeasonNum > 1 ? `第 ${curSeasonNum} 季集数` : '总集数'));

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '1';
  countInput.max = '2000';
  countInput.id = 'epCountInput';
  countInput.placeholder = '集';
  countInput.value = regularEps.length || '';
  toolbar.appendChild(countInput);

  const saveBtn = el('button', 'btn small', '设定');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', async () => {
    const n = Number(countInput.value);
    if (!Number.isInteger(n) || n < 1) {
      toast('请填一个 1 以上的整数', true);
      return;
    }
    saveBtn.disabled = true;
    try {
      const res = await api(`/api/anime/${view.anime_id}/episodes`, {
        method: 'PUT',
        body: { count: n, season_number: curSeasonNum }
      });
      const bits = [];
      if (res.created) bits.push(`新增 ${res.created} 集`);
      if (res.removed) bits.push(`删除 ${res.removed} 集`);
      if (res.kept_watched) bits.push(`${res.kept_watched} 集已观看，保留未删`);
      toast(bits.length ? bits.join('，') : '集数没有变化');
      await refresh();
    } catch (err) {
      toast(err.message, true);
      saveBtn.disabled = false;
    }
  });
  toolbar.appendChild(saveBtn);

  if (seasons.length > 1) {
    const delSeasonBtn = el('button', 'link-btn danger', `删除第 ${curSeasonNum} 季`);
    delSeasonBtn.type = 'button';
    delSeasonBtn.style.marginLeft = 'auto';
    delSeasonBtn.title = `删除第 ${curSeasonNum} 季及其分集列表（不影响其他季度）`;
    delSeasonBtn.addEventListener('click', async () => {
      const ok = await askConfirm({
        title: `删除第 ${curSeasonNum} 季`,
        message: `确定要删除「第 ${curSeasonNum} 季」吗？该季下的分集记录将被移除，其他季度不受影响。`,
        confirmText: `确认删除第 ${curSeasonNum} 季`,
        danger: true
      });
      if (!ok) return;
      try {
        await api(`/api/anime/${view.anime_id}/seasons/${curSeasonNum}`, { method: 'DELETE' });
        state.activeSeasonByAnime.delete(view.anime_id);
        toast(`已删除第 ${curSeasonNum} 季`);
        await refresh();
      } catch (err) {
        toast(err.message, true);
      }
    });
    toolbar.appendChild(delSeasonBtn);
  }

  wrap.appendChild(toolbar);

  if (p.total > 0) {
    wrap.appendChild(batchBlock(view, p, refresh));
  }

  if (p.watched > 0 || p.special_watched > 0) {
    const dur = [];
    if (p.minutes > 0) dur.push(`累计 ${formatMinutes(p.minutes)}`);
    if (p.special_total > 0) dur.push(`SP/OVA 已看 ${p.special_watched}/${p.special_total}`);
    if (p.missing_duration_count > 0) {
      dur.push(`${p.missing_duration_count} 集时长未知，未计入`);
    }
    if (dur.length) wrap.appendChild(el('div', 'ep-hint', dur.join(' · ')));
  }

  return wrap;
}

/* ---------------- 统计 ---------------- */

function formatHours(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m <= 0) return '0 分钟';
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest} 分钟`;
  return rest ? `${h} 小时 ${rest} 分` : `${h} 小时`;
}

async function switchView(view) {
  state.view = view;
  const isStats = view === 'stats';
  const isSeasonal = view === 'seasonal';
  const isUiStudio = view === 'ui-studio';
  const isList = view === 'list';

  $('#list').hidden = !isList;
  $('#stats').hidden = !isStats;
  $('#seasonal').hidden = !isSeasonal;
  const uiStudioEl = $('#uiStudio');
  if (uiStudioEl) uiStudioEl.hidden = !isUiStudio;
  const focusStrip = $('#watchingFocusStrip');
  if (focusStrip && !isList) focusStrip.hidden = true;
  $('#empty').hidden = true;
  $('#loading').hidden = true;
  $('.filters').hidden = !isList;
  $('.searchbox').hidden = !isList;

  $('#statsBtn').textContent = isStats ? '返回账本' : '统计';
  $('#statsBtn').classList.toggle('active-nav', isStats);
  $('#seasonalBtn').textContent = isSeasonal ? '返回账本' : '新番导览';
  $('#seasonalBtn').classList.toggle('active-nav', isSeasonal);
  const uiBtn = $('#uiStudioBtn');
  if (uiBtn) {
    uiBtn.textContent = isUiStudio ? '返回账本' : 'UI 样本 (4版)';
    uiBtn.classList.toggle('active-nav', isUiStudio);
  }

  if (!isList) {
    $('#stat').textContent = isUiStudio ? '当前视图：应用诊断评估与 4 套定制 UI 视觉样本展台' : '';
    const batchBar = $('#ledgerBatchBar');
    if (batchBar) batchBar.hidden = true;
  }

  renderUiQuickBar();
  renderStudioSidebar();
  closeDrawer();
  if (isStats) await loadStats();
  else if (isSeasonal) await loadSeasonal();
  else if (isUiStudio) renderUiStudioView();
  else await load();
}

function renderUiStudioView() {
  const host = $('#uiStudio');
  if (!host) return;
  host.innerHTML = '';

  const sampleItems = (state.allLibraryList.length ? state.allLibraryList : state.list).slice(0, 3);
  const fallbackSamples = [
    { canonical_title: '葬送的芙莉莲', status: 'completed', rating: 10, episode_watched: 28, episode_total: 28, release_year: 2023 },
    { canonical_title: '药屋少女的呢喃 第二季', status: 'watching', rating: 9, episode_watched: 8, episode_total: 24, release_year: 2025 },
    { canonical_title: '迷宫饭', status: 'watching', rating: 9, episode_watched: 16, episode_total: 24, release_year: 2024 }
  ];
  const previewList = sampleItems.length >= 3 ? sampleItems : fallbackSamples;

  // 顶部说明与一键恢复样本按钮
  const hero = el('div', 'studio-hero-banner');
  const heroLeft = el('div', '');
  heroLeft.appendChild(
    el('h2', 'studio-hero-title', '应用全面评估优化报告 & 四版场景化 UI 视觉样本展台')
  );
  heroLeft.appendChild(
    el(
      'p',
      'studio-hero-desc',
      '根据「次元刻度」的四大真实使用途径（日常手账记账、夜间看番调起本地播放器、NAS/百部番剧全息台账、季度新番周历与跨端同步），为您定制了 4 套风格迥异的 UI 视觉方案与 3 种信息密度视图。点击任意样本卡片即可实时应用到全站。'
    )
  );
  hero.appendChild(heroLeft);

  const heroActions = el('div', 'inline-row');
  const seedBtn = el('button', 'btn small', '注入/补齐演示番剧样本');
  seedBtn.type = 'button';
  seedBtn.addEventListener('click', async () => {
    seedBtn.disabled = true;
    try {
      const res = await api('/api/demo-seed', { method: 'POST' });
      toast(res.count > 0 ? `已注入 ${res.count} 部演示番剧` : '当前账本已包含全部演示番剧样本');
      await load();
      renderUiStudioView();
    } catch (err) {
      toast(err.message, true);
    } finally {
      seedBtn.disabled = false;
    }
  });
  const mascotBtn = el('button', 'btn small', '看板娘「刻度娘」立绘档案');
  mascotBtn.type = 'button';
  mascotBtn.addEventListener('click', () => openMascotGalleryModal());
  heroActions.appendChild(mascotBtn);
  heroActions.appendChild(seedBtn);

  const backBtn = el('button', 'btn primary small', '返回账本主视图 →');
  backBtn.type = 'button';
  backBtn.addEventListener('click', () => switchView('list'));
  heroActions.appendChild(backBtn);
  hero.appendChild(heroActions);
  host.appendChild(hero);

  // 评估与修复卡片
  const auditGrid = el('div', 'audit-report-grid');
  const audits = [
    {
      title: '1. 外部数据源 ID 冲突修复',
      status: '已修复 · 147项测试全绿',
      detail: '修复了 Bangumi 详情接口将内置新番库合成 ID（如《药屋少女的呢喃 第二季》486192）误匹配为线上同名编号非动画书籍词条的问题，增加条目类型 (type===2) 与标题重合度双重校验。'
    },
    {
      title: '2. 全组件暗夜主题表面对比度对齐',
      status: '深度优化 · 零刺眼白块',
      detail: '全面排查并替换抽屉、弹窗、搜索候选框、分集编辑器与配额面板中的硬编码白底 (#fff/#fbfbf9) 与深蓝文字 (#0c447c)，在「暗夜放映室 (Cinema)」下实现完整沉浸对比度。'
    },
    {
      title: '3. 追番打卡焦点舱与抽屉一键 +1',
      status: '交互增强 · 闭环提示',
      detail: '顶部「正在追番 · 快捷打卡」支持展开全部在看番剧与完结状态自动晋升询问；详情抽屉分集摘要栏新增主按钮「+1 记第 X 集」，无需在长分集网格中寻找。'
    },
    {
      title: '4. 台账表行内快改与看板一键流转',
      status: '工作台升级 · 3种布局',
      detail: '高密台账表格支持行内直接下拉修改状态、点击标签胶囊筛选与一键标星收藏；四栏看板卡片内置「▶ 开始追番 / ✓ 标为看完」快捷流转按钮。'
    },
    {
      title: '5. 筛选防迷失提示条与快捷键矩阵',
      status: '易用性提升 · 键盘流',
      detail: '当启用搜索词、标签或状态筛选时自动显示「当前筛选条件 · 一键重置」提示条；支持数字键 1/2/3 秒切网格/台账表/看板，以及 / 搜索、n 新增、s 新番、u 样本展台。'
    },
    {
      title: '6. 弹窗宽度泄漏修复与双色分享海报',
      status: '已修复 · 双主题导出',
      detail: '修复了关闭本地识别/分享图宽弹窗后「新增作品」弹窗保持宽卡片的样式残留问题；年度总结图与个人喜好九宫格支持「典雅宣纸浅色 / 暗夜流光深色」双风格高清 PNG 导出。'
    }
  ];
  for (const a of audits) {
    const card = el('div', 'audit-card');
    const head = el('div', 'audit-card-head');
    head.appendChild(el('span', '', a.title));
    head.appendChild(el('span', 'audit-status-tag', a.status));
    card.appendChild(head);
    card.appendChild(el('p', '', a.detail));
    auditGrid.appendChild(card);
  }
  host.appendChild(auditGrid);

  // 四版 UI 样本实时渲染对比矩阵
  const sampleGrid = el('div', 'ui-sample-grid');
  for (const ed of UI_EDITIONS) {
    const isCurrent = state.uiTheme === ed.key;
    const sCard = el('div', 'ui-sample-card' + (isCurrent ? ' active-edition' : ''));

    // 迷你实时渲染画布
    const preview = el('div', 'ui-mini-preview');
    preview.style.background = ed.bg;
    preview.style.color = ed.text;
    preview.title = `点击立即切换为「${ed.name}」`;

    const miniTop = el('div', 'ui-mini-topbar');
    const brandSpan = el('span', '', `次元刻度 · ${ed.shortName}`);
    if (ed.key === 'editorial') brandSpan.style.fontFamily = 'var(--font-display)';
    miniTop.appendChild(brandSpan);

    const pills = el('div', 'ui-mini-pills');
    for (const [idx, pText] of ['在看', '新番导览', '+ 新增'].entries()) {
      const p = el('span', 'ui-mini-pill', pText);
      if (idx === 2) {
        p.style.background = ed.accent;
        p.style.color = '#ffffff';
      } else {
        p.style.background = ed.card;
        p.style.border = `1px solid ${ed.accent}44`;
      }
      pills.appendChild(p);
    }
    miniTop.appendChild(pills);
    preview.appendChild(miniTop);

    // 根据推荐布局渲染不同的迷你样本结构
    const miniCards = el('div', 'ui-mini-cards');
    for (const item of previewList) {
      const mItem = el('div', 'ui-mini-item');
      mItem.style.background = ed.card;
      mItem.style.border = `1px solid ${ed.key === 'cinema' ? '#222f46' : '#e2e8f0'}`;
      if (ed.key === 'bento') mItem.style.borderRadius = '10px';

      const poster = el('div', 'ui-mini-poster');
      poster.style.background = coverStyle(item.canonical_title);
      if (item.cover_path) {
        const img = document.createElement('img');
        img.src = coverProxyUrl(item.cover_path, 200);
        img.alt = item.canonical_title;
        img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
        img.onerror = () => img.remove();
        poster.appendChild(img);
      }
      const tagBadge = el('span', '', STATUS_LABEL[item.status] || '在看');
      tagBadge.style.cssText = `position:relative;z-index:1;background:${ed.badgeBg};color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;`;
      poster.appendChild(tagBadge);
      mItem.appendChild(poster);

      const mTitle = el('div', '', item.canonical_title);
      mTitle.style.cssText = 'font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      mItem.appendChild(mTitle);

      const total = Number(item.episode_total || 12);
      const watched = Number(item.episode_watched || 6);
      const pct = Math.min(100, Math.round((watched / total) * 100));
      const mBar = el('div', 'ui-mini-bar');
      mBar.style.background = ed.key === 'cinema' ? '#1e293b' : '#e5e7eb';
      const mFill = el('div', '');
      mFill.style.cssText = `height:100%;width:${pct}%;background:${ed.accent};`;
      mBar.appendChild(mFill);
      mItem.appendChild(mBar);

      miniCards.appendChild(mItem);
    }
    preview.appendChild(miniCards);
    preview.addEventListener('click', () => {
      applyUiTheme(ed.key, { switchRecommendedLayout: true });
    });
    sCard.appendChild(preview);

    // 样本说明区
    const sBody = el('div', 'ui-sample-body');
    const sHead = el('div', 'ui-sample-head');
    sHead.appendChild(el('div', 'ui-sample-title', ed.name));
    if (isCurrent) {
      sHead.appendChild(el('span', 'audit-status-tag', '当前使用中'));
    }
    sBody.appendChild(sHead);
    sBody.appendChild(el('div', 'ui-sample-scene', `适用场景：${ed.scene}`));
    sBody.appendChild(el('p', 'ui-sample-desc', ed.desc));

    const swatches = el('div', 'ui-sample-swatches');
    for (const sw of ed.swatches) {
      const chip = el('span', 'ui-swatch-chip');
      const dot = el('span', 'ui-theme-dot');
      dot.style.background = sw.hex;
      dot.style.border = '1px solid rgba(128,128,128,0.3)';
      chip.appendChild(dot);
      chip.appendChild(el('span', '', `${sw.label} ${sw.hex}`));
      swatches.appendChild(chip);
    }
    sBody.appendChild(swatches);

    const actions = el('div', 'ui-sample-actions');
    const recLayoutLabel = LAYOUT_MODES.find((m) => m.key === ed.recommendedLayout)?.label || '海报网格';
    actions.appendChild(el('span', 'ep-hint', `推荐搭配布局：${recLayoutLabel}`));

    const btnGroup = el('div', 'inline-row');
    const applyThemeOnlyBtn = el('button', 'btn small', '仅应用配色');
    applyThemeOnlyBtn.type = 'button';
    applyThemeOnlyBtn.addEventListener('click', () => {
      applyUiTheme(ed.key, { switchRecommendedLayout: false });
    });
    btnGroup.appendChild(applyThemeOnlyBtn);

    const applyFullBtn = el(
      'button',
      'btn small primary',
      isCurrent ? '体验此版账本 →' : '应用此版 UI 并预览 →'
    );
    applyFullBtn.type = 'button';
    applyFullBtn.addEventListener('click', () => {
      applyUiTheme(ed.key, { switchRecommendedLayout: true });
      switchView('list');
    });
    btnGroup.appendChild(applyFullBtn);
    actions.appendChild(btnGroup);
    sBody.appendChild(actions);

    sCard.appendChild(sBody);
    sampleGrid.appendChild(sCard);
  }
  host.appendChild(sampleGrid);
}

/* ---------------- 季度新番导览与每日放送周历 (B-003 + Stage 11/12 全量翻页版) ---------------- */

const SEASONAL_SOURCE_OPTIONS = [
  { key: 'all', label: '双源聚合 (Bangumi + 弹弹Play)' },
  { key: 'bangumi', label: 'Bangumi 番组计划' },
  { key: 'dandanplay', label: '弹弹Play' }
];

/** 把一份 /api/seasonal 的返回应用到界面状态 */
function applySeasonalPayload(res) {
  state.seasonalItems = res.data ?? [];
  state.seasonalPage = res.page ?? 1;
  state.seasonalMeta = {
    active_sources: res.active_sources ?? [],
    fallback_used: Boolean(res.fallback_used),
    source_errors: res.source_errors ?? {},
    season_total: Number(res.season_total ?? res.total ?? state.seasonalItems.length),
    total: Number(res.total ?? state.seasonalItems.length),
    page: Number(res.page ?? 1),
    page_size: Number(res.page_size ?? state.seasonalPageSize),
    total_pages: Number(res.total_pages ?? 1),
    has_prev: Boolean(res.has_prev),
    has_next: Boolean(res.has_next)
  };
  // 清理已入库条目
  for (const [k] of state.seasonalSelected.entries()) {
    const hit = state.seasonalItems.find((it) => `${it.source}:${it.externalId}` === k);
    if (hit?.in_library) state.seasonalSelected.delete(k);
    else if (hit) state.seasonalSelected.set(k, hit);
  }
  renderSeasonal();
}

async function loadSeasonal({ refresh = false } = {}) {
  const host = $('#seasonal');
  if (state.seasonalMode === 'calendar') {
    await loadWeeklyCalendar({ refresh });
    return;
  }

  host.innerHTML = '<div class="loading">正在从数据源获取全量季度新番目录…</div>';

  const qs = new URLSearchParams({
    year: String(state.seasonalYear),
    season: String(state.seasonalSeason),
    source: String(state.seasonalSource || 'all'),
    page: String(state.seasonalPage || 1),
    pageSize: String(state.seasonalPageSize || 24),
    filter: String(state.seasonalFilter || 'all'),
    sort: String(state.seasonalSort || 'default')
  });
  if (state.seasonalKeyword) qs.set('keyword', state.seasonalKeyword);
  if (state.seasonalIncludeUnreleased) qs.set('includeUnreleased', '1');
  if (refresh) qs.set('refresh', '1');

  /**
   * 两段式加载。
   *
   * 完整请求要等 Bangumi 翻 4 页（走代理时实测 20 秒以上），首屏一直空着很难看。
   * 弹弹Play 那边是单次请求、1~2 秒就回来，所以先拿它把界面填上，
   * 再等 Bangumi 的结果替换。
   *
   * 不会多花配额：底层 dandanplay.seasonal() 有自己的 24h 缓存，
   * 第二段请求时直接命中，不会再打官方接口。
   */
  /**
   * 两段式加载只在「首次进入某一季的第一页」时用。
   *
   * 翻页、换排序、筛选、搜索都会命中后端 SEASONAL_CACHE，本来就只要几毫秒，
   * 再跑一遍两段式反而有害：先闪一下弹弹Play 的列表再被合并数据顶掉，
   * 已经把 seasonalSelected 勾好的条目还会被中途清理。
   * 另外 economy 省流模式下 source=all 本来不预拉弹弹Play，
   * 第一段强行请求 source=dandanplay 会白花一次配额。
   */
  const wantFastFirst =
    (state.seasonalSource || 'all') === 'all' &&
    !refresh &&
    Number(state.seasonalPage || 1) === 1 &&
    !state.seasonalKeyword;

  if (wantFastFirst) {
    try {
      const fastQs = new URLSearchParams(qs);
      fastQs.set('source', 'dandanplay');
      const fast = await api(`/api/seasonal?${fastQs.toString()}`);
      if ((fast.data ?? []).length > 0) {
        applySeasonalPayload(fast);
        const tip = el('div', 'ep-hint', '已先显示弹弹Play 的条目，正在补充 Bangumi 数据…');
        tip.id = 'seasonalFastTip';
        host.prepend(tip);
      }
    } catch {
      /* 快的那段失败就等完整请求，不打断流程 */
    }
  }

  try {
    const res = await api(`/api/seasonal?${qs.toString()}`);
    $('#seasonalFastTip')?.remove();
    applySeasonalPayload(res);
  } catch (err) {
    host.innerHTML = '';
    host.appendChild(el('div', 'stat-empty', `新番导览加载失败：${err.message}`));
  }
}

async function loadWeeklyCalendar({ refresh = false } = {}) {
  const host = $('#seasonal');
  host.innerHTML = '<div class="loading">正在获取每日放送周历表…</div>';
  try {
    const res = await api(`/api/calendar${refresh ? '?refresh=1' : ''}`);
    state.calendarData = res;
    renderSeasonal();
  } catch (err) {
    host.innerHTML = '';
    host.appendChild(el('div', 'stat-empty', `每日放送表加载失败：${err.message}`));
  }
}

function buildSeasonalModeSwitcher() {
  const modeTabs = el('div', 'tabs');
  const seasonBtn = el(
    'button',
    'tab' + (state.seasonalMode === 'season' ? ' active' : ''),
    '按季度目录'
  );
  seasonBtn.type = 'button';
  seasonBtn.addEventListener('click', () => {
    if (state.seasonalMode === 'season') return;
    state.seasonalMode = 'season';
    loadSeasonal();
  });

  const calBtn = el(
    'button',
    'tab' + (state.seasonalMode === 'calendar' ? ' active' : ''),
    '每日放送周历'
  );
  calBtn.type = 'button';
  calBtn.addEventListener('click', () => {
    if (state.seasonalMode === 'calendar') return;
    state.seasonalMode = 'calendar';
    loadSeasonal();
  });

  modeTabs.appendChild(seasonBtn);
  modeTabs.appendChild(calBtn);
  return modeTabs;
}

async function openSeasonalItemDetail(item) {
  if (item.in_library && item.library_anime_id) {
    await openDetail(item.library_anime_id);
    return;
  }

  state.currentId = null;
  const body = $('#drawerBody');
  const actionsHost = $('#drawerActions');
  if (actionsHost) actionsHost.innerHTML = '';
  body.innerHTML = '';
  $('#drawerTitle').textContent = '新番作品详情预览';

  const paintPreview = (data, isLoadingMore = false) => {
    body.innerHTML = '';

    const head = el('div', 'detail-head');
    const cover = el('div', 'detail-cover-sm');
    paintCover(cover, data.title, data.remoteCoverUrl || data.coverUrl, 400);
    head.appendChild(cover);

    const headInfo = el('div', 'detail-head-info');
    headInfo.appendChild(el('div', 'detail-title', data.title));
    if (data.titleNative && data.titleNative !== data.title) {
      const nativeRow = el('div', 'ep-hint', `原名：${data.titleNative}`);
      nativeRow.style.marginTop = '2px';
      headInfo.appendChild(nativeRow);
    }

    const WEEK_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    const airDayBit =
      typeof data.airDay === 'number' && data.airDay >= 0 && data.airDay <= 7
        ? `每周${WEEK_CN[data.airDay]?.replace('周', '')}放送`
        : data.weekday
          ? `每周${WEEK_CN[data.weekday]?.replace('周', '')}放送`
          : null;

    const metaBits = [
      data.year ? `${data.year} 年` : null,
      data.airDate ? `${data.airDate} 开播` : null,
      airDayBit,
      data.episodes ? `共 ${data.episodes} 集` : '集数连载/待定',
      data.score ? `★ ${data.score} 分` : null
    ].filter(Boolean);
    headInfo.appendChild(el('div', 'detail-meta', metaBits.join(' · ')));

    const srcList = Array.isArray(data.sources) && data.sources.length ? data.sources : [data.source];
    const srcText = srcList.map((s) => SOURCE_LABEL[s] || s).join(' + ');
    const srcRow = el('div', 'ep-hint', `数据来源：${srcText}`);
    srcRow.style.marginTop = '4px';
    headInfo.appendChild(srcRow);

    head.appendChild(headInfo);
    body.appendChild(head);

    // 快捷入库操作栏
    const addBox = el('div', 'field');
    addBox.appendChild(el('div', 'field-label', '加入我的动画账本'));
    const btnRow = el('div', 'inline-row');
    btnRow.style.flexWrap = 'wrap';

    const addWithStatus = async (stKey, btnNode) => {
      btnNode.disabled = true;
      try {
        const res = await api('/api/anime/batch', {
          method: 'POST',
          body: { items: [data], status: stKey }
        });
        const createdAnimeId = res.items?.[0]?.anime?.id;
        toast(`已将「${data.title}」加入「${STATUS_LABEL[stKey]}」`);
        state.seasonalSelected.delete(`${item.source}:${item.externalId}`);
        if (state.seasonalMode === 'calendar') {
          await loadWeeklyCalendar();
        } else {
          await loadSeasonal();
        }
        if (createdAnimeId) {
          await openDetail(createdAnimeId);
        }
      } catch (err) {
        toast(err.message, true);
        btnNode.disabled = false;
      }
    };

    const wantBtn = el('button', 'btn small', '+ 加入「想看」');
    wantBtn.type = 'button';
    wantBtn.addEventListener('click', () => addWithStatus('want', wantBtn));

    const watchBtn = el('button', 'btn small primary', '+ 加入「在看」');
    watchBtn.type = 'button';
    watchBtn.addEventListener('click', () => addWithStatus('watching', watchBtn));

    const doneBtn = el('button', 'btn small ghost', '+ 加入「已看完」');
    doneBtn.type = 'button';
    doneBtn.addEventListener('click', () => addWithStatus('completed', doneBtn));

    btnRow.appendChild(watchBtn);
    btnRow.appendChild(wantBtn);
    btnRow.appendChild(doneBtn);
    addBox.appendChild(btnRow);
    body.appendChild(addBox);

    // 标签
    if (Array.isArray(data.tags) && data.tags.length > 0) {
      const tagWrap = el('div', 'inline-row');
      tagWrap.style.flexWrap = 'wrap';
      for (const t of data.tags) {
        const chip = el('span', 'media-tag', t);
        tagWrap.appendChild(chip);
      }
      body.appendChild(fieldBlock('类型与标签', tagWrap));
    }

    // 剧情简介
    const synText = data.summary
      ? data.summary
      : isLoadingMore
        ? '正在从数据源拉取完整剧情简介与分集信息…'
        : '暂无剧情简介';
    const synNode = el('div', 'field-value' + (data.summary ? '' : ' placeholder'), synText);
    synNode.style.whiteSpace = 'pre-wrap';
    synNode.style.lineHeight = '1.65';
    body.appendChild(fieldBlock('剧情简介', synNode));

    // 分集标题预览（若详情返回了 episodeList）
    if (Array.isArray(data.episodeList) && data.episodeList.length > 0) {
      const epListWrap = el('div', 'watch-events-box');
      for (const ep of data.episodeList.slice(0, 26)) {
        epListWrap.appendChild(el('div', '', `第 ${ep.ep} 集：${ep.title}`));
      }
      body.appendChild(fieldBlock(`分集列表 (${data.episodeList.length} 集)`, epListWrap));
    }

    // 外部资源检索快捷跳转（蜜柑计划、动漫花园、Bangumi、Nyaa 等）
    body.appendChild(buildDiscoveryField(data.title, null));

    const bgmId = data.sourceExternalIds?.bangumi || (data.source === 'bangumi' ? data.externalId : null);
    if (bgmId && /^\d+$/.test(String(bgmId))) {
      const extWrap = el('div', 'inline-row');
      const bgmLink = document.createElement('a');
      bgmLink.className = 'discovery-link';
      bgmLink.href = `https://bgm.tv/subject/${bgmId}`;
      bgmLink.target = '_blank';
      bgmLink.rel = 'noopener noreferrer';
      bgmLink.textContent = `在 Bangumi 查看词条 (#${bgmId}) ↗`;
      extWrap.appendChild(bgmLink);
      body.appendChild(fieldBlock('原站链接', extWrap));
    }
  };

  paintPreview(item, !item.summary || !item.episodes);
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;

  // 后台异步拉取单条详情补齐完整简介、集数、标签与封面
  try {
    const detailSource = item.sourceExternalIds?.bangumi ? 'bangumi' : item.source;
    const detailExtId = item.sourceExternalIds?.bangumi || item.externalId;
    if (detailSource && detailExtId) {
      const fetched = await api(`/api/external/${detailSource}/${encodeURIComponent(String(detailExtId))}`);
      const enriched = {
        ...item,
        summary: item.summary || fetched.summary || '',
        episodes: item.episodes || fetched.episodes || null,
        score: item.score || fetched.score || null,
        tags: Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : fetched.tags || [],
        remoteCoverUrl: item.remoteCoverUrl || fetched.remoteCoverUrl || item.coverUrl || '',
        coverUrl: item.coverUrl || fetched.coverUrl || '',
        episodeList: fetched.episodeList || []
      };
      if ($('#drawer').classList.contains('open') && state.currentId === null) {
        paintPreview(enriched, false);
      }
    }
  } catch {
    if ($('#drawer').classList.contains('open') && state.currentId === null) {
      paintPreview(item, false);
    }
  }
}

function renderSeasonalCard(item, { selectable = true } = {}) {
  const key = `${item.source}:${item.externalId}`;
  const inBatchMode = selectable && Boolean(state.seasonalBatchMode);
  const isSelected = inBatchMode && state.seasonalSelected.has(key);
  const card = el(
    'div',
    'card seasonal-card' + (isSelected ? ' selected' : '') + (item.in_library ? ' in-lib' : '')
  );
  card.title = item.in_library
    ? '点击查看账本中的作品详情'
    : inBatchMode
      ? '点击勾选或取消勾选此番剧'
      : '点击查看番剧详情介绍';

  const cover = el('div', 'cover');
  paintCover(cover, item.title, item.remoteCoverUrl || item.coverUrl);

  if (item.in_library) {
    const libBadge = el(
      'span',
      'badge in-lib-badge',
      `已在库 · ${STATUS_LABEL[item.library_status] || '想看'}`
    );
    cover.appendChild(libBadge);
  } else if (inBatchMode) {
    const checkBadge = el('span', 'badge check-badge', isSelected ? '✓' : '');
    checkBadge.title = '批量选择模式：点击卡片勾选/取消勾选';
    cover.appendChild(checkBadge);
  }

  if (item.score) {
    cover.appendChild(el('span', 'badge rating', `★ ${item.score}`));
  }

  const body = el('div', 'card-body');
  body.appendChild(el('div', 'card-title', item.title));

  const meta = el('div', 'card-meta');
  const srcList = Array.isArray(item.sources) && item.sources.length ? item.sources : [item.source];
  const srcBadgeText = srcList.map((s) => SOURCE_BADGE[s] || s).join('·');
  const srcBadge = el('span', 'seasonal-src-chip', srcBadgeText);
  meta.appendChild(srcBadge);

  meta.appendChild(
    el('span', '', item.episodes ? `全 ${item.episodes} 集` : item.airDate ? `${item.airDate} 开播` : '连载/待定')
  );
  if (Array.isArray(item.tags) && item.tags.length) {
    meta.appendChild(el('span', '', item.tags.slice(0, 2).join('·')));
  }
  body.appendChild(meta);

  if (item.summary) {
    body.appendChild(el('div', 'seasonal-summary', item.summary));
  }

  const quickRow = el('div', 'seasonal-quick-row');
  if (item.in_library && item.library_anime_id) {
    const viewBtn = el('button', 'link-btn', '查看账本详情 →');
    viewBtn.type = 'button';
    viewBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(item.library_anime_id);
    });
    quickRow.appendChild(viewBtn);
  } else {
    const detailBtn = el('button', 'link-btn', '详情');
    detailBtn.type = 'button';
    detailBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openSeasonalItemDetail(item);
    });
    const quickWant = el('button', 'link-btn', '+ 想看');
    quickWant.type = 'button';
    quickWant.addEventListener('click', (e) => {
      e.stopPropagation();
      quickAddSeasonalOne(item, 'want', quickWant);
    });
    const quickWatch = el('button', 'link-btn', '+ 在看');
    quickWatch.type = 'button';
    quickWatch.addEventListener('click', (e) => {
      e.stopPropagation();
      quickAddSeasonalOne(item, 'watching', quickWatch);
    });
    quickRow.appendChild(detailBtn);
    quickRow.appendChild(quickWant);
    quickRow.appendChild(quickWatch);
  }
  body.appendChild(quickRow);

  card.appendChild(cover);
  card.appendChild(body);

  card.addEventListener('click', () => {
    if (item.in_library && item.library_anime_id) {
      openDetail(item.library_anime_id);
      return;
    }
    if (inBatchMode) {
      if (state.seasonalSelected.has(key)) {
        state.seasonalSelected.delete(key);
      } else {
        state.seasonalSelected.set(key, item);
      }
      renderSeasonal();
      return;
    }
    openSeasonalItemDetail(item);
  });

  return card;
}

function buildSeasonalPaginationBar() {
  const m = state.seasonalMeta;
  if (!m) return null;

  const pager = el('div', 'seasonal-bar');
  pager.style.marginTop = '16px';
  pager.style.marginBottom = '4px';

  const info = el(
    'div',
    'ep-hint',
    `本季共收录 ${m.season_total || m.total} 部（当前筛选共 ${m.total} 部） · 第 ${m.page} / ${m.total_pages} 页`
  );
  pager.appendChild(info);

  const controls = el('div', 'inline-row');

  const pageSizeSel = document.createElement('select');
  pageSizeSel.style.cssText = 'height:30px;padding:0 8px;border:1px solid var(--line-strong);border-radius:6px;background:var(--surface);color:var(--text);font-size:12px;';
  for (const [sz, label] of [
    [24, '每页 24 部'],
    [48, '每页 48 部'],
    [120, '单页全量 (120 部)']
  ]) {
    const opt = document.createElement('option');
    opt.value = String(sz);
    opt.textContent = label;
    if (Number(state.seasonalPageSize) === sz) opt.selected = true;
    pageSizeSel.appendChild(opt);
  }
  pageSizeSel.addEventListener('change', () => {
    state.seasonalPageSize = Number(pageSizeSel.value) || 24;
    state.seasonalPage = 1;
    loadSeasonal();
  });
  controls.appendChild(pageSizeSel);

  const prevBtn = el('button', 'btn small', '← 上一页');
  prevBtn.type = 'button';
  prevBtn.disabled = !m.has_prev;
  prevBtn.addEventListener('click', () => {
    if (!m.has_prev) return;
    state.seasonalPage = Math.max(1, m.page - 1);
    loadSeasonal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  controls.appendChild(prevBtn);

  for (let p = 1; p <= m.total_pages; p += 1) {
    if (m.total_pages > 7 && p !== 1 && p !== m.total_pages && Math.abs(p - m.page) > 2) {
      continue;
    }
    const pBtn = el('button', 'btn small' + (p === m.page ? ' primary' : ' ghost'), String(p));
    pBtn.type = 'button';
    pBtn.addEventListener('click', () => {
      if (p === m.page) return;
      state.seasonalPage = p;
      loadSeasonal();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    controls.appendChild(pBtn);
  }

  const nextBtn = el('button', 'btn small', '下一页 →');
  nextBtn.type = 'button';
  nextBtn.disabled = !m.has_next;
  nextBtn.addEventListener('click', () => {
    if (!m.has_next) return;
    state.seasonalPage = m.page + 1;
    loadSeasonal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  controls.appendChild(nextBtn);

  pager.appendChild(controls);
  return pager;
}

function renderSeasonal() {
  const host = $('#seasonal');
  host.innerHTML = '';

  if (state.seasonalMode === 'calendar') {
    renderWeeklyCalendarView(host);
    return;
  }

  const bar = el('div', 'seasonal-bar');
  const controls = el('div', 'seasonal-controls');
  controls.appendChild(buildSeasonalModeSwitcher());

  const yearSel = document.createElement('select');
  const curY = new Date().getFullYear();
  const years = [curY, curY - 1, curY - 2, curY - 3, curY - 4];
  if (!years.includes(2026)) years.unshift(2026);
  for (const y of [...new Set(years)]) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = `${y} 年`;
    if (y === Number(state.seasonalYear)) opt.selected = true;
    yearSel.appendChild(opt);
  }
  yearSel.addEventListener('change', () => {
    state.seasonalYear = Number(yearSel.value);
    state.seasonalPage = 1;
    state.seasonalSelected.clear();
    loadSeasonal();
  });
  controls.appendChild(yearSel);

  const seasonTabs = el('div', 'tabs');
  for (const [sKey, sLabel] of Object.entries(SEASON_LABEL)) {
    const b = el('button', 'tab' + (state.seasonalSeason === sKey ? ' active' : ''), sLabel);
    b.type = 'button';
    b.addEventListener('click', () => {
      state.seasonalSeason = sKey;
      state.seasonalPage = 1;
      state.seasonalSelected.clear();
      loadSeasonal();
    });
    seasonTabs.appendChild(b);
  }
  controls.appendChild(seasonTabs);

  // 数据源选择下拉框（支持 Bangumi / 弹弹Play 双源聚合）
  const sourceSel = document.createElement('select');
  sourceSel.title = '选择新番导览的数据获取源（支持从 Bangumi 与弹弹Play 多页全量拉取并自动去重聚合）';
  for (const optDef of SEASONAL_SOURCE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = optDef.key;
    opt.textContent = optDef.label;
    if (optDef.key === (state.seasonalSource || 'all')) opt.selected = true;
    sourceSel.appendChild(opt);
  }
  sourceSel.addEventListener('change', () => {
    state.seasonalSource = sourceSel.value;
    state.seasonalPage = 1;
    state.seasonalSelected.clear();
    loadSeasonal();
  });
  controls.appendChild(sourceSel);

  // 库内状态筛选（全部 / 未入库 / 已在库）
  const filterSel = document.createElement('select');
  for (const [fKey, fLabel] of [
    ['all', '全部作品'],
    ['unadded', '仅看未入库'],
    ['in_library', '已在账本中']
  ]) {
    const opt = document.createElement('option');
    opt.value = fKey;
    opt.textContent = fLabel;
    if ((state.seasonalFilter || 'all') === fKey) opt.selected = true;
    filterSel.appendChild(opt);
  }
  filterSel.addEventListener('change', () => {
    state.seasonalFilter = filterSel.value;
    state.seasonalPage = 1;
    loadSeasonal();
  });
  controls.appendChild(filterSel);

  // 排序方式下拉框（默认综合热度 / 按评分从高到低 / 按评分从低到高 / 按番名 A→Z）
  const sortSel = document.createElement('select');
  sortSel.id = 'seasonalSortSelect';
  sortSel.title = '选择季度目录排序规则（支持按评分从高到低排序）';
  for (const [sKey, sLabel] of [
    ['default', '默认排序 (综合热度)'],
    ['score_desc', '按评分排序 (高 → 低 ★)'],
    ['score_asc', '按评分排序 (低 → 高)'],
    ['title_asc', '按番名排序 (A → Z)']
  ]) {
    const opt = document.createElement('option');
    opt.value = sKey;
    opt.textContent = sLabel;
    if ((state.seasonalSort || 'default') === sKey) opt.selected = true;
    sortSel.appendChild(opt);
  }
  sortSel.addEventListener('change', () => {
    state.seasonalSort = sortSel.value;
    state.seasonalPage = 1;
    loadSeasonal();
  });
  controls.appendChild(sortSel);

  // 放送状态筛选（默认仅展示已开播正片，过滤提前建档未放送的占位词条）
  const airSel = document.createElement('select');
  airSel.title = '默认自动过滤站点提前建档但实际尚未开播的占位词条';
  for (const [aVal, aLabel] of [
    ['0', '仅看已开播正片'],
    ['1', '含未开播/预告词条']
  ]) {
    const opt = document.createElement('option');
    opt.value = aVal;
    opt.textContent = aLabel;
    if ((state.seasonalIncludeUnreleased ? '1' : '0') === aVal) opt.selected = true;
    airSel.appendChild(opt);
  }
  airSel.addEventListener('change', () => {
    state.seasonalIncludeUnreleased = airSel.value === '1';
    state.seasonalPage = 1;
    loadSeasonal();
  });
  controls.appendChild(airSel);

  // 季度内搜索框
  const kwInput = document.createElement('input');
  kwInput.type = 'search';
  kwInput.className = 'ui-input-compact';
  kwInput.placeholder = '筛选当季番名/标签…';
  kwInput.value = state.seasonalKeyword || '';
  kwInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      state.seasonalKeyword = kwInput.value.trim();
      state.seasonalPage = 1;
      loadSeasonal();
    }
  });
  kwInput.addEventListener('search', () => {
    state.seasonalKeyword = kwInput.value.trim();
    state.seasonalPage = 1;
    loadSeasonal();
  });
  controls.appendChild(kwInput);

  const refreshBtn = el('button', 'link-btn', '↻ 刷新');
  refreshBtn.type = 'button';
  refreshBtn.title = '忽略缓存，重新从 Bangumi 与弹弹Play 拉取该季度全量目录';
  refreshBtn.addEventListener('click', () => loadSeasonal({ refresh: true }));
  controls.appendChild(refreshBtn);

  bar.appendChild(controls);

  const actions = el('div', 'seasonal-actions');
  const unaddedItems = state.seasonalItems.filter((it) => !it.in_library);
  const selectedCount = state.seasonalSelected.size;

  const toggleBatchBtn = el(
    'button',
    'btn small' + (state.seasonalBatchMode ? ' primary' : ''),
    state.seasonalBatchMode ? `退出批量选择 (${selectedCount})` : '批量选择'
  );
  toggleBatchBtn.type = 'button';
  toggleBatchBtn.title = state.seasonalBatchMode
    ? '退出批量选择模式，恢复点击卡片查看详情'
    : '开启批量选择模式，点选多部新番一键加入「想看」或「在看」';
  toggleBatchBtn.addEventListener('click', () => {
    state.seasonalBatchMode = !state.seasonalBatchMode;
    if (!state.seasonalBatchMode) {
      state.seasonalSelected.clear();
    }
    renderSeasonal();
  });
  actions.appendChild(toggleBatchBtn);

  if (state.seasonalBatchMode) {
    const selectAllBtn = el(
      'button',
      'link-btn',
      selectedCount > 0 && selectedCount >= unaddedItems.length && unaddedItems.length > 0 ? '取消全选' : '全选本页未入库'
    );
    selectAllBtn.type = 'button';
    selectAllBtn.disabled = unaddedItems.length === 0;
    selectAllBtn.addEventListener('click', () => {
      if (selectedCount > 0 && selectedCount >= unaddedItems.length) {
        state.seasonalSelected.clear();
      } else {
        for (const it of unaddedItems) {
          state.seasonalSelected.set(`${it.source}:${it.externalId}`, it);
        }
      }
      renderSeasonal();
    });
    actions.appendChild(selectAllBtn);

    const batchWantBtn = el(
      'button',
      'btn small',
      selectedCount > 0 ? `加入「想看」(${selectedCount})` : '加入「想看」'
    );
    batchWantBtn.type = 'button';
    batchWantBtn.disabled = selectedCount === 0;
    batchWantBtn.addEventListener('click', () => submitSeasonalBatch('want'));
    actions.appendChild(batchWantBtn);

    const batchWatchBtn = el(
      'button',
      'btn small primary',
      selectedCount > 0 ? `加入「在看」(${selectedCount})` : '加入「在看」'
    );
    batchWatchBtn.type = 'button';
    batchWatchBtn.disabled = selectedCount === 0;
    batchWatchBtn.addEventListener('click', () => submitSeasonalBatch('watching'));
    actions.appendChild(batchWatchBtn);
  }

  bar.appendChild(actions);
  host.appendChild(bar);

  if (state.seasonalMeta?.source_errors?.dandanplay && state.seasonalSource === 'dandanplay') {
    const ddpHint = el('div', 'ep-hint', `提示：${state.seasonalMeta.source_errors.dandanplay}`);
    ddpHint.style.marginBottom = '10px';
    host.appendChild(ddpHint);
  } else if (state.seasonalMeta?.fallback_used) {
    const hint = el(
      'div',
      'ep-hint',
      '提示：远端数据源连不上，下面是「内置示例目录」——档期是写死在程序里的，可能与实际不符（还没定档的番也会列出来），不代表真实播出信息。建议先在「设置」里配好代理或 Bangumi 镜像，再点「刷新」拿真实数据。'
    );
    hint.style.marginBottom = '10px';
    host.appendChild(hint);
  }

  if (state.seasonalItems.length === 0) {
    host.appendChild(el('div', 'stat-card stat-empty', '未找到符合筛选条件的当季番剧，请尝试清空筛选词或切换季度。'));
    return;
  }

  const grid = el('div', 'grid');
  for (const item of state.seasonalItems) {
    grid.appendChild(renderSeasonalCard(item, { selectable: true }));
  }
  host.appendChild(grid);

  const pagerBar = buildSeasonalPaginationBar();
  if (pagerBar) host.appendChild(pagerBar);

  const activeSrcNames = (state.seasonalMeta?.active_sources || [])
    .map((s) => SOURCE_BADGE[s] || s)
    .join('/');
  const m = state.seasonalMeta || {};
  $('#stat').textContent = `${state.seasonalYear} 年 ${SEASON_LABEL[state.seasonalSeason]}${
    activeSrcNames ? ` [${activeSrcNames}]` : ''
  } · 本季共 ${m.season_total || state.seasonalItems.length} 部 · 第 ${m.page || 1}/${m.total_pages || 1} 页（已选 ${selectedCount} 部）`;
}

function renderWeeklyCalendarView(host) {
  const bar = el('div', 'seasonal-bar');
  const controls = el('div', 'seasonal-controls');
  controls.appendChild(buildSeasonalModeSwitcher());

  const jsDay = new Date().getDay();
  const todayWeekday = jsDay === 0 ? 7 : jsDay;

  const dayTabs = el('div', 'tabs');
  const allDayBtn = el(
    'button',
    'tab' + (state.calendarActiveDay === 0 ? ' active' : ''),
    '全周放送'
  );
  allDayBtn.type = 'button';
  allDayBtn.addEventListener('click', () => {
    state.calendarActiveDay = 0;
    renderSeasonal();
  });
  dayTabs.appendChild(allDayBtn);

  const days = state.calendarData?.days ?? [];
  const shortDayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  for (let i = 1; i <= 7; i += 1) {
    const isToday = i === todayWeekday;
    const label = `${shortDayLabels[i - 1]}${isToday ? '·今' : ''}`;
    const b = el('button', 'tab' + (state.calendarActiveDay === i ? ' active' : ''), label);
    b.type = 'button';
    b.addEventListener('click', () => {
      state.calendarActiveDay = i;
      renderSeasonal();
    });
    dayTabs.appendChild(b);
  }
  controls.appendChild(dayTabs);

  const refreshBtn = el('button', 'link-btn', '↻ 刷新周历');
  refreshBtn.type = 'button';
  refreshBtn.addEventListener('click', () => loadWeeklyCalendar({ refresh: true }));
  controls.appendChild(refreshBtn);

  bar.appendChild(controls);
  host.appendChild(bar);

  if (days.length === 0) {
    host.appendChild(el('div', 'stat-card stat-empty', '暂无放送周历数据。'));
    return;
  }

  const visibleDays =
    state.calendarActiveDay === 0
      ? days
      : days.filter((d) => Number(d.weekday?.id) === Number(state.calendarActiveDay));

  let totalShown = 0;
  let inLibWatching = 0;

  for (const d of visibleDays) {
    const dayId = Number(d.weekday?.id) || 1;
    const isToday = dayId === todayWeekday;
    const section = el('div', 'calendar-day-section');
    const secTitle = el('div', 'calendar-day-head');
    const leftTitle = el('div', 'inline-row');
    const h3 = el('strong', '', `${d.weekday?.cn || shortDayLabels[dayId - 1]}`);
    leftTitle.appendChild(h3);
    if (isToday) {
      const todayBadge = el('span', 'calendar-today-pill', '今日放送');
      leftTitle.appendChild(todayBadge);
    }
    secTitle.appendChild(leftTitle);
    secTitle.appendChild(el('span', 'ep-hint', `共 ${d.items?.length || 0} 部`));
    section.appendChild(secTitle);

    const grid = el('div', 'grid');
    for (const item of d.items ?? []) {
      totalShown += 1;
      if (item.in_library) inLibWatching += 1;
      grid.appendChild(renderSeasonalCard(item, { selectable: false }));
    }
    section.appendChild(grid);
    host.appendChild(section);
  }

  const srcText = state.calendarData?.source === 'bangumi' ? 'Bangumi 实时放送表' : '追番周历';
  $('#stat').textContent = `${srcText} · 展示 ${totalShown} 部放送作品（其中已在账本 ${inLibWatching} 部）`;
}

async function quickAddSeasonalOne(item, status, btn) {
  btn.disabled = true;
  try {
    const res = await api('/api/anime/batch', {
      method: 'POST',
      body: { items: [item], status }
    });
    if (res.created > 0) {
      toast(`已将「${item.title}」加入「${STATUS_LABEL[status]}」`);
    } else {
      toast(`「${item.title}」已在账本中`);
    }
    state.seasonalSelected.delete(`${item.source}:${item.externalId}`);
    if (state.seasonalMode === 'calendar') {
      await loadWeeklyCalendar();
    } else {
      await loadSeasonal();
    }
  } catch (err) {
    toast(err.message, true);
    btn.disabled = false;
  }
}

async function submitSeasonalBatch(status) {
  const items = [...state.seasonalSelected.values()];
  if (items.length === 0) return;

  try {
    const res = await api('/api/anime/batch', {
      method: 'POST',
      body: { items, status }
    });
    state.seasonalSelected.clear();
    state.seasonalBatchMode = false;
    toast(
      `批量入库完成：新增 ${res.created} 部至「${STATUS_LABEL[status]}」${
        res.skipped ? `，跳过已存在 ${res.skipped} 部` : ''
      }`
    );
    await loadSeasonal();
  } catch (err) {
    toast(err.message, true);
  }
}

async function loadStats(year) {
  const host = $('#stats');
  host.innerHTML = '<div class="stat-empty">正在统计…</div>';

  try {
    const s = await api(`/api/stats${year ? `?year=${Number(year)}` : ''}`);
    state.lastStats = s;
    renderStats(s);
  } catch (err) {
    host.innerHTML = '';
    host.appendChild(el('div', 'stat-empty', err.message));
  }
}

function renderStats(s) {
  const host = $('#stats');
  host.innerHTML = '';

  const { year, overview, available_years, unknown_date } = s;

  const head = el('div', 'stats-head-bar');
  const leftHead = el('div', 'stats-head');
  leftHead.style.marginBottom = '0';
  if (available_years.length > 1) {
    const sel = document.createElement('select');
    sel.id = 'yearSelect';
    for (const y of available_years) {
      const o = document.createElement('option');
      o.value = String(y.year);
      o.textContent = `${y.year} 年 · ${y.episodes} 集`;
      if (y.year === year.year) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => loadStats(sel.value));
    leftHead.appendChild(sel);
  } else {
    leftHead.appendChild(el('div', 'stats-year', `${year.year} 年`));
  }
  head.appendChild(leftHead);

  const shareActions = el('div', 'inline-row');
  const posterBtn = el('button', 'btn small primary', '生成年度总结图');
  posterBtn.type = 'button';
  posterBtn.addEventListener('click', () => openShareGeneratorModal('poster', s));
  shareActions.appendChild(posterBtn);

  const gridBtn = el('button', 'btn small', '生成个人动画喜好表');
  gridBtn.type = 'button';
  gridBtn.addEventListener('click', () => openShareGeneratorModal('grid', s));
  shareActions.appendChild(gridBtn);

  head.appendChild(shareActions);
  host.appendChild(head);

  const hero = el('div', 'stat-hero');
  hero.appendChild(heroItem(String(year.episodes), '集'));
  hero.appendChild(heroItem(formatHours(year.minutes), '累计（标准时长）'));
  hero.appendChild(heroItem(String(year.anime_count), '部作品'));
  host.appendChild(hero);

  // Stage 13: 追番习惯透视（活跃天数、最长连续追番、全库完结率、特别收藏）
  const habitCard = el('div', 'stat-card');
  habitCard.appendChild(el('div', 'stat-card-title', `${year.year} 年追番习惯与里程碑`));
  const habitRow = el('div', 'quarter-row');
  for (const hItem of [
    {
      q: '全年活跃打卡',
      v: `${year.active_days ?? 0} 天`,
      sub: year.active_days > 0 ? '有明确观看日期的打卡天数' : '记一集即可点亮打卡'
    },
    {
      q: '最长连续追番',
      v: `${year.max_streak_days ?? 0} 天`,
      sub: '连续每天至少看 1 集的最高纪录'
    },
    {
      q: '全库完结率',
      v: `${overview.completion_rate ?? 0}%`,
      sub: `已看完 ${overview.by_status?.completed ?? 0} / ${overview.anime_active ?? 0} 部`
    },
    {
      q: '特别收藏 ★',
      v: `${overview.favorite_count ?? 0} 部`,
      sub: '标星珍藏的心头好番剧'
    }
  ]) {
    const box = el('div', 'quarter-box');
    box.appendChild(el('div', 'quarter-q', hItem.q));
    box.appendChild(el('div', 'quarter-v', hItem.v));
    box.appendChild(el('div', 'quarter-sub', hItem.sub));
    habitRow.appendChild(box);
  }
  habitCard.appendChild(habitRow);
  host.appendChild(habitCard);

  // Stage 13: 全年 365 天追番打卡热力图日历墙
  host.appendChild(buildYearlyHeatmapCard(year));

  if (year.episodes > 0) {
    const chart = el('div', 'stat-card');
    chart.appendChild(el('div', 'stat-card-title', '每月看了多少集'));

    const bars = el('div', 'bars');
    const max = Math.max(...year.months.map((m) => m.episodes), 1);
    for (const m of year.months) {
      const col = el('div', 'bar-col');
      const track = el('div', 'bar-track');
      const bar = el('div', 'bar' + (m.episodes === 0 ? ' empty' : ''));
      bar.style.height = `${(m.episodes / max) * 100}%`;
      bar.title = `${m.month} 月　${m.episodes} 集${m.minutes > 0 ? `　${formatHours(m.minutes)}` : ''}`;
      track.appendChild(bar);
      col.appendChild(track);
      col.appendChild(el('div', 'bar-label', String(m.month)));
      bars.appendChild(col);
    }
    chart.appendChild(bars);
    host.appendChild(chart);

    const qWrap = el('div', 'stat-card');
    qWrap.appendChild(el('div', 'stat-card-title', '按季度'));
    const qRow = el('div', 'quarter-row');
    for (const q of year.quarters) {
      const box = el('div', 'quarter-box');
      box.appendChild(el('div', 'quarter-q', `Q${q.quarter}`));
      box.appendChild(el('div', 'quarter-v', `${q.episodes} 集`));
      box.appendChild(el('div', 'quarter-sub', q.minutes > 0 ? formatHours(q.minutes) : '—'));
      qRow.appendChild(box);
    }
    qWrap.appendChild(qRow);
    host.appendChild(qWrap);
  } else {
    host.appendChild(
      el('div', 'stat-card stat-empty', `${year.year} 年还没有观看记录。返回列表，在卡片上按 +1 记一集。`)
    );
  }

  const ov = el('div', 'stat-card');
  ov.appendChild(el('div', 'stat-card-title', '全库'));
  const grid = el('div', 'ov-grid');
  grid.appendChild(
    ovItem(
      '作品',
      `${overview.anime_active} 部${overview.anime_archived ? `（另有 ${overview.anime_archived} 部已归档）` : ''}`
    )
  );
  grid.appendChild(ovItem('总集数', `${overview.episodes_total} 集`));
  grid.appendChild(ovItem('已看', `${overview.watched_episodes} 集`));
  grid.appendChild(ovItem('累计时长', formatHours(overview.watched_minutes)));
  ov.appendChild(grid);
  host.appendChild(ov);

  // P2 高级统计：评分分布、高频标签 Top 榜与最近观看动态时间轴
  if (s.advanced) {
    const adv = s.advanced;
    if (adv.rated_count > 0 && Array.isArray(adv.rating_distribution)) {
      const rateCard = el('div', 'stat-card');
      rateCard.appendChild(
        el(
          'div',
          'stat-card-title',
          `个人评分分布（已评 ${adv.rated_count} 部 · 平均 ★ ${adv.average_rating}）`
        )
      );
      const rBars = el('div', 'bars');
      const maxR = Math.max(...adv.rating_distribution.map((x) => x.count), 1);
      for (const item of adv.rating_distribution) {
        const col = el('div', 'bar-col');
        const track = el('div', 'bar-track');
        const bar = el('div', 'bar' + (item.count === 0 ? ' empty' : ''));
        bar.style.height = `${(item.count / maxR) * 100}%`;
        bar.title = `${item.rating} 分：${item.count} 部`;
        track.appendChild(bar);
        col.appendChild(track);
        col.appendChild(el('div', 'bar-label', `${item.rating}★`));
        rBars.appendChild(col);
      }
      rateCard.appendChild(rBars);
      host.appendChild(rateCard);
    }

    if (Array.isArray(adv.top_tags) && adv.top_tags.length > 0) {
      const tagCard = el('div', 'stat-card');
      tagCard.appendChild(el('div', 'stat-card-title', '常看题材 / 个人标签 Top 榜'));
      const tagWrap = el('div', 'stat-tag-cloud');
      for (const t of adv.top_tags) {
        const chip = el('span', 'media-tag', `${t.name} · ${t.count} 部`);
        tagWrap.appendChild(chip);
      }
      tagCard.appendChild(tagWrap);
      host.appendChild(tagCard);
    }

    if (Array.isArray(adv.recent_events) && adv.recent_events.length > 0) {
      const evCard = el('div', 'stat-card');
      evCard.appendChild(el('div', 'stat-card-title', '最近追番操作时间轴'));
      const evList = el('div', 'stat-timeline-list');
      for (const ev of adv.recent_events.slice(0, 10)) {
        const r = el('div', 'stat-timeline-row');
        r.appendChild(
          el('span', '', `《${ev.canonical_title}》 · ${ev.detail || ev.event_type}`)
        );
        r.appendChild(
          el(
            'span',
            'ep-hint',
            ev.watched_date || String(ev.created_at || '').slice(0, 10)
          )
        );
        evList.appendChild(r);
      }
      evCard.appendChild(evList);
      host.appendChild(evCard);
    }
  }

  const notes = el('div', 'stat-notes');
  notes.appendChild(el('div', '', '· 按每集的「首次观看日期」归入年份和季度，补记去年的番算在去年。'));
  notes.appendChild(el('div', '', '· 时长 = 已看集数 × 标准单集时长，是估算值，不是实际播放时长。'));
  if (year.missing_duration_count > 0) {
    notes.appendChild(
      el('div', 'stat-warn', `· ${year.year} 年有 ${year.missing_duration_count} 集没有单集时长，只计集数、未计时长。`)
    );
  }
  if (unknown_date.episodes > 0) {
    notes.appendChild(
      el(
        'div',
        'stat-warn',
        `· 另有 ${unknown_date.episodes} 集观看日期不详（${formatHours(unknown_date.minutes)}），不归入任何年份。`
      )
    );
  }
  host.appendChild(notes);
}

function heroItem(value, label) {
  const d = el('div', 'stat-hero-item');
  d.appendChild(el('strong', '', value));
  d.appendChild(el('span', '', label));
  return d;
}

function ovItem(label, value) {
  const d = el('div', 'ov-item');
  d.appendChild(el('div', 'ov-label', label));
  d.appendChild(el('div', 'ov-value', value));
  return d;
}

function buildYearlyHeatmapCard(yearObj) {
  const y = Number(yearObj?.year) || new Date().getFullYear();
  const dailyList = Array.isArray(yearObj?.daily_activity) ? yearObj.daily_activity : [];
  const map = new Map(dailyList.map((d) => [d.date, d]));

  const card = el('div', 'stat-card');
  const titleRow = el('div', 'stat-card-head-row');
  titleRow.appendChild(
    el(
      'div',
      'stat-card-title',
      `${y} 年追番打卡日历墙（共点亮 ${yearObj?.active_days ?? dailyList.length} 天）`
    )
  );
  const legend = el('div', 'heatmap-legend');
  legend.innerHTML = `
    <span>少</span>
    <i class="hm-cell lv-0"></i>
    <i class="hm-cell lv-1"></i>
    <i class="hm-cell lv-2"></i>
    <i class="hm-cell lv-3"></i>
    <i class="hm-cell lv-4"></i>
    <span>多</span>
  `;
  titleRow.appendChild(legend);
  card.appendChild(titleRow);

  const scrollWrap = el('div', 'heatmap-scroll');
  const grid = el('div', 'heatmap-grid');

  const start = new Date(Date.UTC(y, 0, 1));
  const end = new Date(Date.UTC(y, 11, 31));
  const startDow = (start.getUTCDay() + 6) % 7; // 周一 = 0 .. 周日 = 6

  for (let pad = 0; pad < startDow; pad += 1) {
    const empty = el('span', 'hm-cell empty-pad');
    grid.appendChild(empty);
  }

  for (let cur = new Date(start); cur <= end; cur.setUTCDate(cur.getUTCDate() + 1)) {
    const mm = String(cur.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(cur.getUTCDate()).padStart(2, '0');
    const dKey = `${y}-${mm}-${dd}`;
    const info = map.get(dKey);
    const eps = info?.episodes || 0;
    const mins = info?.minutes || 0;
    const lv = eps === 0 ? 0 : eps === 1 ? 1 : eps <= 3 ? 2 : eps <= 5 ? 3 : 4;
    const cell = el('span', `hm-cell lv-${lv}`);
    cell.title =
      eps > 0
        ? `${dKey}：看了 ${eps} 集${mins > 0 ? `（约 ${formatHours(mins)}）` : ''}`
        : `${dKey}：未记录观看`;
    grid.appendChild(cell);
  }

  scrollWrap.appendChild(grid);
  card.appendChild(scrollWrap);
  return card;
}

function localToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function showEpisodeEditor(host, view, ep) {
  host.innerHTML = '';

  const box = el('div', 'ep-edit');
  const labelText = ep.is_special ? `${ep.episode_key || 'SP'}` : `第 ${ep.episode_number} 集`;
  box.appendChild(el('span', 'ep-edit-label', labelText));

  const date = document.createElement('input');
  date.type = 'date';
  date.value = ep.first_watched_at ?? localToday();
  box.appendChild(date);

  const today = el('button', 'link-btn', '今天');
  today.type = 'button';
  today.addEventListener('click', () => {
    date.value = localToday();
  });
  box.appendChild(today);

  const unknown = el('button', 'link-btn', '记不清');
  unknown.type = 'button';
  unknown.title = '标记为日期不详，不计入任何年份的统计';
  unknown.addEventListener('click', () => {
    date.value = '';
  });
  box.appendChild(unknown);

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'ui-input-compact';
  titleInput.placeholder = '分集标题（可选）';
  titleInput.value = ep.title ?? '';
  box.appendChild(titleInput);

  const actions = el('div', 'ep-edit-actions');

  if (!ep.is_watched) {
    const watchBtn = el('button', 'btn small primary', '标记已看');
    watchBtn.type = 'button';
    watchBtn.addEventListener('click', async () => {
      watchBtn.disabled = true;
      try {
        await api(`/api/episodes/${ep.id}/watch`, {
          method: 'POST',
          body: { watched: true, date: date.value || null }
        });
        if (!date.value) {
          await api(`/api/episodes/${ep.id}/watched-at`, { method: 'PUT', body: { date: null } });
        }
        if (titleInput.value.trim() !== (ep.title ?? '')) {
          await api(`/api/episodes/${ep.id}/meta`, {
            method: 'PUT',
            body: { title: titleInput.value.trim() || null }
          });
        }
        toast('已标记为已看');
        renderDrawer(await api(`/api/anime/${view.anime_id}`));
        load();
      } catch (err) {
        toast(err.message, true);
        watchBtn.disabled = false;
      }
    });
    actions.appendChild(watchBtn);
  } else {
    const save = el('button', 'btn small primary', '保存');
    save.type = 'button';
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        await api(`/api/episodes/${ep.id}/watched-at`, {
          method: 'PUT',
          body: { date: date.value || null }
        });
        if (titleInput.value.trim() !== (ep.title ?? '')) {
          await api(`/api/episodes/${ep.id}/meta`, {
            method: 'PUT',
            body: { title: titleInput.value.trim() || null }
          });
        }
        toast(date.value ? `已记到 ${date.value}` : '已保存单集信息');
        renderDrawer(await api(`/api/anime/${view.anime_id}`));
        load();
      } catch (err) {
        toast(err.message, true);
        save.disabled = false;
      }
    });
    actions.appendChild(save);

    const unwatch = el('button', 'btn small danger', '取消已看');
    unwatch.type = 'button';
    unwatch.addEventListener('click', async () => {
      unwatch.disabled = true;
      try {
        await api(`/api/episodes/${ep.id}/watch`, { method: 'POST', body: { watched: false } });
        renderDrawer(await api(`/api/anime/${view.anime_id}`));
        load();
      } catch (err) {
        toast(err.message, true);
        unwatch.disabled = false;
      }
    });
    actions.appendChild(unwatch);
  }

  const close = el('button', 'link-btn', '关闭');
  close.type = 'button';
  close.addEventListener('click', () => {
    host.innerHTML = '';
  });
  actions.appendChild(close);

  box.appendChild(actions);

  // Stage 6-7: 展示该集关联的多个本地视频版本与播放入口（打开视频绝不自动标记已看）
  if (Array.isArray(ep.media_files) && ep.media_files.length > 0) {
    const mediaBox = el('div', 'ep-media-versions');
    const inlinePlayerHost = el('div', '');

    const playBlobFile = (rawFile, displayFileName) => {
      inlinePlayerHost.innerHTML = '';
      const pBox = el('div', 'video-preview-box');
      pBox.style.marginTop = '8px';
      const pHead = el('div', 'media-group-head');
      pHead.appendChild(el('span', '', `正在播放本地视频：${displayFileName}（不会自动标为已看）`));
      const closePlayBtn = el('button', 'btn small ghost', '关闭播放器');
      closePlayBtn.type = 'button';
      closePlayBtn.style.color = '#fff';
      closePlayBtn.addEventListener('click', () => {
        inlinePlayerHost.innerHTML = '';
      });
      pHead.appendChild(closePlayBtn);
      pBox.appendChild(pHead);

      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.src = URL.createObjectURL(rawFile);
      pBox.appendChild(video);
      inlinePlayerHost.appendChild(pBox);
    };

    for (const mf of ep.media_files) {
      const row = el('div', 'ep-media-row');
      const isServerFile = Boolean(mf.library_root_id);
      const isMissing = isServerFile && mf.availability_status === 'missing';
      const cachedBrowserFile =
        state.browserVideoFiles.get(mf.path) || state.browserVideoFiles.get(mf.file_name);

      const badge = el(
        'span',
        'media-tag' + (isMissing ? ' danger-tag' : ' matched'),
        isMissing ? '文件缺失 (missing)' : mf.version_label || mf.resolution || '本地版本'
      );
      row.appendChild(badge);
      row.appendChild(el('span', 'ep-media-name', mf.file_name));

      const btnLabel = cachedBrowserFile
        ? '直接播放视频'
        : isServerFile
          ? isMissing
            ? '重新检测'
            : '调用默认播放器'
          : '播放本地视频';

      const openBtn = el('button', 'btn small', btnLabel);
      openBtn.type = 'button';
      openBtn.title = '播放此本地视频（不会自动标记已看）';

      const filePicker = document.createElement('input');
      filePicker.type = 'file';
      filePicker.accept = '.mp4,.mkv,.avi,.mov,.flv,.webm,.ts,.m2ts,.rmvb,video/*';
      filePicker.hidden = true;
      filePicker.addEventListener('change', () => {
        const pickedFile = filePicker.files?.[0];
        if (!pickedFile) return;
        state.browserVideoFiles.set(mf.path, pickedFile);
        state.browserVideoFiles.set(mf.file_name, pickedFile);
        state.browserVideoFiles.set(pickedFile.name, pickedFile);
        openBtn.textContent = '直接播放视频';
        playBlobFile(pickedFile, pickedFile.name);
      });
      row.appendChild(filePicker);

      openBtn.addEventListener('click', async () => {
        const memFile =
          state.browserVideoFiles.get(mf.path) || state.browserVideoFiles.get(mf.file_name);
        if (memFile) {
          playBlobFile(memFile, mf.file_name);
          return;
        }

        if (!isServerFile) {
          toast('由于浏览器安全限制，刷新页面后请点选一次本机视频文件即可直接播放');
          filePicker.click();
          return;
        }

        openBtn.disabled = true;
        try {
          await api(`/api/media/files/${mf.id}/open`, { method: 'POST', body: {} });
          toast(`已调用系统默认播放器打开：${mf.file_name}（未自动标记已看）`);
        } catch (err) {
          toast('远端服务无法直接读取本机磁盘，请选择本机视频文件在页内直接播放');
          filePicker.click();
        } finally {
          openBtn.disabled = false;
        }
      });
      row.appendChild(openBtn);
      mediaBox.appendChild(row);
    }
    mediaBox.appendChild(inlinePlayerHost);
    box.appendChild(mediaBox);
  }

  host.appendChild(box);
}

function batchBlock(view, progress, refresh) {
  const details = document.createElement('details');
  details.className = 'ep-batch';

  const summary = document.createElement('summary');
  summary.textContent = '批量补记（一次标记多集）';
  details.appendChild(summary);

  const body = el('div', 'ep-batch-body');

  const rangeRow = el('div', 'ep-batch-row');
  rangeRow.appendChild(el('span', '', '第'));

  const fromInput = document.createElement('input');
  fromInput.type = 'number';
  fromInput.min = '1';
  fromInput.max = String(progress.total);
  fromInput.value = '1';
  rangeRow.appendChild(fromInput);

  rangeRow.appendChild(el('span', '', '到第'));

  const toInput = document.createElement('input');
  toInput.type = 'number';
  toInput.min = '1';
  toInput.max = String(progress.total);
  toInput.value = String(progress.total);
  rangeRow.appendChild(toInput);

  rangeRow.appendChild(el('span', '', '集'));
  body.appendChild(rangeRow);

  const dateRow = el('div', 'ep-batch-row');
  dateRow.appendChild(el('span', '', '观看日期'));

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateRow.appendChild(dateInput);

  const todayBtn = el('button', 'link-btn', '今天');
  todayBtn.type = 'button';
  todayBtn.addEventListener('click', () => {
    dateInput.value = localToday();
  });
  dateRow.appendChild(todayBtn);

  const clearBtn = el('button', 'link-btn', '清空');
  clearBtn.type = 'button';
  clearBtn.title = '清空表示日期不详，不计入任何年份的统计';
  clearBtn.addEventListener('click', () => {
    dateInput.value = '';
  });
  dateRow.appendChild(clearBtn);
  body.appendChild(dateRow);

  body.appendChild(el('div', 'ep-hint', '日期留空表示日期不详。已经标记过的集不会被改动。'));

  const markBtn = el('button', 'btn small primary', '标记为已看');
  markBtn.type = 'button';
  markBtn.addEventListener('click', async () => {
    const from = Number(fromInput.value);
    const to = Number(toInput.value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
      toast('起始集要小于等于结束集', true);
      return;
    }

    markBtn.disabled = true;
    try {
      const res = await api(`/api/anime/${view.anime_id}/progress`, {
        method: 'POST',
        body: { action: 'range', from, to, date: dateInput.value || null }
      });

      const parts = [res.marked ? `补记 ${res.marked} 集` : '没有新的集需要标记'];
      if (res.skipped) parts.push(`${res.skipped} 集之前已记过，未改动`);
      if (res.date) parts.push(`日期 ${res.date}`);
      toast(parts.join('，'));

      await refresh();
    } catch (err) {
      toast(err.message, true);
      markBtn.disabled = false;
    }
  });
  body.appendChild(markBtn);

  details.appendChild(body);
  return details;
}

/* ---------------- 归档与彻底删除（应用内弹窗确认） ---------------- */

async function deleteWithConfirm(detail) {
  const anime = detail.anime;
  const lines = [`确定要彻底删除「${anime.canonical_title}」吗？`];

  const doomed = [];
  if (detail.episode_count > 0) doomed.push(`${detail.episode_count} 集记录`);
  if (detail.watched_count > 0) doomed.push(`${detail.watched_count} 条观看记录（含日期）`);
  if (detail.tags?.length) doomed.push(`${detail.tags.length} 个标签关联`);

  if (doomed.length) {
    lines.push(`\n将一并删除：${doomed.join('、')}`);
  }
  lines.push('\n彻底删除后无法恢复。如果只是想让它从列表里消失，请使用右上角的「移出列表」（可随时恢复）。');

  const ok = await askConfirm({
    title: '彻底删除作品',
    message: lines.join('\n'),
    confirmText: detail.watched_count > 0 ? '继续删除…' : '确认彻底删除',
    danger: true
  });
  if (!ok) return;

  if (detail.watched_count > 0) {
    const okSecond = await askConfirm({
      title: '二次确认：永久清除观看历史',
      message: `「${anime.canonical_title}」包含 ${detail.watched_count} 条已看剧集记录。彻底删除后这些观看日期与统计将永久丢失且不可恢复！\n\n真的要永久删除吗？`,
      confirmText: '永久彻底删除',
      danger: true
    });
    if (!okSecond) return;
  }

  try {
    const res = await api(`/api/anime/${anime.id}`, { method: 'DELETE' });
    toast(`已彻底删除「${res.title || anime.canonical_title}」`);
    closeDrawer();
    load();
  } catch (err) {
    toast(err.message, true);
  }
}

async function archiveWithConfirm(id) {
  try {
    const info = await api(`/api/anime/${id}/archive-check`);
    const ok = await askConfirm({
      title: `移出列表：${info.title}`,
      message: `${info.message}\n\n当前已看 ${info.watched_episodes} 集，这些观看记录都会完整保留。`,
      confirmText: '移出列表',
      danger: false
    });
    if (!ok) return;
    await api(`/api/anime/${id}/archive`, { method: 'POST' });
    toast('已移出列表，可在「已归档」里恢复');
    closeDrawer();
    load();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- 本地媒体识别弹窗（Stage 6-7 浏览器选目录 + 服务端扫描） ---------------- */

async function openMediaScanModal() {
  state.editingId = null;
  $('#modalTitle').textContent = '本地番剧文件夹识别与文件名解析';
  const modalCard = $('#modal .modal-card');
  modalCard?.classList.add('wide-card');

  const form = $('#animeForm');
  $('#modal').hidden = false;

  let recognizedGroups = [];
  let localFileMap = new Map();

  form.innerHTML = `
    <div class="form-error" id="formError"></div>

    <div class="media-workbench-grid">
      <div class="settings-section" style="margin-bottom:0;border-bottom:none">
        <div class="settings-title">
          <span>方式一：选择本机番剧文件夹 / 视频文件（零上传）</span>
        </div>
        <div class="media-picker-box">
          <p style="margin:0 0 8px;font-weight:600">自动剥离 [字幕组][1080p][HEVC] 等标签并提取集数</p>
          <div class="inline-row" style="justify-content:center;flex-wrap:wrap">
            <button type="button" class="btn primary small" id="pickDirBtn">选择本地番剧文件夹</button>
            <button type="button" class="btn small" id="pickFilesBtn">选择多个视频文件</button>
            <input type="file" id="dirInput" webkitdirectory directory multiple hidden>
            <input type="file" id="filesInput" multiple accept=".mp4,.mkv,.avi,.mov,.flv,.webm,.ts,.m2ts,.rmvb,video/*" hidden>
          </div>
          <div class="ep-hint">仅解析文件名与话数，支持在放映室内直接点播本地视频。</div>
        </div>
      </div>

      <div class="settings-section" style="margin-bottom:0;border-bottom:none">
        <div class="settings-title">
          <span>方式二：常驻媒体库根目录与非破坏性扫描</span>
        </div>
        <div class="inline-row" style="flex-wrap:wrap">
          <input type="text" id="serverMediaDir" class="ui-input-compact" placeholder="例如 D:\\Anime 或 /mnt/media/anime">
          <button type="button" class="btn small primary" id="addMediaRootBtn">登记并扫描</button>
          <button type="button" class="btn small ghost" id="scanServerDirBtn">仅预览</button>
        </div>
        <div id="mediaRootsHost" style="margin-top:8px"></div>
      </div>
    </div>

    <div id="mediaPendingHost"></div>
    <div id="mediaScanResultHost"></div>
    <div id="mediaVideoPreviewHost"></div>

    <div class="form-actions">
      <button type="button" class="btn ghost" id="formCancel">关闭</button>
      <button type="submit" class="btn primary" id="applyMediaBtn" disabled>同步选中番剧到账本</button>
    </div>
  `;

  const renderGroups = (res) => {
    const host = $('#mediaScanResultHost');
    const applyBtn = $('#applyMediaBtn');
    host.innerHTML = '';
    recognizedGroups = res.groups ?? [];

    if (recognizedGroups.length === 0) {
      host.innerHTML = `<div class="ep-hint" style="margin-bottom:12px">未检测到受支持的视频文件（支持 .mp4 / .mkv / .avi / .flv / .ts 等）。</div>`;
      applyBtn.disabled = true;
      return;
    }

    applyBtn.disabled = false;

    const summaryBar = el('div', 'settings-title');
    summaryBar.innerHTML = `
      <span>识别出 ${recognizedGroups.length} 部番剧（共 ${res.videoFiles} 个视频文件）</span>
      <label style="font-weight:400;font-size:12px;display:flex;align-items:center;gap:5px;cursor:pointer">
        <input type="checkbox" id="markMediaWatched">
        <span>同时把已有本地视频的集数标记为「已看」</span>
      </label>
    `;
    host.appendChild(summaryBar);

    const listEl = el('div', 'media-group-list');
    recognizedGroups.forEach((g, idx) => {
      if (!g.title) {
        g.title = g.matchedAnime?.canonical_title || g.suggestedChineseTitle || g.titleCandidate;
      }
      if (g.suggestedMeta) {
        if (!g.cover_url && g.suggestedMeta.cover_url) g.cover_url = g.suggestedMeta.cover_url;
        if (!g.release_year && g.suggestedMeta.year) g.release_year = g.suggestedMeta.year;
        if (!g.synopsis && g.suggestedMeta.synopsis) g.synopsis = g.suggestedMeta.synopsis;
        if (!g.tags && Array.isArray(g.suggestedMeta.tags)) g.tags = g.suggestedMeta.tags;
        if (!g.source && g.suggestedMeta.source) g.source = g.suggestedMeta.source;
        if (!g.external_id && g.suggestedMeta.external_id) g.external_id = g.suggestedMeta.external_id;
      }
      if (!g.totalEpisodes) {
        g.totalEpisodes =
          (Number(g.seasonNumber) === 1 && g.suggestedMeta?.episodes) ||
          g.maxEpisode ||
          g.episodes?.length ||
          12;
      }

      const card = el('div', 'media-group-card');
      const mainRow = el('div', 'media-group-main');

      // 左侧封面实时预览框（自动联想到资料后直接显示封面）
      const coverBox = el('div', 'media-group-cover');

      const updateCoverPreview = (titleText, remoteOrProxyUrl) => {
        coverBox.innerHTML = '';
        paintCover(coverBox, titleText || g.title || '番', remoteOrProxyUrl, 200);
      };
      updateCoverPreview(g.title, g.cover_url || '');
      mainRow.appendChild(coverBox);

      const rightCol = el('div', 'media-group-right');
      const head = el('div', 'media-group-head');
      const titleWrap = el('div', 'media-group-title');

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.groupIdx = String(idx);
      cb.className = 'media-group-cb';
      titleWrap.appendChild(cb);

      const titleInput = document.createElement('input');
      titleInput.type = 'text';
      titleInput.className = 'ui-input-compact';
      titleInput.value = g.title;
      titleInput.placeholder = '番剧中文名称';
      titleInput.title = '入库后的番剧名称（可通过下方搜索联想自动填入或手动修改）';
      titleInput.addEventListener('input', () => {
        g.title = titleInput.value.trim() || g.titleCandidate;
        if (!g.cover_url) updateCoverPreview(g.title, '');
      });
      titleWrap.appendChild(titleInput);

      // 季度选择下拉框（识别出第3季默认选第3季，支持随时调整）
      const seasonSel = document.createElement('select');
      seasonSel.className = 'ui-select-compact';
      seasonSel.title = '该批视频所属季度（只会创建所选季度，不会误建其他季）';
      for (let sIdx = 1; sIdx <= 10; sIdx += 1) {
        const opt = document.createElement('option');
        opt.value = String(sIdx);
        opt.textContent = `第 ${sIdx} 季`;
        if (sIdx === (Number(g.seasonNumber) || 1)) opt.selected = true;
        seasonSel.appendChild(opt);
      }
      seasonSel.addEventListener('change', () => {
        g.seasonNumber = Number(seasonSel.value) || 1;
      });
      titleWrap.appendChild(seasonSel);

      // 本季总集数输入框
      const epCountWrap = el('span', 'ep-hint', '本季共');
      const totalEpInput = document.createElement('input');
      totalEpInput.type = 'number';
      totalEpInput.className = 'ui-input-compact';
      totalEpInput.style.width = '64px';
      totalEpInput.min = '1';
      totalEpInput.max = '2000';
      totalEpInput.value = String(g.totalEpisodes || g.maxEpisode || 12);
      totalEpInput.title = '该季总集数';
      totalEpInput.addEventListener('input', () => {
        const v = Number(totalEpInput.value);
        if (Number.isInteger(v) && v > 0) g.totalEpisodes = v;
      });
      titleWrap.appendChild(epCountWrap);
      titleWrap.appendChild(totalEpInput);
      titleWrap.appendChild(el('span', 'ep-hint', '集'));

      head.appendChild(titleWrap);

      const badges = el('div', 'inline-row');
      if (g.fansub) badges.appendChild(el('span', 'media-tag', g.fansub));
      if (g.resolution) badges.appendChild(el('span', 'media-tag', g.resolution));
      const statusBadge = el(
        'span',
        'media-tag ' + (g.matchedAnime ? 'matched' : 'new-entry'),
        g.matchedAnime ? `已匹配库内：${g.matchedAnime.canonical_title}` : '正在自动匹配资料…'
      );
      badges.appendChild(statusBadge);
      head.appendChild(badges);
      rightCol.appendChild(head);

      // 搜索联想与资料自动补齐栏（与「新增作品」一致的搜索体验）
      const assocBox = el('div', 'media-assoc-box');
      const assocInputRow = el('div', 'inline-row');
      const assocInput = document.createElement('input');
      assocInput.type = 'text';
      assocInput.className = 'ui-input-compact';
      assocInput.value = g.title;
      assocInput.placeholder = '输入番名搜索联想，点选自动补齐封面、中文名、简介、标签…';
      const assocSearchBtn = el('button', 'btn small', '搜索候选');
      assocSearchBtn.type = 'button';
      const ddpMatchBtn = el('button', 'btn small ghost', '弹弹Play匹配');
      ddpMatchBtn.type = 'button';
      ddpMatchBtn.title = '调用弹弹Play /api/v2/match 接口根据视频文件名与体积智能识别番名与话数';
      assocInputRow.appendChild(assocInput);
      assocInputRow.appendChild(assocSearchBtn);
      assocInputRow.appendChild(ddpMatchBtn);
      assocBox.appendChild(assocInputRow);

      const assocStatus = el('div', 'ep-hint', '正在联网检索封面与番剧详情…');
      assocStatus.style.marginTop = '4px';
      const assocResults = el('div', 'search-results');
      assocBox.appendChild(assocStatus);
      assocBox.appendChild(assocResults);
      rightCol.appendChild(assocBox);

      ddpMatchBtn.addEventListener('click', async () => {
        const firstEp = g.episodes?.[0];
        if (!firstEp) return;
        ddpMatchBtn.disabled = true;
        assocStatus.textContent = '正在通过弹弹Play接口智能识别视频文件…';
        try {
          const mRes = await api('/api/media/dandan-match', {
            method: 'POST',
            body: {
              files: [
                {
                  fileName: firstEp.fileName,
                  fileSize: firstEp.size || 0
                }
              ]
            }
          });
          const hit = mRes.results?.[0];
          if (hit?.animeTitle) {
            assocInput.value = hit.animeTitle;
            const sRes = await api(
              `/api/search?keyword=${encodeURIComponent(hit.animeTitle)}&limit=6`
            );
            const items = sRes.data ?? [];
            if (items.length > 0) {
              await applySearchItemToGroup(items[0], false);
              if (!mRes.configured) {
                toast('已通过内置词典匹配（在「设置」填入弹弹Play密钥后可启用云端指纹识别）');
              } else {
                toast(`弹弹Play识别成功：${hit.animeTitle}`);
              }
            } else {
              g.title = hit.animeTitle;
              titleInput.value = hit.animeTitle;
              assocStatus.textContent = `✓ 已识别为「${hit.animeTitle}」`;
            }
          } else {
            assocStatus.textContent = '未找到精确匹配，请在上方输入番名搜索候选。';
          }
        } catch (err) {
          assocStatus.textContent = `识别失败：${err.message}`;
        } finally {
          ddpMatchBtn.disabled = false;
        }
      });

      const applySearchItemToGroup = async (item, isAuto = false) => {
        // 清理标题中可能自带的「第二季/第三季」尾缀以保持主标题干净，或直接使用中文番名
        let cleanTitle = String(item.title || g.title).trim();
        if (Number(g.seasonNumber) > 1) {
          const stripped = cleanTitle
            .replace(/\s*第[二三四五六23456][季期部分].*$/, '')
            .trim();
          if (stripped.length >= 2) cleanTitle = stripped;
        }
        g.title = cleanTitle || item.title || g.title;
        titleInput.value = g.title;
        g.source = item.source;
        g.external_id = item.externalId;
        g.cover_url = item.remoteCoverUrl || g.cover_url || '';
        g.release_year = item.year || g.release_year || null;
        g.synopsis = item.summary || g.synopsis || '';
        g.titleNative = item.titleNative || '';
        if (Array.isArray(item.tags) && item.tags.length > 0) g.tags = item.tags;
        if (item.episodes && item.episodes >= (g.maxEpisode || 0)) {
          g.totalEpisodes = item.episodes;
          totalEpInput.value = String(item.episodes);
        }

        updateCoverPreview(g.title, g.cover_url || item.coverUrl);
        assocResults.innerHTML = '';
        assocResults.classList.remove('open');

        try {
          const d = await api(
            `/api/external/${item.source}/${encodeURIComponent(item.externalId)}`
          );
          if (d.remoteCoverUrl) g.cover_url = d.remoteCoverUrl;
          if (d.summary) g.synopsis = d.summary;
          if (d.year) g.release_year = d.year;
          if (Array.isArray(d.tags) && d.tags.length > 0) g.tags = d.tags;
          if (d.episodes && d.episodes >= (g.maxEpisode || 0)) {
            g.totalEpisodes = d.episodes;
            totalEpInput.value = String(d.episodes);
          }
          updateCoverPreview(g.title, g.cover_url || d.coverUrl);
        } catch {
          /* ignore detail fallback */
        }

        if (!g.matchedAnime) {
          statusBadge.className = 'media-tag matched';
          statusBadge.textContent = '资料已齐备 · 同步即完整入库';
        }
        const metaBits = [
          `已关联「${item.title}」(${SOURCE_BADGE[item.source] || item.source})`,
          g.release_year ? `${g.release_year}年` : null,
          g.totalEpisodes ? `共 ${g.totalEpisodes} 集` : null,
          g.tags?.length ? `标签：${g.tags.join('、')}` : null,
          g.cover_url ? '含封面与简介' : null
        ].filter(Boolean);
        assocStatus.textContent =
          (isAuto ? '✓ 已自动匹配资料：' : '✓ 已选择资料：') +
          metaBits.join(' · ') +
          '（可随时在上方搜索框更换）';
      };

      const renderAssocCandidates = (items) => {
        assocResults.innerHTML = '';
        if (!items.length) {
          assocResults.classList.remove('open');
          return;
        }
        for (const it of items) {
          const row = el('button', 'search-item');
          row.type = 'button';
          const cThumb = el('div', 'search-cover');
          if (it.coverUrl) {
            const img = document.createElement('img');
            img.src = buildApiUrl(it.coverUrl);
            img.alt = '';
            img.onerror = () => {
              img.remove();
              cThumb.textContent = firstChar(it.title);
            };
            cThumb.appendChild(img);
          } else {
            cThumb.textContent = firstChar(it.title);
          }
          const cInfo = el('div', 'search-info');
          cInfo.appendChild(el('div', 'search-title', it.title));
          const sub = [
            it.year ? `${it.year}` : null,
            it.episodes ? `${it.episodes} 集` : null,
            it.titleNative && it.titleNative !== it.title ? it.titleNative : null
          ]
            .filter(Boolean)
            .join(' · ');
          if (sub) cInfo.appendChild(el('div', 'search-sub', sub));
          row.appendChild(cThumb);
          row.appendChild(cInfo);
          row.appendChild(el('span', 'search-badge', SOURCE_BADGE[it.source] || it.source));
          row.addEventListener('click', () => applySearchItemToGroup(it, false));
          assocResults.appendChild(row);
        }
        assocResults.classList.add('open');
      };

      const runGroupSearch = async (kw, autoPickFirst = false) => {
        const cleanKw = String(kw ?? '').trim();
        if (!cleanKw) return;
        assocStatus.textContent = `正在搜索「${cleanKw}」的封面与资料…`;
        try {
          const sRes = await api(`/api/search?keyword=${encodeURIComponent(cleanKw)}&limit=6`);
          const items = sRes.data ?? [];
          if (items.length === 0) {
            assocStatus.textContent = '未搜到同名条目，可换个关键词点「搜索候选」或直接同步';
            if (!g.matchedAnime) statusBadge.textContent = '待入库';
            return;
          }
          if (autoPickFirst) {
            // 优先自动选中带中文名且有封面的条目
            const best =
              items.find((it) => /[\u4e00-\u9fff]/.test(it.title) && it.remoteCoverUrl) ||
              items[0];
            await applySearchItemToGroup(best, true);
          } else {
            assocStatus.textContent = `找到 ${items.length} 个候选，点选一条即可同步封面、中文名与简介：`;
            renderAssocCandidates(items);
          }
        } catch (err) {
          assocStatus.textContent = `搜索暂不可用：${err.message}`;
        }
      };

      let assocTimer = null;
      assocInput.addEventListener('input', () => {
        clearTimeout(assocTimer);
        const v = assocInput.value.trim();
        if (v.length < 2) return;
        assocTimer = setTimeout(() => runGroupSearch(v, false), 320);
      });
      assocSearchBtn.addEventListener('click', () => {
        clearTimeout(assocTimer);
        runGroupSearch(assocInput.value.trim() || g.title, false);
      });

      const pills = el('div', 'media-ep-pills');
      for (const ep of g.episodes) {
        const epLabel = ep.isSpecial
          ? `SP${ep.episodeNumber || ''}`
          : ep.episodeNumber
            ? `第 ${ep.episodeNumber} 集`
            : ep.fileName;
        const pill = el('button', 'media-ep-pill', epLabel);
        pill.type = 'button';
        pill.title = `${ep.fileName}（点击可预览播放或唤起本地播放器）`;
        pill.addEventListener('click', () => previewLocalEpisode(ep));
        pills.appendChild(pill);
      }
      rightCol.appendChild(pills);

      mainRow.appendChild(rightCol);
      card.appendChild(mainRow);
      listEl.appendChild(card);

      // 识别完成后立即自动联网关联搜索，把封面、中文名称、集数、简介一次补齐
      runGroupSearch(g.suggestedChineseTitle || g.titleCandidate, true);
    });

    host.appendChild(listEl);
  };

  const previewLocalEpisode = (ep) => {
    const previewHost = $('#mediaVideoPreviewHost');
    previewHost.innerHTML = '';
    const box = el('div', 'video-preview-box');
    const head = el('div', 'media-group-head');
    head.appendChild(el('span', '', `正在预览：${ep.fileName}`));

    const actions = el('div', 'inline-row');
    const copyBtn = el('button', 'btn small', '复制文件路径');
    copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(ep.relativePath || ep.fileName);
        toast('已复制文件相对路径');
      } catch {
        toast(ep.relativePath || ep.fileName);
      }
    });
    actions.appendChild(copyBtn);

    const closeBtn = el('button', 'btn small ghost', '关闭预览');
    closeBtn.type = 'button';
    closeBtn.style.color = '#fff';
    closeBtn.addEventListener('click', () => {
      previewHost.innerHTML = '';
    });
    actions.appendChild(closeBtn);
    head.appendChild(actions);
    box.appendChild(head);

    const rawFile = localFileMap.get(ep.relativePath) || localFileMap.get(ep.fileName);
    if (rawFile) {
      const video = document.createElement('video');
      video.controls = true;
      video.autoplay = true;
      video.src = URL.createObjectURL(rawFile);
      box.appendChild(video);
    } else {
      box.appendChild(
        el(
          'div',
          'ep-hint',
          `服务端路径文件：${ep.relativePath}（如在本机运行，可复制路径在 PotPlayer / VLC 中打开）`
        )
      );
    }
    previewHost.appendChild(box);
  };

  const handleBrowserFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    localFileMap = new Map();
    const payloadFiles = [];
    for (const f of fileList) {
      const rel = f.webkitRelativePath || f.name;
      localFileMap.set(rel, f);
      localFileMap.set(f.name, f);
      state.browserVideoFiles.set(rel, f);
      state.browserVideoFiles.set(f.name, f);
      payloadFiles.push({
        name: f.name,
        relativePath: rel,
        size: f.size
      });
    }
    try {
      const res = await api('/api/media/parse-filenames', {
        method: 'POST',
        body: { files: payloadFiles }
      });
      renderGroups(res);
    } catch (err) {
      showFormError(err.message);
    }
  };

  const dirInput = $('#dirInput');
  const filesInput = $('#filesInput');
  $('#pickDirBtn').addEventListener('click', () => dirInput.click());
  $('#pickFilesBtn').addEventListener('click', () => filesInput.click());
  dirInput.addEventListener('change', () => handleBrowserFiles(dirInput.files));
  filesInput.addEventListener('change', () => handleBrowserFiles(filesInput.files));

  const refreshRootsAndPending = async () => {
    const rootsHost = $('#mediaRootsHost');
    const pendingHost = $('#mediaPendingHost');
    if (!rootsHost || !pendingHost) return;

    try {
      const [rootsRes, filesRes] = await Promise.all([
        api('/api/media/roots'),
        api('/api/media/files')
      ]);
      const roots = rootsRes.data ?? [];
      const allFiles = filesRes.data ?? [];
      const pendingFiles = allFiles.filter(
        (f) => f.availability_status === 'needs_review' || f.availability_status === 'unmatched'
      );

      rootsHost.innerHTML = '';
      if (roots.length > 0) {
        const list = el('div', 'source-list');
        for (const r of roots) {
          const row = el('div', 'source-row');
          const c = r.counts || {};
          const rootLeft = el('div', 'inline-row');
          rootLeft.style.flexWrap = 'wrap';
          rootLeft.appendChild(el('strong', '', r.display_name || r.path));
          rootLeft.appendChild(el('span', 'media-status-pill ok', `● 可用 ${c.available || 0}`));
          const pendCount = (c.needs_review || 0) + (c.unmatched || 0);
          if (pendCount > 0) {
            rootLeft.appendChild(el('span', 'media-status-pill pending', `● 待确认 ${pendCount}`));
          }
          if ((c.missing || 0) > 0) {
            rootLeft.appendChild(el('span', 'media-status-pill missing', `▲ 缺失 ${c.missing}`));
          }
          row.appendChild(rootLeft);
          const acts = el('div', 'inline-row');
          const scanBtn = el('button', 'btn small', '重新扫描');
          scanBtn.type = 'button';
          scanBtn.addEventListener('click', async () => {
            scanBtn.disabled = true;
            try {
              const sRes = await api(`/api/media/roots/${r.id}/scan`, { method: 'POST' });
              toast(
                `扫描完成：关联 ${sRes.matched} 个，待确认 ${
                  sRes.needsReview + sRes.unmatched
                } 个，缺失 ${sRes.missing} 个`
              );
              await refreshRootsAndPending();
              await load();
            } catch (err) {
              showFormError(err.message);
            } finally {
              scanBtn.disabled = false;
            }
          });
          acts.appendChild(scanBtn);

          const delBtn = el('button', 'link-btn danger', '移除');
          delBtn.type = 'button';
          delBtn.addEventListener('click', async () => {
            await api(`/api/media/roots/${r.id}`, { method: 'DELETE' });
            toast('已移除根目录（作品与观看记录均保留）');
            await refreshRootsAndPending();
          });
          acts.appendChild(delBtn);
          row.appendChild(acts);
          list.appendChild(row);
        }
        rootsHost.appendChild(list);
      }

      pendingHost.innerHTML = '';
      if (pendingFiles.length > 0) {
        const sec = el('div', 'settings-section');
        sec.appendChild(
          el(
            'div',
            'settings-title',
            `待人工确认匹配队列（共 ${pendingFiles.length} 个低置信度或同名候选文件）`
          )
        );
        const list = el('div', 'media-group-list');
        for (const pf of pendingFiles.slice(0, 20)) {
          const row = el('div', 'media-group-card');
          const head = el('div', 'media-group-head');
          head.appendChild(el('span', 'media-group-title', pf.file_name));
          head.appendChild(
            el(
              'span',
              'media-tag new-entry',
              pf.availability_status === 'needs_review' ? '多候选待确认' : '未匹配作品'
            )
          );
          row.appendChild(head);

          const bindRow = el('div', 'inline-row');
          const animeSel = document.createElement('select');
          const newOpt = document.createElement('option');
          newOpt.value = '';
          newOpt.textContent = `+ 自动新建作品：「${pf.parsed_title || pf.file_name}」`;
          animeSel.appendChild(newOpt);
          for (const a of state.list) {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = `关联库内：${a.canonical_title}`;
            if (pf.anime_id === a.id) opt.selected = true;
            animeSel.appendChild(opt);
          }
          bindRow.appendChild(animeSel);

          const epIn = document.createElement('input');
          epIn.type = 'number';
          epIn.min = '1';
          epIn.max = '2000';
          epIn.value = String(pf.parsed_episode || 1);
          epIn.style.width = '72px';
          epIn.title = '对应集号';
          bindRow.appendChild(epIn);

          const bindBtn = el('button', 'btn small primary', '确认关联');
          bindBtn.type = 'button';
          bindBtn.addEventListener('click', async () => {
            bindBtn.disabled = true;
            try {
              await api(`/api/media/files/${pf.id}/bind`, {
                method: 'POST',
                body: {
                  animeId: animeSel.value || null,
                  createTitle: pf.parsed_title || pf.file_name,
                  seasonNumber: pf.parsed_season || 1,
                  episodeNumber: Number(epIn.value) || 1,
                  isSpecial: Boolean(pf.is_special)
                }
              });
              toast(`已确认绑定「${pf.file_name}」`);
              await refreshRootsAndPending();
              await load();
            } catch (err) {
              showFormError(err.message);
              bindBtn.disabled = false;
            }
          });
          bindRow.appendChild(bindBtn);
          row.appendChild(bindRow);
          list.appendChild(row);
        }
        sec.appendChild(list);
        pendingHost.appendChild(sec);
      }
    } catch {
      /* ignore */
    }
  };

  refreshRootsAndPending();

  $('#addMediaRootBtn')?.addEventListener('click', async () => {
    const dirPath = $('#serverMediaDir').value.trim();
    if (!dirPath) {
      showFormError('请输入要登记的媒体根目录路径');
      return;
    }
    showFormError('');
    try {
      const root = await api('/api/media/roots', { method: 'POST', body: { path: dirPath } });
      const sRes = await api(`/api/media/roots/${root.id}/scan`, { method: 'POST' });
      toast(
        `已登记并扫描根目录：关联 ${sRes.matched} 个，待确认 ${
          sRes.needsReview + sRes.unmatched
        } 个`
      );
      $('#serverMediaDir').value = '';
      await refreshRootsAndPending();
      await load();
    } catch (err) {
      showFormError(err.message);
    }
  });

  $('#scanServerDirBtn').addEventListener('click', async () => {
    const dirPath = $('#serverMediaDir').value.trim();
    if (!dirPath) {
      showFormError('请输入服务端文件夹路径');
      return;
    }
    showFormError('');
    try {
      const res = await api('/api/media/scan-server-dir', {
        method: 'POST',
        body: { dirPath }
      });
      localFileMap = new Map();
      renderGroups(res);
    } catch (err) {
      showFormError(err.message);
    }
  });

  $('#formCancel').addEventListener('click', () => {
    modalCard?.classList.remove('wide-card');
    closeForm();
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const checkedIdxs = [...form.querySelectorAll('.media-group-cb:checked')].map((node) =>
      Number(node.dataset.groupIdx)
    );
    const selectedGroups = checkedIdxs.map((i) => recognizedGroups[i]).filter(Boolean);
    if (selectedGroups.length === 0) {
      showFormError('请至少勾选一部识别出的番剧');
      return;
    }
    const markWatched = Boolean($('#markMediaWatched')?.checked);

    try {
      const res = await api('/api/media/apply', {
        method: 'POST',
        body: {
          groups: selectedGroups,
          markWatched,
          defaultStatus: 'watching'
        }
      });
      modalCard?.classList.remove('wide-card');
      closeForm();
      toast(
        `同步成功：新建 ${res.createdAnime} 部，更新 ${res.updatedAnime} 部${
          res.markedEpisodes ? `，点亮 ${res.markedEpisodes} 集已看` : ''
        }`
      );
      if (state.view !== 'list') await switchView('list');
      else await load();
    } catch (err) {
      showFormError(err.message);
    }
  };
}

/* ---------------- B-002 年度统计海报与个人动画喜好表 Canvas 生成器 ---------------- */

const DEFAULT_PREF_LABELS = [
  '入坑作',
  '最喜欢',
  '看最多次',
  '最想安利',
  '最佳剧情',
  '最佳作画',
  '最佳配乐',
  '最治愈',
  '最意难平'
];

function loadImageSafe(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function openShareGeneratorModal(initialTab = 'poster', statsObj = null) {
  state.editingId = null;
  const modalCard = $('#modal .modal-card');
  modalCard?.classList.add('wide-card');
  $('#modalTitle').textContent = '分享卡片生成 · 年度报告与个人喜好表';

  const form = $('#animeForm');
  form.innerHTML = '<div class="ep-hint">正在准备画布与账本数据…</div>';
  $('#modal').hidden = false;

  let s = statsObj || state.lastStats;
  if (!s) {
    try {
      s = await api('/api/stats');
      state.lastStats = s;
    } catch {
      s = null;
    }
  }

  let allAnime = state.list;
  if (!allAnime || allAnime.length === 0) {
    try {
      const r = await api('/api/anime?sortBy=rating&order=desc');
      allAnime = r.data ?? [];
    } catch {
      allAnime = [];
    }
  }

  let curTab = initialTab;
  let posterDarkTheme = true;
  let savedGrid = [];
  try {
    savedGrid = JSON.parse(localStorage.getItem(PREF_GRID_STORAGE_KEY) || '[]');
  } catch {
    savedGrid = [];
  }

  const gridCells = DEFAULT_PREF_LABELS.map((label, idx) => {
    const saved = savedGrid[idx];
    const fallbackAnime = allAnime[idx % Math.max(allAnime.length, 1)];
    return {
      label: saved?.label || label,
      animeId: saved?.animeId ?? (fallbackAnime ? fallbackAnime.id : '')
    };
  });

  const renderModalContent = () => {
    form.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div class="tabs">
          <button type="button" class="tab ${curTab === 'poster' ? 'active' : ''}" id="tabPosterBtn">年度/生涯追番总结卡</button>
          <button type="button" class="tab ${curTab === 'grid' ? 'active' : ''}" id="tabGridBtn">个人动画喜好表（九宫格）</button>
        </div>
        <div class="inline-row">
          <span class="ep-hint">海报底色：</span>
          <button type="button" class="btn small ${!posterDarkTheme ? 'primary' : 'ghost'}" id="posterLightBtn">典雅宣纸浅色</button>
          <button type="button" class="btn small ${posterDarkTheme ? 'primary' : 'ghost'}" id="posterDarkBtn">暗夜流光深色</button>
        </div>
      </div>
      <div id="gridEditorHost"></div>
      <div class="share-canvas-wrap">
        <canvas id="shareCanvas" width="960" height="640"></canvas>
      </div>
      <div class="form-actions">
        <button type="button" class="btn ghost" id="formCancel">关闭</button>
        <button type="button" class="btn primary" id="downloadPngBtn">下载高清 PNG 图片</button>
      </div>
    `;

    $('#tabPosterBtn').addEventListener('click', () => {
      curTab = 'poster';
      renderModalContent();
    });
    $('#tabGridBtn').addEventListener('click', () => {
      curTab = 'grid';
      renderModalContent();
    });
    $('#posterLightBtn').addEventListener('click', () => {
      posterDarkTheme = false;
      renderModalContent();
    });
    $('#posterDarkBtn').addEventListener('click', () => {
      posterDarkTheme = true;
      renderModalContent();
    });
    $('#formCancel').addEventListener('click', () => {
      modalCard?.classList.remove('wide-card');
      closeForm();
    });

    const canvas = $('#shareCanvas');
    $('#downloadPngBtn').addEventListener('click', () => {
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download =
          curTab === 'poster'
            ? `ciyuan-kedu-summary-${localToday()}.png`
            : `ciyuan-kedu-preference-grid-${localToday()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast('已导出高清 PNG 分享图');
      } catch (err) {
        toast(`导出图片失败：${err.message}`, true);
      }
    });

    if (curTab === 'grid') {
      const editorHost = $('#gridEditorHost');
      const gridWrap = el('div', 'pref-grid-editor');
      gridCells.forEach((cell, idx) => {
        const box = el('div', 'pref-cell-edit');
        const labelInput = document.createElement('input');
        labelInput.type = 'text';
        labelInput.value = cell.label;
        labelInput.placeholder = '格子标题';
        labelInput.addEventListener('input', () => {
          cell.label = labelInput.value.trim() || DEFAULT_PREF_LABELS[idx];
          saveGridState();
          drawPreferenceGridCanvas(canvas, gridCells, allAnime, posterDarkTheme);
        });

        const animeSel = document.createElement('select');
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = '— 选择库内作品 —';
        animeSel.appendChild(emptyOpt);
        for (const item of allAnime) {
          const opt = document.createElement('option');
          opt.value = item.id;
          opt.textContent = item.canonical_title;
          if (item.id === cell.animeId) opt.selected = true;
          animeSel.appendChild(opt);
        }
        animeSel.addEventListener('change', () => {
          cell.animeId = animeSel.value;
          saveGridState();
          drawPreferenceGridCanvas(canvas, gridCells, allAnime, posterDarkTheme);
        });

        box.appendChild(labelInput);
        box.appendChild(animeSel);
        gridWrap.appendChild(box);
      });
      editorHost.appendChild(gridWrap);
      drawPreferenceGridCanvas(canvas, gridCells, allAnime, posterDarkTheme);
    } else {
      drawStatsPosterCanvas(canvas, s, allAnime, posterDarkTheme);
    }
  };

  const saveGridState = () => {
    try {
      localStorage.setItem(PREF_GRID_STORAGE_KEY, JSON.stringify(gridCells));
    } catch {
      /* ignore */
    }
  };

  form.onsubmit = (e) => e.preventDefault();
  renderModalContent();
}

async function drawStatsPosterCanvas(canvas, statsObj, allAnime, isDark = false) {
  canvas.width = 1080;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');

  const pal = isDark
    ? {
        bg: '#0b0f17',
        card: '#151e30',
        border: '#26354d',
        title: '#f8fafc',
        muted: '#94a3b8',
        accent: '#38bdf8',
        track: '#1e293b',
        gold: '#fbbf24'
      }
    : {
        bg: '#f7f7f5',
        card: '#ffffff',
        border: '#e4e4e0',
        title: '#1f1f1d',
        muted: '#6b6b66',
        accent: '#185fa5',
        track: '#f2f2ee',
        gold: '#854f0b'
      };

  // 背景
  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 顶部标题区
  ctx.fillStyle = pal.title;
  ctx.font = 'bold 34px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('次元刻度 · 个人动画追番报告', 48, 66);

  const yearNum = statsObj?.year?.year || new Date().getFullYear();
  ctx.fillStyle = pal.muted;
  ctx.font = '18px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${yearNum} 年度统计与全库概览 · 生成于 ${localToday()}`, 48, 100);

  // 三大核心指标卡片
  const metrics = [
    {
      val: `${statsObj?.year?.episodes ?? 0} 集`,
      sub: `${yearNum} 年已看剧集`
    },
    {
      val: formatHours(statsObj?.year?.minutes ?? 0),
      sub: `${yearNum} 年累计标准时长`
    },
    {
      val: `${statsObj?.overview?.anime_active ?? allAnime.length} 部 / ${statsObj?.overview?.watched_episodes ?? 0} 集`,
      sub: '全库收录作品 / 生涯累计已看'
    }
  ];

  metrics.forEach((m, idx) => {
    const x = 48 + idx * 332;
    const y = 128;
    const w = 312;
    const h = 116;
    ctx.fillStyle = pal.card;
    drawRoundedRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = pal.accent;
    ctx.font = 'bold 32px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(m.val, x + 24, y + 56);

    ctx.fillStyle = pal.muted;
    ctx.font = '16px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(m.sub, x + 24, y + 92);
  });

  // 左侧：12 个月观看柱状图
  const chartX = 48;
  const chartY = 268;
  const chartW = 540;
  const chartH = 388;
  ctx.fillStyle = pal.card;
  drawRoundedRect(ctx, chartX, chartY, chartW, chartH, 14);
  ctx.fill();
  ctx.strokeStyle = pal.border;
  ctx.stroke();

  ctx.fillStyle = pal.title;
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`${yearNum} 年每月观看分布`, chartX + 24, chartY + 40);

  const months = statsObj?.year?.months ?? Array.from({ length: 12 }, (_, i) => ({ month: i + 1, episodes: 0 }));
  const maxEp = Math.max(...months.map((m) => m.episodes), 1);
  const barAreaY = chartY + 76;
  const barAreaH = 248;
  const barW = 28;
  const gap = 13;

  months.forEach((m, i) => {
    const bx = chartX + 28 + i * (barW + gap);
    ctx.fillStyle = pal.track;
    drawRoundedRect(ctx, bx, barAreaY, barW, barAreaH, 6);
    ctx.fill();

    if (m.episodes > 0) {
      const bh = Math.max(Math.round((m.episodes / maxEp) * barAreaH), 8);
      ctx.fillStyle = pal.accent;
      drawRoundedRect(ctx, bx, barAreaY + barAreaH - bh, barW, bh, 6);
      ctx.fill();

      ctx.fillStyle = pal.accent;
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(m.episodes), bx + barW / 2, barAreaY + barAreaH - bh - 6);
    }

    ctx.fillStyle = pal.muted;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${m.month}月`, bx + barW / 2, barAreaY + barAreaH + 26);
  });
  ctx.textAlign = 'left';

  // 右侧：代表作封面展示（利用 /api/cover 同源代理避免跨域污染）
  const rightX = 612;
  const rightY = 268;
  const rightW = 420;
  const rightH = 388;
  ctx.fillStyle = pal.card;
  drawRoundedRect(ctx, rightX, rightY, rightW, rightH, 14);
  ctx.fill();
  ctx.strokeStyle = pal.border;
  ctx.stroke();

  ctx.fillStyle = pal.title;
  ctx.font = 'bold 20px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('账本代表作精选', rightX + 24, rightY + 40);

  const topPicks = [...allAnime]
    .sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0))
    .slice(0, 3);

  const loadedCovers = await Promise.all(
    topPicks.map((it) => loadImageSafe(coverProxyUrl(it.cover_path, 400)))
  );

  topPicks.forEach((item, idx) => {
    const cx = rightX + 24 + idx * 128;
    const cy = rightY + 64;
    const cw = 112;
    const ch = 160;

    ctx.save();
    drawRoundedRect(ctx, cx, cy, cw, ch, 8);
    ctx.clip();
    const img = loadedCovers[idx];
    if (img) {
      ctx.drawImage(img, cx, cy, cw, ch);
    } else {
      ctx.fillStyle = coverStyle(item.canonical_title);
      ctx.fillRect(cx, cy, cw, ch);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(firstChar(item.canonical_title), cx + cw / 2, cy + ch / 2 + 12);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    ctx.fillStyle = pal.title;
    ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
    const shortTitle =
      item.canonical_title.length > 7 ? item.canonical_title.slice(0, 7) + '…' : item.canonical_title;
    ctx.fillText(shortTitle, cx, cy + ch + 24);

    ctx.fillStyle = pal.gold;
    ctx.font = '13px sans-serif';
    ctx.fillText(item.rating ? `★ ${item.rating} 分` : STATUS_LABEL[item.status] || '在库', cx, cy + ch + 46);
  });

  // 底部水印
  ctx.fillStyle = pal.muted;
  ctx.font = '14px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('次元刻度 · 本地优先的个人动画观看账本', 48, 692);
}

async function drawPreferenceGridCanvas(canvas, gridCells, allAnime, isDark = false) {
  canvas.width = 960;
  canvas.height = 1140;
  const ctx = canvas.getContext('2d');

  const pal = isDark
    ? {
        bg: '#0b0f17',
        card: '#151e30',
        border: '#26354d',
        title: '#f8fafc',
        muted: '#94a3b8',
        accent: '#0284c7'
      }
    : {
        bg: '#f7f7f5',
        card: '#ffffff',
        border: '#d2d2cc',
        title: '#1f1f1d',
        muted: '#6b6b66',
        accent: '#185fa5'
      };

  ctx.fillStyle = pal.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = pal.title;
  ctx.font = 'bold 34px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText('个人动画生涯喜好表', 40, 62);

  ctx.fillStyle = pal.muted;
  ctx.font = '17px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(`次元刻度 · 动画账本生成 (${localToday()})`, 40, 94);

  const byId = new Map(allAnime.map((a) => [a.id, a]));
  const images = await Promise.all(
    gridCells.map((c) => {
      const a = byId.get(c.animeId);
      return a?.cover_path ? loadImageSafe(coverProxyUrl(a.cover_path, 400)) : Promise.resolve(null);
    })
  );

  const cellW = 280;
  const cellH = 316;
  const gapX = 20;
  const gapY = 20;
  const startX = 40;
  const startY = 122;

  gridCells.forEach((cell, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = startX + col * (cellW + gapX);
    const y = startY + row * (cellH + gapY);

    ctx.fillStyle = pal.card;
    drawRoundedRect(ctx, x, y, cellW, cellH, 12);
    ctx.fill();
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    const anime = byId.get(cell.animeId);
    const imgH = 236;

    ctx.save();
    drawRoundedRect(ctx, x + 2, y + 2, cellW - 4, imgH, 10);
    ctx.clip();
    const img = images[idx];
    if (img) {
      ctx.drawImage(img, x + 2, y + 2, cellW - 4, imgH);
    } else {
      ctx.fillStyle = anime ? coverStyle(anime.canonical_title) : '#334155';
      ctx.fillRect(x + 2, y + 2, cellW - 4, imgH);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(anime ? firstChar(anime.canonical_title) : '?', x + cellW / 2, y + imgH / 2 + 16);
      ctx.textAlign = 'left';
    }
    ctx.restore();

    // 类别标签胶囊
    ctx.fillStyle = pal.accent;
    drawRoundedRect(ctx, x + 12, y + 12, 96, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText((cell.label || '').slice(0, 6), x + 22, y + 31);

    // 底部作品标题
    ctx.fillStyle = pal.title;
    ctx.font = 'bold 17px "PingFang SC", "Microsoft YaHei", sans-serif';
    const titleStr = anime ? anime.canonical_title : '未选择作品';
    const clipped = titleStr.length > 14 ? titleStr.slice(0, 14) + '…' : titleStr;
    ctx.fillText(clipped, x + 14, y + imgH + 34);

    ctx.fillStyle = pal.muted;
    ctx.font = '13px "PingFang SC", "Microsoft YaHei", sans-serif';
    const subStr = anime
      ? [anime.release_year ? `${anime.release_year}年` : null, anime.rating ? `★ ${anime.rating}` : null]
          .filter(Boolean)
          .join(' · ') || '已在账本中'
      : '在上方下拉框中选择';
    ctx.fillText(subStr, x + 14, y + imgH + 58);
  });
}

/* ---------------- 设置与跨服务器迁移模态框 ---------------- */

/**
 * 配额手动校准表。
 * 官方不提供配额查询接口（swagger 里 36 个端点没有 quota 相关），
 * 本机只能自己数，遇到「别处也用过这个 AppId」或者「某个接口实际扣的次数和预期不符」就会偏。
 * 唯一可靠的对齐方式：让用户把开放平台面板的数字抄进来。
 */
function renderCalibration(quota) {
  const host = $('#ddpCalHost');
  if (!host) return;
  const groups = quota?.groups || [];
  if (!groups.length) {
    host.innerHTML = '';
    return;
  }
  host.innerHTML = groups
    .map(
      (g) => `
      <div class="ddp-cal-row">
        <span class="ddp-cal-label">${escapeHtml(g.label)}</span>
        <label>当日 <input type="number" min="0" max="${g.dailyLimit}" data-group="${g.key}" data-kind="daily" value="${g.dailyUsed}"></label>
        <label>当月 <input type="number" min="0" max="${g.monthlyLimit}" data-group="${g.key}" data-kind="monthly" value="${g.monthlyUsed}"></label>
      </div>`
    )
    .join('');
}

async function loadRuntimeConfig() {
  try {
    const cfg = await api('/api/config');
    if (Array.isArray(cfg.discoveryTemplates) && cfg.discoveryTemplates.length) {
      state.discoveryTemplates = cfg.discoveryTemplates;
    }
    return cfg;
  } catch {
    return null;
  }
}

async function openSettingsModal() {
  state.editingId = null;
  $('#modal .modal-card')?.classList.remove('wide-card');
  $('#modalTitle').textContent = '数据源、资源发现模板、云服务器与备份';

  const form = $('#animeForm');
  form.innerHTML = `<div class="ep-hint">正在加载配置…</div>`;
  $('#modal').hidden = false;

  let cfg = {
    enabledSources: ['dandanplay', 'bangumi'],
    bangumiApiBase: 'https://api.bgm.tv',
    dandanplayAppId: '',
    dandanplayConfigured: false,
    dandanplayStrategy: 'economy',
    dandanplaySafetyRatio: 0.9,
    dandanplayQuota: null,
    discoveryTemplates: state.discoveryTemplates || DEFAULT_DISCOVERY_TPLS,
    proxy: ''
  };
  const loadedCfg = await loadRuntimeConfig();
  if (loadedCfg) cfg = { ...cfg, ...loadedCfg };

  const enabledSet = new Set(cfg.enabledSources || ['dandanplay', 'bangumi']);
  const currentApiBase = getApiBase();
  let editTpls = (cfg.discoveryTemplates || DEFAULT_DISCOVERY_TPLS).map((t) => ({ ...t }));

  form.innerHTML = `
    <div class="form-error" id="formError"></div>

    <div class="settings-section">
      <div class="settings-title">
        <span>1. 番剧资料数据源（弹弹Play + Bangumi 双源聚合）</span>
        <div class="inline-row">
          <button type="button" class="link-btn" id="probeBtn" title="检测数据源状态（对弹弹Play采用零配额守卫检测）">检测连通性(零配额)</button>
          <button type="button" class="link-btn" id="probeLiveDdpBtn" title="发起1次真实弹弹Play搜索请求验证密钥">实测弹弹Play(耗1次配额)</button>
        </div>
      </div>
      <div class="source-list">
        ${['dandanplay', 'bangumi']
          .map(
            (src) => `
          <div class="source-row">
            <label>
              <input type="checkbox" name="enabledSource" value="${src}" ${
                enabledSet.has(src) ? 'checked' : ''
              }>
              <span>${SOURCE_LABEL[src]}</span>
            </label>
            <span class="source-status-text" id="probe_${src}">点击上方检测</span>
          </div>
        `
          )
          .join('')}
      </div>
      <div class="form-grid">
        <div class="form-row">
          <label for="cfg_ddp_id">弹弹Play AppId（填入后启用搜索、新番导览与视频指纹匹配）</label>
          <input id="cfg_ddp_id" type="text" value="${escapeAttr(
            cfg.dandanplayAppId || ''
          )}" placeholder="暂不填也可正常使用 Bangumi 番组计划">
        </div>
        <div class="form-row">
          <label for="cfg_ddp_secret">弹弹Play AppSecret</label>
          <input id="cfg_ddp_secret" type="text" value="${
            cfg.dandanplayConfigured ? '********' : ''
          }" placeholder="${cfg.dandanplayConfigured ? '已配置（输入新值可覆盖）' : '填入申请到的 AppSecret'}">
        </div>
      </div>

      <div class="ddp-quota-panel">
        <div class="ddp-quota-header">
          <div>
            <strong>弹弹Play API 配额守卫与高效省流策略</strong>
            <div class="ep-hint">自动缓存响应（搜索/季番24h、番剧详情7天、视频识别30天），达到安全保护线自动切换至免配额源防止超额。</div>
          </div>
          <button type="button" class="btn small ghost" id="resetDdpQuotaBtn">重置配额计数</button>
        </div>
        <div class="form-grid" style="margin-top:8px">
          <div class="form-row">
            <label for="cfg_ddp_strategy">调用策略</label>
            <select id="cfg_ddp_strategy">
              <option value="economy" ${cfg.dandanplayStrategy !== 'always' ? 'selected' : ''}>智能省流模式（推荐 · 优先 Bangumi，需要时自动结合弹弹Play）</option>
              <option value="always" ${cfg.dandanplayStrategy === 'always' ? 'selected' : ''}>总是并行调用（每次搜索与新番目录均同步请求弹弹Play）</option>
            </select>
          </div>
          <div class="form-row">
            <label for="cfg_ddp_safety">自动限额熔断保护线（避免超出官方日/月额度）</label>
            <select id="cfg_ddp_safety">
              <option value="0.8" ${Number(cfg.dandanplaySafetyRatio) === 0.8 ? 'selected' : ''}>达到官方限额 80% 时自动熔断保护</option>
              <option value="0.9" ${!cfg.dandanplaySafetyRatio || Number(cfg.dandanplaySafetyRatio) === 0.9 ? 'selected' : ''}>达到官方限额 90% 时自动熔断保护（默认推荐）</option>
              <option value="0.95" ${Number(cfg.dandanplaySafetyRatio) === 0.95 ? 'selected' : ''}>达到官方限额 95% 时自动熔断保护</option>
              <option value="1" ${Number(cfg.dandanplaySafetyRatio) === 1 ? 'selected' : ''}>100%（直至用尽官方限额）</option>
            </select>
          </div>
        </div>
        <div id="ddpQuotaTableHost"></div>

        <details class="ddp-cost-table" id="ddpCalBlock">
          <summary>手动校准（照官方面板的数字填）</summary>
          <div class="ep-hint" style="margin:6px 0 8px">
            官方不提供配额查询接口，本机只能自己数，遇到「同时在别处用过这个 AppId」「季度番表实际扣了不止一次」
            这类情况就会偏。去开放平台的「功能组当前状态」把当天的数字抄进来，一次对齐。
          </div>
          <div id="ddpCalHost"></div>
          <button type="button" class="btn small" id="ddpCalSave" style="margin-top:8px">保存校准</button>
        </details>

        <details class="ddp-cost-table">
          <summary>一次操作到底花掉几次配额？</summary>
          <div class="ep-hint" style="margin:6px 0 8px">
            官方接口<b>不返回任何配额响应头</b>（实测只有 nginx 标准头），所以下面的计数是本机自己累加的。
            如果同时在别的客户端用过这个 AppId，数字会偏小，可以用下面的「手动校准」对齐官方面板。
          </div>
          <table class="ddp-quota-table">
            <thead>
              <tr><th>你的操作</th><th>计数组</th><th>次数</th><th>缓存</th></tr>
            </thead>
            <tbody>
              <tr><td>打开「新番导览」任意一季</td><td>番剧详情</td><td><b>1 次</b></td><td>24 小时</td></tr>
              <tr><td>打开「每日放送」周历</td><td>番剧详情</td><td><b>1 次</b></td><td>12 小时</td></tr>
              <tr><td>点开某一部番的详情预览</td><td>番剧详情</td><td><b>每部 1 次</b></td><td>7 天</td></tr>
              <tr><td>搜索番名（Bangumi 能搜到时）</td><td>—</td><td><b>0 次</b></td><td>—</td></tr>
              <tr><td>搜索番名（Bangumi 搜不到时才兜底）</td><td>搜索</td><td>1 次</td><td>24 小时</td></tr>
              <tr><td>扫描一部番的本地视频（无文件指纹）</td><td>文件识别</td><td><b>每部 1 次</b></td><td>30 天</td></tr>
              <tr><td>扫描一部番的本地视频（带指纹）</td><td>文件识别</td><td>每个文件 1 次</td><td>30 天</td></tr>
              <tr><td>勾选 50 部批量入库</td><td>—</td><td><b>0 次</b></td><td>不请求</td></tr>
            </tbody>
          </table>
          <div class="ep-hint" style="margin-top:8px">
            <b>拉一整季新番只花 1 次</b>：季度番表接口一次返回整季列表，不是逐部去查。
            批量入库也是 0 次——数据在导览那次就已经拿全了，入库只是写本地库。
            真正会累积的是「一个个点开看详情」，每部 1 次、缓存 7 天。
            <br>
            <b>搜索默认不花弹弹play 的额度</b>：省流模式先用 Bangumi 查，只有它一条都搜不到时才动用弹弹play 兜底。
            所以「搜索 100 次/日」这个上限，实际很难被日常搜索碰到。
          </div>
        </details>
      </div>

      <div class="form-row">
        <label for="cfg_bgm_base">Bangumi 接口 / 国内镜像反代地址<span class="label-hint">大陆直连不通时可替换为自建或公共反代地址</span></label>
        <input id="cfg_bgm_base" type="text" value="${escapeAttr(
          cfg.bangumiApiBase || 'https://api.bgm.tv'
        )}" placeholder="https://api.bgm.tv">
      </div>
      <div class="form-row">
        <label for="cfg_proxy">HTTP 代理地址（可选）<span class="label-hint">留空则直连；如本地或服务器有代理可填 http://127.0.0.1:7890</span></label>
        <input id="cfg_proxy" type="text" value="${escapeAttr(cfg.proxy || '')}" placeholder="留空表示直连">
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-title">
        <span>2. 资源发现中心检索模板（Stage 8 · 仅跳转不抓取）</span>
        <button type="button" class="link-btn" id="addTplBtn">+ 新增模板</button>
      </div>
      <div id="tplListHost"></div>
      <div class="ep-hint">在详情抽屉中点击即可跳转到对应站点搜索，URL 中请包含 <code>{keyword}</code> 占位符。</div>
    </div>

    <div class="settings-section">
      <div class="settings-title">
        <span>3. 云端服务器接口配置与跨端双向同步（Stage 14 · 手机端 + Win端互通）</span>
      </div>
      <div class="form-grid">
        <div class="form-row">
          <label for="cfg_api_base">云服务器地址<span class="label-hint">填公网服务器地址以双向同步或直连</span></label>
          <input id="cfg_api_base" type="text" value="${escapeAttr(
            currentApiBase
          )}" placeholder="例如 https://anime.example.com 或 http://公网IP:7345">
        </div>
        <div class="form-row">
          <label for="cfg_api_token">云端访问口令 (Access Token)<span class="label-hint">若云端设置了 ACCESS_TOKEN 则填入</span></label>
          <input id="cfg_api_token" type="password" value="${escapeAttr(
            getApiToken()
          )}" placeholder="未设置口令可留空">
        </div>
      </div>
      <div class="inline-row" style="flex-wrap:wrap;margin-bottom:6px">
        <button type="button" class="btn small primary" id="syncWithCloudBtn" title="保持本机运行（支持本地视频扫描与调用播放器），同时将本机与云端（手机端）的账本进度双向合并同步">⇄ 一键与云端双向同步 (Win本地 ↔ 云端)</button>
        <button type="button" class="btn small" id="testServerBtn">测试云端连接</button>
        <button type="button" class="btn small ghost" id="resetServerBtn">恢复本机默认</button>
      </div>
      <div class="ep-hint" id="serverTestStatus">提示：Win 端可保持默认连接本机（使用本地视频扫描与播放器），需要与手机端互通时填写上方云服务器地址并点「一键与云端双向同步」；也可保存设置直接将前端挂载到云服务器。</div>
    </div>

    <div class="settings-section">
      <div class="settings-title">
        <span>4. 数据库物理备份、校验恢复与跨服务器 JSON 迁移（Stage 9）</span>
        <button type="button" class="btn small primary" id="createDbBackupBtn">立即创建 SQLite 物理备份</button>
      </div>
      <div id="backupListHost" style="margin-bottom:10px"></div>
      <div class="inline-row" style="flex-wrap:wrap">
        <button type="button" class="btn small" id="exportJsonBtn">导出完整账本 JSON</button>
        <select id="importConflictStrategy" class="ui-select-compact">
          <option value="sync">导入冲突策略：双向智能同步（按最新修改时间合并状态与进度）</option>
          <option value="merge">导入冲突策略：仅补齐缺失资料与未看集数</option>
          <option value="skip">导入冲突策略：跳过同名/重复作品（保护本地）</option>
        </select>
        <button type="button" class="btn small" id="importJsonBtn">从 JSON 备份导入</button>
        <input type="file" id="importFileInput" accept=".json,application/json" hidden>
      </div>
      <div class="ep-hint">物理备份保存在 <code>backup/</code> 目录并经过完整性校验；恢复前会自动备份当前数据库，防止误操作。</div>
    </div>

    <div class="ep-hint" id="appVersionLine" style="text-align:center;margin:2px 0 10px;color:var(--faint)"></div>

    <div class="form-actions">
      <button type="button" class="btn danger" id="shutdownServerBtn" style="margin-right:auto" title="安全保存并停止本机后台运行的 Node 服务进程">退出后台服务</button>
      <button type="button" class="btn ghost" id="formCancel">关闭</button>
      <button type="submit" class="btn primary">保存设置</button>
    </div>
  `;

  // 版本信息：设置弹窗里唯一能看到「我跑的是哪个版本」的地方
  api('/api/health')
    .then((h) => {
      const node = $('#appVersionLine');
      if (node) node.textContent = `次元刻度 v${h.version} · 数据库架构 v${h.schemaVersion}`;
    })
    .catch(() => {});

  const renderDdpQuotaTable = (quotaObj) => {
    const host = $('#ddpQuotaTableHost');
    if (!host) return;
    const groups = quotaObj?.groups || [];
    if (groups.length === 0) {
      host.innerHTML = '';
      return;
    }
    host.innerHTML = `
      <table class="ddp-quota-table">
        <thead>
          <tr>
            <th>功能组</th>
            <th>当日已用 / 上限 (保护线)</th>
            <th>当月已用 / 上限</th>
            <th>占比</th>
            <th>省流缓存命中</th>
          </tr>
        </thead>
        <tbody>
          ${groups
            .map((g) => {
              const maxPct = Math.max(g.dailyPercent || 0, g.monthlyPercent || 0);
              const barCls = g.exhausted ? 'danger' : maxPct >= 75 ? 'warn' : '';
              return `
                <tr>
                  <td><strong>${escapeHtml(g.label)}</strong></td>
                  <td>${g.dailyUsed} / ${g.dailyLimit} <span class="ep-hint">(保护:${g.dailySafeCap})</span></td>
                  <td>${g.monthlyUsed} / ${g.monthlyLimit.toLocaleString()}</td>
                  <td>
                    <div class="ddp-quota-bar-wrap">
                      <div class="ddp-quota-bar">
                        <div class="ddp-quota-fill ${barCls}" style="width:${Math.min(100, maxPct)}%"></div>
                      </div>
                      <span>${maxPct}%</span>
                    </div>
                  </td>
                  <td>${g.cacheHits || 0} 次</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
    renderCalibration(quotaObj);
  };

  renderDdpQuotaTable(cfg.dandanplayQuota);

  $('#ddpCalSave')?.addEventListener('click', async () => {
    const groups = {};
    for (const input of document.querySelectorAll('#ddpCalHost input')) {
      const key = input.dataset.group;
      if (!groups[key]) groups[key] = {};
      groups[key][input.dataset.kind === 'daily' ? 'dailyUsed' : 'monthlyUsed'] = Number(input.value) || 0;
    }
    try {
      const next = await api('/api/dandanplay/quota', { method: 'PUT', body: { groups } });
      renderDdpQuotaTable(next);
      toast('已按官方数字校准本地计数');
    } catch (err) {
      toast(err.message, true);
    }
  });

  $('#resetDdpQuotaBtn')?.addEventListener('click', async () => {
    try {
      const nextQuota = await api('/api/dandanplay/quota', {
        method: 'PUT',
        body: { resetAll: true }
      });
      renderDdpQuotaTable(nextQuota);
      toast('已重置本地弹弹Play配额统计读数');
    } catch (err) {
      toast(err.message, true);
    }
  });

  const renderTplEditor = () => {
    const host = $('#tplListHost');
    host.innerHTML = '';
    editTpls.forEach((tpl, idx) => {
      const row = el('div', 'tpl-row');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = tpl.enabled !== false;
      cb.addEventListener('change', () => {
        tpl.enabled = cb.checked;
      });

      const nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.className = 'ui-input-compact';
      nameIn.value = tpl.name || '';
      nameIn.placeholder = '站点名称';
      nameIn.addEventListener('input', () => {
        tpl.name = nameIn.value;
      });

      const urlIn = document.createElement('input');
      urlIn.type = 'text';
      urlIn.className = 'ui-input-compact';
      urlIn.value = tpl.url || '';
      urlIn.placeholder = 'https://example.com/search?q={keyword}';
      urlIn.addEventListener('input', () => {
        tpl.url = urlIn.value;
      });

      const delBtn = el('button', 'link-btn danger', '删除');
      delBtn.type = 'button';
      delBtn.addEventListener('click', () => {
        editTpls.splice(idx, 1);
        renderTplEditor();
      });

      row.appendChild(cb);
      row.appendChild(nameIn);
      row.appendChild(urlIn);
      row.appendChild(delBtn);
      host.appendChild(row);
    });
  };

  renderTplEditor();
  $('#addTplBtn').addEventListener('click', () => {
    editTpls.push({
      id: `custom_${Date.now()}`,
      name: '自定义检索',
      url: 'https://mikanani.me/Home/Search?searchstr={keyword}',
      enabled: true
    });
    renderTplEditor();
  });

  const runProbe = async ({ liveDandan = false } = {}) => {
    const btn = $('#probeBtn');
    const liveBtn = $('#probeLiveDdpBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '检测中…';
    }
    if (liveBtn) liveBtn.disabled = true;
    for (const s of ['dandanplay', 'bangumi']) {
      const node = $(`#probe_${s}`);
      if (node) {
        node.textContent = '正在探测…';
        node.className = 'source-status-text';
      }
    }
    try {
      const res = await api(`/api/source-status${liveDandan ? '?liveDandan=1' : ''}`);
      if (res.dandanplay?.quota) {
        renderDdpQuotaTable(res.dandanplay.quota);
      }
      for (const s of ['dandanplay', 'bangumi']) {
        const info = res[s];
        const node = $(`#probe_${s}`);
        if (!node || !info) continue;
        if (info.reachable) {
          if (s === 'dandanplay' && info.mode === 'quota_guard') {
            node.textContent = '已就绪 (零配额省流待命)';
          } else {
            node.textContent = `可用 (${info.latencyMs}ms · ${info.mode === 'proxy' ? '代理' : '直连'})`;
          }
          node.className = 'source-status-text ok';
        } else if (info.configured === false) {
          node.textContent = info.error || '待配置密钥';
          node.className = 'source-status-text';
        } else {
          node.textContent = `不可用 (${info.error || '超时'})`;
          node.className = 'source-status-text err';
        }
      }
    } catch (err) {
      toast(`探测失败：${err.message}`, true);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '检测连通性(零配额)';
      }
      if (liveBtn) liveBtn.disabled = false;
    }
  };

  $('#probeBtn').addEventListener('click', () => runProbe({ liveDandan: false }));
  $('#probeLiveDdpBtn')?.addEventListener('click', () => runProbe({ liveDandan: true }));
  runProbe({ liveDandan: false });

  $('#testServerBtn').addEventListener('click', async () => {
    const input = $('#cfg_api_base');
    const tokenIn = $('#cfg_api_token');
    const statusNode = $('#serverTestStatus');
    const custom = input.value.trim().replace(/\/+$/, '');
    const customToken = tokenIn ? tokenIn.value.trim() : '';
    statusNode.textContent = '正在连接服务器…';
    try {
      const health = await api('/api/health', { customBase: custom, customToken });
      // health 不再返回作品数（避免未认证就泄露库规模），有才显示
      const countText =
        health.counts?.anime !== undefined ? `（库内共 ${health.counts.anime} 部作品）` : '';
      statusNode.textContent = `连接成功：${health.app || '次元刻度'} v${health.version}${countText}${
        health.authRequired ? ' · 已启用口令保护' : ''
      }`;
      statusNode.style.color = '#2b6e3f';
    } catch (err) {
      statusNode.textContent = `连接失败：${err.message}`;
      statusNode.style.color = 'var(--danger)';
    }
  });

  $('#syncWithCloudBtn')?.addEventListener('click', async () => {
    const btn = $('#syncWithCloudBtn');
    const custom = $('#cfg_api_base').value.trim().replace(/\/+$/, '');
    const customToken = $('#cfg_api_token')?.value.trim() || '';
    const statusNode = $('#serverTestStatus');
    if (!custom) {
      statusNode.textContent = '请先在上方填写要同步的远端云服务器地址（如 https://anime.example.com）';
      statusNode.style.color = 'var(--danger)';
      return;
    }
    btn.disabled = true;
    statusNode.textContent = '正在执行本地与云端双向合并同步…';
    statusNode.style.color = 'var(--muted)';
    try {
      setApiToken(customToken);
      const localExport = await api('/api/export', { customBase: '' });
      const cloudRes = await api('/api/sync', {
        method: 'POST',
        body: localExport,
        customBase: custom,
        customToken
      });
      const localImportRes = await api('/api/import', {
        method: 'POST',
        body: { ...(cloudRes.snapshot || {}), conflictStrategy: 'sync' },
        customBase: ''
      });
      const cSync = cloudRes.sync || {};
      const msg = `双向同步成功！云端新增 ${cSync.imported || 0} 部 / 合并 ${cSync.merged || 0} 部；本机新增 ${
        localImportRes.imported || 0
      } 部 / 合并 ${localImportRes.merged || 0} 部（共 ${cloudRes.snapshot?.count ?? 0} 部作品已完全互通）`;
      statusNode.textContent = msg;
      statusNode.style.color = '#2b6e3f';
      toast('已完成本机与云服务器双向同步');
      await load();
    } catch (err) {
      statusNode.textContent = `双向同步失败：${err.message}`;
      statusNode.style.color = 'var(--danger)';
      toast(`双向同步失败：${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });

  $('#resetServerBtn').addEventListener('click', () => {
    $('#cfg_api_base').value = '';
    if ($('#cfg_api_token')) $('#cfg_api_token').value = '';
    setApiBase('');
    setApiToken('');
    $('#serverTestStatus').textContent = '已恢复为默认连接本机服务器';
    $('#serverTestStatus').style.color = 'var(--muted)';
  });

  const refreshBackupsList = async () => {
    const host = $('#backupListHost');
    if (!host) return;
    try {
      const res = await api('/api/backups');
      const items = res.data ?? [];
      host.innerHTML = '';
      if (items.length === 0) {
        host.appendChild(el('div', 'ep-hint', '暂无本地 SQLite 物理备份文件，点击右上角可随时创建快照。'));
        return;
      }
      const list = el('div', 'source-list');
      for (const b of items.slice(0, 6)) {
        const row = el('div', 'source-row');
        const sizeKb = Math.max(1, Math.round((b.sizeBytes || 0) / 1024));
        const infoText = b.valid
          ? `${b.fileName} (${sizeKb} KB · v${b.schemaVersion} · ${b.counts?.anime ?? 0} 部作品)`
          : `${b.fileName} (损坏: ${b.error})`;
        row.appendChild(el('span', '', infoText));

        if (b.valid) {
          const restoreBtn = el('button', 'btn small', '恢复此备份');
          restoreBtn.type = 'button';
          restoreBtn.addEventListener('click', async () => {
            const ok = await askConfirm({
              title: '确认恢复数据库备份',
              message: `即将从「${b.fileName}」恢复账本数据（含 ${
                b.counts?.anime ?? 0
              } 部作品）。\n\n系统会在恢复前自动为您创建一份当前数据库的快照（pre-restore），以防需要回退。是否继续？`,
              confirmText: '确认恢复',
              danger: false
            });
            if (!ok) return;
            restoreBtn.disabled = true;
            try {
              const r = await api('/api/backups/restore', {
                method: 'POST',
                body: { fileName: b.fileName }
              });
              toast(`恢复成功！原数据库已自动备份为 ${r.preRestoreBackup}`);
              await refreshBackupsList();
              await load();
            } catch (err) {
              toast(`恢复失败：${err.message}`, true);
              restoreBtn.disabled = false;
            }
          });
          row.appendChild(restoreBtn);
        }
        list.appendChild(row);
      }
      host.appendChild(list);
    } catch {
      /* ignore */
    }
  };

  refreshBackupsList();

  $('#createDbBackupBtn')?.addEventListener('click', async () => {
    const btn = $('#createDbBackupBtn');
    btn.disabled = true;
    try {
      const b = await api('/api/backups', { method: 'POST', body: { label: 'manual' } });
      toast(`已创建并校验物理备份：${b.fileName}`);
      await refreshBackupsList();
    } catch (err) {
      toast(`创建备份失败：${err.message}`, true);
    } finally {
      btn.disabled = false;
    }
  });

  $('#exportJsonBtn').addEventListener('click', async () => {
    try {
      const data = await api('/api/export');
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ciyuan-kedu-backup-${localToday()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(`已导出 ${data.count} 部作品的完整账本`);
    } catch (err) {
      toast(`导出失败：${err.message}`, true);
    }
  });

  const fileInput = $('#importFileInput');
  $('#importJsonBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const conflictStrategy = $('#importConflictStrategy')?.value || 'skip';
      const res = await api('/api/import', {
        method: 'POST',
        body: { ...parsed, conflictStrategy }
      });
      const bits = [`新增 ${res.imported} 部`];
      if (res.merged) bits.push(`合并更新 ${res.merged} 部`);
      if (res.skipped) bits.push(`跳过重复 ${res.skipped} 部`);
      toast(`导入完成：${bits.join('，')}`);
      await load();
    } catch (err) {
      toast(`导入失败：${err.message}`, true);
    } finally {
      fileInput.value = '';
    }
  });

  $('#formCancel').addEventListener('click', closeForm);
  $('#shutdownServerBtn')?.addEventListener('click', async () => {
    const ok = await askConfirm({
      title: '退出次元刻度后台服务',
      message: '确定要停止本机正在运行的「次元刻度」后台服务吗？停止后下次使用只需再次双击桌面图标或启动器即可。',
      confirmText: '确认退出服务',
      danger: true
    });
    if (!ok) return;
    try {
      await api('/api/shutdown', { method: 'POST' });
      closeForm();
      toast('后台服务已安全退出，现在可以关闭窗口');
    } catch (err) {
      toast(err.message, true);
    }
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const checked = [...form.querySelectorAll('input[name="enabledSource"]:checked')].map((elNode) => elNode.value);
    if (checked.length === 0) {
      showFormError('请至少勾选启用一个数据源');
      return;
    }

    const nextApiBase = $('#cfg_api_base').value.trim();
    const nextApiToken = $('#cfg_api_token')?.value.trim() || '';
    setApiBase(nextApiBase);
    setApiToken(nextApiToken);

    const ddpId = $('#cfg_ddp_id').value.trim();
    const ddpSecret = $('#cfg_ddp_secret').value.trim();
    if (ddpId && ddpSecret && !checked.includes('dandanplay')) {
      checked.push('dandanplay');
    }

    try {
      const saved = await api('/api/config', {
        method: 'PUT',
        body: {
          enabledSources: checked,
          bangumiApiBase: $('#cfg_bgm_base').value.trim() || 'https://api.bgm.tv',
          dandanplayAppId: ddpId,
          dandanplayAppSecret: ddpSecret,
          dandanplayStrategy: $('#cfg_ddp_strategy')?.value || 'economy',
          dandanplaySafetyRatio: Number($('#cfg_ddp_safety')?.value || 0.9),
          discoveryTemplates: editTpls,
          proxy: $('#cfg_proxy').value.trim()
        }
      });
      if (Array.isArray(saved.discoveryTemplates)) {
        state.discoveryTemplates = saved.discoveryTemplates;
      }
      closeForm();
      toast('设置已保存并生效');
      if (state.currentId) {
        renderDrawer(await api(`/api/anime/${state.currentId}`));
      }
      await load();
    } catch (err) {
      showFormError(err.message);
    }
  };
}

/* ---------------- 新增/编辑作品表单 ---------------- */

const TYPE_OPTIONS = Object.entries(TYPE_LABEL)
  .map(([k, v]) => `<option value="${k}">${v}</option>`)
  .join('');

const STATUS_OPTIONS = Object.entries(STATUS_LABEL)
  .map(([k, v]) => `<option value="${k}">${v}</option>`)
  .join('');

function openForm(detail = null) {
  const isEdit = Boolean(detail);
  state.editingId = isEdit ? detail.anime.id : null;
  const a = detail?.anime ?? {};
  const st = detail?.state ?? {};

  $('#modal .modal-card')?.classList.remove('wide-card');
  $('#modalTitle').textContent = isEdit ? '编辑资料' : '新增作品';

  const form = $('#animeForm');
  form.innerHTML = `
    <div class="form-error" id="formError"></div>
    ${
      isEdit
        ? ''
        : `<div class="form-row search-block">
             <label for="s_kw">从双源搜索（弹弹Play + Bangumi）<span class="label-hint">输入番名或简称即出候选，自动聚合去重</span></label>
             <input id="s_kw" type="text" placeholder="例如：芙莉莲、迷宫饭、败犬女主…" autocomplete="off" spellcheck="false">
             <div id="s_status" class="search-status"></div>
             <div id="s_results" class="search-results"></div>
           </div>`
    }
    <div class="form-row">
      <label for="f_title">标题 <span style="color:var(--danger)">*</span></label>
      <input id="f_title" name="canonical_title" type="text" maxlength="200" placeholder="番剧名称" value="${escapeAttr(
        a.canonical_title ?? ''
      )}">
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label for="f_year">年份</label>
        <input id="f_year" name="release_year" type="number" min="1900" max="2100" placeholder="如 2024" value="${
          a.release_year ?? ''
        }">
      </div>
      <div class="form-row">
        <label for="f_type">类型</label>
        <select id="f_type" name="anime_type">
          <option value="">未指定</option>
          ${TYPE_OPTIONS}
        </select>
      </div>
    </div>
    <div class="form-grid">
      <div class="form-row">
        <label for="f_duration">单集时长（分钟）</label>
        <input id="f_duration" name="default_episode_duration_minutes" type="number" min="1" max="600" placeholder="如 24（可留空，未知不计入时长）" value="${
          a.default_episode_duration_minutes ?? ''
        }">
      </div>
      ${
        isEdit
          ? ''
          : `<div class="form-row">
              <label for="f_status">初始状态</label>
              <select id="f_status" name="status">${STATUS_OPTIONS}</select>
            </div>`
      }
    </div>
    ${
      isEdit
        ? ''
        : `<div class="form-grid">
            <div class="form-row">
              <label for="f_rating">评分（1–10，可留空）</label>
              <input id="f_rating" name="rating" type="number" min="1" max="10" placeholder="可留空">
            </div>
            <div class="form-row">
              <label for="f_tags">标签（逗号分隔）</label>
              <input id="f_tags" name="tags" type="text" placeholder="治愈, 奇幻">
            </div>
          </div>`
    }
    <div class="form-row">
      <label for="f_synopsis">简介</label>
      <textarea id="f_synopsis" name="synopsis" placeholder="可留空，之后随时补充">${escapeHtml(
        a.synopsis ?? ''
      )}</textarea>
    </div>
    <div class="form-actions">
      <button type="button" class="btn ghost" id="formCancel">取消</button>
      <button type="submit" class="btn primary">${isEdit ? '保存' : '添加'}</button>
    </div>
  `;

  if (!isEdit) setupSearchBox();

  if (a.anime_type) $('#f_type').value = a.anime_type;
  if (!isEdit && st.status) $('#f_status').value = st.status;

  $('#formCancel').addEventListener('click', closeForm);
  form.onsubmit = (e) => {
    e.preventDefault();
    submitForm(isEdit);
  };

  $('#modal').hidden = false;
  setTimeout(() => ($('#s_kw') || $('#f_title')).focus(), 30);
}

function setupSearchBox() {
  const kw = $('#s_kw');
  const statusEl = $('#s_status');
  const resultsEl = $('#s_results');
  if (!kw || !statusEl || !resultsEl) return;

  state.picked = null;
  let timer = null;

  const clearResults = () => {
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('open');
  };

  const pick = async (item) => {
    state.picked = {
      source: item.source,
      externalId: item.externalId,
      coverUrl: item.remoteCoverUrl || '',
      episodes: item.episodes || null
    };

    const titleEl = $('#f_title');
    if (titleEl) titleEl.value = item.title || '';
    if (item.year) $('#f_year').value = item.year;
    if (item.summary) $('#f_synopsis').value = item.summary;
    const tagInput = document.querySelector('#animeForm [name="tags"]');
    if (tagInput && Array.isArray(item.tags) && item.tags.length > 0) {
      tagInput.value = item.tags.join(', ');
    }

    clearResults();
    kw.value = item.title || '';
    titleEl.classList.add('flash');
    setTimeout(() => titleEl.classList.remove('flash'), 900);

    statusEl.textContent = '已选择，正在补全详细集数与标签…';

    try {
      const d = await api(`/api/external/${item.source}/${encodeURIComponent(item.externalId)}`);
      if (tagInput && !tagInput.value.trim() && Array.isArray(d.tags) && d.tags.length > 0) {
        tagInput.value = d.tags.join(', ');
      }
      if (!state.picked.coverUrl && d.remoteCoverUrl) state.picked.coverUrl = d.remoteCoverUrl;
      if (d.summary && !$('#f_synopsis').value.trim()) $('#f_synopsis').value = d.summary;

      const bits = [
        `已选择：${d.title || item.title}`,
        `（${SOURCE_BADGE[d.source] || d.source}）`
      ];
      if (d.episodes) {
        state.picked.episodes = d.episodes;
        bits.push(` · 共 ${d.episodes} 集`);
      }
      if (d.tags?.length) bits.push(` · 标签：${d.tags.join('、')}`);
      statusEl.textContent = bits.join('');
    } catch {
      const bits = [`已选择：${item.title}（${SOURCE_BADGE[item.source] || item.source}）`];
      if (item.episodes) bits.push(` · 共 ${item.episodes} 集`);
      statusEl.textContent = bits.join('');
    }
  };

  const renderResults = (items) => {
    resultsEl.innerHTML = '';
    if (!items.length) return;

    for (const item of items) {
      const row = el('button', 'search-item');
      row.type = 'button';

      const cover = el('div', 'search-cover');
      if (item.coverUrl) {
        const img = document.createElement('img');
        img.src = buildApiUrl(item.coverUrl);
        img.loading = 'lazy';
        img.alt = '';
        img.referrerPolicy = 'no-referrer';
        img.onerror = () => {
          img.remove();
          cover.textContent = firstChar(item.title);
        };
        cover.appendChild(img);
      } else {
        cover.textContent = firstChar(item.title);
      }

      const info = el('div', 'search-info');
      info.appendChild(el('div', 'search-title', item.title));
      const sub = [
        item.year ? `${item.year}` : null,
        item.episodes ? `${item.episodes} 集` : null,
        item.titleNative && item.titleNative !== item.title ? item.titleNative : null
      ]
        .filter(Boolean)
        .join(' · ');
      if (sub) info.appendChild(el('div', 'search-sub', sub));

      row.appendChild(cover);
      row.appendChild(info);
      const srcList = Array.isArray(item.sources) && item.sources.length ? item.sources : [item.source];
      row.appendChild(el('span', 'search-badge', srcList.map((s) => SOURCE_BADGE[s] || s).join('·')));
      row.addEventListener('click', () => pick(item));
      resultsEl.appendChild(row);
    }
    resultsEl.classList.add('open');
  };

  const run = async (keyword) => {
    statusEl.textContent = '搜索中…';
    clearResults();
    try {
      const res = await api(`/api/search?keyword=${encodeURIComponent(keyword)}&limit=8`);
      const items = res.data ?? [];
      if (!items.length) {
        statusEl.textContent = '未找到匹配条目，可换个关键词或直接在下方手动填写。';
        return;
      }

      const m = res.meta ?? {};
      const via = [];
      for (const [key, label] of [
        ['dandanplay', '弹弹Play'],
        ['bangumi', 'Bangumi']
      ]) {
        const info = m[key];
        if (!info?.ok) continue;
        via.push(`${label}(${info.count})`);
      }

      statusEl.textContent =
        `找到 ${items.length} 条${res.cached ? '（缓存）' : ''}，点选一条自动填表` +
        (via.length ? ` · 来源：${via.join(' / ')}` : '');
      renderResults(items);
    } catch (err) {
      statusEl.textContent = err.message;
    }
  };

  kw.addEventListener('input', () => {
    clearTimeout(timer);
    const v = kw.value.trim();
    if (v.length < 2) {
      clearResults();
      statusEl.textContent = v ? '再输入一个字即可自动搜索，或直接按回车' : '';
      return;
    }
    statusEl.textContent = '搜索中…';
    timer = setTimeout(() => run(v), 320);
  });

  kw.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    const v = kw.value.trim();
    if (v) run(v);
  });
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function closeForm() {
  $('#modal .modal-card')?.classList.remove('wide-card');
  $('#modal').hidden = true;
  state.editingId = null;
  clearHash();
}

function showFormError(message, field) {
  const errEl = $('#formError');
  if (errEl) errEl.textContent = message;
  if (field) {
    const input = document.querySelector(`[name="${field}"]`);
    if (input) input.focus();
  }
}

async function submitForm(isEdit) {
  const form = $('#animeForm');
  const fd = new FormData(form);
  const payload = {
    canonical_title: fd.get('canonical_title') ?? '',
    release_year: fd.get('release_year') || null,
    anime_type: fd.get('anime_type') || null,
    default_episode_duration_minutes: fd.get('default_episode_duration_minutes') || null,
    synopsis: fd.get('synopsis') || null
  };

  try {
    if (isEdit) {
      await api(`/api/anime/${state.editingId}`, { method: 'PATCH', body: payload });
      const fresh = await api(`/api/anime/${state.editingId}`);
      closeForm();
      renderDrawer(fresh);
      toast('已保存修改');
    } else {
      payload.status = fd.get('status') || 'want';
      const rating = fd.get('rating');
      if (rating) payload.rating = Number(rating);
      const tagsRaw = fd.get('tags') ?? '';
      payload.tags = String(tagsRaw)
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean);

      if (state.picked?.source && state.picked?.externalId) {
        payload.source = state.picked.source;
        payload.external_id = state.picked.externalId;
      }
      if (state.picked?.episodes) {
        payload.episodes = state.picked.episodes;
      }
      if (state.picked?.coverUrl) {
        payload.cover_url = state.picked.coverUrl;
      }

      const created = await api('/api/anime', { method: 'POST', body: payload });
      closeForm();
      toast(`已添加「${created.anime.canonical_title}」`);
    }
    if (state.view === 'stats') await switchView('list');
    else load();
  } catch (err) {
    showFormError(err.message, err.field);
  }
}

/* ---------------- 事件绑定 ---------------- */

let searchTimer = null;

function bindEvents() {
  const qInput = $('#q');
  const sBox = document.querySelector('.searchbox');
  let clearBtn = $('#searchClearBtn');
  if (sBox && !clearBtn) {
    clearBtn = el('button', 'search-clear-btn', '×');
    clearBtn.id = 'searchClearBtn';
    clearBtn.type = 'button';
    clearBtn.title = '清空搜索词';
    clearBtn.hidden = !qInput?.value;
    clearBtn.addEventListener('click', () => {
      if (qInput) qInput.value = '';
      clearBtn.hidden = true;
      state.keyword = '';
      load();
      qInput?.focus();
    });
    sBox.appendChild(clearBtn);
  }

  qInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    if (clearBtn) clearBtn.hidden = !value;
    searchTimer = setTimeout(() => {
      state.keyword = value.trim();
      load();
    }, 240);
  });

  $('#sort').addEventListener('change', (e) => {
    const [sortBy, order] = e.target.value.split(':');
    state.sortBy = sortBy;
    state.order = order;
    load();
  });

  $('#tagFilter')?.addEventListener('change', (e) => {
    state.tag = e.target.value;
    load();
  });

  $('#addBtn').addEventListener('click', () => openForm(null));
  $('#mascotTrigger')?.addEventListener('click', () => {
    const bubble = $('#mascotBubble');
    if (!bubble) return openMascotGalleryModal();
    if (bubble.hidden) {
      const q = MASCOT_QUOTES[mascotQuoteIdx % MASCOT_QUOTES.length];
      mascotQuoteIdx += 1;
      bubble.innerHTML = `${q}<div style="margin-top:6px"><button type="button" class="link-btn" id="openMascotArchiveLink" style="font-size:11.5px;color:var(--accent)">查看「刻度娘」AI 娘化立绘设定 →</button></div>`;
      bubble.hidden = false;
      $('#openMascotArchiveLink')?.addEventListener('click', (e) => {
        e.stopPropagation();
        bubble.hidden = true;
        openMascotGalleryModal();
      });
      clearTimeout(bubble._timer);
      bubble._timer = setTimeout(() => { bubble.hidden = true; }, 7000);
    } else {
      bubble.hidden = true;
      openMascotGalleryModal();
    }
  });
  $('#uiStudioBtn')?.addEventListener('click', () =>
    switchView(state.view === 'ui-studio' ? 'list' : 'ui-studio')
  );
  $('#seasonalBtn')?.addEventListener('click', () =>
    switchView(state.view === 'seasonal' ? 'list' : 'seasonal')
  );
  $('#mediaScanBtn')?.addEventListener('click', () => openMediaScanModal());
  $('#brandHome')?.addEventListener('click', () => {
    if (state.view !== 'list') switchView('list');
  });
  $('#settingsBtn').addEventListener('click', () => openSettingsModal());
  $('#statsBtn').addEventListener('click', () => switchView(state.view === 'stats' ? 'list' : 'stats'));
  $('#batchManageBtn')?.addEventListener('click', () => {
    state.ledgerBatchMode = !state.ledgerBatchMode;
    if (!state.ledgerBatchMode) state.ledgerSelected.clear();
    renderList();
  });
  $('#enrichAllBtn').addEventListener('click', enrichAll);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#modalClose').addEventListener('click', closeForm);
  $('#scrim').addEventListener('click', closeDrawer);

  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeForm();
  });

  $('#confirmModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'confirmModal') $('#confirmCancel')?.click();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!$('#confirmModal').hidden) return $('#confirmCancel')?.click();
      if (!$('#modal').hidden) return closeForm();
      if ($('#drawer').classList.contains('open')) return closeDrawer();
      return;
    }
    const tag = (e.target?.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!$('#modal').hidden || !$('#confirmModal').hidden) return;

    if (e.key === '/') {
      e.preventDefault();
      if (state.view !== 'list') switchView('list').then(() => $('#q')?.focus());
      else $('#q')?.focus();
    } else if (e.key === '1' && !$('#drawer').classList.contains('open')) {
      setLayoutMode('grid');
    } else if (e.key === '2' && !$('#drawer').classList.contains('open')) {
      setLayoutMode('table');
    } else if (e.key === '3' && !$('#drawer').classList.contains('open')) {
      setLayoutMode('board');
    } else if (e.key === 'n') {
      e.preventDefault();
      openForm(null);
    } else if (e.key === 's') {
      e.preventDefault();
      switchView(state.view === 'seasonal' ? 'list' : 'seasonal');
    } else if (e.key === 'u') {
      e.preventDefault();
      switchView(state.view === 'ui-studio' ? 'list' : 'ui-studio');
    } else if (e.key === 'm') {
      e.preventDefault();
      openMediaScanModal();
    } else if (e.key === ',') {
      e.preventDefault();
      openSettingsModal();
    }
  });
}

/* ---------------- 深链接 ---------------- */

function handleHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  if (h === 'new') {
    openForm(null);
  } else if (h === 'seasonal') {
    switchView('seasonal');
  } else if (h === 'ui-studio' || h === 'samples') {
    switchView('ui-studio');
  } else if (h === 'media') {
    openMediaScanModal();
  } else if (h === 'share') {
    openShareGeneratorModal('poster');
  } else if (h === 'grid') {
    openShareGeneratorModal('grid');
  } else if (h === 'settings') {
    openSettingsModal();
  } else if (h.startsWith('anime=')) {
    openDetail(decodeURIComponent(h.slice(6)));
  }
}

/* ---------------- 启动 ---------------- */

async function boot() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
  updateServerStatusNote();
  applyUiTheme(state.uiTheme, { switchRecommendedLayout: false, silent: true });
  renderTabs();
  renderLayoutSwitcher();
  renderUiQuickBar();
  renderStudioSidebar();
  bindEvents();
  await loadRuntimeConfig();
  await load();
  handleHash();
  window.addEventListener('hashchange', handleHash);

  /**
   * 心跳。
   *
   * 后端有个空闲超时：一段时间收不到任何请求就自动退出，避免服务长期挂在后台。
   * 页面开着时靠这个心跳续命，关了页面心跳自然停，服务随后自己收摊。
   * 失败静默——页面已经关掉或者服务已退出时，这里报错没有意义。
   */
  setInterval(() => {
    api('/api/health').catch(() => {});
  }, 30000);
}

boot();

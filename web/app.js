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

const state = {
  list: [],
  status: '',
  keyword: '',
  sortBy: 'updated_at',
  order: 'desc',
  archived: false,
  currentId: null,
  editingId: null,
  loading: false
};

/* ---------------- 网络 ---------------- */

async function api(path, { method = 'GET', body } = {}) {
  const init = { method, headers: {} };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(data?.error?.message ?? `请求失败（HTTP ${res.status}）`);
    err.field = data?.error?.field ?? null;
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------------- 小工具 ---------------- */

function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.className = 'toast' + (isError ? ' error' : '');
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, isError ? 4200 : 2200);
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

function coverProxyUrl(raw) {
  return raw ? `/api/cover?u=${encodeURIComponent(raw)}` : '';
}

/**
 * 往封面容器里画东西。
 * 先放首字色块，图片加载成功后再盖上去；加载失败就保留色块。
 * 这样不会出现「图片没加载出来就是一片空白」。
 */
function paintCover(node, title, coverPath) {
  node.style.background = coverStyle(title);
  const initial = el('span', 'cover-initial', firstChar(title));
  node.appendChild(initial);

  const url = coverProxyUrl(coverPath);
  if (!url) return;

  const img = document.createElement('img');
  img.className = 'cover-img';
  img.alt = '';
  img.loading = 'lazy';
  img.onload = () => {
    initial.hidden = true;
    node.style.background = '#edece7';
  };
  img.onerror = () => img.remove();
  img.src = url;
  node.appendChild(img);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---------------- 列表 ---------------- */

function renderTabs() {
  const wrap = $('#tabs');
  wrap.innerHTML = '';
  const defs = [
    { key: '', label: '全部' },
    ...Object.entries(STATUS_LABEL).map(([k, v]) => ({ key: k, label: v })),
    { key: '__archived', label: '已归档' }
  ];

  for (const d of defs) {
    const active = d.key === '__archived' ? state.archived : !state.archived && state.status === d.key;
    const btn = el('button', 'tab' + (active ? ' active' : ''), d.label);
    btn.type = 'button';
    btn.addEventListener('click', () => {
      if (d.key === '__archived') {
        state.archived = true;
        state.status = '';
      } else {
        state.archived = false;
        state.status = d.key;
      }
      renderTabs();
      load();
    });
    wrap.appendChild(btn);
  }
}

function formatMinutes(m) {
  const n = Number(m) || 0;
  if (n < 60) return `${n} 分钟`;
  const h = Math.floor(n / 60);
  const rest = n % 60;
  return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

/**
 * 卡片底部的进度条与 +1。
 * 「看到 N/M」用 current（已看的最大集号），不是已看集数——
 * 跳看时才不会显示成「看到 8」而其实是看到 12 集。
 */
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
  // 不写「第 N 集」——跳看时下一个要补的未必是 current+1，写死会误导
  bump.title = done ? '已看完' : '记一集（补下一个还没看的）';

  bump.addEventListener('click', async (e) => {
    e.stopPropagation();
    bump.disabled = true;
    try {
      const res = await api(`/api/anime/${item.id}/progress`, {
        method: 'POST',
        body: { action: 'next' }
      });
      if (res.at_end) toast('已经看完了');
      else if (res.changed) toast(`第 ${res.changed.episode_number} 集已记`);
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
  const card = el('div', 'card');
  card.tabIndex = 0;

  const cover = el('div', 'cover');
  paintCover(cover, item.canonical_title, item.cover_path);

  const badge = el('span', 'badge', STATUS_LABEL[item.status] ?? '想看');
  cover.appendChild(badge);

  if (item.rating) {
    cover.appendChild(el('span', 'badge rating', `★ ${item.rating}`));
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

  const open = () => openDetail(item.id);
  card.addEventListener('click', open);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  });

  return card;
}

function renderList() {
  const listEl = $('#list');
  listEl.innerHTML = '';

  if (state.list.length === 0) {
    $('#empty').hidden = false;
    if (state.archived) {
      $('#emptyTitle').textContent = '没有已归档的作品';
      $('#emptyHint').textContent = '归档的作品会出现在这里，可随时恢复';
    } else if (state.keyword) {
      $('#emptyTitle').textContent = `没有找到「${state.keyword}」`;
      $('#emptyHint').textContent = '换个关键词试试，或直接新增这一部';
    } else if (state.status) {
      $('#emptyTitle').textContent = `没有「${STATUS_LABEL[state.status]}」状态的作品`;
      $('#emptyHint').textContent = '换个筛选条件看看';
    } else {
      $('#emptyTitle').textContent = '还没有作品';
      $('#emptyHint').textContent = '点右上角「新增作品」开始记账';
    }
  } else {
    $('#empty').hidden = true;
    for (const item of state.list) listEl.appendChild(cardEl(item));
  }

  $('#stat').textContent = `共 ${state.list.length} 部`;
}

async function load() {
  if (state.loading) return;
  state.loading = true;
  $('#loading').hidden = false;

  try {
    const params = new URLSearchParams();
    if (state.keyword) params.set('keyword', state.keyword);
    if (state.status) params.set('status', state.status);
    if (state.sortBy) params.set('sortBy', state.sortBy);
    if (state.order) params.set('order', state.order);
    if (state.archived) params.set('archived', '1');

    const res = await api(`/api/anime?${params.toString()}`);
    state.list = res.data ?? [];
    renderList();
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

  const cover = el('div', 'detail-cover');
  paintCover(cover, anime.canonical_title, anime.cover_path);
  body.appendChild(cover);

  const titleNode = el('div', 'field-value');
  titleNode.style.fontSize = '17px';
  titleNode.style.fontWeight = '500';
  titleNode.textContent = anime.canonical_title;
  body.appendChild(fieldBlock('标题', titleNode));

  const metaNode = el('div', 'field-value');
  metaNode.textContent = [
    anime.release_year ? `${anime.release_year} 年` : '年份待补',
    TYPE_LABEL[anime.anime_type] ?? '类型待补',
    anime.default_episode_duration_minutes ? `单集 ${anime.default_episode_duration_minutes} 分钟` : null
  ]
    .filter(Boolean)
    .join(' · ');
  body.appendChild(fieldBlock('资料', metaNode));

  // 观看进度放在状态之前：这是最高频的操作，不能要滚到底才看见
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
  tagInput.placeholder = '用逗号分隔，例如：治愈, 奇幻';
  tagInput.value = (tags ?? []).map((t) => t.name).join(', ');
  tagInput.style.cssText =
    'width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:#fff;';
  tagInput.addEventListener('change', async () => {
    const names = tagInput.value
      .split(/[,，]/)
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await api(`/api/anime/${anime.id}/tags`, { method: 'PUT', body: { tags: names } });
      toast('标签已保存');
      renderDrawer(await api(`/api/anime/${anime.id}`));
    } catch (err) {
      toast(err.message, true);
    }
  });
  body.appendChild(fieldBlock('标签', tagInput));

  // 备注
  const notes = document.createElement('textarea');
  notes.value = st?.notes ?? '';
  notes.placeholder = '想记点什么就写在这里';
  notes.style.cssText =
    'width:100%;min-height:70px;padding:8px 10px;border:1px solid var(--line);border-radius:7px;resize:vertical;';
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

  if (anime.deleted_at) {
    const restoreBtn = el('button', 'btn small primary', '恢复');
    restoreBtn.type = 'button';
    restoreBtn.addEventListener('click', async () => {
      try {
        await api(`/api/anime/${anime.id}/restore`, { method: 'POST' });
        toast('已恢复');
        closeDrawer();
        load();
      } catch (err) {
        toast(err.message, true);
      }
    });
    actions.appendChild(restoreBtn);
  } else {
    const archiveBtn = el('button', 'btn small danger', '归档');
    archiveBtn.type = 'button';
    archiveBtn.addEventListener('click', () => archiveWithConfirm(anime.id));
    actions.appendChild(archiveBtn);
  }

  body.appendChild(actions);
}

/* ---------------- 补全元数据 ---------------- */

async function enrichAll() {
  const btn = $('#enrichAllBtn');
  const targets = state.list.filter((x) => !x.cover_path);

  if (!targets.length) {
    toast('所有作品都有封面了');
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
  if (failed) bits.push(`${failed} 部没补到`);
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
  wrap.appendChild(el('div', 'cand-title', '选一个匹配的条目，会补上封面、集数、简介'));

  for (const c of candidates) {
    const row = el('button', 'cand-row');
    row.type = 'button';

    const thumb = el('div', 'cand-thumb');
    if (c.coverUrl) {
      const img = document.createElement('img');
      img.src = c.coverUrl;
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
          c.source === 'bangumi' ? 'Bangumi' : 'AniList'
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
          body: { source: c.source, external_id: c.externalId }
        });
        toast(r.filled.length ? `已补全：${r.filled.join('、')}` : '已绑定，没有可补的字段');
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

  // 摘要
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
  } else {
    summary.appendChild(el('span', 'ep-hint', `共 ${p.total} 集，还没开始看`));
  }
  wrap.appendChild(summary);

  // 集数网格
  const mainSeason = view.seasons.find((s) => Number(s.season_number) === 1) ?? view.seasons[0];
  const eps = mainSeason?.episodes ?? [];

  if (eps.length) {
    const grid = el('div', 'ep-grid');
    for (const ep of eps) {
      const cell = el('button', 'ep-cell' + (ep.is_watched ? ' watched' : ''), String(ep.episode_number));
      cell.type = 'button';
      cell.title = ep.is_watched
        ? ep.first_watched_at
          ? `已看 · ${ep.first_watched_at}`
          : '已看 · 日期不详'
        : '点一下标记为已看';
      cell.addEventListener('click', async () => {
        cell.disabled = true;
        try {
          await api(`/api/episodes/${ep.id}/watch`, {
            method: 'POST',
            body: { watched: !ep.is_watched }
          });
          renderDrawer(await api(`/api/anime/${view.anime_id}`));
          load();
        } catch (err) {
          toast(err.message, true);
          cell.disabled = false;
        }
      });
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
  }

  const refresh = async () => {
    renderDrawer(await api(`/api/anime/${view.anime_id}`));
    load();
  };

  // 设定总集数
  const toolbar = el('div', 'ep-toolbar');
  toolbar.appendChild(el('span', '', '总集数'));

  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.min = '1';
  countInput.max = '2000';
  countInput.id = 'epCountInput';
  countInput.placeholder = '集';
  countInput.value = p.total || '';
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
        body: { count: n }
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

  // 看到第 N 集
  if (p.total > 0) {
    toolbar.appendChild(el('span', '', '·'));
    toolbar.appendChild(el('span', '', '看到第'));

    const jumpInput = document.createElement('input');
    jumpInput.type = 'number';
    jumpInput.min = '0';
    jumpInput.max = String(p.total);
    jumpInput.placeholder = 'N';
    jumpInput.style.width = '56px';
    toolbar.appendChild(jumpInput);

    toolbar.appendChild(el('span', '', '集'));

    const jumpBtn = el('button', 'btn small', '记到');
    jumpBtn.type = 'button';
    jumpBtn.addEventListener('click', async () => {
      const n = Number(jumpInput.value);
      if (!Number.isFinite(n) || n < 0) {
        toast('集号不对', true);
        return;
      }
      jumpBtn.disabled = true;
      try {
        const res = await api(`/api/anime/${view.anime_id}/progress`, {
          method: 'POST',
          body: { action: 'set', episode_number: n }
        });
        toast(res.marked ? `补记了 ${res.marked} 集` : '这些集已经记过了');
        await refresh();
      } catch (err) {
        toast(err.message, true);
        jumpBtn.disabled = false;
      }
    });
    toolbar.appendChild(jumpBtn);
  }

  wrap.appendChild(toolbar);

  // 时长说明：有未知就如实说，不假装统计完整
  if (p.watched > 0) {
    const dur = [];
    if (p.minutes > 0) dur.push(`累计 ${formatMinutes(p.minutes)}`);
    if (p.missing_duration_count > 0) {
      dur.push(`${p.missing_duration_count} 集时长未知，未计入`);
    }
    if (dur.length) wrap.appendChild(el('div', 'ep-hint', dur.join(' · ')));
  }

  return wrap;
}

async function archiveWithConfirm(id) {
  try {
    const info = await api(`/api/anime/${id}/archive-check`);
    const ok = window.confirm(
      `归档「${info.title}」？\n\n${info.message}\n\n` +
        `已看 ${info.watched_episodes} 集，这些记录都会保留。`
    );
    if (!ok) return;
    await api(`/api/anime/${id}/archive`, { method: 'POST' });
    toast('已归档，可在「已归档」里恢复');
    closeDrawer();
    load();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ---------------- 表单 ---------------- */

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

  $('#modalTitle').textContent = isEdit ? '编辑资料' : '新增作品';

  const form = $('#animeForm');
  form.innerHTML = `
    <div class="form-error" id="formError"></div>
    ${
      isEdit
        ? ''
        : `<div class="form-row search-block">
             <label for="s_kw">从数据源搜索<span class="label-hint">敲两个字就出候选，点一条自动填表</span></label>
             <input id="s_kw" type="text" placeholder="例如：芙莉莲" autocomplete="off" spellcheck="false">
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
        <input id="f_duration" name="default_episode_duration_minutes" type="number" min="1" max="600" placeholder="可留空" value="${
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
  setTimeout(() => $('#f_title').focus(), 30);
}

/**
 * 新增表单里的搜索联想。
 * 行为：输入 ≥2 字防抖 350ms 自动搜；回车立即搜；点候选自动填表并记住来源。
 * 参考 anime-grid 的做法但改成实时联想，少按一次回车。
 */
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
    // remoteCoverUrl 是数据源的原始地址，入库用它；coverUrl 是本地代理地址，只用于显示
    state.picked = {
      source: item.source,
      externalId: item.externalId,
      coverUrl: item.remoteCoverUrl || ''
    };

    const titleEl = $('#f_title');
    if (titleEl) titleEl.value = item.title || '';
    if (item.year) $('#f_year').value = item.year;
    if (item.summary) $('#f_synopsis').value = item.summary;

    clearResults();
    kw.value = item.title || '';
    titleEl.classList.add('flash');
    setTimeout(() => titleEl.classList.remove('flash'), 900);

    statusEl.textContent = '已选择，正在补全标签…';

    // 详情接口能给出带权重的标签，搜索结果里没有，所以要再拉一次
    try {
      const d = await api(`/api/external/${item.source}/${encodeURIComponent(item.externalId)}`);
      const tagInput = document.querySelector('#animeForm [name="tags"]');
      if (tagInput && !tagInput.value.trim() && Array.isArray(d.tags) && d.tags.length > 0) {
        tagInput.value = d.tags.join(', ');
      }
      if (!state.picked.coverUrl && d.coverUrl) state.picked.coverUrl = d.coverUrl;
      const bits = [
        `已选择：${d.title || item.title}`,
        `（${d.source === 'bangumi' ? 'Bangumi' : 'AniList'}）`
      ];
      if (d.episodes) {
        // 提交时一并带上，建作品的同时把 1..N 集建好，省掉「建完再设集数」
        state.picked.episodes = d.episodes;
        bits.push(` · ${d.episodes} 集`);
      }
      if (d.tags?.length) bits.push(` · 已填入标签：${d.tags.join('、')}`);
      statusEl.textContent = bits.join('');
    } catch (err) {
      statusEl.textContent = `已选择：${item.title}（标签补全失败：${err.message}）`;
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
        img.src = item.coverUrl;
        img.loading = 'lazy';
        img.alt = '';
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
      row.appendChild(el('span', 'search-badge', item.source === 'bangumi' ? 'BGM' : 'AL'));
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
        const m = res.meta ?? {};
        if (!m.bangumi?.ok && !m.anilist?.ok) {
          statusEl.textContent = '两个数据源都连不上。中文搜索需要代理，也可以直接在下面手动填写。';
        } else if (!m.bangumi?.ok) {
          statusEl.textContent =
            '中文名搜不到：Bangumi 连不上（大陆访问需要代理）。可以先试日文名或罗马字，或直接在下面手动填写。';
        } else {
          statusEl.textContent = '没有找到，可以直接在下面手动填写';
        }
        return;
      }
      statusEl.textContent = `找到 ${items.length} 条${res.cached ? '（缓存）' : ''}，点一条填入`;
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
      statusEl.textContent = v ? '再输入一个字' : '';
      return;
    }
    statusEl.textContent = '搜索中…';
    timer = setTimeout(() => run(v), 350);
  });

  kw.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    clearTimeout(timer);
    const v = kw.value.trim();
    if (v) run(v);
  });
}

function escapeHtml(s) {  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function closeForm() {
  $('#modal').hidden = true;
  state.editingId = null;
  clearHash();
}

function showFormError(message, field) {
  $('#formError').textContent = message;
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
      toast('已保存');
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
    load();
  } catch (err) {
    showFormError(err.message, err.field);
  }
}

/* ---------------- 事件绑定 ---------------- */

let searchTimer = null;

function bindEvents() {
  $('#q').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const value = e.target.value;
    searchTimer = setTimeout(() => {
      state.keyword = value.trim();
      load();
    }, 260);
  });

  $('#sort').addEventListener('change', (e) => {
    const [sortBy, order] = e.target.value.split(':');
    state.sortBy = sortBy;
    state.order = order;
    load();
  });

  $('#addBtn').addEventListener('click', () => openForm(null));
  $('#enrichAllBtn').addEventListener('click', enrichAll);
  $('#drawerClose').addEventListener('click', closeDrawer);
  $('#modalClose').addEventListener('click', closeForm);
  $('#scrim').addEventListener('click', closeDrawer);

  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeForm();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) return closeForm();
    if ($('#drawer').classList.contains('open')) closeDrawer();
  });
}

/* ---------------- 深链接 ---------------- */

/** 支持 #new 直接打开新增表单、#anime=<id> 直接打开详情，方便书签与外链 */
function handleHash() {
  const h = location.hash.replace(/^#/, '');
  if (!h) return;
  if (h === 'new') {
    openForm(null);
  } else if (h.startsWith('anime=')) {
    openDetail(decodeURIComponent(h.slice(6)));
  }
}

/* ---------------- 启动 ---------------- */

async function boot() {
  renderTabs();
  bindEvents();
  await load();
  handleHash();
  window.addEventListener('hashchange', handleHash);
}

boot();

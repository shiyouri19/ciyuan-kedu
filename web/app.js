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

function cardEl(item) {
  const card = el('div', 'card');
  card.tabIndex = 0;

  const cover = el('div', 'cover');
  cover.style.background = coverStyle(item.canonical_title);
  cover.textContent = firstChar(item.canonical_title);

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
  cover.style.background = coverStyle(anime.canonical_title);
  cover.textContent = firstChar(anime.canonical_title);
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

  // 集数统计（只读，标记功能属于后续阶段）
  const counts = el('div', 'field-value');
  counts.textContent = `季 ${detail.season_count} · 集 ${detail.episode_count} · 已看 ${detail.watched_count}`;
  body.appendChild(fieldBlock('进度概览', counts));

  // 操作
  const actions = el('div', 'drawer-actions');

  const editBtn = el('button', 'btn small', '编辑资料');
  editBtn.type = 'button';
  editBtn.addEventListener('click', () => openForm(detail));
  actions.appendChild(editBtn);

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
    state.picked = { source: item.source, externalId: item.externalId };

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
      const bits = [
        `已选择：${d.title || item.title}`,
        `（${d.source === 'bangumi' ? 'Bangumi' : 'AniList'}）`
      ];
      if (d.episodes) bits.push(` · 共 ${d.episodes} 集`);
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

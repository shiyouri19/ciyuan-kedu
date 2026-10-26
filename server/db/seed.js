import { createAnimeEntry } from '../services/animeService.js';
import { markRange } from '../services/episodeService.js';

const SAMPLES = [
  {
    canonical_title: '葬送的芙莉莲',
    sort_title: '葬送的芙莉莲',
    release_year: 2023,
    anime_type: 'TV',
    default_episode_duration_minutes: 24,
    status: 'completed',
    rating: 10,
    is_favorite: true,
    tags: ['奇幻', '冒险', '治愈'],
    episodes: 28,
    source: 'bilibili',
    external_id: '45859',
    cover_url: 'https://lain.bgm.tv/pic/cover/l/13/c5/400602_ZI8Y9.jpg',
    synopsis:
      '打倒魔王的勇者一行人当中，魔法使芙莉莲是精灵，她和另外三人有着不同的地方。生活在“之后”的世界里，她感受到了什么；留下来的人们所编织的葬送与祈祷又意味着什么……故事从“冒险的结束”开始。',
    notes: '节奏沉静悠远，音乐与作画俱佳，近年最喜欢的奇幻公路番。',
    watchRanges: [
      { from: 1, to: 16, date: '2026-02-15' },
      { from: 17, to: 28, date: '2026-03-22' }
    ]
  },
  {
    canonical_title: '迷宫饭',
    sort_title: '迷宫饭',
    release_year: 2024,
    anime_type: 'TV',
    default_episode_duration_minutes: 24,
    status: 'watching',
    rating: 9,
    is_favorite: true,
    tags: ['美食', '奇幻', '冒险'],
    episodes: 24,
    source: 'bilibili',
    external_id: '46490',
    cover_url: 'https://lain.bgm.tv/pic/cover/l/c5/88/395378_jztpO.jpg',
    synopsis:
      '迷宫饭，要么吃，要么被吃！冒险者莱欧斯一行人在迷宫深处遭到红龙袭击，妹妹法琳被红龙吞下。为了在身无分文的情况下重返迷宫救出妹妹，莱欧斯决定：自给自足，把迷宫里的魔物做成美味料理！',
    notes: '魔物生态设定极其严谨，扳机社制作表现力拉满。',
    watchRanges: [
      { from: 1, to: 12, date: '2026-05-10' },
      { from: 13, to: 18, date: '2026-06-08' }
    ]
  },
  {
    canonical_title: '孤独摇滚！',
    sort_title: '孤独摇滚',
    release_year: 2022,
    anime_type: 'TV',
    default_episode_duration_minutes: 24,
    status: 'completed',
    rating: 9,
    is_favorite: false,
    tags: ['音乐', '日常', '搞笑'],
    episodes: 12,
    source: 'bilibili',
    external_id: '43164',
    cover_url: 'https://lain.bgm.tv/pic/cover/l/e2/e7/328609_2EHLJ.jpg',
    synopsis:
      '绰号“波奇酱”的后藤一里是一名喜爱吉他的孤独少女，渴望组建乐队却因极度社恐而在高中陷入孤立。某天她被伊地知虹夏拉入“结束乐队”，由此展开了在Livehouse里克服胆怯、挥洒青春的音乐日常。',
    notes: '演出的创意形式千变万化，Live 曲目非常耐听。',
    watchRanges: [{ from: 1, to: 12, date: '2026-08-18' }]
  },
  {
    canonical_title: '药屋少女的呢喃',
    sort_title: '药屋少女的呢喃',
    release_year: 2023,
    anime_type: 'TV',
    default_episode_duration_minutes: 24,
    status: 'want',
    rating: null,
    is_favorite: false,
    tags: ['推理', '古风', '日常'],
    episodes: 24,
    source: 'bilibili',
    external_id: '45880',
    cover_url: 'https://lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg',
    synopsis:
      '位于大陆中央的某个大国，花街的药师少女“猫猫”被拐卖至后宫充当宫女。原本只想低调熬过任期的她，却因好奇心与渊博的药学毒物知识被宦官壬氏发掘，接连解开宫廷中扑朔迷离的谜团。',
    notes: '朋友强烈推荐，准备周末开始补番。',
    watchRanges: []
  },
  {
    canonical_title: '吹响吧！上低音号 第三季',
    sort_title: '吹响吧上低音号3',
    release_year: 2024,
    anime_type: 'TV',
    default_episode_duration_minutes: 24,
    status: 'watching',
    rating: 9,
    is_favorite: true,
    tags: ['音乐', '青春', '校园'],
    episodes: 13,
    source: 'bangumi',
    external_id: '47501',
    cover_url: 'https://lain.bgm.tv/pic/cover/l/ef/8f/283643_2bcm7.jpg',
    synopsis:
      '升入高三并担任北宇治高中吹奏乐部部长的黄前久美子，与部员们以及转学生黑江真由一起，向着梦寐以求的全国大赛金奖发起最后的冲刺。',
    notes: '久美子三年吹奏部生涯的集大成之作，合奏演出张力十足。',
    watchRanges: [{ from: 1, to: 8, date: '2026-09-14' }]
  },
  {
    canonical_title: '胆大党',
    sort_title: '胆大党',
    release_year: 2024,
    anime_type: 'TV',
    default_episode_duration_minutes: 24,
    status: 'watching',
    rating: 9,
    is_favorite: false,
    tags: ['奇幻', '战斗', '青春'],
    episodes: 12,
    source: 'bangumi',
    external_id: '49001',
    cover_url: 'https://lain.bgm.tv/pic/cover/l/44/7d/467461_HHw4K.jpg',
    synopsis:
      '相信幽灵存在却否定外星人的辣妹绫濑桃，与相信外星人存在却否定幽灵的社恐少年高仓健（厄卡伦），两人为证明各自观点前往灵异圣地，却双双遭遇超常怪异。',
    notes: '科学猴的分镜与色彩爆发力太强了，每集高能不断。',
    watchRanges: [{ from: 1, to: 5, date: '2026-10-12' }]
  },
  {
    canonical_title: '败犬女主太多了！',
    sort_title: '败犬女主太多了',
    release_year: 2024,
    anime_type: 'TV',
    default_episode_duration_minutes: 24,
    status: 'paused',
    rating: 9,
    is_favorite: false,
    tags: ['青春', '校园', '恋爱'],
    episodes: 12,
    source: 'bangumi',
    external_id: '48120',
    cover_url: 'https://lain.bgm.tv/pic/cover/l/e4/dc/464376_NsZRw.jpg',
    synopsis:
      '自称“背景人物”的高中生温水佳树，偶然目睹了人气女生八奈见杏菜被青梅竹马甩掉的失恋现场。以此为契机，身边接二连三聚集起恋爱失利的“败犬女主”们。',
    notes: 'A-1 制作极其精良，八奈见杏菜塑造得太鲜活了。',
    watchRanges: [{ from: 1, to: 4, date: '2026-07-28' }]
  }
];

const BROKEN_COVER_REPLACEMENTS = new Map([
  ['https://lain.bgm.tv/pic/cover/l/c5/8b/395378_377O8.jpg', 'https://lain.bgm.tv/pic/cover/l/c5/88/395378_jztpO.jpg'],
  ['https://lain.bgm.tv/pic/cover/l/ce/fb/419457_5222H.jpg', 'https://lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg'],
  ['https://lain.bgm.tv/pic/cover/l/9f/37/469725_Z52n2.jpg', 'https://lain.bgm.tv/pic/cover/l/e4/dc/464376_NsZRw.jpg'],
  ['https://lain.bgm.tv/pic/cover/l/86/f2/467461_hhfdF.jpg', 'https://lain.bgm.tv/pic/cover/l/44/7d/467461_HHw4K.jpg'],
  ['https://lain.bgm.tv/pic/cover/l/a3/86/325285_595M7.jpg', 'https://lain.bgm.tv/pic/cover/l/65/90/325285_4688X.jpg']
]);

function repairKnownBrokenData(db) {
  try {
    const ts = new Date().toISOString();
    // 只做通用的「失效图床地址 → 新地址」替换。
    // 这里不针对具体番名写死封面：那种补丁会随每次启动改 updated_at，
    // 把用户的作品顶到列表最前面，而且产品代码不该认识某一部具体的番。
    // 封面缺了用界面的「补全资料」补，那条路是可预期、可撤销的。
    for (const [oldUrl, newUrl] of BROKEN_COVER_REPLACEMENTS.entries()) {
      db.prepare('UPDATE anime SET cover_path = ?, updated_at = ? WHERE cover_path = ?').run(newUrl, ts, oldUrl);
    }
    // 浏览器端选择的相对路径文件不落盘于服务端，不应标为 missing
    db.prepare(
      "UPDATE media_files SET availability_status = 'available', updated_at = ? WHERE library_root_id IS NULL AND availability_status = 'missing'"
    ).run(ts);
  } catch {
    /* ignore */
  }
}

export function seedDemoData(db) {
  repairKnownBrokenData(db);
  const existingTitles = new Set(
    db
      .prepare('SELECT canonical_title FROM anime WHERE deleted_at IS NULL')
      .all()
      .map((r) => r.canonical_title)
  );

  let count = 0;
  for (const item of SAMPLES) {
    if (existingTitles.has(item.canonical_title)) continue;
    const { watchRanges, ...input } = item;
    const created = createAnimeEntry(db, input);
    for (const r of watchRanges ?? []) {
      markRange(db, created.anime.id, r.from, r.to, r.date);
    }
    count += 1;
  }

  db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('initial_seed_v1', '1', ?)").run(
    new Date().toISOString()
  );
  return { seeded: count > 0, count };
}

export function seedInitialLibraryIfNeeded(db) {
  repairKnownBrokenData(db);

  const marker = db.prepare("SELECT value FROM app_settings WHERE key = 'initial_seed_v1'").get();
  if (marker) return { seeded: false, count: 0 };

  const countRow = db.prepare('SELECT COUNT(*) AS c FROM anime').get();
  if (Number(countRow?.c ?? 0) > 0) {
    db.prepare("INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('initial_seed_v1', '1', ?)").run(
      new Date().toISOString()
    );
    return { seeded: false, count: 0 };
  }

  return seedDemoData(db);
}

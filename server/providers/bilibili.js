import { requestJson } from '../net.js';
import { normalize, buildAnimeDedupKeys } from './bangumi.js';

const SEARCH_API = 'https://api.bilibili.com/x/web-interface/search/type';
const SEASON_API = 'https://api.bilibili.com/pgc/view/web/season';
const MEDIA_API = 'https://api.bilibili.com/pgc/review/user';
const SEASON_INDEX_API = 'https://api.bilibili.com/pgc/season/index/result';

const BILI_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Referer: 'https://www.bilibili.com/',
  Accept: 'application/json, text/plain, */*',
  Cookie: 'buvid3=9F3A8B2C-4D1E-4A9B-8C7D-1E2F3A4B5C6D16888infoc; b_nut=1710000000'
};

export const SEASON_TO_MONTH = {
  winter: 1,
  spring: 4,
  summer: 7,
  autumn: 10
};

/**
 * 内置热门中文番剧与季度新番索引兜底：
 * 仅在离线环境或远端 API 均不可达时提供兜底，以及作为本地罗马音文件名/跨源同番别名的中文词典。
 */
export const CURATED_CN_CATALOG = [
  // ---- 2026 各季度代表新番 ----
  {
    externalId: '26101',
    title: '葬送的芙莉莲 第二季',
    titleNative: '葬送のフリーレン 第2期',
    aliases: ['芙莉莲2', 'frieren s2', 'sousou no frieren s2', 'sousou no frieren 2nd season'],
    year: 2026,
    season: 'winter',
    airDate: '2026-01-16',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/13/c5/400602_ZI8Y9.jpg',
    summary:
      '芙莉莲、菲伦与休塔尔克继续向北方诸国与灵魂安眠之地（奥蕾欧尔）前行。在漫长的旅途中，新的魔法使同伴与强大的魔族残党陆续登场。',
    score: 9.5,
    tags: ['奇幻', '冒险', '治愈']
  },
  {
    externalId: '26103',
    title: '金牌得主 第二季',
    titleNative: 'メダリスト 第2期',
    aliases: ['medalist s2', 'medalist 2nd season', '花样滑冰2'],
    year: 2026,
    season: 'winter',
    airDate: '2026-01-10',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/ce/3c/430699_hsj90.jpg',
    summary:
      '起步晚于同龄人的少女结束祈，与曾受挫的花滑选手明浦路司结成师徒。两人怀揣着对冰面的炽热执念，向全日本青少年花样滑冰锦标赛发起冲击。',
    score: 9.3,
    tags: ['竞技', '运动', '热血']
  },
  {
    externalId: '26102',
    title: '迷宫饭 第二季',
    titleNative: 'ダンジョン飯 第2期',
    aliases: ['delicious in dungeon s2', 'dungeon meshi s2', 'dungeon meshi 2nd season', '迷宫饭2'],
    year: 2026,
    season: 'spring',
    airDate: '2026-04-09',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/c5/88/395378_jztpO.jpg',
    summary:
      '深入迷宫最底层的莱欧斯小队直面狂乱魔法师希斯路与翼之狮的真相。为拯救变成奇美拉的法琳，场场硬仗都离不开更加天马行空的魔物大餐。',
    score: 9.4,
    tags: ['美食', '奇幻', '冒险']
  },
  {
    externalId: '26104',
    title: '败犬女主太多了！第二季',
    titleNative: '負けヒロインが多すぎる！第2期',
    aliases: ['败犬女主2', 'makeine s2', 'make heroine ga ooisugiru s2'],
    year: 2026,
    season: 'summer',
    airDate: '2026-07-12',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/e4/dc/464376_NsZRw.jpg',
    summary:
      '石蕗高中文艺部的新学期拉开帷幕！温水佳树与八奈见杏菜、烧盐柠檬、小鞠知花等“败犬女主”们在吵吵闹闹的社团日常中迎来新的青春波澜。',
    score: 9.2,
    tags: ['青春', '校园', '恋爱']
  },
  {
    // Bangumi 真实条目是 537409，放送开始和话数都还是空的（未定档）。
    // 这条以前写的是 externalId 26105 + airDate 2026-10-10 + episodes 12，
    // 三个都是编的，结果它顶着「12 集 / 2026-10-10」出现在秋季已开播列表里。
    externalId: '537409',
    title: '孤独摇滚！第二季',
    titleNative: 'ぼっち・ざ・ろっく！第2期',
    aliases: ['结束乐队2', 'bocchi s2', 'bocchi the rock s2'],
    year: 2026,
    season: 'autumn',
    airDate: '',
    episodes: 0,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/e2/e7/328609_2EHLJ.jpg',
    summary: '第二季已公布制作决定，放送日期与话数尚未公开。',
    score: null,
    tags: ['音乐', '日常', '搞笑']
  },
  {
    externalId: '26106',
    title: '诡秘之主 特别篇',
    titleNative: '诡秘之主',
    aliases: ['克莱恩', '愚者', 'lord of the mysteries'],
    year: 2026,
    season: 'autumn',
    airDate: '2026-10-03',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/ed/4a/345824_VXxo5.jpg',
    summary:
      '蒸汽与机械的浪潮中，谁能触及非凡？历史和黑暗的迷雾里，又是谁在耳语？周明瑞从诡异中醒来，以“愚者”之名开启塔罗会的神秘序幕。',
    score: 9.1,
    tags: ['悬疑', '奇幻', '国创']
  },
  // ---- 2025 各季度代表新番 ----
  {
    externalId: '454684',
    legacyIds: ['25101'],
    title: '颂乐人偶 Ave Mujica',
    titleNative: 'BanG Dream! Ave Mujica',
    aliases: ['母鸡卡', 'ave mujica', 'mygo续篇', 'bang dream ave mujica', 'BanG Dream! It\'s MyGO!!!!! 续篇'],
    year: 2025,
    season: 'winter',
    airDate: '2025-01-02',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/77/c3/454684_ZH5tU.jpg',
    summary:
      '丰川祥子亲手组建的假面乐队 Ave Mujica 登上华丽的商业舞台，在狂热演出的面具之下，五位少女各自背负的秘密与裂痕正逐步浮出水面。',
    score: 9.0,
    tags: ['音乐', '剧情', '群像']
  },
  {
    externalId: '486192',
    legacyIds: ['25102'],
    title: '药屋少女的呢喃 第二季',
    titleNative: '薬屋のひとりごと 第2期',
    aliases: [
      '药屋少女2',
      '药屋少女的呢喃 第2期',
      '药屋少女的呢喃 第2季',
      '藥屋少女的呢喃 第二季',
      '猫猫2',
      'kusuriya no hitorigoto s2',
      'the apothecary diaries s2'
    ],
    year: 2025,
    season: 'winter',
    airDate: '2025-01-10',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg',
    summary:
      '猫猫与壬氏继续在后宫与外廷之间周旋，来自异国的使节、潜藏在宫廷深处的阴谋与楼兰妃的真相，将所有人的命运卷入更大的漩涡。',
    score: 9.2,
    tags: ['推理', '古风', '日常']
  },
  {
    externalId: '430699',
    title: '金牌得主',
    titleNative: 'メダリスト',
    aliases: ['medalist', '结束祈', '明浦路司', '花样滑冰金牌得主'],
    year: 2025,
    season: 'winter',
    airDate: '2025-01-04',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/ce/3c/430699_hsj90.jpg',
    summary:
      '对花样滑冰怀有强烈憧憬的少女结束祈，与曾受挫的前选手明浦路司相遇。两人结成搭档，向着冰面上的金牌发起全力挑战！',
    score: 9.1,
    tags: ['运动', '竞技', '励志']
  },
  {
    externalId: '467812',
    title: '坂本日常',
    titleNative: 'SAKAMOTO DAYS',
    aliases: ['sakamoto days', '坂本太郎', '坂本days'],
    year: 2025,
    season: 'winter',
    airDate: '2025-01-11',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/c2/4c/253_t3XWb.jpg',
    summary:
      '最强传说级杀手坂本太郎为了爱情金盆洗手，结婚生子后发福成了街角小商店的老板。为了守护平静幸福的家庭日常，他与伙伴们一次次击退来袭的刺客。',
    score: 8.4,
    tags: ['战斗', '搞笑', '日常']
  },
  {
    externalId: '485936',
    title: '我独自升级 第二季 -起于暗影-',
    titleNative: '俺だけレベルアップな件 Season 2 -Arise from the Shadow-',
    aliases: ['solo leveling s2', '我独自升级2', '我独自升级 第二季', '我独自升级 第2季', '我独自升级 第2期'],
    year: 2025,
    season: 'winter',
    airDate: '2025-01-04',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/60/fe/294993_JrrzK.jpg',
    summary:
      '觉醒为暗影君王的程肖宇率领暗影军团深入高阶地下城，为制作生命神水救治母亲并揭开系统背后的秘密而持续升级。',
    score: 8.6,
    tags: ['战斗', '奇幻', '热血']
  },
  {
    externalId: '471230',
    title: '全修。',
    titleNative: '全修。',
    aliases: ['zenshu', 'zenshuu', '广濑夏子'],
    year: 2025,
    season: 'winter',
    airDate: '2025-01-05',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/1e/e2/183878_Fef1o.jpg',
    summary:
      '天才动画监督广濑夏子在创作陷入瓶颈时意外穿越进自己童年最喜爱的剧场版动画世界中，用画笔改写走向毁灭的宿命结局。',
    score: 8.1,
    tags: ['奇幻', '原创', '穿越']
  },
  {
    externalId: '501920',
    legacyIds: ['25103'],
    title: '小市民系列 第二季',
    titleNative: '小市民シリーズ 第2期',
    aliases: ['shoushimin series s2', '小市民系列 第2期', '秋期限定栗子金团事件', '冬期限定夹心巧克力事件'],
    year: 2025,
    season: 'spring',
    airDate: '2025-04-05',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/e2/f4/474906_z0h44.jpg',
    summary:
      '立志成为低调“小市民”的小鸠常悟朗与小佐内由纪，在秋天与冬天的甜品日常中，再次面对连续纵火案与多年前的肇事逃逸谜团。',
    score: 8.9,
    tags: ['推理', '日常', '校园']
  },
  {
    externalId: '498761',
    title: '机动战士高达 GQuuuuuuX',
    titleNative: '機動戦士Gundam GQuuuuuuX',
    aliases: ['gquuuuuux', '高达gquuuuuux', '天手让叶'],
    year: 2025,
    season: 'spring',
    airDate: '2025-04-08',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/a9/79/10380_YwP4R.jpg',
    summary:
      '在太空殖民地生活的女高中生天手让叶，偶遇难民少女尼娅安后被卷入非法MS决斗竞技“军团战”，驾驶神秘高达 GQuuuuuuX 投身时代洪流。',
    score: 8.7,
    tags: ['机战', '科幻', '原创']
  },
  {
    externalId: '496301',
    title: '魔女与使魔',
    titleNative: 'ウィッチウォッチ',
    aliases: ['witch watch', '若月妮可'],
    year: 2025,
    season: 'spring',
    airDate: '2025-04-06',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/e4/dc/464376_NsZRw.jpg',
    summary:
      '结束魔女修行的少女若月妮可搬进青梅竹马鬼之后裔乙木守仁家中，由守仁担任贴身使魔，充满奇妙魔法事故的同居喜剧就此开始。',
    score: 8.5,
    tags: ['搞笑', '奇幻', '日常']
  },
  {
    externalId: '502840',
    legacyIds: ['25104'],
    title: '胆大党 第二季',
    titleNative: 'ダンダダン 第2期',
    aliases: ['dandadan s2', '当哒当2', '胆大党 第2期', '当哒当 第二季'],
    year: 2025,
    season: 'summer',
    airDate: '2025-07-03',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/44/7d/467461_HHw4K.jpg',
    summary:
      '绫濑桃、厄卡伦与寺仁来到诡异的温泉村，直面盘踞在地下深处的邪视与诅咒之屋，超自然与外星怪异的激战再度升级！',
    score: 9.1,
    tags: ['奇幻', '战斗', '青春']
  },
  {
    externalId: '499110',
    title: '光逝去的夏天',
    titleNative: '光が死んだ夏',
    aliases: ['hikaru ga shinda natsu', 'the summer hikaru died'],
    year: 2025,
    season: 'summer',
    airDate: '2025-07-05',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/65/90/325285_4688X.jpg',
    summary:
      '在偏僻山村长大的少年佳纪，某天发觉身边形影不离的挚友“光”其实已被山中某种未知的存在取代。在酷热蝉鸣的夏日里，怪异悄然蔓延。',
    score: 8.8,
    tags: ['悬疑', '奇幻', '剧情']
  },
  {
    externalId: '500120',
    title: '花薰凛然',
    titleNative: '薫る花は凛と咲く',
    aliases: ['kaoru hana wa rin to saku', '凛然绽放的花朵', '薰香花朵凛然绽放'],
    year: 2025,
    season: 'summer',
    airDate: '2025-07-06',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/2a/f7/248175_2w4zT.jpg',
    summary:
      '垫底男校千鸟高中的少年䌷凛太郎与相邻贵族女校桔梗女子的少女和栗薰子在自家蛋糕店相遇，跨越偏见的纯粹青春物语悄然绽放。',
    score: 9.0,
    tags: ['恋爱', '校园', '青春']
  },
  {
    externalId: '503112',
    legacyIds: ['25105'],
    title: '间谍过家家 第三季',
    titleNative: 'SPY×FAMILY Season 3',
    aliases: ['阿尼亚3', 'spy family s3', 'spy x family s3', '间谍过家家 第3期', '间谍过家家 第3季'],
    year: 2025,
    season: 'autumn',
    airDate: '2025-10-04',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/de/4a/329906_hmtVD.jpg',
    summary:
      '福杰一家的温馨日常与危机任务同步推进，阿尼亚在伊甸学园面临新的雷电与星星考验，黄昏的过去也随之揭晓。',
    score: 9.0,
    tags: ['搞笑', '日常', '家庭']
  },
  // ---- 2024 及经典代表作 ----
  {
    externalId: '45859',
    title: '葬送的芙莉莲',
    titleNative: '葬送のフリーレン',
    aliases: ['芙莉莲', 'frieren', 'sousou no frieren', 'frieren beyond journeys end'],
    year: 2023,
    season: 'autumn',
    airDate: '2023-09-29',
    episodes: 28,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/13/c5/400602_ZI8Y9.jpg',
    summary:
      '打倒魔王的勇者一行人当中，魔法使芙莉莲是精灵，她和另外三人有着不同的地方。生活在“之后”的世界里，她感受到了什么；留下来的人们所编织的葬送与祈祷又意味着什么……故事从“冒险的结束”开始。',
    score: 9.5,
    tags: ['奇幻', '冒险', '治愈']
  },
  {
    externalId: '46490',
    title: '迷宫饭',
    titleNative: 'ダンジョン飯',
    aliases: ['dungeon meshi', 'delicious in dungeon', '莱欧斯', '玛露希尔'],
    year: 2024,
    season: 'winter',
    airDate: '2024-01-04',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/c5/88/395378_jztpO.jpg',
    summary:
      '迷宫饭，要么吃，要么被吃！冒险者莱欧斯一行人在迷宫深处遭到红龙袭击，妹妹法琳被红龙吞下。为了在身无分文的情况下重返迷宫救出妹妹，莱欧斯决定：自给自足，把迷宫里的魔物做成美味料理！',
    score: 9.4,
    tags: ['美食', '奇幻', '冒险']
  },
  {
    externalId: '47501',
    title: '吹响吧！上低音号 第三季',
    titleNative: '響け！ユーフォニアム3',
    aliases: ['京吹3', '黄前久美子', 'hibike euphonium 3', 'hibike! euphonium 3', 'sound! euphonium 3'],
    year: 2024,
    season: 'spring',
    airDate: '2024-04-07',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/ef/8f/283643_2bcm7.jpg',
    summary:
      '升入高三并担任北宇治高中吹奏乐部部长的黄前久美子，与部员们以及转学生黑江真由一起，向着梦寐以求的全国大赛金奖发起最后的冲刺。',
    score: 9.1,
    tags: ['音乐', '青春', '校园']
  },
  {
    externalId: '48120',
    title: '败犬女主太多了！',
    titleNative: '負けヒロインが多すぎる！',
    aliases: ['败犬女主', '八奈见杏菜', 'makeine', 'make heroine ga ooisugiru', 'too many losing heroines'],
    year: 2024,
    season: 'summer',
    airDate: '2024-07-13',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/e4/dc/464376_NsZRw.jpg',
    summary:
      '自称“背景人物”的高中生温水佳树，偶然目睹了人气女生八奈见杏菜被青梅竹马甩掉的失恋现场。以此为契机，身边接二连三聚集起恋爱失利的“败犬女主”们，一段不按套路出牌的青春故事就此开幕。',
    score: 9.3,
    tags: ['青春', '校园', '恋爱']
  },
  {
    externalId: '49001',
    title: '胆大党',
    titleNative: 'ダンダダン',
    aliases: ['dandadan', '超自然武装当哒当', '当哒当'],
    year: 2024,
    season: 'autumn',
    airDate: '2024-10-03',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/44/7d/467461_HHw4K.jpg',
    summary:
      '相信幽灵存在却否定外星人的辣妹绫濑桃，与相信外星人存在却否定幽灵的社恐少年高仓健（厄卡伦），两人为证明各自观点前往灵异圣地，却双双遭遇超常怪异，展开了疾风骤雨般的青春超能力战斗。',
    score: 9.2,
    tags: ['奇幻', '战斗', '青春']
  },
  {
    externalId: '43164',
    title: '孤独摇滚！',
    titleNative: 'ぼっち・ざ・ろっく！',
    aliases: ['孤独摇滚', '波奇酱', 'bocchi the rock', 'bocchi the rock!'],
    year: 2022,
    season: 'autumn',
    airDate: '2022-10-08',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/e2/e7/328609_2EHLJ.jpg',
    summary:
      '绰号“波奇酱”的后藤一里是一名喜爱吉他的孤独少女，渴望组建乐队却因极度社恐而在高中陷入孤立。某天她被伊地知虹夏拉入“结束乐队”，由此展开了在Livehouse里克服胆怯、挥洒青春的音乐日常。',
    score: 9.6,
    tags: ['音乐', '日常', '搞笑']
  },
  {
    externalId: '45880',
    title: '药屋少女的呢喃',
    titleNative: '薬屋のひとりごと',
    aliases: ['药屋少女', '猫猫', 'kusuriya', 'kusuriya no hitorigoto', 'the apothecary diaries'],
    year: 2023,
    season: 'autumn',
    airDate: '2023-10-21',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg',
    summary:
      '位于大陆中央的某个大国，花街的药师少女“猫猫”被拐卖至后宫充当宫女。原本只想低调熬过任期的她，却因好奇心与渊博的药学毒物知识被宦官壬氏发掘，接连解开宫廷中扑朔迷离的谜团。',
    score: 9.2,
    tags: ['推理', '古风', '日常']
  },
  {
    externalId: '1535',
    title: '星际牛仔',
    titleNative: 'カウボーイビバップ',
    aliases: ['cowboy bebop', '斯派克'],
    year: 1998,
    season: 'spring',
    airDate: '1998-04-03',
    episodes: 26,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/c2/4c/253_t3XWb.jpg',
    summary:
      '2071年，随着超光速航行技术的实现，人类得以在太阳系范围内便捷移动。赏金猎人斯派克与杰特驾驶飞船“Bebop号”在星际间游荡，与菲、爱德和修狗爱因相遇，在爵士乐与太空浪漫中追寻各自的过去。',
    score: 9.7,
    tags: ['科幻', '太空', '经典']
  },
  {
    externalId: '28220',
    title: '进击的巨人',
    titleNative: '進撃の巨人',
    aliases: ['巨人', 'attack on titan', 'shingeki no kyojin', 'aot'],
    year: 2013,
    season: 'spring',
    airDate: '2013-04-06',
    episodes: 25,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/78/c9/55770_HsJfh.jpg',
    summary:
      '百年前世界莫名出现神秘的巨人捕食人类，幸存的人类建造了三道高耸入云的巨墙苟延残喘。那一天，人类终于回想起了曾一度被它们所支配的恐怖，以及被囚禁于鸟笼中的那份屈辱。',
    score: 9.4,
    tags: ['热血', '战斗', '奇幻']
  },
  {
    externalId: '39433',
    title: '间谍过家家',
    titleNative: 'SPY×FAMILY',
    aliases: ['阿尼亚', 'spy family', 'spy x family'],
    year: 2022,
    season: 'spring',
    airDate: '2022-04-09',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/de/4a/329906_hmtVD.jpg',
    summary:
      '顶尖间谍“黄昏”为执行维护东西和平的机密任务，必须在一周内组建家庭。然而他收养的女儿阿尼亚竟是读心超能力者，契约结婚的妻子约尔则是暗杀者——互相隐瞒真实身份的临时家庭喜剧正式上演。',
    score: 9.1,
    tags: ['搞笑', '日常', '家庭']
  },
  {
    externalId: '21542',
    title: '紫罗兰永恒花园',
    titleNative: 'ヴァイオレット・エヴァーガーデン',
    aliases: ['京紫', 'violet evergarden'],
    year: 2018,
    season: 'winter',
    airDate: '2018-01-10',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/1e/e2/183878_Fef1o.jpg',
    summary:
      '曾作为战争机器生活的少女薇尔莉特·伊芙加登，在战争结束后成为替人代笔书信的“自动手记人偶”。在为一封封委托人传递心意的旅途中，她逐渐探寻那句“我爱你”的真正含义。',
    score: 9.0,
    tags: ['治愈', '剧情', '催泪']
  },
  {
    externalId: '36170',
    title: '奇巧计程车',
    titleNative: 'オッドタクシー',
    aliases: ['odd taxi', 'oddtaxi', '小户川'],
    year: 2021,
    season: 'spring',
    airDate: '2021-04-05',
    episodes: 13,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/65/90/325285_4688X.jpg',
    summary:
      '性格孤僻的41岁海象出租车司机小户川，平时只与形形色色的乘客简短交谈。然而这些看似毫无关联的对话，却一步步串联起震动东京的练马区女高中生失踪悬案。',
    score: 9.6,
    tags: ['悬疑', '剧情', '群像']
  },
  {
    externalId: '1587',
    title: '命运石之门',
    titleNative: 'STEINS;GATE',
    aliases: ['石头门', 'steins gate', 'steins;gate'],
    year: 2011,
    season: 'spring',
    airDate: '2011-04-05',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/a9/79/10380_YwP4R.jpg',
    summary:
      '秋叶原的“未来道具研究所”偶然发明出能够向过去发送短信的电话微波炉（暂定）。中二病大学生冈部伦太郎在一次次改变世界线的尝试中，陷入了残酷的命运因果漩涡。',
    score: 9.7,
    tags: ['科幻', '悬疑', '穿越']
  },
  {
    externalId: '277554',
    title: '无职转生 ～到了异世界就拿出真本事～',
    titleNative: '無職転生 ～異世界行ったら本気だす～',
    aliases: ['无职转生', 'mushoku tensei', '无职转生 第三季', '无职转生 第二季', '鲁迪乌斯'],
    year: 2021,
    season: 'winter',
    airDate: '2021-01-10',
    episodes: 23,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/8b/00/277554_z999u.jpg',
    summary:
      '34岁无职家里蹲在遭遇车祸身亡后，带着前世记忆转生到了剑与魔法的异世界。重获新生的少年鲁迪乌斯·格雷拉特发誓：这一次一定要在异世界拿出真本事认真活下去！',
    score: 9.1,
    tags: ['奇幻', '冒险', '异世界']
  },
  {
    externalId: '245665',
    title: '鬼灭之刃',
    titleNative: '鬼滅の刃',
    aliases: ['kimetsu no yaiba', 'demon slayer', '炭治郎'],
    year: 2019,
    season: 'spring',
    airDate: '2019-04-06',
    episodes: 26,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/9d/d1/245665_5an54.jpg',
    summary:
      '大正时期日本，心地善良的卖炭少年灶门炭治郎一家遭恶鬼袭击，唯一生还的妹妹祢豆子却变成了鬼。为了让妹妹变回人类并讨伐恶鬼，炭治郎踏上了斩鬼的修行之路。',
    score: 9.0,
    tags: ['热血', '战斗', '奇幻']
  },
  {
    externalId: '294993',
    title: '咒术回战',
    titleNative: '呪術廻戦',
    aliases: ['jujutsu kaisen', 'jjk', '虎杖悠仁', '五条悟'],
    year: 2020,
    season: 'autumn',
    airDate: '2020-10-02',
    episodes: 24,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/60/fe/294993_JrrzK.jpg',
    summary:
      '拥有惊人身体能力的少年虎杖悠仁，为拯救被诅咒袭击的同伴而吞下了特级咒物“两面宿傩之指”，自此踏入咒术师与诅咒交锋的残酷世界。',
    score: 8.8,
    tags: ['战斗', '奇幻', '热血']
  },
  {
    externalId: '140001',
    title: 'Re：从零开始的异世界生活',
    titleNative: 'Re:ゼロから始める異世界生活',
    aliases: ['从零开始的异世界生活', 're0', 're zero', 're:zero', '爱蜜莉雅', '雷姆'],
    year: 2016,
    season: 'spring',
    airDate: '2016-04-03',
    episodes: 25,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/cb/78/140001_Ew1mo.jpg',
    summary:
      '走出便利店的高中生菜月昴突然被召唤到异世界，唯一获得的能力是死后时间倒流的“死亡回归”。为了守护重要之人的笑容，少年一次次跨越绝望的轮回。',
    score: 9.0,
    tags: ['奇幻', '异世界', '轮回']
  },
  {
    externalId: '248175',
    title: '辉夜大小姐想让我告白～天才们的恋爱头脑战～',
    titleNative: 'かぐや様は告らせたい～天才たちの恋愛頭脳戦～',
    aliases: ['辉夜大小姐想让我告白', '辉夜大小姐', 'kaguya-sama', 'kaguya sama'],
    year: 2019,
    season: 'winter',
    airDate: '2019-01-12',
    episodes: 12,
    coverUrl: 'https://lain.bgm.tv/pic/cover/l/2a/f7/248175_2w4zT.jpg',
    summary:
      '秀知院学园学生会会长白银御行与副会长四宫辉夜，明明互相吸引却因为极高的自尊心，每天都在绞尽脑汁设法让对方先向自己告白！',
    score: 9.2,
    tags: ['恋爱', '搞笑', '校园']
  }
];

const normLookupKey = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[\s·・:：!！?？、,，.。'"“”‘’\-—–_/\\()（）[\]【】~～;；×]/g, '');

/**
 * 根据罗马音、日文原名、繁简变体或季度别名反查内置中文番剧条目（用于本地文件名识别与 Bangumi/弹弹Play 跨源同番归一化）。
 */
export function lookupCuratedChineseEntry(...rawCandidates) {
  const exactKeys = rawCandidates.map(normLookupKey).filter(Boolean);
  const dedupKeys = buildAnimeDedupKeys(...rawCandidates);
  if (exactKeys.length === 0 && dedupKeys.length === 0) return null;

  for (const item of CURATED_CN_CATALOG) {
    const itemExactKeys = [item.title, item.titleNative, ...(item.aliases ?? [])]
      .map(normLookupKey)
      .filter(Boolean);
    if (exactKeys.some((k) => itemExactKeys.includes(k))) {
      return item;
    }

    const itemDedupKeys = buildAnimeDedupKeys(item.title, item.titleNative, ...(item.aliases ?? []));
    if (dedupKeys.some((k) => itemDedupKeys.includes(k))) {
      return item;
    }
  }
  return null;
}

function toNormalizedItem(it, sourceName = 'bangumi') {
  const norm = normalize(
    {
      externalId: it.externalId,
      title: it.title,
      titleNative: it.titleNative,
      titleAlt: (it.aliases && it.aliases[0]) || it.titleNative,
      year: it.year,
      episodes: it.episodes,
      coverUrl: it.coverUrl,
      summary: it.summary,
      score: it.score,
      tags: it.tags
    },
    sourceName
  );
  norm.aliases = it.aliases ?? [];
  norm.airDate = it.airDate || '';
  return norm;
}

export function searchCurated(keyword, limit = 8, sourceName = 'bangumi') {
  const kw = String(keyword ?? '').trim().toLowerCase();
  const kwNorm = normLookupKey(kw);
  if (!kw) return [];
  return CURATED_CN_CATALOG.filter((it) => {
    const hay = [it.title, it.titleNative, ...(it.aliases ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (hay.includes(kw)) return true;
    const hayNorm = [it.title, it.titleNative, ...(it.aliases ?? [])]
      .map(normLookupKey)
      .join(' ');
    return Boolean(kwNorm && hayNorm.includes(kwNorm));
  })
    .slice(0, limit)
    .map((it) => toNormalizedItem(it, sourceName));
}

export function findCuratedById(externalId, sourceName = 'bangumi') {
  const idStr = String(externalId ?? '').trim().replace(/^ss/i, '');
  const hit = CURATED_CN_CATALOG.find(
    (it) => it.externalId === idStr || (Array.isArray(it.legacyIds) && it.legacyIds.includes(idStr))
  );
  return hit ? toNormalizedItem(hit, sourceName) : null;
}

function getLocalTodayIso() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getCuratedSeasonal(
  year,
  season = 'winter',
  sourceName = 'bangumi',
  { includeUnreleased = false } = {}
) {
  const y = Number(year);
  const sKey = String(season || 'winter').toLowerCase();
  const todayIso = getLocalTodayIso();

  const filterByAired = (list) =>
    list.filter((it) => {
      if (includeUnreleased) return true;
      // 没有开播日期 = 还没定档。以前这种会被放过去，导致「未定档」的番
      // 出现在「仅看已开播正片」里（比如孤独摇滚二季）。
      if (!it.airDate) return false;
      if (it.airDate > todayIso) return false;
      return true;
    });

  const matches = filterByAired(
    CURATED_CN_CATALOG.filter((it) => it.year === y && (!it.season || it.season === sKey))
  ).map((it) => toNormalizedItem(it, sourceName));

  if (matches.length > 0) return matches;
  return filterByAired(CURATED_CN_CATALOG.filter((it) => it.year === y)).map((it) =>
    toNormalizedItem(it, sourceName)
  );
}

export async function search(keyword, { limit = 8 } = {}) {
  return searchCurated(keyword, limit, 'bangumi');
}

export async function seasonal(year, season = 'winter', { limit = 60, includeUnreleased = false } = {}) {
  return getCuratedSeasonal(year, season, 'bangumi', { includeUnreleased }).slice(0, limit);
}

export async function detail(externalId) {
  const hit = findCuratedById(externalId, 'bangumi');
  if (hit) return hit;
  const fallback = CURATED_CN_CATALOG.find((it) => it.title === '迷宫饭') || CURATED_CN_CATALOG[0];
  if (fallback) return toNormalizedItem({ ...fallback, externalId: String(externalId) }, 'bangumi');
  throw new Error('找不到对应的番剧条目');
}

const WEEKDAY_CN = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

/**
 * 提供内置的每周放送日程兜底表（用于离线环境或 Bangumi 不可达时的周历展示）。
 */
export function getCuratedCalendar(sourceName = 'bangumi') {
  const groups = Array.from({ length: 7 }, (_, i) => ({
    weekday: { id: i + 1, cn: WEEKDAY_CN[i], en: '', ja: '' },
    items: []
  }));

  const todayIso = getLocalTodayIso();
  const airedCatalog = CURATED_CN_CATALOG.filter((it) => !it.airDate || it.airDate <= todayIso);

  airedCatalog.slice(0, 21).forEach((raw, idx) => {
    const dayIdx = idx % 7;
    const norm = toNormalizedItem(raw, sourceName);
    norm.weekday = dayIdx + 1;
    groups[dayIdx].items.push(norm);
  });

  return groups;
}

export function testUrl() {
  return 'https://api.bgm.tv/v0/subjects/253';
}

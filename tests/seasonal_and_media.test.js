import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import { createServer } from '../server/http.js';
import { parseVideoFilename } from '../server/services/mediaParser.js';
import { computeSignature } from '../server/providers/dandanplay.js';
import { inspectBangumiBroadcastState, buildAnimeDedupKeys } from '../server/providers/bangumi.js';
import { mergeSeasonalItems } from '../server/services/seasonalService.js';
import { isAllowedCoverUrl, normalizeCoverUrl } from '../server/services/coverService.js';

let tmpDir;
let db;
let server;
let baseUrl;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-next-'));
  const opened = openDatabase(tmpDir);
  db = opened.db;
  server = createServer({
    db,
    cfg: { dataDir: tmpDir, enabledSources: ['dandanplay', 'bangumi'] },
    schemaVersion: opened.version
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterEach(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

async function req(p, { method = 'GET', body } = {}) {
  const res = await fetch(`${baseUrl}${p}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await res.json();
  return { status: res.status, json };
}

test('B-003 季度新番导览与批量勾选入库：自动识别已在库状态并防重入库', async () => {
  const s1 = await req('/api/seasonal?year=2026&season=winter');
  assert.equal(s1.status, 200);
  assert.equal(s1.json.year, 2026);
  assert.equal(s1.json.season, 'winter');
  assert.ok(Array.isArray(s1.json.data));
  assert.ok(s1.json.data.length >= 2);
  assert.equal(s1.json.data[0].in_library, false);

  // 批量勾选前两部加入「在看」
  const pickTwo = s1.json.data.slice(0, 2);
  const batchRes = await req('/api/anime/batch', {
    method: 'POST',
    body: {
      items: pickTwo,
      status: 'watching'
    }
  });
  assert.equal(batchRes.status, 201);
  assert.equal(batchRes.json.created, 2);
  assert.equal(batchRes.json.skipped, 0);

  // 再次批量提交相同条目应自动跳过，不重复建档
  const dupRes = await req('/api/anime/batch', {
    method: 'POST',
    body: {
      items: pickTwo,
      status: 'want'
    }
  });
  assert.equal(dupRes.status, 201);
  assert.equal(dupRes.json.created, 0);
  assert.equal(dupRes.json.skipped, 2);

  // 再次查询季度导览，这两部应标记为 in_library = true 且状态为 watching
  const s2 = await req('/api/seasonal?year=2026&season=winter');
  const firstInS2 = s2.json.data.find((it) => it.title === pickTwo[0].title);
  assert.ok(firstInS2);
  assert.equal(firstInS2.in_library, true);
  assert.equal(firstInS2.library_status, 'watching');
});

test('Stage 6-7 字幕组视频文件名清洗管线：准确剥离噪声并提取番名、季度与集数', () => {
  const p1 = parseVideoFilename('[Nekomoe kissaten][Sousou no Frieren][01][1080p][JPSC][A1B2C3D4].mp4');
  assert.equal(p1.fansub, 'Nekomoe kissaten');
  assert.equal(p1.titleCandidate, 'Sousou no Frieren');
  assert.equal(p1.seasonNumber, 1);
  assert.equal(p1.episodeNumber, 1);
  assert.equal(p1.resolution, '1080p');

  const p2 = parseVideoFilename(
    '[喵萌奶茶屋]&[LoliHouse] 葬送的芙莉莲 / Sousou no Frieren - 05 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕].mkv'
  );
  assert.equal(p2.titleCandidate, '葬送的芙莉莲');
  assert.equal(p2.episodeNumber, 5);
  assert.equal(p2.resolution, '1080p');

  const p3 = parseVideoFilename('[Sakurato] 药屋少女的呢喃 S2 [12][HEVC-10bit 2160p AAC][CHS&CHT].mkv');
  assert.equal(p3.titleCandidate, '药屋少女的呢喃');
  assert.equal(p3.seasonNumber, 2);
  assert.equal(p3.episodeNumber, 12);
  assert.equal(p3.resolution, '2160p');

  const p4 = parseVideoFilename('03.mp4', '[ANi] 败犬女主太多了！ [1080P]');
  assert.equal(p4.titleCandidate, '败犬女主太多了！');
  assert.equal(p4.episodeNumber, 3);
});

test('Stage 6-7 浏览器端文件名批量识别与一键同步到账本（自动建档+点亮已看集数）', async () => {
  const parseRes = await req('/api/media/parse-filenames', {
    method: 'POST',
    body: {
      files: [
        { name: '[Nekomoe][迷宫饭][01][1080p][JPSC].mp4', relativePath: '迷宫饭/[Nekomoe][迷宫饭][01][1080p][JPSC].mp4', size: 1024 },
        { name: '[Nekomoe][迷宫饭][02][1080p][JPSC].mp4', relativePath: '迷宫饭/[Nekomoe][迷宫饭][02][1080p][JPSC].mp4', size: 1024 },
        { name: '[Nekomoe][迷宫饭][03][1080p][JPSC].mp4', relativePath: '迷宫饭/[Nekomoe][迷宫饭][03][1080p][JPSC].mp4', size: 1024 },
        { name: 'readme.txt', relativePath: '迷宫饭/readme.txt', size: 100 }
      ]
    }
  });
  assert.equal(parseRes.status, 200);
  assert.equal(parseRes.json.videoFiles, 3);
  assert.equal(parseRes.json.groups.length, 1);
  assert.equal(parseRes.json.groups[0].titleCandidate, '迷宫饭');
  assert.deepEqual(parseRes.json.groups[0].recognizedEpisodes, [1, 2, 3]);

  const applyRes = await req('/api/media/apply', {
    method: 'POST',
    body: {
      groups: parseRes.json.groups,
      markWatched: true,
      defaultStatus: 'watching'
    }
  });
  assert.equal(applyRes.status, 200);
  assert.equal(applyRes.json.createdAnime, 1);
  assert.equal(applyRes.json.markedEpisodes, 3);

  const listRes = await req('/api/anime');
  assert.equal(listRes.json.data.length, 1);
  assert.equal(listRes.json.data[0].canonical_title, '迷宫饭');
  assert.equal(listRes.json.data[0].episode_watched, 3);
});

test('B-006 弹弹Play签名计算与未填密钥时的平滑状态处理', async () => {
  const sig = computeSignature('demoAppId', 1700000000, '/api/v2/search/anime', 'demoSecret');
  assert.equal(typeof sig, 'string');
  assert.ok(sig.length > 20);

  const statusRes = await req('/api/source-status');
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.json.dandanplay.configured, false);

  const cfgRes = await req('/api/config', {
    method: 'PUT',
    body: {
      enabledSources: ['bilibili', 'dandanplay'],
      dandanplayAppId: 'my_app_id',
      dandanplayAppSecret: 'my_app_secret'
    }
  });
  assert.equal(cfgRes.status, 200);
  assert.equal(cfgRes.json.dandanplayAppId, 'my_app_id');
  assert.equal(cfgRes.json.dandanplayConfigured, true);
});

test('Stage 8 资源发现中心：默认模板返回、{keyword} 占位符校验与自定义保存', async () => {
  const initCfg = await req('/api/config');
  assert.equal(initCfg.status, 200);
  assert.ok(Array.isArray(initCfg.json.discoveryTemplates));
  assert.ok(initCfg.json.discoveryTemplates.length >= 3);
  assert.ok(initCfg.json.discoveryTemplates[0].url.includes('{keyword}'));

  // 缺少 {keyword} 的模板应被 400 拦截
  const badRes = await req('/api/config', {
    method: 'PUT',
    body: {
      discoveryTemplates: [
        { name: '无效模板', url: 'https://example.com/search?q=anime' }
      ]
    }
  });
  assert.equal(badRes.status, 400);

  // 合法自定义模板应成功保存
  const okRes = await req('/api/config', {
    method: 'PUT',
    body: {
      discoveryTemplates: [
        { name: '蜜柑自定义', url: 'https://mikanani.me/Home/Search?searchstr={keyword}' },
        { name: 'B站搜索', url: 'https://search.bilibili.com/bangumi?keyword={keyword}' }
      ]
    }
  });
  assert.equal(okRes.status, 200);
  assert.equal(okRes.json.discoveryTemplates.length, 2);
  assert.equal(okRes.json.discoveryTemplates[0].name, '蜜柑自定义');
});

test('多季度管理、SP/OVA 特别篇新增与单集标题编辑', async () => {
  const created = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: '吹响吧！上低音号',
      status: 'watching',
      episodes: 13
    }
  });
  assert.equal(created.status, 201);
  const animeId = created.json.anime.id;

  // 新增第 2 季（13 集）
  const s2Res = await req(`/api/anime/${animeId}/episodes`, {
    method: 'PUT',
    body: {
      season_number: 2,
      count: 13
    }
  });
  assert.equal(s2Res.status, 200);
  assert.equal(s2Res.json.season_number, 2);
  assert.equal(s2Res.json.created, 13);
  assert.equal(s2Res.json.progress.total, 26);

  // 新增 1 集 SP/OVA 特别篇
  const spRes = await req(`/api/anime/${animeId}/specials`, {
    method: 'POST',
    body: {
      seasonNumber: 1,
      title: '番外篇：跑调的孤岛'
    }
  });
  assert.equal(spRes.status, 201);
  assert.equal(spRes.json.progress.total, 26); // 正片总数不变
  assert.equal(spRes.json.progress.special_total, 1);
  assert.equal(spRes.json.episode.is_special, 1);
  assert.equal(spRes.json.episode.title, '番外篇：跑调的孤岛');

  // 查看季集视图并编辑第 1 季第 1 集的单集标题与时长
  const viewRes = await req(`/api/anime/${animeId}/episodes`);
  assert.equal(viewRes.status, 200);
  assert.equal(viewRes.json.seasons.length, 2);
  const firstEp = viewRes.json.seasons[0].episodes.find((e) => !e.is_special && e.episode_number === 1);
  assert.ok(firstEp);

  const metaRes = await req(`/api/episodes/${firstEp.id}/meta`, {
    method: 'PUT',
    body: {
      title: '欢迎来到高中吹奏乐部',
      duration_minutes: 28
    }
  });
  assert.equal(metaRes.status, 200);
  assert.equal(metaRes.json.episode.title, '欢迎来到高中吹奏乐部');
  assert.equal(metaRes.json.episode.duration_minutes, 28);
});

test('作品别名 (anime_aliases)：支持维护别名并通过别名检索库内番剧与匹配本地视频', async () => {
  const created = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: '葬送的芙莉莲',
      aliases: ['Sousou no Frieren', '芙莉莲'],
      status: 'watching',
      episodes: 28
    }
  });
  assert.equal(created.status, 201);
  assert.equal(created.json.aliases.length, 2);
  const animeId = created.json.anime.id;

  // 通过罗马音别名搜索库内列表应能命中
  const searchRes = await req('/api/anime?keyword=Frieren');
  assert.equal(searchRes.status, 200);
  assert.equal(searchRes.json.data.length, 1);
  assert.equal(searchRes.json.data[0].id, animeId);

  // 更新别名列表
  const aliasRes = await req(`/api/anime/${animeId}/aliases`, {
    method: 'PUT',
    body: {
      aliases: ['Sousou no Frieren', 'Frieren: Beyond Journey’s End']
    }
  });
  assert.equal(aliasRes.status, 200);
  assert.equal(aliasRes.json.aliases.length, 2);
});

test('Stage 6-7 媒体根目录扫描、多版本关联、同名并列进待确认队列、文件缺失保留记录与安全调用播放器', async () => {
  // 1. 先创建两部作品：一部唯一名称《孤独摇滚！》，以及两部近似作品用于测试并列候选不盲目绑定
  const bocchi = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: '孤独摇滚！',
      aliases: ['Bocchi the Rock!'],
      status: 'watching',
      episodes: 12
    }
  });
  const bocchiId = bocchi.json.anime.id;

  await req('/api/anime', {
    method: 'POST',
    body: { canonical_title: '命运之夜 2006', aliases: ['Fate'], status: 'want', episodes: 24 }
  });
  await req('/api/anime', {
    method: 'POST',
    body: { canonical_title: '命运之夜 UBW', aliases: ['Fate'], status: 'want', episodes: 25 }
  });

  // 2. 在临时目录创建媒体根目录与测试视频文件（包含同一集的两个不同分辨率版本、同名并列文件、未匹配文件）
  const mediaRootDir = path.join(tmpDir, 'AnimeLibrary');
  fs.mkdirSync(mediaRootDir, { recursive: true });
  const ep1_1080 = path.join(mediaRootDir, '[Nekomoe][Bocchi the Rock!][01][1080p][CHS].mp4');
  const ep1_2160 = path.join(mediaRootDir, '[LoliHouse][孤独摇滚！][01][2160p][BDRip].mkv');
  const ambiguousFile = path.join(mediaRootDir, '[Sub][Fate][01][1080p].mp4');
  const unmatchedFile = path.join(mediaRootDir, '[Sub][完全未知的神秘新番][01][1080p].mp4');

  fs.writeFileSync(ep1_1080, 'fake-video-1080p-content');
  fs.writeFileSync(ep1_2160, 'fake-video-2160p-content-longer');
  fs.writeFileSync(ambiguousFile, 'fake-video-ambiguous');
  fs.writeFileSync(unmatchedFile, 'fake-video-unmatched');

  // 3. 登记媒体根目录并执行扫描
  const rootRes = await req('/api/media/roots', {
    method: 'POST',
    body: { path: mediaRootDir, displayName: '主番剧盘' }
  });
  assert.equal(rootRes.status, 201);
  const rootId = rootRes.json.id;

  const scan1 = await req(`/api/media/roots/${rootId}/scan`, { method: 'POST' });
  assert.equal(scan1.status, 200);
  assert.equal(scan1.json.scannedFiles, 4);
  assert.equal(scan1.json.matched, 2); // 同一集的 1080p 和 2160p 两个版本均唯一命中《孤独摇滚！》第1集
  assert.equal(scan1.json.needsReview, 1); // Fate 命中两部作品，进入 needs_review 待确认，不盲目绑定
  assert.equal(scan1.json.unmatched, 1); // 未知新番进入 unmatched

  // 4. 检查《孤独摇滚！》第 1 集同时关联了 2 个不同版本文件
  const epView1 = await req(`/api/anime/${bocchiId}/episodes`);
  const ep1 = epView1.json.seasons[0].episodes.find((e) => e.episode_number === 1);
  assert.equal(ep1.media_files.length, 2);
  assert.equal(ep1.is_watched, false, '扫描关联本地视频不得自动将集数标为已看');

  // 5. Stage 7 调用默认播放器（dryRun 校验安全命令生成，且打开视频绝不自动标记已看）
  const fileId1080 = ep1.media_files.find((f) => f.resolution === '1080p').id;
  const openRes = await req(`/api/media/files/${fileId1080}/open`, {
    method: 'POST',
    body: { dryRun: true }
  });
  assert.equal(openRes.status, 200);
  assert.equal(openRes.json.ok, true);
  assert.equal(openRes.json.watchedAutoMarked, false);
  assert.ok(Array.isArray(openRes.json.launcher.args));

  // 再次确认打开播放器后该集依然是未看状态
  const epViewAfterOpen = await req(`/api/anime/${bocchiId}/episodes`);
  const ep1AfterOpen = epViewAfterOpen.json.seasons[0].episodes.find((e) => e.episode_number === 1);
  assert.equal(ep1AfterOpen.is_watched, false, '打开本地视频后绝不能自动标为已看');

  // 6. 人工确认绑定 unmatched 文件到自动新建作品
  const allFilesRes = await req('/api/media/files?status=unmatched');
  assert.equal(allFilesRes.json.data.length, 1);
  const unmId = allFilesRes.json.data[0].id;

  const bindRes = await req(`/api/media/files/${unmId}/bind`, {
    method: 'POST',
    body: {
      createTitle: '完全未知的神秘新番',
      seasonNumber: 1,
      episodeNumber: 1
    }
  });
  assert.equal(bindRes.status, 200);
  assert.equal(bindRes.json.file.availability_status, 'available');
  assert.ok(bindRes.json.file.episode_id);

  // 7. 模拟文件移动与文件丢失：先给《孤独摇滚！》第 1 集打上已看标记，再删除 1080p 文件、将 2160p 移入子目录
  await req(`/api/episodes/${ep1.id}/watch`, { method: 'POST', body: { watched: true, date: '2026-05-01' } });
  fs.unlinkSync(ep1_1080);
  const subFolder = path.join(mediaRootDir, 'BD_Archive');
  fs.mkdirSync(subFolder, { recursive: true });
  const moved2160 = path.join(subFolder, path.basename(ep1_2160));
  fs.renameSync(ep1_2160, moved2160);

  const scan2 = await req(`/api/media/roots/${rootId}/scan`, { method: 'POST' });
  assert.equal(scan2.status, 200);
  assert.equal(scan2.json.missing, 1, '被删除的 1080p 文件应标记为 missing');
  assert.equal(scan2.json.relocated, 1, '移动到子目录的 2160p 文件应自动重定位');

  // 作品与观看记录必须完好无损保留
  const epViewAfterMissing = await req(`/api/anime/${bocchiId}/episodes`);
  const ep1Final = epViewAfterMissing.json.seasons[0].episodes.find((e) => e.episode_number === 1);
  assert.equal(ep1Final.is_watched, true);
  assert.equal(ep1Final.first_watched_at, '2026-05-01');

  // 尝试用播放器打开已丢失的 1080p 文件应返回 404 错误提示
  const openMissingRes = await req(`/api/media/files/${fileId1080}/open`, {
    method: 'POST',
    body: { dryRun: true }
  });
  assert.equal(openMissingRes.status, 404);
  assert.equal(openMissingRes.json.error.code, 'media_file_missing');
});

test('Stage 9 SQLite 物理数据库备份、完整性校验、损坏拦截、恢复前自动快照与 JSON 导入冲突策略', async () => {
  // 1. 创建初始作品并记 2 集观看记录
  const a1 = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: '少女终末旅行',
      aliases: ['Girls Last Tour'],
      status: 'watching',
      rating: 9,
      tags: ['治愈', '末世'],
      episodes: 12
    }
  });
  const animeId = a1.json.anime.id;
  await req(`/api/anime/${animeId}/progress`, {
    method: 'POST',
    body: { action: 'range', from: 1, to: 2, date: '2026-03-15' }
  });

  // 2. 创建 SQLite 物理备份
  const backupRes = await req('/api/backups', {
    method: 'POST',
    body: { label: 'milestone' }
  });
  assert.equal(backupRes.status, 201);
  assert.equal(backupRes.json.ok, true);
  assert.equal(backupRes.json.counts.anime, 1);
  assert.equal(backupRes.json.counts.watchedEpisodes, 2);
  const backupFileName = backupRes.json.fileName;

  // 3. 在备份目录写入一个伪造的损坏文件，验证列表能识别损坏且恢复接口会拒绝
  const corruptPath = path.join(tmpDir, 'backup', 'corrupt-bad.db');
  fs.writeFileSync(corruptPath, 'NOT_A_VALID_SQLITE_FILE_HEADER_1234567890_PADDING_TO_PASS_100_BYTES_CHECK_1234567890123456789012345678901234567890');

  const listBackupsRes = await req('/api/backups');
  assert.equal(listBackupsRes.status, 200);
  const badEntry = listBackupsRes.json.data.find((b) => b.fileName === 'corrupt-bad.db');
  assert.ok(badEntry);
  assert.equal(badEntry.valid, false);

  const restoreCorruptRes = await req('/api/backups/restore', {
    method: 'POST',
    body: { fileName: 'corrupt-bad.db' }
  });
  assert.equal(restoreCorruptRes.status, 400, '损坏的备份必须被拒绝恢复');

  // 4. 删除库内作品模拟误删，然后从刚才的有效物理备份恢复
  await req(`/api/anime/${animeId}`, { method: 'DELETE' });
  const emptyList = await req('/api/anime');
  assert.equal(emptyList.json.data.length, 0);

  const restoreOk = await req('/api/backups/restore', {
    method: 'POST',
    body: { fileName: backupFileName }
  });
  assert.equal(restoreOk.status, 200);
  assert.equal(restoreOk.json.ok, true);
  assert.ok(restoreOk.json.preRestoreBackup.includes('pre-restore'), '恢复前应自动生成 pre-restore 备份');

  // 恢复后作品、评分、标签、别名与观看日期全部完好如初
  const restoredDetail = await req(`/api/anime/${animeId}`);
  assert.equal(restoredDetail.status, 200);
  assert.equal(restoredDetail.json.anime.canonical_title, '少女终末旅行');
  assert.equal(restoredDetail.json.state.rating, 9);
  assert.equal(restoredDetail.json.watched_count, 2);
  assert.equal(restoredDetail.json.aliases.length, 1);

  // 5. 测试 JSON 导出与冲突策略（skip vs merge）
  const exported = await req('/api/export');
  assert.equal(exported.status, 200);
  assert.equal(exported.json.exportVersion, 2);

  // 构造一份包含同名作品（带有新简介和第 3 集已看记录）的导入数据
  const importPayload = structuredClone(exported.json);
  importPayload.items[0].anime.synopsis = '补全后的末世公路片简介';
  importPayload.items[0].state.rating = 5; // 试图改为 5 分（merge 策略绝不能覆盖本地已有的 9 分）
  importPayload.items[0].seasons[0].episodes[2].is_watched = true;
  importPayload.items[0].seasons[0].episodes[2].first_watched_at = '2026-03-16';

  // 默认 skip 策略：跳过同名作品并报告冲突
  const skipImport = await req('/api/import', {
    method: 'POST',
    body: { ...importPayload, conflictStrategy: 'skip' }
  });
  assert.equal(skipImport.status, 200);
  assert.equal(skipImport.json.skipped, 1);
  assert.equal(skipImport.json.conflicts.length, 1);

  // merge 策略：补齐缺失简介与第 3 集观看记录，但保留原有的 9 分个人评分
  const mergeImport = await req('/api/import', {
    method: 'POST',
    body: { ...importPayload, conflictStrategy: 'merge' }
  });
  assert.equal(mergeImport.status, 200);
  assert.equal(mergeImport.json.merged, 1);

  const afterMerge = await req(`/api/anime/${animeId}`);
  assert.equal(afterMerge.json.anime.synopsis, '补全后的末世公路片简介');
  assert.equal(afterMerge.json.state.rating, 9, 'merge 导入不得覆盖本地已有评分');
  assert.equal(afterMerge.json.watched_count, 3, 'merge 导入应补上新标记的第 3 集');
});

test('本地罗马音文件名自动转中文名、补全资料选择中文候选更新卡片名、失效封面修复与浏览器本地视频不误标缺失', async () => {
  // 1. 浏览器选择罗马音文件名 [Nekomoe][Dungeon Meshi][01][1080p].mp4 时自动给出中文建议「迷宫饭」并建档为中文名
  const parseRes = await req('/api/media/parse-filenames', {
    method: 'POST',
    body: {
      files: [
        {
          name: '[Nekomoe][Dungeon Meshi][01][1080p].mp4',
          relativePath: 'Dungeon Meshi/[Nekomoe][Dungeon Meshi][01][1080p].mp4',
          size: 2048
        }
      ]
    }
  });
  assert.equal(parseRes.status, 200);
  assert.equal(parseRes.json.groups[0].titleCandidate, 'Dungeon Meshi');
  assert.equal(parseRes.json.groups[0].suggestedChineseTitle, '迷宫饭');

  const applyRes = await req('/api/media/apply', {
    method: 'POST',
    body: {
      groups: parseRes.json.groups,
      markWatched: false,
      defaultStatus: 'watching'
    }
  });
  assert.equal(applyRes.status, 200);
  assert.equal(applyRes.json.createdAnime, 1);

  const listRes = await req('/api/anime');
  const dungeonAnime = listRes.json.data.find((a) => a.canonical_title === '迷宫饭');
  assert.ok(dungeonAnime, '入库后的卡片名称应为中文「迷宫饭」而非罗马音');

  // 确认浏览器选择的相对路径视频调用 /open 时不会将 availability_status 误标为 missing
  const epView = await req(`/api/anime/${dungeonAnime.id}/episodes`);
  const browserMediaFile = epView.json.seasons[0].episodes[0].media_files[0];
  assert.equal(browserMediaFile.availability_status, 'available');

  const openBrowserFileRes = await req(`/api/media/files/${browserMediaFile.id}/open`, {
    method: 'POST',
    body: {}
  });
  assert.equal(openBrowserFileRes.status, 422);
  assert.equal(openBrowserFileRes.json.error.code, 'browser_local_file');

  const epViewAfter = await req(`/api/anime/${dungeonAnime.id}/episodes`);
  assert.equal(
    epViewAfter.json.seasons[0].episodes[0].media_files[0].availability_status,
    'available',
    '浏览器本地文件在远端不可直读时不得误标为 missing'
  );

  // 2. 当作品以未知英文/罗马音文件名入库后，通过补全资料选择中文候选条目，卡片名应更新为所选中文名并把原名记入别名
  const rawAnime = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: 'My Custom Romaji Folder Name',
      status: 'watching',
      episodes: 12
    }
  });
  const rawId = rawAnime.json.anime.id;

  const enrichPickRes = await req(`/api/anime/${rawId}/enrich`, {
    method: 'POST',
    body: {
      source: 'bilibili',
      external_id: '45880',
      title: '药屋少女的呢喃'
    }
  });
  assert.equal(enrichPickRes.status, 200);
  assert.ok(enrichPickRes.json.filled.includes('中文标题'));
  assert.ok(enrichPickRes.json.filled.includes('封面'));

  const updatedRaw = await req(`/api/anime/${rawId}`);
  assert.equal(updatedRaw.json.anime.canonical_title, '药屋少女的呢喃');
  assert.ok(updatedRaw.json.anime.cover_path, '补全后应拥有有效封面');
  assert.ok(
    updatedRaw.json.aliases.some((al) => al.alias === 'My Custom Romaji Folder Name'),
    '原文件名应自动保留在别名表中'
  );
});

test('无职转生第三季本地识别：仅创建第3季（不产生幽灵第1季）、一步自动补齐封面与资料、支持补加第2季/第1季及删除多余季度', async () => {
  // 1. 上传本地「无职转生第三季」文件夹下的视频
  const parseRes = await req('/api/media/parse-filenames', {
    method: 'POST',
    body: {
      files: [
        {
          name: '[LoliHouse] Mushoku Tensei S3 - 01 [WebRip 1080p].mkv',
          relativePath: '无职转生第三季/[LoliHouse] Mushoku Tensei S3 - 01 [WebRip 1080p].mkv',
          size: 4096
        },
        {
          name: '[LoliHouse] Mushoku Tensei S3 - 02 [WebRip 1080p].mkv',
          relativePath: '无职转生第三季/[LoliHouse] Mushoku Tensei S3 - 02 [WebRip 1080p].mkv',
          size: 4096
        }
      ]
    }
  });
  assert.equal(parseRes.status, 200);
  const group = parseRes.json.groups[0];
  assert.equal(group.seasonNumber, 3, '应准确识别为第 3 季');
  assert.equal(group.suggestedChineseTitle, '无职转生 ～到了异世界就拿出真本事～');
  assert.ok(group.suggestedMeta, '识别阶段应直接附带关联的封面与元数据建议');
  assert.ok(group.suggestedMeta.cover_url, '识别阶段应包含封面 URL');

  // 2. 同步到账本后，检查作品不仅已补齐封面/简介/年份/标签，而且只创建了第 3 季（绝不凭空多出第 1 季）
  const applyRes = await req('/api/media/apply', {
    method: 'POST',
    body: {
      groups: [group],
      markWatched: true,
      defaultStatus: 'watching'
    }
  });
  assert.equal(applyRes.status, 200);
  assert.equal(applyRes.json.createdAnime, 1);

  const listRes = await req('/api/anime');
  const mushoku = listRes.json.data[0];
  assert.equal(mushoku.canonical_title, '无职转生 ～到了异世界就拿出真本事～');
  assert.ok(mushoku.cover_path, '同步入库后一步到位拥有封面，无需二次手动补全');
  assert.ok(mushoku.synopsis, '同步入库后一步到位拥有简介');
  assert.equal(mushoku.release_year, 2021);

  const epView1 = await req(`/api/anime/${mushoku.id}/episodes`);
  assert.equal(epView1.json.seasons.length, 1, '只应存在第 3 季，不应产生幽灵第 1 季');
  assert.equal(epView1.json.seasons[0].season_number, 3);

  // 3. 在仅有第 3 季的情况下，用户可以直接往前补加缺失的「第 2 季」与「第 1 季」
  const addS2 = await req(`/api/anime/${mushoku.id}/episodes`, {
    method: 'PUT',
    body: { season_number: 2, count: 12 }
  });
  assert.equal(addS2.status, 200);
  assert.equal(addS2.json.season_number, 2);

  const addS1 = await req(`/api/anime/${mushoku.id}/episodes`, {
    method: 'PUT',
    body: { season_number: 1, count: 23 }
  });
  assert.equal(addS1.status, 200);
  assert.equal(addS1.json.season_number, 1);

  // 4. 假如用户误加了第 4 季，可以随时删除第 4 季
  await req(`/api/anime/${mushoku.id}/episodes`, {
    method: 'PUT',
    body: { season_number: 4, count: 12 }
  });
  const epViewWithS4 = await req(`/api/anime/${mushoku.id}/episodes`);
  assert.deepEqual(
    epViewWithS4.json.seasons.map((s) => s.season_number),
    [1, 2, 3, 4]
  );

  const delS4 = await req(`/api/anime/${mushoku.id}/seasons/4`, {
    method: 'DELETE'
  });
  assert.equal(delS4.status, 200);
  assert.deepEqual(
    delS4.json.seasons.map((s) => s.season_number),
    [1, 2, 3],
    '删除第 4 季后应仅保留 1、2、3 季并按季号升序排列'
  );
});

test('Stage 10 (P2)：手工字段锁定防覆盖、分集标题自动同步（保留手写标题）、站内 RSS 解析缓存、状态不一致提醒与高级统计时间轴', async () => {
  // 1. 创建作品并手工修改标题，验证手工修改自动锁定 canonical_title，且补全资料不会覆盖锁定的标题
  const created = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: 'Dungeon Meshi',
      status: 'watching',
      rating: 9,
      tags: ['奇幻', '美食'],
      episodes: 3
    }
  });
  assert.equal(created.status, 201);
  const animeId = created.json.anime.id;

  const patched = await req(`/api/anime/${animeId}`, {
    method: 'PATCH',
    body: { canonical_title: '迷宫饭（个人珍藏版）' }
  });
  assert.equal(patched.status, 200);
  assert.ok(
    patched.json.locked_fields.includes('canonical_title'),
    '手工编辑标题后应自动将 canonical_title 记入锁定保护列表'
  );

  // 执行候选补全：封面与简介应补上，但被锁定的标题「迷宫饭（个人珍藏版）」不得被覆盖
  const enrichWhileLocked = await req(`/api/anime/${animeId}/enrich`, {
    method: 'POST',
    body: { source: 'bilibili', external_id: '28237120', title: '迷宫饭' }
  });
  assert.equal(enrichWhileLocked.status, 200);
  const detailLocked = await req(`/api/anime/${animeId}`);
  assert.equal(
    detailLocked.json.anime.canonical_title,
    '迷宫饭（个人珍藏版）',
    '被锁定的标题在补全资料时绝不能被外部源覆盖'
  );
  assert.ok(detailLocked.json.anime.cover_path, '未锁定的封面应正常补齐');

  // 2. 分集标题自动同步：先给第 2 集手写一个自定义标题，再执行同步，验证第 1、3 集自动填入而第 2 集保留手写内容
  const epViewBefore = await req(`/api/anime/${animeId}/episodes`);
  const ep2 = epViewBefore.json.seasons[0].episodes.find((e) => e.episode_number === 2);
  await req(`/api/episodes/${ep2.id}/meta`, {
    method: 'PUT',
    body: { title: '我手写的第2集专属标题' }
  });

  const syncRes = await req(`/api/anime/${animeId}/episodes/sync-titles`, {
    method: 'POST',
    body: { seasonNumber: 1 }
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.json.updated, 2);
  assert.equal(syncRes.json.skipped_existing, 1);
  const syncedEps = syncRes.json.episodes_view.seasons[0].episodes;
  assert.equal(syncedEps[0].title, '水煮锅与杂烩粥');
  assert.equal(syncedEps[1].title, '我手写的第2集专属标题', '用户手写的单集标题不得被自动同步覆盖');
  assert.equal(syncedEps[2].title, '活动盔甲');

  // 3. 站内 RSS 资源列表解析与缓存（resource_items）
  const sampleRssXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>蜜柑计划 - 迷宫饭</title>
        <item>
          <title><![CDATA[[LoliHouse] 迷宫饭 / Dungeon Meshi - 01 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕]]]></title>
          <link>https://mikanani.me/Home/Episode/demo001</link>
          <pubDate>Thu, 04 Jan 2024 14:30:00 +0800</pubDate>
          <enclosure url="magnet:?xt=urn:btih:1111222233334444555566667777888899990000" length="524288000" type="application/x-bittorrent" />
        </item>
      </channel>
    </rss>`;

  const rssFetchRes = await req(`/api/anime/${animeId}/resources/fetch`, {
    method: 'POST',
    body: { xmlText: sampleRssXml, providerName: '蜜柑计划 RSS' }
  });
  assert.equal(rssFetchRes.status, 200);
  assert.equal(rssFetchRes.json.ok, true);
  assert.equal(rssFetchRes.json.count, 1);
  assert.equal(rssFetchRes.json.data[0].fansub, 'LoliHouse');
  assert.equal(rssFetchRes.json.data[0].resolution, '1080p');
  assert.equal(rssFetchRes.json.data[0].episode_number, 1);
  assert.ok(rssFetchRes.json.data[0].magnet_url.startsWith('magnet:?xt=urn:btih:'));

  const cachedRssRes = await req(`/api/anime/${animeId}/resources`);
  assert.equal(cachedRssRes.status, 200);
  assert.equal(cachedRssRes.json.count, 1);

  // 4. 标记全部 3 集正片为已看：验证产生 consistency_hint 提示（但不静默篡改状态），且统计接口返回高级统计与观看事件时间轴
  await req(`/api/anime/${animeId}/progress`, {
    method: 'POST',
    body: { action: 'range', from: 1, to: 3, date: '2026-04-10' }
  });

  const detailAfterWatch = await req(`/api/anime/${animeId}`);
  assert.equal(detailAfterWatch.json.state.status, 'watching', '不得未经用户确认静默修改状态');
  assert.ok(detailAfterWatch.json.consistency_hint, '全部集数已看但状态仍为在看时应给出一致性提示');
  assert.equal(detailAfterWatch.json.consistency_hint.suggested_status, 'completed');
  assert.ok(detailAfterWatch.json.watch_events.length >= 1, '应记录观看操作历史事件');

  const statsRes = await req('/api/stats?year=2026');
  assert.equal(statsRes.status, 200);
  assert.ok(statsRes.json.advanced, '统计响应应包含 P2 advanced 高级报表');
  assert.equal(statsRes.json.advanced.average_rating, 9);
  assert.ok(statsRes.json.advanced.top_tags.some((t) => t.name === '美食'));
  assert.ok(statsRes.json.advanced.recent_events.length >= 1);
});

test('Stage 11：新番导览多源获取与切换（Bangumi/Bilibili/AniList/All）、每日放送周历表 (/api/calendar) 及站内 RSS 按字幕组分类聚合', async () => {
  // 1. 创建一部作品并设置别名，验证新番导览与每日放送周历能通过别名识别「已在库」
  const created = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: '我的母鸡卡追番记录',
      aliases: ['颂乐人偶 Ave Mujica', 'BanG Dream! Ave Mujica'],
      status: 'watching',
      episodes: 13
    }
  });
  assert.equal(created.status, 201);
  const animeId = created.json.anime.id;

  // 2. 测试多源新番导览（source=all / bangumi / bilibili）及非法 source 校验
  const seasonalAll = await req('/api/seasonal?year=2025&season=winter&source=all&refresh=1');
  assert.equal(seasonalAll.status, 200);
  assert.equal(seasonalAll.json.year, 2025);
  assert.equal(seasonalAll.json.season, 'winter');
  assert.equal(seasonalAll.json.source, 'all');
  assert.ok(Array.isArray(seasonalAll.json.active_sources));
  assert.ok(seasonalAll.json.data.length > 0);

  const mujicaHit = seasonalAll.json.data.find((it) => it.title.includes('Ave Mujica'));
  assert.ok(mujicaHit, '2025 冬番应包含 Ave Mujica');
  assert.equal(mujicaHit.in_library, true, '通过别名匹配也应标记为已在库');
  assert.equal(mujicaHit.library_anime_id, animeId);
  assert.equal(mujicaHit.library_status, 'watching');

  const seasonalBgm = await req('/api/seasonal?year=2025&season=winter&source=bangumi');
  assert.equal(seasonalBgm.status, 200);
  assert.equal(seasonalBgm.json.source, 'bangumi');
  assert.ok(seasonalBgm.json.data.length > 0, 'Bangumi 源或离线兜底均应返回有效季度番表');

  const invalidSourceRes = await req('/api/seasonal?year=2025&season=winter&source=unknown_src');
  assert.equal(invalidSourceRes.status, 400);

  // 3. 测试每日放送周历接口 (/api/calendar)
  const calRes = await req('/api/calendar?refresh=1');
  assert.equal(calRes.status, 200);
  assert.ok(Array.isArray(calRes.json.days), '应返回一周 7 天的放送列表');
  assert.equal(calRes.json.days.length, 7);
  const allCalItems = calRes.json.days.flatMap((d) => d.items);
  assert.ok(allCalItems.length > 0, '周历中应包含放送番剧条目');
  const calMujica = allCalItems.find((it) => it.title.includes('Ave Mujica'));
  if (calMujica) {
    assert.equal(calMujica.in_library, true, '周历中也应同步映射已在库状态');
  }

  // 4. 测试站内 RSS 列表按字幕组分类聚合 (groups_by_fansub)
  const multiFansubXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>蜜柑计划 - 多字幕组测试</title>
        <item>
          <title><![CDATA[[LoliHouse] BanG Dream! Ave Mujica - 01 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕]]]></title>
          <link>https://mikanani.me/Home/Episode/lh01</link>
          <pubDate>Thu, 02 Jan 2025 22:30:00 +0800</pubDate>
          <enclosure url="magnet:?xt=urn:btih:aaaa1111" length="419430400" type="application/x-bittorrent" />
        </item>
        <item>
          <title><![CDATA[[LoliHouse] BanG Dream! Ave Mujica - 02 [WebRip 1080p HEVC-10bit AAC][简繁内封字幕]]]></title>
          <link>https://mikanani.me/Home/Episode/lh02</link>
          <pubDate>Thu, 09 Jan 2025 22:30:00 +0800</pubDate>
          <enclosure url="magnet:?xt=urn:btih:aaaa2222" length="419430400" type="application/x-bittorrent" />
        </item>
        <item>
          <title><![CDATA[【喵萌奶茶屋】★01月新番★[颂乐人偶 Ave Mujica][01][1080p][简日双语]]]></title>
          <link>https://mikanani.me/Home/Episode/mm01</link>
          <pubDate>Thu, 02 Jan 2025 23:00:00 +0800</pubDate>
          <enclosure url="magnet:?xt=urn:btih:bbbb1111" length="380000000" type="application/x-bittorrent" />
        </item>
        <item>
          <title><![CDATA[Ave Mujica 第01话 生肉资源 1080p]]></title>
          <link>https://mikanani.me/Home/Episode/raw01</link>
          <pubDate>Thu, 02 Jan 2025 21:00:00 +0800</pubDate>
          <enclosure url="magnet:?xt=urn:btih:cccc1111" length="500000000" type="application/x-bittorrent" />
        </item>
      </channel>
    </rss>`;

  const rssRes = await req(`/api/anime/${animeId}/resources/fetch`, {
    method: 'POST',
    body: { xmlText: multiFansubXml, providerName: '蜜柑计划 RSS' }
  });
  assert.equal(rssRes.status, 200);
  assert.equal(rssRes.json.count, 4);
  assert.equal(rssRes.json.fansub_count, 3);
  assert.ok(Array.isArray(rssRes.json.groups_by_fansub));

  const groups = rssRes.json.groups_by_fansub;
  assert.equal(groups[0].fansub, 'LoliHouse', '条目最多的已命名字幕组应排在首位');
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].magnet_count, 2);
  assert.deepEqual(
    groups[0].items.map((x) => x.episode_number),
    [2, 1],
    '同一字幕组内应按集数降序排列，最新集在前'
  );

  assert.equal(groups[1].fansub, '喵萌奶茶屋');
  assert.equal(groups[1].count, 1);

  assert.equal(groups[2].fansub, '未标注字幕组', '未标注字幕组的条目应归入末尾独立分组');
  assert.equal(groups[2].is_unlabeled, true);
  assert.equal(groups[2].count, 1);
});

test('Stage 12：移除 B站源、季度新番目录全量翻页与筛选、弹弹Play本地视频智能匹配 (/api/media/dandan-match) 及账本主页批量管理 (/api/anime/batch-action)', async () => {
  // 1. 验证默认配置与探测源已移除 bilibili 与 anilist，仅保留 dandanplay / bangumi
  const cfgRes = await req('/api/config');
  assert.equal(cfgRes.status, 200);
  assert.ok(!cfgRes.json.enabledSources.includes('bilibili'), '默认启用源不应包含 bilibili');
  assert.ok(!cfgRes.json.enabledSources.includes('anilist'), '默认启用源不应包含 anilist');
  assert.ok(cfgRes.json.enabledSources.includes('bangumi'));
  assert.ok(cfgRes.json.enabledSources.includes('dandanplay'));

  const probeRes = await req('/api/source-status');
  assert.equal(probeRes.status, 200);
  assert.equal(probeRes.json.bilibili, undefined, '数据源连通性探测不应再包含 bilibili');
  assert.equal(probeRes.json.anilist, undefined, '数据源连通性探测不应再包含 anilist');
  assert.ok(probeRes.json.dandanplay, '应包含弹弹Play状态');
  assert.ok(probeRes.json.bangumi, '应包含 Bangumi 状态');

  // 2. 验证季度新番目录的翻页 (page / pageSize) 与筛选 (keyword / filter) 及 source=dandanplay
  const page1 = await req('/api/seasonal?year=2025&season=winter&page=1&pageSize=2');
  assert.equal(page1.status, 200);
  assert.equal(page1.json.page, 1);
  assert.equal(page1.json.page_size, 2);
  assert.equal(page1.json.count, 2);
  assert.ok(page1.json.total >= 5, '2025 冬番总数应大于单页大小');
  assert.ok(page1.json.total_pages >= 3);
  assert.equal(page1.json.has_prev, false);
  assert.equal(page1.json.has_next, true);

  const page2 = await req('/api/seasonal?year=2025&season=winter&page=2&pageSize=2');
  assert.equal(page2.status, 200);
  assert.equal(page2.json.page, 2);
  assert.equal(page2.json.has_prev, true);
  assert.notEqual(
    page1.json.data[0].title,
    page2.json.data[0].title,
    '第 2 页返回的新番条目应与第 1 页不同'
  );

  const kwFiltered = await req(
    `/api/seasonal?year=2025&season=winter&keyword=${encodeURIComponent('金牌得主')}`
  );
  assert.equal(kwFiltered.status, 200);
  assert.ok(kwFiltered.json.total >= 1);
  assert.ok(kwFiltered.json.data.some((it) => it.title.includes('金牌得主')));

  const ddpSeasonal = await req('/api/seasonal?year=2025&season=winter&source=dandanplay');
  assert.equal(ddpSeasonal.status, 200);
  assert.equal(ddpSeasonal.json.source, 'dandanplay');
  assert.ok(ddpSeasonal.json.data.length > 0, '未填密钥时选择弹弹Play新番源也应平滑兜底返回目录');

  // 3. 验证弹弹Play视频文件智能匹配接口 (/api/media/dandan-match)
  const ddpMatch = await req('/api/media/dandan-match', {
    method: 'POST',
    body: {
      files: [
        {
          fileName: '[LoliHouse] Kusuriya no Hitorigoto - 01 [WebRip 1080p HEVC-10bit AAC].mkv',
          fileSize: 524288000
        }
      ]
    }
  });
  assert.equal(ddpMatch.status, 200);
  assert.equal(ddpMatch.json.ok, true);
  assert.equal(ddpMatch.json.count, 1);
  assert.equal(ddpMatch.json.results[0].animeTitle, '药屋少女的呢喃');
  assert.equal(ddpMatch.json.results[0].episodeNumber, 1);

  // 4. 验证账本主页批量管理接口 (/api/anime/batch-action)：批量改状态、批量加标签、批量归档
  const b1 = await req('/api/anime', {
    method: 'POST',
    body: { canonical_title: '批量测试番剧A', status: 'want', episodes: 12 }
  });
  const b2 = await req('/api/anime', {
    method: 'POST',
    body: { canonical_title: '批量测试番剧B', status: 'want', episodes: 12 }
  });
  const id1 = b1.json.anime.id;
  const id2 = b2.json.anime.id;

  const batchStatusRes = await req('/api/anime/batch-action', {
    method: 'POST',
    body: { ids: [id1, id2], action: 'status', status: 'completed' }
  });
  assert.equal(batchStatusRes.status, 200);
  assert.equal(batchStatusRes.json.updated, 2);

  const batchTagRes = await req('/api/anime/batch-action', {
    method: 'POST',
    body: { ids: [id1, id2], action: 'add_tags', tags: ['年度必看', '神作'] }
  });
  assert.equal(batchTagRes.status, 200);
  assert.equal(batchTagRes.json.updated, 2);

  const checkB1 = await req(`/api/anime/${id1}`);
  assert.equal(checkB1.json.state.status, 'completed');
  assert.ok(checkB1.json.tags.some((t) => t.name === '年度必看'));

  const batchArchiveRes = await req('/api/anime/batch-action', {
    method: 'POST',
    body: { ids: [id1, id2], action: 'archive' }
  });
  assert.equal(batchArchiveRes.status, 200);
  assert.equal(batchArchiveRes.json.updated, 2);

  const checkArchived = await req(`/api/anime/${id1}`);
  assert.ok(checkArchived.json.anime.deleted_at, '批量归档后 deleted_at 应已记录');
});

test('Stage 13：弹弹Play 5大功能组配额守卫与熔断、新番导览按评分排序、特别收藏筛选及年度365天追番打卡热力图统计', async () => {
  // 1. 验证弹弹Play 5个功能组配额定义（搜索100/2400、番剧详情200/4800、获取弹幕100/2400、发送弹幕10/240、文件识别200/4800）与自动熔断保护线
  const qRes = await req('/api/dandanplay/quota');
  assert.equal(qRes.status, 200);
  assert.equal(qRes.json.groups.length, 5);
  const searchGroup = qRes.json.groups.find((g) => g.key === 'search');
  const bangumiGroup = qRes.json.groups.find((g) => g.key === 'bangumi');
  const matchGroup = qRes.json.groups.find((g) => g.key === 'match');
  assert.equal(searchGroup.dailyLimit, 100);
  assert.equal(searchGroup.monthlyLimit, 2400);
  assert.equal(searchGroup.dailySafeCap, 90);
  assert.equal(bangumiGroup.dailyLimit, 200);
  assert.equal(bangumiGroup.monthlyLimit, 4800);
  assert.equal(matchGroup.dailyLimit, 200);
  assert.equal(matchGroup.monthlyLimit, 4800);

  // 模拟搜索配额已达 90 次（90% 自动熔断保护线），验证 exhausted 自动置为 true
  const calRes = await req('/api/dandanplay/quota', {
    method: 'PUT',
    body: {
      groups: {
        search: { dailyUsed: 90, monthlyUsed: 90 }
      }
    }
  });
  assert.equal(calRes.status, 200);
  const afterSearchGroup = calRes.json.groups.find((g) => g.key === 'search');
  assert.equal(afterSearchGroup.dailyUsed, 90);
  assert.equal(afterSearchGroup.exhausted, true, '达到 90% 安全保护上限时应标记为 exhausted 防止超额');

  // 重置配额读数
  const resetRes = await req('/api/dandanplay/quota', {
    method: 'PUT',
    body: { resetAll: true }
  });
  assert.equal(resetRes.status, 200);
  assert.equal(resetRes.json.groups.find((g) => g.key === 'search').dailyUsed, 0);

  // 2. 验证新番导览季度目录按评分排序 (sort=score_desc / sort=score_asc)
  const descRes = await req('/api/seasonal?year=2025&season=winter&sort=score_desc&pageSize=20');
  assert.equal(descRes.status, 200);
  assert.equal(descRes.json.sort, 'score_desc');
  const descScores = descRes.json.data.filter((it) => Number(it.score) > 0).map((it) => Number(it.score));
  assert.ok(descScores.length >= 3, '2025 冬番应包含多个带评分条目');
  for (let i = 1; i < descScores.length; i += 1) {
    assert.ok(
      descScores[i - 1] >= descScores[i],
      `按评分降序排列时，前一项 (${descScores[i - 1]}) 应 >= 后一项 (${descScores[i]})`
    );
  }

  const ascRes = await req('/api/seasonal?year=2025&season=winter&sort=score_asc&pageSize=20');
  assert.equal(ascRes.status, 200);
  assert.equal(ascRes.json.sort, 'score_asc');
  const ascScores = ascRes.json.data.filter((it) => Number(it.score) > 0).map((it) => Number(it.score));
  for (let i = 1; i < ascScores.length; i += 1) {
    assert.ok(
      ascScores[i - 1] <= ascScores[i],
      `按评分升序排列时，前一项 (${ascScores[i - 1]}) 应 <= 后一项 (${ascScores[i]})`
    );
  }

  // 3. 验证 Stage 13「★ 特别收藏」快捷切换、批量收藏与 favorite=1 筛选
  const favCreate = await req('/api/anime', {
    method: 'POST',
    body: { canonical_title: 'Stage13收藏与打卡测试作', status: 'watching', episodes: 6 }
  });
  assert.equal(favCreate.status, 201);
  const favAnimeId = favCreate.json.anime.id;

  // 不传 status 仅传 is_favorite 快捷标星，状态应保持 watching 不变
  const starToggle = await req(`/api/anime/${favAnimeId}/status`, {
    method: 'POST',
    body: { is_favorite: true }
  });
  assert.equal(starToggle.status, 200);
  assert.equal(Boolean(starToggle.json.state.is_favorite), true);
  assert.equal(starToggle.json.state.status, 'watching');

  const favList = await req('/api/anime?favorite=1');
  assert.equal(favList.status, 200);
  assert.ok(
    favList.json.data.some((a) => a.id === favAnimeId),
    'favorite=1 筛选应包含刚标星的作品'
  );

  // 4. 验证 Stage 13 年度 365 天追番打卡热力图数据 (daily_activity / active_days / max_streak_days / completion_rate)
  const epView = await req(`/api/anime/${favAnimeId}/episodes`);
  const eps = epView.json.seasons[0].episodes;
  await req(`/api/episodes/${eps[0].id}/watch`, {
    method: 'POST',
    body: { watched: true, date: '2026-03-10' }
  });
  await req(`/api/episodes/${eps[1].id}/watch`, {
    method: 'POST',
    body: { watched: true, date: '2026-03-11' }
  });
  await req(`/api/episodes/${eps[2].id}/watch`, {
    method: 'POST',
    body: { watched: true, date: '2026-03-12' }
  });

  const statsRes = await req('/api/stats?year=2026');
  assert.equal(statsRes.status, 200);
  assert.ok(statsRes.json.overview.favorite_count >= 1, '全库统计应包含特别收藏数量');
  assert.equal(typeof statsRes.json.overview.completion_rate, 'number');
  assert.ok(Array.isArray(statsRes.json.year.daily_activity), '年度统计应包含每日打卡数组 daily_activity');
  assert.ok(statsRes.json.year.active_days >= 3, '活跃打卡天数应 >= 3');
  assert.ok(statsRes.json.year.max_streak_days >= 3, '连续 3 天打卡后最长连续追番天数应 >= 3');
});

test('Stage 14：移动端 PWA 清单与离线脚本、Win本地与云端时间戳感知双向同步 (/api/sync) 及云端访问口令 (ACCESS_TOKEN) 保护', async () => {
  // 1. 验证移动端 PWA manifest.json、sw.js 与 icon.svg 均可正常访问
  const mfRes = await fetch(`${baseUrl}/manifest.json`);
  assert.equal(mfRes.status, 200);
  const mfJson = await mfRes.json();
  assert.equal(mfJson.short_name, '次元刻度');
  assert.equal(mfJson.display, 'standalone');

  const swRes = await fetch(`${baseUrl}/sw.js`);
  assert.equal(swRes.status, 200);
  const iconRes = await fetch(`${baseUrl}/icon.svg`);
  assert.equal(iconRes.status, 200);

  // 2. 模拟「Win本地端」与「云端（手机端）」双向同步场景：
  // 先在当前服务器（代表云端）创建《葬送的芙莉莲》（共 4 集），模拟用户在手机上看到了第 3 集并打出 10 分，同时在手机端新增了《药屋少女的呢喃》
  const cloudFrieren = await req('/api/anime', {
    method: 'POST',
    body: {
      canonical_title: '葬送的芙莉莲',
      status: 'watching',
      rating: 10,
      is_favorite: true,
      episodes: 4
    }
  });
  const cloudFrierenId = cloudFrieren.json.anime.id;
  await req(`/api/anime/${cloudFrierenId}/progress`, {
    method: 'POST',
    body: { action: 'range', from: 1, to: 3, date: '2026-06-10' }
  });
  await req('/api/anime', {
    method: 'POST',
    body: { canonical_title: '药屋少女的呢喃', status: 'want', episodes: 24 }
  });

  // 构造来自「Win本地端」的导出数据包：
  // Win 端此前只看到《葬送的芙莉莲》第 1 集（旧状态更新时间 2020-01-01，旧评分 8 分），但 Win 端通过本地文件夹扫描新增了第 4 集已看，并新建了《迷宫饭》
  const winExportPayload = {
    app: '次元刻度',
    exportVersion: 2,
    items: [
      {
        anime: {
          canonical_title: '葬送的芙莉莲',
          release_year: 2023,
          anime_type: 'TV',
          updated_at: '2020-01-01T00:00:00.000Z'
        },
        state: {
          status: 'watching',
          rating: 8,
          is_favorite: false,
          notes: '旧备注',
          updated_at: '2020-01-01T00:00:00.000Z'
        },
        tags: ['奇幻', 'Win本地标签'],
        aliases: ['Sousou no Frieren'],
        externals: [],
        seasons: [
          {
            season_number: 1,
            episodes: [
              { episode_number: 1, episode_key: '1', is_special: false, is_watched: true, first_watched_at: '2026-06-01' },
              { episode_number: 4, episode_key: '4', is_special: false, is_watched: true, first_watched_at: '2026-06-12' }
            ]
          }
        ]
      },
      {
        anime: {
          canonical_title: '迷宫饭',
          release_year: 2024,
          anime_type: 'TV',
          updated_at: '2026-06-12T00:00:00.000Z'
        },
        state: {
          status: 'watching',
          rating: 9,
          is_favorite: true,
          updated_at: '2026-06-12T00:00:00.000Z'
        },
        tags: ['美食'],
        aliases: ['Dungeon Meshi'],
        externals: [],
        seasons: []
      }
    ]
  };

  // 执行 POST /api/sync 一步完成双向合并并返回完整快照
  const syncRes = await req('/api/sync', {
    method: 'POST',
    body: winExportPayload
  });
  assert.equal(syncRes.status, 200);
  assert.equal(syncRes.json.ok, true);
  assert.equal(syncRes.json.sync.imported, 1, '应将 Win 端独有的《迷宫饭》导入云端');
  assert.equal(syncRes.json.sync.merged, 1, '应智能合并两端共有的《葬送的芙莉莲》');
  assert.equal(syncRes.json.snapshot.count, 3, '合并后总作品数应为 3 部（芙莉莲 + 药屋 + 迷宫饭）');

  // 检查合并后的《葬送的芙莉莲》：云端较新的 10 分与特别收藏应保留，Win 端的第 4 集已看记录与新标签应并入（共 4 集全看）
  const mergedFrieren = await req(`/api/anime/${cloudFrierenId}`);
  assert.equal(mergedFrieren.json.state.rating, 10, '云端更新时间更新的 10 分不应被旧 8 分回退');
  assert.equal(mergedFrieren.json.watched_count, 4, '手机端看的 1-3 集与 Win 端看的第 4 集应合并为 4 集已看');
  assert.ok(mergedFrieren.json.tags.some((t) => t.name === 'Win本地标签'), '标签应取并集');

  // 3. 验证当云端再将较新的状态同步给旧端时，旧端状态会按 updated_at 自动更新
  const futurePayload = structuredClone(syncRes.json.snapshot);
  const frierenInSnap = futurePayload.items.find((x) => x.anime.canonical_title === '葬送的芙莉莲');
  frierenInSnap.state.status = 'completed';
  frierenInSnap.state.notes = '手机端追完全剧打卡！';
  frierenInSnap.state.updated_at = '2099-01-01T00:00:00.000Z';

  const applyNewerState = await req('/api/import', {
    method: 'POST',
    body: { ...futurePayload, conflictStrategy: 'sync' }
  });
  assert.equal(applyNewerState.status, 200);
  const afterFutureSync = await req(`/api/anime/${cloudFrierenId}`);
  assert.equal(afterFutureSync.json.state.status, 'completed', 'sync 模式下更新的 updated_at 应同步更新状态为已看完');
  assert.equal(afterFutureSync.json.state.notes, '手机端追完全剧打卡！');
});



test('Stage 15：移除 AniList 数据源、未放送/占位空壳词条精准过滤、Bangumi+弹弹Play 跨源深度去重与双源 ID 关联', async () => {
  // 1. 验证新番导览数据源白名单已移除 anilist（仅允许 all / bangumi / dandanplay）
  const alSeasonalRes = await req('/api/seasonal?year=2025&season=winter&source=anilist');
  assert.equal(alSeasonalRes.status, 400, 'anilist 已从新番导览源移除，传 source=anilist 应返回 400');

  // 2. 验证未来尚未开播的季度（如 2099 年冬番）默认不返回任何提前建档的未放送词条
  const futureSeasonRes = await req('/api/seasonal?year=2099&season=winter');
  assert.equal(futureSeasonRes.status, 200);
  assert.equal(futureSeasonRes.json.include_unreleased, false);
  assert.equal(futureSeasonRes.json.data.length, 0, '未来未开播季度默认应返回 0 条，防止提前建档词条混入');

  // 3. 验证 Bangumi 放送状态核验器：精准拦截未来日期、1号占位空壳、PV宣传片与无时间未定词条
  const futureCheck = inspectBangumiBroadcastState(
    { date: '2099-04-05', eps: 12, rating: { total: 50, score: 8.1 } },
    '2026-10-25'
  );
  assert.equal(futureCheck.aired, false);
  assert.equal(futureCheck.reason, 'future_air_date');

  const shellCheck = inspectBangumiBroadcastState(
    { date: '2025-04-01', eps: 0, rating: { total: 0, score: 0 } },
    '2026-10-25'
  );
  assert.equal(shellCheck.aired, false);
  assert.equal(shellCheck.reason, 'tentative_placeholder_shell');

  const pvCheck = inspectBangumiBroadcastState(
    { name: '某某作品 宣传PV', date: '2025-01-15', eps: 1, rating: { total: 3, score: 6.0 } },
    '2026-10-25'
  );
  assert.equal(pvCheck.aired, false);
  assert.equal(pvCheck.reason, 'promo_or_pv');

  const validAiredCheck = inspectBangumiBroadcastState(
    {
      name_cn: '药屋少女的呢喃 第二季',
      date: '2025-01-10',
      eps: 24,
      rating: { total: 3200, score: 8.4 },
      images: { large: 'https://lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg' }
    },
    '2026-10-25'
  );
  assert.equal(validAiredCheck.aired, true);

  // 4. 验证 Bangumi 与 弹弹Play 跨源同番异名（繁简异体、第2季/第2期/Season 2、副标题破折号）深度去重与元数据互补聚合
  const keysKusuriya = buildAnimeDedupKeys(
    '药屋少女的呢喃 第二季',
    '藥屋少女的呢喃 第2季',
    '薬屋のひとりごと 第2期',
    '药屋少女的呢喃 Season 2'
  );
  assert.ok(keysKusuriya.includes('药屋少女的呢喃::s2'), '不同写法的第2季/第2期/繁简标题应生成完全一致的归一键');

  const rawCrossSourceItems = [
    {
      source: 'bangumi',
      externalId: '486192',
      title: '药屋少女的呢喃 第二季',
      titleNative: '薬屋のひとりごと 第2期',
      year: 2025,
      episodes: 24,
      coverUrl: 'https://lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg',
      summary: 'Bangumi 详细剧情简介',
      score: 8.6,
      tags: ['推理', '古风'],
      airDate: '2025-01-10'
    },
    {
      source: 'dandanplay',
      externalId: '18290',
      title: '藥屋少女的呢喃 第2期',
      titleNative: '藥屋少女的呢喃 第2期',
      year: 2025,
      episodes: null,
      coverUrl: 'https://img.dandanplay.net/kusuriya2.jpg',
      summary: '',
      score: 9.1,
      tags: [],
      airDay: 5
    },
    {
      source: 'bangumi',
      externalId: '485936',
      title: '我独自升级 第二季 -起于暗影-',
      titleNative: '俺だけレベルアップな件 Season 2 -Arise from the Shadow-',
      year: 2025,
      episodes: 13,
      coverUrl: 'https://lain.bgm.tv/pic/cover/l/60/fe/294993_JrrzK.jpg',
      summary: '暗影君王篇',
      score: 8.1,
      tags: ['战斗']
    },
    {
      source: 'dandanplay',
      externalId: '18305',
      title: '我独自升级 第二季',
      titleNative: '我独自升级 第二季',
      year: 2025,
      episodes: null,
      coverUrl: '',
      summary: '',
      score: 8.5,
      tags: [],
      airDay: 6
    }
  ];

  const mergedList = mergeSeasonalItems(rawCrossSourceItems);
  assert.equal(mergedList.length, 2, '4条跨源同番异名记录应精准合并为2部独立番剧，绝不产生重复卡片');

  const mergedKusuriya = mergedList[0];
  assert.equal(mergedKusuriya.title, '药屋少女的呢喃 第二季');
  assert.deepEqual(mergedKusuriya.sources, ['bangumi', 'dandanplay']);
  assert.equal(mergedKusuriya.sourceExternalIds.bangumi, '486192');
  assert.equal(mergedKusuriya.sourceExternalIds.dandanplay, '18290');
  assert.equal(mergedKusuriya.episodes, 24, '应保留 Bangumi 的集数');
  assert.equal(mergedKusuriya.airDay, 5, '应互补合并弹弹Play的放送星期 airDay');

  // 5. 批量入库合并后的番剧时，应同时在 external_ids 中绑定 bangumi 与 dandanplay 双源 ID
  const batchRes = await req('/api/anime/batch', {
    method: 'POST',
    body: {
      items: [mergedKusuriya],
      status: 'watching'
    }
  });
  assert.equal(batchRes.status, 201);
  assert.equal(batchRes.json.created, 1);
  const newAnimeId = batchRes.json.items[0].anime.id;
  const detailRes = await req(`/api/anime/${newAnimeId}`);
  const providers = detailRes.json.externals.map((e) => e.provider).sort();
  assert.deepEqual(providers, ['bangumi', 'dandanplay'], '入库后应同时记录 Bangumi 与弹弹Play两个外部源 ID');

  // 6. 验证封面图床白名单与协议相对地址修复（支持弹弹Play图床、Bangumi v0 Subject Image 接口与 //lain.bgm.tv 补全）
  assert.equal(normalizeCoverUrl('//lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg'), 'https://lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg');
  assert.equal(isAllowedCoverUrl('https://img.dandanplay.net/anime/18290.jpg'), true, '应允许弹弹Play官方封面图床域名');
  assert.equal(isAllowedCoverUrl('https://api.bgm.tv/v0/subjects/486192/image?type=common'), true, '应允许 Bangumi v0 官方封面重定向接口');
  assert.equal(isAllowedCoverUrl('//lain.bgm.tv/pic/cover/l/fe/31/420628_2ZEz0.jpg'), true, '应兼容 // 开头的协议相对封面 URL');

  // 7. 验证新番导览作品详情预览接口 (/api/external/:source/:id) 可正常返回完整简介、标签与封面供抽屉展示
  const extPreviewRes = await req('/api/external/bangumi/486192');
  assert.equal(extPreviewRes.status, 200);
  assert.equal(extPreviewRes.json.title, '药屋少女的呢喃 第二季');
  assert.ok(extPreviewRes.json.summary.length > 10, '详情预览应返回完整剧情简介');
  assert.ok(extPreviewRes.json.coverUrl.startsWith('/api/cover?u='), '详情预览应返回有效封面代理地址');
});

test("Stage 18: 演示样本一键注入 (/api/demo-seed) 幂等性与高密台账收藏切换接口验证", async (t) => {

  // 首次注入应写入 6 部代表作样本
  const seed1 = await req("/api/demo-seed", { method: "POST" });
  assert.equal(seed1.status, 200);
  assert.equal(seed1.json.ok, true);
  assert.equal(seed1.json.seeded, true);
  assert.equal(seed1.json.count, 7);

  // 二次调用应保持幂等，不重复创建
  const seed2 = await req("/api/demo-seed", { method: "POST" });
  assert.equal(seed2.status, 200);
  assert.equal(seed2.json.seeded, false);
  assert.equal(seed2.json.count, 0);

  // 验证台账表格行内收藏切换与标签字段返回
  const listRes = await req("/api/anime");
  assert.equal(listRes.status, 200);
  assert.equal(listRes.json.data.length, 7);
  const target = listRes.json.data.find((x) => x.canonical_title === "胆大党");
  assert.ok(target, "应包含演示作品《胆大党》");
  assert.ok(target.tag_names.includes("奇幻"), "列表应返回 tag_names 供高密台账表格渲染标签胶囊");
  assert.equal(Boolean(target.is_favorite), false);

  const favRes = await req(`/api/anime/${target.id}/status`, {
    method: "POST",
    body: { is_favorite: true }
  });
  assert.equal(favRes.status, 200);
  assert.equal(Boolean(favRes.json.state.is_favorite), true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../server/db/index.js';
import {
  createAnimeEntry,
  updateAnimeEntry,
  archiveAnimeEntry,
  exportLibraryData,
  importLibraryData,
  batchCreateAnimeEntries,
  getAnimeDetail
} from '../server/services/animeService.js';
import { linkExternal, listExternals } from '../server/repositories/anime.js';
import { createEpisode, listSeasons } from '../server/repositories/episode.js';
import { markEpisode, getEpisodesView } from '../server/services/episodeService.js';
import {
  parseVideoFilename,
  parseMediaFilename,
  addMediaRoot,
  scanMediaRoot,
  listMediaFiles,
  relocateMediaFile,
  applyMediaGroups,
  openMediaWithDefaultPlayer
} from '../server/services/mediaParser.js';
import {
  createDatabaseBackup,
  verifyBackupFile,
  restoreDatabaseBackup
} from '../server/services/backupService.js';
import { fetchAnimeResources, listCachedResources } from '../server/services/resourceService.js';
import { buildSignature, buildAuthHeaders } from '../server/providers/dandanplay.js';

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-comp-'));
  const mediaDir = path.join(dir, 'videos');
  fs.mkdirSync(mediaDir, { recursive: true });
  const { db, schemaVersion } = openDatabase(dir);
  return {
    db,
    dir,
    mediaDir,
    schemaVersion,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('防踩坑文件名解析：标准括号提取 CRC32/字幕语言、保护数字番名 86、拦截 NCOP/PV 特典误判为第1集', () => {
  const p1 = parseMediaFilename('[Nekomoe kissaten][Sousou no Frieren][01][1080p][JPSC][A1B2C3D4].mp4');
  assert.equal(p1.fansub, 'Nekomoe kissaten');
  assert.equal(p1.titleCandidate, 'Sousou no Frieren');
  assert.equal(p1.seasonNumber, 1);
  assert.equal(p1.episodeNumber, 1);
  assert.equal(p1.resolution, '1080p');
  assert.equal(p1.subtitleInfo, 'JPSC');
  assert.equal(p1.crc32, 'A1B2C3D4');
  assert.equal(p1.isSpecial, false);

  const p2 = parseVideoFilename('[LoliHouse] Hibike! Euphonium S3 - 04v2 [WebRip 1080p HEVC-10bit AAC].mkv');
  assert.equal(p2.fansub, 'LoliHouse');
  assert.equal(p2.titleCandidate, 'Hibike! Euphonium');
  assert.equal(p2.seasonNumber, 3);
  assert.equal(p2.explicitSeason, 3);
  assert.equal(p2.episodeNumber, 4, '不应把 S3 或 1080p 或 10bit 当成集数');

  const p3 = parseVideoFilename('[Nekomoe kissaten][86 -Eighty Six-][05][1080p][CHS].mp4');
  assert.equal(p3.titleCandidate, '86 -Eighty Six-');
  assert.equal(p3.episodeNumber, 5, '应提取 [05] 而非标题里的 86');

  const ova = parseVideoFilename('[SweetSub][Bocchi the Rock!][OVA1][BDRip 1080p].mkv');
  assert.equal(ova.isSpecial, true);
  assert.equal(ova.episodeKey, 'OVA1');

  const ncop = parseVideoFilename('[LoliHouse] Sousou no Frieren - NCOP1 [BDRip 1080p].mkv');
  assert.equal(ncop.isSpecial, true);
  assert.equal(ncop.isExtra, true);
  assert.equal(ncop.episodeNumber, null, 'NCOP 特典绝不能误判为正片第 1 集');
});

test('防踩坑媒体扫描：剧场版负样本自动降权、跨季 S02 文件不静默绑到第 1 季、支持手动重定位', () => {
  const { db, mediaDir, cleanup } = setup();
  try {
    const tv = createAnimeEntry(db, {
      canonical_title: '孤独摇滚！',
      release_year: 2022,
      anime_type: 'TV',
      episodes: 12
    });
    createAnimeEntry(db, {
      canonical_title: '孤独摇滚！剧场版 总集篇',
      release_year: 2024,
      anime_type: 'movie',
      episodes: 1
    });

    const s1Path = path.join(mediaDir, '[ANi] 孤独摇滚！ - 01 [1080p].mp4');
    const s2Path = path.join(mediaDir, '[ANi] 孤独摇滚！ S02 - 01 [1080p].mp4');
    const ncopPath = path.join(mediaDir, '[ANi] 孤独摇滚！ - NCOP1 [1080p].mp4');
    fs.writeFileSync(s1Path, 's1-ep1-bytes');
    fs.writeFileSync(s2Path, 's2-ep1-bytes');
    fs.writeFileSync(ncopPath, 'ncop1-bytes');

    const root = addMediaRoot(db, { path: mediaDir });
    const res = scanMediaRoot(db, root.id);

    assert.equal(res.scannedFiles, 3);
    assert.equal(res.matched, 1, 'S1 正片由于剧场版负样本被降权而唯一高分自动绑定');
    assert.equal(res.needsReview, 1, 'S02 文件因库内仅有第 1 季必须进入待确认队列，禁止静默绑到 S1');
    assert.equal(res.unmatched, 1, 'NCOP1 特典不绑定正片集数');

    const reviewFiles = listMediaFiles(db, { status: 'needs_review' });
    assert.equal(reviewFiles.length, 1);
    assert.equal(reviewFiles[0].bind_state, 'pending');
    assert.ok(reviewFiles[0].candidates.length >= 1);

    // 验证文件改名移动后的手动 relocateMediaFile
    const matchedFiles = listMediaFiles(db, { animeId: tv.anime.id, status: 'available' });
    assert.equal(matchedFiles.length, 1);
    const newPath = path.join(mediaDir, 'renamed-bocchi-01.mp4');
    fs.renameSync(s1Path, newPath);
    scanMediaRoot(db, root.id);
    const missingNow = listMediaFiles(db, { status: 'missing' });
    assert.equal(missingNow.length, 1);

    const relocated = relocateMediaFile(db, matchedFiles[0].id, newPath);
    assert.equal(relocated.availability_status, 'available');
    assert.equal(relocated.path, newPath);
  } finally {
    cleanup();
  }
});

test('Stage 7 安全播放器调用：特殊字符文件名通过参数数组传递（不拼 shell），且绝不自动标已看', async () => {
  const { db, mediaDir, cleanup } = setup();
  try {
    const created = createAnimeEntry(db, {
      canonical_title: '孤独摇滚！',
      episodes: 12
    });
    const specialFile = path.join(mediaDir, '[A&B;Sub] 孤独摇滚！ [01][1080p].mp4');
    fs.writeFileSync(specialFile, 'video-bytes');

    const root = addMediaRoot(db, { path: mediaDir });
    scanMediaRoot(db, root.id);
    const [media] = listMediaFiles(db, { status: 'available' });
    assert.ok(media);

    let spawnedCmd = null;
    let spawnedArgs = null;
    const mockSpawner = (cmd, args) => {
      spawnedCmd = cmd;
      spawnedArgs = args;
      const ee = new EventEmitter();
      process.nextTick(() => ee.emit('spawn'));
      return ee;
    };

    const res = await openMediaWithDefaultPlayer(db, media.id, { spawner: mockSpawner });
    assert.equal(res.ok, true);
    assert.equal(res.auto_marked_watched, false);
    assert.ok(spawnedCmd);
    assert.ok(spawnedArgs.includes(specialFile), '文件路径必须作为独立参数传递而非拼接到 shell');

    const epView = getEpisodesView(db, created.anime.id);
    assert.equal(epView.progress.watched, 0, '打开播放器绝不能自动标记已看');
  } finally {
    cleanup();
  }
});

test('D-002 时长合规：批量入库与本地识别同步在未提供时长时保持 null，绝不硬编码 24 分钟', () => {
  const { db, cleanup } = setup();
  try {
    const batchRes = batchCreateAnimeEntries(db, {
      status: 'watching',
      items: [{ title: '未知时长新番A', year: 2025, episodes: 12 }]
    });
    assert.equal(batchRes.created, 1);
    assert.equal(
      batchRes.items[0].anime.default_episode_duration_minutes,
      null,
      'D-002：批量入库未知时长必须为 null，不得硬编码为 24 分钟'
    );

    const applyRes = applyMediaGroups(db, {
      groups: [
        {
          titleCandidate: '未知时长本地番B',
          seasonNumber: 1,
          maxEpisode: 3,
          recognizedEpisodes: [1, 2, 3],
          episodes: [{ fileName: '01.mp4', episodeNumber: 1 }]
        }
      ],
      markWatched: true,
      defaultStatus: 'watching'
    });
    assert.equal(applyRes.createdAnime, 1);
    const bRow = db
      .prepare('SELECT default_episode_duration_minutes FROM anime WHERE canonical_title = ?')
      .get('未知时长本地番B');
    assert.equal(
      bRow.default_episode_duration_minutes,
      null,
      'D-002：本地媒体同步未知时长必须为 null，不得硬编码为 24 分钟'
    );
  } finally {
    cleanup();
  }
});

test('Stage 9 & P2 全量 16 表物理备份恢复：恢复后完整保留字段锁 (anime_metadata_fields)、RSS 缓存与观看时间轴', async () => {
  const { db, dir, cleanup } = setup();
  try {
    const created = createAnimeEntry(db, {
      canonical_title: '迷宫饭',
      status: 'watching',
      rating: 9,
      episodes: 3
    });
    const animeId = created.anime.id;

    // 1. 手工编辑标题触发字段锁定 (anime_metadata_fields)
    updateAnimeEntry(db, animeId, { canonical_title: '迷宫饭（典藏锁定版）' });

    // 2. 产生观看记录与观看事件时间轴 (watch_events)
    const ep1 = getEpisodesView(db, animeId).seasons[0].episodes[0];
    markEpisode(db, ep1.id, true, '2026-04-01');

    // 3. 写入站内 RSS 缓存 (resource_items)
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0"><channel><item>
        <title>[LoliHouse] 迷宫饭 - 01 [1080p]</title>
        <link>https://mikanani.me/Home/Episode/1</link>
        <enclosure url="magnet:?xt=urn:btih:1234567890abcdef" length="1024" type="application/x-bittorrent" />
      </item></channel></rss>`;
    await fetchAnimeResources(db, { dataDir: dir }, animeId, { xmlText: sampleXml });

    // 4. 创建物理备份并直接调用 verifyBackupFile(filePath)（不传第2参数，验证默认支持 v4）
    const backup = createDatabaseBackup(db, dir, { label: 'v4-full' });
    const directVerify = verifyBackupFile(backup.filePath);
    assert.equal(directVerify.valid, true, 'verifyBackupFile 默认应支持 v4 架构备份');
    assert.equal(directVerify.schemaVersion, 4);

    // 5. 清空作品后执行恢复，验证字段锁、RSS 缓存和观看时间轴全部恢复
    db.prepare('DELETE FROM anime WHERE id = ?').run(animeId);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM anime').get().c, 0);

    const restored = restoreDatabaseBackup(db, dir, { fileName: backup.fileName });
    assert.equal(restored.ok, true);

    const detailAfter = getAnimeDetail(db, animeId);
    assert.equal(detailAfter.anime.canonical_title, '迷宫饭（典藏锁定版）');
    assert.ok(
      detailAfter.locked_fields.includes('canonical_title'),
      '恢复物理备份后必须保留 anime_metadata_fields 字段锁'
    );
    assert.ok(
      detailAfter.watch_events.length >= 1,
      '恢复物理备份后必须保留 watch_events 观看时间轴'
    );

    const rssAfter = listCachedResources(db, animeId);
    assert.equal(rssAfter.count, 1, '恢复物理备份后必须保留 resource_items 站内 RSS 缓存');
  } finally {
    cleanup();
  }
});

test('无损导出与导入：保留已归档作品历史时间戳、多外部 ID、单集独立时长与特殊集，且重复导入不重复建档', () => {
  const src = setup();
  const dst = setup();
  try {
    const active = createAnimeEntry(src.db, {
      canonical_title: '葬送的芙莉莲',
      release_year: 2023,
      anime_type: 'TV',
      default_episode_duration_minutes: 24,
      status: 'completed',
      rating: 10,
      is_favorite: true,
      notes: '年度最爱',
      tags: ['奇幻', '治愈'],
      episodes: 2,
      source: 'bangumi',
      external_id: '400602'
    });
    linkExternal(src.db, active.anime.id, 'bilibili', '45859');

    const mainSeason = listSeasons(src.db, active.anime.id)[0];
    const eps = getEpisodesView(src.db, active.anime.id).seasons[0].episodes;
    src.db.prepare('UPDATE episodes SET duration_minutes = 90, title = ? WHERE id = ?').run('冒险的结束', eps[0].id);
    markEpisode(src.db, eps[0].id, true, '2023-09-29');

    const sp1 = createEpisode(src.db, mainSeason.id, {
      episode_number: 1,
      episode_key: 'SP1',
      title: '迷你动画 1',
      duration_minutes: 3,
      is_special: true,
      sort_order: 99
    });
    markEpisode(src.db, sp1.id, true, null);

    const archived = createAnimeEntry(src.db, {
      canonical_title: '无外部ID的已归档旧番',
      status: 'dropped'
    });
    archiveAnimeEntry(src.db, archived.anime.id);
    const historicalArchiveTime = '2024-01-15T08:00:00.000Z';
    src.db.prepare('UPDATE anime SET deleted_at = ? WHERE id = ?').run(historicalArchiveTime, archived.anime.id);

    const exported = exportLibraryData(src.db);
    assert.equal(exported.count, 2);

    const res1 = importLibraryData(dst.db, exported);
    assert.equal(res1.imported, 2);
    assert.equal(res1.skipped, 0);

    const res2 = importLibraryData(dst.db, exported);
    assert.equal(res2.imported, 0);
    assert.equal(res2.skipped, 2, '重复导入时连同无外部ID的已归档作品也应被识别跳过');

    const dstAll = dst.db.prepare('SELECT * FROM anime ORDER BY canonical_title').all();
    const dstArchived = dstAll.find((a) => a.canonical_title === '无外部ID的已归档旧番');
    assert.equal(dstArchived.deleted_at, historicalArchiveTime, '应保留原始历史归档时间而非覆盖为当前时间');

    const dstActive = dstAll.find((a) => a.canonical_title === '葬送的芙莉莲');
    assert.equal(listExternals(dst.db, dstActive.id).length, 2);
    const dstEpView = getEpisodesView(dst.db, dstActive.id);
    assert.equal(dstEpView.progress.minutes, 90 + 3, '首集 90 分钟与 SP 3 分钟独立时长均应保留并计入');
  } finally {
    src.cleanup();
    dst.cleanup();
  }
});

test('B-006 弹弹Play签名：严格剥离查询参数并按 AppId + Timestamp + Path + AppSecret 计算', () => {
  const appId = 'my_app_id';
  const appSecret = 'my_secret_key';
  const timestamp = 1730000000;
  const pathWithQuery = '/api/v2/search/anime?keyword=%E8%8A%99%E8%8E%89%E8%8E%B2';

  const sig = buildSignature({ appId, appSecret, path: pathWithQuery, timestamp });
  const expectedRaw = `${appId}${timestamp}/api/v2/search/anime${appSecret}`;
  const expectedSig = crypto.createHash('sha256').update(expectedRaw, 'utf8').digest('base64');
  assert.equal(sig, expectedSig);

  const headers = buildAuthHeaders({ appId, appSecret, path: pathWithQuery, timestamp });
  assert.equal(headers['X-AppId'], appId);
  assert.equal(headers['X-Timestamp'], String(timestamp));
  assert.equal(headers['X-Signature'], expectedSig);
});

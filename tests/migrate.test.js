import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runMigrations, getSchemaVersion } from '../server/db/migrate.js';

const MIGRATIONS_DIR = path.resolve('server/db/migrations');

function makeTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanzhang-test-'));
  const db = new DatabaseSync(path.join(dir, 'test.db'));
  db.exec('PRAGMA foreign_keys = ON;');
  return {
    db,
    dir,
    cleanup() {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test('首次迁移：版本号置为 4 且 16 张核心与扩展表全部建立', () => {
  const { db, cleanup } = makeTempDb();
  try {
    assert.equal(getSchemaVersion(db), 0, '新库版本应为 0');

    const result = runMigrations(db, MIGRATIONS_DIR);
    assert.equal(result.from, 0);
    assert.equal(result.to, 4);
    assert.equal(result.applied.length, 4);

    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name)
    );
    for (const t of [
      'anime',
      'user_anime_state',
      'seasons',
      'episodes',
      'episode_watch_state',
      'tags',
      'anime_tags',
      'app_settings',
      'external_ids',
      'anime_aliases',
      'library_roots',
      'media_files',
      'resource_providers',
      'anime_metadata_fields',
      'resource_items',
      'watch_events'
    ]) {
      assert.ok(tables.has(t), `缺少表 ${t}`);
    }
  } finally {
    cleanup();
  }
});

test('存量 v2 数据库平滑升级到 v4：保留原有 external_ids 且支持 bilibili 与 dandanplay', () => {
  const { db, dir, cleanup } = makeTempDb();
  const v2Dir = path.join(dir, 'v2-only');
  fs.mkdirSync(v2Dir);
  fs.copyFileSync(path.join(MIGRATIONS_DIR, '001_init.sql'), path.join(v2Dir, '001_init.sql'));
  fs.copyFileSync(path.join(MIGRATIONS_DIR, '002_external_ids.sql'), path.join(v2Dir, '002_external_ids.sql'));

  try {
    const r1 = runMigrations(db, v2Dir);
    assert.equal(r1.to, 2);

    db.prepare(
      `INSERT INTO anime (id, canonical_title, metadata_status, created_at, updated_at)
       VALUES ('a1', '存量番剧', 'synced', '2026-01-01', '2026-01-01')`
    ).run();
    db.prepare(
      `INSERT INTO external_ids (id, anime_id, provider, external_id, created_at)
       VALUES ('e1', 'a1', 'bangumi', '400602', '2026-01-01')`
    ).run();

    // 继续执行完整迁移目录（从 v2 升级到 v4）
    const r2 = runMigrations(db, MIGRATIONS_DIR);
    assert.equal(r2.from, 2);
    assert.equal(r2.to, 4);
    assert.equal(r2.applied.length, 2);

    const kept = db.prepare('SELECT * FROM external_ids WHERE id = ?').get('e1');
    assert.equal(kept.external_id, '400602', '升级后原有外部 ID 必须保留');

    db.prepare(
      `INSERT INTO external_ids (id, anime_id, provider, external_id, created_at)
       VALUES ('e2', 'a1', 'bilibili', '45859', '2026-01-02')`
    ).run();
    db.prepare(
      `INSERT INTO external_ids (id, anime_id, provider, external_id, created_at)
       VALUES ('e3', 'a1', 'dandanplay', '17890', '2026-01-02')`
    ).run();
    const count = db.prepare('SELECT COUNT(*) AS c FROM external_ids WHERE anime_id = ?').get('a1').c;
    assert.equal(Number(count), 3);
  } finally {
    cleanup();
  }
});

test('迁移幂等：重复执行不再应用任何文件', () => {
  const { db, cleanup } = makeTempDb();
  try {
    runMigrations(db, MIGRATIONS_DIR);
    const second = runMigrations(db, MIGRATIONS_DIR);
    assert.equal(second.applied.length, 0, '第二次不应再执行迁移');
    assert.equal(second.to, 4);
  } finally {
    cleanup();
  }
});

test('迁移失败时回滚：版本号不前进，表不残留', () => {
  const { db, dir, cleanup } = makeTempDb();
  const badDir = path.join(dir, 'bad-migrations');
  fs.mkdirSync(badDir);
  fs.writeFileSync(
    path.join(badDir, '001_broken.sql'),
    'CREATE TABLE ok_table (id TEXT); CREATE TABLE (bad syntax here);',
    'utf8'
  );
  try {
    assert.throws(() => runMigrations(db, badDir), /执行失败/);
    assert.equal(getSchemaVersion(db), 0, '失败后版本号应保持 0');

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'ok_table'")
      .all();
    assert.equal(tables.length, 0, '前半段建的表应随事务回滚');
  } finally {
    cleanup();
  }
});

test('外键约束生效：引用不存在的作品会被拒绝', () => {
  const { db, cleanup } = makeTempDb();
  try {
    runMigrations(db, MIGRATIONS_DIR);
    assert.throws(() => {
      db.prepare(
        `INSERT INTO seasons (id, anime_id, season_number, title, sort_order, created_at, updated_at)
         VALUES ('s1', 'no-such-anime', 1, NULL, 0, '2026-01-01', '2026-01-01')`
      ).run();
    }, /FOREIGN KEY/i);
  } finally {
    cleanup();
  }
});

test('数据持久化：关闭后重新打开，数据仍在', () => {
  const { db, dir } = makeTempDb();
  const file = path.join(dir, 'test.db');
  try {
    runMigrations(db, MIGRATIONS_DIR);
    db.prepare(
      `INSERT INTO anime (id, canonical_title, metadata_status, created_at, updated_at)
       VALUES ('a1', '持久化测试', 'manual', '2026-01-01', '2026-01-01')`
    ).run();
  } finally {
    db.close();
  }

  const reopened = new DatabaseSync(file);
  try {
    const row = reopened.prepare('SELECT canonical_title FROM anime WHERE id = ?').get('a1');
    assert.equal(row.canonical_title, '持久化测试');
    assert.equal(getSchemaVersion(reopened), 4);
  } finally {
    reopened.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

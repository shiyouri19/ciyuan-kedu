import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runMigrations, getSchemaVersion } from './migrate.js';

export const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/** 数据目录下的固定子目录，首次启动自动创建 */
export const DATA_SUBDIRS = ['', 'backup', 'exports', 'cache/covers', 'cache/api', 'logs'];

export function ensureDataDirs(dataDir) {
  for (const sub of DATA_SUBDIRS) {
    fs.mkdirSync(path.join(dataDir, sub), { recursive: true });
  }
}

/**
 * 打开数据库并执行迁移。
 * 外键约束必须显式开启，否则 SQLite 默认不检查。
 */
export function openDatabase(dataDir) {
  ensureDataDirs(dataDir);

  const file = path.join(dataDir, 'ledger.db');
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');

  const migrations = runMigrations(db, MIGRATIONS_DIR);

  // 把上次进程异常退出残留的 WAL 回写主库。
  // 这样 ledger.db 单文件即完整，用户手动只拷这个文件也不会漏数据。
  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');

  return { db, file, migrations, schemaVersion: getSchemaVersion(db) };
}

/**
 * 关闭数据库前先做 checkpoint，保证主库文件自包含。
 * 直接 db.close() 也会合并 WAL，但显式 checkpoint 可以让异常路径也尽量干净。
 */
export function closeDatabase(db) {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch {
    /* checkpoint 失败不阻止关闭 */
  }
  try {
    db.close();
  } catch {
    /* 已关闭 */
  }
}

/**
 * 事务包装。任何抛错都回滚，避免留下半完成状态。
 */
export function withTransaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* 保留原始错误 */
    }
    throw err;
  }
}

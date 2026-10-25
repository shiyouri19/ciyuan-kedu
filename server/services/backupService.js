/**
 * Stage 9：SQLite 数据库物理备份、完整性校验與安全恢复服务。
 *
 * 严格遵循 PRD FR-08 与 DATA_MODEL §10.2：
 * 1. 备份前确保事务已提交，使用 SQLite 原生 `VACUUM INTO` 生成一致的独立物理库文件（不带半截 WAL）。
 * 2. 校验备份文件的 SQLite 魔数头 (`SQLite format 3\0`)、`PRAGMA integrity_check`、`PRAGMA user_version` 及核心表存在性。
 * 3. 恢复前强制验证目标备份文件合法且版本不高于当前程序支持版本，拒绝损坏或超前版本的备份。
 * 4. 恢复前自动生成一份 `pre-restore` 安全备份，然后在单事务内原子替换全部 16 张业务表数据，失败自动回滚。
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ValidationError, NotFoundError } from '../errors.js';
import { getSchemaVersion } from '../db/migrate.js';

const SQLITE_MAGIC_HEADER = 'SQLite format 3\0';
const REQUIRED_CORE_TABLES = [
  'anime',
  'user_anime_state',
  'seasons',
  'episodes',
  'episode_watch_state',
  'tags',
  'anime_tags'
];

// 全部 16 张业务表的拓扑依赖顺序（子表删除逆序，父表插入正序）
const ALL_TABLES_IN_ORDER = [
  'app_settings',
  'tags',
  'library_roots',
  'resource_providers',
  'anime',
  'user_anime_state',
  'anime_tags',
  'external_ids',
  'anime_aliases',
  'anime_metadata_fields',
  'seasons',
  'episodes',
  'episode_watch_state',
  'media_files',
  'resource_items',
  'watch_events'
];

export function getBackupDir(cfgOrDataDir) {
  const baseDir =
    typeof cfgOrDataDir === 'string'
      ? cfgOrDataDir
      : cfgOrDataDir?.dataDir || path.join(process.cwd(), 'data');
  const dir = path.join(baseDir, 'backup');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function formatTimestampForFilename(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}-` +
    `${String(date.getMilliseconds()).padStart(3, '0')}`
  );
}

/**
 * 校验一个本地 SQLite 物理备份文件是否完好、架构版本是否兼容。
 */
export function verifyBackupFile(filePath, maxSupportedVersion = 4) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { valid: false, error: '备份文件不存在' };
  }

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch (err) {
    return { valid: false, error: `无法读取文件状态：${err.message}` };
  }

  if (!stat.isFile() || stat.size < 100) {
    return { valid: false, error: '备份文件大小异常（不是有效的 SQLite 数据库文件）' };
  }

  // 检查 SQLite 16 字节文件魔数头
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    if (buf.toString('utf8') !== SQLITE_MAGIC_HEADER) {
      return { valid: false, error: '文件头校验失败：不是合法的 SQLite 3 数据库文件' };
    }
  } catch (err) {
    return { valid: false, error: `读取文件头失败：${err.message}` };
  }

  let tempDb;
  try {
    tempDb = new DatabaseSync(filePath);
    const integrity = tempDb.prepare('PRAGMA integrity_check').get();
    if (!integrity || integrity.integrity_check !== 'ok') {
      return { valid: false, error: `SQLite 完整性检查未通过：${JSON.stringify(integrity)}` };
    }

    const verRow = tempDb.prepare('PRAGMA user_version').get();
    const schemaVersion = Number(verRow?.user_version ?? 0);
    if (schemaVersion <= 0) {
      return { valid: false, error: '备份库未初始化（user_version 为 0）' };
    }
    if (schemaVersion > maxSupportedVersion) {
      return {
        valid: false,
        error: `备份文件来自更高版本的程序 (v${schemaVersion} > 当前支持 v${maxSupportedVersion})，拒绝降级恢复`
      };
    }

    const existingTables = new Set(
      tempDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name)
    );

    for (const reqTable of REQUIRED_CORE_TABLES) {
      if (!existingTables.has(reqTable)) {
        return { valid: false, error: `备份文件缺少核心表：${reqTable}` };
      }
    }

    const animeCount = Number(
      tempDb.prepare('SELECT COUNT(*) AS c FROM anime WHERE deleted_at IS NULL').get()?.c ?? 0
    );
    const archivedCount = Number(
      tempDb.prepare('SELECT COUNT(*) AS c FROM anime WHERE deleted_at IS NOT NULL').get()?.c ?? 0
    );
    const watchedCount = Number(
      tempDb.prepare('SELECT COUNT(*) AS c FROM episode_watch_state WHERE is_watched = 1').get()?.c ?? 0
    );

    return {
      valid: true,
      schemaVersion,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      counts: {
        anime: animeCount,
        archived: archivedCount,
        watchedEpisodes: watchedCount
      }
    };
  } catch (err) {
    return { valid: false, error: `SQLite 校验异常：${err.message}` };
  } finally {
    try {
      tempDb?.close();
    } catch {
      /* ignore close error */
    }
  }
}

/**
 * 创建一份当前 SQLite 数据库的完整物理快照（位于 data/backup/）。
 */
export function createDatabaseBackup(db, cfgOrDataDir, { label = 'manual' } = {}) {
  const backupDir = getBackupDir(cfgOrDataDir);
  const safeLabel = String(label || 'manual')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24) || 'manual';
  const fileName = `fanzhang-${formatTimestampForFilename()}-${safeLabel}.db`;
  const targetPath = path.join(backupDir, fileName);

  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }

  // 使用 SQLite 原生 VACUUM INTO 导出独立且一致的物理文件
  const escapedPath = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}'`);

  const currentVer = Math.max(getSchemaVersion(db), 4);
  const check = verifyBackupFile(targetPath, currentVer);
  if (!check.valid) {
    try {
      fs.unlinkSync(targetPath);
    } catch {
      /* ignore */
    }
    throw new ValidationError(`备份生成后校验未通过：${check.error}`, 'backup');
  }

  return {
    ok: true,
    fileName,
    filePath: targetPath,
    ...check
  };
}

/**
 * 列出 data/backup/ 目录下的所有备份文件及其校验状态。
 */
export function listBackups(db, cfgOrDataDir) {
  const backupDir = getBackupDir(cfgOrDataDir);
  const currentVer = Math.max(getSchemaVersion(db), 4);
  const entries = fs.readdirSync(backupDir, { withFileTypes: true });
  const list = [];

  for (const ent of entries) {
    if (!ent.isFile() || !ent.name.endsWith('.db')) continue;
    const fullPath = path.join(backupDir, ent.name);
    const check = verifyBackupFile(fullPath, currentVer);
    const stat = fs.statSync(fullPath);
    list.push({
      fileName: ent.name,
      sizeBytes: stat.size,
      createdAt: stat.mtime.toISOString(),
      ...check
    });
  }

  list.sort((a, b) => String(b.fileName).localeCompare(String(a.fileName)));
  return { data: list, count: list.length };
}

export const listDatabaseBackups = listBackups;

/**
 * 从指定的物理备份文件恢复数据库（带自动恢复前备份与事务回滚保护）。
 * 覆盖全部 16 张表（含 P2 扩展表 anime_metadata_fields、resource_items、watch_events）。
 */
export function restoreDatabaseBackup(db, cfgOrDataDir, { fileName } = {}) {
  const cleanName = path.basename(String(fileName ?? '').trim());
  if (!cleanName || !cleanName.endsWith('.db')) {
    throw new ValidationError('请提供合法的备份文件名 (.db)', 'fileName');
  }

  const backupDir = getBackupDir(cfgOrDataDir);
  const sourcePath = path.join(backupDir, cleanName);
  if (!fs.existsSync(sourcePath)) {
    throw new NotFoundError(`备份文件不存在：${cleanName}`);
  }

  const currentVer = Math.max(getSchemaVersion(db), 4);
  const check = verifyBackupFile(sourcePath, currentVer);
  if (!check.valid) {
    throw new ValidationError(`拒绝恢复损坏或不兼容的备份：${check.error}`, 'fileName');
  }

  // 1. 先自动创建一份当前状态的 pre-restore 物理备份，确保万无一失
  const preRestoreBackup = createDatabaseBackup(db, cfgOrDataDir, { label: 'pre-restore' });

  // 2. 通过 ATTACH DATABASE 在单事务内原子恢复所有表数据
  const escapedSource = sourcePath.replace(/'/g, "''");
  db.exec(`ATTACH DATABASE '${escapedSource}' AS restore_src`);

  try {
    const srcTables = new Set(
      db
        .prepare("SELECT name FROM restore_src.sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name)
    );
    const mainTables = new Set(
      db
        .prepare("SELECT name FROM main.sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name)
    );

    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN IMMEDIATE');
    try {
      // 逆序清空当前主库中的所有业务表
      for (const tbl of [...ALL_TABLES_IN_ORDER].reverse()) {
        if (mainTables.has(tbl)) {
          db.exec(`DELETE FROM main.${tbl}`);
        }
      }

      // 按父表 -> 子表顺序从备份库复制全部存在的数据（使用交集列兼容不同版本表结构）
      for (const tbl of ALL_TABLES_IN_ORDER) {
        if (!srcTables.has(tbl) || !mainTables.has(tbl)) continue;
        const mainCols = db
          .prepare(`PRAGMA main.table_info(${tbl})`)
          .all()
          .map((c) => c.name);
        const srcCols = new Set(
          db
            .prepare(`PRAGMA restore_src.table_info(${tbl})`)
            .all()
            .map((c) => c.name)
        );
        const commonCols = mainCols.filter((c) => srcCols.has(c));
        if (commonCols.length > 0) {
          const colList = commonCols.join(', ');
          db.exec(`INSERT INTO main.${tbl} (${colList}) SELECT ${colList} FROM restore_src.${tbl}`);
        }
      }

      db.exec('COMMIT');
    } catch (txErr) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw new ValidationError(`恢复过程中发生异常，已自动回滚原数据：${txErr.message}`, 'restore');
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  } finally {
    try {
      db.exec('DETACH DATABASE restore_src');
    } catch {
      /* ignore */
    }
  }

  return {
    ok: true,
    restoredFrom: cleanName,
    preRestoreBackup: preRestoreBackup.fileName,
    counts: check.counts
  };
}

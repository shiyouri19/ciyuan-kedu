import fs from 'node:fs';
import path from 'node:path';

/**
 * 读取当前数据库版本。
 * SQLite 的 PRAGMA user_version 是库头部的整数，用来记录已应用到第几号迁移。
 */
export function getSchemaVersion(db) {
  const row = db.prepare('PRAGMA user_version').get();
  return Number(row?.user_version ?? 0);
}

/**
 * 按文件名前缀的三位数字顺序执行未应用的迁移。
 * 每个迁移在一个事务里执行：SQL 与版本号同时生效或同时回滚。
 * 重复调用是幂等的：版本号已覆盖的迁移会被跳过。
 */
export function runMigrations(db, migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`迁移目录不存在：${migrationsDir}`);
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{3}_[\w-]+\.sql$/i.test(f))
    .sort();

  const from = getSchemaVersion(db);
  const applied = [];

  for (const file of files) {
    const version = parseInt(file.slice(0, 3), 10);
    if (version <= from) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${version};`);
      db.exec('COMMIT');
      applied.push({ version, file });
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {
        /* 回滚失败时保留原始错误 */
      }
      throw new Error(`迁移 ${file} 执行失败：${err.message}`);
    }
  }

  return { from, to: getSchemaVersion(db), applied };
}

/**
 * 部署脚本：把源码同步到「安装目录」。
 *
 * 本项目分两个位置：
 *   - 源码目录（这个文件所在处）：带 .git，是我改代码的地方
 *   - 安装目录（默认 E:\次元刻度）：日常双击启动的就是它，代码和数据都在里面
 *
 * 用法：
 *   node deploy.mjs              同步代码（保留安装目录里已有的数据）
 *   node deploy.mjs --with-tests 连测试一起同步（默认不同步）
 *   node deploy.mjs --dry        只打印要做什么，不实际写
 *
 * 设计原则：
 *   1. 数据是唯一不可再生的东西，**永远不覆盖**安装目录的 data/
 *   2. 代码是可替换的，直接覆盖
 *   3. 安装目录根下如果还散落着旧的 ledger.db / cache 等，自动收进 data/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.dirname(fileURLToPath(import.meta.url));
const DST = process.argv.find((a) => a.startsWith('--to='))?.slice(5) || 'E:\\次元刻度';
const WITH_TESTS = process.argv.includes('--with-tests');
const DRY = process.argv.includes('--dry');

const log = (...a) => console.log(...a);
const act = (msg) => log(DRY ? `  [dry] ${msg}` : `  ${msg}`);

// 从源码复制过去的东西
const COPY_DIRS = ['server', 'web', 'public', 'tools', 'docs'];
if (WITH_TESTS) COPY_DIRS.push('tests');
const COPY_FILES = [
  'launcher.js',
  '次元刻度.vbs',
  '创建桌面快捷方式.vbs',
  'package.json',
  'config.example.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE'
];

// 安装目录根下这些散落物属于「数据」，要收进 data/
// 注意：不含 logs —— 那是运行时产物，服务跑着的时候文件被占用，
// 强行 rename 会 EPERM；而且它本来就不该跟着数据走。
const STRAY_DATA = [
  'ledger.db',
  'ledger.db-wal',
  'ledger.db-shm',
  'dandanplay-quota.json',
  'cache',
  'backup',
  'exports',
  'config.json'
];

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let n = 0;
  for (const f of fs.readdirSync(from)) {
    const a = path.join(from, f);
    const b = path.join(to, f);
    const st = fs.statSync(a);
    if (st.isDirectory()) n += copyDir(a, b);
    else {
      if (!DRY) fs.copyFileSync(a, b);
      n += 1;
    }
  }
  return n;
}

function main() {
  log(`源码目录：${SRC}`);
  log(`安装目录：${DST}`);
  log('');

  if (!fs.existsSync(DST)) {
    log(`目标目录不存在，创建：${DST}`);
    if (!DRY) fs.mkdirSync(DST, { recursive: true });
  }

  // 1) 安装目录根下散落的旧数据，**归档到 data-legacy-日期/**，不塞进 data/
  //
  // 这里踩过一个坑：如果直接把散落的 ledger.db 移进 data/，后面「data/ 已存在
  // 就不复制源码数据」的判断会把这份旧库当成正式数据，结果装完还是老数据。
  const dataDir = path.join(DST, 'data');
  const strays = STRAY_DATA.filter((f) => fs.existsSync(path.join(DST, f)));
  if (strays.length > 0) {
    const legacyDir = path.join(DST, 'data-legacy-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''));
    log(`发现 ${strays.length} 项散落在根目录的数据，归档到 ${path.basename(legacyDir)}/（不覆盖 data/）：`);
    if (!DRY) fs.mkdirSync(legacyDir, { recursive: true });
    for (const f of strays) {
      const from = path.join(DST, f);
      const to = path.join(legacyDir, f);
      act(`归档 ${f}`);
      if (!DRY) fs.renameSync(from, to);
    }
    log('');
  }

  // 2) 源码里的 data/ 是开发时用的，装过去只在目标没有 data 时作为初值
  const srcData = path.join(SRC, 'data');
  if (fs.existsSync(srcData)) {
    const hasTargetDb = fs.existsSync(path.join(dataDir, 'ledger.db'));
    if (hasTargetDb) {
      act('跳过 data/（安装目录已有一份，不覆盖）');
    } else {
      log('安装目录还没有数据，把源码里的 data/ 作为初始数据复制过去：');
      const n = copyDir(srcData, dataDir);
      act(`复制 data/（${n} 个文件）`);
    }
    log('');
  }

  // 3) 代码：直接覆盖
  log('同步程序文件：');
  for (const dir of COPY_DIRS) {
    const from = path.join(SRC, dir);
    if (!fs.existsSync(from)) continue;
    const n = copyDir(from, path.join(DST, dir));
    act(`${dir.padEnd(10)} ${n} 个文件`);
  }
  for (const f of COPY_FILES) {
    const from = path.join(SRC, f);
    if (!fs.existsSync(from)) continue;
    if (!DRY) fs.copyFileSync(from, path.join(DST, f));
    act(f);
  }
  log('');

  // 4) 安装目录的 config.json：dataDir 必须指向 ./data
  const dstCfgPath = path.join(dataDir, 'config.json');
  const rootCfgPath = path.join(DST, 'config.json');
  const cfgPath = fs.existsSync(dstCfgPath) ? dstCfgPath : rootCfgPath;
  if (fs.existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (cfg.dataDir !== './data') {
        cfg.dataDir = './data';
        if (!DRY) fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
        act(`config.json 的 dataDir → ./data（${path.relative(DST, cfgPath)}）`);
      } else {
        act('config.json 的 dataDir 已是 ./data');
      }
    } catch (e) {
      log(`  ⚠ config.json 解析失败，未改动：${e.message}`);
    }
  } else {
    // 没有配置就造一份最小可用的
    const cfg = { dataDir: './data', port: 7345, host: '127.0.0.1' };
    if (!DRY) fs.writeFileSync(rootCfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
    act('新建 config.json（dataDir=./data）');
  }

  log('');
  log(DRY ? '演练结束，没有写入任何文件。' : '部署完成。');
  if (!DRY) {
    log('');
    log('安装目录结构：');
    for (const f of fs.readdirSync(DST).sort()) {
      const st = fs.statSync(path.join(DST, f));
      log(`  ${st.isDirectory() ? '[目录] ' : '       '}${f}`);
    }
  }
}

main();

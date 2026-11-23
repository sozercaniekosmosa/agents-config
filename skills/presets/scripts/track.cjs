#!/usr/bin/env node
'use strict';

// Трекер базы навыка: baseline, дрейф, инвентарь, локальный аудит.
// Сгенерирован forge (TEMPLATE_VERSION шаблона); логику менять через forge, не в этом файле.
// Пишет только state/state.json, AUTO-блок SKILL.md, CHANGELOG.md навыка.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const CONFIG = {
  "name": "presets",
  "title": "Пресеты-заготовки карточки",
  "marker": "AUTO:PRESETS",
  "maxLoc": 500,
  "modules": [
    "src/shared/templates/presets",
    "src/shared/templates/fields",
    "src/components/tree/section-card/SectionCardPresetPalette.tsx",
    "src/components/tree/section-card/presetSearch.ts",
    "src/components/tree/section-card/useSectionCardPresets.ts"
  ],
  "ext": [
    ".ts",
    ".tsx"
  ]
};

const SKILL_DIR = path.join(__dirname, '..');
const ROOT = path.join(SKILL_DIR, '..', '..', '..');
const STATE = path.join(SKILL_DIR, 'state', 'state.json');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const CHANGELOG = path.join(SKILL_DIR, 'CHANGELOG.md');
const MARK_START = '<!-- ' + CONFIG.marker + ':START -->';
const MARK_END = '<!-- ' + CONFIG.marker + ':END -->';
const CODE_EXT = new Set(CONFIG.ext);

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && CODE_EXT.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

function meta(file) {
  const buf = fs.readFileSync(file);
  const loc = buf.toString('utf8').replace(/\n$/, '').split('\n').length;
  return { hash: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12), loc };
}

function git(args) {
  try {
    return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function collect() {
  const files = {};
  for (const item of CONFIG.modules) {
    const abs = path.join(ROOT, item);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) {
      for (const file of walk(abs)) files[rel(file)] = meta(file);
    } else {
      files[item] = meta(abs);
    }
  }
  const sorted = {};
  for (const key of Object.keys(files).sort()) sorted[key] = files[key];
  return {
    files: sorted,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    commit: git(['rev-parse', '--short', 'HEAD']),
  };
}

function readState() {
  if (!fs.existsSync(STATE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE, 'utf8'));
  } catch {
    return null;
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + '.' + date.getFullYear() +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function fmt(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function totals(files) {
  let loc = 0;
  for (const info of Object.values(files)) loc += info.loc;
  return { count: Object.keys(files).length, loc };
}

function diff(prev, now) {
  const added = [];
  const removed = [];
  const changed = [];
  const prevFiles = (prev && prev.files) || {};
  for (const [file, info] of Object.entries(now.files)) {
    if (!prevFiles[file]) added.push(file);
    else if (prevFiles[file].hash !== info.hash) changed.push(file);
  }
  for (const file of Object.keys(prevFiles)) {
    if (!now.files[file]) removed.push(file);
  }
  return { added, removed, changed };
}

function driftCount(d) {
  return d.added.length + d.removed.length + d.changed.length;
}

function largest(files) {
  let best = null;
  for (const [file, info] of Object.entries(files)) {
    if (!best || info.loc > best.loc) best = { file, loc: info.loc };
  }
  return best;
}

function autoBlock(now) {
  const all = totals(now.files);
  const lines = [
    MARK_START,
    '- Синхронизировано: ' + stamp(new Date()) + ' (' + (now.branch || '—') + ' @ ' + (now.commit || '—') + ')',
    '- Файлов: ' + all.count + ' · строк: ' + fmt(all.loc),
  ];
  for (const item of CONFIG.modules) {
    const entries = Object.entries(now.files).filter(([file]) => file === item || file.startsWith(item + '/'));
    if (entries.length === 0) continue;
    let loc = 0;
    for (const [, info] of entries) loc += info.loc;
    lines.push('- ' + item + ' — ' + entries.length + ' файл(ов) · ' + fmt(loc) + ' строк');
  }
  const big = largest(now.files);
  if (big) {
    lines.push('- Крупнейший файл: ' + big.file + ' — ' + big.loc + ' строк' +
      (big.loc > CONFIG.maxLoc ? ' · лимит ' + CONFIG.maxLoc + ' превышен' : ' · в пределах лимита'));
  }
  lines.push(MARK_END);
  return lines.join('\n');
}

function replaceAutoBlock(block) {
  const content = fs.readFileSync(SKILL_MD, 'utf8');
  const start = content.indexOf(MARK_START);
  const end = content.indexOf(MARK_END);
  if (start < 0 || end < 0 || end < start) {
    throw new Error('В SKILL.md нет маркеров ' + MARK_START + ' ... ' + MARK_END);
  }
  fs.writeFileSync(SKILL_MD, content.slice(0, start) + block + content.slice(end + MARK_END.length), 'utf8');
}

function appendChangelog(entry) {
  if (!fs.existsSync(CHANGELOG)) {
    fs.writeFileSync(CHANGELOG, '# Журнал изменений «' + CONFIG.title + '»\n\nAppend-only. Пишет track.cjs --update "<note>".\n', 'utf8');
  }
  fs.appendFileSync(CHANGELOG, '\n- ' + entry + '\n', 'utf8');
}

function listLines(title, items) {
  if (items.length === 0) return;
  console.log(title + ' (' + items.length + '):');
  for (const item of items.slice(0, 12)) console.log('  ' + item);
  if (items.length > 12) console.log('  … и ещё ' + (items.length - 12));
}

function cmdCheck() {
  const now = collect();
  const prev = readState();
  if (!prev) {
    console.error('[TRACK] baseline отсутствует: node ' + rel(__filename) + ' --update "baseline"');
    process.exit(1);
  }
  const d = diff(prev, now);
  if (driftCount(d) === 0) {
    console.log('[TRACK][OK] База не менялась с ' + stamp(new Date(prev.syncedAt)) + ' (' + (prev.commit || '—') + ').');
    return;
  }
  console.log('[TRACK] Дрейф с ' + stamp(new Date(prev.syncedAt)) + ' (' + (prev.commit || '—') + '):');
  listLines('  + новые', d.added);
  listLines('  ~ изменены', d.changed);
  listLines('  - удалены', d.removed);
  console.log('→ Обновить контракт и выполнить: node ' + rel(__filename) + ' --update "<что изменилось>"');
  process.exit(1);
}

function cmdReport() {
  const now = collect();
  const all = totals(now.files);
  console.log('[TRACK REPORT] ' + stamp(new Date()) + ' · ' + (now.branch || '—') + ' @ ' + (now.commit || '—'));
  console.log('Файлов: ' + all.count + ' · строк: ' + fmt(all.loc));
  for (const item of CONFIG.modules) {
    const entries = Object.entries(now.files).filter(([file]) => file === item || file.startsWith(item + '/'));
    console.log('\n' + item + ' — ' + entries.length + ' файл(ов)');
    for (const [file, info] of entries) console.log('  ' + String(info.loc).padStart(4) + '  ' + file);
  }
  const big = largest(now.files);
  if (big) console.log('\nКрупнейший: ' + big.file + ' — ' + big.loc + ' строк');
}

function cmdAudit(strict) {
  const now = collect();
  const errors = [];
  const warnings = [];
  let hasBarrels = false;

  for (const [file, info] of Object.entries(now.files)) {
    if (info.loc > CONFIG.maxLoc) warnings.push(file + ':' + info.loc + ' → превышен лимит ' + CONFIG.maxLoc + ' строк');
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    content.split('\n').forEach((line, index) => {
      if (/(^|\s)(TODO|FIXME|HACK)(\s|:|$)/.test(line)) {
        errors.push(file + ':' + (index + 1) + ' → маркер TODO/FIXME/HACK в коде');
      }
    });
  }

  for (const item of CONFIG.modules) {
    if (!fs.existsSync(path.join(ROOT, item))) continue;
    if (!fs.statSync(path.join(ROOT, item)).isDirectory()) continue;
    if (!item.startsWith('src/')) continue;
    hasBarrels = true;
    if (!fs.existsSync(path.join(ROOT, item, 'index.ts'))) {
      errors.push(item + ' → нет публичного index.ts');
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('[TRACK AUDIT][OK] Инварианты соблюдены: ' + Object.keys(now.files).length + ' файлов' +
      (hasBarrels ? ', барьели на месте' : '') + '.');
    return;
  }
  if (errors.length > 0) {
    console.log('[TRACK AUDIT] Ошибки (' + errors.length + '):');
    errors.forEach((item) => console.log('  [x] ' + item));
  }
  if (warnings.length > 0) {
    console.log('[TRACK AUDIT] Предупреждения (' + warnings.length + '):');
    warnings.forEach((item) => console.log('  [!] ' + item));
  }
  if (errors.length > 0 || (strict && warnings.length > 0)) process.exit(1);
}

function cmdUpdate(note) {
  const now = collect();
  const prev = readState();
  const d = diff(prev, now);
  const all = totals(now.files);
  writeState({
    version: 1,
    name: CONFIG.name,
    marker: CONFIG.marker,
    syncedAt: new Date().toISOString(),
    note: note || '',
    commit: now.commit,
    branch: now.branch,
    modules: CONFIG.modules,
    files: now.files,
  });
  replaceAutoBlock(autoBlock(now));
  appendChangelog(stamp(new Date()) + ' (' + (now.branch || '—') + ' @ ' + (now.commit || '—') + ') — ' +
    (note || 'фиксация состояния') + '; файлы: +' + d.added.length + '/-' + d.removed.length + '/~' + d.changed.length +
    '; всего ' + all.count + ' файлов, ' + all.loc + ' строк');
  console.log('[TRACK][UPDATED] ' + all.count + ' файлов, ' + all.loc + ' строк · state/AUTO/CHANGELOG обновлены.');
}

function usage() {
  console.log('Использование:');
  console.log('  node ' + rel(__filename) + '                 # дрейф относительно baseline (exit 1 при дрейфе)');
  console.log('  node ' + rel(__filename) + ' --report        # инвентарь базы');
  console.log('  node ' + rel(__filename) + ' --audit [--strict]');
  console.log('  node ' + rel(__filename) + ' --update "<что изменилось>"');
}

function main() {
  const args = process.argv.slice(2);
  const flags = args.filter((arg) => arg.startsWith('--'));
  const words = args.filter((arg) => !arg.startsWith('--'));
  if (flags.includes('--help') || flags.includes('-h')) return usage();
  if (flags.includes('--update')) return cmdUpdate(words.join(' ').trim());
  if (flags.includes('--report')) return cmdReport();
  if (flags.includes('--audit')) return cmdAudit(flags.includes('--strict'));
  return cmdCheck();
}

main();

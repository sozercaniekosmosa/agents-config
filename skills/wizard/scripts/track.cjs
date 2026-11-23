#!/usr/bin/env node
'use strict';

// Отслеживание модуля «Мастер карточки»: baseline, дрейф, инвентарь, аудит инвариантов.
// Пишет только собственные файлы навыка: state/state.json, AUTO-блок SKILL.md, CHANGELOG.md.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SKILL = path.join(ROOT, '.agents', 'skills', 'wizard');
const STATE = path.join(SKILL, 'state', 'state.json');
const SKILL_MD = path.join(SKILL, 'SKILL.md');
const CHANGELOG = path.join(SKILL, 'CHANGELOG.md');

const MODULES = [
  'src/shared/cardWizard',
  'src/ai/cardWizard',
  'src/store/cardWizard',
  'src/components/tree/card-wizard',
  'scripts/wizard-golden',
];
const EXTRA = ['src/db/cardWizard.ts'];
const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.cjs']);
const MAX_LOC = 500;
const MARK_START = '<!-- AUTO:WIZARD:START -->';
const MARK_END = '<!-- AUTO:WIZARD:END -->';

// Запрещённые направления импортов внутри слоёв (листовое правило и обратные связи).
const LAYER_RULES = [
  { dir: 'src/shared/cardWizard', forbidden: ['@/ai', '@/store', '@/db', '@/fs', '@/components'] },
  { dir: 'src/ai/cardWizard', forbidden: ['@/components', '@/store'] },
  { dir: 'src/store/cardWizard', forbidden: ['@/components'] },
  { dir: 'src/components/tree/card-wizard', forbidden: ['@/db'] },
];

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
  const text = buf.toString('utf8');
  const loc = text.replace(/\n$/, '').split('\n').length;
  return { hash: crypto.createHash('sha1').update(buf).digest('hex').slice(0, 12), loc };
}

function git(args) {
  try {
    return execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function collectSuites() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const suites = {};
  for (const key of Object.keys(pkg.scripts || {}).sort()) {
    if (key.startsWith('wizard:')) suites[key] = pkg.scripts[key];
  }
  return suites;
}

// Идентификаторы профилей: строка id: '...' в profiles/*.ts.
function collectProfiles() {
  const dir = path.join(ROOT, 'src', 'shared', 'cardWizard', 'profiles');
  const ids = [];
  for (const file of fs.readdirSync(dir).sort()) {
    if (!file.endsWith('.ts') || file === 'index.ts') continue;
    const content = fs.readFileSync(path.join(dir, file), 'utf8');
    const match = /^\s{2}id:\s*'([^']+)'/m.exec(content);
    // Фабрика профилей и общие модули не объявляют статический id — это не профиль.
    if (match) ids.push(match[1]);
  }
  return ids;
}

function collect() {
  const files = {};
  for (const moduleDir of MODULES) {
    const abs = path.join(ROOT, moduleDir);
    if (!fs.existsSync(abs)) continue;
    for (const file of walk(abs)) files[rel(file)] = meta(file);
  }
  for (const extra of EXTRA) {
    const abs = path.join(ROOT, extra);
    if (fs.existsSync(abs)) files[extra] = meta(abs);
  }
  const sorted = {};
  for (const key of Object.keys(files).sort()) sorted[key] = files[key];
  return {
    files: sorted,
    profiles: collectProfiles(),
    suites: collectSuites(),
    commit: git(['rev-parse', '--short', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
  };
}

function readState() {
  if (!fs.existsSync(STATE)) return null;
  return JSON.parse(fs.readFileSync(STATE, 'utf8'));
}

function writeState(state) {
  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

function fmt(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function stamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + '.' + date.getFullYear() +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
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
  const suitesChanged = JSON.stringify((prev && prev.suites) || {}) !== JSON.stringify(now.suites);
  const profilesChanged = JSON.stringify((prev && prev.profiles) || []) !== JSON.stringify(now.profiles);
  return { added, removed, changed, suitesChanged, profilesChanged };
}

function driftCount(d) {
  return d.added.length + d.removed.length + d.changed.length + (d.suitesChanged ? 1 : 0) + (d.profilesChanged ? 1 : 0);
}

function totals(files) {
  let loc = 0;
  for (const info of Object.values(files)) loc += info.loc;
  return { count: Object.keys(files).length, loc };
}

function moduleStats(files) {
  const rows = [];
  for (const moduleDir of MODULES) {
    const list = Object.entries(files).filter(([file]) => file.startsWith(moduleDir + '/'));
    if (list.length === 0) continue;
    let loc = 0;
    for (const [, info] of list) loc += info.loc;
    rows.push({ name: moduleDir, count: list.length, loc });
  }
  const extra = EXTRA.filter((file) => files[file]);
  if (extra.length > 0) {
    rows.push({ name: 'src/db (сессия)', count: extra.length, loc: extra.reduce((sum, file) => sum + files[file].loc, 0) });
  }
  return rows;
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
  const rows = moduleStats(now.files);
  const big = largest(now.files);
  const lines = [];
  lines.push(MARK_START);
  lines.push('- Синхронизировано: ' + stamp(new Date()) + ' (' + (now.branch || '—') + ' @ ' + (now.commit || '—') + ')');
  lines.push('- Файлов: ' + all.count + ' · строк: ' + fmt(all.loc));
  for (const row of rows) lines.push('- ' + row.name + ' — ' + row.count + ' файл(ов) · ' + fmt(row.loc) + ' строк');
  lines.push('- Профили: ' + (now.profiles.join(', ') || '—'));
  lines.push('- Наборы: ' + (Object.keys(now.suites).join(', ') || '—'));
  if (big) {
    const flag = big.loc > MAX_LOC ? ' · лимит ' + MAX_LOC + ' превышен' : ' · в пределах лимита';
    lines.push('- Крупнейший файл: ' + big.file + ' — ' + big.loc + ' строк' + flag);
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
  const next = content.slice(0, start) + block + content.slice(end + MARK_END.length);
  fs.writeFileSync(SKILL_MD, next, 'utf8');
}

function appendChangelog(entry) {
  if (!fs.existsSync(CHANGELOG)) {
    fs.writeFileSync(
      CHANGELOG,
      '# Журнал изменений «Мастера карточки»\n\nAppend-only. Пишет node .agents/skills/wizard/scripts/track.cjs --update "<note>".\n',
      'utf8',
    );
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
    console.error('[WIZARD] baseline отсутствует: выполните');
    console.error('  node .agents/skills/wizard/scripts/track.cjs --update "baseline"');
    process.exit(1);
  }
  const d = diff(prev, now);
  if (driftCount(d) === 0) {
    console.log('[WIZARD][OK] Мастер не менялся с ' + stamp(new Date(prev.syncedAt)) + ' (' + (prev.commit || '—') + ').');
    return;
  }
  console.log('[WIZARD] Дрейф с ' + stamp(new Date(prev.syncedAt)) + ' (' + (prev.commit || '—') + '):');
  listLines('  + новые', d.added);
  listLines('  ~ изменены', d.changed);
  listLines('  - удалены', d.removed);
  if (d.suitesChanged) console.log('  ~ наборы wizard:* изменились');
  if (d.profilesChanged) console.log('  ~ список профилей изменился');
  console.log('→ Проверьте git diff по путям Мастера, при смене контракта обновите references/contracts.md,');
  console.log('  затем: node .agents/skills/wizard/scripts/track.cjs --update "<что изменилось>"');
  process.exit(1);
}

function cmdReport() {
  const now = collect();
  const all = totals(now.files);
  console.log('[WIZARD REPORT] ' + stamp(new Date()) + ' · ' + (now.branch || '—') + ' @ ' + (now.commit || '—'));
  console.log('Файлов: ' + all.count + ' · строк: ' + fmt(all.loc));
  console.log('Профили: ' + (now.profiles.join(', ') || '—'));
  console.log('Наборы: ' + Object.keys(now.suites).join(', '));
  for (const row of moduleStats(now.files)) {
    console.log('\n' + row.name + ' — ' + row.count + ' файл(ов), ' + fmt(row.loc) + ' строк');
    for (const [file, info] of Object.entries(now.files)) {
      const belongs = row.name === 'src/db (сессия)' ? file === EXTRA[0] : file.startsWith(row.name + '/');
      if (!belongs) continue;
      console.log('  ' + String(info.loc).padStart(4) + '  ' + file);
    }
  }
  const big = largest(now.files);
  const warnings = Object.entries(now.files).filter(([, info]) => info.loc > MAX_LOC);
  console.log('\nКрупнейший: ' + big.file + ' — ' + big.loc + ' строк');
  if (warnings.length > 0) console.log('⚠ Лимит ' + MAX_LOC + ' превышен: ' + warnings.map(([file]) => file).join(', '));
}

function cmdAudit(strict) {
  const now = collect();
  const errors = [];
  const warnings = [];

  for (const [file, info] of Object.entries(now.files)) {
    if (info.loc > MAX_LOC) warnings.push(file + ':' + info.loc + ' → превышен лимит ' + MAX_LOC + ' строк');
    const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (/(^|\s)(TODO|FIXME|HACK)(\s|:|$)/.test(line)) {
        errors.push(file + ':' + (index + 1) + ' → маркер TODO/FIXME/HACK в коде');
      }
      const imports = /from\s+'(@\/[a-z-]+)/.exec(line);
      if (!imports) return;
      const rule = LAYER_RULES.find((item) => file.startsWith(item.dir + '/'));
      if (rule && rule.forbidden.includes(imports[1])) {
        errors.push(file + ':' + (index + 1) + ' → запрещённый импорт ' + imports[1] + ' (слои: components → store → ai/fs → db → shared)');
      }
    });
  }

  // Баррель обязателен только для src-модулей; scripts/wizard-golden — набор проверок, не модуль.
  for (const moduleDir of MODULES) {
    if (moduleDir.startsWith('scripts/')) continue;
    if (!fs.existsSync(path.join(ROOT, moduleDir, 'index.ts'))) errors.push(moduleDir + ' → нет публичного index.ts');
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('[WIZARD AUDIT][OK] Инварианты соблюдены: ' + Object.keys(now.files).length + ' файлов проверено.');
    return;
  }
  if (errors.length > 0) {
    console.log('[WIZARD AUDIT] Ошибки (' + errors.length + '):');
    errors.forEach((item) => console.log('  [x] ' + item));
  }
  if (warnings.length > 0) {
    console.log('[WIZARD AUDIT] Предупреждения (' + warnings.length + '):');
    warnings.forEach((item) => console.log('  [!] ' + item));
  }
  if (errors.length > 0 || (strict && warnings.length > 0)) process.exit(1);
}

function cmdUpdate(note) {
  const now = collect();
  const prev = readState();
  const d = diff(prev, now);
  const all = totals(now.files);
  const state = {
    version: 1,
    syncedAt: new Date().toISOString(),
    note: note || '',
    commit: now.commit,
    branch: now.branch,
    profiles: now.profiles,
    suites: now.suites,
    files: now.files,
  };
  writeState(state);
  replaceAutoBlock(autoBlock(now));
  const summary = note || 'фиксация состояния';
  const cleanNote = summary.replace(/[.;]+$/, '');
  appendChangelog(
    stamp(new Date()) + ' (' + (now.branch || '—') + ' @ ' + (now.commit || '—') + ') — ' + cleanNote +
    '; файлы: +' + d.added.length + '/-' + d.removed.length + '/~' + d.changed.length +
    (d.suitesChanged ? '/~suites' : '') + (d.profilesChanged ? '/~profiles' : '') +
    '; всего ' + all.count + ' файлов, ' + all.loc + ' строк',
  );
  console.log('[WIZARD][UPDATED] ' + (now.branch || '—') + ' @ ' + (now.commit || '—') + ' · ' + all.count + ' файлов, ' + all.loc + ' строк');
  console.log('Записано: state/state.json, AUTO-блок SKILL.md, CHANGELOG.md (' + summary + ').');
}

function usage() {
  console.log('Использование:');
  console.log('  node .agents/skills/wizard/scripts/track.cjs                 # дрейф с baseline (по умолчанию --check)');
  console.log('  node .agents/skills/wizard/scripts/track.cjs --check         # то же; exit 1 при дрейфе');
  console.log('  node .agents/skills/wizard/scripts/track.cjs --report        # инвентарь модуля');
  console.log('  node .agents/skills/wizard/scripts/track.cjs --audit [--strict]');
  console.log('  node .agents/skills/wizard/scripts/track.cjs --update "<что изменилось>"');
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

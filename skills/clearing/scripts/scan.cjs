#!/usr/bin/env node
'use strict';

// Инвентарь и классификация дерева проекта. Read-only: ничего не удаляет и не пишет.
// Контракт режимов: references/contracts.md §4.

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');

const POLICY = {
  protected: ['.tmp', '.trash', '.storage', 'node_modules'],
  known: [
    { p: 'dist', cls: 'R', why: 'сборка Vite', restore: 'npm run build' },
    { p: 'tsconfig.tsbuildinfo', cls: 'R', why: 'кэш инкрементальной сборки', restore: 'появляется при tsc -b' },
    { p: '.dsh-tmp', cls: 'C', why: 'кэш пакетного менеджера агента и дампы CLI', restore: 'создаётся заново' },
    { p: '.agents/.cache', cls: 'C', why: 'телеметрия observer и pre-pull бэкапы', restore: 'создаётся заново' },
    { p: 'prototypes', cls: 'D', why: 'одноразовые прототипы', restore: 'нет' },
    { p: '.tmp', cls: 'D', why: 'черновики, планы и очереди задач', restore: 'нет' },
    { p: '.storage', cls: 'D', why: 'бэкапы базы проекта', restore: 'нет' },
    { p: '.trash', cls: 'D', why: 'карантин бэкапов и замещённых версий', restore: 'нет' },
  ],
  entries: ['src/main.tsx'],
  scope: ['src'],
  genericStems: ['index', 'main', 'mod', 'types', 'utils'],
  ext: ['.ts', '.tsx'],
  skip: ['node_modules', '.git', '.storage', '.tmp', '.trash', 'dist'],
  textExt: ['.md', '.ts', '.tsx', '.json', '.cjs', '.mjs', '.js', '.html', '.css', '.txt', '.yml', '.yaml', '.sql'],
  suspicious: /(?:^|[._-])(?:copy|backup|bak|old|orig|deprecated|unused)(?:[._-]|$)|\.(?:log|tmp|temp|orig|bak)$|~$/i,
  maxFileBytes: 2 * 1024 * 1024,
};

const flags = { mode: 'inventory', json: false, strict: false, target: '' };
for (let i = 0; i < process.argv.length - 2; i += 1) {
  const arg = process.argv.slice(2)[i];
  if (arg === '--json') flags.json = true;
  else if (arg === '--strict') flags.strict = true;
  else if (arg === '--inventory') flags.mode = 'inventory';
  else if (arg === '--graph') flags.mode = 'graph';
  else if (arg === '--refs') { flags.mode = 'refs'; flags.target = process.argv.slice(2)[i + 1] || ''; }
  else if (arg === '--help' || arg === '-h') flags.mode = 'help';
  else if (!arg.startsWith('--')) flags.target = arg;
}

const norm = (p) => p.replace(/\\/g, '/');
const rel = (p) => norm(path.relative(ROOT, p)) || '.';
const skipped = (name) => POLICY.skip.includes(name);

function walk(abs, visit) {
  const stack = [abs];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        if (skipped(entry.name)) continue;
        visit(full, entry);
        stack.push(full);
      } else if (entry.isFile()) {
        visit(full, entry);
      }
    }
  }
}

function stats(abs) {
  let size = 0;
  let files = 0;
  const stack = [abs];
  while (stack.length > 0) {
    const cur = stack.pop();
    let entries;
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) {
        try { size += fs.statSync(full).size; files += 1; } catch { /* недоступный узел пропускаем */ }
      }
    }
  }
  return { size, files };
}

function classOf(p) {
  let best = null;
  for (const item of POLICY.known) {
    if (p === item.p || p.startsWith(item.p + '/')) {
      if (!best || item.p.length > best.p.length) best = item;
    }
  }
  return best;
}

const isProtected = (p) => POLICY.protected.some((item) => p === item || p.startsWith(item + '/'));

function inventory() {
  const rows = [];
  let entries;
  try { entries = fs.readdirSync(ROOT, { withFileTypes: true }); } catch { entries = []; }
  for (const entry of entries) {
    const abs = path.join(ROOT, entry.name);
    const p = rel(abs);
    const cls = classOf(p);
    let size = 0;
    let files = 1;
    if (entry.isDirectory()) {
      const counted = stats(abs);
      size = counted.size;
      files = counted.files;
    } else {
      try { size = fs.statSync(abs).size; } catch { size = 0; }
    }
    const guard = isProtected(p);
    rows.push({
      path: p,
      kind: entry.isDirectory() ? 'dir' : 'file',
      size,
      files,
      cls: guard ? 'D*' : (cls ? cls.cls : 'P'),
      why: guard ? 'защищённый набор: не удаляется' : (cls ? cls.why : 'содержимое проекта: не трогать в рамках очистки'),
      restore: cls ? cls.restore : '—',
      protected: guard,
    });
  }
  rows.sort((a, b) => b.size - a.size);

  const emptyDirs = [];
  walk(ROOT, (full, entry) => {
    if (!entry.isDirectory()) return;
    try { if (fs.readdirSync(full).length === 0) emptyDirs.push(rel(full)); } catch { /* пропускаем */ }
  });
  emptyDirs.sort();

  const suspicious = [];
  walk(ROOT, (full, entry) => {
    if (!POLICY.suspicious.test(path.basename(full))) return;
    let size = 0;
    try { size = entry.isDirectory() ? stats(full).size : fs.statSync(full).size; } catch { size = 0; }
    suspicious.push({ path: rel(full), size });
  });
  suspicious.sort((a, b) => b.size - a.size);

  const total = rows.reduce((sum, row) => sum + row.size, 0);
  const guarded = rows.filter((row) => row.protected).reduce((sum, row) => sum + row.size, 0);
  return { root: rel(ROOT), rows, emptyDirs, suspicious, totals: { total, guarded, rest: total - guarded } };
}

function sources() {
  const set = new Set();
  for (const area of POLICY.scope) {
    const abs = path.join(ROOT, area);
    if (!fs.existsSync(abs)) continue;
    walk(abs, (full) => {
      if (POLICY.ext.includes(path.extname(full))) set.add(path.resolve(full));
    });
  }
  return set;
}

function specTarget(from, spec, set) {
  let base;
  if (spec.startsWith('@/')) base = path.join(ROOT, 'src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.resolve(path.dirname(from), spec);
  else return null;
  const suffixes = ['', ...POLICY.ext, '/index.ts', '/index.tsx'];
  for (const suffix of suffixes) {
    const candidate = path.resolve(base + suffix);
    if (set.has(candidate)) return candidate;
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch { /* недоступный узел пропускаем */ }
  }
  return null;
}

function graph() {
  const set = sources();
  const roots = POLICY.entries.map((item) => path.resolve(ROOT, item)).filter((item) => set.has(item));
  const pattern = /(?:import|export)[^;]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  const edges = new Map();
  for (const file of set) {
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const deps = new Set();
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec) continue;
      const resolved = specTarget(file, spec, set);
      if (resolved) deps.add(resolved);
    }
    edges.set(file, [...deps]);
  }
  const seen = new Set();
  const stack = [...roots];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of edges.get(cur) ?? []) if (!seen.has(next)) stack.push(next);
  }
  const unreachable = [...set]
    .filter((file) => !seen.has(file) && !file.endsWith('.d.ts'))
    .map((file) => rel(file))
    .sort();
  return { roots: roots.map((item) => rel(item)), total: set.size, reachable: seen.size, unreachable };
}

function refsOf(target) {
  const abs = path.resolve(ROOT, target);
  if (!fs.existsSync(abs)) throw new Error('путь не найден: ' + target);
  const base = path.basename(abs);
  const stem = base.replace(/\.[^.]+$/, '');
  const generic = POLICY.genericStems.includes(stem.toLowerCase());
  const needles = [base, generic ? '' : stem].filter((item, index, list) => item && item.length > 2 && list.indexOf(item) === index);
  const hits = [];
  walk(ROOT, (full, entry) => {
    if (!entry.isFile()) return;
    if (path.resolve(full) === path.resolve(abs)) return;
    if (!POLICY.textExt.includes(path.extname(full).toLowerCase())) return;
    let text;
    try {
      if (fs.statSync(full).size > POLICY.maxFileBytes) return;
      text = fs.readFileSync(full, 'utf8');
    } catch { return; }
    let count = 0;
    for (const needle of needles) {
      const found = text.split(needle).length - 1;
      if (found > count) count = found;
    }
    if (count > 0) hits.push({ path: rel(full), count });
  });
  hits.sort((a, b) => b.count - a.count || a.path.localeCompare(b.path));
  return { target: rel(abs), needles, hits };
}

function bytes(value) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let rest = value;
  let index = 0;
  while (rest >= 1024 && index < units.length - 1) { rest /= 1024; index += 1; }
  return (index === 0 ? String(rest) : rest.toFixed(1)) + ' ' + units[index];
}

function printInventory(result) {
  console.log('[CLEARING] инвентарь: ' + result.root);
  console.log('  класс  размер        файлы  путь');
  for (const row of result.rows) {
    console.log('  ' + row.cls.padEnd(6) + ' ' + bytes(row.size).padStart(11) + ' ' + String(row.files).padStart(6) + '  ' + row.path + (row.why ? '  — ' + row.why : ''));
  }
  console.log('  итог: ' + bytes(result.totals.total) + ' · защищённый набор ' + bytes(result.totals.guarded) + ' · остальное ' + bytes(result.totals.rest));
  console.log('  пустых каталогов: ' + result.emptyDirs.length);
  for (const item of result.emptyDirs.slice(0, 20)) console.log('    - ' + item);
  console.log('  подозрительные имена: ' + result.suspicious.length);
  for (const item of result.suspicious.slice(0, 15)) console.log('    - ' + bytes(item.size).padStart(10) + '  ' + item.path);
  console.log('  классы: R воспроизводимое · C инструментальный кэш · D данные (эскалация) · P содержимое проекта · D* защищено');
}

function main() {
  if (flags.mode === 'help') {
    console.log('scan.cjs [--inventory|--graph|--refs <path>] [--json] [--strict]');
    console.log('  read-only инвентарь дерева; контракт: references/contracts.md §4');
    return 0;
  }
  if (flags.mode === 'graph') {
    const result = graph();
    if (flags.json) { console.log(JSON.stringify(result, null, 2)); return 0; }
    console.log('[CLEARING] граф импортов: корни ' + result.roots.join(', '));
    console.log('  модулей: ' + result.total + ' · достижимо: ' + result.reachable + ' · недостижимо: ' + result.unreachable.length);
    for (const item of result.unreachable) console.log('    - ' + item);
    return 0;
  }
  if (flags.mode === 'refs') {
    if (!flags.target) throw new Error('--refs требует путь');
    const result = refsOf(flags.target);
    if (flags.json) { console.log(JSON.stringify(result, null, 2)); return 0; }
    console.log('[CLEARING] упоминания «' + result.target + '» (иглы: ' + result.needles.join(', ') + ')');
    console.log('  найдено файлов: ' + result.hits.length);
    for (const item of result.hits.slice(0, 25)) console.log('    ' + String(item.count).padStart(4) + '×  ' + item.path);
    if (result.hits.length === 0) console.log('    упоминаний нет — кандидат в сироты, решение по классу обратимости');
    return 0;
  }
  const result = inventory();
  if (flags.json) { console.log(JSON.stringify(result, null, 2)); return 0; }
  printInventory(result);
  if (flags.strict && (result.emptyDirs.length > 0 || result.suspicious.length > 0)) {
    console.log('[CLEARING][STRICT] находки есть: ' + (result.emptyDirs.length + result.suspicious.length));
    return 1;
  }
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error('[CLEARING][FAIL] ' + error.message);
  process.exitCode = 1;
}

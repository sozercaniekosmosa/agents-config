#!/usr/bin/env node
/**
 * Advisory-сканер клиентского перформанса React (внутри навыка).
 *
 * Read-only: не меняет файлы, не ставит зависимости, не обращается к сети.
 * Реализует высоконадёжное подмножество чек-листа
 * references/checklist.md; полный аудит (16 маркеров) выполняет /check.
 *
 * Запуск из корня проекта:
 *   node .agents/skills/react-best-practices/scripts/check-perf.cjs --staged
 *   node .agents/skills/react-best-practices/scripts/check-perf.cjs --src src
 *   node .agents/skills/react-best-practices/scripts/check-perf.cjs --strict
 *   node .agents/skills/react-best-practices/scripts/check-perf.cjs --json
 */

'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'generated', 'mocks', '__mocks__', '.git']);
const SKIP_FILE = /\.(test|spec)\.(ts|tsx)$/;
const HEAVY_IMPORTS = ['chart.js', '@maxgraph/core', '@willykit-ui/table', '@willykit-ui/treeview'];
const opts = { staged: false, src: 'src', strict: false, json: false, limit: 50 };

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--staged') opts.staged = true;
  else if (arg === '--strict') opts.strict = true;
  else if (arg === '--json') opts.json = true;
  else if (arg === '--src') opts.src = process.argv[++i] || 'src';
  else if (arg === '--limit') opts.limit = Number(process.argv[++i]) || 50;
  else if (arg === '--help' || arg === '-h') {
    console.log('Usage: node check-perf.cjs [--staged] [--src <dir>] [--strict] [--json] [--limit <n>]');
    process.exit(0);
  } else {
    console.error('[perf] неизвестный аргумент: ' + arg);
    process.exit(2);
  }
}

/** Staged-файлы проекта, ограниченные каталогом src. */
function stagedFiles() {
  const out = execFileSync('git', ['-C', PROJECT_ROOT, 'diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' });
  return out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    .filter((f) => /\.(ts|tsx)$/.test(f) && f.split('/')[0] === opts.src && !SKIP_FILE.test(f));
}

/** Рекурсивный сбор .ts/.tsx. */
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !SKIP_FILE.test(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

/** Type-only импорт не попадает в рантайм-бандл. */
function isTypeOnlyImport(line) {
  if (/^\s*import\s+type\b/.test(line)) return true;
  const m = line.match(/^\s*import\s*\{([^}]*)\}/);
  if (!m) return false;
  const parts = m[1].split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => /^type\s/.test(p));
}

/** Только высоконадёжные маркеры, чтобы не шуметь ложными срабатываниями. */
const checks = [
  {
    id: 'lazy-without-suspense',
    hint: 'lazy-компонент без Suspense fallback',
    run(lines, text, file) {
      if (!/\.tsx$/.test(file)) return [];
      if (!/\blazy\s*\(/.test(text)) return [];
      if (/<Suspense\b/.test(text)) return [];
      return lines.map((line, i) => (/\blazy\s*\(/.test(line) ? i + 1 : 0)).filter(Boolean);
    },
  },
  {
    id: 'non-passive-listener',
    hint: 'touch/wheel listener без passive: true',
    run(lines) {
      const hits = [];
      lines.forEach((line, i) => {
        if (/addEventListener\(\s*['"](wheel|touchstart|touchmove)['"]/.test(line) && !/passive\s*:/.test(line)) hits.push(i + 1);
      });
      return hits;
    },
  },
  {
    id: 'non-lazy-state-init',
    hint: 'дорогая инициализация useState → ленивый инициализатор',
    run(lines) {
      const hits = [];
      lines.forEach((line, i) => {
        if (/useState\(\s*(JSON\.parse\(|new (?:Map|Set)(?:<[^>]*>)?\(\s*[\[\{]|localStorage\.|sessionStorage\.)/.test(line)) hits.push(i + 1);
      });
      return hits;
    },
  },
  {
    id: 'heavy-import-in-entry',
    hint: 'тяжёлая библиотека статически импортирована в точку входа → React.lazy',
    run(lines, text, file) {
      if (!/^(src\/app|src\/pages)\//.test(file)) return [];
      if (/\blazy\s*\(/.test(text)) return [];
      const hits = [];
      lines.forEach((line, i) => {
        if (isTypeOnlyImport(line)) return;
        const m = line.match(/^\s*import\s.+from\s+['"]([^'"]+)['"]/);
        if (m && HEAVY_IMPORTS.some((dep) => m[1] === dep || m[1].startsWith(dep + '/'))) hits.push(i + 1);
      });
      return hits;
    },
  },
];

const files = opts.staged ? stagedFiles() : walk(path.join(PROJECT_ROOT, opts.src));
const markers = [];
for (const rel of files) {
  const abs = path.isAbsolute(rel) ? rel : path.join(PROJECT_ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const text = fs.readFileSync(abs, 'utf8');
  const lines = text.split(/\r?\n/);
  const display = path.relative(PROJECT_ROOT, abs).split(path.sep).join('/');
  for (const check of checks) {
    for (const line of check.run(lines, text, display)) markers.push({ file: display, line, id: check.id, hint: check.hint });
  }
}

const shown = markers.slice(0, opts.limit);
if (opts.json) {
  console.log(JSON.stringify({ scanned: files.length, markers }, null, 2));
} else {
  console.log('[perf] React performance (advisory): маркеров ' + markers.length + ' в ' + files.length + ' файлах');
  for (const m of shown) console.log('  [!] ' + m.file + ':' + m.line + ' ' + m.id + ' — ' + m.hint);
  if (markers.length > shown.length) console.log('  ... ещё ' + (markers.length - shown.length) + ' (см. --json)');
  console.log('[perf] только предупреждения: без авто-фиксов.');
}

if (opts.strict && markers.length > 0) process.exit(1);
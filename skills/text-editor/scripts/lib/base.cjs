'use strict';

// Общая база движка самосинхронизации навыка: пути, чтение, хэши, обход базы.
// Никаких зависимостей: только node:fs, node:path, node:crypto.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const SKILL_DIR = path.join(__dirname, '..', '..');
const ROOT = path.resolve(SKILL_DIR, '..', '..', '..');
const STATE_DIR = path.join(SKILL_DIR, 'state');
const BASELINE = path.join(STATE_DIR, 'state.json');
const SELF_STATE = path.join(STATE_DIR, 'selfcheck.json');
const DEVIATIONS = path.join(STATE_DIR, 'deviations.json');
const SKILL_MD = path.join(SKILL_DIR, 'SKILL.md');
const CONTRACTS_MD = path.join(SKILL_DIR, 'references', 'contracts.md');
const CHANGELOG = path.join(SKILL_DIR, 'CHANGELOG.md');
const TRACKER = path.join(SKILL_DIR, 'scripts', 'track.cjs');
const SCHEMA_SQL = path.join(ROOT, 'src', 'db', 'schema.sql');

const CODE_EXT = ['.ts', '.tsx'];
const DEFAULT_MODULES = [
  'src/shared/document',
  'src/components/editor/document',
  'src/store/useDocumentStore.ts',
  'src/db/document.ts',
];

function rel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, 'utf8');
}

function sha(text) {
  return crypto.createHash('sha1').update(text).digest('hex');
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function stamp(date) {
  return pad(date.getDate()) + '.' + pad(date.getMonth() + 1) + '.' + date.getFullYear() +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

function fmt(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function modules() {
  const baseline = readJson(BASELINE, null);
  if (baseline && Array.isArray(baseline.modules) && baseline.modules.length > 0) return baseline.modules.slice();
  return DEFAULT_MODULES.slice();
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && CODE_EXT.includes(path.extname(entry.name))) out.push(full);
  }
}

function codeFiles() {
  const found = [];
  for (const item of modules()) {
    const abs = path.join(ROOT, item);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) walk(abs, found);
    else if (CODE_EXT.includes(path.extname(abs))) found.push(abs);
  }
  return found.map((abs) => ({ abs, path: rel(abs) })).sort((a, b) => a.path.localeCompare(b.path));
}

function locOf(text) {
  return text.replace(/\n$/, '').split('\n').length;
}

// Назначение файла — его шапка: подряд идущие строки комментария в начале.
function firstComment(text) {
  const out = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('//')) break;
    out.push(trimmed.replace(/^\/+\s?/, ''));
  }
  return out.join(' ').trim();
}

function layerOf(relPath) {
  if (relPath.startsWith('src/shared/')) return 'shared';
  if (relPath.startsWith('src/store/')) return 'store';
  if (relPath.startsWith('src/db/')) return 'db';
  if (relPath.startsWith('src/components/')) return 'components';
  return 'other';
}

function regionOf(text, name) {
  const start = '<!-- GEN:' + name + ':START -->';
  const end = '<!-- GEN:' + name + ':END -->';
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  if (from < 0 || to < 0 || to < from) return null;
  return { open: from, close: to, bodyStart: from + start.length, bodyEnd: to, body: text.slice(from + start.length, to) };
}

function applyRegion(text, name, body) {
  const region = regionOf(text, name);
  if (!region) return { text, status: 'missing' };
  const current = region.body.trim();
  const next = body.trim();
  if (current === next) return { text, status: 'same' };
  return {
    text: text.slice(0, region.open) +
      '<!-- GEN:' + name + ':START -->\n' + next + '\n' + text.slice(region.close),
    status: 'changed',
  };
}

module.exports = {
  CHANGELOG,
  CONTRACTS_MD,
  DEVIATIONS,
  DEFAULT_MODULES,
  ROOT,
  SCHEMA_SQL,
  SELF_STATE,
  SKILL_DIR,
  SKILL_MD,
  STATE_DIR,
  TRACKER,
  applyRegion,
  codeFiles,
  firstComment,
  fmt,
  layerOf,
  locOf,
  modules,
  readJson,
  readText,
  regionOf,
  rel,
  sha,
  stamp,
  writeJson,
  writeText,
};

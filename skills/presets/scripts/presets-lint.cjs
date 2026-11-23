#!/usr/bin/env node
'use strict';

// Линтер данных пресетов-заготовок: реестр, уникальность id/label, fieldId в каталоге полей,
// формат label и нейтральность подписей палитры для нежанровых наборов.
// Read-only по данным проекта; пишет только .tmp/presets-lint.cjs (сборка реестра esbuild).

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SKILL_DIR = path.join(__dirname, '..');
const ROOT = path.join(SKILL_DIR, '..', '..', '..');
const REGISTRY = path.join(ROOT, 'src', 'shared', 'templates', 'presets', 'index.ts');
const FIELD_DIR = path.join(ROOT, 'src', 'shared', 'templates', 'fields');
const PALETTE = path.join(ROOT, 'src', 'components', 'tree', 'section-card', 'SectionCardPresetPalette.tsx');
const TOOLBAR = path.join(ROOT, 'src', 'components', 'tree', 'section-card', 'SectionCardToolbar.tsx');
const TMP = path.join(ROOT, '.tmp', 'presets-lint.cjs');
const ESBUILD = path.join(ROOT, 'node_modules', 'esbuild', 'bin', 'esbuild');

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const GENRE_MARK = 'gen_genre';
const GENRE_LITERALS = ['Жанровые пресеты', 'выбрать жанры'];

const errors = [];
const warnings = [];

function rel(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function lineOf(file, needle) {
  if (!fs.existsSync(file)) return 0;
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const index = lines.findIndex((line) => line.includes(needle));
  return index < 0 ? 0 : index + 1;
}

function where(file, line) {
  return rel(file) + (line > 0 ? ':' + line : '');
}

function loadRegistry() {
  if (!fs.existsSync(REGISTRY)) throw new Error('нет реестра: ' + rel(REGISTRY));
  if (!fs.existsSync(ESBUILD)) throw new Error('нет esbuild: ' + rel(ESBUILD) + ' (npm install)');
  fs.mkdirSync(path.dirname(TMP), { recursive: true });
  execFileSync(process.execPath, [
    ESBUILD,
    REGISTRY,
    '--bundle',
    '--platform=node',
    '--format=cjs',
    '--log-level=warning',
    '--outfile=' + TMP,
  ], { cwd: ROOT, stdio: 'inherit' });
  return require(TMP);
}

function fieldCatalog() {
  const map = new Map();
  if (!fs.existsSync(FIELD_DIR)) return map;
  for (const name of fs.readdirSync(FIELD_DIR)) {
    if (!name.endsWith('.ts')) continue;
    const file = path.join(FIELD_DIR, name);
    const text = fs.readFileSync(file, 'utf8');
    const re = /id:\s*"([^"]+)"[\s\S]{0,240}?title:\s*"([^"]+)"/g;
    let match;
    while ((match = re.exec(text)) !== null) {
      if (!map.has(match[1])) map.set(match[1], { title: match[2], file });
    }
  }
  return map;
}

function checkPreset(collection, preset, index, ids, labels) {
  const at = 'набор «' + collection.fieldId + '» · пресет #' + (index + 1);
  if (!preset || typeof preset !== 'object') {
    errors.push(at + ' → не объект');
    return;
  }
  const id = typeof preset.id === 'string' ? preset.id.trim() : '';
  if (!id) errors.push(at + ' → пустой id');
  else if (!ID_RE.test(id)) errors.push(at + ' → id "' + id + '": нужен kebab-case a-z0-9-');
  else if (ids.has(id)) errors.push(at + ' → дубль id "' + id + '"');
  ids.add(id);

  const label = typeof preset.label === 'string' ? preset.label.trim() : '';
  if (!label) errors.push(at + ' [' + (id || '?') + '] → пустой label');
  if (label.includes(',')) errors.push(at + ' [' + (id || '?') + '] → запятая в label рвёт формат карточки');
  if (label) {
    const key = label.toLowerCase();
    if (labels.has(key)) errors.push(at + ' [' + (id || '?') + '] → дубль label "' + label + '"');
    labels.add(key);
  }

  if (typeof preset.value !== 'string' || preset.value.trim() === '') {
    errors.push(at + ' [' + (id || '?') + '] → пустой value (смысл заготовки)');
  }
  if (typeof preset.group !== 'string' || preset.group.trim() === '') {
    errors.push(at + ' [' + (id || '?') + '] → пустой group (раздел палитры)');
  }
  if (preset.description !== undefined && (typeof preset.description !== 'string' || preset.description.trim() === '')) {
    errors.push(at + ' [' + (id || '?') + '] → description задан пустым');
  }
  if (preset.tags !== undefined) {
    if (!Array.isArray(preset.tags)) errors.push(at + ' [' + (id || '?') + '] → tags не массив');
    else if (preset.tags.some((tag) => typeof tag !== 'string' || tag.trim() === '')) {
      errors.push(at + ' [' + (id || '?') + '] → пустой тег в tags');
    }
  }
}

function checkCollection(registry, collection, catalog) {
  const fieldId = typeof collection.fieldId === 'string' ? collection.fieldId.trim() : '';
  const fieldTitle = typeof collection.fieldTitle === 'string' ? collection.fieldTitle.trim() : '';
  if (!fieldId) {
    errors.push('реестр → набор без fieldId');
    return 0;
  }
  if (!fieldTitle) errors.push('набор «' + fieldId + '» → пустой fieldTitle');

  const field = catalog.get(fieldId);
  if (!field) errors.push('набор «' + fieldId + '» → поле нет в каталоге src/shared/templates/fields');
  else if (fieldTitle && field.title !== fieldTitle) {
    errors.push('набор «' + fieldId + '» → fieldTitle "' + fieldTitle + '" ≠ title каталога "' + field.title + '"');
  }

  const presets = collection.presets;
  if (!Array.isArray(presets) || presets.length === 0) {
    errors.push('набор «' + fieldId + '» → пустой presets');
    return 0;
  }

  const ids = new Set();
  const labels = new Set();
  presets.forEach((preset, index) => checkPreset(collection, preset, index, ids, labels));

  const byId = registry.resolveCardPresets({ id: fieldId + '_probe' });
  const byTitle = registry.resolveCardPresets({ title: fieldTitle });
  if (byId.length !== presets.length) {
    errors.push('resolveCardPresets({id:"' + fieldId + '_probe"}) → ' + byId.length + ' вместо ' + presets.length);
  }
  if (fieldTitle && byTitle.length !== presets.length) {
    errors.push('resolveCardPresets({title:"' + fieldTitle + '"}) → ' + byTitle.length + ' вместо ' + presets.length);
  }
  if (fieldId === GENRE_MARK) {
    const groups = new Set(presets.map((preset) => preset.group));
    if (groups.size < 2) warnings.push('набор «' + fieldId + '» → одна группа: палитра не делится на разделы');
  }
  return presets.length;
}

function checkLabels(collections) {
  const nonGenre = collections.filter((item) => item.fieldId !== GENRE_MARK);
  if (nonGenre.length === 0) return;
  for (const file of [PALETTE, TOOLBAR]) {
    for (const literal of GENRE_LITERALS) {
      const line = lineOf(file, literal);
      if (line > 0) {
        errors.push(where(file, line) + ' → жанровая подпись «' + literal + '», а в реестре есть нежанровый набор');
      }
    }
  }
}

function main() {
  const strict = process.argv.includes('--strict');
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Использование: node ' + rel(__filename) + ' [--strict]');
    return;
  }
  let registry;
  try {
    registry = loadRegistry();
  } catch (error) {
    console.error('[PRESETS LINT] ' + error.message);
    process.exit(1);
  }

  const collections = registry.CARD_PRESET_COLLECTIONS;
  if (!Array.isArray(collections) || collections.length === 0) {
    console.error('[PRESETS LINT] CARD_PRESET_COLLECTIONS пуст');
    process.exit(1);
  }
  const catalog = fieldCatalog();
  let total = 0;
  for (const collection of collections) total += checkCollection(registry, collection, catalog);
  checkLabels(collections);

  if (registry.resolveCardPresets({ id: '__missing__', title: '__missing__' }).length !== 0) {
    errors.push('resolveCardPresets для неизвестного поля должен возвращать []');
  }

  console.log('[PRESETS LINT] коллекций: ' + collections.length + ' · пресетов: ' + total +
    ' · полей в каталоге: ' + catalog.size);
  for (const warning of warnings) console.log('  [!] ' + warning);
  if (errors.length === 0) {
    console.log('[PRESETS LINT][OK] данные наборов и подписи в порядке.');
    if (strict && warnings.length > 0) process.exit(1);
    return;
  }
  console.log('[PRESETS LINT] ошибок: ' + errors.length);
  for (const error of errors) console.log('  [x] ' + error);
  process.exit(1);
}

main();

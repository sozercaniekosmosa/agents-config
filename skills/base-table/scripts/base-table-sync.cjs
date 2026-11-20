#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const COMPONENT = 'src/shared/ui/base-table';
const COMPONENT_DIR = path.join(ROOT, COMPONENT);

const LAYERS = ['code', 'constructor', 'docs'];
const LAYER_TITLES = {
  code: 'код',
  constructor: 'конструктор',
  docs: 'документация',
};

const REQUIRED = [
  'index.ts',
  'types.ts',
  'base-table.module.css',
  'README.md',
  'guide.md',
  'ui/root.tsx',
  'ui/header.tsx',
  'ui/body.tsx',
  'ui/row.tsx',
  'ui/cell.tsx',
  'ui/column-header.tsx',
  'ui/row-header.tsx',
  'ui/scroll-area.tsx',
  'ui/context.tsx',
  'lib/parse-table.ts',
  'lib/utils.ts',
  'constructor/base-table.constructor.tsx',
  'constructor/registry.ts',
  'constructor/dev-mode.ts',
  'constructor/constants.ts',
  'constructor/presets.ts',
  'constructor/constructor-modal.tsx',
  'constructor/view/constructor-view.tsx',
  'constructor/view/code-generator.ts',
  'constructor/view/compact-generator.ts',
  'constructor/view/expanded-generator.ts',
  'constructor/view/helpers.ts',
  'constructor/view/types.ts',
  'constructor/view/utils.ts',
];

const MATRIX = {
  code: {
    constructor: [
      'props/types → поля редактора, дефолты presets.ts, токены constants.ts',
      'новый субкомпонент/prop → preview-table.tsx + compact/expanded генераторы',
      'варианты/размеры/цвета → опции редактора и палитра',
      'поведение → превью и генерируемый TSX',
    ],
    docs: [
      'README: API-таблицы, адаптивность, особенности, кейсы',
      'guide.md: architecture_map, feature_status, contracts, constraints',
      'примеры компилируются против нового API',
    ],
  },
  constructor: {
    code: [
      'поле редактора ↔ реальный публичный prop',
      'генерируемый TSX компилируется и использует только публичный API',
      'presets/constants входят в union-типы рантайма',
      'console API и registry соответствуют dev-mode/registry',
    ],
    docs: [
      'README: раздел конструктора, props, команды консоли, ограничения',
      'guide.md: карта файлов конструктора, feature_status, contracts',
    ],
  },
  docs: {
    code: [
      'каждый задокументированный prop/тип/поведение существует',
      'примеры README компилируются',
      'описание будущей функциональности → подтверждение контракта',
    ],
    constructor: [
      'каждый пользовательский prop/режим имеет элемент управления',
      'генератор выдаёт задокументированную каноническую форму',
      'console API и ограничения совпадают с реализацией',
    ],
  },
};

function fail(message) {
  console.error('[base-table] ' + message);
  process.exit(2);
}

function readComponent(rel) {
  return fs.readFileSync(path.join(COMPONENT_DIR, rel), 'utf8');
}

function classify(rel) {
  if (rel === 'README.md' || rel === 'guide.md') return 'docs';
  if (rel === 'constructor' || rel.startsWith('constructor/')) return 'constructor';
  return 'code';
}

function toComponentRelative(file) {
  const normalized = file.replace(/\\/g, '/');
  if (normalized === COMPONENT) return '';
  if (!normalized.startsWith(COMPONENT + '/')) return null;
  return normalized.slice(COMPONENT.length + 1);
}

function gitChanged(baseRef) {
  const files = new Set();
  try {
    const status = execSync('git status --porcelain=v1 -uall', { cwd: ROOT, encoding: 'utf8' });
    status.split(/\r?\n/).forEach((line) => {
      if (!line.trim()) return;
      let file = line.slice(3).trim();
      if (file.includes(' -> ')) file = file.split(' -> ').pop();
      if (file.startsWith('"') && file.endsWith('"')) file = file.slice(1, -1);
      files.add(file);
    });
  } catch (_) {}
  if (baseRef) {
    try {
      const diff = execSync('git diff --name-only ' + baseRef + '...HEAD', { cwd: ROOT, encoding: 'utf8' });
      diff.split(/\r?\n/).forEach((line) => {
        if (line.trim()) files.add(line.trim());
      });
    } catch (_) {}
  }
  return Array.from(files)
    .map(toComponentRelative)
    .filter((rel) => rel !== null);
}

function walkComponent(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkComponent(full, list);
    else list.push(full);
  }
  return list;
}

function detect(options) {
  const changed = gitChanged(options.base);
  const sources = new Set(changed.map(classify));
  if (options.mode) {
    if (!LAYERS.includes(options.mode)) fail('неизвестный слой: ' + options.mode);
    sources.add(options.mode);
  }
  const allChanged = sources.size === LAYERS.length;
  const targets = sources.size === 0 || allChanged ? LAYERS.slice() : LAYERS.filter((layer) => !sources.has(layer));
  const plan = [];
  sources.forEach((source) => {
    plan.push({ source, target: 'constructor', actions: MATRIX[source].constructor });
    plan.push({ source, target: 'docs', actions: MATRIX[source].docs });
  });
  const relevantPlan = plan.filter((item) => targets.includes(item.target));
  const inventory = {
    code: walkComponent(path.join(COMPONENT_DIR, 'ui')).length +
      walkComponent(path.join(COMPONENT_DIR, 'lib')).length,
    constructor: walkComponent(path.join(COMPONENT_DIR, 'constructor')).length,
    docs: ['README.md', 'guide.md'].filter((rel) => fs.existsSync(path.join(COMPONENT_DIR, rel))).length,
  };
  return {
    component: COMPONENT,
    mode: options.mode || 'auto',
    changed,
    sources: Array.from(sources),
    targets,
    plan: relevantPlan,
    fullReconciliation: sources.size === 0,
    inventory,
  };
}

function tokens(source, pattern) {
  const result = [];
  let match;
  const regex = new RegExp(pattern, 'gm');
  while ((match = regex.exec(source)) !== null) result.push(match[1]);
  return result;
}

function check() {
  if (!fs.existsSync(COMPONENT_DIR)) fail('компонент не найден: ' + COMPONENT);
  const issues = [];
  const checks = [];
  const add = (status, message) => checks.push({ status, message });
  const missing = REQUIRED.filter((rel) => !fs.existsSync(path.join(COMPONENT_DIR, rel)));
  missing.forEach((rel) => issues.push('отсутствует обязательный файл: ' + rel));
  add(missing.length === 0 ? 'ok' : 'fail', 'обязательные артефакты: ' + (REQUIRED.length - missing.length) + '/' + REQUIRED.length);

  const readme = readComponent('README.md');
  const guide = readComponent('guide.md');
  const types = readComponent('types.ts');

  const mapSection = (guide.split(/^## /m).find((section) => /File Architecture Map/i.test(section)) || '');
  const mapPaths = tokens(mapSection, '^-\\s+`([^`]+)`');
  const brokenMap = mapPaths.filter((rel) => !fs.existsSync(path.join(COMPONENT_DIR, rel)));
  brokenMap.forEach((rel) => issues.push('guide.md architecture_map: битая ссылка ' + rel));
  add(brokenMap.length === 0 ? 'ok' : 'fail', 'guide.md architecture_map: ' + (mapPaths.length - brokenMap.length) + '/' + mapPaths.length + ' путей');

  const documented = new Set(mapPaths);
  const untracked = walkComponent(COMPONENT_DIR)
    .map((full) => path.relative(COMPONENT_DIR, full).replace(/\\/g, '/'))
    .filter((rel) => /\.(ts|tsx|css)$/.test(rel))
    .filter((rel) => !documented.has(rel));
  untracked.forEach((rel) => issues.push('guide.md architecture_map: не описан файл ' + rel));
  add(untracked.length === 0 ? 'ok' : 'fail', 'guide.md architecture_map: новых файлов вне карты ' + untracked.length);

  const uiFiles = walkComponent(path.join(COMPONENT_DIR, 'ui')).filter((full) => full.endsWith('.tsx'));
  const components = new Set();
  uiFiles.forEach((full) => {
    const source = fs.readFileSync(full, 'utf8');
    tokens(source, 'export const ([A-Z][A-Za-z0-9_]*)')
      .filter((name) => !name.endsWith('Context'))
      .forEach((name) => components.add(name));
  });
  const undocumentedComponents = Array.from(components).filter(
    (name) => !new RegExp('BaseTable[.]' + name + '(?![A-Za-z0-9_])').test(readme),
  );
  undocumentedComponents.forEach((name) => issues.push('README: не описан BaseTable.' + name));
  add(undocumentedComponents.length === 0 ? 'ok' : 'fail', 'README: покрытие субкомпонентов ' + (components.size - undocumentedComponents.length) + '/' + components.size);

  const consoleEntry = readComponent('constructor/base-table.constructor.tsx');
  const apiBlock = (consoleEntry.split('const api: BaseTableConstructorApi = {')[1] || '').split(/^};/m)[0];
  const apiMethods = tokens(apiBlock, '^  ([A-Za-z_][A-Za-z0-9_]*):');
  const undocumentedApi = apiMethods.filter(
    (name) =>
      !readme.includes('__baseTableConstructor.' + name) &&
      !readme.includes('.' + name + '(') &&
      !readme.includes(name + '()'),
  );
  undocumentedApi.forEach((name) => issues.push('README: не описана команда __baseTableConstructor.' + name));
  add(undocumentedApi.length === 0 ? 'ok' : 'fail', 'README: покрытие консольного API ' + (apiMethods.length - undocumentedApi.length) + '/' + apiMethods.length);

  const variantUnion = tokens(types, 'variant\\?:\\s*([^;]+);').join(' ');
  const variants = tokens(variantUnion, '"([^"]+)"');
  const undocumentedVariants = variants.filter((name) => !readme.includes('"' + name + '"'));
  undocumentedVariants.forEach((name) => issues.push('README: не описан variant ' + name));
  add(undocumentedVariants.length === 0 ? 'ok' : 'fail', 'README: покрытие вариантов ' + (variants.length - undocumentedVariants.length) + '/' + variants.length);

  const presets = readComponent('constructor/presets.ts');
  const presetVariants = new Set(tokens(presets, 'variant:\\s*"([^"]+)"'));
  const foreignVariants = Array.from(presetVariants).filter((name) => !variants.includes(name));
  foreignVariants.forEach((name) => issues.push('presets.ts: вариант вне рантайм-типа ' + name));
  add(foreignVariants.length === 0 ? 'ok' : 'fail', 'presets.ts: варианты соответствуют типам');

  const sizeUnion = tokens(types, 'size\\?:\\s*([^;]+);').join(' ');
  const sizes = tokens(sizeUnion, '"([^"]+)"');
  const presetSizes = new Set(tokens(presets, 'size:\\s*"([^"]+)"'));
  const foreignSizes = Array.from(presetSizes).filter((name) => !sizes.includes(name));
  const undocumentedSizes = sizes.filter((name) => !readme.includes('"' + name + '"'));
  foreignSizes.forEach((name) => issues.push('presets.ts: размер вне рантайм-типа ' + name));
  undocumentedSizes.forEach((name) => issues.push('README: не описан size ' + name));
  add(foreignSizes.length === 0 && undocumentedSizes.length === 0 ? 'ok' : 'fail', 'размеры конструктора и README соответствуют типам');

  const colorBlock = (types.split('export type WillyKitColor =')[1] || '').split(';')[0];
  const colorTokens = new Set(tokens(colorBlock, '"([^"]+)"'));
  const constants = readComponent('constructor/constants.ts');
  const paletteBlock = (constants.split('export const PALETTE_COLORS')[1] || '').split(/^};/m)[0];
  const paletteKeys = tokens(paletteBlock, '^\\s*"?([A-Za-z0-9-]+)"?\\s*:\\s*"#');
  const foreignTokens = paletteKeys.filter((name) => !colorTokens.has(name));
  foreignTokens.forEach((name) => issues.push('constants.ts: токен вне WillyKitColor ' + name));
  add(foreignTokens.length === 0 ? 'ok' : 'fail', 'constants.ts: палитра соответствует WillyKitColor');

  const propBlock = ['BaseTableProps', 'CellSemanticProps', 'RowSemanticProps']
    .map((name) => {
      const start = types.indexOf('interface ' + name);
      if (start === -1) return '';
      return types.slice(start, types.indexOf('}', start));
    })
    .join('\n');
  const props = tokens(propBlock, '^\\s{2}([A-Za-z][A-Za-z0-9_]*)\\??:');
  const undocumentedProps = Array.from(new Set(props)).filter((name) => name.length > 1 && !readme.includes(name));
  undocumentedProps.forEach((name) => issues.push('README: не описан prop ' + name));
  add(undocumentedProps.length === 0 ? 'ok' : 'fail', 'README: покрытие публичных props');

  return { component: COMPONENT, issues, checks, ok: issues.length === 0 };
}

function printDetect(result) {
  console.log('[base-table] компонент: ' + result.component);
  console.log('[base-table] режим: ' + result.mode);
  if (result.changed.length === 0 && !result.mode) {
    console.log('[base-table] git-изменений не обнаружено → полная сверка трёх артефактов');
  } else {
    console.log('[base-table] изменено файлов: ' + result.changed.length);
    result.changed.forEach((rel) => console.log('  - ' + rel + ' [' + classify(rel) + ']'));
  }
  console.log('[base-table] слои-источники: ' + (result.sources.length ? result.sources.join(', ') : 'не заданы'));
  console.log('[base-table] цели синхронизации: ' + result.targets.join(', '));
  result.plan.forEach((item) => {
    console.log('');
    console.log('  ' + LAYER_TITLES[item.source] + ' → ' + LAYER_TITLES[item.target]);
    item.actions.forEach((action) => console.log('    - ' + action));
  });
  console.log('');
  console.log('[base-table] инвентарь: ' + Object.entries(result.inventory).map(([key, value]) => key + '=' + value).join(', '));
  console.log('[base-table] далее: применить матрицу, затем --check');
}

function printCheck(result) {
  result.checks.forEach((item) => {
    const mark = item.status === 'ok' ? '[✓]' : '[✗]';
    console.log(mark + ' ' + item.message);
  });
  if (result.issues.length > 0) {
    console.log('');
    console.log('[base-table] дрейф:');
    result.issues.forEach((issue) => console.log('  - ' + issue));
    console.log('');
    console.log('[base-table] итог: расхождения найдены (' + result.issues.length + ')');
  } else {
    console.log('[base-table] итог: артефакты согласованы');
  }
}

function main(argv) {
  const options = { json: argv.includes('--json'), base: null, mode: null, action: 'detect' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') options.action = 'check';
    else if (arg === '--detect') options.action = 'detect';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.action = 'help';
    else if (arg === '--base') options.base = argv[i + 1];
    else if (arg.startsWith('--base=')) options.base = arg.slice('--base='.length);
    else if (arg === '--mode') options.mode = argv[i + 1];
    else if (arg === '--base' && !argv[i + 1]) fail('--base требует ref');
    else if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
  }

  if (!fs.existsSync(COMPONENT_DIR)) fail('компонент не найден: ' + COMPONENT);
  if (options.action === 'help') {
    console.log('node .agents/skills/base-table/scripts/base-table-sync.cjs [--detect|--check] [--base <ref>] [--mode code|constructor|docs] [--json]');
    return;
  }
  if (options.action === 'check') {
    const result = check();
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else printCheck(result);
    process.exit(result.ok ? 0 : 1);
  }
  const result = detect(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printDetect(result);
}

main(process.argv.slice(2));

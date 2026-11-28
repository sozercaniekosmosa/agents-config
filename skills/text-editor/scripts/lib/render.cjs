'use strict';

// Рендер генерируемых разделов спецификации по фактам базы.
// Все разделы идемпотентны: одинаковые факты дают одинаковый текст.

const TICK = String.fromCharCode(96);

function code(value) {
  return TICK + value + TICK;
}

function cut(value, limit) {
  const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).trimEnd() + '…';
}

function pipe(value) {
  return String(value == null ? '' : value).replace(/\|/g, '\\|');
}

function tableHead(columns) {
  return ['| ' + columns.join(' | ') + ' |', '| ' + columns.map(() => '---').join(' | ') + ' |'];
}

function compactList(names, limit) {
  const unique = [...new Set(names)];
  const shown = unique.slice(0, limit).map(code).join(', ');
  return unique.length > limit ? shown + ' …' : shown;
}

function baseOf(path) {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

function renderBase(facts) {
  const rows = facts.files.map((file) => '| ' + code(file.path) + ' | ' + pipe(cut(file.purpose, 150) || '—') + ' |');
  return tableHead(['Файл', 'Назначение (шапка файла)']).concat(rows).join('\n');
}

function renderData(facts) {
  const lines = [];
  lines.push('### Союзы типов');
  lines.push('');
  lines.push(...tableHead(['Тип', 'Значения']));
  for (const union of [...facts.unions].sort((a, b) => a.name.localeCompare(b.name))) {
    lines.push('| ' + code(union.name) + ' | ' + pipe(union.members.join(' \\| ')) + ' |');
  }
  lines.push('');
  lines.push('### Константы контракта');
  lines.push('');
  lines.push(...tableHead(['Константа', 'Значение']));
  const constants = [...facts.constants].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
  for (const item of constants) {
    lines.push('| ' + code(item.name) + ' | ' + pipe(item.value) + ' |');
  }
  return lines.join('\n');
}

function renderStore(facts) {
  const iface = facts.interfaces.DocumentStoreState;
  if (!iface) return '- Интерфейс ' + code('DocumentStoreState') + ' не найден: контракт стора недоступен.';
  const state = iface.members.filter((member) => !member.action).map((member) => member.name);
  const actions = iface.members.filter((member) => member.action).map((member) => member.name);
  const selectors = Object.keys(facts.exports)
    .filter((file) => file.startsWith('src/store/'))
    .flatMap((file) => facts.exports[file])
    .filter((name) => /^select[A-Z]/.test(name));
  const lines = [];
  lines.push('- Состояние: ' + compactList(state, 20) + '.');
  lines.push('- Действия: ' + compactList(actions, 20) + '.');
  lines.push('- Селекторы: ' + (selectors.length ? compactList(selectors, 10) : '—') + '.');
  return lines.join('\n');
}

function renderDb(facts) {
  const lines = [];
  lines.push('### RPC слоя db');
  lines.push('');
  lines.push(...tableHead(['Функция', 'Файл']));
  if (facts.rpc.length === 0) lines.push('| — | — |');
  for (const item of facts.rpc) lines.push('| ' + code(item.name) + ' | ' + code(item.file) + ' |');
  lines.push('');
  lines.push('### Таблица ' + code('documents'));
  lines.push('');
  const table = facts.tables.find((item) => item.table === 'documents');
  if (!table) {
    lines.push('- Таблица не найдена в ' + code('src/db/schema.sql') + '.');
    return lines.join('\n');
  }
  lines.push(...tableHead(['Колонка', 'Тип']));
  for (const column of table.columns) lines.push('| ' + code(column.name) + ' | ' + column.type + ' |');
  return lines.join('\n');
}

function renderApi(facts) {
  const lines = [];
  lines.push('### Домен: ' + code('src/shared/document'));
  lines.push('');
  const shared = facts.files.filter((file) => file.layer === 'shared');
  for (const file of shared) {
    const names = facts.exports[file.path] || [];
    if (names.length === 0) continue;
    lines.push('- ' + code(file.path.replace('src/shared/document/', '')) + ': ' + compactList(names, 10));
  }
  lines.push('');
  lines.push('### Модуль: ' + code('src/components/editor/document'));
  lines.push('');
  const dirs = new Map();
  for (const file of facts.files.filter((item) => item.layer === 'components')) {
    const rest = file.path.replace('src/components/editor/document/', '');
    const dir = rest.includes('/') ? rest.split('/')[0] : '.';
    if (!dirs.has(dir)) dirs.set(dir, []);
    dirs.get(dir).push(file);
  }
  lines.push(...tableHead(['Каталог', 'Файлов', 'Экспорты']));
  let api = [];
  for (const [dir, files] of [...dirs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    api = api.concat(files.flatMap((file) => facts.exports[file.path] || []));
    const shown = files.flatMap((file) => facts.exports[file.path] || []).filter((name) => /^[A-Z]/.test(name));
    lines.push('| ' + code(dir) + ' | ' + files.length + ' | ' + (shown.length ? compactList(shown, 6) : '—') + ' |');
  }
  return lines.join('\n');
}

function renderChecks(checks) {
  const lines = tableHead(['Инвариант', 'Статус', 'Свидетельство']);
  for (const check of checks) {
    if (check.ok) {
      lines.push('| ' + code(check.id) + ' | ✓ | — |');
    } else {
      lines.push('| ' + code(check.id) + ' | ✗ | ' + pipe(cut(check.evidence, 140)) + ' |');
    }
  }
  return lines.join('\n');
}

function renderTraps(failuresById, repeated) {
  if (repeated.length === 0) return '- Повторяющихся отклонений нет: наблюдения появятся после двух одинаковых провалов проверки.';
  const lines = [];
  for (const item of repeated) {
    lines.push('- ' + code(item.id) + ' — ' + item.title + ': провал повторяется из прохода в проход, свидетельство: ' + pipe(cut(item.evidence, 120)));
  }
  return lines.join('\n');
}

function renderState(facts, checks, lastDelta, lastChangeAt) {
  const failed = checks.filter((check) => !check.ok).length;
  const exportsCount = Object.values(facts.exports).reduce((sum, names) => sum + names.length, 0);
  const lines = [];
  lines.push('- Движок самосинхронизации: ' + code('scripts/selfupdate.cjs --auto') + ' · dev-цикл: ' + code('--watch') + '.');
  lines.push('- Фактов: ' + facts.files.length + ' файлов · ' + exportsCount + ' экспортов · ' +
    facts.constants.length + ' констант · ' + facts.unions.length + ' союзов · ' +
    facts.rpc.length + ' RPC · ' + facts.tables.length + ' таблиц.');
  lines.push('- Инварианты: ' + checks.length + ' проверено · ' + failed + ' нарушено.');
  lines.push('- Дрейф последнего изменения: +' + (lastDelta.added || 0) + ' / -' + (lastDelta.removed || 0) + ' / ~' + (lastDelta.changed || 0) + ' файлов.');
  lines.push('- Последнее изменение базы: ' + (lastChangeAt || '—') + '.');
  return lines.join('\n');
}

module.exports = { renderBase, renderData, renderStore, renderDb, renderApi, renderChecks, renderTraps, renderState };

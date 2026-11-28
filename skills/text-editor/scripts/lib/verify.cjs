'use strict';

// Проверка инвариантов по фактам базы. Каждая проверка возвращает вердикт и
// свидетельство (файл + причина), чтобы красный статус был воспроизводим.

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, modules, readText } = require('./base.cjs');

const cache = new Map();

function textOf(relPath) {
  if (!cache.has(relPath)) cache.set(relPath, readText(path.join(ROOT, relPath)));
  return cache.get(relPath);
}

function constNumber(facts, name) {
  const found = facts.constants.find((item) => item.name === name);
  if (!found) return null;
  const value = Number(found.value.replace(/['"]/g, ''));
  return Number.isFinite(value) ? value : null;
}

function filesIn(facts, prefix) {
  return facts.files.filter((file) => file.path.startsWith(prefix)).map((file) => file.path);
}

function importEvidence(facts, predicate) {
  return facts.imports.filter(predicate).map((edge) => edge.file + ' → ' + edge.target);
}

function verdict(ok, evidence) {
  return { ok, evidence: ok ? 'ok' : evidence.join('; ') };
}

// Код без комментариев: упоминание запрета в комментарии не является нарушением.
function codeOnly(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
}

const CHECKS = [
  {
    id: 'dag-shared',
    title: 'shared не импортирует внешние слои',
    severity: 'invariant',
    run(facts) {
      const bad = importEvidence(facts, (edge) => edge.layer === 'shared' && edge.target.startsWith('@/'));
      return verdict(bad.length === 0, bad);
    },
  },
  {
    id: 'dag-components-db',
    title: 'components не импортирует @/db напрямую',
    severity: 'invariant',
    run(facts) {
      const bad = importEvidence(facts, (edge) => edge.layer === 'components' && edge.target === '@/db');
      return verdict(bad.length === 0, bad);
    },
  },
  {
    id: 'dag-upward',
    title: 'store, db и shared не импортируют @/components',
    severity: 'invariant',
    run(facts) {
      const bad = importEvidence(facts, (edge) => ['store', 'db', 'shared'].includes(edge.layer) && edge.target === '@/components');
      return verdict(bad.length === 0, bad);
    },
  },
  {
    id: 'depth-consistency',
    title: 'ContainerDepth совпадает с MAX_CONTAINER_DEPTH',
    severity: 'invariant',
    run(facts) {
      const limit = constNumber(facts, 'MAX_CONTAINER_DEPTH');
      const union = facts.unions.find((item) => item.name === 'ContainerDepth');
      if (limit === null) return verdict(false, ['MAX_CONTAINER_DEPTH не объявлена']);
      if (!union) return verdict(false, ['ContainerDepth не объявлен']);
      const values = union.members.map((member) => Number(member.replace(/['"]/g, '')));
      const ok = values.length === limit && values.every((value, index) => value === index + 1);
      return verdict(ok, ['ContainerDepth=' + union.members.join('|') + ' при MAX_CONTAINER_DEPTH=' + limit]);
    },
  },
  {
    id: 'cols-declared',
    title: 'Сетка колонок объявлена константой',
    severity: 'contract',
    run(facts) {
      const cols = constNumber(facts, 'BLOCK_COLS');
      const ok = cols !== null && cols >= 6 && cols <= 24;
      return verdict(ok, ['BLOCK_COLS=' + String(cols)]);
    },
  },
  {
    id: 'history-limit',
    title: 'Глубина локальной истории объявлена',
    severity: 'contract',
    run(facts) {
      const limit = constNumber(facts, 'DOCUMENT_HISTORY_LIMIT');
      const ok = limit !== null && limit > 0;
      return verdict(ok, ['DOCUMENT_HISTORY_LIMIT=' + String(limit)]);
    },
  },
  {
    id: 'saved-by-reference',
    title: 'Несохранённые правки определяются по ссылке savedTree',
    severity: 'invariant',
    run(facts) {
      const file = filesIn(facts, 'src/store/').find((item) => item.endsWith('useDocumentStore.ts')) || 'src/store/useDocumentStore.ts';
      if (!fs.existsSync(path.join(ROOT, file))) return verdict(false, [file + ' отсутствует']);
      const ok = /tree\s*!==\s*state\.savedTree/.test(textOf(file)) || /state\.savedTree/.test(textOf(file));
      return verdict(ok, [file + ' не сравнивает дерево со снимком']);
    },
  },
  {
    id: 'broken-json-fallback',
    title: 'Битый blocks_json даёт пустое дерево',
    severity: 'invariant',
    run(facts) {
      const file = filesIn(facts, 'src/db/')[0];
      if (!file) return verdict(false, ['репозиторий документа не найден']);
      const text = textOf(file);
      const ok = text.includes('parseDocumentTree') && text.includes('createEmptyDocumentTree');
      return verdict(ok, [file + ' не восстанавливает битый JSON в пустое дерево']);
    },
  },
  {
    id: 'export-escapes',
    title: 'Экспорт экранирует текст и не использует innerHTML',
    severity: 'invariant',
    run(facts) {
      const files = filesIn(facts, 'src/components/editor/document/export/');
      if (files.length === 0) return verdict(false, ['каталог export не найден']);
      const problems = [];
      for (const file of files) {
        if (/dangerouslySetInnerHTML|\.innerHTML\s*=/.test(codeOnly(textOf(file)))) problems.push(file + ' → innerHTML');
      }
      const html = files.find((file) => file.endsWith('markdownToHtml.ts'));
      if (!html) problems.push('markdownToHtml.ts отсутствует');
      else if (!textOf(html).includes('escapeHtml')) problems.push(html + ' не экранирует текст');
      return verdict(problems.length === 0, problems);
    },
  },
  {
    id: 'single-mutation-point',
    title: 'Дерево меняется через useDocumentEditor',
    severity: 'invariant',
    run(facts) {
      const file = filesIn(facts, 'src/components/editor/document/hooks/').find((item) => item.endsWith('useDocumentEditor.ts'));
      if (!file) return verdict(false, ['useDocumentEditor.ts отсутствует']);
      const text = textOf(file);
      const ok = text.includes('setTree(') && text.includes('DocumentEditorActions');
      return verdict(ok, [file + ' не является точкой мутации дерева']);
    },
  },
  {
    id: 'read-only-guard',
    title: 'Режим просмотра блокирует правки дерева',
    severity: 'invariant',
    run(facts) {
      const file = filesIn(facts, 'src/components/editor/document/hooks/').find((item) => item.endsWith('useDocumentEditor.ts'));
      if (!file) return verdict(false, ['useDocumentEditor.ts отсутствует']);
      const text = textOf(file);
      return verdict(/readOnlyRef|isReadOnly/.test(text), [file + ' не проверяет режим просмотра']);
    },
  },
  {
    id: 'barrels',
    title: 'В каждом каталоге базы есть index.ts',
    severity: 'invariant',
    run() {
      const problems = [];
      for (const item of modules()) {
        const abs = path.join(ROOT, item);
        if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
        if (!item.startsWith('src/')) continue;
        if (!fs.existsSync(path.join(abs, 'index.ts'))) problems.push(item + ' → нет index.ts');
      }
      return verdict(problems.length === 0, problems);
    },
  },
  {
    id: 'no-todo',
    title: 'Нет TODO/FIXME/HACK в базе',
    severity: 'invariant',
    run(facts) {
      const problems = [];
      for (const file of facts.files) {
        const lines = textOf(file.path).split('\n');
        lines.forEach((line, index) => {
          if (/(^|\s)(TODO|FIXME|HACK)(\s|:|$)/.test(line)) problems.push(file.path + ':' + (index + 1));
        });
      }
      return verdict(problems.length === 0, problems);
    },
  },
  {
    id: 'db-rpc',
    title: 'RPC документа: get / save / reset',
    severity: 'invariant',
    run(facts) {
      const names = facts.rpc.map((item) => item.name);
      const missing = ['documentGet', 'documentSave', 'documentReset'].filter((name) => !names.includes(name));
      return verdict(missing.length === 0, ['нет RPC: ' + missing.join(', ')]);
    },
  },
  {
    id: 'schema-documents',
    title: 'Таблица documents хранит название и дерево',
    severity: 'invariant',
    run(facts) {
      const table = facts.tables.find((item) => item.table === 'documents');
      if (!table) return verdict(false, ['таблица documents не найдена']);
      const names = table.columns.map((column) => column.name);
      const missing = ['title', 'blocks_json', 'project_id'].filter((name) => !names.includes(name));
      return verdict(missing.length === 0, ['documents: нет колонок ' + missing.join(', ')]);
    },
  },
];

function runChecks(facts) {
  return CHECKS.map((check) => {
    let result;
    try {
      result = check.run(facts);
    } catch (error) {
      result = { ok: false, evidence: 'проверка упала: ' + String(error && error.message) };
    }
    return { id: check.id, title: check.title, severity: check.severity, ok: result.ok, evidence: result.evidence };
  });
}

module.exports = { runChecks, CHECKS };

'use strict';

// Извлечение фактов базы: файлы, экспорты, константы, союзы типов, поля
// интерфейсов, RPC, колонки SQL и межслойные импорты. Детерминированно, без ИИ.

const fs = require('node:fs');
const {
  SCHEMA_SQL,
  codeFiles,
  firstComment,
  layerOf,
  locOf,
  readText,
  sha,
} = require('./base.cjs');

const RE_EXPORT_DECL = /^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum)\s+([A-Za-z0-9_$]+)/gm;
const RE_EXPORT_LIST = /^export\s*\{([^}]+)\}\s*(?:from\s+'([^']+)')?/gm;
const RE_CONST = /^export\s+const\s+([A-Za-z0-9_$]+)\s*(?::\s*[^=]+?)?=\s*([^;\n]+);/gm;
const RE_TYPE_UNION = /^export\s+type\s+([A-Za-z0-9_$]+)\s*=\s*([^;\n]+);/gm;
const RE_IMPORT = /from\s+'(@\/[^']+)'/g;

// Союзы литералов, которые являются публичным контрактом домена.
const UNION_RE = /^(BlockKind|BlockAlign|ContainerDepth|BlockLevel|DocumentExportFormat|DocumentSaveStatus|DocumentWidth|BlockSourceFieldKey|DocumentVersion)$/;

function shortValue(value) {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= 60 ? text : null;
}

function unionMembers(value) {
  const text = value.trim();
  if (text.startsWith('{') || text.startsWith('[') || text.includes('<') || text.includes('(')) return null;
  return text.split('|').map((item) => item.trim()).filter(Boolean);
}

function ifaceMembers(text, name) {
  const head = 'export interface ' + name + ' ';
  const from = text.indexOf(head);
  if (from < 0) return null;
  const open = text.indexOf('{', from);
  let depth = 0;
  let end = -1;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    else if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  const body = text.slice(open + 1, end);
  const members = [];
  for (const line of body.split('\n')) {
    const match = /^ {2}([A-Za-z0-9_$]+)(\??)\s*[:(]/.exec(line);
    if (!match) continue;
    const rest = line.slice(match.index + match[0].length);
    const action = /^\(|=>/.test(rest.replace(/^\s*/, ''));
    members.push({ name: match[1], optional: match[2] === '?', action });
  }
  return members;
}

function sqlColumns() {
  if (!fs.existsSync(SCHEMA_SQL)) return [];
  const text = readText(SCHEMA_SQL);
  const out = [];
  const re = /CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)\s*\(([\s\S]*?)\n\);/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    const body = match[2];
    const columns = [];
    for (const line of body.split('\n')) {
      const column = /^\s{2}([a-z_][a-z0-9_]*)\s+([A-Za-z]+)/.exec(line);
      if (column) columns.push({ name: column[1], type: column[2] });
    }
    out.push({ table: match[1], columns });
  }
  return out;
}

function collectFacts() {
  const files = [];
  const exportsByFile = {};
  const constants = [];
  const unions = [];
  const interfaces = {};
  const imports = [];
  const texts = new Map();

  for (const entry of codeFiles()) {
    const text = readText(entry.abs);
    texts.set(entry.path, text);
    files.push({
      path: entry.path,
      layer: layerOf(entry.path),
      loc: locOf(text),
      purpose: firstComment(text),
      hash: sha(text).slice(0, 12),
    });

    const names = new Set();
    let match;
    RE_EXPORT_DECL.lastIndex = 0;
    while ((match = RE_EXPORT_DECL.exec(text)) !== null) names.add(match[1]);
    RE_EXPORT_LIST.lastIndex = 0;
    while ((match = RE_EXPORT_LIST.exec(text)) !== null) {
      for (const raw of match[1].split(',')) {
        const name = raw.replace(/\s+/g, ' ').trim().split(/\s+as\s+/).pop();
        if (name) names.add(name.trim());
      }
    }
    exportsByFile[entry.path] = [...names].sort();

    RE_CONST.lastIndex = 0;
    while ((match = RE_CONST.exec(text)) !== null) {
      const value = shortValue(match[2]);
      if (value && /^['"]?\.?[A-Za-z0-9_'".| -]+$/.test(value)) constants.push({ name: match[1], value, file: entry.path });
    }

    RE_TYPE_UNION.lastIndex = 0;
    while ((match = RE_TYPE_UNION.exec(text)) !== null) {
      if (!UNION_RE.test(match[1])) continue;
      const members = unionMembers(match[2]);
      if (members && members.length > 1) unions.push({ name: match[1], members, file: entry.path });
    }

    for (const name of ['DocumentStoreState', 'DocumentEditorActions', 'DocumentTree', 'DocumentSettings', 'BlockSourceRef', 'UseDocumentSourcesResult', 'SourceTreeGroup']) {
      if (interfaces[name]) continue;
      const members = ifaceMembers(text, name);
      if (members && members.length > 0) interfaces[name] = { file: entry.path, members };
    }

    RE_IMPORT.lastIndex = 0;
    while ((match = RE_IMPORT.exec(text)) !== null) {
      imports.push({ file: entry.path, layer: layerOf(entry.path), target: match[1] });
    }
  }

  const rpc = [];
  for (const file of files) {
    const text = texts.get(file.path) || '';
    if (!file.path.startsWith('src/db/')) continue;
    const re = /^export\s+async\s+function\s+([A-Za-z0-9_$]+)/gm;
    let match;
    while ((match = re.exec(text)) !== null) rpc.push({ name: match[1], file: file.path });
  }

  const facts = {
    files,
    exports: exportsByFile,
    constants,
    unions,
    interfaces,
    imports,
    rpc,
    tables: sqlColumns(),
    modules: [...new Set(files.map((file) => file.layer))].sort(),
  };
  facts.hash = sha(JSON.stringify({
    files: files.map((file) => [file.path, file.hash]),
    constants: facts.constants.map((item) => [item.name, item.value]),
    unions: facts.unions.map((item) => [item.name, item.members]),
    rpc: facts.rpc.map((item) => item.name),
    tables: facts.tables.map((item) => [item.table, item.columns.map((column) => column.name)]),
  }));
  return facts;
}

module.exports = { collectFacts };

module.exports.__internals = { ifaceMembers, sqlColumns, unionMembers };

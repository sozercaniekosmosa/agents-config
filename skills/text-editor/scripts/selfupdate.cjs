#!/usr/bin/env node
'use strict';

// Самосинхронизация навыка «текстовый редактор».
// Поток: база изменилась → факты пересчитаны → генерируемые разделы спецификации
// перерисованы → инварианты перепроверены → baseline, AUTO-блок и CHANGELOG обновлены.
// Пишет только файлы навыка; baseline обновляет штатный трекер.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  CONTRACTS_MD,
  DEVIATIONS,
  ROOT,
  SELF_STATE,
  SKILL_DIR,
  SKILL_MD,
  TRACKER,
  applyRegion,
  modules,
  readJson,
  readText,
  rel,
  stamp,
  writeJson,
  writeText,
} = require('./lib/base.cjs');
const { collectFacts } = require('./lib/facts.cjs');
const { runChecks } = require('./lib/verify.cjs');
const render = require('./lib/render.cjs');

const HISTORY_LIMIT = 20;
const DEVIATION_LIMIT = 50;
const LOCK = path.join(SKILL_DIR, 'state', '.sync.lock');
const LOCK_TTL_MS = 60000;

// Два одновременных прогона (ручной и --watch) писали бы snapshot наперегонки.
function acquireLock() {
  try {
    if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < LOCK_TTL_MS) return false;
    fs.mkdirSync(path.dirname(LOCK), { recursive: true });
    fs.writeFileSync(LOCK, String(process.pid), 'utf8');
    return true;
  } catch {
    return true;
  }
}

function releaseLock(owned) {
  if (!owned) return;
  try {
    fs.unlinkSync(LOCK);
  } catch {
    /* lock уже снят */
  }
}

function snapshotOf(facts) {
  const files = {};
  for (const file of facts.files) files[file.path] = file.hash;
  const constants = {};
  for (const item of facts.constants) constants[item.name] = item.value;
  const unions = {};
  for (const item of facts.unions) unions[item.name] = item.members.join('|');
  const tables = {};
  for (const item of facts.tables) tables[item.table] = item.columns.map((column) => column.name).join(',');
  return { files, constants, unions, rpc: facts.rpc.map((item) => item.name), tables, factsHash: facts.hash };
}

function diffMap(before, after) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const key of Object.keys(after)) {
    if (!(key in before)) added.push(key);
    else if (String(before[key]) !== String(after[key])) changed.push(key);
  }
  for (const key of Object.keys(before)) if (!(key in after)) removed.push(key);
  return { added, removed, changed };
}

function diffSnapshots(before, after) {
  const empty = { added: [], removed: [], changed: [] };
  if (!before) {
    return {
      added: Object.keys(after.files).sort(),
      removed: [], changed: [],
      constants: empty, unions: empty, rpc: empty, tables: empty,
    };
  }
  return {
    added: diffMap(before.files, after.files).added,
    removed: diffMap(before.files, after.files).removed,
    changed: diffMap(before.files, after.files).changed,
    constants: diffMap(before.constants || {}, after.constants),
    unions: diffMap(before.unions || {}, after.unions),
    rpc: diffMap(Object.fromEntries((before.rpc || []).map((name) => [name, 1])), Object.fromEntries(after.rpc.map((name) => [name, 1]))),
    tables: diffMap(before.tables || {}, after.tables),
  };
}

function hasDelta(delta) {
  return delta.added.length + delta.removed.length + delta.changed.length > 0 ||
    delta.constants.added.length + delta.constants.removed.length + delta.constants.changed.length > 0 ||
    delta.unions.added.length + delta.unions.removed.length + delta.unions.changed.length > 0 ||
    delta.rpc.added.length + delta.rpc.removed.length > 0 ||
    delta.tables.added.length + delta.tables.removed.length + delta.tables.changed.length > 0;
}

function consecutiveFailures(history, checks) {
  const recent = history.slice(-10);
  const out = [];
  for (const check of checks.filter((item) => !item.ok)) {
    let count = 1;
    for (let index = recent.length - 1; index >= 0; index -= 1) {
      if ((recent[index].failed || []).includes(check.id)) count += 1;
      else break;
    }
    out.push({ id: check.id, title: check.title, evidence: check.evidence, count });
  }
  return out.filter((item) => item.count >= 2);
}

function planRegions(facts, checks, history, lastDelta, lastChangeLabel) {
  const repeated = consecutiveFailures(history, checks);
  return {
    contracts: {
      BASE: render.renderBase(facts),
      DATA: render.renderData(facts),
      STORE: render.renderStore(facts),
      DB: render.renderDb(facts),
      API: render.renderApi(facts),
      CHECKS: render.renderChecks(checks),
      TRAPS: render.renderTraps(null, repeated),
    },
    skill: {
      STATE: render.renderState(facts, checks, lastDelta, lastChangeLabel),
    },
  };
}

function staleRegions(planned) {
  const out = [];
  for (const [file, regions] of [[CONTRACTS_MD, planned.contracts], [SKILL_MD, planned.skill]]) {
    if (!fs.existsSync(file)) {
      out.push({ file: rel(file), region: '(файл отсутствует)', reason: 'missing-file' });
      continue;
    }
    const text = readText(file);
    for (const [name, body] of Object.entries(regions)) {
      const probe = applyRegion(text, name, body);
      if (probe.status === 'missing') out.push({ file: rel(file), region: name, reason: 'missing-marker' });
      else if (probe.status === 'changed') {
        out.push({ file: rel(file), region: name, reason: 'stale' });
        if (process.env.SELF_DEBUG === '1') {
          const region = require('./lib/base.cjs').regionOf(text, name);
          fs.appendFileSync(path.join(SKILL_DIR, 'state', '.debug.log'),
            '=== ' + name + '\nCURRENT ' + JSON.stringify(region.body.trim()) + '\nPLANNED ' + JSON.stringify(body.trim()) + '\n');
        }
      }
    }
  }
  return out;
}

function applyPlan(planned) {
  const changed = [];
  for (const [file, regions] of [[CONTRACTS_MD, planned.contracts], [SKILL_MD, planned.skill]]) {
    if (!fs.existsSync(file)) continue;
    let text = readText(file);
    const applied = [];
    for (const [name, body] of Object.entries(regions)) {
      const result = applyRegion(text, name, body);
      if (result.status === 'missing') continue;
      text = result.text;
      if (result.status === 'changed') applied.push(name);
    }
    if (applied.length > 0) {
      writeText(file, text);
      for (const name of applied) changed.push(rel(file) + '#' + name);
    }
  }
  return changed;
}

function updateDeviations(checks, now) {
  const state = readJson(DEVIATIONS, { version: 1, entries: [] });
  const entries = Array.isArray(state.entries) ? state.entries.slice() : [];
  const failed = checks.filter((check) => !check.ok);
  let touched = 0;
  for (const check of failed) {
    const open = entries.find((item) => item.id === check.id && !item.resolvedAt);
    if (open) {
      if (open.evidence !== check.evidence) {
        open.evidence = check.evidence;
        open.updatedAt = now;
        touched += 1;
      }
      continue;
    }
    entries.push({ id: check.id, title: check.title, severity: check.severity, evidence: check.evidence, openedAt: now, updatedAt: now });
    touched += 1;
  }
  for (const entry of entries) {
    if (entry.resolvedAt) continue;
    if (failed.some((check) => check.id === entry.id)) continue;
    entry.resolvedAt = now;
    touched += 1;
  }
  if (touched > 0) writeJson(DEVIATIONS, { version: 1, entries: entries.slice(-DEVIATION_LIMIT) });
  return touched;
}

function noteOf(delta, changed, failures) {
  const parts = [];
  const files = '+ ' + delta.added.length + '/- ' + delta.removed.length + '/~ ' + delta.changed.length;
  parts.push('база: ' + files);
  const factBits = [];
  if (delta.constants.added.length + delta.constants.changed.length + delta.constants.removed.length > 0) factBits.push('константы');
  if (delta.unions.added.length + delta.unions.changed.length + delta.unions.removed.length > 0) factBits.push('союзы');
  if (delta.rpc.added.length + delta.rpc.removed.length > 0) factBits.push('RPC');
  if (delta.tables.added.length + delta.tables.changed.length + delta.tables.removed.length > 0) factBits.push('схема');
  if (factBits.length > 0) parts.push('факты: ' + factBits.join(', '));
  if (changed.length > 0) parts.push('разделы: ' + changed.map((item) => item.split('#')[1]).join(', '));
  parts.push('инварианты: ' + failures + ' нарушено');
  return 'самосинхронизация — ' + parts.join('; ');
}

function runTracker(note) {
  try {
    execFileSync('node', [TRACKER, '--update', note], { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error('[SELF][WARN] трекер не обновил baseline: ' + String(error && error.message));
    return false;
  }
}

function sync(options) {
  const write = options.write === true;
  if (!write) return syncLocked({ write: false });
  if (!acquireLock()) {
    console.log('[SELF] Синхронизация уже идёт параллельно: прогон пропущен.');
    return 0;
  }
  try {
    return syncLocked({ write: true });
  } catch (error) {
    console.error('[SELF][ERR] прогон прерван: ' + String(error && error.stack ? error.stack : error));
    console.error('→ База и спецификация не согласованы: повторить прогон, состояние самовосстановится.');
    return 3;
  } finally {
    releaseLock(true);
  }
}

function syncLocked(options) {
  const write = options.write;
  const facts = collectFacts();
  const checks = runChecks(facts);
  const previous = readJson(SELF_STATE, null);
  const before = previous && previous.snapshot ? previous.snapshot : null;
  const delta = diffSnapshots(before, snapshotOf(facts));
  const history = previous && Array.isArray(previous.history) ? previous.history : [];
  const now = new Date().toISOString();
  const changedNow = hasDelta(delta);
  const previousDelta = previous && previous.lastDelta ? previous.lastDelta : { added: 0, removed: 0, changed: 0 };
  const lastDelta = changedNow
    ? { added: delta.added.length, removed: delta.removed.length, changed: delta.changed.length }
    : previousDelta;
  const failures = checks.filter((check) => !check.ok);
  // Прогон учитывается как текущая запись истории: иначе автонаблюдения отставали бы на один проход.
  const planHistory = history.concat([{ failed: failures.map((check) => check.id) }]);
  const previousChange = history.length > 0 && history[history.length - 1].lastChangeAt
    ? history[history.length - 1].lastChangeAt
    : (previous && previous.lastChangeAt) || null;
  const lastChangeIso = changedNow ? now : previousChange;
  const lastChangeLabel = lastChangeIso ? stamp(new Date(lastChangeIso)) : null;
  const planned = planRegions(facts, checks, planHistory, lastDelta, lastChangeLabel);
  const stale = staleRegions(planned);

  const drift = hasDelta(delta) || stale.length > 0;
  console.log('[SELF] Файлы: ' + facts.files.length + ' · факты ' + facts.hash.slice(0, 12) +
    ' · дрейф: +' + delta.added.length + ' / -' + delta.removed.length + ' / ~' + delta.changed.length);
  if (stale.length > 0) {
    console.log('[SELF] Разделы к перерисовке: ' + stale.map((item) => item.region).join(', '));
  }
  if (failures.length > 0) {
    for (const check of failures) console.log('[SELF][ATTN] ' + check.id + ' — ' + check.evidence);
  } else {
    console.log('[SELF] Инварианты: ' + checks.length + '/' + checks.length + ' ok');
  }

  if (!write) {
    if (failures.length > 0) return 2;
    return drift ? 1 : 0;
  }

  const changed = applyPlan(planned);
  const deviations = updateDeviations(checks, now);
  const lastChangeAt = lastChangeIso;
  const entry = {
    at: now,
    failed: failures.map((check) => check.id),
    regions: changed.map((item) => item.split('#')[1]),
    files: { added: delta.added.length, removed: delta.removed.length, changed: delta.changed.length },
    lastChangeAt,
  };
  const nextHistory = history.concat([entry]).slice(-HISTORY_LIMIT);
  writeJson(SELF_STATE, {
    version: 1,
    lastSyncAt: now,
    lastChangeAt,
    lastDelta,
    factsHash: facts.hash,
    snapshot: snapshotOf(facts),
    history: nextHistory,
  });

  if (hasDelta(delta) || changed.length > 0 || deviations > 0) {
    runTracker(noteOf(delta, changed, failures.length));
  } else {
    console.log('[SELF][OK] Спецификация соответствует базе, изменений нет.');
  }

  if (failures.length > 0) {
    console.log('[SELF][ESCALATE] Инвариант нарушен кодом: спецификация обновлена, но контракт под вопросом.');
    console.log('→ Один вопрос пользователю по разделу «Автономия и эскалация»; до ответа — read-only.');
    return 2;
  }
  console.log('[SELF][OK] Синхронизировано: ' + facts.files.length + ' файлов · базлайн, AUTO-блок и CHANGELOG обновлены.');
  return 0;
}

function report() {
  const facts = collectFacts();
  const checks = runChecks(facts);
  const byLayer = new Map();
  for (const file of facts.files) {
    if (!byLayer.has(file.layer)) byLayer.set(file.layer, { files: 0, loc: 0 });
    const bucket = byLayer.get(file.layer);
    bucket.files += 1;
    bucket.loc += file.loc;
  }
  console.log('[SELF REPORT] ' + stamp(new Date()));
  for (const [layer, bucket] of byLayer) console.log('  ' + layer + ' — ' + bucket.files + ' файл(ов), ' + bucket.loc + ' строк');
  console.log('  экспортов: ' + Object.values(facts.exports).reduce((sum, names) => sum + names.length, 0));
  console.log('  констант: ' + facts.constants.length + ' · союзов: ' + facts.unions.length +
    ' · RPC: ' + facts.rpc.length + ' · таблиц: ' + facts.tables.length);
  console.log('  инвариантов: ' + checks.length + ' · нарушено: ' + checks.filter((check) => !check.ok).length);
  for (const check of checks) console.log('    ' + (check.ok ? '[ok]  ' : '[FAIL] ') + check.id + ' — ' + check.title);
}

function watch() {
  let timer = null;
  const targets = modules().map((item) => path.join(ROOT, item)).filter((target) => fs.existsSync(target));
  const trigger = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        sync({ write: true });
      } catch (error) {
        console.error('[SELF][ERR] ' + String(error && error.message));
      }
    }, 600);
  };
  for (const target of targets) {
    const recursive = fs.statSync(target).isDirectory();
    fs.watch(target, { recursive }, trigger);
  }
  console.log('[SELF][WATCH] слежу за ' + targets.length + ' путями базы; Ctrl+C — выход.');
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Использование:');
    console.log('  node ' + rel(__filename) + '            # синхронизация: перерисовать разделы и baseline');
    console.log('  node ' + rel(__filename) + ' --check    # только проверка: exit 1 = нужна синхронизация');
    console.log('  node ' + rel(__filename) + ' --report   # инвентарь фактов и статус инвариантов');
    console.log('  node ' + rel(__filename) + ' --watch    # dev-цикл: следить за базой и синхронизировать');
    return;
  }
  if (args.includes('--watch')) return watch();
  if (args.includes('--report')) return report();
  if (args.includes('--check')) process.exitCode = sync({ write: false });
  else process.exitCode = sync({ write: true });
}

main();

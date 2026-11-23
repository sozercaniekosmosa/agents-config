'use strict';

// Аудит управляемых навыков: структура, автономия, baseline.

const fs = require('node:fs');
const path = require('node:path');
const { SKILLS_DIR, ROOT, rel } = require('./cli.cjs');
const { markerOf, ESCALATION, ANTI_PATTERNS } = require('./spec.cjs');
const { AUTONOMY_START, AUTONOMY_END } = require('./render.cjs');

const MANAGED_RE = /<!-- FORGE:MANAGED mode=(track|spec) -->/;

function managed(rootDir) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const skillDir = path.join(rootDir, entry.name);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!fs.existsSync(skillFile)) continue;
    const text = fs.readFileSync(skillFile, 'utf8');
    if (!text.includes('<!-- FORGE:MANAGED')) continue;
    out.push({ dir: skillDir, name: entry.name, text });
  }
  return out;
}

function frontmatterName(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return '';
  const line = /(?:^|\n)name:\s*(.+)/.exec(fm[1]);
  return line ? line[1].trim() : '';
}

function checkSkill(skill) {
  const errors = [];
  const warnings = [];
  const text = skill.text;
  const modeMatch = MANAGED_RE.exec(text);
  const mode = modeMatch ? modeMatch[1] : '';
  const start = text.indexOf(AUTONOMY_START);
  const end = text.indexOf(AUTONOMY_END);

  if (!mode) errors.push('маркер управляемости без mode=track|spec');
  if (start < 0 || end < 0 || end < start) {
    errors.push('нет канонического блока автономии (маркеры FORGE:AUTONOMY)');
  } else {
    const block = text.slice(start, end);
    for (const item of ESCALATION) {
      if (!block.includes('- ' + item)) errors.push('эскалация: нет пункта «' + item + '»');
    }
  }
  for (const [re, hint] of ANTI_PATTERNS) {
    if (re.test(text)) errors.push('антипаттерн автономии: ' + hint);
  }
  if (!/^## Назначение/m.test(text)) warnings.push('нет раздела «## Назначение»');
  if (!/^## Границы/m.test(text)) warnings.push('нет раздела «## Границы»');
  const name = frontmatterName(text);
  if (name && name !== skill.name) warnings.push('name фронтматтера ≠ каталога');

  if (mode === 'track') {
    for (const item of ['scripts/track.cjs', 'state/state.json', 'CHANGELOG.md']) {
      if (!fs.existsSync(path.join(skill.dir, item))) errors.push('нет ' + item);
    }
    const marker = markerOf(skill.name);
    if (!text.includes('<!-- ' + marker + ':START -->')) errors.push('нет AUTO-блока ' + marker);
    const stateFile = path.join(skill.dir, 'state', 'state.json');
    if (fs.existsSync(stateFile)) {
      try {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (state.marker !== marker) errors.push('state.marker ≠ ' + marker);
        if (!state.files || Object.keys(state.files).length === 0) warnings.push('baseline пуст');
      } catch {
        errors.push('state/state.json не парсится');
      }
    }
  }
  if (mode === 'spec' && !fs.existsSync(path.join(skill.dir, 'CHANGELOG.md'))) {
    errors.push('нет CHANGELOG.md');
  }
  return { name: skill.name, mode: mode || '?', errors, warnings };
}

function cmdCheck(flags) {
  const rootDir = flags.root ? path.resolve(ROOT, flags.root) : SKILLS_DIR;
  const results = managed(rootDir).map(checkSkill);
  const failed = results.filter((item) => item.errors.length > 0);
  if (flags.json) {
    console.log(JSON.stringify({ root: rel(rootDir), total: results.length, failed: failed.length, results }, null, 2));
    if (failed.length > 0) process.exit(1);
    return;
  }
  console.log('[FORGE] ' + rel(rootDir) + ' · управляемых навыков: ' + results.length);
  for (const item of results) {
    for (const err of item.errors) console.log('  [x] ' + item.name + ': ' + err);
    for (const warn of item.warnings) console.log('  [!] ' + item.name + ': ' + warn);
  }
  if (failed.length > 0) {
    console.log('[FORGE][FAIL] Нарушений: ' + failed.length + '. Стандарт: references/template.md');
    process.exit(1);
  }
  console.log('[FORGE][OK] Все управляемые навыки соответствуют стандарту самообновления.');
}

module.exports = { managed, checkSkill, cmdCheck };

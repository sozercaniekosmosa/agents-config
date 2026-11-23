'use strict';

// Манифест управляемых навыков (update) и ретрофит автономии (upgrade).

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SKILLS_DIR, rel, readJson, git, stamp } = require('./cli.cjs');
const { checkSkill } = require('./check.cjs');
const { autonomyBlock, AUTONOMY_START, AUTONOMY_END } = require('./render.cjs');

const SELF_SKILL_MD = path.join(__dirname, '..', '..', 'SKILL.md');
const SELF_STATE = path.join(__dirname, '..', '..', 'state', 'state.json');
const SELF_CHANGELOG = path.join(__dirname, '..', '..', 'CHANGELOG.md');
const TEMPLATE_VERSION = 1;
const AUTO_START = '<!-- AUTO:FORGE:START -->';
const AUTO_END = '<!-- AUTO:FORGE:END -->';

function ensureChangelog(skillDir, title) {
  const file = path.join(skillDir, 'CHANGELOG.md');
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, '# Журнал изменений «' + title + '»\n\nAppend-only. Пишет трекер/протокол навыка.\n\n- ' +
    stamp(new Date()) + ' — навык приведён к стандарту автономии (forge upgrade)\n', 'utf8');
  return true;
}

function cmdUpdate(note) {
  const now = new Date();
  if (!fs.existsSync(SELF_CHANGELOG)) {
    fs.writeFileSync(SELF_CHANGELOG, '# Журнал изменений «forge»\n\nAppend-only. Пишет forge.cjs --update "<note>".\n', 'utf8');
  }
  const skills = (fs.existsSync(SKILLS_DIR) ? fs.readdirSync(SKILLS_DIR, { withFileTypes: true }) : [])
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => {
      const dir = path.join(SKILLS_DIR, entry.name);
      const skillFile = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(skillFile)) return null;
      const text = fs.readFileSync(skillFile, 'utf8');
      if (!text.includes('<!-- FORGE:MANAGED')) return null;
      const result = checkSkill({ dir, name: entry.name, text });
      const stateFile = path.join(dir, 'state', 'state.json');
      let modules = [];
      if (fs.existsSync(stateFile)) {
        try {
          modules = JSON.parse(fs.readFileSync(stateFile, 'utf8')).modules || [];
        } catch {
          modules = [];
        }
      }
      return { name: entry.name, mode: result.mode, modules, errors: result.errors.length };
    })
    .filter(Boolean);

  const previous = fs.existsSync(SELF_STATE) ? readJson(SELF_STATE) : { skills: [] };
  const prevNames = new Set((previous.skills || []).map((item) => item.name));
  const nowNames = new Set(skills.map((item) => item.name));
  const added = skills.filter((item) => !prevNames.has(item.name)).length;
  const removed = (previous.skills || []).filter((item) => !nowNames.has(item.name)).length;

  fs.mkdirSync(path.dirname(SELF_STATE), { recursive: true });
  fs.writeFileSync(SELF_STATE, JSON.stringify({
    version: 1,
    templateVersion: TEMPLATE_VERSION,
    syncedAt: now.toISOString(),
    note: note || '',
    commit: git(['rev-parse', '--short', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    skills,
  }, null, 2) + '\n', 'utf8');

  const trackCount = skills.filter((item) => item.mode === 'track').length;
  const specCount = skills.filter((item) => item.mode === 'spec').length;
  const block = [
    AUTO_START,
    '- Шаблон: v' + TEMPLATE_VERSION + ' · синхронизировано ' + stamp(now) + ' (' + (git(['rev-parse', '--abbrev-ref', 'HEAD']) || '—') + ' @ ' + (git(['rev-parse', '--short', 'HEAD']) || '—') + ')',
    '- Управляемых навыков: ' + skills.length + ' · track: ' + trackCount + ' · spec: ' + specCount,
    '- Навыки: ' + (skills.map((item) => item.name + ' (' + item.mode + ')').join(', ') || '—'),
    '- Нарушений стандарта: ' + skills.filter((item) => item.errors > 0).length,
    AUTO_END,
  ].join('\n');
  const skillMd = fs.readFileSync(SELF_SKILL_MD, 'utf8');
  const from = skillMd.indexOf(AUTO_START);
  const to = skillMd.indexOf(AUTO_END);
  if (from < 0 || to < 0 || to < from) throw new Error('в SKILL.md нет маркеров ' + AUTO_START + ' ... ' + AUTO_END);
  fs.writeFileSync(SELF_SKILL_MD, skillMd.slice(0, from) + block + skillMd.slice(to + AUTO_END.length), 'utf8');

  if (!fs.existsSync(SELF_CHANGELOG)) {
    fs.writeFileSync(SELF_CHANGELOG, '# Журнал изменений «forge»\n\nAppend-only. Пишет forge.cjs --update "<note>".\n', 'utf8');
  }
  fs.appendFileSync(SELF_CHANGELOG, '\n- ' + stamp(now) + ' — ' + (note || 'фиксация состояния') +
    '; навыков: ' + skills.length + ' (+' + added + '/-' + removed + '), нарушений: ' +
    skills.filter((item) => item.errors > 0).length + '\n', 'utf8');

  console.log('[FORGE][UPDATED] шаблон v' + TEMPLATE_VERSION + ' · навыков: ' + skills.length +
    ' (+' + added + '/-' + removed + ') · state/AUTO/CHANGELOG обновлены.');
}

function cmdUpgrade(flags) {
  const name = flags._[0];
  if (!name) throw new Error('нужно имя навыка: forge upgrade <name>');
  const rootDir = flags.root ? path.resolve(ROOT, flags.root) : SKILLS_DIR;
  const file = path.join(rootDir, name, 'SKILL.md');
  if (!fs.existsSync(file)) throw new Error('нет навыка: ' + rel(file));
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes('<!-- FORGE:MANAGED')) {
    text = text.replace(/^(# .+)$/m, '$1\n\n<!-- FORGE:MANAGED mode=spec -->');
  }
  const dir = path.dirname(file);
  if (text.includes(AUTONOMY_START)) {
    const from = text.indexOf(AUTONOMY_START);
    const to = text.indexOf(AUTONOMY_END);
    if (to < from) throw new Error('повреждены маркеры автономии: ' + rel(file));
    text = text.slice(0, from) + autonomyBlock() + text.slice(to + AUTONOMY_END.length);
    fs.writeFileSync(file, text, 'utf8');
    const created = ensureChangelog(dir, name);
    console.log('[FORGE][UPGRADED] ' + rel(file) + ' · блок автономии обновлён.' + (created ? ' CHANGELOG.md создан.' : ''));
    return;
  }
  if (/^#{1,3}\s+Автономия/m.test(text)) {
    const created = ensureChangelog(dir, name);
    console.log('[FORGE][SKIP] ' + rel(file) + ' · автономия уже описана вручную, маркеры не добавлены.' + (created ? ' CHANGELOG.md создан.' : ''));
    return;
  }
  text = text.replace(/\n(?=## )/, '\n' + autonomyBlock() + '\n\n');
  fs.writeFileSync(file, text, 'utf8');
  const created = ensureChangelog(dir, name);
  console.log('[FORGE][UPGRADED] ' + rel(file) + ' · блок автономии внедрён.' + (created ? ' CHANGELOG.md создан.' : ''));
}

module.exports = { cmdUpdate, cmdUpgrade };

'use strict';

// Генерация нового навыка и эталонного брифа.

const fs = require('node:fs');
const path = require('node:path');
const { ROOT, SKILLS_DIR, rel, readJson, stamp } = require('./cli.cjs');
const { normSpec } = require('./spec.cjs');
const { renderSkill, renderContracts, renderTrack } = require('./render.cjs');

function cmdNew(flags) {
  if (!flags.spec || flags.spec === true) throw new Error('нужен --spec <file.json> (эталон: forge spec)');
  const spec = normSpec(readJson(path.resolve(ROOT, flags.spec)));
  const outBase = flags.out ? path.resolve(ROOT, flags.out) : SKILLS_DIR;
  const target = path.join(outBase, spec.name);
  const files = [
    ['SKILL.md', renderSkill(spec)],
    [path.join('references', 'contracts.md'), renderContracts(spec)],
    ['CHANGELOG.md', '# Журнал изменений «' + spec.title + '»\n\nAppend-only. Пишет трекер/протокол навыка.\n\n- ' +
      stamp(new Date()) + ' — навык создан через forge (tracking=' + spec.tracking + '): ' + spec.purpose + '\n'],
  ];
  if (spec.tracking === 'track') files.push([path.join('scripts', 'track.cjs'), renderTrack(spec)]);

  if (fs.existsSync(target) && !flags.force) {
    throw new Error('каталог уже существует: ' + rel(target) + ' (перезапись — --force)');
  }
  for (const [name, content] of files) {
    if (flags['dry-run']) {
      console.log('  + ' + rel(path.join(target, name)));
    } else {
      fs.mkdirSync(path.dirname(path.join(target, name)), { recursive: true });
      fs.writeFileSync(path.join(target, name), content, 'utf8');
    }
  }
  if (flags['dry-run']) {
    console.log('[FORGE] dry-run: ' + rel(target) + ' · ' + files.length + ' файл(ов)');
    return;
  }
  console.log('[FORGE][NEW] ' + rel(target) + ' · ' + files.length + ' файл(ов), tracking=' + spec.tracking);
  if (spec.tracking === 'track') {
    console.log('Далее: node ' + rel(path.join(target, 'scripts', 'track.cjs')) + ' --update "baseline"');
  } else {
    console.log('Далее: заполнить контракт и первую строку CHANGELOG.md (baseline не ведётся).');
  }
  console.log('Проверка: node .agents/skills/forge/scripts/forge.cjs check');
}

function cmdSpec() {
  const example = {
    name: 'example',
    title: 'Пример навыка',
    purpose: 'Одна-две фразы: какую задачу решает навык и что считается результатом.',
    tracking: 'track',
    basis: { modules: ['src/shared'], ext: ['.ts'], maxLoc: 500 },
    triggers: ['/example', 'пример навыка'],
    invariants: ['Спецификация и реальное поведение не расходятся.'],
    gates: ['npx tsc --noEmit'],
    boundaries: ['Не меняет схему данных.'],
  };
  console.log(JSON.stringify(example, null, 2));
  console.log('');
  console.log('Обязательно: name, purpose, basis.modules (для tracking=track).');
  console.log('tracking: track (baseline по файлам) | spec (процедура без baseline).');
  console.log('Далее: node .agents/skills/forge/scripts/forge.cjs new --spec <file.json>');
}

module.exports = { cmdNew, cmdSpec };

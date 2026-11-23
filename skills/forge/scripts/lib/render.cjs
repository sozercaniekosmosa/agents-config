'use strict';

// Рендер артефактов сгенерированного навыка: SKILL.md, контракт, трекер.

const fs = require('node:fs');
const path = require('node:path');
const { markerOf, ESCALATION } = require('./spec.cjs');

const AUTONOMY_START = '<!-- FORGE:AUTONOMY:START -->';
const AUTONOMY_END = '<!-- FORGE:AUTONOMY:END -->';
const TRACK_TPL = path.join(__dirname, '..', 'templates', 'track.cjs.tpl');

function wrap(text, width) {
  const words = text.split(/\s+/);
  const rows = [];
  let row = '';
  for (const word of words) {
    if ((row + ' ' + word).trim().length > width && row) {
      rows.push(row);
      row = word;
    } else {
      row = (row + ' ' + word).trim();
    }
  }
  if (row) rows.push(row);
  return rows;
}

function autonomyBlock() {
  const lines = [AUTONOMY_START];
  lines.push('> Автономия: навык обновляет себя сам — без уведомлений, без пауз на согласование.');
  lines.push('> Синхронизация спецификации (`SKILL.md`, `references/contracts.md`, `CHANGELOG.md`, `state`) — в том же проходе, что и работа.');
  lines.push('');
  lines.push('### Автономно (без вопроса)');
  lines.push('');
  lines.push('- Правки спецификации, контракта, ловушек и рецептов по фактам работы.');
  lines.push('- Гейты запускаются автономно; красный гейт чинится, пока причина выводится из контракта.');
  lines.push('- Дрейф файлов относительно baseline на входе — работа, а не повод спросить.');
  lines.push('- Реестр эволюции и `CHANGELOG.md` пишутся сразу.');
  lines.push('');
  lines.push('### Эскалация (стоп, один вопрос, до ответа — только read-only)');
  lines.push('');
  for (const item of ESCALATION) lines.push('- ' + item);
  lines.push('');
  lines.push('Формат эскалации: 1 вопрос · варианты · рекомендация · последствие выбора.');
  lines.push(AUTONOMY_END);
  return lines.join('\n');
}

function quickStart(spec) {
  if (spec.tracking === 'track') {
    const script = '.agents/skills/' + spec.name + '/scripts/track.cjs';
    return [
      '## Быстрый старт',
      '',
      '| Команда | Действие |',
      '| --- | --- |',
      '| `node ' + script + '` | дрейф базы; exit 1 = база менялась |',
      '| `... --report` | инвентарь: файлы, LOC, крупнейший |',
      '| `... --audit [--strict]` | лимит размера, TODO-маркеры, барьели `src/**` |',
      '| `... --update "<что изменилось>"` | baseline + AUTO-блок + CHANGELOG |',
    ];
  }
  return [
    '## Как обновляется',
    '',
    '- Правка `SKILL.md` и `references/contracts.md` — в том же проходе, что и работа.',
    '- Строка в `CHANGELOG.md` — сразу.',
    '- Реестр эволюции: `node .agents/skills/observer/scripts/observer.cjs --log-history <scope> <trigger> <improvement>`.',
  ];
}

function renderSkill(spec) {
  const marker = markerOf(spec.name);
  const lines = [];
  lines.push('---');
  lines.push('name: ' + spec.name);
  lines.push('description: >');
  for (const row of wrap(spec.purpose, 92)) lines.push('  ' + row);
  lines.push('  Триггеры: ' + spec.triggers.join(', ') + '.');
  lines.push('argument-hint: "' + (spec.tracking === 'track' ? '[check|report|audit|update] (опционально; по умолчанию check)' : '[help] (опционально)') + '"');
  lines.push('---');
  lines.push('');
  lines.push('<!-- FORGE:MANAGED mode=' + spec.tracking + ' -->');
  lines.push('');
  lines.push('# ' + spec.title + ': контракт и протокол');
  lines.push('');
  lines.push('> [!IMPORTANT]');
  lines.push('> Изменение начинается с проверки базы и контракта, заканчивается синхронизацией спецификации.');
  lines.push('> Собственные артефакты навык обновляет сам; вопрос пользователю — только по пунктам эскалации.');
  lines.push('');
  lines.push('## Назначение');
  lines.push('');
  lines.push('- Задача: ' + spec.purpose);
  lines.push('- Самообновление: спецификация, `references/contracts.md` и `CHANGELOG.md` синхронизируются в том же проходе, что и работа.');
  lines.push('- Проверка: `node .agents/skills/forge/scripts/forge.cjs check`.');
  lines.push('');
  for (const row of quickStart(spec)) lines.push(row);
  lines.push('');
  if (spec.tracking === 'track') {
    lines.push('<!-- ' + marker + ':START -->');
    lines.push('- Baseline ещё не снят: выполнить `scripts/track.cjs --update "baseline"`.');
    lines.push('<!-- ' + marker + ':END -->');
    lines.push('');
  }
  lines.push('## Карта базы');
  lines.push('');
  if (spec.modules.length > 0) {
    lines.push('| Путь | Роль |');
    lines.push('| --- | --- |');
    for (const item of spec.modules) {
      lines.push('| `' + item + '` | ' + (spec.tracking === 'track' ? 'источник контракта, входит в baseline' : 'read-only контекст') + ' |');
    }
  } else {
    lines.push('- База: процедура и документы, baseline не ведётся.');
  }
  lines.push('');
  lines.push('## Протокол');
  lines.push('');
  lines.push('1. Вход: `forge check`, `git status`, контракт `references/contracts.md`; дрейф — работа, не повод спросить.');
  lines.push('2. Правки: сначала `references/contracts.md` (что меняется), затем спецификация и код.');
  lines.push('3. Верификация: гейты ниже, по возрастанию стоимости.');
  lines.push('4. Синхронизация: `CHANGELOG.md`, `state` (track), реестр эволюции — в том же проходе.');
  lines.push('5. Эскалация: спорный пункт → стоп и один вопрос до ответа.');
  lines.push('');
  lines.push('## Жёсткие инварианты');
  lines.push('');
  spec.invariants.forEach((item, index) => lines.push((index + 1) + '. ' + item));
  lines.push('');
  lines.push('## Гейты');
  lines.push('');
  const gates = ['`node .agents/skills/forge/scripts/forge.cjs check`'];
  if (spec.tracking === 'track') gates.push('`node .agents/skills/' + spec.name + '/scripts/track.cjs --check`');
  for (const gate of spec.gates) gates.push('`' + gate + '`');
  for (const gate of gates) lines.push('- ' + gate);
  lines.push('');
  lines.push('## Ловушки');
  lines.push('');
  if (spec.tracking === 'track') {
    lines.push('- Правка базы без `--update` даёт дрейф — это сигнал синхронизации, а не ошибка.');
    lines.push('- Baseline фиксирует хэши файлов, а не качество: гейты проверяют качество.');
  } else {
    lines.push('- Без baseline расхождение спецификации и реальности ловится только протоколом: правка без строки в CHANGELOG теряется.');
  }
  lines.push('');
  lines.push(autonomyBlock());
  lines.push('');
  lines.push('## Петля эволюции');
  lines.push('');
  lines.push('- Новый факт или класс поломки → правка этого файла и `references/contracts.md` в том же проходе.');
  lines.push('- Дефект проверок → правка трекера/протокола + строка в `CHANGELOG.md`.');
  lines.push('- Устаревшее требование → удалить, не копить дубли.');
  lines.push('');
  lines.push('## Границы');
  lines.push('');
  lines.push('- Не меняет код базы без явной задачи; наблюдение и спецификация — его основная работа.');
  for (const item of spec.boundaries) lines.push('- ' + item);
  lines.push('');
  return lines.join('\n');
}

function renderContracts(spec) {
  const lines = [];
  lines.push('# Контракт навыка «' + spec.title + '»');
  lines.push('');
  lines.push('Справочник для правок: что где лежит, что публично, что нельзя ломать.');
  lines.push('Обновлять при смене контракта; протокол и автономия — `../SKILL.md`.');
  lines.push('');
  lines.push('## 1. База');
  lines.push('');
  if (spec.modules.length > 0) {
    lines.push('| Путь | Ответственность |');
    lines.push('| --- | --- |');
    for (const item of spec.modules) lines.push('| `' + item + '` | уточняется при первой правке |');
  } else {
    lines.push('- Процедура/документы: ' + spec.purpose);
  }
  lines.push('');
  lines.push('## 2. Публичные точки входа');
  lines.push('');
  lines.push('- Команды и файлы навыка: заполняются при реализации, без заглушек.');
  lines.push('');
  lines.push('## 3. Жёсткие инварианты');
  lines.push('');
  spec.invariants.forEach((item, index) => lines.push((index + 1) + '. ' + item));
  lines.push('');
  lines.push('## 4. Ловушки');
  lines.push('');
  lines.push('- Заполнять только наблюдавшимися ограничениями; каждый пункт — воспроизводимый.');
  lines.push('');
  lines.push('## 5. Рецепты расширения');
  lines.push('');
  lines.push('1. Новое правило → инвариант в `SKILL.md` → гейт, который его проверяет.');
  lines.push('2. Новая зона базы → `basis.modules` в брифе → `track.cjs --update "baseline"` → реестр эволюции.');
  lines.push('');
  lines.push('## 6. Definition of done');
  lines.push('');
  lines.push('- `forge check` зелёный, baseline актуален, CHANGELOG получил строку.');
  lines.push('- Контракт отражает фактическое поведение; расхождение — дефект, а не долг.');
  lines.push('');
  return lines.join('\n');
}

function renderTrack(spec) {
  const template = fs.readFileSync(TRACK_TPL, 'utf8');
  const config = {
    name: spec.name,
    title: spec.title,
    marker: markerOf(spec.name),
    maxLoc: spec.maxLoc,
    modules: spec.modules,
    ext: spec.ext,
  };
  return template.replace('__CONFIG__', JSON.stringify(config, null, 2));
}

module.exports = { AUTONOMY_START, AUTONOMY_END, autonomyBlock, renderSkill, renderContracts, renderTrack };

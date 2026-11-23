'use strict';

// Нормализация брифа и эталонные константы стандарта самообновления.

const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./cli.cjs');

const MAX_LOC = 500;
const DEFAULT_EXT = ['.ts', '.tsx', '.mjs', '.cjs', '.js'];

const ESCALATION = [
  'Ломается публичный контракт или совместимость (данные, API, legacy).',
  'Поведение неоднозначно: варианты равно соответствуют правилам.',
  'Меняется эталон проверок (golden/baseline ожидаемых результатов).',
  'Деструктивные операции с данными или внешними системами.',
  'Проверка красная, причина не выводится из правил.',
  'Требуется обойти жёсткое правило или инвариант.',
];

const ANTI_PATTERNS = [
  [/с подтверждением пользователя/i, 'просит подтверждение — нарушает автономию'],
  [/после подтверждения пользователя/i, 'ждёт подтверждения — нарушает автономию'],
  [/предложить (пользователю )?обновлени[ея] навыка/i, 'предлагает обновление вместо автосинхронизации'],
  [/(запросить|требует)\s+разрешени[ея]/i, 'запрашивает разрешение на рутинное действие'],
  [/confirm (the )?changes? with (the )?user/i, 'asks approval for routine sync'],
];

const DEFAULT_INVARIANTS = [
  'Спецификация и реальное поведение не расходятся: изменение поведения → правка контракта в том же проходе.',
  'Секреты и приватные данные не попадают в отчёты, CHANGELOG и state.',
  'Разрушающие операции обратимы или проходят через эскалацию.',
];

const DEFAULT_BOUNDARIES = [
  'Работает только в своей зоне; чужие контракты меняются через эскалацию.',
  'Не выдумывает факты о базе: только проверяемые пути и наблюдавшиеся ограничения.',
];

function markerOf(name) {
  return 'AUTO:' + name.toUpperCase().replace(/-/g, '_');
}

function normSpec(raw) {
  const name = String(raw.name || '').trim().toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,31}$/.test(name)) throw new Error('name: kebab-case, a-z/0-9/дефис, 2–32 символа');
  const purpose = String(raw.purpose || '').trim();
  if (purpose.length < 10) throw new Error('purpose: нужно описание назначения (≥ 10 символов)');
  const title = String(raw.title || name).trim();
  const tracking = raw.tracking === 'spec' ? 'spec' : 'track';
  const basis = raw.basis || {};
  const modules = (Array.isArray(basis.modules) ? basis.modules : [])
    .map((item) => String(item).trim().replace(/\\/g, '/').replace(/\/+$/, ''))
    .filter(Boolean);
  if (tracking === 'track' && modules.length === 0) throw new Error('basis.modules: tracking=track требует хотя бы один путь');
  for (const item of modules) {
    if (!fs.existsSync(path.join(ROOT, item))) throw new Error('basis.modules: путь не найден — ' + item);
  }
  const triggers = (Array.isArray(raw.triggers) && raw.triggers.length > 0 ? raw.triggers : ['/' + name]).map((item) => String(item).trim());
  return {
    name,
    title,
    purpose,
    tracking,
    modules,
    ext: Array.isArray(basis.ext) && basis.ext.length > 0 ? basis.ext.map(String) : DEFAULT_EXT,
    maxLoc: Number(basis.maxLoc) > 0 ? Number(basis.maxLoc) : MAX_LOC,
    triggers,
    invariants: Array.isArray(raw.invariants) && raw.invariants.length > 0 ? raw.invariants.map(String) : DEFAULT_INVARIANTS,
    gates: Array.isArray(raw.gates) ? raw.gates.map(String) : [],
    boundaries: Array.isArray(raw.boundaries) && raw.boundaries.length > 0 ? raw.boundaries.map(String) : DEFAULT_BOUNDARIES,
  };
}

module.exports = { MAX_LOC, ESCALATION, ANTI_PATTERNS, markerOf, normSpec };

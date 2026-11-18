---
name: react-best-practices
description: >
  Приоритетные практики производительности клиентского React (Vite SPA): водопады запросов, bundle, TanStack Query,
  ре-рендеры, rendering, JS-микрооптимизации. Адаптация Vercel React Best Practices (70 правил) под FSD и TanStack Query;
  Next.js/RSC/SSR-рецепты исключены. Триггеры: /react-perf, "оптимизируй react", "почему тормозит компонент",
  "проверь ре-рендеры", "react performance", "профайлер".
---

# React Best Practices (адаптировано под проект)

База: Vercel React Best Practices, 70 правил, upstream commit `dc8367e6`, синхронизация 2026-11-18.
Upstream-правила лежат без изменений → `references/rules/`; проектная адаптация → `references/`.

## 1. Границы применимости

- Стек: React 19 + Vite (CSR/SPA), TanStack Query, Zustand, react-hook-form + Zod, styled-components, willykit-ui.
- Применять: `async-`, `bundle-`, `client-`, `rerender-`, `rendering-`, `js-`, `advanced-`.
- Не применять: `server-*`, `rendering-hydration-*`, `async-api-routes`, `async-dependencies`, `client-swr-dedup`.
- Полная матрица: [applicability.md](references/applicability.md) — 51 APPLY / 5 ADAPT / 14 SKIP.
- Конфликты с FSD/TanStack/Vite: [project-adaptations.md](references/project-adaptations.md).
- Чек-лист аудита: [checklist.md](references/checklist.md).

## 2. Приоритеты (адаптированные)

| # | Категория | Влияние | Первые шаги |
|---|---|---|---|
| 1 | Waterfalls | CRITICAL | Проверить последовательные `await`, prefetch, `useQueries` |
| 2 | Bundle | CRITICAL | Ленивые маршруты, тяжёлые библиотеки, статический импорт vendor |
| 3 | Client fetching | MEDIUM-HIGH | `staleTime`, `select`, дедупликация Query |
| 4 | Re-renders | MEDIUM | Селекторы Zustand, производное состояние, `memo` |
| 5 | Rendering | MEDIUM | `content-visibility`, Suspense, статичный JSX |
| 6 | JS | LOW-MEDIUM | Один проход, Map/Set, кэш в циклах |
| 7 | Advanced | LOW | `useEffectEvent`, ref-обработчики, init-once |

Категория `server` исключена: серверного рендеринга в SPA нет.

## 3. Алгоритм работы

1. Зафиксировать симптом и точку: Profiler/Performance panel, без догадок.
2. Найти правило в `applicability.md`; правило со статусом `SKIP` не применять.
3. Прочитать не более 3 файлов `references/rules/<name>.md` по текущему симптому.
4. Сформулировать минимальный патч: 1 проблема = 1 изменение, без попутного рефакторинга.
5. Проверить: `npx tsc --noEmit`, `npm run lint`, архитектурные гейты `npm run fsd`, `npm run check:deps`.
6. Повторить измерение; выигрыш не подтверждён → откатить патч (Zero Dead Code).

## 4. Железные правила

1. FSD public API (`index.ts`) важнее `bundle-barrel-imports`; deep import — только для vendor-пакетов с корректными типами.
2. TanStack Query вместо SWR; дедупликацию запросов не реализовывать вручную.
3. Не добавлять зависимости ради микрооптимизации (better-all, why-did-you-render).
4. Не переносить серверные/RSC-паттерны в SPA.
5. Не оптимизировать без измерения; `memo`/`useMemo` — только по факту ре-рендера.
6. Не нарушать ACL, слои и контракты из `docs/project-rules.md` и `docs/arhitecture.md`.
7. Перф-патч не меняет UX и контракты без согласования.

## 5. Интеграция с Quality Gates

- Точка подключения — проектный слой `docs/project-rules.md` (раздел Quality Gates): ссылка на [checklist.md](references/checklist.md).
- `/check` и `/resolve` читают проектные стандарты из `docs/` → чек-лист применяется без правок общих навыков.
- Автоматический минимум чек-листа: `node .agents/skills/react-best-practices/scripts/check-perf.cjs --src src` (перед коммитом — `--staged`, `--strict` — блокировка).
- `npm run doctor` (react-doctor) и `eslint-plugin-react-hooks` выполняются первыми; навык покрывает решения, которые линтер не видит.

## 6. Структура

```text
react-best-practices/
├── SKILL.md
├── NOTICE.md
├── references/
│   ├── applicability.md
│   ├── project-adaptations.md
│   ├── checklist.md
│   ├── upstream-manifest.json
│   └── rules/                 ← 70 правил + _sections/_template (upstream)
└── scripts/
    ├── check-perf.cjs
    └── sync-upstream.cjs
```

## 7. Обновление upstream

- `node .agents/skills/react-best-practices/scripts/sync-upstream.cjs --check` → показать дрейф правил.
- `node .agents/skills/react-best-practices/scripts/sync-upstream.cjs` → обновить `references/rules/` и manifest.
- После обновления сверить `applicability.md` с новыми/удалёнными правилами; новые правила без статуса → `SKIP`.

## 8. Петля Эволюции Навыка (Feedback Loop)

1. Симптом/правило не найдено → зафиксировать пробел и предложить минимальный diff `applicability.md`.
2. Источник правды по правилам — upstream `rules/`; проектная специфика — только в `references/`.
3. Смена стека (React 20, новый data-слой, SSR) → пересмотреть `APPLY/ADAPT/SKIP`.
4. Фиксация: `node .agents/skills/observer/scripts/observer.cjs --record <intent> react-best-practices <friction>`; архитектурные изменения → `--log-history`.
5. Обновление спецификаций — строго после подтверждения пользователя (`[CFON]`).

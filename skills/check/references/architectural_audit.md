# Архитектурный аудит (Architectural Audit Rules)

> ⚠️ **Единый источник правды (Single Source of Truth)**:
> Все архитектурные правила, контракты слоев, стандарты кода и правила взаимодействия модулей определены в директории `docs/`:
> - [docs/architecture.md](../../../docs/architecture.md) — слои Microkernel SDK, направленный граф зависимостей (DAG), контракты плагинов, ACL.
> - [docs/project-rules.md](../../../docs/project-rules.md) — правила Low Coupling & High Cohesion, стандарты React 19/TypeScript, правила дизайн-системы, валидация.
> - [docs/techdebt.md](../../../docs/techdebt.md) — реестр технического долга (запрет `// TODO` в коде).

При аудите кода проверять строгое соответствие правилам из `docs/`. Нарушение → стоп → запуск `debug` (см. Шаг 3 в `SKILL.md`).

---

## Чеклист архитектурного соответствия

### 1. Слои и Направленный граф зависимостей (DAG)
*(Источник: `docs/architecture.md#слои-архитектуры`, `docs/architecture.md#направленный-граф-зависимостей-dag`)*
- Иерархия слоев: `demo` → `components` → `canvas` → `store` → `plugins` → `kernel` → `model` → `schema` → `core` → `shared`.
- Запрещены обратные импорты из нижних/чистых слоев в верхние слои.
- Чистые вычислительные слои (`core/`, `schema/`, `model/`): строго 0 зависимостей от React, DOM, SVG и UI (`src/shared/ui`).
- Публичный API SDK: строго через `src/index.ts`. Глубокие импорты внутренних файлов модулей запрещены.

### 2. Изоляция плагинов и Low Coupling
*(Источник: `docs/project-rules.md#11-стандарты-low-coupling--high-cohesion`, `docs/architecture.md#принципы-low-coupling--high-cohesion`)*
- **Zero Cross-Imports**: строгий запрет прямых импортов между плагинами (`src/plugins/a !→ src/plugins/b`).
- Взаимодействие плагинов строго через `EventBus` ядра и фасад `PluginContext`.
- Создание плагинов строго через фабрику ядра `definePlugin()`.
- Регистрация и валидация: манифест плагина валидируется ядром через `PluginManifestSchema` в `kernel/`, а локальные схемы данных хранятся в `src/plugins/[name]/schema.ts`.
- Закон Деметры (Law of Demeter): запрет транзитивных цепочек вызовов (`a.b.c.d()`).
- Изоляция платформы: запрет прямых подписок плагинов на `window`/`document` в обход фасада ядра и жизненного цикла (`init` disposer / `destroy`).

### 3. Anti-Corruption Layer (ACL) & Runtime-валидация
*(Источник: `docs/project-rules.md#валидация-данных--acl`, `docs/architecture.md#валидация-и-изоляция`)*
- Все внешние данные графа валидируются через Zod-схемы на границе слоя `schema/`.
- Запрет проникновения сырых внешних DTO/JSON в UI и State → обязательные мапперы (`schemaToRuntimeGraph`, `runtimeGraphToSchema`).
- Безопасные fallbacks: при поврежденных данных графа или отсутствии кастомного рендерера отрисовывается безопасный fallback-узел ядра.

### 4. Дизайн-система и Стили (`src/shared/ui/`)
*(Источник: `docs/project-rules.md#ui--стили`, `docs/architecture.md#дизайн-система-и-базовые-ui-компоненты`)*
- Обязательное использование базовых компонентов из `src/shared/ui` (`Button`, `Input`, `Select`, `Modal`, `Icon` и др.). Запрет сырых HTML-тегов (`<button>`, `<input>`) и нативных браузерных диалогов (`alert`, `confirm`).
- Брендовая тематизация: оформление строго через токены бренда (`bg-brand`, `text-brand`, `border-brand`, `bg-brand-bg-subtle`, `bg-panel-bg`, `text-text-bright`, `border-border`). Запрещен хардкод цветов `indigo-*`, `slate-*`, `blue-*`.
- Запрещен `style={{...}}`, кроме динамических вычисляемых координат и размеров на Canvas.

### 5. Стандарты TypeScript & React 19
*(Источник: `docs/project-rules.md#2-react-19--typescript-57`)*
- Строгий TypeScript, полный запрет `any` и `as any`.
- `interface` для API/пропсов/контрактов (`NodeComponentProps`, `EdgeComponentProps`), `type` для union/вычислений.
- Запрет чтения `ref.current` в рендер-фазе JSX (`useLayoutEffect` / ResizeObserver / callbacks).
- Селекторы Zustand: доступ к store строго через селекторы.
- Именование: `PascalCase` (компоненты, типы), `camelCase` (переменные, хуки), `SCREAMING_SNAKE_CASE` (константы), `kebab-case` (файлы, папки).

### 6. Лимиты строк и организация файлов
- Обычные файлы / локальные модули: до 300 строк (свыше 300 → предупреждение `[!]`, свыше 500 → ошибка `[✗]`).
- Оркестраторы модулей/плагинов (`index.tsx`): до 800 строк.
- React Fast Refresh: компонентные файлы экспортируют только сам компонент; хелперы выносить в локальные `utils.ts` / `components.tsx`.

### 7. Zero Dead Code & Техдолг
*(Источник: `docs/project-rules.md#линтер--конвенции`, `docs/techdebt.md`, `.agents/AGENTS.md`)*
- Неиспользуемые импорты, типы, переменные и функции удаляются (префикс `_` не отменяет удаление).
- Запрет `// TODO` и `// FIXME` в коде: любой долг и компромисс регистрируется в `docs/techdebt.md`.
- Мертвые (не импортируемые) файлы удаляются.

### 8. Защита забандленных модулей (`.agents/skills/pak`)
- Запрещено анализировать, изменять или декодировать `index.js` модулей, заблокированных через `pak` (наличие `index.js` + `.archives/`).

---
name: guide
description: >
  Создание, обновление и аудит модульных спецификаций и карт архитектуры (guide.md) для плагинов и модулей.
  Триггеры: /guide, "обнови гайд", "актуализируй guide", "создай guide", "проверь гайд", "синхронизируй guide", "guide".
argument-hint: "[module-path] (опционально; по умолчанию автоопределение по активному файлу или git status)"
---

Анализ контекста и обновление или создание `guide.md` в целевой директории модуля/плагина (`[module-path]/guide.md`).

> [!IMPORTANT]
> **NO CONVERSATION FILES:** Запрещено создавать файлы в `.conversation/` или сессионные логи (`[prefix]-XX-...md`).
> Все спецификации, карты архитектуры, статусы фичей и контракты живут строго в `[module-path]/guide.md`.
> **NO XML TAGS:** Запрещено использовать устаревшие теги `<handoff_context>`, `<architecture_map>`, `<feature_status>`, блоки сессий (`## Сессия XX`). Формат — чистый GitHub Flavored Markdown.
> **ENGLISH ONLY FOR CONTENT:** Содержимое `guide.md` пишется строго на английском языке (минимизация токенов и высокая плотность).

## Структура `guide.md`

```markdown
# Plugin Specification: [Plugin Name]

> [!IMPORTANT]
> **CRITICAL AI DIRECTIVE / КРИТИЧЕСКАЯ ДИРЕКТИВА ИИ:**
> - **EN**: This file is strictly for **storing static context and architecture reference** of the plugin. It is **NOT** a guide to action, a task checklist, a development plan, or instructions to execute. Do **NOT** attempt to implement, modify, test, or run anything described in this file unless explicitly requested by the user. If this file is referenced in the chat prefix with two minuses (`-- [path]/guide.md`), the entire plugin is STRICTLY FORBIDDEN from being modified.
> - **RU**: Этот файл предназначен исключительно для **хранения статического контекста и описания архитектуры** плагина. Он **НЕ** является руководством к действию, списком задач, планом или инструкцией для выполнения. **ЗАПРЕЩЕНО** пытаться реализовывать, изменять, тестировать или запускать что-либо из описанного в этом файле без явного указания пользователя. Если на этот файл гайда ссылаются в чате с префиксом из двух минусов (`-- [path]/guide.md`), данный плагин СТРОГО ЗАПРЕЩЕНО изменять.

## File Architecture Map (`architecture_map`)
- `file.tsx` - [Responsibility description and key exports]

## Feature Status (`feature_status`)
- Feature A: [Active / In Progress / Deprecated status]

## Plugin Capabilities & Contracts (`plugin_capabilities_and_contracts`)
- **CONTRACT_SPEC**: [Runtime contract, boundary validation, exported store/service APIs, arguments and return types]
- **Implemented Adapters (Capabilities)**:
  - `adapterName` - [Methods, constraints, runtime validation behavior]

## Architectural Constraints & Rules (`architecture_and_constraints`)
- **Rule 1**: [Constraint description, capability contract, or gotcha]
```

## Пошаговый протокол выполнения (Workflow)

1. **Определение целевого модуля (Target Scoping)**:
   - Если передан аргумент: использовать указанный путь (`src/components`, `src/store` и т.д.).
   - Если аргумент не передан:
     - Проверить путь активного открытого файла пользователя.
     - Либо определить затронутые модули через `git status`.
     - При неоднозначности: уточнить у пользователя целевой модуль.
   - Изолировать путь: предотвращать выход за границы целевого модуля.

2. **Инспекция файлов и Zero Dead Info Audit**:
   - Просканировать файлы в директории модуля.
   - Сверить каждый файл в секции `architecture_map` с реальной файловой системой:
     - Удаленные/переименованные файлы → немедленно удалить из `guide.md`.
     - Новые файлы в модуле (`.ts`, `.tsx`, `.js`, etc.) → добавить с описанием назначения и экспортов.
   - Убедиться, что ссылки оформлены через относительные пути/код-блоки (напр. `tree/TreeEditor.tsx`), запрещено использовать абсолютные пути и схему `file:///`.

3. **Синхронизация контрактов и возможностей (Contracts & ACL)**:
   - Проанализировать публичные экспорты (`index.ts`, типы, схемы Zod, Zustand-сторы).
   - Обновить секцию `CONTRACT_SPEC` и `Implemented Adapters`.
   - Проверить правила изоляции слоев (DAG: `components` → `store` → `ai`/`fs` → `db` → `shared`).

4. **Разграничение с TROUBLESHOOTING.md**:
   - Баги, конфликты и логи инцидентов → фиксировать в `[module]/TROUBLESHOOTING.md` (append-only), запрещено помещать их в `guide.md`.
   - В `guide.md` фиксируются только архитектурные ограничения и правила в `architecture_and_constraints`.

5. **Форматирование и компрессия (Caveman Style)**:
   - Содержимое спецификации — строго на английском языке.
   - 1 факт = 1 строка.
   - Без дубликатов, без истории сессий, без диффов.

6. **Петля Эволюции Навыка (Feedback Loop)**:
   - Проверить, выявило ли обновление guide новые архитектурные требования или паттерны к навыку guide (новые типы файлов, шаблоны секций).
   - При расхождениях предложить пользователю актуализацию `.agents/skills/guide/SKILL.md` (`/learn` или подтверждение в чате).

## Скрипты и утилиты

- **Audit & Validation Script**: `.agents/skills/guide/scripts/audit-guide.cjs`
  - Валидация файлов на диске, поиск битых ссылок и незадокументированных файлов:
    `node .agents/skills/guide/scripts/audit-guide.cjs [target-dir]`
  - Пакетная проверка всех модулей проекта:
    `node .agents/skills/guide/scripts/audit-guide.cjs --all`
  - Автоматическое обновление карты файлов (`--fix`):
    `node .agents/skills/guide/scripts/audit-guide.cjs --fix [target-dir]`

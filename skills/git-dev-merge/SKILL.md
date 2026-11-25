---
name: git-dev-merge
description: >
  Пошаговый регламент подтягивания изменений из origin/develop в рабочую ветку (текущую или явно указанную в запросе)
  с проверками проекта GPNA.ISGTM-UI: tsc -b, eslint, steiger (FSD), dependency-cruiser, архитектурные и целевые vitest-тесты,
  и последующим пушем в origin (force-with-lease) без нарушения hook-ов веток.
  Триггеры: /git-dev-merge, "git-dev-merge", "забери ветку develop", "накати develop", "подтяни develop", "синхронизируй с develop".
---

# Навык `git-dev-merge`

Пошаговый регламент безопасного подтягивания изменений из `origin/develop` в рабочую ветку с обязательным прохождением Quality Gate.

---

## 🧷 Контекст репозитория (источник истины)

- **Репозиторий**: `atmus-gpna/GPNA.ISGTM-UI`, remote `origin`; базовая ветка `origin/develop`.
- **Push запрещен** в `develop` и `master` (`.husky/pre-push`) → синхронизация только рабочей ветки.
- **Ветки**: `feat|fix/<issue>-<slug>`, `chore|hotfix/<issue>-<slug>`, `release/<version>`; кириллица запрещена.
- **Quality Gate**: `npx tsc -b` (проект-ссылки) / `npm run build`; `npm run lint` (`eslint.config.mjs`); `npm run fsd` (Steiger); `npm run check:deps:all` (depcruise); `npm run test` (`vitest run`); `npm run doctor`.
- **Архитектурные тесты**: `src/test/architecture.test.ts`, `src/test/willykit-tokens.test.ts`.
- **E2E**: `tests/integration/*.spec.ts`, Playwright сам поднимает dev-сервер (`webServer`).
- **Approval-политика**: системные approval отключены → `sandbox_permissions` не запрашивать; команда упала по доступу → стоп + отчет.

---

## 📍 Шаг 1: Определение целевой ветки и получение обновлений

1. **Определение целевой ветки (`<target_branch>`)**:
   - Если в запросе указана ветка (например, `/git-dev-merge feat/691-name`, «накати develop на feat/691-name»):
     - `git branch --show-current` → сравнить с указанной.
     - Отличается → проверить чистоту дерева (`git status --short`); есть незакоммиченные файлы → предложить `git stash` или коммит.
     - Переключиться: `git checkout <target_branch>`.
   - Ветка не указана → целевая = текущая активная.
   - **Guard**: `<target_branch>` ∈ {`develop`, `master`} → СТОП: синхронизация базовой ветки не выполняется, предложить рабочую ветку.

2. **Проверка чистоты рабочего дерева**:
   ```powershell
   git status --short
   ```
   - Есть незакоммиченные файлы → предложить `git stash` либо коммит перед продолжением.

3. **Получение обновлений develop**:
   ```powershell
   git fetch origin develop
   ```

4. **Проверка входящих коммитов**:
   ```powershell
   git log HEAD..origin/develop --oneline
   ```
   - Коммитов нет → сообщить «Ветка develop не содержит новых изменений относительно `<target_branch>`» и завершить.
   - Коммиты есть → вывести их список в чат.

---

## 📍 Шаг 2: Выбор стратегии накатывания изменений

Вывести в чат запрос на подтверждение стратегии:

```markdown
[CFON] Шаг 2/4. Выбор стратегии синхронизации с develop

**Целевая ветка:** `<target_branch>`
**Входящие коммиты из develop:**
<список_коммитов>

---

**Выберите стратегию:**
- **[Вариант 1] (Рекомендуется)**: `rebase` (`git rebase origin/develop`) — линейная история; обязателен `--force-with-lease` при пуше.
- **[Вариант 2]**: `merge` (`git merge origin/develop`) — merge-коммит; обычный push (если ветка уже опубликована).
```

- `rebase` → `git rebase origin/develop`.
- `merge` → `git merge origin/develop`.
- Конфликты → остановиться, локализовать конфликтные файлы и предложить варианты разрешения:
  - `entities`/`shared` контракт → приоритет контракта из `develop` + перегенерация мапперов/Zod-схем.
  - Конфликт в `src/shared/api/mocks/handlers.ts` → объединить оба набора хендлеров, не удалять чужие.
  - После разрешения: `git add <files>` → `git rebase --continue` / `git commit`.

---

## 📍 Шаг 3: Автоматический запуск Quality Gate

ОБЯЗАТЕЛЬНО запустить проверки интеграции (по согласию пользователя на прогон, `AGENTS.md`):

1. **Типы**:
   ```powershell
   npx tsc -b
   ```
   (`npm run build` = `tsc -b && vite build` — использовать, если нужна проверка сборки.)
2. **Lint**:
   ```powershell
   npm run lint
   ```
   (точечно: `npx eslint --no-cache <files>`.)
3. **FSD-архитектура**:
   ```powershell
   npm run fsd
   ```
4. **Зависимости**:
   ```powershell
   npm run check:deps:all
   ```
5. **Архитектурные тесты**:
   ```powershell
   npx vitest run src/test/architecture.test.ts
   npx vitest run src/test/willykit-tokens.test.ts
   ```
6. **Целевые тесты затронутых модулей** (при необходимости):
   ```powershell
   npx vitest run <path_to_tests>
   ```
7. **E2E** (при затрагивании UI):
   ```powershell
   npx playwright test tests/integration/<spec>.spec.ts
   ```

Любая ошибка → остановиться, вывести диагностику (`path/file.ext:Lnn → [issue]`) и исправить до пуша.
Полный suite (`npm run test`) и `npm run doctor` — только по отдельному запросу пользователя.

---

## 📍 Шаг 4: Выбор действия по отправке изменений в удаленный репозиторий

```markdown
[CFON] Шаг 4/4. Выбор действия по отправке изменений

**Целевая ветка:** `<target_branch>`
**Статус проверок Quality Gate:** ✅ Все проверки пройдены

---

**Выберите действие:**
- **[Вариант 1] (Прямой пуш)**:
  - При rebase: `git push origin <target_branch> --force-with-lease`
  - При merge: `git push origin <target_branch>`
- **[Вариант 2] (Amend + Force Push)**:
  `git commit --amend --no-edit` + `git push origin <target_branch> --force-with-lease`
  (только если ветка не шарится с коллегами)
- **[Вариант 3] (Не отправлять)**:
  оставить изменения локально.
```

- Вариант 1 → соответствующая команда пуша.
- Вариант 2 → `git commit --amend --no-edit` → `git push origin <target_branch> --force-with-lease`.
- Вариант 3 → завершить с отчетом о локальном состоянии.
- `pre-push` hook проверяет имя ветки и запрет push в `develop`/`master`; ошибка hook → исправить имя ветки, не обходить (`--no-verify` запрещен).
- После успешного пуша: открытый PR обновится автоматически → сообщить пользователю; при необходимости `gh pr view <n> --json mergeable,state`.

---

## 🔄 Петля Эволюции Навыка (Feedback Loop)

1. **Цель**: регламент синхронизации с `develop` всегда соответствует реальным скриптам `package.json`, hook-ам `.husky/` и набору архитектурных тестов `src/test/`.
2. **Ответственность Агента**:
   - Изменились скрипты (`fsd`, `check:deps*`, `lint`, `build`) или hook-и → предложить обновление Шагов 1/3 этого файла.
   - Добавлен новый архитектурный тест → добавить его в список Шага 3.
3. **Лог**: `node .agents/skills/observer/scripts/observer.cjs --log-history git-dev-merge <trigger> <improvement>`.

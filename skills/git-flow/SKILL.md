---
name: git-flow
description: >
  Пошаговый регламент Issue → Ветка → Коммит → PR для репозитория atmus-gpna/GPNA.ISGTM-UI.
  Базовая ветка origin/develop, ветки строго feat|fix/<issue>-<slug> (hook .husky/pre-push), RU Conventional Commits
  (commitlint), Quality Gate проекта (tsc -b, eslint, steiger, depcruise, vitest, playwright tests/integration),
  публикация через gh pr create --base develop.
  Триггеры: /git-flow, "подготовь коммит", "проверь pr", "создай pr", "git-flow".
---

# Навык `git-flow`

Пошаговый регламент: Issue → Ветка → Коммит → PR.
Авто-определение контекста (ветка, PR). При неоднозначности → вопрос.
Формат вывода в чат: двойной перенос строк, списки, разделители `---`.

---

## 🧷 Контекст репозитория (источник истины)

- **Репозиторий**: `atmus-gpna/GPNA.ISGTM-UI`, remote `origin`.
- **Базовая ветка**: `origin/develop` (все PR → `develop`); `master` → только релиз, push запрещен.
- **Ветки (hook `.husky/pre-push`)**: `^(feat|fix)/[0-9]+-[a-z0-9]+(-[a-z0-9]+)*$`; также `chore|hotfix/<issue>-<slug>`, `release/<version>`; кириллица → reject; `feature/`, `bugfix/` → reject.
- **Коммиты**: commitlint conventional; `type-enum` = build, chore, ci, docs, feat, fix, perf, refactor, revert, style, test; subject RU с заглавной, ≤72; hook `.husky/commit-msg` вырезает `Co-Authored-By:`.
- **pre-commit**: `npx lint-staged` → `eslint --cache` + `prettier --write` для `src/**`.
- **Quality Gate**: `npm run build` (`tsc -b && vite build`), `npm run lint`, `npm run fsd` (Steiger), `npm run check:deps:all` (depcruise), `npm run test` (vitest), `npm run doctor`.
- **Тесты**: Vitest → только чистая логика (мапперы, парсеры, хелперы); UI/сценарии → Playwright `tests/integration/*.spec.ts` (`testDir` из `playwright.config.ts`, `baseURL http://localhost:5173`, dev-сервер поднимает `webServer`).
- **Режим подтверждений**: системные approval-подсказки отключены → `sandbox_permissions` НЕ запрашивать; команда, упавшая по доступу, → стоп + отчет. Запрет `commit` / `push` / прогона тестов без явного согласия пользователя → правило проекта (`AGENTS.md`), не системный approval.

---

## 📍 Шаг 0: Создание/привязка Issue и выбор/создание ветки

Старт: СТРОГО запрос статуса Issue и выбор ветки.

### 1️⃣ Определение или создание Issue (ПЕРВЫЙ ЭТАП)

Проверить контекст (`git branch --show-current`, `gh pr view --json number,title,headRefName`) → запросить статус Issue.

**Шаблон запроса в чат (СТРОГО с двойным переносом строк между блоками):**

```markdown
[CFON] Шаг 0/5. Определение контекста задачи и привязка Issue

**Текущее состояние:**
- **Ветка:** `<current_branch>`
- **Связанный Issue:** `<issue_number | не привязан>`
- **Открытый PR:** `<#number | нет>`

---

**Выберите действие по Issue:**
- **[Вариант 1]**: Создать новый Issue (`gh issue create`)
- **[Вариант 2]**: Привязать существующий Issue (укажите `#<number>`)
- **[Вариант 3]**: Пропустить привязку Issue
```

- **Var 1 (Создать Issue)** → спросить источник title/body:
  - 1.1: Из ТЗ/сообщения чата.
  - 1.2: Из незакоммиченных изменений (`git status --short`, `git diff`).
  - 1.3: Свой вариант.

  **Правила создания Issue**:
  - Язык: строго русский (title + body).
  - Суть: только проблемы/требования, НЕ техническое решение.
  - Title: СТРОГО без префиксов (`fix`, `feat`).
  - Флаги: `--assignee "@me"`, `--label "<bug|enhancement|refactor>"`.
  - Согласование: ОБЯЗАТЕЛЬНО вывести title/body в чат → получить «Да» перед созданием.
  - Команда: `gh issue create --repo atmus-gpna/GPNA.ISGTM-UI --title "<title>" --body "<body>" --assignee "@me" --label "<label>"` → зафиксировать `#<issue_number>`.

- **Var 2** → зафиксировать указанный `#<issue_number>`.

---

### 2️⃣ Выбор/создание ветки

1. Текущая ветка: `git branch --show-current`.
2. Кандидаты (только форматы, проходящие `.husky/pre-push`):
   - Фичи: `feat/<issue_number>-<slug>`
   - Баги: `fix/<issue_number>-<slug>`
   - Прочее: `chore/<issue_number>-<slug>`, `hotfix/<issue_number>-<slug>`, `release/<version>`
   - Slug: lowercase latin + hyphen, без кириллицы.
   - Запрещено: `feature/*`, `bugfix/*`, ветки без номера Issue для feat/fix.

**Шаблон запроса в чат (СТРОГО с двойным переносом строк между блоками):**

```markdown
[CFON] Шаг 0/5. Выбор рабочей ветки

**Контекст задачи:**
- **Issue:** `#<issue_number>`
- **Текущая ветка:** `<current_branch>`

---

**Выберите вариант ветки:**
- **[Вариант 1]**: Использовать текущую ветку `<current_branch>` (проверить на соответствие hook-regex)
- **[Вариант 2]**: Создать новую ветку `feat/<issue_number>-<slug>` (или `fix/...` для багов)
- **[Вариант 3]**: Указать своё наименование ветки
```

3. При создании новой ветки (от `origin/develop`):
   - `git fetch origin develop`
   - `git checkout -b <branch_name> origin/develop`
   - Привязка к Issue (если доступна): `gh issue develop <issue_number> --name <branch_name>`.

---

## 📍 Шаг 1: Обязательный аудит, генерация и итеративное тестирование

🚨 **КРИТИЧЕСКИ: ПРОВЕРКИ И ТЕСТЫ ДОЛЖНЫ ПРОЙТИ 100%. Пропуск ЗАПРЕЩЕН.**

1. **Синхронизация & аудит**:
   - `git fetch origin` → база `origin/develop`.
   - `git log origin/develop..HEAD --oneline` → в истории НЕТ коммитов с `Co-Authored-By:` (hook вырезает, но проверить).
   - Дубли/ИИ-соавторы → `git reset --hard origin/develop` + `git cherry-pick`.

2. **Генерация тестов (Unit + E2E)**:
   - Скан измененных файлов на `*.test.ts` / `*.spec.ts`.
   - Слои `entities` (мапперы, контракты, pure-lib) → Vitest: новый тест обязателен при изменении контракта/DTO.
   - UI/сценарий (`features`, `widgets`, `pages`) → Playwright `tests/integration/<domain>.spec.ts`; unit-тесты React-компонентов запрещены правилами проекта.
   - Тесты не ослаблять: существующие ассерты не менять и не отключать.

3. **Сборка & Lint** (ДО тестов):
   - `npx tsc -b` (проект на проект-ссылках; `--noEmit` не применять к `-b`).
   - `npx eslint --no-cache <changed_files>`.
   - Архитектура: `npm run fsd`, `npm run check:deps:all` (слои FSD, кросс-импорты, циклы).
   - Контракты: Zod-схемы соответствуют моделям, DTO не течут из `entities`, `any`/deep imports отсутствуют.
   - Ошибки сборки/Lint → 100% фикс до запуска тестов.

4. **Contract-Test Sync**:
   - Правка Zod/DTO/маппера → обязательный прогон: `npx tsc -b`, `npx eslint --no-cache <files>`, `npx vitest run <test_file>`.
   - Коммит при падении lint/tests запрещен.

5. **Итеративный прогон (до 100% SUCCESS, точечно)**:
   - `npx vitest run <path>` → строго по затронутым файлам, весь suite (`npm run test`) локально не запускать.
   - `npx playwright test tests/integration/<spec>`.
   - Только по явному согласию пользователя на прогон тестов (`AGENTS.md`).
   - Ошибка → локализация → фикс → повтор до 0 ошибок.

6. **Отчет в чат (ОБЯЗАТЕЛЬНО)**:

```markdown
[CFON] Шаг 1/5. Результаты обязательного авто-тестирования

**Изменённые файлы:**
- `<filepath_1>`
- `<filepath_2>`

**Созданные/Актуализированные тесты:**
- `<test_filepath>`

**Результат прогона:**
- **Статус:** `100% SUCCESS` (0 ошибок)
- **Выполненные команды:**
  - `npx tsc -b`
  - `npx eslint --no-cache <path>`
  - `npm run fsd` / `npm run check:deps:all`
  - `npx vitest run <path>`
  - `npx playwright test tests/integration/<spec>`

---

Переходить к Шагу 2 (Аудит 100% сетевой изоляции E2E)? ("Да" / "Примени")
```

---

## 📍 Шаг 2: Аудит 100% сетевой изоляции E2E для CI (без VPN)

🚨 **КРИТИЧЕСКИ: ШАГ ОБЯЗАТЕЛЕН. Переход к коммиту (Шаг 4) без E2E с 100% изоляцией и 100% SUCCESS ЗАПРЕЩЕН.**

1. **База E2E (`tests/integration/`)**:
   - `playwright.config.ts`: `testDir: ./tests/integration`, `baseURL: http://localhost:5173`, `webServer: npm run dev` → сервер поднимается сам, внешний стенд не нужен.
   - Авторизация: `page.addInitScript` → `window.ENV.ssoEnabled = false`, `localStorage SSO_ENABLED=false`, `mock_user_role` (Viewer/Editor).
   - Данные: MSW (`MOCK_ENABLED=true`, handlers в `src/shared/api/mocks/handlers.ts`) или `page.route` / `context.route` с `route.fulfill()`.
2. **Изоляция сети**:
   - 100% мок REST API, реальные внешние URL/IP → `context.route("https://<host>/**", ...)`.
   - SignalR/WS/real-time → `route.abort()` или мок.
   - Никаких `page.waitForTimeout()`; ожидания только `expect(locator).toBeVisible()`.
3. **Локальный прогон & Chrome-error Check**:
   - `npx playwright test tests/integration/<spec>` → строго 100% SUCCESS.
   - `chrome-error://chromewebdata/` / таймаут → дополнить моки → перетестировать.
4. **Отчет в чат (СТРОГИЙ БЛОК)**:

```markdown
[CFON] Шаг 2/5. Аудит 100% сетевой изоляции E2E тестов для CI

**Статус E2E спеки:** `<создана / актуализирована / проверена существующая>`
**Файл спеки:** `tests/integration/<spec>.spec.ts`

**Сетевая изоляция и прогон:**
- **REST API:** 100% замоканы (MSW / `route.fulfill()`)
- **SignalR/WebSocket:** отключены
- **Внешние IP/URL:** замоканы через `context.route`
- **Результат локального запуска:** `npx playwright test <path>` → `100% SUCCESS`

---

Переходить к Шагу 3 (Инспекция статуса и нумерованный выбор файлов)? ("Да" / "Примени")
```

5. **Блок**: без «Да» / «Примени» `git commit` запрещен.

---

## 📍 Шаг 3: Инспекция статуса и нумерованный выбор файлов

1. `git status --short`.
2. Нумерованный список файлов в чат (`[Staged]`, `[Unstaged]`, `[Untracked]`).
3. Не индексировать: артефакты сборки, `test-results/`, `playwright-report/`, локальные `.env`.
4. **Запросить подтверждение**:

```markdown
[CFON] Шаг 3/5. Контекст: Ветка `<current_branch>`, Issue #<issue_number>

**Проверено состояние Git:**

1. `[Staged]` `<filepath_1>`
2. `[Unstaged]` `<filepath_2>`
3. `[Untracked]` `<filepath_3>`

---

Укажите номера файлов для индексации/исключения или подтвердите текущий состав для индексирования ("Да" / "Примени").
```

5. Корректировка индекса: `git add <file>`, `git reset <file>`.

---

## 📍 Шаг 4: Формирование и фиксация коммита (Amend vs Новый коммит)

1. Issue из Шага 0 → суффикс `(#<issue_number>)`.
2. **New Commit**: `<type>(<scope>): <Описание> (#<issue_number>)`
   - `type` ∈ {feat, fix, refactor, test, docs, style, chore, perf, ci, build, revert} (commitlint).
   - `scope` = слой/слайс: `entities/object-tree`, `features/unplanned-works`, `shared/api`.
   - Описание: RU, заглавная, пассивный перфект (Добавлен/Исправлен/Реализован/Создан/Обновлён), ≤72 символа, без точки.
   - Без `Co-Authored-By:` и AI-подписей.
3. **Amend**: `git commit --amend --no-edit` + `git push --force-with-lease` — только если ветка не шарится с коллегами.
4. При неоднозначности (Amend/New) → спросить в чате.
5. **Запросить подтверждение**:

```markdown
[CFON] Шаг 4/5. Подготовлен способ фиксации изменений

**Текущий контекст:**
- **Ветка:** `<current_branch>`
- **Issue:** `#<issue_number>`

---

**Выберите вариант фиксации коммита:**
- **[Вариант 1] (Рекомендуется)**: `git commit -m "<type>(<scope>): <Описание> (#<issue_number>)"`
- **[Вариант 2]**: `git commit --amend --no-edit` (дополнить текущий коммит PR)

---

Какую команду выполнить? Подтвердите выбор ("Вариант 1" / "Вариант 2").
```

6. Выполнить команду после «Да». `pre-commit` (`lint-staged`) должен пройти; hook не обходить (`--no-verify` запрещен).

---

## 📍 Шаг 5: Подготовка и публикация Pull Request (`git push` + `gh pr create`)

1. **Проверка PR** (`gh pr view --json number,baseRefName,isDraft`):
   - Amend → `git push origin <branch> --force-with-lease`.
   - New Commit (PR открыт) → `git push origin <branch>`.
   - Новый PR → `gh pr create --base develop`.
2. **Hooks**: `pre-push` проверяет имя ветки и запрет push в `develop`/`master`; ошибка hook → переименовать ветку (`git branch -m`), не обходить.
3. **Опциональный номер (СТРОГИЙ БЛОК)**: запросить номер-суффикс PR (напр. `108`). Без ответа `gh pr create` ЗАПРЕЩЕН.
4. **Заголовок PR**: без префиксов (`fix`, `feat`); формат `<Название фичи> (#<issue_number>)[ <user_number>]`.
5. **Лейблы**: авто-определение (`bug`, `enhancement`, `refactor`); `gh pr create ... --label "<label>"` или `gh pr edit <pr_number> --add-label "<label>"`.
6. **Флаги**: `--base develop`, `--assignee "@me"`, `--label "<label>"`, `--title "<Title> (#<issue>)[ <номер>]"`, `--body-file "pr-body.md"`. Короткое `--body` запрещено; `.md` по шаблону обязателен, после создания удалить временный файл (или оставить вне `src`).
7. **Шаблон описания PR (в `.md` файл)**:

```markdown
<Краткая суть изменений>

## Описание изменений

- Список выполненных изменений и доработок.

## Чек-лист

- [x] PR: направлен в правильную ветку (`develop`)
- [x] PR: назначен исполнитель PR и указаны нужные лейблы
- [x] PR: проверен diff, ничего лишнего в PR не попало
- [x] PR: прилинкованы затронутые issue и связанные PR
- [x] PR: есть описание изменений
- [<has_tests_check>] Тесты: новый функционал и исправленные баги покрыты тестами

Closes #<issue_number>

## Опционально

- [x] Коммиты: проименованы в соответствии с conventionalcommits v1.0.0
```

*(<has_tests_check> = `x` если unit/e2e тесты реально написаны/уже были в Шаге 1, иначе пусто.)*

8. **Запросить подтверждение**:

```markdown
[CFON] Шаг 5/5. Подготовка и публикация Pull Request

**Проект PR:**
- **Title:** `<Название фичи без префикса> (#<issue_number>)`
- **Base:** `develop`
- **Ветка:** `<current_branch>`

---

**⚠️ Необходимо указать опциональный номер для конца заголовка PR (если применимо).**

Выберите действие:
- **[Вариант 1]**: Создать PR без номера
- **[Вариант 2]**: Указать номер (напишите число, например `119`)
```

---

## 🛠️ Справочник

- **Репозиторий/база**: `atmus-gpna/GPNA.ISGTM-UI` → `develop`; `gh` ≥ 2.95 доступен.
- **Контекст**: динамический (`git branch --show-current`, `gh pr view`). Нет хардкода ветки/PR.
- **Типы коммитов**: строго `commitlint.config.js` (`type-enum`).
- **Автозакрытие**: `Closes #<issue_number>`.
- **Правила проекта**: `AGENTS.md`, `docs/project-rules.md`, `docs/arhitecture.md`, `.agents/AGENTS.md`.
- **CFON**: см. `.agents/AGENTS.md`.

## 🔄 Петля Эволюции Навыка (Feedback Loop)

- При завершении цикла PR/коммита сверить регламент с реальными hook-ами (`.husky/pre-commit`, `commit-msg`, `pre-push`) и скриптами `package.json`.
- Изменились hook-и/скрипты/базовая ветка → предложить актуализацию этого файла (подтверждение в чате).
- Лог: `node .agents/skills/observer/scripts/observer.cjs --log-history git-flow <trigger> <improvement>`.

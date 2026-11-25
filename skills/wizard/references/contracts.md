# Контракт «Мастера карточки» (cardWizard)

Справочник для правок: что где лежит, какие поля и функции публичны, что нельзя ломать.
Обновлять при смене контракта; протокол правок, автономия и эскалация — `../SKILL.md`.

## 1. Слои и баррели

| Слой | Каталог | Публичный баррель | Содержимое |
| --- | --- | --- | --- |
| shared | `src/shared/cardWizard/` | `index.ts` → types, engine, dialogue, review, options, schema, profiles, ui | профили, типы, движок, схема, тексты |
| ai | `src/ai/cardWizard/` | `index.ts` → types, context, schema, prompts, focus, elements, agent | контекст, промпты, JSON-контракты, детерминированные контроли, агент |
| store | `src/store/cardWizard/` | `index.ts` → `useCardWizardStore` | Zustand-сессия |
| components | `src/components/tree/card-wizard/` | `index.ts` → Host, Modal, Chat, Composer, MessageRow, StructurePanel | UI |
| db | `src/db/cardWizard.ts` | функции модуля db | JSON-сессия |
| tests | `scripts/wizard-golden/` | npm-скрипты `wizard:*` | регрессии esbuild→node |

- Направление зависимостей: `components → store → ai/fs → db → shared`.
- `shared` не импортирует ничего из проекта (Leaf Rule, проверяется `arch:check`).
- Внутри модуля компонент допустим прямой sibling-импорт; за пределы модуля — только баррель.

## 2. Профиль (`WizardProfile`, shared/types.ts)

| Поле | Смысл |
| --- | --- |
| `id`, `title` | идентификатор (ключ сессии) и заголовок |
| `matches` | `isWizardProfileMatch`: `idIncludes[]`, `titles[]`, `nodeTypes[]`, `parentType` |
| `slots[]` | `key, title, hint, ask, essential?, kind ('text'\|'list'), count?, prefill?` |
| `sections[]` | разделы итогового текста: `key, heading, kind, ordered?, maxItems?, countsSlot?, slots[]` |
| `context` | селекторы контекста проекта (общие параметры, персонажи, сцены, акты, арка, родитель, соседи) |
| `serialize` | правила сериализации контекста: `general[]`, `entityBlocks[]`, `scenes?`, `acts?`, `arc?`, `cardContent?`, `parent?`, `siblings?`, `maxChars` |
| `prompts` | `requestTags {step, compose, option, check, focus?}`, `*System` (`focusSystem?`), `answerTask`, `steerTask`, `composeTask`, `optionTask`, `checkTask`, `focusTask?`, `labels`, `fallbacks`, шаблоны с `{{TAG}}` |
| `ui` | `title, subtitle, applyButton`, опции: `draftStale?, editConfirm?, rechooseConfirm?, checkTitle?, checkInvalidate?, checkKeep?, checkClean?, invalidMark?` |
| `readyThreshold` | доля обязательных слотов для «готово» |
| `openingSlot?` | слот старта интервью: пока он неизвестен и в диалоге нет ни одного вопроса, мастер спрашивает именно его (логлайн в `plot_short`) |
| `apply` | `{ mode: 'replace' \| 'append' }` |
| `guided?` | Сценарий «по актам»: `header[]` (разделы над актами), `intro[]` (вопросы до меню), `topics[]` (пункты меню акта), `closing[]` (сводки после актов), `menuPriority[][]` (группы важности: 1 — зелёная точка, 2 — жёлтая, 3 — серая; меню сортируется по группам, внутри группы — позиция раздела в группе, а не порядок `topics`), `menuRecommendations{}` / `menuRecommendationsByAct{}` / `menuRecommendationsState{}` (мотивация рядом с кнопкой раздела: зачем его прорабатывать; нет — берётся `hint` слота), `actMinimum[]` (минимум разделов акта; нет поля — первая группа `menuPriority`, пустой массив — гейт выключен), `nextActBlockedHint` (`{sections}`), `nextActLabel`, `nextActHint`, `finishLabel`, `menuTitle`; меню, переходы и гейт строит `guided/*` |

- Профиль-анкета собирается фабрикой `profiles/profileBase.ts` → `createWizardProfile(spec)`: слоты, разделы, контекст, сериализация, правила сборки, `composeTask`, профильные принципы, теги и `WizardProfileUiSpec`. Промпты шага/сборки/вариантов/проверки, подписи и подстраховки — общие, поэтому новый мастер-анкета — это конфигурация, а не копия контракта.
- `WizardProfileUiSpec` (`types.ts`): обязательные `subtitle`, `structureLabel`, `readyMessage`, `emptyComposeError`; опциональные `applyButton`, `emptyError`. Заголовок профиля (`ui.title`) берётся из `profile.title`, подтверждение замены и сообщение о записи собираются фабрикой.

- `countSpec` (`WizardSlotCountSpec`): `min, max, default, mode` и необязательный `option` — ключ числового поля карточки (`quantEvents` у `scene_events`, `quantScene` у `act_scenes`). В `plot_short` количественных слотов нет: списки (повороты, события, места, предметы, второстепенные герои) собираются без `count` и `countsSlot`. Число элементов при открытии мастера берётся из карточки, а `default` остаётся подстраховкой; диапазоны слоя равны диапазонам поля карточки (1..25), дефолты полей — `DEFAULT_QUANT_EVENTS`/`DEFAULT_QUANT_SCENE` в `src/shared/nodeOptions.ts`.
- Реестр: `profiles/index.ts` → `WIZARD_PROFILES` (порядок = приоритет), `resolveWizardProfile(node)`, `getWizardProfileById(id)`.
- Дефолты текстов — `ui.ts` (`DEFAULT_WIZARD_*`); профиль может не задавать ни одного `ui`-текста.
- Реестр (13): `plot_short` (Сюжет кратко), `scene_short` (Краткое описание сцены, prose), `scene_events` (События сцены, счётный), `scene_setting` (Описание сцены), `act_scenes` (план сцен акта, счётный), `event_item` (событие бита, prose), `char_core`, `char_psycho`, `char_body`, `char_style`, `obj_core`, `obj_visual`, `obj_physical`. Карточки без профиля (концепт-арты, название кратко, связи) мастера не имеют — кнопка скрыта.
- `scene_short` обслуживает подраздел сцены `scene_short_desc`: матч по `idIncludes`/`titles` + `parentType: 'scene'`; удаление профиля скрывает Мастер у карточки, поэтому реестр обязан покрывать все карточки с осмысленным мастером.

## 3. Сессия и сообщения

`WizardSession` (персистится целиком):

| Поле | Смысл |
| --- | --- |
| `nodeId, projectId, profileId` | ключ и профиль |
| `messages[]` | лента реплик — источник истины |
| `suggestions[]` | подсказки автора (не факты) |
| `progress` | 0..100 из `computeWizardProgress` |
| `draftSummary` | собранный текст |
| `summary` | структурированный итог (раздел → текст/список) |
| `sectionCounts` | желаемое число элементов счётных слотов (сверено с карточкой при открытии) |
| `sectionCountsFromCard` | значения полей карточки на момент последней сверки (default `{}` для legacy) |
| `dialogueRevision` | растёт при любом изменении ленты/пожеланий |
| `draftRevision` | ревизия на момент сборки; расхождение = черновик устарел |
| `check` | `WizardDialogueCheck \| null` — актуальна только на своей ревизии |
| `updatedAt` | время записи |

`WizardMessage`: `id, role ('assistant'\|'user'), text, createdAt, facts?, questionSlot?, options?, optionPriorities?, kind? ('answer'\|'question'), answersMessageId?, optionIndex?, menu?, menuKeys?, actIndex?, actTotal?, closing?, continuation?` — `menu: true` помечает навигационное меню акта (в нём только разделы), `menuKeys` параллельны `options` (`slot:<key>` | `next-act` | `finish` у legacy), `actIndex`/`actTotal` — место акта в арке, `closing` — финальная сводка, `continuation` — вопрос «допишите мысль». `optionPriorities` параллельны `options` (1–3 или null).
`WizardFact`: `slot, value, replace?` (`replace` — новое значение полностью заменяет слот).
`WizardConflict`: `messageId, slot?, reason`; `WizardDialogueCheck`: `revision, questionId, conflicts[], checkedAt`.
`WizardStatus`: `idle|loading|thinking|suggesting|composing|checking|error`; для ошибок стор помнит `errorStage: 'step'|'option'|'check'|'compose'`.

## 4. Store (`useCardWizardStore`)

Состояние: `isOpen, activeNodeId, profile, session, status, error, errorStage, facts, knownSlots, optionTargetId, checkTarget, canUndo, sectionCounts`.

| Действие | Контракт |
| --- | --- |
| `open(nodeId, profileId?)` | профиль по узлу, загрузка сессии, контекст, сверка числа элементов с карточкой, первый шаг при пустой ленте |
| `answer(text, meta?)` | ответ (вариант/правка/свой текст), факты, следующий шаг |
| `ask(text)` | вопрос/управление автора (не ответ) |
| `addOption(messageId)` | порция новых вариантов от ИИ к открытому вопросу |
| `editOption / removeOption / addOptionText` | правка/удаление/свой вариант; возвращают `WizardOptionIssue \| null` |
| `editMessage(messageId, text)` | правка отправленного ответа: ветка после него отбрасывается |
| `rechooseAnswer(messageId, optionIndex)` | замена на месте + пересчёт факта + проверка согласованности |
| `invalidateConflicts()` | усечение с первого невалидного ответа + новый вопрос |
| `dismissCheck()` | оставить поздние ответы, снять отчёт |
| `deleteFrom(messageId)` | удаление реплики и всей ветки после неё |
| `undo()` | одношаговый откат разрушительного шага |
| `compose()` | сборка текста (ИИ или локальный fallback); возвращает итог или `null` при ошибке |
| `reset()` | удалить диалог и начать заново |
| `setSectionCount(slot, count)` | пожелание по числу элементов + пересборка счётчика в открытом вопросе |

- Каждое разрушающее действие сначала пишет снимок в память (`rememberUndo`).
- Любая мутация ленты → `nextWizardDialogueRevision`, `check: null` (кроме самой проверки), затем persist.
- `isBusy` включает `'checking'`; UI не должен позволять вторую мутацию во время запроса.
- Ошибка запроса → `status: 'error'` + `errorStage`; `retry()` повторяет нужный запрос (в т.ч. `check` по `checkTarget`).

## 5. Детерминированный движок

- `collectWizardElements(profile, messages)` — replay ленты → элементы по слотам; ОДИН факт = ОДИН элемент. `mergeWizardElements` добавляет новые факты в карту (replace сбрасывает прежние).
- `collectWizardFacts(profile, messages)` — то же в виде `WizardKnownSlots` (элементы слота через `\n`); единственный источник фактов.
- `mergeWizardKnown`, `computeWizardProgress`, `computeWizardDeficits`, `isWizardReady` — прогресс и дефициты.
- `findActiveWizardQuestion`, `findWizardAnswer` — открытый вопрос и ответ на него.
- `pendingWizardOpeningSlot(profile, messages, isKnown)` — слот старта (`openingSlot`), пока он не известен и в диалоге ещё нет ни одного вопроса; после первого вопроса порядок обычный.
- `sanitizeWizardSectionCounts`, `formatWizardSectionCounts`, `formatWizardSectionProgress` — счётные слоты.
- `resolveWizardSectionCounts(profile, nodeOptions, storedCounts, appliedFromCard)` → `{ counts, fromCard }` — сверка числа элементов с карточкой: значение поля карточки перекрывает дефолт профиля и правку в мастере только тогда, когда поле в карточке изменилось после прошлой сверки (`sectionCountsFromCard`). Вне диапазона слоя число зажимается, строка с числом принимается.
- `sanitizeWizardCardCounts(profile, value)` — допуск снимка карточки из JSON сессии: чужие слоты и значения вне диапазона отбрасываются.
- `buildLocalWizardSummary`, `renderWizardSummary` — локальная сборка без ИИ.
- `truncateWizardMessages`, `countWizardMessagesAfter`, `editWizardAnswer`, `nextWizardDialogueRevision`, `isWizardDraftStale` — работа с веткой и ревизиями.
- `splitWizardItems`, `getWizardSlot`, `isWizardSlotKey`, `countableWizardSlots`, `nextUncoveredWizardSlot` — слоты.
- Гид по актам (`shared/cardWizard/guided/*`): `resolveWizardActs` (акты проекта → этапы арки → один виртуальный акт), `currentWizardActIndex`, `isWizardMenuMessage`, `resolveGuidedCommand` (одна команда следующего шага: `question`/`menu`/`closing`/`ready`/`reply`), `nextWizardGuidedTarget` (интро → меню), `chronologicalWizardGuidedTopics` (порядок сюжета минус intro/closing), `pendingWizardIntroSlot` / `pendingWizardClosingSlot`, `isWizardRequiredSlot`, `isWizardClosingMessage`, `pendingWizardGuidedFact` (ответ = один элемент раздела), `mergeWizardGuidedFact`, `isUnfinishedWizardAnswer` (многоточие → дописать мысль). Меню (`menu.ts`): `wizardMenuPriorities`, `buildWizardMenuItems` (сортировка по важности), `wizardMenuRecommendation`, `buildWizardMenuMessage` (только разделы), `refreshWizardMenuMessage` / `backfillWizardMenuPriorities`, `resolveWizardMenuChoice` (индекс или подпись; ключи legacy без `menuKeys` — по названию раздела, не по позиции). Кнопка акта — `resolveWizardActAction` (`kind`, `label`, `disabled`, `blockedHint`, `brief`).
- Гейт перехода по актам (`guided.ts`): `wizardActMinimumSlots(profile)` — явный `guided.actMinimum` или первая группа `menuPriority`; ключи вне `topics` отбрасываются, дубли схлопываются. `wizardActGate(profile, known)` → `{ minimum, missing }`: раздел минимума без единого элемента держит переход; `isWizardActGateOpen(gate)` — переход разрешён. Раздел считается разобранным и по значению карточки, и по ответу автора (known = предзаполнение + факты ленты). Гейт обязан применяться в двух местах одной функцией: disabled-чип в меню (`CardWizardAction`) и отказ действия стора `nextAct`; подсказка — `wizardActGateText(profile, titles)` (`nextActBlockedHint` / `DEFAULT_WIZARD_ACT_GATE_HINT`).
- `countWizardSlotElements(slot, base, elements)` — сколько элементов собрано: предзаполнение проекта + факты диалога, дедуп по нормализованному ключу и по префиксу имени («Зайц» ⊂ «Зайц — союзник»). Единственный счётчик для панели, промпта и дефицита.
- Предзаполнение проекта (`countWizardSlotItems`) режется по строкам, `;` и нумерации: список «1. … 2. …» в одну строку — это два элемента, а не один. Свободный текст ответов так не режется никогда.
- `listWizardSlotElements(slot, base, elements)` — те же элементы строкой на элемент: текст + `messageId` (null у предзаполнения проекта). `countWizardSlotElements` — её длина, поэтому счёт и список не расходятся.
- `collectWizardElementRefs(profile, messages)` — элементы со источником: `messageId` ответа автора, из которого извлечён факт (или вопрос, если ответа не было). Единственный способ вести автора из панели в чат.
- `countWizardSlotItems(slot, value)` — разбор только предзаполнения из проекта (форма известна: строки или запятые); для текста ответов не применяется.
- `computeWizardDeficits(profile, base, elements, counts)` и `formatWizardSectionProgress(profile, base, elements, counts)` принимают предзаполнение и карту элементов раздельно: слитый `known` для счёта не годится.
- `buildWizardElementQuestion(profile, slotKey, have, requested)` — детерминированный вопрос «Вопрос N из M — <раздел>: <ask>» по следующему элементу счётного слота.
- `refreshWizardElementQuestion(profile, messages, base, counts)` — переписывает счётчик в ОТКРЫТОМ вопросе, когда число элементов изменилось (поле карточки или «−/＋» панели): вопрос хранит число на момент генерации, иначе «Вопрос 1 из 5» спорит с панелью «0 из 3». Меняются только вопросы, собранные `buildWizardElementQuestion` (`isWizardElementQuestion`); свободный текст модели, отвеченный вопрос и неизменное число дают `null`.
- `formatWizardSectionProgress` для дефицита отдаёт номер следующего элемента («следующий вопрос — про 3-й элемент из 5, только ОДИН элемент за вопрос»), а не «нужен дополнительный вопрос»: пачка элементов в одном вопросе запрещена контрактом.
- `collectWizardAskedQuestions`, `formatWizardAskedQuestions` — выжимка «спрошено → что ответил автор» для промпта: транскрипт режется по длине, а эта сводка гарантирует, что модель видит прежние вопросы и ответы.
- `isRepeatedWizardQuestion` — повтор уже заданного вопроса: дословное совпадение нормализованного текста или близость формулировок (Жаккар значимых слов ≥ 0.8). Уточняющий вопрос по тому же слоту другой формулировкой повтором не считается.
- `guardWizardRepeatedQuestion` — детерминированная замена повтора: счётный дефицит → `openingSlot` → следующий незакрытый слот (сначала ключевой) → `ui.readyMessage`. `null` = вопрос уникален, ответ модели остаётся.

## 6. Варианты ответа (`options.ts`)

- Константы: `WIZARD_SUGGESTIONS_MIN = 6` (готовых вариантов к вопросу, верхней границы и предела панели нет), `WIZARD_OPTIONS_BATCH = 5` (порция «+ варианты»), `MAX_WIZARD_OPTION_CHARS = 400` (свой вариант).
- `WizardOptionIssue`: `empty|duplicate|bad-index|unchanged|busy|not-active|not-found|not-assistant`; лимита списка нет.
- `collectWizardOptions` — все уже звучавшие варианты (антидубль в промпте); `normalizeWizardOptionPriority` / `orderWizardOptionsByPriority` — метки и устойчивая сортировка.
- Добавление вариантов (`addOption` / `addOptionText`) разрешено у открытого вопроса И у уже отвеченного (`findWizardAnswer`): сначала дополнить список, потом перевыбрать. Гейт стора — `canAddOptionsTo`, UI — `canManage = active || answered`.
- Правка текста и удаление варианта — только у открытого вопроса (`findActiveWizardQuestion`): правка выбранного варианта переписывает ответ автора, это не должно происходить у исторических реплик.
- `normalizeWizardElementOptions` — вариант ответа сводится к одному элементу: сгруппированный список («1. … 2. …») отдаёт первый пункт, дубли схлопываются.
- `stripWizardAnswerAside` — снимает хвостовую ремарку модели о замысле из текста ответа: фрагмент после тире или в скобках срезается только когда начинается с метки приёма («так», «этим», «здесь»), называет ремесленный глагол (показываю, передаю, задаю…) и говорит от лица автора или про читателя; обычное авторское тире («Кай — картограф») остаётся. Применяется в `cleanModelText`, поэтому и варианты, и факты попадают в раздел без объяснения приёма.

## 7. Перевыбор и проверка (`review.ts`)

- `rechooseWizardAnswer(profile, messages, questionId, optionIndex)` → `{ok, rechoice} | {ok, reason}`; ответ заменяется на месте, `kind: 'answer'`, `optionIndex` обновляется.
- `healAnswerFact` (внутри) — переписывает факт слота в первой реплике мастера после ответа: первый факт слота = новое значение, дубли слота отбрасываются, прочие слоты не трогаются.
- `countWizardLaterAnswers` — считает ответы автора ПОСЛЕ ответа (не после вопроса).
- `collectWizardConflicts(profile, messages, questionId, candidates)` — фильтр: только реальные поздние реплики автора, без дублей, причина ≤ 240 символов, слот валиден, максимум 8.
- `activeWizardCheck(session)` — проверка только на текущей ревизии; `isWizardAnswerInvalid`, `findWizardConflictReason`, `firstInvalidatedWizardQuestionId`.
- Инвалидация — по кнопке: усечение с вопроса первого невалидного ответа + новый вопрос; UI блокирует «Применить», пока пометки не разобраны.

## 8. ИИ-агент (`cardWizardAgent`)

| Метод | Вход | Выход | Особенности |
| --- | --- | --- | --- |
| `nextStep` | `WizardStepRequest` (факты, known, сессия, контекст) | `WizardStepResult` (вопрос, варианты, факты) | факты с `replace`, fallback-вопрос, повтор вопроса подменяется guard-ом (ANSWER) |
| `addOption` | `WizardOptionRequest` | `WizardOptionResult` | порция новых вариантов, без повторов |
| `check` | `WizardCheckRequest` (messageId, previousText?) | `WizardCheckResult` | JSON-конфликты, ошибка при невалидном JSON |
| `compose` | `WizardComposeRequest` | `WizardComposeResult` | markdown/prose по `serialize` |
| `guidedQuestion` | `WizardFocusRequest` (слот + акт + `intro?`/`closing?`/`continuation?`) | `WizardFocusResult` (вопрос + 6+ вариантов) | промпт `buildWizardFocusPrompts`, JSON `{reply, suggestions}`; факты не извлекаются |

- Промпты: `buildWizardStepPrompts`, `buildWizardOptionPrompts`, `buildWizardCheckPrompts`, `buildWizardComposePrompts`; шаблоны уходят из профиля (`requestTags`). Шаг интервью несёт блок «ЧТО УЖЕ СПРОШЕНО И ОТВЕЧЕНО» (`askedQuestions` + `formatWizardAskedQuestions`) перед транскриптом, поэтому усечение истории не скрывает прежние вопросы и ответы.
- Промпты, где модель пишет варианты (`stepSystem`, `optionSystem`, `focusSystem` профиля), запрещают ремарки о замысле: вариант — только готовый ответ автора, приём должен быть виден из деталей, а не назван.
- `elements.ts` → `applyWizardElementControl`: детерминированный контроль счётных слотов поверх ответа модели. Перед дефицитом спрашивает `openingSlot`, если интервью ещё не начато; ответ автора на счётный вопрос фиксируется как элемент до выбора следующего вопроса. Вход — `baseKnown` (предзаполнение проекта), факты модели и лента; работает только в режиме ANSWER. Есть дефицит — `nextStep` подменяет текст вопроса на `buildWizardElementQuestion`, варианты ответа сводит к одному элементу, а ответ автора, не попавший в факты, фиксирует как элемент слота (страховка от повторного вопроса). Возвращает `null`, когда дефицита нет.
- `buildFallbackStepResult` при невалидном JSON спрашивает дефицитный слот поштучно, а не «первый незакрытый».
- JSON-схемы ответов — `src/ai/cardWizard/schema.ts`; невалидный ответ → исключение с русским текстом, не «пустой результат».
- Контекст проекта — `context.ts`: общие параметры, сущности, сцены/акты, арка, родитель, соседи; тяжёлые чтения не блокируют UI.
- Mock-режим: `src/ai/mockMode.ts`, включение — `localStorage['studiobook_ai_mock_mode'] = 'true'`; диспетчеризация по `requestTags` (`step/focus/option/check/compose`), `focus` отдаёт вопрос раздела и шесть вариантов без префикса акта. Пулы ответов — по категории профиля (`plot_short`, `char_*`, `obj_*`, сцена, акт, событие): новый профиль обязан получить пул, иначе UI показывает чужие по смыслу ответы. Новый тег = новая ветка mock; `wizard:profiles` прогоняет mock-шаг каждого профиля.

## 9. Персист (`src/db/cardWizard.ts`)

- `card_wizard_sessions(profile_id, node_id, project_id, state_json, updated_at)` — upsert по `profile_id + node_id`.
- Чтение legacy: `plot_wizard_sessions(node_id)` как fallback, только на чтение.
- Удаление: по паре ключей и по проекту.
- `loadWizardNodeInfo` отдаёт узел вместе с ACL-разобранными `options` (`parseNodeOptions`) — источник числовых пожеланий автора для сверки счётчиков.
- `wizardSessionSchema` + `parseWizardSession` — единственная точка допуска JSON: default для новых полей, null при невалидной записи.

## 10. UI (`components/tree/card-wizard`)

- `CardWizardHost` — связывает стор с деревом: «Применить в карточку» берёт свежий черновик, а если его нет или диалог изменился — сначала вызывает `compose()`, затем пишет текст по `applyMode`.
- `CardWizardModal` — шапка (заголовок, арка, чип текущего акта «Акт N из M: <этап>» для `guided`, «Черновик устарел», чип «Нужно переделать: N», статус, отмена/применить/закрыть), тело: чат + панель структуры. Отдельной кнопки сборки нет: сборка — часть применения.
- `CardWizardChat` — лента, подтверждения, панель проверки над полем ввода, состояния thinking/suggesting/composing/checking/error; `focusRequest` прокручивает ленту к сообщению и подсвечивает его кольцом (~2 с).
- `CardWizardMessageRow` — варианты, правка/удаление варианта, свой вариант, правка своего ответа, бейдж «Нужно переделать»; реплика — плоский блок (фон + выравнивание, без рамки и аватара): с вариантами ответа тянется на всю ленту, иначе ширина по содержимому.
- `CardWizardOptionsBlock` — варианты ответа = карточки ширины чтения: `grow basis-[300px] max-w-[420px]`, равные в строке, текст переносится (45–60 знаков); правка/свой вариант — поле той же ширины (420 px). Меню разделов возвращается раньше карточек: вертикальный список (точка приоритета + рекомендация по разделу, `menuRecommendations`), чипы остались только у перехода по акту. Чип перехода (`CardWizardActAction`) блокируется, пока не собран минимум акта: `disabled` + видимая строка подсказки и `title` с пустыми разделами (`wizardActGateText`); данные гейта собирает модалка, решение принимает `isWizardActGateOpen`.
- Метка приоритета — ЦВЕТНОЙ КРУЖОК вместо числа (прямое требование автора): зелёный = высший (отвечать первым), жёлтый = средний, серый = низший. Одна палитра (`emerald-400`/`amber-400`/`slate-500`) и одна подпись на оба места: у варианта ответа (`CardWizardOptionPriorityBadge`, 2.5 px) и в меню разделов (`CardWizardMenuPriorityDot`, 2 px). Числа 1/2/3 остаются только в данных и промптах; подписи/подсказки — `WIZARD_OPTION_PRIORITY_LABELS`/`_HINTS`, легенда — `ui.optionPriorityHint`. Новый текст метки о числах не упоминает.
- `CardWizardCheckPanel` — отчёт: конфликты + причина, «Оставить как есть», «Инвалидировать и переспросить»; чистая строка «Проверка пройдена».
- `CardWizardStructurePanel` — прогресс, арка, чек-лист слотов с −/＋, черновик; счётный слот раскрыт подпунктами: ОДИН элемент = ОДИН ряд (`listWizardSlotElements`), ряд из чата кликабелен → `onFocusElement(messageId)` → `focusRequest` в чате, ряд из предзаполнения проекта — только чтение.
- Стиль UI (жёсткое требование автора): плоские ряды, ОДИН уровень вложенности на блок — никаких карточек в карточках, рамок внутри рамок и декоративных плашек; «карточка варианта» — это плоская плашка на фоне ленты (заливка + радиус, без `ring`/`border`); шаг отступов 2/4/6/8 px (`gap-1..2`, `px-2..3`, `py-1..2`), крупные `p-3/p-4` в Мастере запрещены.
- Ширина чтения: длинный вариант не растягивается на всю ленту — карточка `basis-[300px] max-w-[420px]` с `grow`, поэтому строки укладываются в 45–60 знаков; `flex-1` вместе с `basis-[300px]` даёт `flex-basis:0%` и неровные карточки — только `grow` + `basis`.
- Шрифт Мастера (требование читаемости): реплики диалога 13 px, варианты ответа 12.5 px, заголовки панели структуры 12.5 px, значения и подсказки 11.5 px, служебные подписи (статусы, чипы, номера) 10–11 px; шапка модалки 11.5–14 px. Меньше 10 px текст в Мастере не опускается.
- Под вариантами футер «+ варианты · свой» показан у любого вопроса, где есть выбор: открытого (`active`) и уже отвеченного (`answered`) — у отвеченного он дополняет список для перевыбора; иконки правки/удаления — только у открытого.
- Сортировка вариантов пересчитывается при КАЖДОМ добавлении (`addWizardOptions`): слитый список устойчиво упорядочивается по метке (`wizardOptionPriorityOrder`, метка 1 → `null` последним), новый вариант встаёт на своё место по приоритету, а не в хвост. Индексы вариантов при этом переезжают → `optionIndex` ответов ремаппится тем же проходом (текст на новом месте не совпал → привязка снимается). Меню навигации не пересортировывается: его порядок — данные профиля, а `menuKeys` параллельны пунктам. Без единой метки порядок не меняется (legacy-сессии).
- Переключатель состояния реплики («показать варианты» ↔ «свернуть») — в правом нижнем углу реплики: свёрнутый вид — отдельная строка под вопросом с `justify-end`, развёрнутый — `ml-auto` последним элементом футера, без разделителя «·». Это переключатель вида, а не действие над вариантами: слева остаются «+ варианты · свой».
- Подсказка «любой другой вариант заменит этот ответ» под вариантами НЕ выводится: перевыбор объясняется в диалоге подтверждения (`wizardRechooseConfirmText`) и в отчёте проверки, а не постоянной строкой в ленте.
- Правило: компоненты получают данные и колбэки через props; прямых обращений к store/db нет.

## 11. Тесты (`scripts/wizard-golden`)

| Скрипт | Покрывает |
| --- | --- |
| `wizard:review` | перевыбор, факт-чек, конфликты, инвалидация, промпт проверки, mock |
| `wizard:options` | правка/удаление/добавление вариантов, промпт порции, контракт «не меньше 6» во всех профилях, отсутствие предела списка, блок «спрошено/отвечено» |
| `wizard:elements` | поштучный сбор счётных слотов (на счётном профиле): прогресс с номером элемента, детерминированный вопрос, варианты по одному элементу, страховка факта, антиповтор вопроса и выжимка «спрошено → ответ»; гид по актам: акты из проекта/арки, интро с пропуском заполненного, меню и его ключи, выбор пункта, next-act/finish, факт из ответа, обрезка меню, mock-вопрос |
| `wizard:dialogue` | усечение ветки, правка ответа, отмена, черновик |
| `wizard:golden` | промпты шага/сборки/вариантов/фокуса, меню и чип акта, факты, прогресс и итоговый текст `plot_short` vs baseline |
| `wizard:scene-smoke` | профиль сцены |
| `wizard:profiles` | все профили реестра: уникальность id/заголовков/тегов, матчинг своего узла и отсутствие перехвата чужого, ключи слотов и разделов, диапазоны счётчиков, сверка числа с карточкой, гейт минимума акта, legacy-сессия без новых полей, подстановки промптов, локальный итог, UI-тексты, mock-шаг (валидный JSON, 6+ уникальных вариантов) |

- Механика: `esbuild --bundle` → node; алиасы `@/shared` и `@/db` → `stubs/`.
- Baseline: `scripts/wizard-golden/baseline.card-wizard.json` (снимок `plot_short` через `capture.ts`); менять только осознанно и указывать причину. Legacy-модули `*/plotWizard` в golden не входят.
- Новый тест: `*.ts` + `*-check.mjs` (esbuild + node) + npm-скрипт `wizard:<name>`.

## 12. Рецепты расширения

1. **Новый слот**: `slots[]` профиля (`key, title, kind, required, countSpec?`) → `sections[].sources` (если попадает в текст) → чек-лист UI обновится сам → `wizard:golden` (baseline слотов не сравнивается, но прогресс/текст — да).
2. **Новый раздел текста**: `sections[]` (`format`, `sources`, `instructions`) → `serialize` (порядок/заголовки) → golden.
3. **Профиль с гид-сценарием**: `guided` в профиле (intro/topics/подписи) + `requestTags.focus`, `focusSystem`, `focusTask`; меню, переходы и захват факта делает `shared/cardWizard/guided.ts` + `requestGuidedNext` стора. Профиль без гид-сценария работает по чек-листу как раньше.
4. **Новый профиль**: `profiles/<name>.ts` по контракту → `WIZARD_PROFILES`. Профиль-анкета — это `createWizardProfile({ id, title, role, goal, matches, slots, sections, output, context, serialize, composeRules, composeTask, ui, tags })` из `profiles/profileBase.ts`; mock-режим работает по `requestTags` без новой ветки, `ui.title` берётся из `profile.title` → smoke `wizard:profiles` + golden (если нужен).
4. **Новый текст UI**: `ui.ts` default → поле в `WizardUiStrings` → `profile.ui` → тест в review/options не обязателен, но текст должен иметь fallback.
5. **Новое поле сессии**: `types.ts` → `wizardSessionSchema` (`.default(...)`) → `createEmptyWizardSession` → тест legacy-parse → persist не мигрирует.
6. **Новый запрос к ИИ**: `requestTags` + `*System`/`*Task` в профиле → `ai/types.ts` → `ai/schema.ts` → `prompts.ts` → `service.ts` → `mockMode.ts` → тест + golden при влиянии на промпты.
7. **Новое действие стора**: поле в интерфейсе → реализация с `rememberUndo` (если разрушает) → `dialogueRevision + 1` → persist → проброс в Host/Modal/Chat.
8. **Новый статус**: `WizardStatus` → `isBusy` → бейдж в Modal → индикатор в Chat → обработка ошибки (`errorStage`).

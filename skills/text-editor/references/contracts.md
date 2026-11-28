# Контракт навыка «Текстовый редактор документа»

Справочник для правок: что где лежит, что публично, что нельзя ломать.
Разделы между маркерами `GEN:…` перерисовывает `scripts/selfupdate.cjs` по фактам кода —
руками их не правят. Протокол и автономия — `../SKILL.md`.

## 1. База

<!-- GEN:BASE:START -->
| Файл | Назначение (шапка файла) |
| --- | --- |
| `src/components/editor/document/blocks/BlockCell.tsx` | Ячейка блока документа (TASK-doc-03): контур выбора, тулбар, ручки размера и содержимое вида. Вынесена из BlockList, чтобы список уровня был механико… |
| `src/components/editor/document/blocks/BlockHeightResizeHandle.tsx` | Ручка высоты контейнера-«Заполнителя» (ADR-0015): нижний край выбранного контейнера, курсор row-resize. Жест обрабатывает useContainerHeightResize, к… |
| `src/components/editor/document/blocks/BlockList.tsx` | Список блоков уровня (TASK-doc-03): сетка 12 колонок у корня и мозаика «Заполнителя» внутри контейнера, приём перетаскивания и раскладка уровня. Сама… |
| `src/components/editor/document/blocks/BlockPlaceholder.tsx` | Пустое состояние документа (TASK-doc-03): подсказка и вход в сборку каркаса из дерева проекта. Саму сборку реализует TASK-doc-08, кнопка вызывает её… |
| `src/components/editor/document/blocks/BlockRenderer.tsx` | Роутинг блоков документа по виду (TASK-doc-03). Виды блоков приходят из своих задач (TASK-doc-04…06) с единым контрактом props: выбор и режим просмот… |
| `src/components/editor/document/blocks/BlockResizeHandle.tsx` | Ручка ширины блока (TASK-doc-03): правый край выбранного блока, курсор col-resize. Жест обрабатывает useBlockResize, компонент отвечает только за вид… |
| `src/components/editor/document/blocks/BlockToolbar.tsx` | Тулбар выбранного блока (TASK-doc-03): выравнивание содержимого, ширина картинки, порядок в родителе, дублирование и удаление. Показывается над блоко… |
| `src/components/editor/document/blocks/ContainerBlock.tsx` | Контейнер документа (TASK-doc-06): необязательный заголовок, панель раскладки содержимого и собственный уровень блоков-ячеек. Вложенный список строит… |
| `src/components/editor/document/blocks/ContainerDropZone.tsx` | Зона приёма блоков в пустом контейнере (TASK-doc-06): пунктирная область min-h-24, подсветка допустимого дропа и подсказка о запрете вложенности на п… |
| `src/components/editor/document/blocks/ContainerLayoutControls.tsx` | Панель раскладки содержимого контейнера: у контейнера один режим — мозаика «Заполнителя» (ADR-0015), поэтому настраиваются только высота frame и поря… |
| `src/components/editor/document/blocks/documentBlocksContext.tsx` | Контекст слоя блоков (TASK-doc-03): режим просмотра, действия над деревом и состояние переноса/ресайза доступны на любой глубине вложенности, поэтому… |
| `src/components/editor/document/blocks/ImageBlock.tsx` | Блок изображения документа (TASK-doc-05): миниатюра ассета проекта, подпись, карандаш в левом верхнем углу, собственный размер картинки, неразрушающа… |
| `src/components/editor/document/blocks/ImageBlockActions.tsx` | Кнопки изображения документа: графический редактор, режим подрезки краёв и сброс подрезки. Вертикальный оверлей у левого верха кадра: места в потоке… |
| `src/components/editor/document/blocks/ImageBlockLightbox.tsx` | Lightbox блока изображения (TASK-doc-05): переиспользует общий ImageViewerModal (зум, стрелки, Esc только верхнего слоя — ADR-0005). Список — все изо… |
| `src/components/editor/document/blocks/ImageCaption.tsx` | Подпись изображения документа (ADR-0014): в редакторе это служебный оверлей у низа картинки — места в раскладке она не занимает и видна у выбранного… |
| `src/components/editor/document/blocks/ImageCropOverlay.tsx` | Наложение подрезки краёв картинки (неразрушающая подрезка). Кадр в этом режиме показывает исходник целиком, а затемнённые полосы — то, что будет срез… |
| `src/components/editor/document/blocks/SourceBadge.tsx` | Бейдж провенанса источника (TASK-doc-04): откуда пришёл текст блока, изменился ли источник и доступны ли «перейти к источнику» / «обновить из источни… |
| `src/components/editor/document/blocks/sourceState.ts` | Состояние провенанса источника (TASK-doc-04): «источник изменён» и «источник удалён» вычисляются по текущему тексту узла дерева (ADR-0004, ADR-0008).… |
| `src/components/editor/document/blocks/TextBlock.tsx` | Текстовый блок документа (TASK-doc-04): в покое — отрендеренный Markdown, при выборе — исходная разметка в textarea. Выравнивание применяется к конте… |
| `src/components/editor/document/blocks/TextBlockEditor.tsx` | Режим разметки текстового блока (TASK-doc-04): textarea с авто-ростом, моноширинным шрифтом и собственной ручкой высоты. Сохранение с дебаунсом 400 м… |
| `src/components/editor/document/build/buildDocumentFromTree.ts` | Сборка каркаса документа из дерева проекта (TASK-doc-08, ADR-0008): чистый модуль без React, стора и DOM, поэтому его поведение проверяется без брауз… |
| `src/components/editor/document/build/useBuildFromTree.ts` | Действие «Собрать из дерева» (TASK-doc-08, ADR-0008): подтверждение с числом добавляемых блоков, один шаг локальной истории и отчёт «добавлено / проп… |
| `src/components/editor/document/DocumentEditorModal.tsx` | Хост полноэкранного редактора документа: полноэкранный Modal, хедер, зона блоков, правая панель источников, футер и мостик к стору (открытие, автосей… |
| `src/components/editor/document/export/cropImageSource.ts` | Запекание подрезки для экспорта: в редакторе подрезка неразрушающая, но в скачанном файле видимая область должна быть настоящей картинкой. Здесь она… |
| `src/components/editor/document/export/documentOutline.ts` | Плоская раскадровка документа для экспорта (TASK-doc-08, ADR-0007): контейнеры разворачиваются на месте в заголовки уровней, блоки — в текст и изобра… |
| `src/components/editor/document/export/exportFileName.ts` | Имя файла экспорта (TASK-doc-08, ADR-0007): `<slug названия>-<YYYY-MM-DD>.zip\|html` и скачивание готового Blob без сервера. Слуг строится из любого а… |
| `src/components/editor/document/export/exportFormat.ts` | Формат экспорта документа (ADR-0007). Тип живёт в модуле экспорта, чтобы и хедер, и оркестратор скачивания ссылались на один контракт без циклическог… |
| `src/components/editor/document/export/exportHtml.ts` | Экспорт документа в один самодостаточный HTML-файл (TASK-doc-08, ADR-0007): изображения встраиваются data URL, стили — инлайн `<style>`, поэтому файл… |
| `src/components/editor/document/export/exportMarkdown.ts` | Экспорт документа в Markdown (TASK-doc-08, ADR-0007): ZIP с `document.md` и папкой `images/`, ссылки в разметке относительные. Заголовки уровней повт… |
| `src/components/editor/document/export/htmlEscape.ts` | Экранирование для самодостаточного HTML-экспорта (TASK-doc-08): страница собирается строкой, поэтому любой пользовательский текст проходит здесь, а н… |
| `src/components/editor/document/export/markdownToHtml.ts` | Markdown → HTML для экспорта (TASK-doc-08, ADR-0007): используется безопасный блочный парсер shared (без dangerouslySetInnerHTML), а здесь деревья ра… |
| `src/components/editor/document/export/useDocumentExport.ts` | Оркестратор экспорта документа (TASK-doc-08, ADR-0007): собирает карту ассетов проекта, вызывает выбранный формат, скачивает готовый Blob и переводит… |
| `src/components/editor/document/footer/DocumentFooter.tsx` | Футер текстового редактора: метрики документа и статус сохранения (ADR-0006). |
| `src/components/editor/document/header/AddBlockMenu.tsx` | Меню «+ Блок»: текстовый блок, изображение, контейнер (ADR-0006) и явное действие «Собрать из дерева» — каркас акт → сцена → событие (TASK-doc-08, AD… |
| `src/components/editor/document/header/DocumentHeader.tsx` | Хедер текстового редактора: название, история, режим просмотра, меню блоков, вставка из источника, экспорт, настройки документа и закрытие редактора… |
| `src/components/editor/document/header/DocumentSettingsModal.tsx` | Модальное окно настроек документа (ADR-0006): ширина полосы, сетка колонок и автосохранение. Это отдельный слой поверх редактора, а не всплывающий по… |
| `src/components/editor/document/header/ExportMenu.tsx` | Меню «Экспорт» (TASK-doc-08, ADR-0007): два формата — Markdown архивом с картинками и самодостаточный HTML. Компонент только выбирает формат: Blob, и… |
| `src/components/editor/document/header/usePopoverDismiss.ts` | Единое поведение всплывающих панелей хедера: закрытие по клику вне, Esc, а также по скроллу, колесу и началу перетаскивания (правило проекта). |
| `src/components/editor/document/hooks/documentDropGeometry.ts` | Геометрия переноса в документе: замер уровней сетки, группировка полос и индекс вставки под курсором. Модуль работает только с DOM (ни React, ни стор… |
| `src/components/editor/document/hooks/documentTreeOps.ts` | Чистые операции над деревом документа (TASK-doc-03…07): поиск родителя и позиции вставки, лимиты вложенности, клонирование поддерева, выравнивание ши… |
| `src/components/editor/document/hooks/useBlockDrag.ts` | Перенос блоков документа (TASK-doc-03): pointer events, порог начала движения, замер геометрии уровней не чаще 60 мс, подсветка запрещённого дропа и… |
| `src/components/editor/document/hooks/useBlockResize.ts` | Изменение ширины блока (TASK-doc-03): ручка справа, шаг — одна колонка сетки, живое превью до pointerup (один шаг истории), кламп контейнера по содер… |
| `src/components/editor/document/hooks/useContainerHeightResize.ts` | Высота контейнера-«Заполнителя» (ADR-0015): нижняя ручка, живое превью до pointerup и один шаг истории. Высота хранится в процентах от собственной ши… |
| `src/components/editor/document/hooks/useDocumentAutosave.ts` | Автосохранение документа в SQLite: дебаунс после правки, статус — в футере (ADR-0003). Таймер снимается при закрытии редактора и размонтировании. |
| `src/components/editor/document/hooks/useDocumentEditor/blockPatches.ts` | Правки одного блока документа: чистые функции «дерево + патч → новое дерево», чтобы хук действий оставался механикой истории, а правила слияния полей… |
| `src/components/editor/document/hooks/useDocumentEditor/index.ts` | Публичный контракт слоя действий документа: типы правок и хук единственной точки мутации дерева. Каталог сохранён барьелем, поэтому внешние импорты п… |
| `src/components/editor/document/hooks/useDocumentEditor/types.ts` | Контракт действий редактора документа (TASK-doc-03…07): типы правок блоков и сигнатуры единственной точки изменения дерева. Вынесены из хука, чтобы ф… |
| `src/components/editor/document/hooks/useDocumentEditor/useDocumentEditor.ts` | Действия редактора документа (TASK-doc-03…07): добавление, удаление, дублирование, перенос, ширина и выравнивание блоков, правки содержимого блоков,… |
| `src/components/editor/document/hooks/useDocumentHistory.ts` | Локальная история документа (ADR-0003): снимки дерева в сторе, глубина 50. В глобальный operation_log не пишется: undo документа не трогает дерево кн… |
| `src/components/editor/document/hooks/useDocumentHotkeys.ts` | Горячие клавиши открытого редактора документа: Esc (закрыть с подтверждением), Ctrl+Shift+E (закрыть), Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z — локальная ист… |
| `src/components/editor/document/hooks/useDocumentImageEditor.ts` | Контекст графического редактора для блока изображения (TASK-doc-05): узел-владелец ассета, сущности его сцены и предпросмотр вычисляются по дереву пр… |
| `src/components/editor/document/hooks/useDocumentMetrics.ts` | Метрики футера (ADR-0006): блоки, изображения, слова и знаки, покрытие актов и сцен. Тяжёлый обход дерева мемоизирован: в теле компонента считаются т… |
| `src/components/editor/document/hooks/useFillPanelResize.ts` | Ручной размер панели мозаики контейнера (ADR-0017): ручки ширины и высоты ячейки, живое превью до pointerup и один шаг истории. Жест переводит авто-р… |
| `src/components/editor/document/hooks/useFloatingPlateAnchor.ts` | Плавающая плашка контейнера (ADR-0017): плашка «Мозаика» и подпись пустого заголовка не должны уезжать за экран, когда контейнер выше окна. Позиция с… |
| `src/components/editor/document/hooks/useImageAspect.ts` | Пропорции картинок для мозаики «Заполнителя» (ADR-0015): полосы делят ширину по пропорциям детей, поэтому без naturalWidth / naturalHeight мозаику не… |
| `src/components/editor/document/hooks/useImageCropEdit.ts` | Подрезка краёв картинки в блоке: жест за ручку одного края, живое превью до pointerup и один шаг истории. Смещение указателя переводится в проценты и… |
| `src/components/editor/document/hooks/useImageWidthResize.ts` | Изменение ширины картинки внутри блока (TASK-doc-05): ручка в правом нижнем углу картинки, живое превью до pointerup и один шаг истории. Размер карти… |
| `src/components/editor/document/index.ts` | Публичный контракт модуля «текстовый редактор документа». Фундамент домена (типы, Zod-схемы, геометрия, упаковка полос) живёт в слое shared: его испо… |
| `src/components/editor/document/sources/documentSources.ts` | Сборка дерева источников для правой панели (TASK-doc-07) и признаков вставки. Модуль чистый: ни React, ни стор, ни слой db — структуры узла и ассета… |
| `src/components/editor/document/sources/sourceDrag.ts` | Контракт перетаскивания источника из правой панели в документ (TASK-doc-07). payload кладётся в dataTransfer под собственным MIME: так зона блоков от… |
| `src/components/editor/document/sources/SourceImageRow.tsx` | Строка изображения источника (TASK-doc-07): миниатюра ассета карточки «Концепт-арты» события или сцены с тем же object-cover поведением, что и в гале… |
| `src/components/editor/document/sources/SourcesPanel.tsx` | Правая зона редактора документа (TASK-doc-07): дерево источников акт → сцена → событие, поиск по названиям, счётчики «вставлено / всего», ресайз шири… |
| `src/components/editor/document/sources/SourcesTree.tsx` | Дерево источников (TASK-doc-07): акт → сцена → событие, свёрнутость узлов хранится в settings.collapsedSources, поиск подсвечивает названия, пустые с… |
| `src/components/editor/document/sources/SourceTextRow.tsx` | Строка текста источника (TASK-doc-07): превью поля «Литературное описание события», «+» в конец выбранного контейнера и drag-хэндл для вставки в пози… |
| `src/components/editor/document/sources/sourceTypes.ts` | Контракты правой панели источников (TASK-doc-07): тексты поля «Литературное описание события» и изображения карточек «Концепт-арты» — события и самой… |
| `src/components/editor/document/sources/useDocumentSources.ts` | Хук правой панели источников (TASK-doc-07): дерево акт → сцена → событие из узлов дерева проекта и ассетов карточки «Концепт-арты», плюс признаки уже… |
| `src/components/editor/document/sources/useSourceDrop.ts` | Приём источника из правой панели в документ (TASK-doc-07): зона блоков читает собственный MIME перетаскивания, считает позицию вставки по геометрии у… |
| `src/components/editor/document/sources/useSourceInsert.ts` | Действия вставки источника в документ (TASK-doc-07): «+» добавляет в конец выбранного контейнера (ADR-0006), перетаскивание — в позицию под курсором.… |
| `src/components/editor/document/sources/useSourcePanelResize.ts` | Ширина правой панели источников (TASK-doc-07): ручка на левом краю, живое превью до pointerup и одна запись в settings.sourcesPanelWidth по завершени… |
| `src/db/document.ts` | Репозиторий документа проекта: единственный владелец SQL-доступа к таблице documents (ADR-0003). RPC-контракт слоя: document_get / document_save / do… |
| `src/shared/document/index.ts` | Публичный контракт домена документа: типы, Zod-схемы, геометрия и упаковка полос. |
| `src/shared/document/layout/blockConstraints.ts` | Геометрия документа (ADR-0002): лимит вложенности контейнеров, кламп ширины блока и санитарная обработка порядка (циклы, дубли, осиротевшие ссылки). |
| `src/shared/document/layout/imageCrop.ts` | Геометрия неразрушающей подрезки изображения: значения краёв живут в блоке, а рамка и масштаб исходника внутри неё считаются здесь, чтобы UI не повто… |
| `src/shared/document/layout/packDocumentRows.ts` | Упаковка блоков в полосы сетки (ADR-0002). Чистый модуль без DOM. Семантика: блоки идут в порядке массива order; полоса набирается подряд идущими бло… |
| `src/shared/document/layout/packFillMosaic.ts` | Мозаика «Заполнителя» (ADR-0015): дети контейнера укладываются полосами, как панели комикса, и заполняют его прямоугольник целиком. Модуль чистый, бе… |
| `src/shared/document/schema.ts` | Zod-схемы документа: ACL-граница JSON из SQLite и любых внешних payload. Невалидное поле заменяется безопасным дефолтом, невалидный блок отбрасываетс… |
| `src/shared/document/sourceHash.ts` | Хэш снимка источника (ADR-0004): нужен только для ответа «источник изменился», поэтому детерминированный, синхронный и без Web Crypto. |
| `src/shared/document/types.ts` | Доменные типы документа (полноэкранный текстовый редактор). Живут в листовом слое shared: их используют и стор, и слой db (JSON-граница), поэтому тип… |
| `src/store/useDocumentStore.ts` | Стор полноэкранного редактора документа: открытое дерево блоков, локальная история действий (ADR-0003) и статус записи в SQLite для футера. |
<!-- GEN:BASE:END -->

Слои: `components → store → db → shared`; `shared` листовой (React, стор и db ему недоступны).
Домен обязан жить в `src/shared/document`, потому что стор и db импортируют его.

## 2. Модель данных (`@/shared/document`)

<!-- GEN:DATA:START -->
### Союзы типов

| Тип | Значения |
| --- | --- |
| `BlockAlign` | 'left' \\| 'center' \\| 'right' \\| 'stretch' |
| `BlockKind` | 'text' \\| 'image' \\| 'container' |
| `BlockLevel` | 0 \\| ContainerDepth |
| `ContainerDepth` | 1 \\| 2 \\| 3 \\| 4 \\| 5 |
| `DocumentExportFormat` | 'md' \\| 'html' |
| `DocumentSaveStatus` | 'saved' \\| 'saving' \\| 'error' |
| `DocumentWidth` | 'narrow' \\| 'medium' \\| 'wide' |

### Константы контракта

| Константа | Значение |
| --- | --- |
| `BLOCK_COLS` | 12 |
| `CONTAINER_HEIGHT_MAX` | 250 |
| `CONTAINER_HEIGHT_MIN` | 15 |
| `DEFAULT_CONTAINER_HEIGHT` | 60 |
| `DEFAULT_FILL_PANEL_HEIGHT` | 50 |
| `DEFAULT_FILL_PANEL_WIDTH` | 100 |
| `DEFAULT_IMAGE_WIDTH` | 100 |
| `DEFAULT_SOURCES_PANEL_WIDTH` | 320 |
| `DOCUMENT_AUTOSAVE_DELAY_MS` | 2500 |
| `DOCUMENT_HISTORY_LIMIT` | 50 |
| `FILL_CONTAINER_RATIO` | 1.6 |
| `FILL_CROP_TOLERANCE` | 0.15 |
| `FILL_FALLBACK_RATIO` | 1.5 |
| `FILL_MIN_PANEL_WIDTH` | 8 |
| `FILL_PANEL_HEIGHT_MAX` | 100 |
| `FILL_PANEL_HEIGHT_MIN` | 5 |
| `FILL_PANEL_WIDTH_MAX` | 100 |
| `FILL_PANEL_WIDTH_MIN` | FILL_MIN_PANEL_WIDTH |
| `FILL_TEXT_RATIO` | 2 |
| `IMAGE_CROP_MAX` | 45 |
<!-- GEN:DATA:END -->

- Провенанс: `BlockSourceRef` хранит `nodeId`, `fieldKey`, `capturedAt` и `capturedHash`; удалённый узел — «источник удалён», изменённый хэш — «источник изменён».
- Граница валидации: `documentTreeSchema`, `assertDocumentTree`, `parseDocumentTree` (битый JSON → `null`), `serializeDocumentTree`, `createEmptyDocumentTree`.
- Геометрия: `packDocumentRows` — упаковка полос с частично заполненной последней; `packFillMosaic` — мозаика «Заполнителя» (полосы, общий масштаб, допуск обрезки; ветка явных панелей по `size`); `clampSpan`; `clampContainerHeight`; `clampFillPanelWidth`; `clampFillPanelHeight`; `clampBlockFillSize`; `canNestContainer`; `childContainerDepth`; `containerSpanFloor`; `clampContainerSpan`; `normalizeDocumentTree`.

## 3. Стор (`@/store`)

<!-- GEN:STORE:START -->
- Состояние: `isOpen`, `projectId`, `tree`, `selectionId`, `history`, `historyIndex`, `saveStatus`, `lastSavedAt`, `savedTree`, `sourcesPanelWidth`.
- Действия: `open`, `close`, `load`, `save`, `setTree`, `undo`, `redo`, `selectBlock`, `setSourcesPanelWidth`.
- Селекторы: `selectCanRedo`, `selectCanUndo`, `selectHasUnsavedChanges`.
<!-- GEN:STORE:END -->

- `savedTree` — снимок, лежащий в SQLite: сравнение по ссылке, поэтому каждая правка обязана давать новое дерево.
- Локальная история в `operation_log` не пишется; `setTree(tree, { history: false })` меняет дерево без шага истории.

## 4. db (`@/db`)

<!-- GEN:DB:START -->
### RPC слоя db

| Функция | Файл |
| --- | --- |
| `documentGet` | `src/db/document.ts` |
| `documentSave` | `src/db/document.ts` |
| `documentReset` | `src/db/document.ts` |

### Таблица `documents`

| Колонка | Тип |
| --- | --- |
| `id` | TEXT |
| `project_id` | TEXT |
| `title` | TEXT |
| `blocks_json` | TEXT |
| `updated_at` | INTEGER |
<!-- GEN:DB:END -->

- Документ один на проект: upsert по `doc_<projectId>`, `updated_at` — время записи.
- `documentGet` отдаёт `null` при отсутствии записи и пустое дерево при битом `blocks_json`.

## 5. Публичные точки входа

<!-- GEN:API:START -->
### Домен: `src/shared/document`

- `layout/blockConstraints.ts`: `canNestContainer`, `childContainerDepth`, `clampBlockFillSize`, `clampContainerHeight`, `clampContainerSpan`, `clampFillPanelHeight`, `clampFillPanelWidth`, `clampImageWidth`, `clampSpan`, `containerSpanFloor` …
- `layout/imageCrop.ts`: `ImageCropEdge`, `ImageCropFitBox`, `ImageCropFrame`, `clampImageCrop`, `fitImageCropBox`, `imageCropFrame`, `isImageCropped`, `shiftImageCropEdge`
- `layout/packDocumentRows.ts`: `packDocumentRows`
- `layout/packFillMosaic.ts`: `FillMosaicCell`, `FillMosaicFit`, `FillMosaicItem`, `FillMosaicLayout`, `FillMosaicOptions`, `packFillMosaic`
- `schema.ts`: `assertDocumentTree`, `blockSchema`, `blockSourceRefSchema`, `clampSourcesPanelWidth`, `containerBlockSchema`, `createEmptyDocumentSettings`, `createEmptyDocumentTree`, `documentSettingsSchema`, `documentTreeSchema`, `imageBlockSchema` …
- `sourceHash.ts`: `hashSourceText`
- `types.ts`: `BLOCK_COLS`, `BLOCK_KIND_LABELS`, `Block`, `BlockAlign`, `BlockFillSize`, `BlockKind`, `BlockLevel`, `BlockSourceRef`, `CONTAINER_FILL_ORDER_LABELS`, `CONTAINER_HEIGHT_MAX` …

### Модуль: `src/components/editor/document`

| Каталог | Файлов | Экспорты |
| --- | --- | --- |
| `.` | 2 | `DocumentEditorModal`, `ImageBlockView`, `TextBlockView` |
| `blocks` | 20 | `BlockCell`, `BlockCellProps`, `BlockHeightResizeHandle`, `BlockHeightResizeHandleProps`, `BlockList`, `BlockListProps` … |
| `build` | 2 | `BuildFromTreeResult`, `BuildFromTreeActions`, `UseBuildFromTreeArgs` |
| `export` | 9 | `DocumentOutlineItem`, `DocumentExportFormat`, `DocumentExportActions` |
| `footer` | 1 | `DocumentFooter`, `DocumentFooterProps` |
| `header` | 5 | `AddBlockMenu`, `AddBlockMenuProps`, `DocumentHeader`, `DocumentHeaderProps`, `DocumentSettingsModal`, `DocumentSettingsModalProps` … |
| `hooks` | 19 | `BLOCK_CELL_SELECTOR`, `BlockDropTarget`, `DOCUMENT_LEVEL_SELECTOR`, `DOCUMENT_ROOT_LEVEL_SELECTOR`, `LevelChild`, `LevelGeometry` … |
| `sources` | 11 | `DocumentSourceAsset`, `DocumentSourceNode`, `DocumentSourcesSnapshot`, `InsertedSourcesSnapshot`, `SOURCE_DRAG_MIME`, `SourceDragPayload` … |
<!-- GEN:API:END -->

- `DocumentEditorModal` — хост модалки: лениво монтируется в `App.tsx`, открывается `useDocumentStore.getState().open()`, кнопка `PenLine` в `AppHeader` (`onOpenTextEditor`), хоткей Ctrl+Shift+E.
- `useDocumentEditor({ isReadOnly })` — единственная точка мутации дерева, одно действие = один шаг истории.
- `useDocumentSources()` — единственный источник правды панели и сборки: `{ groups, totalTexts, totalImages, insertedNodeIds, insertedAssetIds }`.
- `buildDocumentFromTree(groups, existing): { tree; added; skipped }` — чистая функция без React и стора.
- `exportMarkdown(tree, assets): Promise<Blob>` — ZIP с `document.md` и `images/`; `exportHtml(tree, assets): Blob` — один офлайн-файл с data URL; имя `<slug>-<YYYY-MM-DD>.zip|html`.
- `markdownToHtml` + `escapeHtml` экранируют текст и атрибуты; `dangerouslySetInnerHTML` не используется.

## 6. Жёсткие инварианты

1. Слои: компонент не импортирует `@/db` напрямую; домен — только в `shared`; `shared` не импортирует стор и React.
2. Дерево мутируется только через `useDocumentEditor`; сборка и экспорт стор не пишут; целая сборка — один шаг истории через `replaceTree`.
3. Вложенность `ContainerDepth` 1…`MAX_CONTAINER_DEPTH`; предельный уровень — только текст и изображение; перенос проверяет `parent.depth + уровни ≤ MAX_CONTAINER_DEPTH`; ширина контейнера ≥ `max(span детей)` и ≥ `MIN_CONTAINER_SPAN`.
4. Пользовательский текст не попадает в HTML как разметка; ассеты — только data URL.
5. Источники вставки — только поле `content` события и ассеты «Концепт-артов»; уже вставленные `nodeId` пропускаются.
6. Битый `blocks_json` не запирает редактор: пустое дерево, сохранённое название остаётся.
7. Read-only запрещает мутации дерева, сборку и инлайн-правку; lightbox и копирование работают.
8. Документ один на проект (`doc_<projectId>`); история — `DOCUMENT_HISTORY_LIMIT` шагов и только локально.
9. «Заполнитель»: `packFillMosaic` — единственный расчёт прямоугольников (проценты от frame), `auto`-порядок не мутирует `order`, `heightPercent` — единственная высота контейнера (% от ширины); других режимов раскладки у контейнера нет, старые записи с `mode: 'grid' | 'flex'` открываются мозаикой. Ручной размер панели (`fillSize`, есть хотя бы у одного ребёнка) переводит уровень в явную раскладку того же домена; первый жест замораживает авто-ячейки всего уровня, «Собрать мозаику заново» снимает размеры.
10. Плашка контейнера — `fixed`, позиция считается только по пересечению прямоугольника контейнера с `[data-document-scroll]`; она не занимает места в потоке и видна, пока курсор наведён на контейнер или контейнер выбран.

### 6.1 Статус проверок

<!-- GEN:CHECKS:START -->
| Инвариант | Статус | Свидетельство |
| --- | --- | --- |
| `dag-shared` | ✓ | — |
| `dag-components-db` | ✓ | — |
| `dag-upward` | ✓ | — |
| `depth-consistency` | ✓ | — |
| `cols-declared` | ✓ | — |
| `history-limit` | ✓ | — |
| `saved-by-reference` | ✓ | — |
| `broken-json-fallback` | ✓ | — |
| `export-escapes` | ✓ | — |
| `single-mutation-point` | ✓ | — |
| `read-only-guard` | ✓ | — |
| `barrels` | ✓ | — |
| `no-todo` | ✓ | — |
| `db-rpc` | ✓ | — |
| `schema-documents` | ✓ | — |
<!-- GEN:CHECKS:END -->

Красный статус пишется в `state/deviations.json` и требует одного вопроса по разделу эскалации.

## 7. Ловушки

- Превью ресайза живёт отдельно от модели (`previewSpan`): без явной передачи превью ширина не следует за ручкой до pointerup.
- Мутация дерева на месте ломает `selectHasUnsavedChanges` и подтверждение закрытия — только новые объекты дерева.
- `track.cjs --audit` требует `index.ts` в каждом каталоге базы под `src/`.
- Vite dev при правке `src/**` → EBUSY и падение watcher: сначала остановить dev-сервер.
- `guide.md` — статический контекст: ссылка с префиксом `--` запрещает изменение модуля.
- Состояние панели источников (свёрнутость, ширина) хранится в `tree.settings`, иначе теряется при перезагрузке.
- Журнал инцидентов модуля — `src/components/editor/document/TROUBLESHOOTING.md`, append-only: симптом → причина → решение.
- «Заполнитель» — не flex-линия: ячейки абсолютны в процентах от frame, `span`/`widthPercent` внутри контейнера не действуют; `auto`-порядок меняет только показ, модель `order` остаётся прежней.
- Ручной размер панели — `fillSize` блока, а не поле контейнера: клон и перенос сохраняют размер. Значения не округляются — заморозка текущей авто-ячейки обязана воспроизвести её один в один, иначе первый жест сдвигает соседей. Ручной режим отключает `auto`-порядок до «Собрать мозаику заново».
- Высота панели принадлежит полосе: жест меняет высоту у всех ячеек строки, а ширина делит остаток строки с соседями. При одной полосе ручка высоты правит `heightPercent` контейнера (низ панели = низ frame, превью в контексте); при одной панели в строке ширина всегда 100 %.
- Плашка контейнера — `fixed`: её позиция считается по `[data-document-scroll]` и обновляется на scroll/resize; hover-состояние живёт на секции контейнера, а выпадающая панель — её потомок. Без якоря на скролл-окно плашка уезжает вместе с верхом высокого контейнера.
- `heightPercent` — процент от ширины, а не пиксели; это единственная высота контейнера, поэтому маленькое значение обрезает текст ячейки, а слайдер коммитит на отпускание, чтобы не забивать историю.
- Порог обрезки (15 %) и `cover`/`contain` решает домен по измеренной пропорции: до загрузки картинки берётся запасная, по пикселям ячейки это правило не пересчитывается. Подрезанная картинка участвует в упаковке пропорцией видимой области, а `fitImageCropBox` вписывает её в ячейку.
- Ячейка блока всегда занимает свои колонки: выравнивание применяется содержимым. `justify-self` сужал ячейку → ресайз ширины не менял видимый блок, а выравнивание зависело от размера.
- Размер изображения — `widthPercent` отдельно от `align`; `stretch` игнорирует процент, а ручка размера снимает stretch тем же шагом истории.
- Раскладка контейнера живёт в блоке (`layout`, одно поле `fillOrder`), не в `settings`; в ячейке мозаики ручка колонок скрыта (ширину задаёт прямоугольник ячейки).
- Высота textarea зависит и от содержимого, и от ширины: без `ResizeObserver` текст обрезается после ресайза блока. Выход из разметки — по `pointerdown` вне области, а не по blur: иначе ручка высоты схлопывает область до начала перетаскивания.
- Вложенные модалки стекаются через `useModalStack`: внешний полноэкранный модал отключает свои Esc и клик по оверлею, иначе внутреннее окно настроек закрывается вместе с документом.
- `useDocumentHotkeys` глушит хоткеи при постороннем `[role="dialog"]`: внутренняя модалка открывается без риска закрыть документ по Esc.
- Dev-сервер в среде агента падает на `esbuild` (`spawn EPERM`): проверка домена идёт зондом через временный резолвер (alias + расширения), а UI-прогон остаётся за человеком и не выдаётся за выполненный.

### 7.1 Автонаблюдения

<!-- GEN:TRAPS:START -->
- Повторяющихся отклонений нет: наблюдения появятся после двух одинаковых провалов проверки.
<!-- GEN:TRAPS:END -->

## 8. Рецепты расширения

1. Новый вид блока: `BlockKind` → тип в `types.ts` → ветка discriminated union в `schema.ts` с безопасными дефолтами → `BLOCK_KIND_LABELS` → `BlockRenderer` → `AddBlockMenu` → упаковка полос (`span`) → провенанс, если блок приходит из источника → `selfupdate.cjs`.
2. Новое поле настроек: `DocumentSettings` → `schema.ts` с дефолтом → нормализация → `DocumentSettingsModal` (открывается из `DocumentHeader`) → чтение через стор.
3. Новый пункт экспорта: `DocumentExportFormat` → `documentOutline` → модуль `export/export*.ts` → `ExportMenu` → `useDocumentExport` (ошибки только через `dialogService`).
4. Новый источник провенанса: `BlockSourceRef` + `sourceHash` → `sourceState` → `SourceBadge` → вставка через `insertTextBlock`/`insertImageBlock`.
5. Новое действие редактора: чистая операция в `hooks/documentTreeOps.ts` → поле в `DocumentEditorActions` → вызов из компонента.
5.1. Новая геометрия раскладки контейнера: чистая функция в `shared/document/layout` → поле в `ContainerLayout` (или блока) → Zod-схема и нормализация → `BlockList`/вид → панель раскладки → `selfupdate.cjs`. Ручной размер панели — образец: поле `fillSize` блока, ветка `size` в `packFillMosaic`, действие `resizeFillPanels`, сброс `resetFillPanels`.
6. Новый подкаталог домена: `src/shared/document` + баррель `index.ts` → `track.cjs --update` → реестр эволюции.
7. Регрессия движка: положить в базу временный файл с нарушением слоя → `selfupdate.cjs --check` обязан вернуть exit 2 и назвать файл, нарушивший инвариант → `selfupdate.cjs` записывает отклонение и наблюдение после второго провала → удалить файл → статус и наблюдения возвращаются в норму.

## 9. Definition of done

- `selfupdate.cjs --check` без дрейфа, `track.cjs --check` без дрейфа, `forge check` зелёный.
- `npx tsc --noEmit` и `npm run arch:check` зелёные при правке кода.
- `guide.md` затронутых модулей отражает контракт; новый класс поломки — в `TROUBLESHOOTING.md` модуля и в «Ловушках» выше.
- Контракт отражает фактическое поведение; расхождение — дефект, а не долг.

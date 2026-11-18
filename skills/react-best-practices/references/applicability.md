# Применимость upstream-правил к проекту

Источник: Vercel React Best Practices (70 правил), upstream commit `dc8367e6`.
Матрица — единственный источник истины по статусам: при противоречии с текстом правила выигрывает эта таблица.

Статусы:
- `APPLY` — применять как есть с поправкой на проектные конвенции.
- `ADAPT` — применить идею после замены API/паттерна (детали — [project-adaptations.md](project-adaptations.md)).
- `SKIP` — не применять: паттерн отсутствует в стеке.

Итог: `APPLY 51` | `ADAPT 5` | `SKIP 14` — всего 70.


### 1. Устранение водопадов (`async-`) — CRITICAL

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [async-api-routes](rules/async-api-routes.md) | CRITICAL | SKIP | Нет API routes: запросы уходят во внешний BFF. |
| [async-cheap-condition-before-await](rules/async-cheap-condition-before-await.md) | HIGH | APPLY | Проверять флаг/роль до сетевого await. |
| [async-defer-await](rules/async-defer-await.md) | HIGH | APPLY | await только в ветке, где значение используется. |
| [async-dependencies](rules/async-dependencies.md) | CRITICAL | SKIP | Требует внешней зависимости better-all; параллелизм даёт TanStack Query. |
| [async-parallel](rules/async-parallel.md) | CRITICAL | APPLY | Promise.all / useQueries для независимых запросов. |
| [async-suspense-boundaries](rules/async-suspense-boundaries.md) | HIGH | ADAPT | React.lazy + Suspense; Query suspense; учитывать layout shift. |

### 2. Размер бандла (`bundle-`) — CRITICAL

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [bundle-analyzable-paths](rules/bundle-analyzable-paths.md) | HIGH | APPLY | Динамические пути — только строковыми литералами. |
| [bundle-barrel-imports](rules/bundle-barrel-imports.md) | CRITICAL | ADAPT | FSD public API приоритетнее; deep import только для vendor с корректными типами. |
| [bundle-conditional](rules/bundle-conditional.md) | HIGH | APPLY | Модуль грузится после активации фичи. |
| [bundle-defer-third-party](rules/bundle-defer-third-party.md) | MEDIUM | APPLY | Аналитика/логи — после первого рендера. |
| [bundle-dynamic-imports](rules/bundle-dynamic-imports.md) | CRITICAL | ADAPT | React.lazy + Suspense вместо next/dynamic. |
| [bundle-preload](rules/bundle-preload.md) | MEDIUM | APPLY | prefetchQuery / route preload на hover/focus. |

### 3. Серверный перформанс (`server-`) — HIGH

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [server-after-nonblocking](rules/server-after-nonblocking.md) | MEDIUM | SKIP | after() — серверный API. |
| [server-auth-actions](rules/server-auth-actions.md) | CRITICAL | SKIP | Server Actions в проекте отсутствуют. |
| [server-cache-lru](rules/server-cache-lru.md) | HIGH | SKIP | Кросс-запросный кэш — зона BFF, не SPA. |
| [server-cache-react](rules/server-cache-react.md) | MEDIUM | SKIP | React.cache() — только RSC/SSR. |
| [server-dedup-props](rules/server-dedup-props.md) | LOW | SKIP | RSC-сериализация не используется. |
| [server-hoist-static-io](rules/server-hoist-static-io.md) | HIGH | SKIP | Серверный I/O в SPA отсутствует. |
| [server-no-shared-module-state](rules/server-no-shared-module-state.md) | HIGH | SKIP | Серверного request-состояния нет. |
| [server-parallel-fetching](rules/server-parallel-fetching.md) | CRITICAL | SKIP | Серверная композиция не используется. |
| [server-parallel-nested-fetching](rules/server-parallel-nested-fetching.md) | CRITICAL | SKIP | Серверная композиция не используется. |
| [server-serialization](rules/server-serialization.md) | HIGH | SKIP | RSC-границ нет. |

### 4. Клиентский data fetching (`client-`) — MEDIUM-HIGH

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [client-event-listeners](rules/client-event-listeners.md) | LOW | APPLY | Один глобальный listener на приложение. |
| [client-localstorage-schema](rules/client-localstorage-schema.md) | MEDIUM | APPLY | version + минимальный payload. |
| [client-passive-event-listeners](rules/client-passive-event-listeners.md) | MEDIUM | APPLY | scroll/touch — passive: true. |
| [client-swr-dedup](rules/client-swr-dedup.md) | MEDIUM-HIGH | ADAPT | TanStack Query: queryKey/staleTime/select; SWR не добавлять. |

### 5. Оптимизация ре-рендеров (`rerender-`) — MEDIUM

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [rerender-defer-reads](rules/rerender-defer-reads.md) | MEDIUM | APPLY | Читать состояние в точке использования. |
| [rerender-dependencies](rules/rerender-dependencies.md) | LOW | APPLY | Примитивные зависимости эффектов. |
| [rerender-derived-state-no-effect](rules/rerender-derived-state-no-effect.md) | MEDIUM | APPLY | Вычисление в рендере, не в эффекте. |
| [rerender-derived-state](rules/rerender-derived-state.md) | MEDIUM | APPLY | Подписка на скаляр/boolean, не на объект. |
| [rerender-functional-setstate](rules/rerender-functional-setstate.md) | MEDIUM | APPLY | setState(prev => ...) для стабильных колбэков. |
| [rerender-lazy-state-init](rules/rerender-lazy-state-init.md) | MEDIUM | APPLY | useState(() => expensive()). |
| [rerender-memo-with-default-value](rules/rerender-memo-with-default-value.md) | MEDIUM | APPLY | Дефолтные объекты/массивы — модульные константы. |
| [rerender-memo](rules/rerender-memo.md) | MEDIUM | APPLY | memo только по измеренному ре-рендеру. |
| [rerender-move-effect-to-event](rules/rerender-move-effect-to-event.md) | MEDIUM | APPLY | Логика взаимодействия — в обработчике. |
| [rerender-no-inline-components](rules/rerender-no-inline-components.md) | HIGH | APPLY | Компоненты — на модульном уровне. |
| [rerender-simple-expression-in-memo](rules/rerender-simple-expression-in-memo.md) | LOW-MEDIUM | APPLY | Не оборачивать примитивы в useMemo. |
| [rerender-split-combined-hooks](rules/rerender-split-combined-hooks.md) | MEDIUM | APPLY | Разделять хуки с независимыми зависимостями. |
| [rerender-transitions](rules/rerender-transitions.md) | MEDIUM | APPLY | startTransition для неургентных обновлений. |
| [rerender-use-deferred-value](rules/rerender-use-deferred-value.md) | MEDIUM | APPLY | useDeferredValue для тяжёлого рендера. |
| [rerender-use-ref-transient-values](rules/rerender-use-ref-transient-values.md) | MEDIUM | APPLY | Ref для частых транзитных значений (в т.ч. Zustand transient). |

### 6. Производительность рендеринга (`rendering-`) — MEDIUM

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [rendering-activity](rules/rendering-activity.md) | MEDIUM | ADAPT | React 19.2+ Activity; API нестабилен, применять точечно после проверки. |
| [rendering-animate-svg-wrapper](rules/rendering-animate-svg-wrapper.md) | LOW | APPLY | Анимировать обёртку, не сам SVG. |
| [rendering-conditional-render](rules/rendering-conditional-render.md) | LOW | APPLY | Тернарник вместо && для чисел/строк. |
| [rendering-content-visibility](rules/rendering-content-visibility.md) | HIGH | APPLY | content-visibility для длинных списков/таблиц. |
| [rendering-hoist-jsx](rules/rendering-hoist-jsx.md) | LOW | APPLY | Статичный JSX — вне компонента. |
| [rendering-hydration-no-flicker](rules/rendering-hydration-no-flicker.md) | MEDIUM | SKIP | Нет SSR/hydration (CSR-only). |
| [rendering-hydration-suppress-warning](rules/rendering-hydration-suppress-warning.md) | LOW-MEDIUM | SKIP | Нет SSR/hydration (CSR-only). |
| [rendering-resource-hints](rules/rendering-resource-hints.md) | HIGH | APPLY | preload/prefetch для критичных ассетов. |
| [rendering-script-defer-async](rules/rendering-script-defer-async.md) | HIGH | APPLY | defer/async для скриптов в index.html. |
| [rendering-svg-precision](rules/rendering-svg-precision.md) | LOW | APPLY | Снижать точность координат иконок. |
| [rendering-usetransition-loading](rules/rendering-usetransition-loading.md) | LOW | APPLY | useTransition вместо ручного isPending. |

### 7. JS-микрооптимизации (`js-`) — LOW-MEDIUM

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [js-batch-dom-css](rules/js-batch-dom-css.md) | MEDIUM | APPLY | Классы/cssText вместо серии style-мутаций. |
| [js-cache-function-results](rules/js-cache-function-results.md) | MEDIUM | APPLY | Map-кэш для чистых функций. |
| [js-cache-property-access](rules/js-cache-property-access.md) | LOW-MEDIUM | APPLY | Кэшировать свойства в цикле. |
| [js-cache-storage](rules/js-cache-storage.md) | LOW-MEDIUM | APPLY | Кэш чтения storage. |
| [js-combine-iterations](rules/js-combine-iterations.md) | LOW-MEDIUM | APPLY | Один проход вместо filter + map. |
| [js-early-exit](rules/js-early-exit.md) | LOW-MEDIUM | APPLY | Ранний возврат из функции. |
| [js-flatmap-filter](rules/js-flatmap-filter.md) | LOW-MEDIUM | APPLY | flatMap вместо map + filter. |
| [js-hoist-regexp](rules/js-hoist-regexp.md) | LOW-MEDIUM | APPLY | RegExp вне цикла. |
| [js-index-maps](rules/js-index-maps.md) | LOW-MEDIUM | APPLY | Map-индекс для повторных поисков. |
| [js-length-check-first](rules/js-length-check-first.md) | MEDIUM-HIGH | APPLY | Сравнение длин до поэлементного сравнения. |
| [js-min-max-loop](rules/js-min-max-loop.md) | LOW | APPLY | Цикл вместо sort для min/max. |
| [js-request-idle-callback](rules/js-request-idle-callback.md) | MEDIUM | APPLY | Некритичная работа — в idle. |
| [js-set-map-lookups](rules/js-set-map-lookups.md) | LOW-MEDIUM | APPLY | Set/Map для O(1). |
| [js-tosorted-immutable](rules/js-tosorted-immutable.md) | MEDIUM-HIGH | APPLY | toSorted() вместо мутирующего sort(). |

### 8. Продвинутые паттерны (`advanced-`) — LOW

| Правило | Impact | Статус | Комментарий / замена |
|---|---|---|---|
| [advanced-effect-event-deps](rules/advanced-effect-event-deps.md) | LOW | APPLY | Не добавлять useEffectEvent в deps эффекта. |
| [advanced-event-handler-refs](rules/advanced-event-handler-refs.md) | LOW | APPLY | Обработчики в ref при подписках. |
| [advanced-init-once](rules/advanced-init-once.md) | LOW-MEDIUM | APPLY | Инициализация приложения — один раз. |
| [advanced-use-latest](rules/advanced-use-latest.md) | LOW | APPLY | useEffectEvent/useLatest для стабильных колбэков. |

## Ограничения матрицы

- Статусы привязаны к стеку: React 19 + Vite (SPA), FSD, TanStack Query, Zustand, styled-components.
- Смена data-слоя или появление SSR/RSC → пересмотр `server-*` и `rendering-hydration-*`.
- Новые правила upstream без статуса → `SKIP` до явного решения (fail-closed).

# Проектные адаптации upstream-правил

Стек проекта: React 19 + Vite (CSR/SPA), Feature-Sliced Design, TanStack Query, Zustand, react-hook-form + Zod, styled-components, willykit-ui.
Цель файла — снять противоречия между upstream-правилами (Next.js-ориентированными) и проектными конвенциями.

## 1. FSD public API важнее `bundle-barrel-imports`

- Upstream требует импортировать напрямую из файлов и избегать barrel-файлов.
- В проекте кросс-срезовые импорты разрешены только через `index.ts` среза (public API); это проверяют `steiger` и `dependency-cruiser`.
- Применять правило к vendor-пакетам (иконки, lodash-подобные утилиты), а не к срезам.
- Внутри одного среза допустимы прямые относительные импорты; наружу — только через `index.ts`.

```tsx
// Разрешено: публичный контракт среза
import { TagBadge } from '@/entities/tag';

// Запрещено: обход public API ради «оптимизации»
import { TagBadge } from '@/entities/tag/ui/TagBadge';
```

## 2. `client-swr-dedup` → TanStack Query

- SWR в проекте не используется; дедупликацию и кэш даёт TanStack Query.
- Замены: `queryKey`, `staleTime`, `select`, `enabled`, `prefetchQuery`, `useQueries`.
- Не писать ручной `useEffect + fetch`: это дублирует кэш, отмену и повторные запросы.

```tsx
// Вместо SWR
const { data } = useQuery({
  queryKey: ['tags', filter],
  queryFn: () => fetchTags(filter),
  staleTime: 30_000,
  select: (rows) => rows.map(toTagModel),
});
```

## 3. `bundle-dynamic-imports` → `React.lazy`

- `next/dynamic` недоступен; замены: `React.lazy` + `Suspense`, ленивые маршруты роутера.
- Путь в `import()` — строковый литерал (см. `bundle-analyzable-paths`), иначе Vite не построит отдельный чанк.

```tsx
const HeavyChart = lazy(() => import('@/widgets/heavy-chart'));
// ...
<Suspense fallback={<ChartSkeleton />}>
  <HeavyChart />
</Suspense>
```

## 4. `rendering-hydration-*` → SPA

- Приложение рендерится только на клиенте: hydration mismatch отсутствует.
- Правила `rendering-hydration-no-flicker` и `rendering-hydration-suppress-warning` не применять.
- Для client-only данных (тема, размеры окна) использовать инициализацию после монтирования/`useSyncExternalStore`, а не inline-скрипты hydration.

## 5. Waterfalls → параллелизм и prefetch

- Независимые запросы: `Promise.all` (сервисный слой) или `useQueries` (UI).
- Последовательные `await` допустимы только при реальной зависимости данных.
- Роут-загрузчики/старт экрана: `queryClient.prefetchQuery` для критичных данных.
- `async-dependencies` (better-all) не применять: новая зависимость не оправдана.

## 6. Ре-рендеры: Zustand + Query select

- `rerender-derived-state` и `rerender-use-ref-transient-values` → точечные селекторы Zustand, `useShallow` при составных объектах, transient-подписки для частых обновлений.
- `rerender-derive-state-no-effect` → производные значения вычислять в рендере, не через `useEffect + setState`.
- `rerender-memo` → `memo` только по измеренному ре-рендеру; для тяжёлых списков предпочтительнее `content-visibility`/виртуализация.
- `rerender-use-deferred-value` и `rerender-transitions` → для фильтрации/поиска по большим коллекциям.

## 7. React 19 API

- `useEffectEvent` (`advanced-effect-event-deps`, `advanced-use-latest`) допустим при React >= 19.2; проверить фактическую версию перед применением.
- `<Activity />` нестабилен и менялся между минорными версиями: применять точечно и только после проверки типов и поведения.
- `use(promise)` применим в клиентских компонентах с `Suspense`, но не заменяет TanStack Query для кэша и инвалидации.

## 8. styled-components и UI-библиотека

- Инлайн-объекты стилей в пропсах memo-компонентов создают новые ссылки: выносить в модульные константы или `styled`-варианты.
- Тяжёлые UI-компоненты (таблицы, деревья, графики) подключать лениво на уровне маршрута/виджета, а не в общем layout.
- Анимации — на обёртке контейнера, не на SVG-элементе (`rendering-animate-svg-wrapper`).

## 9. Измерение и Quality Gates

- `npm run doctor` (react-doctor) и `eslint-plugin-react-hooks` выполняются первыми: навык не дублирует их находки.
- Перф-утверждение без Profiler/Performance panel запрещено; после патча — повторное измерение.
- Проверки после изменения: `npx tsc --noEmit`, `npm run lint`, `npm run fsd`, `npm run check:deps`.
- Тесты: не запускать без согласования (`npm test`, Playwright) — правило проекта.

## 10. Чего не делать

- Не добавлять зависимости ради микрооптимизации (better-all, why-did-you-render, SWR).
- Не переносить серверные/RSC-паттерны в SPA (`server-*`).
- Не ломать ACL и контракты слоёв ради «скорости».
- Не смешивать перф-рефакторинг с изменением поведения: 1 задача = 1 класс изменений.

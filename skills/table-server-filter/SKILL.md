---
name: table-server-filter
description: Перевод таблиц @willykit-ui/table на серверную фильтрацию, сортировку и пагинацию (TanStack Table + React Query). Учитывает решение проблемы со сбросом активной иконки фильтра. Триггер - "переведи таблицу на серверную фильтрацию", "сделай фильтры серверными".
---

# Перевод таблиц на серверную фильтрацию

Этот навык описывает стандартизированный процесс перевода клиентских таблиц (`@willykit-ui/table`) на серверную обработку (фильтры, сортировка, пагинация) с использованием `react-query` и `ServerListFilter`.

## 🚨 Критические нюансы (опыт отладки)

1. **Сброс иконки фильтра (баг `@willykit-ui/table`)**: Если ссылка на массив `data` меняется на пустую при загрузке, таблица сбрасывает свои внутренние стейты фильтров, и иконка (воронка) становится серой, хотя фильтр применен.
2. **Обязательно 1**: В хуке `useQuery` для серверной загрузки ВСЕГДА использовать `placeholderData: keepPreviousData` (из `@tanstack/react-query`). Это сохраняет старые данные на время fetch-запроса, предотвращая мигание и сброс фильтров.
3. **Обязательно 2**: Дефолтный массив при отсутствии данных должен быть константой вне компонента (например, `const EMPTY_DATA: T[] = []`), а не inline-массивом `?? []`. Иначе при каждом рендере ссылка обновляется, вызывая сброс фильтров.
4. **CSS-хаки запрещены**: Если иконка сбрасывается, значит нарушены пп. 2 или 3. Переопределять стили через `<style>` (как это делалось ошибочно) строго запрещено.

## Пошаговый алгоритм реализации

### 1. Подготовка API и Store (queries.ts)

- Добавить функцию загрузки с `URLSearchParams` (например, `getEntitiesServer(params)`).
- Добавить хук `useServerEntitiesQuery(queryParams: URLSearchParams)`:
  - `queryKey` должен включать `queryParams.toString()`.
  - Обязательно: `placeholderData: keepPreviousData`.
  - Обязательно: `staleTime` (например, `5000`).
  - Извлекать маппинг в `select`.

### 2. Подготовка UI-компонента (state & params)

- Добавить стейты таблицы:
  ```tsx
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const [sorting, setSorting] = useState<SortingState[]>([]);
  const [columnFilters, setColumnFilters] = useState<FilterState[]>([]);
  ```
- Использовать утилиту генерации квери-параметров (`@/shared/lib/filters/build-query`):
  ```tsx
  const queryParams = useMemo(
    () => buildQueryParams(columnFilters, pagination, sorting),
    [columnFilters, pagination, sorting],
  );
  ```
- Синхронизировать параметры для фасетного поиска в фильтрах:
  ```tsx
  const queryParamsRef = useRef(queryParams);
  useEffect(() => { queryParamsRef.current = queryParams; }, [queryParams]);
  ```

### 3. Загрузка данных

- В начале файла (вне компонента) определить `const EMPTY_DATA: Entity[] = [];`.
- Запросить данные и использовать стабильный fallback:
  ```tsx
  const { data: queryResult, isLoading, isError, refetch } = useServerEntitiesQuery(queryParams);
  const arrTable = queryResult?.items ?? EMPTY_DATA;
  const totalCount = queryResult?.totalCount ?? 0;
  ```

### 4. Настройка колонок и ServerListFilter

В `useMemo` для колонок (`columns`) реализовать `fetchColumnOptions` и `renderFilter`:

- `fetchColumnOptions(key, search)`:
  - Клонирует `queryParamsRef.current`.
  - Задает большой `pageSize`, удаляет `Page`.
  - Удаляет все фильтры для *текущей* колонки (чтобы фасетный поиск находил опции независимо от текущего выбора).
  - При поиске (`search` и строковое поле) добавляет `filter[key][contains]`.
  - Обращается к серверу (`getEntitiesServer`), извлекает уникальные `label`/`value`.
- `renderFilter(key, title)`:
  - Возвращает `ServerListFilter` с пробросом `isStringField`.
  - При `setFilterValue` обновляет стейт `columnFilters`, сбрасывает `pageIndex` в 0 и вызывает `props.setFilterValue(val)` (для внутреннего стейта `@willykit-ui/table`).
- У колонок с фильтром:
  - `filterable: true`
  - `filterFn: () => true` (отключает локальную фильтрацию, но включает UI)
  - `filterComponent: renderFilter('поле', 'Название')`

### 5. Интеграция с `<Table>`

Передать серверные флаги и стейты в компонент `@willykit-ui/table`:
```tsx
<Table
  columns={columns}
  data={arrTable}
  features={{
    sorting: true,
    manualSorting: true, // Серверная сортировка
    pagination: true,
    manualPagination: true, // Серверная пагинация
    filtering: { mode: "includes" },
  }}
  pagination={pagination}
  onPaginationChange={setPagination}
  sorting={sorting}
  onSortingChange={(s) => setSorting(s as SortingState[])}
  pageCount={Math.max(1, Math.ceil(totalCount / pagination.pageSize))}
  rowCount={totalCount}
  paginationOptions={{ rowsPerPageOptions: [50, 100, 150] }}
/>
```

### 6. Самопроверка (Check)

После внесения изменений обязательно запустите автоматическую проверку файлов через навык `check`:
- Вызовите `/check по измененным файлам` или вручную проверьте линтером.
- Убедитесь, что `EMPTY_DATA` добавлен вне компонента и нет `ReferenceError`.
- Убедитесь, что `renderFilter` возвращает именованный компонент с `displayName` (для предотвращения лишних ре-рендеров).
- Проверьте корректность типов (отсутствие `any` там, где можно типизировать).

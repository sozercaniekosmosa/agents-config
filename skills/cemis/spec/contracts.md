# 📜 Контракты и API CEMIS

## 1. Идентификаторы моделей
Файл: `src/entities/cemis/api/api.ts`
- **Модель CEMIS**: `CEMIS_MODEL_ID = "019f7e8d-d3e6-7401-bfb7-e37a9a37996c"`
- **Прототипы узлов** (`CEMIS_PROTOTYPES`):
  - `GTPP_UNIT` / `GTPP_OVERALL`
  - `PUMPS_UNIT` / `PUMPS_OVERALL`

## 2. Формирование меню
Файл: `src/entities/cemis/api/queries.ts`
Метод: `cemisMenuQueryOptions` (на базе `getCemisMenuInstances`)
- Запрашивает объекты через `getObjectInstances` с `ObjectModelId = CEMIS_MODEL_ID`.
- Разделяет объекты на корневые категории: "ГТЭС" и "Насосные станции" (поиск по `parentId === null` и вхождениям подстрок).
- Сортирует дочерние элементы с приоритетом узлов "Общая" (`OVERALL` прототипы).

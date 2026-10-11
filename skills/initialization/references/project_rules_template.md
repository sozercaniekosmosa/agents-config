# Шаблон project-rules.md

# Технические стандарты проекта
Соблюдать всегда.

---

## 1. Правила Архитектуры и Слоев ({{ARCHITECTURE_PATTERN_NAME}})
{{ARCHITECTURE_LAYER_RULES}}

---

## 2. {{FRAMEWORK_AND_LANG_SECTION}}
**TypeScript**:
* Строгий режим, !`any`/`as any`.
* `interface` — API/пропсы, `type` — union/вычисления.
* Promise/Worker → точные возвращаемые типы.

**UI & Стили**:
* Только функциональные компоненты.
* {{STYLING_RULES}}

**Линтер & Конвенции**:
* Unused vars: удалять (!префикс `_`).
* Ref: `ref.current` in JSX запрещен → `useLayoutEffect` | Callback.
* Запрет `// TODO` в коде → запись в `docs/techdebt.md` (1 факт = 1 строка: дата, скоуп, компромисс, план закрытия).

**Валидация данных & ACL**:
* Runtime-валидация: обязательные схемы валидации внешних данных и API ({{VALIDATION_LIBRARY_RULES}}).
* Anti-Corruption Layer: запрет сырых `*Dto` в UI/компонентах → обязательные мапперы (`dtoTo[Entity]`).
* Защитные дефолты: fallbacks для поврежденных или неполных внешних данных.
* Плагинные архитектуры: runtime-валидация манифеста плагина на входе в ядро (ACL), изоляция схем узлов/конфигов внутри плагина, обязательный cleanup при выгрузке, доступ к общему состоянию сцены/вводу только через `PluginContext.getEditorState()` и `eventBus` (запрет `window.addEventListener` в плагинах).


**Именования**:
* Компоненты, типы: `PascalCase`.
* Переменные, хуки: `camelCase`.
* Константы: `SCREAMING_SNAKE_CASE`.
* Папки, файлы: `kebab-case`.

---

## 3. Доменные Best Practices стека
{{PROJECT_SPECIFIC_BEST_PRACTICES}}

---

## 4. Тесты
1. **Существующие тесты**: !менять, !трогать assertions. Тест упал → чинить код.
2. **Запуск**: строго по согласованию с юзером.
3. **Новые тесты**:
   - Сброс стейта: в `beforeEach`.
   - !Сайд-эффекты: мокать сеть, время.

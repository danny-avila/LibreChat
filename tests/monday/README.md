# Monday.com API Tests

Этот каталог содержит тесты и отладочные скрипты для интеграции с Monday.com API.

## Структура файлов

### Основные тесты
- `test_all_monday_functions_complete.js` - Полный комплексный тест всех функций API
- `test_monday_sales_copilot.js` - Тесты для Sales Copilot функциональности
- `test_simple_working.js` - Простые рабочие тесты основных функций

### Отладочные скрипты
- `debug_critical_functions.js` - Диагностика критических функций
- `debug_graphql_errors.js` - Детальная диагностика ошибок GraphQL
- `debug_exact_error.js` - Точная диагностика специфических ошибок

### Специализированные тесты
- `test_createwebhook.js` - Тестирование создания вебхуков
- `test_searchitems_debug.js` - Отладка поиска элементов
- `test_fixed_critical_functions.js` - Тесты исправленных критических функций

## Запуск тестов

Перед запуском тестов убедитесь, что установлена переменная окружения:

```bash
export MONDAY_API_KEY="ваш_api_ключ"
```

Запуск конкретного теста:

```bash
node tests/monday/test_simple_working.js
```

## Примечания

- Все тесты используют `MondayTool` из `api/app/clients/tools/structured/MondayTool.js`
- Некоторые тесты могут требовать специфических ID досок или элементов Monday.com
- Отладочные скрипты генерируют детальные отчеты о работе API 
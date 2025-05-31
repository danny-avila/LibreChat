# Monday.com API Authorization Fix

## 🐛 Проблема

Все запросы к Monday.com API возвращали **HTTP 400 Bad Request**.

### Симптомы:
- `getBoards` - HTTP Error: 400 Bad Request
- `getBoard` - HTTP Error: 400 Bad Request  
- `createBoard` - HTTP Error: 400 Bad Request
- `getWorkspaces` - HTTP Error: 400 Bad Request
- `createItem` - HTTP Error: 400 Bad Request

## 🔍 Диагностика

При анализе кода было обнаружено, что в методе `makeGraphQLRequest` файла `MondayTool.js` заголовок `Authorization` передавался неправильно.

### Было:
```javascript
headers: {
  'Content-Type': 'application/json',
  'Authorization': this.apiKey,  // ❌ Неправильно
  'API-Version': '2024-01'
}
```

### Проблема:
Monday.com API требует, чтобы токен передавался с префиксом `Bearer ` в заголовке Authorization согласно стандарту OAuth 2.0.

## ✅ Решение

### Исправлено на:
```javascript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${this.apiKey}`,  // ✅ Правильно
  'API-Version': '2024-01'
}
```

### Файл изменен:
- **`/api/app/clients/tools/structured/MondayTool.js`** - строка 444

## 🧪 Тестирование

Создан тестовый скрипт `test_monday_fix.js` для проверки исправления:

```bash
# Установите переменную окружения с вашим API токеном
export MONDAY_API_KEY="ваш_токен_monday"

# Опционально: установите ID доски для дополнительного теста
export MONDAY_BOARD_ID="4788479173"

# Запустите тесты
node test_monday_fix.js
```

### Тестируемые методы:
1. `getBoards` - получение списка досок
2. `getWorkspaces` - получение списка workspace
3. `getAccount` - получение информации об аккаунте
4. `getUsers` - получение списка пользователей
5. `getBoard` - получение конкретной доски (если указан MONDAY_BOARD_ID)

## 📋 Чек-лист проверки

- [x] Заголовок Authorization исправлен
- [x] Добавлен префикс "Bearer " перед токеном
- [x] Создан тестовый скрипт
- [x] Документация обновлена

## 🚀 Результат

После применения исправления все API запросы должны работать корректно при условии:
1. Используется действительный API токен Monday.com
2. Токен имеет необходимые права доступа для запрашиваемых операций
3. Указанные ID досок/элементов существуют и доступны

## 💡 Рекомендации

1. **Проверьте API токен**: Убедитесь, что используете актуальный токен из Monday.com
2. **Права доступа**: Проверьте, что токен имеет необходимые scopes для выполняемых операций
3. **Логирование**: При отладке используйте логирование для просмотра точных ошибок GraphQL

## 🔧 Дополнительные настройки

Если проблемы продолжаются, проверьте:
- Корректность API endpoint: `https://api.monday.com/v2`
- Версию API: `API-Version: 2024-01`
- Формат GraphQL запросов согласно документации Monday.com API v2 
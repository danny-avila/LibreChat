# Monday.com API Tool - Исправления и рекомендации

## 🔧 Выполненные исправления

### 1. **Добавлен параметр `groupName` в схему валидации**
- **Файл**: `MondayTool.js` (строка ~167)
- **Проблема**: Параметр `groupName` использовался в функциях `createGroup` и `createGroupAdvanced`, но отсутствовал в схеме валидации Zod
- **Решение**: Добавлен параметр `groupName: z.string().optional().describe('Название группы')`

## ❌ Обнаруженные проблемы

### 1. **createItem - HTTP 400 Error**
**Возможные причины:**
- Неправильный формат `column_values` - должен быть JSON строкой
- Неверный `groupId` - группа может не существовать или ID в неправильном формате
- Отсутствие обязательных колонок на доске
- Проблемы с правами доступа API ключа

**Рекомендации:**
```javascript
// Правильный формат для column_values согласно документации:
const columnValues = {
  // Текст - простая строка
  "text_column_id": "Some text",
  
  // Статус - объект с label
  "status_column_id": { "label": "Done" },
  
  // Дата - объект с date
  "date_column_id": { "date": "2024-01-15" },
  
  // Числа - простое число
  "numbers_column_id": 123,
  
  // People - массив объектов
  "people_column_id": { 
    "personsAndTeams": [
      { "id": "user_id", "kind": "person" }
    ]
  }
};
```

### 2. **getItems - HTTP 400 Error**
**Возможные причины:**
- Неверный формат `boardId` - должен быть строкой, но передается в массиве `[boardId]`
- API может требовать дополнительные параметры

**Рекомендуемое исправление:**
Проверить, что `boardId` передается в правильном формате в GraphQL запросе.

### 3. **addComment - Internal Server Error**
**Возможные причины:**
- Неверный `itemId`
- Проблемы с правами доступа
- API endpoint может быть временно недоступен

## 📋 Тестовый скрипт

Создан файл `test_monday_fixes.js` для проверки исправлений:

```bash
# Установите зависимости
npm install node-fetch

# Установите API ключ
export MONDAY_API_KEY="your_api_key_here"

# Запустите тесты
node test_monday_fixes.js
```

## 🔍 Дополнительные рекомендации

### 1. **Улучшение обработки ошибок**
Рекомендуется добавить более детальную обработку ошибок в `makeGraphQLRequest`:

```javascript
async makeGraphQLRequest(query, variables = {}) {
  // ... existing code ...
  
  if (data.errors) {
    logger.error('[MondayTool] GraphQL Errors:', {
      errors: data.errors,
      query: query.substring(0, 200), // Первые 200 символов запроса
      variables: variables
    });
    
    // Более детальная информация об ошибке
    const errorDetails = data.errors.map(e => e.message).join('; ');
    throw new Error(`GraphQL Error: ${errorDetails}`);
  }
  
  return data.data;
}
```

### 2. **Валидация column_values перед отправкой**
Добавить вспомогательную функцию для валидации и форматирования column values:

```javascript
validateAndFormatColumnValues(columnValues) {
  if (!columnValues || typeof columnValues !== 'object') {
    return null;
  }
  
  // Убедиться, что все значения в правильном формате
  const formatted = {};
  for (const [key, value] of Object.entries(columnValues)) {
    // Простые типы (text, numbers) могут быть строками или числами
    if (typeof value === 'string' || typeof value === 'number') {
      formatted[key] = value;
    }
    // Сложные типы должны быть объектами
    else if (typeof value === 'object' && value !== null) {
      formatted[key] = value;
    }
  }
  
  return formatted;
}
```

### 3. **Проверка существования группы перед созданием элемента**
Добавить проверку группы:

```javascript
async createItem({ boardId, itemName, groupId, columnValues }) {
  // ... existing validation ...
  
  // Если указан groupId, проверяем его существование
  if (groupId) {
    const board = await this.getBoard({ boardId, includeGroups: true });
    const boardData = JSON.parse(board);
    const groupExists = boardData.data.groups?.some(g => g.id === groupId);
    
    if (!groupExists) {
      logger.warn(`[MondayTool] Group ${groupId} not found on board ${boardId}`);
      groupId = null; // Использовать группу по умолчанию
    }
  }
  
  // ... rest of the function ...
}
```

## 📌 Статус функций после исправлений

| Функция | Статус | Примечание |
|---------|--------|------------|
| `createGroup` | ✅ Исправлено | Добавлен параметр groupName в схему |
| `createGroupAdvanced` | ✅ Исправлено | Добавлен параметр groupName в схему |
| `createItem` | ⚠️ Требует тестирования | Проверить формат column_values и groupId |
| `getItems` | ⚠️ Требует тестирования | Проверить формат boardId в запросе |
| `addComment` | ⚠️ Требует тестирования | Проверить права доступа и itemId |

## 🔄 Следующие шаги

1. **Запустить тестовый скрипт** с реальным API ключом
2. **Логировать детальные ошибки** из GraphQL ответов
3. **Проверить документацию** monday.com на предмет изменений в API
4. **Обновить примеры использования** в документации инструмента 
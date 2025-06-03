/**
 * Прямые API вызовы к Monday.com для тестирования обновления колонок
 * Использование: MONDAY_API_KEY=ваш_токен node test_direct_api_calls.js
 */

const https = require('https');

// Получаем API ключ из переменной окружения
const apiKey = process.env.MONDAY_API_KEY;

if (!apiKey) {
  console.error('❌ Установите переменную окружения MONDAY_API_KEY');
  console.log('Пример: MONDAY_API_KEY=your_token node test_direct_api_calls.js');
  process.exit(1);
}

// Функция для выполнения GraphQL запросов
function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      query: query,
      variables: variables
    });

    const options = {
      hostname: 'api.monday.com',
      port: 443,
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (result.errors) {
            reject(new Error(`GraphQL Error: ${JSON.stringify(result.errors)}`));
          } else {
            resolve(result);
          }
        } catch (error) {
          reject(new Error(`JSON Parse Error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

async function testDirectAPICall() {
  console.log('🚀 Тестирование прямых API вызовов к Monday.com...\n');

  try {
    // Шаг 1: Получаем список досок
    console.log('📋 Шаг 1: Получение досок...');
    const boardsQuery = `
      query {
        boards(limit: 5) {
          id
          name
          columns {
            id
            title
            type
          }
        }
      }
    `;

    const boardsResult = await makeGraphQLRequest(boardsQuery);
    const boards = boardsResult.data.boards;
    console.log(`✅ Найдено досок: ${boards.length}`);

    if (boards.length === 0) {
      console.log('❌ Нет доступных досок');
      return;
    }

    const testBoard = boards[0];
    console.log(`🎯 Используем доску: "${testBoard.name}" (ID: ${testBoard.id})`);
    console.log(`📊 Колонки: ${testBoard.columns.map(c => `${c.title} (${c.type})`).join(', ')}`);

    // Шаг 2: Получаем элементы доски
    console.log('\n📋 Шаг 2: Получение элементов доски...');
    const itemsQuery = `
      query($boardId: ID!) {
        boards(ids: [$boardId]) {
          items(limit: 3) {
            id
            name
            column_values {
              id
              type
              text
              value
            }
          }
        }
      }
    `;

    const itemsResult = await makeGraphQLRequest(itemsQuery, { boardId: testBoard.id });
    let items = itemsResult.data.boards[0].items;
    console.log(`✅ Найдено элементов: ${items.length}`);

    // Если нет элементов, создаем один
    if (items.length === 0) {
      console.log('⚠️ Нет элементов, создаем тестовый элемент...');
      
      const createItemMutation = `
        mutation($boardId: ID!, $itemName: String!) {
          create_item(board_id: $boardId, item_name: $itemName) {
            id
            name
          }
        }
      `;

      const createResult = await makeGraphQLRequest(createItemMutation, {
        boardId: testBoard.id,
        itemName: `Test Item ${Date.now()}`
      });

      console.log(`✅ Создан элемент: ${createResult.data.create_item.name}`);
      
      // Получаем элементы снова
      const newItemsResult = await makeGraphQLRequest(itemsQuery, { boardId: testBoard.id });
      items = newItemsResult.data.boards[0].items;
    }

    const testItem = items[0];
    console.log(`🎯 Используем элемент: "${testItem.name}" (ID: ${testItem.id})`);

    // Шаг 3: Тестируем обновление колонок
    console.log('\n📋 Шаг 3: Тестирование обновления колонок...');

    // Найдем разные типы колонок для тестирования
    const textColumn = testBoard.columns.find(c => c.type === 'text');
    const statusColumn = testBoard.columns.find(c => c.type === 'color' || c.type === 'status');
    const numberColumn = testBoard.columns.find(c => c.type === 'numeric');

    // Тест 1: Обновление текстовой колонки (используем change_simple_column_value)
    if (textColumn) {
      console.log(`\n🔄 Тест 1: Обновление текстовой колонки "${textColumn.title}"...`);
      
      const textMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;

      const textValue = `Обновлено ${new Date().toLocaleString()}`;
      await makeGraphQLRequest(textMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: textColumn.id,
        value: textValue
      });

      console.log(`✅ Текстовая колонка обновлена: "${textValue}"`);
    }

    // Тест 2: Обновление статус колонки (используем change_column_value с JSON)
    if (statusColumn) {
      console.log(`\n🔄 Тест 2: Обновление статус колонки "${statusColumn.title}"...`);
      
      const statusMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;

      const statusValue = JSON.stringify({ index: 1 });
      await makeGraphQLRequest(statusMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: statusColumn.id,
        value: statusValue
      });

      console.log(`✅ Статус колонка обновлена с индексом: 1`);
    }

    // Тест 3: Обновление числовой колонки
    if (numberColumn) {
      console.log(`\n🔄 Тест 3: Обновление числовой колонки "${numberColumn.title}"...`);
      
      const numberMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;

      const numberValue = Math.floor(Math.random() * 1000).toString();
      await makeGraphQLRequest(numberMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: numberColumn.id,
        value: numberValue
      });

      console.log(`✅ Числовая колонка обновлена: ${numberValue}`);
    }

    // Шаг 4: Проверяем результаты
    console.log('\n📋 Шаг 4: Проверка результатов...');
    const verifyResult = await makeGraphQLRequest(itemsQuery, { boardId: testBoard.id });
    const updatedItem = verifyResult.data.boards[0].items.find(item => item.id === testItem.id);

    console.log('\n📊 Обновленные значения колонок:');
    updatedItem.column_values.forEach(col => {
      if (col.text && col.text.trim()) {
        const columnInfo = testBoard.columns.find(c => c.id === col.id);
        const columnTitle = columnInfo ? columnInfo.title : col.id;
        console.log(`   ${columnTitle}: "${col.text}"`);
      }
    });

    console.log('\n✅ Все тесты прямых API вызовов завершены успешно!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message);
    
    if (error.message.includes('GraphQL Error')) {
      console.log('\n📋 Это GraphQL ошибка. Проверьте:');
      console.log('   - Правильность API ключа');
      console.log('   - Доступность Monday.com API');
      console.log('   - Корректность параметров запроса');
    }
  }
}

// Запускаем тест
testDirectAPICall()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Критическая ошибка:', error);
    process.exit(1);
  });

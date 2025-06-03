/**
 * Прямой тест Monday.com API для обновления колонок
 * Использование: MONDAY_API_KEY=ваш_токен node test_direct_monday_api.js
 */

const https = require('https');

const API_URL = 'https://api.monday.com/v2';

// Получаем API ключ
const apiKey = process.env.MONDAY_API_KEY;

if (!apiKey) {
  console.error('❌ Установите переменную окружения MONDAY_API_KEY');
  console.log('Пример: MONDAY_API_KEY=your_token node test_direct_monday_api.js');
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
        'API-Version': '2024-10',
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
          const parsed = JSON.parse(responseData);
          if (parsed.errors) {
            reject(new Error(`GraphQL Error: ${JSON.stringify(parsed.errors)}`));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error(`Parse Error: ${error.message}`));
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

async function testDirectAPI() {
  console.log('🚀 Тестирование прямых API вызовов Monday.com...\n');

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
      console.log('❌ Нет досок для тестирования');
      return;
    }

    const testBoard = boards[0];
    console.log(`🎯 Используем доску: "${testBoard.name}" (ID: ${testBoard.id})`);
    
    console.log('📊 Колонки:');
    testBoard.columns.forEach(col => {
      console.log(`   - ${col.title} (${col.type}) [${col.id}]`);
    });

    // Шаг 2: Получаем элементы доски
    console.log('\n📋 Шаг 2: Получение элементов...');
    
    const itemsQuery = `
      query($boardIds: [ID!]!) {
        boards(ids: $boardIds) {
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

    const itemsResult = await makeGraphQLRequest(itemsQuery, { 
      boardIds: [testBoard.id] 
    });
    
    const items = itemsResult.data.boards[0].items;
    console.log(`✅ Найдено элементов: ${items.length}`);

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
      items.push(createResult.data.create_item);
    }

    const testItem = items[0];
    console.log(`🎯 Используем элемент: "${testItem.name}" (ID: ${testItem.id})`);

    // Шаг 3: Тестируем обновление текстовой колонки
    console.log('\n📋 Шаг 3: Тестирование обновления колонок...');
    
    const textColumn = testBoard.columns.find(c => c.type === 'text');
    const statusColumn = testBoard.columns.find(c => c.type === 'color' || c.type === 'status');

    // Тест 1: Обновление текстовой колонки (используем change_simple_column_value)
    if (textColumn) {
      console.log(`\n🔄 Тест 1: Обновление текстовой колонки "${textColumn.title}"...`);
      
      const textMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(
            board_id: $boardId, 
            item_id: $itemId, 
            column_id: $columnId, 
            value: $value
          ) {
            id
          }
        }
      `;

      const textValue = `Обновлено в ${new Date().toLocaleString()}`;
      
      const textResult = await makeGraphQLRequest(textMutation, {
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
          change_column_value(
            board_id: $boardId, 
            item_id: $itemId, 
            column_id: $columnId, 
            value: $value
          ) {
            id
          }
        }
      `;

      // Для статус колонок используем index (0, 1, 2...)
      const statusValue = JSON.stringify({ index: 1 });
      
      const statusResult = await makeGraphQLRequest(statusMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: statusColumn.id,
        value: statusValue
      });

      console.log(`✅ Статус колонка обновлена с index: 1`);
    }

    // Шаг 4: Проверяем результат
    console.log('\n📋 Шаг 4: Проверка результата...');
    
    const verifyResult = await makeGraphQLRequest(itemsQuery, { 
      boardIds: [testBoard.id] 
    });
    
    const updatedItem = verifyResult.data.boards[0].items.find(item => item.id === testItem.id);
    
    if (updatedItem) {
      console.log('\n📊 Текущие значения колонок:');
      updatedItem.column_values.forEach(col => {
        if (col.text && col.text.trim()) {
          const columnInfo = testBoard.columns.find(c => c.id === col.id);
          const columnTitle = columnInfo ? columnInfo.title : col.id;
          console.log(`   ${columnTitle}: "${col.text}"`);
        }
      });
    }

    console.log('\n🎉 Все тесты обновления колонок выполнены успешно!');

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.log('\n📋 Возможные причины:');
    console.log('   - Неверный API ключ');
    console.log('   - Нет доступа к доскам');
    console.log('   - Проблемы с сетью');
    console.log('   - Неправильные параметры запроса');
  }
}

// Запускаем тест
console.log('🔑 API Key:', apiKey ? `${apiKey.substring(0, 20)}...` : 'NOT SET');
testDirectAPI().catch(console.error);

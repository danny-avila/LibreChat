/**
 * Упрощенный тест Monday.com API для обновления колонок
 * Использование: MONDAY_API_KEY=ваш_токен node test_monday_simple.js
 */

const fetch = require('node-fetch');

// Получаем API ключ из переменной окружения
const apiKey = process.env.MONDAY_API_KEY;

if (!apiKey) {
  console.error('❌ Установите переменную окружения MONDAY_API_KEY');
  console.log('Пример: MONDAY_API_KEY=your_token node test_monday_simple.js');
  process.exit(1);
}

const API_URL = 'https://api.monday.com/v2';

// Функция для выполнения GraphQL запросов
async function executeQuery(query, variables = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2023-10'
      },
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }
    
    return data;
  } catch (error) {
    console.error('Request failed:', error.message);
    throw error;
  }
}

async function testMondayColumnUpdate() {
  console.log('🚀 Тестирование Monday.com Column Update API...\n');

  try {
    // Шаг 1: Получение списка досок
    console.log('📋 Шаг 1: Получение списка досок...');
    const boardsQuery = `
      query {
        boards(limit: 5) {
          id
          name
        }
      }
    `;
    
    const boardsResult = await executeQuery(boardsQuery);
    const boards = boardsResult.data.boards;
    console.log(`✅ Найдено досок: ${boards.length}`);
    
    if (boards.length === 0) {
      console.log('❌ Нет доступных досок для тестирования');
      return;
    }

    const testBoard = boards[0];
    console.log(`🎯 Используем доску: "${testBoard.name}" (ID: ${testBoard.id})`);

    // Шаг 2: Получение элементов доски
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
    
    const itemsResult = await executeQuery(itemsQuery, { boardId: testBoard.id });
    const items = itemsResult.data.boards[0].items;
    console.log(`✅ Найдено элементов: ${items.length}`);
    
    if (items.length === 0) {
      console.log('⚠️ Нет элементов в доске, создаем тестовый элемент...');
      
      const createItemMutation = `
        mutation($boardId: ID!, $itemName: String!) {
          create_item(board_id: $boardId, item_name: $itemName) {
            id
            name
          }
        }
      `;
      
      const createResult = await executeQuery(createItemMutation, {
        boardId: testBoard.id,
        itemName: 'Test Item for Column Update'
      });
      
      console.log(`✅ Создан элемент: ${createResult.data.create_item.name} (ID: ${createResult.data.create_item.id})`);
      
      // Получаем обновленный список элементов
      const updatedItemsResult = await executeQuery(itemsQuery, { boardId: testBoard.id });
      items.push(...updatedItemsResult.data.boards[0].items);
    }

    const testItem = items[0];
    console.log(`🎯 Используем элемент: "${testItem.name}" (ID: ${testItem.id})`);

    // Шаг 3: Получение информации о колонках
    console.log('\n📋 Шаг 3: Получение информации о колонках...');
    const columnsQuery = `
      query($boardId: ID!) {
        boards(ids: [$boardId]) {
          columns {
            id
            title
            type
            settings_str
          }
        }
      }
    `;
    
    const columnsResult = await executeQuery(columnsQuery, { boardId: testBoard.id });
    const columns = columnsResult.data.boards[0].columns;
    console.log(`✅ Найдено колонок: ${columns.length}`);
    
    // Найдем подходящие колонки для тестирования
    const textColumn = columns.find(col => col.type === 'text');
    const statusColumn = columns.find(col => col.type === 'status');
    const numbersColumn = columns.find(col => col.type === 'numbers');
    const dateColumn = columns.find(col => col.type === 'date');

    console.log('\n📊 Доступные типы колонок для тестирования:');
    columns.forEach(col => {
      console.log(`   - ${col.title} (${col.type}, ID: ${col.id})`);
    });

    // Шаг 4: Тестирование различных типов колонок
    console.log('\n📋 Шаг 4: Тестирование обновления колонок...');

    const testCases = [
      {
        column: textColumn,
        value: 'Обновлено через API тест ' + new Date().toLocaleTimeString(),
        mutationType: 'change_simple_column_value',
        description: 'Текстовая колонка (простое значение)'
      },
      {
        column: statusColumn,
        value: { index: 1 },
        mutationType: 'change_column_value',
        description: 'Статус колонка (JSON с index)'
      },
      {
        column: numbersColumn,
        value: '42',
        mutationType: 'change_simple_column_value',
        description: 'Числовая колонка (простое значение)'
      },
      {
        column: dateColumn,
        value: { date: new Date().toISOString().split('T')[0] },
        mutationType: 'change_column_value',
        description: 'Дата колонка (JSON с date)'
      }
    ];

    for (const testCase of testCases) {
      if (!testCase.column) {
        console.log(`⚠️ ${testCase.description} - колонка не найдена на доске`);
        continue;
      }

      console.log(`\n🔧 Тестируем ${testCase.description}...`);
      console.log(`   Колонка: "${testCase.column.title}" (ID: ${testCase.column.id})`);
      console.log(`   Значение:`, testCase.value);

      try {
        let mutation;
        let variables;

        if (testCase.mutationType === 'change_simple_column_value') {
          mutation = `
            mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
              change_simple_column_value(
                board_id: $boardId, 
                item_id: $itemId, 
                column_id: $columnId, 
                value: $value,
                create_labels_if_missing: true
              ) {
                id
                name
              }
            }
          `;
          variables = {
            boardId: testBoard.id,
            itemId: testItem.id,
            columnId: testCase.column.id,
            value: String(testCase.value)
          };
        } else {
          mutation = `
            mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
              change_column_value(
                board_id: $boardId, 
                item_id: $itemId, 
                column_id: $columnId, 
                value: $value,
                create_labels_if_missing: true
              ) {
                id
                name
              }
            }
          `;
          variables = {
            boardId: testBoard.id,
            itemId: testItem.id,
            columnId: testCase.column.id,
            value: JSON.stringify(testCase.value)
          };
        }

        const updateResult = await executeQuery(mutation, variables);
        console.log(`✅ ${testCase.description} обновлена успешно`);
        
        // Добавим небольшую задержку между запросами
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.log(`❌ ${testCase.description} - ошибка:`, error.message);
      }
    }

    // Шаг 5: Проверка результатов
    console.log('\n📋 Шаг 5: Проверка результатов...');
    
    const verifyQuery = `
      query($boardId: ID!, $itemId: ID!) {
        boards(ids: [$boardId]) {
          items(ids: [$itemId]) {
            id
            name
            column_values {
              id
              type
              text
              value
              column {
                title
              }
            }
          }
        }
      }
    `;
    
    const verifyResult = await executeQuery(verifyQuery, { 
      boardId: testBoard.id, 
      itemId: testItem.id 
    });
    
    const updatedItem = verifyResult.data.boards[0].items[0];
    
    if (updatedItem) {
      console.log(`✅ Обновленный элемент "${updatedItem.name}":`);
      updatedItem.column_values.forEach(col => {
        if (col.text || col.value) {
          console.log(`   - ${col.column.title} (${col.type}): ${col.text || JSON.stringify(col.value)}`);
        }
      });
    }

    console.log('\n🎉 Тест завершен успешно!');

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error);
    
    if (error.message.includes('GraphQL')) {
      console.error('📋 Это GraphQL ошибка. Проверьте:');
      console.error('   - Правильность API ключа');
      console.error('   - Доступность API Monday.com');
      console.error('   - Корректность параметров запроса');
    }
  }
}

// Запускаем тест
testMondayColumnUpdate().catch(console.error);

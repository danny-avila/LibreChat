const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testColumnUpdate() {
  console.log('🔍 Тестируем официальную документацию Monday.com API для обновления колонок...\n');

  try {
    // 1. Получаем данные о доске
    console.log('📋 Шаг 1: Получаем данные о доске...');
    const boardQuery = `
      query {
        boards(limit: 1) {
          id
          name
          columns {
            id
            title
            type
          }
          items_page(limit: 1) {
            items {
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
      }
    `;

    const boardResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: boardQuery })
    });

    const boardData = await boardResponse.json();
    
    if (boardData.errors) {
      console.error('❌ Ошибки при получении досок:', boardData.errors);
      return;
    }

    const board = boardData.data.boards[0];
    const item = board.items_page.items[0];
    
    console.log(`✅ Доска: "${board.name}" (ID: ${board.id})`);
    console.log(`✅ Элемент: "${item.name}" (ID: ${item.id})`);

    // 2. Тестируем change_simple_column_value (согласно документации)
    const textColumn = board.columns.find(col => col.type === 'text');
    if (textColumn) {
      console.log(`\n🔧 Шаг 2: Тестируем change_simple_column_value для текстовой колонки "${textColumn.title}"...`);
      
      const simpleValueMutation = `
        mutation {
          change_simple_column_value(
            board_id: ${board.id},
            item_id: ${item.id},
            column_id: "${textColumn.id}",
            value: "Обновлено через simple API ${new Date().toLocaleString()}"
          ) {
            id
            name
          }
        }
      `;

      const simpleResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: simpleValueMutation })
      });

      const simpleData = await simpleResponse.json();
      
      if (simpleData.errors) {
        console.error('❌ Ошибки change_simple_column_value:', simpleData.errors);
      } else {
        console.log('✅ change_simple_column_value работает!');
      }
    }

    // 3. Тестируем change_column_value с JSON (согласно документации)
    const statusColumn = board.columns.find(col => col.type === 'color' || col.type === 'status');
    if (statusColumn) {
      console.log(`\n🔧 Шаг 3: Тестируем change_column_value для статус колонки "${statusColumn.title}"...`);
      
      const jsonValueMutation = `
        mutation {
          change_column_value(
            board_id: ${board.id},
            item_id: ${item.id},
            column_id: "${statusColumn.id}",
            value: "{\\"index\\":1}"
          ) {
            id
            name
          }
        }
      `;

      const jsonResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: jsonValueMutation })
      });

      const jsonData = await jsonResponse.json();
      
      if (jsonData.errors) {
        console.error('❌ Ошибки change_column_value:', jsonData.errors);
      } else {
        console.log('✅ change_column_value работает!');
      }
    }

    // 4. Тестируем change_multiple_column_values (согласно документации)
    console.log(`\n🔧 Шаг 4: Тестируем change_multiple_column_values...`);
    
    const multipleValuesMutation = `
      mutation {
        change_multiple_column_values(
          board_id: ${board.id},
          item_id: ${item.id},
          column_values: "{\\"${textColumn?.id}\\":\\"Multiple test ${new Date().toLocaleString()}\\"}",
          create_labels_if_missing: false
        ) {
          id
          name
        }
      }
    `;

    const multipleResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: multipleValuesMutation })
    });

    const multipleData = await multipleResponse.json();
    
    if (multipleData.errors) {
      console.error('❌ Ошибки change_multiple_column_values:', multipleData.errors);
    } else {
      console.log('✅ change_multiple_column_values работает!');
    }

    console.log('\n🎉 Тестирование завершено! Все три мутации из официальной документации проверены.');

  } catch (error) {
    console.error('❌ Общая ошибка:', error.message);
  }
}

testColumnUpdate();

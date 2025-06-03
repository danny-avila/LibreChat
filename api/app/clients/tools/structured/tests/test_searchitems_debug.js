const fetch = require('node-fetch');
const MondayTool = require('./MondayTool');

async function testSearchItemsDebug() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const testBoardId = '9261805849';

  console.log('🔍 Отладка searchItems...\n');

  // Тест 1: Прямой запрос
  console.log('1. Тестируем прямой запрос search items...');
  const query = `
    query searchItems($boardId: [ID!]!, $limit: Int!) {
      boards(ids: $boardId) {
        items_page(
          limit: $limit,
          query_params: {
            rules: [{
              column_id: "name", 
              compare_value: ["Test"], 
              operator: any_of
            }]
          }
        ) {
          items {
            id
            name
            group {
              id
              title
            }
          }
        }
      }
    }
  `;

  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ 
        query, 
        variables: { 
          boardId: [testBoardId], 
          limit: 5
        } 
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      console.log('   ❌ HTTP ошибка:', response.status, response.statusText);
      console.log('   Тело ответа:', JSON.stringify(data, null, 2));
      return;
    }

    if (data.errors) {
      console.log('   ❌ GraphQL ошибки:', JSON.stringify(data.errors, null, 2));
      return;
    }

    console.log('   ✅ Прямой запрос работает!');
    console.log('   Найдено элементов:', data.data.boards[0].items_page.items.length);

  } catch (error) {
    console.log('   ❌ Исключение:', error.message);
  }

  // Тест 2: MondayTool
  console.log('\n2. Тестируем MondayTool...');
  try {
    const mondayTool = new MondayTool({ apiKey });
    const result = await mondayTool._call({
      action: 'searchItems',
      boardId: testBoardId,
      query: 'Test',
      limit: 5
    });

    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('   ✅ MondayTool работает!');
      console.log('   Найдено элементов:', parsed.data.length);
    } else {
      console.log('   ❌ MondayTool не работает:', parsed.error);
    }
  } catch (error) {
    console.log('   ❌ Ошибка MondayTool:', error.message);
  }
}

testSearchItemsDebug(); 
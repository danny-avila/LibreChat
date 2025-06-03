const MondayTool = require('./MondayTool');
const fetch = require('node-fetch');

async function debugGetItems() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const testBoardId = '9261805849';
  
  console.log('🔍 Отладка getItems...\n');

  // Тест 1: Прямой запрос
  console.log('1. Тестируем прямой запрос...');
  const query = `
    query getItems($ids: [ID!]!, $limit: Int!) {
      boards(ids: $ids) {
        items_page(limit: $limit) {
          items {
            id
            name
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
          ids: [testBoardId], 
          limit: 5 
        } 
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log('   ✅ Прямой запрос работает!');
      console.log('   Элементов получено:', data.data?.boards?.[0]?.items_page?.items?.length || 0);
    } else {
      console.log('   ❌ Прямой запрос не работает:', response.status);
    }
  } catch (error) {
    console.log('   ❌ Ошибка прямого запроса:', error.message);
  }

  // Тест 2: MondayTool
  console.log('\n2. Тестируем MondayTool...');
  try {
    const mondayTool = new MondayTool({ apiKey });
    const result = await mondayTool._call({
      action: 'getItems',
      boardId: testBoardId,
      limit: 5
    });

    const parsed = JSON.parse(result);
    if (parsed.success) {
      console.log('   ✅ MondayTool работает!');
      console.log('   Элементов получено:', parsed.data.length);
    } else {
      console.log('   ❌ MondayTool не работает:', parsed.error);
    }
  } catch (error) {
    console.log('   ❌ Ошибка MondayTool:', error.message);
  }
}

debugGetItems(); 
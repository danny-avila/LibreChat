const fetch = require('node-fetch');

async function testDirectQuery() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const testBoardId = '9261805849';

  console.log('📋 Тестируем прямой GraphQL запрос getItems...');

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
        'Authorization': apiKey,
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

    const data = await response.json();
    
    if (!response.ok) {
      console.log('❌ HTTP ошибка:', response.status, response.statusText);
      console.log('Тело ответа:', data);
      return;
    }

    if (data.errors) {
      console.log('❌ GraphQL ошибки:', JSON.stringify(data.errors, null, 2));
      return;
    }

    console.log('✅ Прямой запрос успешен!');
    console.log('Результат:', JSON.stringify(data.data, null, 2));

  } catch (error) {
    console.log('❌ Исключение:', error.message);
  }
}

testDirectQuery(); 
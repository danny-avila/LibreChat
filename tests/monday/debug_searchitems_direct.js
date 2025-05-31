const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testSearchDirectly() {
  const query = `
    query {
      boards(ids: ["9261805849"]) {
        items_page(
          limit: 5,
          query_params: {
            rules: [{
              column_id: "name", 
              compare_value: ["Test"],
              operator: contains_text
            }]
          }
        ) {
          cursor
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
    console.log('🔍 Прямой GraphQL запрос к Monday.com API...');
    console.log('Запрос:', query);

    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query })
    });

    console.log('Response status:', response.status);
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));

    if (data.errors) {
      console.error('❌ GraphQL Errors:', data.errors);
    } else {
      console.log('✅ Запрос успешен!');
      console.log('📊 Найдено элементов:', data.data?.boards?.[0]?.items_page?.items?.length || 0);
    }

  } catch (error) {
    console.error('❌ Ошибка fetch:', error.message);
  }
}

testSearchDirectly(); 
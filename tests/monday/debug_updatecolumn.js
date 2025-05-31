const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testUpdateColumn() {
  // Попробуем разные варианты updateColumn
  const tests = [
    {
      name: 'Простое обновление статуса',
      query: `
        mutation {
          change_column_value(
            board_id: "9261805849",
            item_id: "9271051288", 
            column_id: "color_mkrd819y",
            value: "{\\"index\\":1}"
          ) {
            id
            name
          }
        }
      `
    },
    {
      name: 'Обновление текстового поля',
      query: `
        mutation {
          change_column_value(
            board_id: "9261805849",
            item_id: "9271051288", 
            column_id: "text_mkre1hm2",
            value: "\\"Updated via API\\""
          ) {
            id
            name
          }
        }
      `
    }
  ];

  for (const test of tests) {
    console.log(`\n🔍 Тест: ${test.name}`);
    console.log('Запрос:', test.query);

    try {
      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: test.query })
      });

      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2));

      if (data.errors) {
        console.error('❌ Ошибки:', data.errors);
      } else {
        console.log('✅ Успех!');
      }

    } catch (error) {
      console.error('❌ Ошибка fetch:', error.message);
    }
  }
}

testUpdateColumn(); 
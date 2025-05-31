const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testCreateWebhook() {
  const query = `
    mutation {
      create_webhook(
        board_id: "9261805849",
        url: "https://httpbin.org/post",
        event: create_item
      ) {
        id
        board_id
        event
        config
      }
    }
  `;

  try {
    console.log('🔍 Тестируем createWebhook...');
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
      console.error('❌ Ошибки:', data.errors);
    } else {
      console.log('✅ Webhook создан!');
      console.log('📊 Webhook ID:', data.data?.create_webhook?.id);
    }

  } catch (error) {
    console.error('❌ Ошибка fetch:', error.message);
  }
}

testCreateWebhook(); 
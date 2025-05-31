const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testCreateWebhookDetailed() {
  // Тестируем разные варианты webhook creation
  const tests = [
    {
      name: 'Простой webhook с httpbin',
      query: `
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
      `
    },
    {
      name: 'Webhook с другим URL',
      query: `
        mutation {
          create_webhook(
            board_id: "9261805849", 
            url: "https://webhook.site/unique-id",
            event: create_item
          ) {
            id
            board_id
            event
            config
          }
        }
      `
    },
    {
      name: 'Webhook с другим событием',
      query: `
        mutation {
          create_webhook(
            board_id: "9261805849",
            url: "https://httpbin.org/post", 
            event: change_column_value
          ) {
            id
            board_id
            event
            config
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
      console.log('Response headers:', JSON.stringify([...response.headers.entries()], null, 2));
      
      const data = await response.json();
      console.log('Response data:', JSON.stringify(data, null, 2));

      if (data.errors) {
        console.error('❌ Ошибки:', data.errors);
      } else if (data.data?.create_webhook) {
        console.log('✅ Webhook создан!');
        console.log('📊 Webhook ID:', data.data.create_webhook.id);
      }

    } catch (error) {
      console.error('❌ Ошибка fetch:', error.message);
    }

    // Пауза между тестами
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

testCreateWebhookDetailed(); 
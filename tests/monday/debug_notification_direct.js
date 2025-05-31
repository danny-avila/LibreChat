const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testCreateNotificationDirect() {
  // Пробуем разные значения NotificationTargetType
  const tests = [
    {
      name: 'targetType: Project',
      targetType: 'Project'
    },
    {
      name: 'targetType: Item',
      targetType: 'Item'
    },
    {
      name: 'targetType: Post',
      targetType: 'Post'
    }
  ];

  for (const test of tests) {
    const query = `
      mutation createNotification($userId: ID!, $targetId: ID!, $text: String!, $targetType: NotificationTargetType!) {
        create_notification(
          user_id: $userId,
          target_id: $targetId,
          text: $text,
          target_type: $targetType
        ) {
          text
        }
      }
    `;

    const variables = {
      userId: '17719660',
      targetId: '9261805849',
      text: 'Test notification via API',
      targetType: test.targetType
    };

    console.log(`\n🔍 Тест: ${test.name}`);
    console.log('Variables:', JSON.stringify(variables, null, 2));

    try {
      const response = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': apiKey,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query, variables })
      });

      console.log('Response status:', response.status);
      
      const data = await response.json();
      console.log('Response:', JSON.stringify(data, null, 2));

      if (data.errors) {
        console.error('❌ GraphQL Errors:', data.errors);
      } else {
        console.log('✅ Notification создан!');
        break; // Если успешно, прекращаем тестирование
      }

    } catch (error) {
      console.error('❌ Ошибка fetch:', error.message);
    }

    // Пауза между тестами
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

testCreateNotificationDirect(); 
const fetch = require('node-fetch');

/**
 * Простой тест Monday.com API для диагностики базового подключения
 */
async function testMondayAPI() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const apiUrl = 'https://api.monday.com/v2';

  console.log('🚀 Тестируем Monday.com API...\n');

  // Тест 1: Проверка API версии и account
  await testAccount(apiKey, apiUrl);

  // Тест 2: Простой запрос досок
  await testSimpleBoards(apiKey, apiUrl);

  // Тест 3: Более простой запрос досок
  await testMinimalBoards(apiKey, apiUrl);

  // Тест 4: Прямой HTTP запрос без GraphQL переменных
  await testDirectBoards(apiKey, apiUrl);
}

async function testAccount(apiKey, apiUrl) {
  console.log('📋 Тест 1: Проверка account...');
  
  const query = `
    query {
      account {
        id
        name
        plan {
          max_users
          version
        }
      }
    }
  `;

  try {
    const result = await makeRequest(apiKey, apiUrl, query, {});
    console.log('✅ Account получен:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('❌ Ошибка account:', error.message);
  }
}

async function testSimpleBoards(apiKey, apiUrl) {
  console.log('\n📋 Тест 2: Простой запрос досок...');
  
  const query = `
    query {
      boards(limit: 5) {
        id
        name
      }
    }
  `;

  try {
    const result = await makeRequest(apiKey, apiUrl, query, {});
    console.log('✅ Простые доски получены:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('❌ Ошибка простых досок:', error.message);
  }
}

async function testMinimalBoards(apiKey, apiUrl) {
  console.log('\n📋 Тест 3: Минимальный запрос досок с переменными...');
  
  const query = `
    query getBoards($limit: Int!) {
      boards(limit: $limit) {
        id
        name
        state
      }
    }
  `;

  const variables = {
    limit: 5
  };

  try {
    const result = await makeRequest(apiKey, apiUrl, query, variables);
    console.log('✅ Минимальные доски получены:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.log('❌ Ошибка минимальных досок:', error.message);
  }
}

async function testDirectBoards(apiKey, apiUrl) {
  console.log('\n📋 Тест 4: Прямой запрос без переменных...');
  
  const query = `{
    boards(limit: 3) {
      id
      name
      description
      state
    }
  }`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-01'
      },
      body: JSON.stringify({ query })
    });

    console.log('📊 HTTP статус:', response.status, response.statusText);
    console.log('📊 Заголовки ответа:', Object.fromEntries(response.headers.entries()));

    const data = await response.json();
    
    if (data.errors) {
      console.log('❌ GraphQL ошибки:', JSON.stringify(data.errors, null, 2));
    } else {
      console.log('✅ Прямой запрос успешен:', JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.log('❌ Ошибка прямого запроса:', error.message);
  }
}

async function makeRequest(apiKey, apiUrl, query, variables) {
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'API-Version': '2024-01'
    },
    body: JSON.stringify({ query, variables })
  });

  console.log(`📊 HTTP статус: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }
  
  return data.data;
}

// Запуск тестов
testMondayAPI()
  .then(() => {
    console.log('\n🎯 Все тесты завершены');
  })
  .catch(error => {
    console.error('\n💥 Критическая ошибка:', error.message);
    process.exit(1);
  }); 
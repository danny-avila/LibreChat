const fetch = require('node-fetch');

async function testGraphQL() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const boardId = '9261805849';
  
  console.log('🧪 Тестируем прямой GraphQL запрос getItems...');
  
  // Тест 1: Минимальный запрос
  const query1 = `{
    boards(ids: [${boardId}]) {
      name
      id
    }
  }`;
  
  console.log('📋 Тест 1: Получение базовой информации о доске');
  try {
    const response1 = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: query1 })
    });
    
    const data1 = await response1.json();
    if (data1.errors) {
      console.log('❌ Ошибка в тесте 1:', data1.errors);
    } else {
      console.log('✅ Тест 1 успешен:', data1.data.boards[0].name);
    }
  } catch (error) {
    console.log('❌ Исключение в тесте 1:', error.message);
  }
  
  // Тест 2: Простейший запрос items без параметров
  const query2 = `{
    boards(ids: [${boardId}]) {
      items {
        id
        name
      }
    }
  }`;
  
  console.log('📋 Тест 2: Получение элементов без параметров');
  try {
    const response2 = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: query2 })
    });
    
    const data2 = await response2.json();
    if (data2.errors) {
      console.log('❌ Ошибка в тесте 2:', data2.errors);
    } else {
      console.log('✅ Тест 2 успешен, элементов:', data2.data.boards[0].items.length);
    }
  } catch (error) {
    console.log('❌ Исключение в тесте 2:', error.message);
  }
  
  // Тест 3: С лимитом
  const query3 = `{
    boards(ids: [${boardId}]) {
      items(limit: 5) {
        id
        name
      }
    }
  }`;
  
  console.log('📋 Тест 3: Получение элементов с лимитом');
  try {
    const response3 = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: query3 })
    });
    
    const data3 = await response3.json();
    if (data3.errors) {
      console.log('❌ Ошибка в тесте 3:', data3.errors);
    } else {
      console.log('✅ Тест 3 успешен, элементов:', data3.data.boards[0].items.length);
    }
  } catch (error) {
    console.log('❌ Исключение в тесте 3:', error.message);
  }
}

testGraphQL(); 
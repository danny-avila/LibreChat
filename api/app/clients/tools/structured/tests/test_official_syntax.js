const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
const testBoardId = '9261805849';

async function testOfficialSyntax() {
  console.log('\n🔍 Тестируем официальный синтаксис из документации Monday.com...\n');

  // 1. Тест из официальной документации - создание элемента  
  console.log('1. Тест create_item (официальный синтаксис):');
  const createItemQuery = `
    mutation {
      create_item (board_id: ${testBoardId}, item_name: "Test Item Official") {
        id
        name
      }
    }
  `;
  
  await testQuery(createItemQuery, {}, 'create_item official syntax');

  // 2. Тест из документации - получение элементов доски
  console.log('\n2. Тест items_page (официальный синтаксис):');
  const getItemsQuery = `
    query {
      boards (ids: ${testBoardId}) {
        items_page (limit: 5) {
          items {
            id
            name
          }
        }
      }
    }
  `;
  
  await testQuery(getItemsQuery, {}, 'get items_page official syntax');

  // 3. Тест создания с variables (правильный способ)
  console.log('\n3. Тест create_item с переменными:');
  const createItemWithVarsQuery = `
    mutation createItem($board_id: ID!, $item_name: String!) {
      create_item (board_id: $board_id, item_name: $item_name) {
        id
        name
      }
    }
  `;
  
  await testQuery(createItemWithVarsQuery, {
    board_id: testBoardId,
    item_name: "Test Item with Variables"
  }, 'create_item with variables');

  // 4. Тест items_page с переменными  
  console.log('\n4. Тест items_page с переменными:');
  const getItemsWithVarsQuery = `
    query getItems($ids: [ID!]!, $limit: Int!) {
      boards (ids: $ids) {
        items_page (limit: $limit) {
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
  
  await testQuery(getItemsWithVarsQuery, {
    ids: [testBoardId],
    limit: 5
  }, 'get items_page with variables');

  // 5. Тест create_group (официальный синтаксис)
  console.log('\n5. Тест create_group (официальный синтаксис):');
  const createGroupQuery = `
    mutation {
      create_group (board_id: ${testBoardId}, group_name: "Test Group Official") {
        id
        title
      }
    }
  `;
  
  await testQuery(createGroupQuery, {}, 'create_group official syntax');
}

async function testQuery(query, variables, description) {
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

    const text = await response.text();
    console.log(`📋 Status: ${response.status}`);
    
    if (!response.ok) {
      console.log(`❌ HTTP Error: ${response.status} ${response.statusText}`);
      console.log(`📋 Response: ${text.substring(0, 500)}...`);
      return;
    }

    const data = JSON.parse(text);
    
    if (data.errors) {
      console.log(`❌ GraphQL Errors:`, JSON.stringify(data.errors, null, 2));
      return;
    }
    
    console.log(`✅ ${description}: УСПЕШНО`);
    console.log(`📋 Data:`, JSON.stringify(data.data, null, 2));
    
  } catch (error) {
    console.log(`❌ ${description}: ОШИБКА - ${error.message}`);
  }
}

testOfficialSyntax(); 
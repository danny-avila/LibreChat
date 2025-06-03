const MondayTool = require('./MondayTool');
const fetch = require('node-fetch');

async function testDirectComparison() {
  const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
  const apiUrl = 'https://api.monday.com/v2';

  console.log('🔍 Сравнение рабочего vs нерабочего запросов...\n');

  // Рабочий запрос (из test_simple_api.js)
  console.log('✅ Тест 1: Рабочий запрос...');
  const workingQuery = `
    query getBoards($limit: Int!) {
      boards(limit: $limit) {
        id
        name
        state
      }
    }
  `;

  try {
    const response1 = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ 
        query: workingQuery, 
        variables: { limit: 5 } 
      })
    });

    console.log(`📊 Статус: ${response1.status}`);
    if (response1.ok) {
      const data1 = await response1.json();
      console.log('✅ Рабочий запрос успешен');
    } else {
      const error1 = await response1.text();
      console.log('❌ Рабочий запрос неуспешен:', error1);
    }
  } catch (error) {
    console.log('❌ Ошибка рабочего запроса:', error.message);
  }

  // Нерабочий запрос (из MondayTool)
  console.log('\n❌ Тест 2: Нерабочий запрос (из MondayTool)...');
  const nonWorkingQuery = `
    query getBoards($limit: Int!) {
      boards(limit: $limit) {
        id
        name
        description
        state
        board_kind
        workspace {
          id
          name
        }
        items_count
        created_at
        updated_at
      }
    }
  `;

  try {
    const response2 = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ 
        query: nonWorkingQuery, 
        variables: { limit: 5 } 
      })
    });

    console.log(`📊 Статус: ${response2.status}`);
    if (response2.ok) {
      const data2 = await response2.json();
      console.log('✅ Нерабочий запрос неожиданно успешен');
    } else {
      const error2 = await response2.text();
      console.log('❌ Нерабочий запрос неуспешен:', error2);
    }
  } catch (error) {
    console.log('❌ Ошибка нерабочего запроса:', error.message);
  }

  // Тест с MondayTool
  console.log('\n🔧 Тест 3: Через MondayTool...');
  try {
    const mondayTool = new MondayTool({ apiKey });
    const result = await mondayTool._call({
      action: 'getBoards',
      limit: 5
    });
    console.log('✅ MondayTool успешен:', JSON.parse(result));
  } catch (error) {
    console.log('❌ MondayTool неуспешен:', error.message);
  }

  // Прямой тест createItem
  console.log('\n🚀 Тест 4: Прямой тест createItem...');
  const createItemMutation = `
    mutation createItem($boardId: ID!, $itemName: String!) {
      create_item(
        board_id: $boardId,
        item_name: $itemName
      ) {
        id
        name
        state
      }
    }
  `;

  try {
    const response4 = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ 
        query: createItemMutation, 
        variables: { 
          boardId: '9261805849',
          itemName: `Прямой тест ${Date.now()}`
        } 
      })
    });

    console.log(`📊 Статус: ${response4.status}`);
    if (response4.ok) {
      const data4 = await response4.json();
      if (data4.errors) {
        console.log('❌ GraphQL ошибки:', JSON.stringify(data4.errors, null, 2));
      } else {
        console.log('✅ Прямой createItem успешен:', JSON.stringify(data4.data, null, 2));
      }
    } else {
      const error4 = await response4.text();
      console.log('❌ Прямой createItem неуспешен:', error4);
    }
  } catch (error) {
    console.log('❌ Ошибка прямого createItem:', error.message);
  }
}

testDirectComparison(); 
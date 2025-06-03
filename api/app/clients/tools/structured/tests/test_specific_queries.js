const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testGraphQLQuery(query, variables, description) {
  console.log(`\n🔍 Тестируем: ${description}`);
  console.log(`📋 Запрос:`, query.substring(0, 100) + '...');
  console.log(`📋 Переменные:`, JSON.stringify(variables, null, 2));

  try {
    const response = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    });

    const data = await response.json();
    
    if (response.ok && !data.errors) {
      console.log(`✅ Успешно! Статус: ${response.status}`);
      console.log(`📊 Данные:`, JSON.stringify(data.data, null, 2));
      return { success: true, data: data.data };
    } else {
      console.log(`❌ Ошибка! Статус: ${response.status}`);
      console.log(`❌ Ошибки:`, JSON.stringify(data.errors || data, null, 2));
      return { success: false, error: data.errors || data };
    }
  } catch (error) {
    console.log(`💥 Исключение:`, error.message);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('🚀 Начинаем диагностику отдельных GraphQL запросов...\n');

  // Тест 1: getBoard (детали доски)
  await testGraphQLQuery(`
    query getBoard($boardId: [ID!]!) {
      boards(ids: $boardId) {
        id
        name
        description
        state
        board_kind
        workspace {
          id
          name
        }
        columns {
          id
          title
          type
          settings_str
        }
      }
    }
  `, {
    boardId: ['9261805849']
  }, 'GET_BOARD_DETAILS (упрощенный)');

  // Тест 2: createItem (простое создание)
  await testGraphQLQuery(`
    mutation createItem($boardId: ID!, $itemName: String!) {
      create_item(
        board_id: $boardId,
        item_name: $itemName
      ) {
        id
        name
        state
        board {
          id
          name
        }
      }
    }
  `, {
    boardId: '9261805849',
    itemName: `Простой тест ${Date.now()}`
  }, 'CREATE_ITEM (простое)');

  // Тест 3: createGroup
  await testGraphQLQuery(`
    mutation createGroup($boardId: ID!, $groupName: String!) {
      create_group(
        board_id: $boardId,
        group_name: $groupName
      ) {
        id
        title
        color
        board {
          id
          name
        }
      }
    }
  `, {
    boardId: '9261805849',
    groupName: `Тестовая группа ${Date.now()}`
  }, 'CREATE_GROUP (простое)');

  // Тест 4: getItems
  await testGraphQLQuery(`
    query getItems($boardId: [ID!]!, $limit: Int!) {
      boards(ids: $boardId) {
        items_page(limit: $limit) {
          cursor
          items {
            id
            name
            state
            group {
              id
              title
            }
            board {
              id
              name
            }
          }
        }
      }
    }
  `, {
    boardId: ['9261805849'],
    limit: 5
  }, 'GET_ITEMS (простое)');

  // Тест 5: searchItems
  await testGraphQLQuery(`
    query searchItems($boardId: ID!, $query: String!, $limit: Int!) {
      items_page_by_column_values(
        limit: $limit,
        board_id: $boardId,
        columns: [
          {
            column_id: "name",
            column_values: [$query]
          }
        ]
      ) {
        cursor
        items {
          id
          name
          state
          board {
            id
            name
          }
        }
      }
    }
  `, {
    boardId: '9261805849',
    query: 'Тест',
    limit: 5
  }, 'SEARCH_ITEMS (простое)');

  console.log('\n✅ Диагностика завершена!');
}

runTests(); 
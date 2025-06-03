/**
 * Простой тест Monday.com API с прямыми вызовами
 * Usage: MONDAY_API_KEY=your_token node test_direct_api_simple.js
 */

const https = require('https');

// API ключ из переменной окружения
const apiKey = process.env.MONDAY_API_KEY;

if (!apiKey) {
  console.error('❌ Set MONDAY_API_KEY environment variable');
  console.log('Example: MONDAY_API_KEY=your_token node test_direct_api_simple.js');
  process.exit(1);
}

console.log('🚀 Starting simple Monday.com API test...\n');

// Функция для выполнения GraphQL запросов
function makeRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      query: query,
      variables: variables
    });

    const options = {
      hostname: 'api.monday.com',
      port: 443,
      path: '/v2',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
        'Content-Length': data.length
      }
    };

    const req = https.request(options, (res) => {
      let responseData = '';

      res.on('data', (chunk) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          if (parsed.errors) {
            reject(new Error(`GraphQL Error: ${JSON.stringify(parsed.errors)}`));
          } else {
            resolve(parsed);
          }
        } catch (error) {
          reject(new Error(`Parse Error: ${error.message}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(new Error(`Request Error: ${error.message}`));
    });

    req.write(data);
    req.end();
  });
}

async function testColumnUpdate() {
  try {
    // Step 1: Get boards
    console.log('📋 Step 1: Getting boards...');
    const boardsQuery = `
      query {
        boards(limit: 5) {
          id
          name
          columns {
            id
            title
            type
          }
          items_page(limit: 3) {
            items {
              id
              name
              column_values {
                id
                type
                text
                value
              }
            }
          }
        }
      }
    `;

    const boardsResult = await makeRequest(boardsQuery);
    const boards = boardsResult.data.boards;
    console.log(`✅ Found boards: ${boards.length}`);

    if (boards.length === 0) {
      console.log('❌ No boards found');
      return;
    }

    const testBoard = boards[0];
    console.log(`🎯 Using board: "${testBoard.name}" (ID: ${testBoard.id})`);

    // Find items
    const items = testBoard.items_page.items;
    console.log(`✅ Found items: ${items.length}`);

    if (items.length === 0) {
      console.log('⚠️ No items found, creating one...');
      
      const createItemMutation = `
        mutation($boardId: ID!, $itemName: String!) {
          create_item(board_id: $boardId, item_name: $itemName) {
            id
            name
          }
        }
      `;

      const createResult = await makeRequest(createItemMutation, {
        boardId: testBoard.id,
        itemName: `Test Item ${Date.now()}`
      });

      console.log(`✅ Created item: ${createResult.data.create_item.name}`);
      items.push(createResult.data.create_item);
    }

    const testItem = items[0];
    console.log(`🎯 Using item: "${testItem.name}" (ID: ${testItem.id})`);

    // Find a text column to test
    const textColumn = testBoard.columns.find(col => col.type === 'text');
    const statusColumn = testBoard.columns.find(col => col.type === 'color');
    const testColumn = textColumn || statusColumn;

    if (!testColumn) {
      console.log('❌ No suitable columns found for testing');
      return;
    }

    console.log(`🎯 Using column: "${testColumn.title}" (ID: ${testColumn.id}, Type: ${testColumn.type})`);

    // Step 2: Test column update
    console.log('\n📋 Step 2: Testing column update...');

    let updateValue;
    let mutation;

    if (testColumn.type === 'text') {
      // Use change_simple_column_value for text columns
      updateValue = `Updated at ${new Date().toISOString()}`;
      mutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(
            board_id: $boardId,
            item_id: $itemId,
            column_id: $columnId,
            value: $value
          ) {
            id
            name
          }
        }
      `;
    } else {
      // Use change_column_value for other types
      updateValue = JSON.stringify({ index: 1 });
      mutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(
            board_id: $boardId,
            item_id: $itemId,
            column_id: $columnId,
            value: $value
          ) {
            id
            name
          }
        }
      `;
    }

    console.log(`🔧 Updating column "${testColumn.title}" with value:`, updateValue);

    const updateResult = await makeRequest(mutation, {
      boardId: testBoard.id,
      itemId: testItem.id,
      columnId: testColumn.id,
      value: updateValue
    });

    console.log('✅ Column updated successfully!');
    console.log('Response:', JSON.stringify(updateResult.data, null, 2));

    // Step 3: Verify the update
    console.log('\n📋 Step 3: Verifying update...');
    
    const verifyQuery = `
      query($itemIds: [ID!]!) {
        items(ids: $itemIds) {
          id
          name
          column_values {
            id
            type
            text
            value
          }
        }
      }
    `;

    const verifyResult = await makeRequest(verifyQuery, {
      itemIds: [testItem.id]
    });

    const updatedItem = verifyResult.data.items[0];
    const updatedColumn = updatedItem.column_values.find(col => col.id === testColumn.id);

    if (updatedColumn) {
      console.log(`✅ Column "${testColumn.title}" current value: "${updatedColumn.text || updatedColumn.value}"`);
    }

    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Run the test
testColumnUpdate();

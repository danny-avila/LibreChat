/**
 * Fixed Monday.com API test for column updates
 * Usage: MONDAY_API_KEY=your_token node test_monday_fixed.js
 */

const fetch = require('node-fetch');

// Get API key from environment variable
const apiKey = process.env.MONDAY_API_KEY;

if (!apiKey) {
  console.error('❌ Set MONDAY_API_KEY environment variable');
  console.log('Example: MONDAY_API_KEY=your_token node test_monday_fixed.js');
  process.exit(1);
}

const API_URL = 'https://api.monday.com/v2';

// Function to execute GraphQL queries
async function executeQuery(query, variables = {}) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey, // Monday.com uses raw token, not Bearer
        'API-Version': '2023-10'
      },
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }
    
    return data;
  } catch (error) {
    console.error('Request failed:', error.message);
    throw error;
  }
}

async function testMondayColumnUpdate() {
  console.log('🚀 Testing Monday.com Column Update API...\n');

  try {
    // Step 1: Get list of boards
    console.log('📋 Step 1: Getting boards...');
    const boardsQuery = `
      query {
        boards(limit: 10) {
          id
          name
          columns {
            id
            title
            type
          }
        }
      }
    `;
    
    const boardsResult = await executeQuery(boardsQuery);
    const boards = boardsResult.data.boards;
    console.log(`✅ Found boards: ${boards.length}`);
    
    if (boards.length === 0) {
      console.log('❌ No boards found');
      return;
    }
    
    const testBoard = boards[0];
    console.log(`🎯 Using board: "${testBoard.name}" (ID: ${testBoard.id})`);
    console.log('📊 Columns:', testBoard.columns.map(c => `${c.title} (${c.type})`).join(', '));

    // Step 2: Get board items
    console.log('\n📋 Step 2: Getting board items...');
    const itemsQuery = `
      query($boardId: ID!) {
        boards(ids: [$boardId]) {
          items(limit: 3) {
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
    `;
    
    const itemsResult = await executeQuery(itemsQuery, { boardId: testBoard.id });
    const items = itemsResult.data.boards[0].items;
    console.log(`✅ Found items: ${items.length}`);
    
    if (items.length === 0) {
      console.log('⚠️ No items in board, creating test item...');
      
      const createItemMutation = `
        mutation($boardId: ID!, $itemName: String!) {
          create_item(board_id: $boardId, item_name: $itemName) {
            id
            name
          }
        }
      `;
      
      const createResult = await executeQuery(createItemMutation, {
        boardId: testBoard.id,
        itemName: `Test Item ${Date.now()}`
      });
      
      console.log('✅ Created test item:', createResult.data.create_item.name);
      
      // Get items again
      const newItemsResult = await executeQuery(itemsQuery, { boardId: testBoard.id });
      items.push(...newItemsResult.data.boards[0].items);
    }
    
    const testItem = items[0];
    console.log(`🎯 Using item: "${testItem.name}" (ID: ${testItem.id})`);

    // Step 3: Test column updates
    console.log('\n📋 Step 3: Testing column updates...');
    
    // Find different column types to test
    const textColumn = testBoard.columns.find(c => c.type === 'text');
    const statusColumn = testBoard.columns.find(c => c.type === 'color');
    const numberColumn = testBoard.columns.find(c => c.type === 'numeric');
    
    // Test 1: Update text column
    if (textColumn) {
      console.log(`\n🔄 Testing text column update: ${textColumn.title}`);
      const textMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;
      
      const textValue = `Updated at ${new Date().toISOString()}`;
      await executeQuery(textMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: textColumn.id,
        value: textValue
      });
      console.log(`✅ Text column updated with: ${textValue}`);
    }
    
    // Test 2: Update status column
    if (statusColumn) {
      console.log(`\n🔄 Testing status column update: ${statusColumn.title}`);
      const statusMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;
      
      // Status columns use index values, starting from 0
      const statusValue = JSON.stringify({ index: 1 });
      await executeQuery(statusMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: statusColumn.id,
        value: statusValue
      });
      console.log(`✅ Status column updated with index: 1`);
    }
    
    // Test 3: Update number column
    if (numberColumn) {
      console.log(`\n🔄 Testing number column update: ${numberColumn.title}`);
      const numberMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;
      
      const numberValue = Math.floor(Math.random() * 1000).toString();
      await executeQuery(numberMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: numberColumn.id,
        value: numberValue
      });
      console.log(`✅ Number column updated with: ${numberValue}`);
    }
    
    // Step 4: Verify updates
    console.log('\n📋 Step 4: Verifying updates...');
    const verifyResult = await executeQuery(itemsQuery, { boardId: testBoard.id });
    const updatedItem = verifyResult.data.boards[0].items.find(item => item.id === testItem.id);
    
    console.log('📊 Updated values:');
    updatedItem.column_values.forEach(col => {
      if (col.text && col.text.trim()) {
        console.log(`   ${col.id}: ${col.text}`);
      }
    });
    
    console.log('\n✅ All column update tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error);
    console.log('📋 This might be a GraphQL error. Check:');
    console.log('   - API key validity');
    console.log('   - Monday.com API availability');
    console.log('   - Query parameters correctness');
  }
}

// Run the test
testMondayColumnUpdate()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

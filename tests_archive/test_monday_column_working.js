/**
 * Monday.com Column Update Test - Using working test format
 * Usage: MONDAY_API_KEY=your_token node test_monday_column_working.js
 */

const fetch = require('node-fetch');

// Get API key from environment variable
const apiKey = process.env.MONDAY_API_KEY;

if (!apiKey) {
  console.error('❌ Set MONDAY_API_KEY environment variable');
  console.log('Example: MONDAY_API_KEY=your_token node test_monday_column_working.js');
  process.exit(1);
}

const API_URL = 'https://api.monday.com/v2';

// Function to make requests (same format as working test)
async function makeRequest(query, variables = {}) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'API-Version': '2024-01'
    },
    body: JSON.stringify({ query, variables })
  });

  console.log(`📊 HTTP Status: ${response.status} ${response.statusText}`);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  
  if (data.errors) {
    throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
  }
  
  return data;
}

async function testColumnUpdate() {
  console.log('🚀 Testing Monday.com Column Update...\n');

  try {
    // Step 1: Get boards with columns info
    console.log('📋 Step 1: Getting boards and columns...');
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
    console.log(`📊 Columns found: ${testBoard.columns.length}`);
    testBoard.columns.forEach(col => {
      console.log(`   - ${col.title} (${col.type}) [${col.id}]`);
    });

    // Step 2: Get items from the board
    console.log('\n📋 Step 2: Getting board items...');
    const itemsQuery = `
      query($boardIds: [ID!]!) {
        boards(ids: $boardIds) {
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
    
    const itemsResult = await makeRequest(itemsQuery, { boardIds: [testBoard.id] });
    const items = itemsResult.data.boards[0].items;
    console.log(`✅ Found items: ${items.length}`);
    
    if (items.length === 0) {
      console.log('⚠️ No items found, creating a test item...');
      
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
      
      // Refresh items list
      const newItemsResult = await makeRequest(itemsQuery, { boardIds: [testBoard.id] });
      items.push(...newItemsResult.data.boards[0].items);
    }
    
    const testItem = items[0];
    console.log(`🎯 Using item: "${testItem.name}" (ID: ${testItem.id})`);

    // Step 3: Test different column updates
    console.log('\n📋 Step 3: Testing column updates...');
    
    // Find columns to test
    const textColumn = testBoard.columns.find(c => c.type === 'text');
    const statusColumn = testBoard.columns.find(c => c.type === 'color');
    const numberColumn = testBoard.columns.find(c => c.type === 'numeric');
    
    console.log('\n🔍 Available column types for testing:');
    console.log(`   Text column: ${textColumn ? textColumn.title : 'Not found'}`);
    console.log(`   Status column: ${statusColumn ? statusColumn.title : 'Not found'}`);
    console.log(`   Number column: ${numberColumn ? numberColumn.title : 'Not found'}`);
    
    // Test 1: Update text column using change_simple_column_value
    if (textColumn) {
      console.log(`\n🔄 Test 1: Updating text column "${textColumn.title}"...`);
      const textMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;
      
      const textValue = `Updated at ${new Date().toISOString()}`;
      const textResult = await makeRequest(textMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: textColumn.id,
        value: textValue
      });
      console.log(`✅ Text column updated successfully with: "${textValue}"`);
    }
    
    // Test 2: Update status column using change_column_value
    if (statusColumn) {
      console.log(`\n🔄 Test 2: Updating status column "${statusColumn.title}"...`);
      const statusMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;
      
      // Status columns use index, usually 0, 1, 2, etc.
      const statusValue = JSON.stringify({ index: 1 });
      const statusResult = await makeRequest(statusMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: statusColumn.id,
        value: statusValue
      });
      console.log(`✅ Status column updated successfully with index: 1`);
    }
    
    // Test 3: Update number column
    if (numberColumn) {
      console.log(`\n🔄 Test 3: Updating number column "${numberColumn.title}"...`);
      const numberMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: $columnId, value: $value) {
            id
          }
        }
      `;
      
      const numberValue = Math.floor(Math.random() * 1000).toString();
      const numberResult = await makeRequest(numberMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: numberColumn.id,
        value: numberValue
      });
      console.log(`✅ Number column updated successfully with: ${numberValue}`);
    }
    
    // Step 4: Verify the updates
    console.log('\n📋 Step 4: Verifying updates...');
    const verifyResult = await makeRequest(itemsQuery, { boardIds: [testBoard.id] });
    const updatedItem = verifyResult.data.boards[0].items.find(item => item.id === testItem.id);
    
    console.log('\n📊 Current column values:');
    updatedItem.column_values.forEach(col => {
      if (col.text && col.text.trim()) {
        const columnInfo = testBoard.columns.find(c => c.id === col.id);
        const columnTitle = columnInfo ? columnInfo.title : col.id;
        console.log(`   ${columnTitle}: "${col.text}"`);
      }
    });
    
    console.log('\n✅ Column update test completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    if (error.message.includes('GraphQL Error')) {
      console.log('\n📋 This is a GraphQL error. Please check:');
      console.log('   - Query syntax');
      console.log('   - Column IDs and types');
      console.log('   - Permission levels');
    }
  }
}

// Run the test
testColumnUpdate()
  .then(() => {
    console.log('\n🎯 Test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });

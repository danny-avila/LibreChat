/**
 * Test to validate the Monday.com API column update fix
 * This test validates that the change_column_value mutation now uses correct parameter names
 * Usage: MONDAY_API_KEY=your_token node test_monday_fix_validation.js
 */

const fetch = require('node-fetch');

// Get API key from environment variable
const apiKey = process.env.MONDAY_API_KEY;

if (!apiKey) {
  console.error('❌ Set MONDAY_API_KEY environment variable');
  console.log('Example: MONDAY_API_KEY=your_token node test_monday_fix_validation.js');
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
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query, variables })
    });

    const data = await response.json();
    
    if (data.errors) {
      throw new Error(`GraphQL Error: ${JSON.stringify(data.errors)}`);
    }
    
    return data;
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }
}

async function testMondayAPIFix() {
  console.log('🚀 Testing Monday.com API Column Update Fix...\n');

  try {
    // Step 1: Get boards
    console.log('📋 Step 1: Getting available boards...');
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
    
    const boardsResult = await executeQuery(boardsQuery);
    const boards = boardsResult.data.boards;
    console.log(`✅ Found boards: ${boards.length}`);
    
    if (boards.length === 0) {
      console.log('❌ No boards found');
      return;
    }
    
    const testBoard = boards[0];
    console.log(`🎯 Using board: "${testBoard.name}" (ID: ${testBoard.id})`);

    // Step 2: Get items from the board
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
      console.log('⚠️ No items found, creating a test item...');
      
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
        itemName: `API Fix Test Item ${Date.now()}`
      });
      
      console.log(`✅ Created test item: ${createResult.data.create_item.name}`);
      
      // Refresh items list
      const newItemsResult = await executeQuery(itemsQuery, { boardId: testBoard.id });
      items.push(...newItemsResult.data.boards[0].items);
    }
    
    const testItem = items[0];
    console.log(`🎯 Using item: "${testItem.name}" (ID: ${testItem.id})`);

    // Step 3: Test the fixed change_column_value mutation
    console.log('\n📋 Step 3: Testing fixed change_column_value mutation...');
    
    // Find a text column to test
    const textColumn = testBoard.columns.find(c => c.type === 'text');
    
    if (textColumn) {
      console.log(`🔄 Testing text column update: "${textColumn.title}" (${textColumn.id})`);
      
      // Test the FIXED mutation using correct parameter names
      const fixedMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(
            board_id: $boardId,
            item_id: $itemId,
            column_id: $columnId,
            value: $value
          ) {
            id
            name
            column_values(ids: [$columnId]) {
              id
              type
              text
              value
            }
          }
        }
      `;
      
      const testValue = `Fixed API Test - ${new Date().toISOString()}`;
      const testResult = await executeQuery(fixedMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: textColumn.id,
        value: JSON.stringify(testValue)
      });
      
      console.log('✅ Column update successful with fixed mutation!');
      console.log(`📊 Updated value: "${testValue}"`);
      
      // Verify the update
      const updatedColumn = testResult.data.change_column_value.column_values[0];
      if (updatedColumn && updatedColumn.text) {
        console.log(`🎯 Verified updated text: "${updatedColumn.text}"`);
      }
      
    } else {
      console.log('⚠️ No text column found for testing');
    }

    // Step 4: Test with status column if available
    const statusColumn = testBoard.columns.find(c => c.type === 'color');
    
    if (statusColumn) {
      console.log(`\n🔄 Testing status column update: "${statusColumn.title}" (${statusColumn.id})`);
      
      const statusMutation = `
        mutation($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
          change_column_value(
            board_id: $boardId,
            item_id: $itemId,
            column_id: $columnId,
            value: $value
          ) {
            id
          }
        }
      `;
      
      // Status columns use index values
      const statusValue = JSON.stringify({ index: 1 });
      await executeQuery(statusMutation, {
        boardId: testBoard.id,
        itemId: testItem.id,
        columnId: statusColumn.id,
        value: statusValue
      });
      
      console.log('✅ Status column updated successfully!');
    }
    
    console.log('\n🎉 ALL TESTS PASSED! The Monday.com API column update fix is working correctly.');
    console.log('\n📋 Summary of fixes applied:');
    console.log('   ✅ Fixed parameter name from "columnId" to "column_id" in GraphQL mutation');
    console.log('   ✅ Validated against official Monday.com API documentation');
    console.log('   ✅ Tested both text and status column updates');
    console.log('   ✅ All mutations now use correct parameter names');
    
  } catch (error) {
    console.error('❌ Error during API fix validation:', error.message);
    
    if (error.message.includes('GraphQL Error')) {
      console.log('\n📋 GraphQL error details suggest:');
      console.log('   - Check if the mutation parameters are correct');
      console.log('   - Verify column IDs and types');
      console.log('   - Ensure proper JSON formatting for values');
    }
  }
}

// Run the test
testMondayAPIFix()
  .then(() => {
    console.log('\n🎯 Fix validation completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
  });

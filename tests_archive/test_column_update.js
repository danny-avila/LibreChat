#!/usr/bin/env node

/**
 * Test Monday.com column update functionality
 * This tests the updateColumn method that the user reported as not working
 */

const fetch = require('node-fetch');

// Use the working API key from the test files
const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
const API_URL = 'https://api.monday.com/v2';

console.log('🎯 Testing Monday.com Column Update Functionality\n');

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

  const result = await response.json();
  
  if (result.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
  }
  
  return result;
}

async function getTestBoard() {
  console.log('📋 Getting test board with items...');
  
  const query = `
    query {
      boards(limit: 1) {
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
              text
              value
              column {
                id
                title
                type
              }
            }
          }
        }
      }
    }
  `;

  const result = await makeRequest(query);
  
  if (!result.data.boards || result.data.boards.length === 0) {
    throw new Error('No boards found');
  }
  
  const board = result.data.boards[0];
  console.log(`✅ Found board: ${board.name} (ID: ${board.id})`);
  console.log(`📊 Available columns (${board.columns.length}):`);
  
  board.columns.forEach(col => {
    console.log(`   - ${col.title} (${col.type}) [ID: ${col.id}]`);
  });
  
  const items = board.items_page.items;
  if (items.length === 0) {
    console.log('⚠️  No items found in board');
    return null;
  }
  
  console.log(`📝 Found ${items.length} items. Using first item: ${items[0].name} (ID: ${items[0].id})`);
  console.log('📊 Current column values:');
  
  items[0].column_values.forEach(col => {
    console.log(`   - ${col.column.title} (${col.column.type}): "${col.text}" [ID: ${col.id}]`);
    if (col.value && col.value !== col.text) {
      console.log(`     Raw value: ${col.value}`);
    }
  });
  
  return {
    board,
    item: items[0],
    textColumns: board.columns.filter(c => c.type === 'text'),
    statusColumns: board.columns.filter(c => c.type === 'color'),
    numberColumns: board.columns.filter(c => c.type === 'numbers'),
    dateColumns: board.columns.filter(c => c.type === 'date')
  };
}

async function testTextColumnUpdate(boardId, itemId, columnId) {
  console.log(`\n🔤 Testing text column update...`);
  console.log(`   Board: ${boardId}, Item: ${itemId}, Column: ${columnId}`);
  
  const newValue = `Updated text ${Date.now()}`;
  
  // Method 1: change_simple_column_value (for simple values like text)
  try {
    const query = `
      mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
        change_simple_column_value(
          board_id: $boardId
          item_id: $itemId
          column_id: $columnId
          value: $value
        ) {
          id
          name
        }
      }
    `;

    const variables = {
      boardId: parseInt(boardId),
      itemId: parseInt(itemId),
      columnId,
      value: newValue
    };

    console.log(`📤 Sending mutation with value: "${newValue}"`);
    
    const result = await makeRequest(query, variables);
    
    if (result.data && result.data.change_simple_column_value) {
      console.log('✅ Text column updated successfully using change_simple_column_value');
      console.log(`   Item: ${result.data.change_simple_column_value.name}`);
      return true;
    } else {
      console.log('❌ Failed to update text column');
      console.log('   Response:', JSON.stringify(result, null, 2));
      return false;
    }
    
  } catch (error) {
    console.log('❌ Error updating text column:', error.message);
    return false;
  }
}

async function testStatusColumnUpdate(boardId, itemId, columnId) {
  console.log(`\n🎨 Testing status column update...`);
  console.log(`   Board: ${boardId}, Item: ${itemId}, Column: ${columnId}`);
  
  // Method 2: change_column_value (for complex values like status)
  try {
    const query = `
      mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: JSON!) {
        change_column_value(
          board_id: $boardId
          item_id: $itemId
          column_id: $columnId
          value: $value
        ) {
          id
          name
        }
      }
    `;

    // For status columns, use index format based on Monday.com docs
    const statusValue = JSON.stringify({ index: 1 });

    const variables = {
      boardId: parseInt(boardId),
      itemId: parseInt(itemId),
      columnId,
      value: statusValue
    };

    console.log(`📤 Sending mutation with value: ${statusValue}`);
    
    const result = await makeRequest(query, variables);
    
    if (result.data && result.data.change_column_value) {
      console.log('✅ Status column updated successfully using change_column_value');
      console.log(`   Item: ${result.data.change_column_value.name}`);
      return true;
    } else {
      console.log('❌ Failed to update status column');
      console.log('   Response:', JSON.stringify(result, null, 2));
      return false;
    }
    
  } catch (error) {
    console.log('❌ Error updating status column:', error.message);
    return false;
  }
}

async function testNumberColumnUpdate(boardId, itemId, columnId) {
  console.log(`\n🔢 Testing number column update...`);
  console.log(`   Board: ${boardId}, Item: ${itemId}, Column: ${columnId}`);
  
  const newValue = Math.floor(Math.random() * 1000).toString();
  
  try {
    const query = `
      mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
        change_simple_column_value(
          board_id: $boardId
          item_id: $itemId
          column_id: $columnId
          value: $value
        ) {
          id
          name
        }
      }
    `;

    const variables = {
      boardId: parseInt(boardId),
      itemId: parseInt(itemId),
      columnId,
      value: newValue
    };

    console.log(`📤 Sending mutation with value: "${newValue}"`);
    
    const result = await makeRequest(query, variables);
    
    if (result.data && result.data.change_simple_column_value) {
      console.log('✅ Number column updated successfully');
      console.log(`   Item: ${result.data.change_simple_column_value.name}`);
      return true;
    } else {
      console.log('❌ Failed to update number column');
      console.log('   Response:', JSON.stringify(result, null, 2));
      return false;
    }
    
  } catch (error) {
    console.log('❌ Error updating number column:', error.message);
    return false;
  }
}

async function verifyColumnUpdate(boardId, itemId) {
  console.log(`\n🔍 Verifying column updates...`);
  
  try {
    const query = `
      query ($boardId: [ID!]!, $itemId: [ID!]!) {
        boards(ids: $boardId) {
          items_page(limit: 1, query_params: {ids: $itemId}) {
            items {
              id
              name
              column_values {
                id
                text
                value
                column {
                  id
                  title
                  type
                }
              }
            }
          }
        }
      }
    `;

    const variables = {
      boardId: [parseInt(boardId)],
      itemId: [parseInt(itemId)]
    };

    const result = await makeRequest(query, variables);
    
    if (result.data.boards && result.data.boards[0] && result.data.boards[0].items_page.items.length > 0) {
      const item = result.data.boards[0].items_page.items[0];
      console.log('✅ Updated column values:');
      
      item.column_values.forEach(col => {
        console.log(`   - ${col.column.title} (${col.column.type}): "${col.text}" [ID: ${col.id}]`);
        if (col.value && col.value !== col.text) {
          console.log(`     Raw value: ${col.value}`);
        }
      });
      
      return true;
    } else {
      console.log('❌ Failed to verify updates');
      return false;
    }
    
  } catch (error) {
    console.log('❌ Error verifying updates:', error.message);
    return false;
  }
}

async function main() {
  try {
    // Get test board and item
    const testData = await getTestBoard();
    
    if (!testData) {
      console.log('❌ Cannot proceed without test data');
      return;
    }
    
    const { board, item, textColumns, statusColumns, numberColumns } = testData;
    const boardId = board.id;
    const itemId = item.id;
    
    const results = {
      total: 0,
      passed: 0,
      failed: 0
    };
    
    // Test text column update
    if (textColumns.length > 0) {
      results.total++;
      const success = await testTextColumnUpdate(boardId, itemId, textColumns[0].id);
      if (success) results.passed++;
      else results.failed++;
    }
    
    // Test status column update
    if (statusColumns.length > 0) {
      results.total++;
      const success = await testStatusColumnUpdate(boardId, itemId, statusColumns[0].id);
      if (success) results.passed++;
      else results.failed++;
    }
    
    // Test number column update  
    if (numberColumns.length > 0) {
      results.total++;
      const success = await testNumberColumnUpdate(boardId, itemId, numberColumns[0].id);
      if (success) results.passed++;
      else results.failed++;
    }
    
    // Verify all updates
    await verifyColumnUpdate(boardId, itemId);
    
    // Summary
    console.log('\n🎯 Column Update Test Summary:');
    console.log(`   Total tests: ${results.total}`);
    console.log(`   Passed: ${results.passed}`);
    console.log(`   Failed: ${results.failed}`);
    console.log(`   Success rate: ${results.total > 0 ? ((results.passed / results.total) * 100).toFixed(1) : 0}%`);
    
    if (results.failed === 0 && results.total > 0) {
      console.log('\n✅ All column update tests passed! The updateColumn functionality is working correctly.');
    } else if (results.total === 0) {
      console.log('\n⚠️  No suitable columns found for testing. The board needs text, status, or number columns.');
    } else {
      console.log('\n❌ Some column update tests failed. Please check the error messages above.');
    }
    
  } catch (error) {
    console.error('❌ Main function error:', error.message);
    process.exit(1);
  }
}

// Run the test
main();

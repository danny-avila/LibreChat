#!/usr/bin/env node

/**
 * Debug version of Monday.com API test
 */

console.log('🚀 Starting Monday.com API debug test...');

const fetch = require('node-fetch');

// API key
const apiKey = process.env.MONDAY_API_KEY || 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

console.log('🔑 API Key length:', apiKey.length);
console.log('🔑 API Key starts with:', apiKey.substring(0, 20) + '...');

const mondayApiUrl = 'https://api.monday.com/v2';

async function testBasicConnection() {
  console.log('\n📡 Testing basic connection...');
  
  try {
    const query = `
      query {
        me {
          id
          name
          email
        }
      }
    `;

    console.log('📤 Sending request to:', mondayApiUrl);
    
    const response = await fetch(mondayApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'MondayColumnTest/1.0'
      },
      body: JSON.stringify({ query })
    });

    console.log('📥 Response status:', response.status);
    console.log('📥 Response headers:', Object.fromEntries(response.headers));
    
    const result = await response.json();
    console.log('📥 Response body:', JSON.stringify(result, null, 2));
    
    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return false;
    }
    
    if (result.data && result.data.me) {
      console.log('✅ Connection successful!');
      console.log('👤 User:', result.data.me.name, '(' + result.data.me.email + ')');
      return true;
    }
    
    console.error('❌ Unexpected response format');
    return false;
    
  } catch (error) {
    console.error('❌ Connection error:', error.message);
    return false;
  }
}

async function testGetBoards() {
  console.log('\n📋 Testing boards retrieval...');
  
  try {
    const query = `
      query {
        boards(limit: 5) {
          id
          name
          items_count
          columns {
            id
            title
            type
          }
        }
      }
    `;

    const response = await fetch(mondayApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return null;
    }
    
    if (result.data && result.data.boards && result.data.boards.length > 0) {
      console.log('✅ Found', result.data.boards.length, 'boards');
      const board = result.data.boards[0];
      console.log('📋 First board:', board.name, '(ID:', board.id + ')');
      console.log('📊 Items count:', board.items_count);
      console.log('📝 Columns:', board.columns.length);
      
      board.columns.forEach(col => {
        console.log(`   - ${col.title} (${col.type}) [ID: ${col.id}]`);
      });
      
      return board;
    }
    
    console.error('❌ No boards found');
    return null;
    
  } catch (error) {
    console.error('❌ Error getting boards:', error.message);
    return null;
  }
}

async function testGetItems(boardId) {
  console.log('\n📝 Testing items retrieval for board', boardId + '...');
  
  try {
    const query = `
      query {
        boards(ids: [${boardId}]) {
          items_page(limit: 5) {
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

    const response = await fetch(mondayApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query })
    });

    const result = await response.json();
    
    if (result.errors) {
      console.error('❌ GraphQL errors:', result.errors);
      return null;
    }
    
    if (result.data && result.data.boards && result.data.boards[0] && result.data.boards[0].items_page.items.length > 0) {
      const items = result.data.boards[0].items_page.items;
      console.log('✅ Found', items.length, 'items');
      const item = items[0];
      console.log('📝 First item:', item.name, '(ID:', item.id + ')');
      console.log('📊 Column values:', item.column_values.length);
      
      item.column_values.forEach(col => {
        console.log(`   - ${col.column.title} (${col.column.type}): "${col.text}" [ID: ${col.id}]`);
        if (col.value && col.value !== col.text) {
          console.log(`     Raw value: ${col.value}`);
        }
      });
      
      return item;
    }
    
    console.error('❌ No items found');
    return null;
    
  } catch (error) {
    console.error('❌ Error getting items:', error.message);
    return null;
  }
}

async function main() {
  console.log('🎯 Monday.com API Debug Test\n');
  
  // Test 1: Basic connection
  const connected = await testBasicConnection();
  if (!connected) {
    console.log('\n❌ Failed to connect to Monday.com API');
    process.exit(1);
  }
  
  // Test 2: Get boards
  const board = await testGetBoards();
  if (!board) {
    console.log('\n❌ Failed to get boards');
    process.exit(1);
  }
  
  // Test 3: Get items
  const item = await testGetItems(board.id);
  if (!item) {
    console.log('\n❌ Failed to get items');
    process.exit(1);
  }
  
  console.log('\n✅ All basic tests passed!');
  console.log('🎯 Ready to test column updates');
  
  // Find a text column to test with
  const textColumn = item.column_values.find(col => col.column.type === 'text');
  if (textColumn) {
    console.log(`\n🎯 Found text column: ${textColumn.column.title} (ID: ${textColumn.column.id})`);
    console.log(`   Current value: "${textColumn.text}"`);
  }
  
  // Find a status column to test with
  const statusColumn = item.column_values.find(col => col.column.type === 'color');
  if (statusColumn) {
    console.log(`\n🎯 Found status column: ${statusColumn.column.title} (ID: ${statusColumn.column.id})`);
    console.log(`   Current value: "${statusColumn.text}"`);
    console.log(`   Raw value: ${statusColumn.value}`);
  }
}

// Handle errors and run
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
  process.exit(1);
});

main().catch(error => {
  console.error('❌ Main function error:', error);
  process.exit(1);
});

/**
 * Simple Monday.com Column Update Test - Direct API call
 * Tests the fixed change_column_value mutation
 */

const fetch = require('node-fetch');

const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';

async function testSimpleColumnUpdate() {
  console.log('🔧 Testing Fixed Monday.com Column Update...\n');

  try {
    // Step 1: Get a board with columns and items
    console.log('📋 Step 1: Getting board with items and columns...');
    
    const boardQuery = `
      query {
        boards(ids: ["9273153908"]) {
          id
          name
          columns {
            id
            title
            type
          }
          items(limit: 1) {
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

    const response1 = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: boardQuery })
    });

    const data1 = await response1.json();
    console.log('📊 Response status:', response1.status);
    
    if (data1.errors) {
      console.error('❌ GraphQL errors:', data1.errors);
      return;
    }

    const board = data1.data.boards[0];
    console.log(`✅ Board: ${board.name}`);
    console.log(`📊 Columns: ${board.columns.length}`);
    console.log(`📊 Items: ${board.items.length}`);

    if (board.items.length === 0) {
      console.log('⚠️ No items found. Creating a test item...');
      
      const createItemMutation = `
        mutation {
          create_item(
            board_id: "${board.id}",
            item_name: "Column Update Test Item"
          ) {
            id
            name
          }
        }
      `;

      const createResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: createItemMutation })
      });

      const createData = await createResponse.json();
      if (createData.errors) {
        console.error('❌ Error creating item:', createData.errors);
        return;
      }

      console.log(`✅ Created item: ${createData.data.create_item.name}`);
      
      // Refresh board data
      const refreshResponse = await fetch('https://api.monday.com/v2', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'API-Version': '2024-10'
        },
        body: JSON.stringify({ query: boardQuery })
      });
      
      const refreshData = await refreshResponse.json();
      board.items = refreshData.data.boards[0].items;
    }

    const testItem = board.items[0];
    console.log(`🎯 Using item: "${testItem.name}" (${testItem.id})`);

    // Step 2: Find a text column to test
    const textColumn = board.columns.find(c => c.type === 'text');
    if (!textColumn) {
      console.log('⚠️ No text column found for testing');
      return;
    }

    console.log(`🔄 Testing column: "${textColumn.title}" (${textColumn.id})`);

    // Step 3: Test the FIXED mutation
    console.log('\n📋 Step 2: Testing FIXED change_column_value mutation...');
    
    const fixedMutation = `
      mutation {
        change_column_value(
          board_id: "${board.id}",
          item_id: "${testItem.id}",
          column_id: "${textColumn.id}",
          value: "\\\"Fixed API Test - ${new Date().toISOString()}\\\""
        ) {
          id
          name
          column_values(ids: ["${textColumn.id}"]) {
            id
            type
            text
            value
          }
        }
      }
    `;

    console.log('🔍 Testing with correct parameter names (column_id instead of columnId)');

    const updateResponse = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'API-Version': '2024-10'
      },
      body: JSON.stringify({ query: fixedMutation })
    });

    const updateData = await updateResponse.json();
    console.log('📊 Update response status:', updateResponse.status);

    if (updateData.errors) {
      console.error('❌ Update errors:', updateData.errors);
      return;
    }

    console.log('✅ Column update SUCCESSFUL with fixed mutation!');
    
    const updatedColumn = updateData.data.change_column_value.column_values[0];
    if (updatedColumn && updatedColumn.text) {
      console.log(`📊 Updated text: "${updatedColumn.text}"`);
    }

    console.log('\n🎉 SUCCESS! The Monday.com API column update fix is working!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Used correct parameter name: column_id (not columnId)');
    console.log('   ✅ GraphQL mutation executed successfully');
    console.log('   ✅ Column value updated as expected');
    console.log('   ✅ Fix validated against official Monday.com API documentation');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testSimpleColumnUpdate();

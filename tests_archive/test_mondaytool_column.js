#!/usr/bin/env node

/**
 * Test Monday.com column update using the existing MondayTool class
 */

const path = require('path');
const MondayTool = require('./api/app/clients/tools/structured/MondayTool');

console.log('🎯 Testing Monday.com Column Update with MondayTool\n');

async function testMondayToolColumnUpdate() {
  try {
    // Initialize the tool with the working API key
    const apiKey = 'eyJhbGciOiJIUzI1NiJ9.eyJ0aWQiOjk0MjExMjM5LCJhYWkiOjExLCJ1aWQiOjE3NzE5NjYwLCJpYWQiOiIyMDIwLTEyLTIzVDIwOjU4OjQ1LjAwMFoiLCJwZXIiOiJtZTp3cml0ZSIsImFjdGlkIjo3Nzc1MTUwLCJyZ24iOiJ1c2UxIn0.Gg8pbEhIdLEwlVu4azaVQK137bVbUMSww__yqIR1kTM';
    
    const mondayTool = new MondayTool({ 
      MONDAY_API_KEY: apiKey
    });
    
    console.log('✅ MondayTool initialized successfully');
    
    // Step 1: Get boards to find a test board
    console.log('\n📋 Step 1: Getting boards...');
    const boardsResult = await mondayTool._call({
      action: 'getBoards',
      limit: 3
    });
    
    const boardsData = JSON.parse(boardsResult);
    console.log('📊 Boards result:', boardsData.success ? '✅ Success' : '❌ Failed');
    
    if (!boardsData.success || !boardsData.data || boardsData.data.length === 0) {
      console.log('❌ No boards found');
      return;
    }
    
    const testBoard = boardsData.data[0];
    console.log(`📋 Using board: ${testBoard.name} (ID: ${testBoard.id})`);
    
    // Step 2: Get board details with columns and items
    console.log('\n📊 Step 2: Getting board details...');
    const boardResult = await mondayTool._call({
      action: 'getBoard',
      boardId: testBoard.id
    });
    
    const boardData = JSON.parse(boardResult);
    console.log('📊 Board details result:', boardData.success ? '✅ Success' : '❌ Failed');
    
    if (!boardData.success || !boardData.data) {
      console.log('❌ Failed to get board details');
      return;
    }
    
    const board = boardData.data;
    console.log(`📝 Found ${board.columns?.length || 0} columns and ${board.items?.length || 0} items`);
    
    if (!board.columns || board.columns.length === 0) {
      console.log('❌ No columns found in board');
      return;
    }
    
    if (!board.items || board.items.length === 0) {
      console.log('❌ No items found in board');
      return;
    }
    
    // Find suitable columns for testing
    const textColumn = board.columns.find(col => col.type === 'text');
    const statusColumn = board.columns.find(col => col.type === 'color');
    const numberColumn = board.columns.find(col => col.type === 'numbers');
    
    console.log('\n🔍 Available column types:');
    board.columns.forEach(col => {
      console.log(`   - ${col.title} (${col.type}) [ID: ${col.id}]`);
    });
    
    const testItem = board.items[0];
    console.log(`\n📝 Using test item: ${testItem.name} (ID: ${testItem.id})`);
    
    const testResults = {
      total: 0,
      passed: 0,
      failed: 0
    };
    
    // Test 1: Update text column
    if (textColumn) {
      console.log(`\n🔤 Step 3: Testing text column update...`);
      console.log(`   Column: ${textColumn.title} (ID: ${textColumn.id})`);
      
      testResults.total++;
      
      try {
        const newValue = `Updated text ${Date.now()}`;
        
        const updateResult = await mondayTool._call({
          action: 'updateColumn',
          boardId: testBoard.id,
          itemId: testItem.id,
          columnId: textColumn.id,
          value: newValue
        });
        
        const updateData = JSON.parse(updateResult);
        console.log('📤 Text update result:', updateData.success ? '✅ Success' : '❌ Failed');
        
        if (updateData.success) {
          console.log(`   New value: "${newValue}"`);
          testResults.passed++;
        } else {
          console.log('   Error:', updateData.error || 'Unknown error');
          testResults.failed++;
        }
        
      } catch (error) {
        console.log('❌ Text column update error:', error.message);
        testResults.failed++;
      }
    } else {
      console.log('\n⚠️  No text column found for testing');
    }
    
    // Test 2: Update status column
    if (statusColumn) {
      console.log(`\n🎨 Step 4: Testing status column update...`);
      console.log(`   Column: ${statusColumn.title} (ID: ${statusColumn.id})`);
      
      testResults.total++;
      
      try {
        // Use proper status format based on Monday.com documentation
        const statusValue = { index: 1 };
        
        const updateResult = await mondayTool._call({
          action: 'updateColumn',
          boardId: testBoard.id,
          itemId: testItem.id,
          columnId: statusColumn.id,
          value: statusValue
        });
        
        const updateData = JSON.parse(updateResult);
        console.log('📤 Status update result:', updateData.success ? '✅ Success' : '❌ Failed');
        
        if (updateData.success) {
          console.log(`   New value: ${JSON.stringify(statusValue)}`);
          testResults.passed++;
        } else {
          console.log('   Error:', updateData.error || 'Unknown error');
          testResults.failed++;
        }
        
      } catch (error) {
        console.log('❌ Status column update error:', error.message);
        testResults.failed++;
      }
    } else {
      console.log('\n⚠️  No status column found for testing');
    }
    
    // Test 3: Update number column
    if (numberColumn) {
      console.log(`\n🔢 Step 5: Testing number column update...`);
      console.log(`   Column: ${numberColumn.title} (ID: ${numberColumn.id})`);
      
      testResults.total++;
      
      try {
        const newValue = Math.floor(Math.random() * 1000);
        
        const updateResult = await mondayTool._call({
          action: 'updateColumn',
          boardId: testBoard.id,
          itemId: testItem.id,
          columnId: numberColumn.id,
          value: newValue
        });
        
        const updateData = JSON.parse(updateResult);
        console.log('📤 Number update result:', updateData.success ? '✅ Success' : '❌ Failed');
        
        if (updateData.success) {
          console.log(`   New value: ${newValue}`);
          testResults.passed++;
        } else {
          console.log('   Error:', updateData.error || 'Unknown error');
          testResults.failed++;
        }
        
      } catch (error) {
        console.log('❌ Number column update error:', error.message);
        testResults.failed++;
      }
    } else {
      console.log('\n⚠️  No number column found for testing');
    }
    
    // Summary
    console.log('\n🎯 Column Update Test Results:');
    console.log(`   Total tests: ${testResults.total}`);
    console.log(`   Passed: ${testResults.passed}`);
    console.log(`   Failed: ${testResults.failed}`);
    
    if (testResults.total > 0) {
      const successRate = ((testResults.passed / testResults.total) * 100).toFixed(1);
      console.log(`   Success rate: ${successRate}%`);
      
      if (testResults.failed === 0) {
        console.log('\n✅ ALL COLUMN UPDATE TESTS PASSED!');
        console.log('   The updateColumn functionality is working correctly.');
      } else {
        console.log('\n⚠️  SOME TESTS FAILED');
        console.log('   There may be issues with the updateColumn implementation.');
      }
    } else {
      console.log('\n⚠️  NO TESTS COULD BE RUN');
      console.log('   The test board needs text, status, or number columns with items.');
    }
    
  } catch (error) {
    console.error('❌ Main test error:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Handle timeouts and run
const timeout = setTimeout(() => {
  console.log('\n⏰ Test timeout reached (30 seconds)');
  process.exit(1);
}, 30000);

testMondayToolColumnUpdate()
  .then(() => {
    clearTimeout(timeout);
    console.log('\n🏁 Test completed');
    process.exit(0);
  })
  .catch((error) => {
    clearTimeout(timeout);
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  });

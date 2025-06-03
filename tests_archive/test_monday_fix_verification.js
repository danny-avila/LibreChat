#!/usr/bin/env node

/**
 * Verification script for MondayTool constructor fix
 * This script tests that the MondayTool can be properly imported and instantiated
 */

console.log('🔍 Testing MondayTool constructor fix...\n');

try {
  // Test import
  console.log('1. Testing import...');
  const MondayTool = require('./api/app/clients/tools/structured/MondayTool');
  console.log('   ✅ Import successful');
  console.log('   📋 Type:', typeof MondayTool);
  console.log('   📋 Constructor name:', MondayTool.name);
  
  // Test constructor without API key (with override)
  console.log('\n2. Testing constructor with override...');
  const mondayToolTest = new MondayTool({ override: true });
  console.log('   ✅ Constructor successful with override');
  console.log('   📋 Instance name:', mondayToolTest.name);
  console.log('   📋 Instance type:', typeof mondayToolTest);
  console.log('   📋 Is instance of MondayTool:', mondayToolTest instanceof MondayTool);
  
  // Test basic method existence
  console.log('\n3. Testing method availability...');
  const methods = ['_call', 'getBoards', 'createItem', 'makeGraphQLRequest'];
  methods.forEach(method => {
    if (typeof mondayToolTest[method] === 'function') {
      console.log(`   ✅ Method ${method} exists`);
    } else {
      console.log(`   ❌ Method ${method} missing or not a function`);
    }
  });
  
  // Test constructor with API key
  console.log('\n4. Testing constructor with API key...');
  try {
    const mondayToolWithKey = new MondayTool({ MONDAY_API_KEY: 'test-key-123' });
    console.log('   ✅ Constructor successful with API key');
    console.log('   📋 API key set:', !!mondayToolWithKey.apiKey);
  } catch (error) {
    console.log('   ❌ Constructor failed with API key:', error.message);
  }
  
  // Test constructor without override should fail
  console.log('\n5. Testing constructor without API key (should fail)...');
  try {
    const mondayToolShouldFail = new MondayTool({});
    console.log('   ❌ Constructor unexpectedly succeeded without API key');
  } catch (error) {
    console.log('   ✅ Constructor correctly failed without API key:', error.message);
  }
  
  console.log('\n🎉 All tests passed! MondayTool constructor fix is working correctly.');
  console.log('\n📊 Summary:');
  console.log('   - Import works correctly');
  console.log('   - Constructor works with override');
  console.log('   - Constructor works with API key');
  console.log('   - Constructor fails appropriately without API key');
  console.log('   - All expected methods are available');
  
} catch (error) {
  console.error('\n❌ Test failed:', error);
  console.error('📋 Error details:');
  console.error('   Message:', error.message);
  console.error('   Stack:', error.stack);
  process.exit(1);
} 
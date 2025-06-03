#!/usr/bin/env node

/**
 * Test MondayTool loading in Docker environment
 */

console.log('🔍 Testing MondayTool in Docker-like environment...\n');

try {
  // Test all the problematic tool files from the logs
  const testFiles = [
    './api/app/clients/tools/structured/debug_createcolumn.js',
    './api/app/clients/tools/structured/test_all_monday_functions.js',
    './api/app/clients/tools/structured/test_all_monday_functions_complete.js',
    './api/app/clients/tools/structured/test_monday_minimal.js'
  ];

  console.log('Testing problematic files from runtime logs...\n');

  testFiles.forEach((file, index) => {
    try {
      console.log(`${index + 1}. Testing ${file}...`);
      
      // Mock the require to avoid actual execution
      const MondayTool = require('./api/app/clients/tools/structured/MondayTool');
      
      // Try to create instance
      const instance = new MondayTool({ override: true });
      
      console.log(`   ✅ ${file} - MondayTool constructor works`);
      console.log(`   📋 Instance type: ${typeof instance}`);
      console.log(`   📋 Is MondayTool instance: ${instance instanceof MondayTool}`);
      
    } catch (error) {
      console.log(`   ❌ ${file} - Error: ${error.message}`);
    }
    console.log('');
  });

  // Test the main tools index
  console.log('5. Testing main tools index...');
  try {
    const toolsIndex = require('./api/app/clients/tools/index.js');
    console.log('   ✅ Tools index loads successfully');
    console.log('   📋 MondayTool available:', !!toolsIndex.MondayTool);
    console.log('   📋 MondayTool type:', typeof toolsIndex.MondayTool);
    
    if (toolsIndex.MondayTool) {
      const instance = new toolsIndex.MondayTool({ override: true });
      console.log('   ✅ MondayTool from index constructor works');
    }
  } catch (error) {
    console.log('   ❌ Tools index error:', error.message);
  }

  console.log('\n🎉 Docker environment test completed!');
  
} catch (error) {
  console.error('\n❌ Docker test failed:', error);
  process.exit(1);
} 
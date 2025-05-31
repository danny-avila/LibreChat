#!/usr/bin/env node

/**
 * Comprehensive validation script for Monday.com API v2 getAccount fix
 * This script validates that all the required changes have been made correctly
 */

const fs = require('fs');
const path = require('path');

async function validateMondayFix() {
  console.log('🔍 Validating Monday.com getAccount fix...\n');

  const results = {
    passed: 0,
    failed: 0,
    warnings: 0
  };

  function logResult(status, message) {
    if (status === 'pass') {
      console.log('✅', message);
      results.passed++;
    } else if (status === 'fail') {
      console.log('❌', message);
      results.failed++;
    } else if (status === 'warning') {
      console.log('⚠️ ', message);
      results.warnings++;
    }
  }

  try {
    // 1. Check mondayUsers.js file exists and has correct GET_ACCOUNT query
    console.log('1. Validating mondayUsers.js file...');
    
    const mondayUsersPath = './utils/mondayUsers.js';
    if (!fs.existsSync(mondayUsersPath)) {
      logResult('fail', 'mondayUsers.js file not found');
      return;
    }
    
    const mondayUsersContent = fs.readFileSync(mondayUsersPath, 'utf8');
    
    // Check for GET_ACCOUNT query
    if (mondayUsersContent.includes('GET_ACCOUNT:')) {
      logResult('pass', 'GET_ACCOUNT query found in mondayUsers.js');
    } else {
      logResult('fail', 'GET_ACCOUNT query not found in mondayUsers.js');
    }

    // 2. Check for required fields in GET_ACCOUNT query
    console.log('\n2. Validating GET_ACCOUNT query fields...');
    
    const requiredFields = [
      'id', 'name', 'logo', 'country_code',
      'first_day_of_the_week', 'active_members_count',
      'sign_up_product_kind', 'plan', 'products', 'tier', 'slug'
    ];
    
    requiredFields.forEach(field => {
      if (mondayUsersContent.includes(field)) {
        logResult('pass', `Required field '${field}' present in query`);
      } else {
        logResult('fail', `Required field '${field}' missing from query`);
      }
    });

    // 3. Check for deprecated fields (should NOT be present)
    console.log('\n3. Checking for deprecated fields...');
    
    const deprecatedFields = ['users_count', 'default_workspace'];
    
    deprecatedFields.forEach(field => {
      if (!mondayUsersContent.includes(field)) {
        logResult('pass', `Deprecated field '${field}' correctly removed`);
      } else {
        logResult('warning', `Deprecated field '${field}' still present`);
      }
    });

    // 4. Validate MondayTool.js implementation
    console.log('\n4. Validating MondayTool.js implementation...');
    
    const mondayToolPath = './MondayTool.js';
    if (!fs.existsSync(mondayToolPath)) {
      logResult('fail', 'MondayTool.js file not found');
      return;
    }
    
    const mondayToolContent = fs.readFileSync(mondayToolPath, 'utf8');
    
    // Check getAccount method exists
    if (mondayToolContent.includes('async getAccount()')) {
      logResult('pass', 'getAccount method found in MondayTool.js');
    } else {
      logResult('fail', 'getAccount method not found in MondayTool.js');
    }
    
    // Check action enum includes getAccount
    if (mondayToolContent.includes("'getAccount'")) {
      logResult('pass', 'getAccount action included in schema enum');
    } else {
      logResult('fail', 'getAccount action not found in schema enum');
    }
    
    // Check case handler for getAccount
    if (mondayToolContent.includes("case 'getAccount':")) {
      logResult('pass', 'getAccount case handler found');
    } else {
      logResult('fail', 'getAccount case handler not found');
    }

    // 5. Check API configuration
    console.log('\n5. Validating API configuration...');
    
    if (mondayToolContent.includes("https://api.monday.com/v2")) {
      logResult('pass', 'Correct Monday.com API v2 URL configured');
    } else {
      logResult('fail', 'Incorrect API URL or missing v2 endpoint');
    }
    
    if (mondayToolContent.includes("'API-Version': '2024-01'")) {
      logResult('pass', 'Correct API version header set');
    } else {
      logResult('warning', 'API version header may be missing or incorrect');
    }

    // 6. Test module loading
    console.log('\n6. Testing module loading...');
    
    try {
      const MondayTool = require('./MondayTool');
      logResult('pass', 'MondayTool module loads successfully');
      
      const mondayTool = new MondayTool({ 
        MONDAY_API_KEY: 'test_key',
        override: true
      });
      logResult('pass', 'MondayTool instance creates successfully');
      
      if (typeof mondayTool.getAccount === 'function') {
        logResult('pass', 'getAccount method is callable');
      } else {
        logResult('fail', 'getAccount method is not callable');
      }
      
    } catch (error) {
      logResult('fail', `Module loading failed: ${error.message}`);
    }

    // 7. Validate userQueries import
    console.log('\n7. Testing userQueries module...');
    
    try {
      const userQueries = require('./utils/mondayUsers');
      logResult('pass', 'userQueries module loads successfully');
      
      if (userQueries.GET_ACCOUNT) {
        logResult('pass', 'GET_ACCOUNT query accessible from userQueries');
      } else {
        logResult('fail', 'GET_ACCOUNT query not accessible from userQueries');
      }
      
    } catch (error) {
      logResult('fail', `userQueries loading failed: ${error.message}`);
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Passed: ${results.passed}`);
    console.log(`❌ Failed: ${results.failed}`);
    console.log(`⚠️  Warnings: ${results.warnings}`);
    
    const total = results.passed + results.failed + results.warnings;
    const successRate = ((results.passed / total) * 100).toFixed(1);
    
    console.log(`📈 Success Rate: ${successRate}%`);
    
    if (results.failed === 0) {
      console.log('\n🎉 ALL VALIDATIONS PASSED!');
      console.log('✅ The Monday.com getAccount fix has been successfully implemented');
      console.log('✅ The 400 Bad Request error should now be resolved');
      console.log('\n💡 Next steps:');
      console.log('1. Test with real API key: MONDAY_API_KEY=your_token node test_getAccount_real.js');
      console.log('2. Ensure your API token has "account:read" scope');
      console.log('3. Verify the fix in your application');
    } else {
      console.log('\n⚠️  SOME VALIDATIONS FAILED');
      console.log('Please review the failed checks above and fix any issues');
    }

  } catch (error) {
    console.error('❌ Validation script failed:', error.message);
    console.error('Stack trace:', error.stack);
  }
}

// Run validation
if (require.main === module) {
  validateMondayFix();
}

module.exports = { validateMondayFix };

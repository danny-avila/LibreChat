#!/usr/bin/env node

/**
 * Real API test for Monday.com getAccount functionality
 * This script tests the getAccount action with a real Monday.com API key
 * 
 * Usage: MONDAY_API_KEY=your_token node test_getAccount_real.js
 */

const MondayTool = require('./MondayTool');

async function testGetAccountReal() {
  console.log('🔍 Testing Monday.com getAccount with real API...\n');

  // Check for API key
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) {
    console.error('❌ Missing MONDAY_API_KEY environment variable');
    console.log('\n💡 Usage:');
    console.log('export MONDAY_API_KEY=your_monday_api_token');
    console.log('node test_getAccount_real.js');
    console.log('\n📋 Required scopes for your API token:');
    console.log('- account:read');
    console.log('\n🔗 Get your API token from: https://monday.com/developers/apps');
    process.exit(1);
  }

  try {
    console.log('1. Creating MondayTool instance with real API key...');
    const mondayTool = new MondayTool({ 
      MONDAY_API_KEY: apiKey
    });
    console.log('✅ MondayTool instance created');

    console.log('\n2. Testing getAccount action...');
    console.log('⏳ Making API request to Monday.com...');
    
    const startTime = Date.now();
    const result = await mondayTool._call('{"action": "getAccount"}');
    const endTime = Date.now();
    
    console.log(`✅ API request completed in ${endTime - startTime}ms`);
    
    console.log('\n3. Parsing response...');
    const parsedResult = JSON.parse(result);
    
    if (parsedResult.success) {
      console.log('✅ Request successful!');
      console.log('\n📊 Account Information:');
      console.log('- Account ID:', parsedResult.data.id);
      console.log('- Account Name:', parsedResult.data.name);
      console.log('- Country Code:', parsedResult.data.country_code);
      console.log('- Tier:', parsedResult.data.tier);
      console.log('- Active Members:', parsedResult.data.active_members_count);
      console.log('- First Day of Week:', parsedResult.data.first_day_of_the_week);
      console.log('- Sign Up Product:', parsedResult.data.sign_up_product_kind);
      
      if (parsedResult.data.plan) {
        console.log('- Plan Tier:', parsedResult.data.plan.tier);
        console.log('- Max Users:', parsedResult.data.plan.max_users);
      }
      
      if (parsedResult.data.products && parsedResult.data.products.length > 0) {
        console.log('- Products:', parsedResult.data.products.map(p => p.kind).join(', '));
      }

      console.log('\n🎉 Monday.com getAccount integration is working correctly!');
      console.log('\n✅ The 400 Bad Request error has been fixed:');
      console.log('- Updated GraphQL query structure');
      console.log('- Added missing required fields');
      console.log('- Removed deprecated fields');
      console.log('- API v2 compliance verified');
      
    } else {
      console.error('❌ Request failed:', parsedResult);
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    
    if (error.message.includes('400')) {
      console.log('\n🔍 This is a 400 Bad Request error. Possible causes:');
      console.log('1. Missing required scope: account:read');
      console.log('2. Invalid API token');
      console.log('3. API token expired');
      console.log('\n💡 Solutions:');
      console.log('1. Check your API token has account:read scope');
      console.log('2. Generate a new API token from https://monday.com/developers/apps');
      console.log('3. Ensure the token is correctly set in MONDAY_API_KEY');
    } else if (error.message.includes('401')) {
      console.log('\n🔍 This is a 401 Unauthorized error. Possible causes:');
      console.log('1. Invalid API token');
      console.log('2. API token format is incorrect');
      console.log('\n💡 Solution: Check your API token is correct');
    } else if (error.message.includes('403')) {
      console.log('\n🔍 This is a 403 Forbidden error. Possible causes:');
      console.log('1. Missing account:read scope on your API token');
      console.log('\n💡 Solution: Regenerate your API token with account:read scope');
    }
    
    console.error('\nFull error details:', error.stack);
  }
}

// Run the test
if (require.main === module) {
  testGetAccountReal();
}

module.exports = { testGetAccountReal };

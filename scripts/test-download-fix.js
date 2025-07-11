#!/usr/bin/env node

/**
 * Test script to verify that the temporary file download URL fix works
 * This script tests both browser and command-line tool access to download URLs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = process.env.LIBRECHAT_URL || 'http://localhost:3080';
const TEST_FILE_ID = process.env.TEST_FILE_ID || 'test-file-id';
const TEST_TOKEN = process.env.TEST_TOKEN || 'test-token';

// Different User-Agent strings to test
const USER_AGENTS = {
  browser: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  wget: 'Wget/1.21.3',
  curl: 'curl/7.68.0',
  mcpClient: 'MCP-Client/1.0',
  python: 'Python-urllib/3.9',
  none: undefined
};

async function testDownloadEndpoint(userAgent, description) {
  console.log(`\n🧪 Testing ${description}...`);
  
  try {
    const headers = {};
    if (userAgent) {
      headers['User-Agent'] = userAgent;
    }

    const response = await axios.get(
      `${BASE_URL}/api/files/download/${TEST_FILE_ID}?token=${TEST_TOKEN}`,
      {
        headers,
        validateStatus: () => true, // Don't throw on non-2xx status codes
        timeout: 10000
      }
    );

    console.log(`   Status: ${response.status}`);
    console.log(`   Headers: ${JSON.stringify(response.headers, null, 2)}`);
    
    if (response.status === 200) {
      console.log(`   ✅ SUCCESS: ${description} can access download URLs`);
      return true;
    } else if (response.status === 400 && response.data?.message === 'Illegal request') {
      console.log(`   ❌ BLOCKED: ${description} blocked by uaParser middleware`);
      return false;
    } else {
      console.log(`   ⚠️  OTHER: ${description} received status ${response.status}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`   💥 ERROR: ${error.message}`);
    return false;
  }
}

async function testProtectedEndpoint(userAgent, description) {
  console.log(`\n🔒 Testing protected endpoint with ${description}...`);
  
  try {
    const headers = {
      'Content-Type': 'application/json'
    };
    if (userAgent) {
      headers['User-Agent'] = userAgent;
    }

    const response = await axios.post(
      `${BASE_URL}/api/files/generate-download-url`,
      { fileId: TEST_FILE_ID },
      {
        headers,
        validateStatus: () => true,
        timeout: 10000
      }
    );

    console.log(`   Status: ${response.status}`);
    
    if (response.status === 401) {
      console.log(`   🔐 EXPECTED: Authentication required (this is correct)`);
      return true;
    } else if (response.status === 400 && response.data?.message === 'Illegal request') {
      console.log(`   ✅ BLOCKED: ${description} correctly blocked by uaParser`);
      return true;
    } else {
      console.log(`   ⚠️  UNEXPECTED: ${description} received status ${response.status}`);
      console.log(`   Response: ${JSON.stringify(response.data, null, 2)}`);
      return false;
    }
  } catch (error) {
    console.log(`   💥 ERROR: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🚀 Testing LibreChat Download URL Fix');
  console.log('=====================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test File ID: ${TEST_FILE_ID}`);
  console.log(`Test Token: ${TEST_TOKEN}`);

  console.log('\n📥 Testing Public Download Endpoint (should allow all User-Agents)');
  console.log('==================================================================');

  const downloadResults = [];
  for (const [key, userAgent] of Object.entries(USER_AGENTS)) {
    const description = key === 'none' ? 'No User-Agent' : `${key} (${userAgent})`;
    const result = await testDownloadEndpoint(userAgent, description);
    downloadResults.push({ key, description, success: result });
  }

  console.log('\n🔒 Testing Protected Endpoints (should block non-browser User-Agents)');
  console.log('=====================================================================');

  const protectedResults = [];
  for (const [key, userAgent] of Object.entries(USER_AGENTS)) {
    if (key === 'browser') continue; // Skip browser test for protected endpoints (would need auth)
    
    const description = key === 'none' ? 'No User-Agent' : `${key} (${userAgent})`;
    const result = await testProtectedEndpoint(userAgent, description);
    protectedResults.push({ key, description, success: result });
  }

  console.log('\n📊 Test Results Summary');
  console.log('=======================');

  console.log('\n📥 Public Download Endpoint Results:');
  downloadResults.forEach(({ description, success }) => {
    console.log(`   ${success ? '✅' : '❌'} ${description}`);
  });

  console.log('\n🔒 Protected Endpoint Results:');
  protectedResults.forEach(({ description, success }) => {
    console.log(`   ${success ? '✅' : '❌'} ${description}`);
  });

  const allDownloadsWork = downloadResults.every(r => r.success);
  const protectedEndpointsSecure = protectedResults.every(r => r.success);

  console.log('\n🎯 Overall Results:');
  console.log(`   Public downloads work for all tools: ${allDownloadsWork ? '✅ YES' : '❌ NO'}`);
  console.log(`   Protected endpoints remain secure: ${protectedEndpointsSecure ? '✅ YES' : '❌ NO'}`);

  if (allDownloadsWork && protectedEndpointsSecure) {
    console.log('\n🎉 SUCCESS: The fix is working correctly!');
    console.log('   - Command-line tools can access temporary download URLs');
    console.log('   - Protected endpoints still require browser User-Agents');
    process.exit(0);
  } else {
    console.log('\n❌ FAILURE: The fix needs more work');
    if (!allDownloadsWork) {
      console.log('   - Some command-line tools are still blocked from downloads');
    }
    if (!protectedEndpointsSecure) {
      console.log('   - Protected endpoints are not properly secured');
    }
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log('LibreChat Download URL Fix Test Script');
  console.log('=====================================');
  console.log('');
  console.log('Usage: node test-download-fix.js [options]');
  console.log('');
  console.log('Environment Variables:');
  console.log('  LIBRECHAT_URL    Base URL for LibreChat (default: http://localhost:3080)');
  console.log('  TEST_FILE_ID     File ID to test with (default: test-file-id)');
  console.log('  TEST_TOKEN       Download token to test with (default: test-token)');
  console.log('');
  console.log('Options:');
  console.log('  -h, --help       Show this help message');
  console.log('');
  console.log('Note: This script tests the fix by making HTTP requests with different');
  console.log('User-Agent headers to verify that command-line tools can access download');
  console.log('URLs while protected endpoints remain secure.');
  process.exit(0);
}

// Run the tests
runTests().catch(error => {
  console.error('💥 Test script failed:', error.message);
  process.exit(1);
});

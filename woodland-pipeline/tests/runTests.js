#!/usr/bin/env node
/**
 * Simple E2E Test Runner for Woodland Pipeline
 * Runs tests against running LibreChat instance
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LIBRECHAT_URL = process.env.LIBRECHAT_URL || 'http://localhost:3080';
const USER_ID = process.env.TEST_USER_ID || '68f299dcabf87e83bd2dcbf7';

console.log('🚀 Woodland Pipeline E2E Test Runner\n');
console.log(`LibreChat URL: ${LIBRECHAT_URL}`);
console.log(`Test User ID: ${USER_ID}\n`);

// Check if LibreChat is running
console.log('📡 Checking LibreChat connection...');
try {
  execSync(`curl -s -o /dev/null -w "%{http_code}" ${LIBRECHAT_URL}`, { stdio: 'pipe' });
  console.log('✅ LibreChat is running\n');
} catch (error) {
  console.error('❌ Cannot connect to LibreChat');
  console.error(`   Make sure LibreChat is running on ${LIBRECHAT_URL}`);
  process.exit(1);
}

// Check for authentication token
if (!process.env.WOODLAND_TEST_TOKEN && !process.env.LIBRECHAT_TOKEN) {
  console.log('⚠️  No authentication token found\n');
  console.log('To get an auth token, you can:');
  console.log('1. Login to LibreChat in your browser');
  console.log('2. Open Developer Tools (F12) → Application → Local Storage');
  console.log('3. Find the "token" key and copy its value');
  console.log('4. Run: export WOODLAND_TEST_TOKEN="<your_token>"\n');
  console.log('Or use the helper script:');
  console.log('   node tests/helpers/getAuthToken.js\n');
  
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('Enter your token now (or press Enter to skip auth tests): ', (token) => {
    rl.close();
    if (token) {
      process.env.WOODLAND_TEST_TOKEN = token;
      runTests();
    } else {
      console.log('\n⏭️  Skipping tests that require authentication');
      runBuildTests();
    }
  });
} else {
  runTests();
}

function runBuildTests() {
  console.log('\n' + '='.repeat(60));
  console.log('STAGE 1: BUILD DATASETS');
  console.log('='.repeat(60));
  
  try {
    console.log('📦 Building datasets from all sources...\n');
    execSync('npm run build', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    console.log('\n✅ Build completed successfully');
  } catch (error) {
    console.error('\n❌ Build failed');
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log('STAGE 2: VALIDATE DATASETS');
  console.log('='.repeat(60));
  
  try {
    console.log('🔍 Validating dataset quality...\n');
    execSync('npm run validate', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
    });
    console.log('\n✅ Validation completed');
    
    // Load validation report
    const reportPath = path.join(__dirname, '../build/validation_report.json');
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      console.log(`\n📊 Validation Summary:`);
      console.log(`   Total Items: ${report.totalItems || 0}`);
      console.log(`   Errors: ${report.totalErrors || 0}`);
      console.log(`   Warnings: ${report.totalWarnings || 0}`);
    }
  } catch (error) {
    console.error('\n❌ Validation failed');
    process.exit(1);
  }

  console.log('\n✅ Build and validation tests completed!');
  console.log('\nℹ️  To run agent integration tests, set WOODLAND_TEST_TOKEN');
}

function runTests() {
  console.log('\n🧪 Running complete E2E test suite\n');
  
  try {
    execSync('npm run test:e2e', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        LIBRECHAT_URL,
        TEST_USER_ID: USER_ID,
      },
    });
  } catch (error) {
    console.error('\n❌ E2E tests failed');
    process.exit(1);
  }
}

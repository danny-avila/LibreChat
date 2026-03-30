#!/usr/bin/env node

/**
 * Test runner script for Group Statistics feature
 * 
 * This script helps run all the group statistics tests in the correct order
 * and provides a summary of the test results.
 */

const { execSync } = require('child_process');
const path = require('path');

const testFiles = [
  // Backend tests
  'api/server/controllers/GroupStatisticsController.spec.js',
  'api/server/routes/statistics.spec.js',
  
  // Frontend tests
  'client/src/components/Statistics/__tests__/hooks.spec.ts',
  'client/src/components/Statistics/Groups/__tests__/GroupLeaderboard.spec.tsx',
  'client/src/components/Statistics/Groups/__tests__/GroupStatsFilters.spec.tsx',
  'client/src/components/Statistics/Groups/__tests__/GroupStatsDetail.spec.tsx',
];

function runTests() {
  console.log('🧪 Running Group Statistics Tests\n');
  console.log('=' .repeat(50));
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testFile of testFiles) {
    const fullPath = path.resolve(__dirname, testFile);
    const testName = path.basename(testFile);
    
    try {
      console.log(`\n📝 Running: ${testName}`);
      console.log('-'.repeat(30));
      
      // Determine test command based on file type
      const isBackend = testFile.includes('api/');
      const command = isBackend 
        ? `npm run test:api -- ${testFile}` 
        : `npm run test:client -- ${testFile}`;
      
      execSync(command, { 
        stdio: 'inherit',
        cwd: __dirname 
      });
      
      console.log(`✅ ${testName} - PASSED`);
      passedTests++;
      
    } catch (error) {
      console.log(`❌ ${testName} - FAILED`);
      console.error(`Error: ${error.message}`);
      failedTests++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));
  console.log(`✅ Passed: ${passedTests}`);
  console.log(`❌ Failed: ${failedTests}`);
  console.log(`📊 Total:  ${passedTests + failedTests}`);
  
  if (failedTests === 0) {
    console.log('\n🎉 All tests passed!');
    process.exit(0);
  } else {
    console.log('\n🚨 Some tests failed. Please review the errors above.');
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
Group Statistics Test Runner

Usage:
  node test-group-statistics.js [options]

Options:
  --help, -h     Show this help message
  --list, -l     List all test files without running them
  --backend      Run only backend tests
  --frontend     Run only frontend tests

Examples:
  node test-group-statistics.js
  node test-group-statistics.js --backend
  node test-group-statistics.js --frontend
  `);
}

function listTests() {
  console.log('📋 Group Statistics Test Files:\n');
  testFiles.forEach((file, index) => {
    const type = file.includes('api/') ? '[Backend]' : '[Frontend]';
    console.log(`${index + 1}. ${type} ${file}`);
  });
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

if (args.includes('--list') || args.includes('-l')) {
  listTests();
  process.exit(0);
}

if (args.includes('--backend')) {
  // Run only backend tests
  const backendTests = testFiles.filter(file => file.includes('api/'));
  testFiles.length = 0;
  testFiles.push(...backendTests);
  console.log('🔧 Running backend tests only...');
}

if (args.includes('--frontend')) {
  // Run only frontend tests
  const frontendTests = testFiles.filter(file => file.includes('client/'));
  testFiles.length = 0;
  testFiles.push(...frontendTests);
  console.log('🎨 Running frontend tests only...');
}

// Run the tests
runTests();
#!/usr/bin/env node

/**
 * Verification script for temporary download configuration
 * This script checks if all TEMP_DOWNLOAD_ environment variables are properly implemented
 */

const fs = require('fs');
const path = require('path');

// All TEMP_DOWNLOAD_ variables from .env file
const ENV_VARIABLES = [
  'TEMP_DOWNLOAD_SECRET_KEY',
  'TEMP_DOWNLOAD_DEFAULT_TTL',
  'TEMP_DOWNLOAD_MAX_TTL',
  'TEMP_DOWNLOAD_MIN_TTL',
  'TEMP_DOWNLOAD_ENABLED',
  'TEMP_DOWNLOAD_RATE_WINDOW',
  'TEMP_DOWNLOAD_RATE_LIMIT_IP',
  'TEMP_DOWNLOAD_RATE_LIMIT_USER',
  'TEMP_DOWNLOAD_RATE_LIMIT_FILE',
  'TEMP_DOWNLOAD_RATE_LIMIT_GLOBAL',
  'TEMP_DOWNLOAD_ALLOWED_IPS',
  'TEMP_DOWNLOAD_ENFORCE_IP_WHITELIST',
  'TEMP_DOWNLOAD_MAX_FILE_SIZE',
  'TEMP_DOWNLOAD_ALLOWED_TYPES',
  'TEMP_DOWNLOAD_MCP_ENABLED',
  'TEMP_DOWNLOAD_MCP_DEFAULT_TTL',
  'TEMP_DOWNLOAD_MCP_MAX_TTL',
  'TEMP_DOWNLOAD_MCP_RATE_LIMIT',
  'TEMP_DOWNLOAD_CLEANUP_INTERVAL',
  'TEMP_DOWNLOAD_AUDIT_RETENTION',
  'TEMP_DOWNLOAD_RATE_LIMIT_RETENTION',
  'TEMP_DOWNLOAD_AUTO_CLEANUP',
  'TEMP_DOWNLOAD_DETAILED_LOGGING',
  'TEMP_DOWNLOAD_LOG_ATTEMPTS',
  'TEMP_DOWNLOAD_LOG_SECURITY_EVENTS',
  'TEMP_DOWNLOAD_METRICS_ENABLED',
  'TEMP_DOWNLOAD_REDIS_URL',
  'TEMP_DOWNLOAD_REDIS_PREFIX',
  'TEMP_DOWNLOAD_REDIS_TIMEOUT',
  'TEMP_DOWNLOAD_DEBUG',
  'TEMP_DOWNLOAD_DEV_BYPASS_RATE_LIMIT',
  'TEMP_DOWNLOAD_DEV_ALLOW_INSECURE'
];

// Files to check for variable usage
const FILES_TO_CHECK = [
  'api/server/services/Files/UrlGeneratorService.js',
  'api/server/services/Files/MCPFileUrlService.js',
  'api/server/services/Files/RateLimitService.js',
  'api/server/services/Files/SecurityService.js',
  'api/server/services/Files/MetricsService.js',
  'api/server/services/Files/AuditService.js',
  'api/server/services/CleanupSchedulerService.js',
  'api/server/services/Files/ConfigValidationService.js'
];

function readFileContent(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.warn(`Warning: Could not read file ${filePath}: ${error.message}`);
    return '';
  }
}

function findVariableUsage(content, variable) {
  const regex = new RegExp(`process\\.env\\.${variable}`, 'g');
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

function verifyImplementation() {
  console.log('🔍 Verifying TEMP_DOWNLOAD_ environment variable implementation...\n');

  const results = {
    implemented: [],
    missing: [],
    totalUsages: 0
  };

  // Read all file contents
  const fileContents = {};
  for (const file of FILES_TO_CHECK) {
    fileContents[file] = readFileContent(file);
  }

  // Check each variable
  for (const variable of ENV_VARIABLES) {
    let found = false;
    let usageCount = 0;
    const usedInFiles = [];

    for (const [file, content] of Object.entries(fileContents)) {
      const count = findVariableUsage(content, variable);
      if (count > 0) {
        found = true;
        usageCount += count;
        usedInFiles.push({ file: path.basename(file), count });
      }
    }

    if (found) {
      results.implemented.push({
        variable,
        usageCount,
        usedInFiles
      });
      results.totalUsages += usageCount;
    } else {
      results.missing.push(variable);
    }
  }

  // Display results
  console.log('✅ IMPLEMENTED VARIABLES:');
  console.log('========================');
  for (const item of results.implemented) {
    console.log(`${item.variable} (${item.usageCount} usage${item.usageCount > 1 ? 's' : ''})`);
    for (const usage of item.usedInFiles) {
      console.log(`  └─ ${usage.file}: ${usage.count} time${usage.count > 1 ? 's' : ''}`);
    }
  }

  if (results.missing.length > 0) {
    console.log('\n❌ MISSING VARIABLES:');
    console.log('====================');
    for (const variable of results.missing) {
      console.log(`${variable}`);
    }
  }

  console.log('\n📊 SUMMARY:');
  console.log('===========');
  console.log(`Total variables: ${ENV_VARIABLES.length}`);
  console.log(`Implemented: ${results.implemented.length}`);
  console.log(`Missing: ${results.missing.length}`);
  console.log(`Total usages: ${results.totalUsages}`);
  console.log(`Implementation rate: ${Math.round((results.implemented.length / ENV_VARIABLES.length) * 100)}%`);

  if (results.missing.length === 0) {
    console.log('\n🎉 All TEMP_DOWNLOAD_ variables are implemented!');
  } else {
    console.log('\n⚠️  Some variables are not yet implemented.');
  }

  return results;
}

function checkConfigValidationService() {
  console.log('\n🔧 Checking ConfigValidationService coverage...\n');

  const configFile = 'api/server/services/Files/ConfigValidationService.js';
  const content = readFileContent(configFile);

  if (!content) {
    console.log('❌ ConfigValidationService.js not found');
    return;
  }

  const missingFromValidation = [];
  
  for (const variable of ENV_VARIABLES) {
    if (!content.includes(`'${variable}'`)) {
      missingFromValidation.push(variable);
    }
  }

  if (missingFromValidation.length === 0) {
    console.log('✅ All variables are included in ConfigValidationService');
  } else {
    console.log('❌ Variables missing from ConfigValidationService:');
    for (const variable of missingFromValidation) {
      console.log(`  - ${variable}`);
    }
  }
}

function checkEnvFileConsistency() {
  console.log('\n📄 Checking .env file consistency...\n');

  const envContent = readFileContent('.env');
  if (!envContent) {
    console.log('❌ .env file not found');
    return;
  }

  const envVariables = [];
  const lines = envContent.split('\n');
  
  for (const line of lines) {
    const match = line.match(/^(TEMP_DOWNLOAD_[A-Z_]+)=/);
    if (match) {
      envVariables.push(match[1]);
    }
  }

  const missingFromScript = envVariables.filter(v => !ENV_VARIABLES.includes(v));
  const missingFromEnv = ENV_VARIABLES.filter(v => !envVariables.includes(v));

  if (missingFromScript.length === 0 && missingFromEnv.length === 0) {
    console.log('✅ Script and .env file are consistent');
  } else {
    if (missingFromScript.length > 0) {
      console.log('❌ Variables in .env but not in script:');
      for (const variable of missingFromScript) {
        console.log(`  - ${variable}`);
      }
    }
    
    if (missingFromEnv.length > 0) {
      console.log('❌ Variables in script but not in .env:');
      for (const variable of missingFromEnv) {
        console.log(`  - ${variable}`);
      }
    }
  }

  console.log(`\n.env variables found: ${envVariables.length}`);
  console.log(`Script variables: ${ENV_VARIABLES.length}`);
}

// Run verification
if (require.main === module) {
  console.log('🚀 LibreChat Temporary Download Configuration Verification\n');
  
  const results = verifyImplementation();
  checkConfigValidationService();
  checkEnvFileConsistency();
  
  console.log('\n' + '='.repeat(60));
  
  if (results.missing.length === 0) {
    console.log('🎯 VERIFICATION COMPLETE: All variables implemented!');
    process.exit(0);
  } else {
    console.log('⚠️  VERIFICATION INCOMPLETE: Some variables need implementation.');
    process.exit(1);
  }
}

module.exports = {
  verifyImplementation,
  ENV_VARIABLES,
  FILES_TO_CHECK
};

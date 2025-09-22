#!/usr/bin/env node

/**
 * Security scan script to detect potential API key leakage
 * Run this as part of CI/CD pipeline
 */

const fs = require('fs');
const path = require('path');
const glob = require('glob');
const { minimatch } = require('minimatch');

// Patterns that might indicate API key exposure
const DANGEROUS_PATTERNS = [
  {
    pattern: /console\.(log|error|warn|debug)\s*\([^)]*process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/gi,
    description: 'Console logging environment secrets',
    severity: 'high',
  },
  {
    pattern: /res\.(json|send|status)\s*\([^)]*process\.env\.[A-Z_]*(KEY|TOKEN|SECRET|PASSWORD)/gi,
    description: 'Sending environment secrets in response',
    severity: 'critical',
  },
  {
    pattern: /throw\s+new\s+Error\s*\([^)]*\+?\s*process\.env\.[A-Z_]*(KEY|TOKEN|SECRET)/gi,
    description: 'Including secrets in error messages',
    severity: 'high',
  },
  {
    pattern: /logger\.(log|error|warn|info|debug)\s*\([^)]*(?<!mask)apiKey(?!\))(?!.*maskAPIKey)[^)]*\)/gi,
    description: 'Logging API keys',
    severity: 'high',
  },
  {
    pattern: /JSON\.stringify\s*\([^)]*process\.env[^)]*\)/gi,
    description: 'Stringifying entire environment',
    severity: 'medium',
  },
  {
    pattern: /res\.json\s*\(\s*process\.env\s*\)/gi,
    description: 'Sending entire environment in response',
    severity: 'critical',
  },
];

// Files/directories to exclude from scanning
const EXCLUDE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/*.test.js',
  '**/*.spec.js',
  '**/keyMasking.js', // Our security utility is allowed to handle keys
  '**/envValidation.js', // Our validation utility is allowed to check keys
  '**/security-scan.js', // This file
  '**/security.test.js', // Security test file
];

// File extensions to scan
const FILE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

/**
 * Scan a single file for dangerous patterns
 * @param {string} filePath - Path to file
 * @returns {Array} Array of violations found
 */
function scanFile(filePath) {
  const violations = [];
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  DANGEROUS_PATTERNS.forEach(({ pattern, description, severity }) => {
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        // Check if line is commented out
        const trimmedLine = line.trim();
        if (trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
          return; // Skip commented lines
        }

        violations.push({
          file: filePath,
          line: index + 1,
          severity,
          description,
          code: line.trim().substring(0, 100),
        });
      }
    });
  });

  return violations;
}

/**
 * Check if file should be scanned
 * @param {string} filePath - Path to file
 * @returns {boolean} True if file should be scanned
 */
function shouldScanFile(filePath) {
  // Check if file has correct extension
  const hasValidExtension = FILE_EXTENSIONS.some(ext => filePath.endsWith(ext));
  if (!hasValidExtension) return false;

  // Check if file is in excluded patterns
  const isExcluded = EXCLUDE_PATTERNS.some(pattern => {
    const globPattern = path.join(process.cwd(), pattern);
    return minimatch(filePath, globPattern);
  });

  return !isExcluded;
}

/**
 * Scan directory recursively
 * @param {string} directory - Directory to scan
 * @returns {Array} Array of all violations found
 */
function scanDirectory(directory) {
  const allViolations = [];
  const pattern = path.join(directory, '**/*');

  const files = glob.sync(pattern, {
    nodir: true,
    absolute: true,
  });

  files.forEach(file => {
    if (shouldScanFile(file)) {
      const violations = scanFile(file);
      allViolations.push(...violations);
    }
  });

  return allViolations;
}

/**
 * Format violations for output
 * @param {Array} violations - Array of violations
 * @returns {string} Formatted output
 */
function formatViolations(violations) {
  if (violations.length === 0) {
    return '✅ No security violations found!';
  }

  const grouped = violations.reduce((acc, violation) => {
    if (!acc[violation.severity]) {
      acc[violation.severity] = [];
    }
    acc[violation.severity].push(violation);
    return acc;
  }, {});

  let output = `\n⚠️  Found ${violations.length} potential security violation(s):\n\n`;

  ['critical', 'high', 'medium', 'low'].forEach(severity => {
    if (grouped[severity]) {
      output += `\n${severity.toUpperCase()} (${grouped[severity].length}):\n`;
      output += '='.repeat(50) + '\n';

      grouped[severity].forEach(violation => {
        const relativePath = path.relative(process.cwd(), violation.file);
        output += `\n📍 ${relativePath}:${violation.line}\n`;
        output += `   ${violation.description}\n`;
        output += `   Code: ${violation.code}\n`;
      });
    }
  });

  return output;
}

/**
 * Main function
 */
function main() {
  const args = process.argv.slice(2);
  const directory = args[0] || './api';

  console.log(`🔍 Scanning ${directory} for potential API key leakage...\n`);

  try {
    const violations = scanDirectory(path.resolve(directory));
    const output = formatViolations(violations);

    console.log(output);

    // Exit with error code if critical violations found
    const hasCritical = violations.some(v => v.severity === 'critical');
    if (hasCritical) {
      console.error('\n❌ Critical security violations found! Please fix before deploying.\n');
      process.exit(1);
    }

    // Warn for high severity
    const hasHigh = violations.some(v => v.severity === 'high');
    if (hasHigh) {
      console.warn('\n⚠️  High severity violations found. Consider fixing these.\n');
      process.exit(0); // Don't fail CI for high severity
    }

  } catch (error) {
    console.error('Error during security scan:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { scanFile, scanDirectory, DANGEROUS_PATTERNS };
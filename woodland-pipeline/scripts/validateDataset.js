#!/usr/bin/env node
/**
 * Validate Knowledge Datasets
 * 
 * Validates build artifacts from buildKnowledgeDataset.js:
 * - Required fields presence
 * - JSON validity (variables, metadata)
 * - Duplicate ID detection
 * - Quality checks (length, content)
 * - Cross-source consistency
 * - Stats reporting
 * 
 * Usage:
 *   node scripts/validateDataset.js \
 *     --dir build/datasets \
 *     --fail-on-warn=false \
 *     --report build/validation_report.json
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { program } = require('commander');

// Parse command line arguments
program
  .option('--dir <path>', 'Directory containing dataset files', 'build/datasets')
  .option('--fail-on-warn', 'Exit with error code on warnings', false)
  .option('--report <path>', 'Path to write validation report JSON')
  .option('--verbose', 'Show detailed validation output', false)
  .parse(process.argv);

const options = program.opts();

// Validation results
const results = {
  timestamp: new Date().toISOString(),
  summary: {
    total_items: 0,
    by_source: {},
    errors: 0,
    warnings: 0
  },
  issues: []
};

/**
 * Log issue
 */
function logIssue(type, source, id, message) {
  const issue = { type, source, id, message };
  results.issues.push(issue);
  
  if (type === 'error') {
    results.summary.errors++;
    console.error(`❌ [${source}] ${id}: ${message}`);
  } else {
    results.summary.warnings++;
    console.warn(`⚠️  [${source}] ${id}: ${message}`);
  }
}

/**
 * Validate Langfuse CSV file
 */
async function validateLangfuseCSV(filePath, sourceName) {
  console.log(`\n🔍 Validating ${sourceName}: ${filePath}`);
  
  if (!fs.existsSync(filePath)) {
    console.log(`   ⏭️  File not found, skipping`);
    return { count: 0, ids: new Set() };
  }

  const items = [];
  const ids = new Set();
  
  return new Promise((resolve, reject) => {
    let rowNum = 0;
    
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowNum++;
        
        // Check required columns
        if (!row.variables) {
          logIssue('error', sourceName, `row_${rowNum}`, 'Missing "variables" column');
          return;
        }
        
        if (!row.expected_output) {
          logIssue('error', sourceName, `row_${rowNum}`, 'Missing "expected_output" column');
          return;
        }
        
        // Validate JSON fields
        let variables, metadata;
        
        try {
          variables = JSON.parse(row.variables);
        } catch (error) {
          logIssue('error', sourceName, `row_${rowNum}`, `Invalid variables JSON: ${error.message}`);
          return;
        }
        
        if (row.metadata) {
          try {
            metadata = JSON.parse(row.metadata);
          } catch (error) {
            logIssue('error', sourceName, `row_${rowNum}`, `Invalid metadata JSON: ${error.message}`);
            return;
          }
        }
        
        // Check variables.input exists
        if (!variables.input) {
          logIssue('error', sourceName, `row_${rowNum}`, 'variables.input is missing');
          return;
        }
        
        // Extract ID
        const id = metadata?.id || `row_${rowNum}`;
        
        // Check for duplicate IDs
        if (ids.has(id)) {
          logIssue('error', sourceName, id, 'Duplicate ID found');
        }
        ids.add(id);
        
        // Quality checks
        const inputLen = variables.input.length;
        const outputLen = row.expected_output.length;
        
        if (inputLen < 5) {
          logIssue('warning', sourceName, id, `Short input (${inputLen} chars)`);
        }
        
        if (outputLen < 20) {
          logIssue('warning', sourceName, id, `Short output (${outputLen} chars)`);
        }
        
        if (outputLen < 40) {
          logIssue('warning', sourceName, id, `Output below recommended length (${outputLen} < 40 chars)`);
        }
        
        // Check for all caps (likely data issue)
        if (row.expected_output === row.expected_output.toUpperCase() && outputLen > 20) {
          logIssue('warning', sourceName, id, 'Output is all uppercase');
        }
        
        // Check for common typos
        if (row.expected_output.match(/^hanks/i)) {
          logIssue('warning', sourceName, id, 'Output starts with "hanks" (should be "Thanks")');
        }
        
        // Check metadata fields
        if (sourceName === 'qa' && metadata) {
          if (!metadata.model && !metadata.component) {
            logIssue('warning', sourceName, id, 'Missing both model and component metadata');
          }
        }
        
        items.push({
          id,
          source: sourceName,
          input: variables.input,
          expected_output: row.expected_output,
          metadata: metadata || {}
        });
      })
      .on('end', () => {
        console.log(`   ✅ Validated ${items.length} items`);
        
        if (!results.summary.by_source[sourceName]) {
          results.summary.by_source[sourceName] = 0;
        }
        results.summary.by_source[sourceName] += items.length;
        results.summary.total_items += items.length;
        
        resolve({ count: items.length, ids, items });
      })
      .on('error', (error) => {
        logIssue('error', sourceName, 'file', `CSV parse error: ${error.message}`);
        reject(error);
      });
  });
}

/**
 * Check for cross-source duplicate questions
 */
function checkCrossSourceDuplicates(datasets) {
  console.log(`\n🔍 Checking for cross-source duplicates...`);
  
  const questionMap = new Map();
  let duplicates = 0;
  
  datasets.forEach(({ sourceName, items }) => {
    items.forEach(item => {
      const normalizedInput = item.input.toLowerCase().trim().substring(0, 100);
      
      if (questionMap.has(normalizedInput)) {
        const original = questionMap.get(normalizedInput);
        if (original.source !== sourceName) {
          logIssue(
            'warning',
            sourceName,
            item.id,
            `Similar question found in ${original.source}: ${original.id}`
          );
          duplicates++;
        }
      } else {
        questionMap.set(normalizedInput, {
          source: sourceName,
          id: item.id,
          output: item.expected_output
        });
      }
    });
  });
  
  if (duplicates === 0) {
    console.log(`   ✅ No cross-source duplicates found`);
  } else {
    console.log(`   ⚠️  Found ${duplicates} potential cross-source duplicates`);
  }
}

/**
 * Generate statistics
 */
function generateStats(datasets) {
  console.log(`\n📊 Statistics:\n`);
  
  datasets.forEach(({ sourceName, items }) => {
    if (items.length === 0) return;
    
    const inputLengths = items.map(i => i.input.length);
    const outputLengths = items.map(i => i.expected_output.length);
    
    const avgInputLen = Math.round(inputLengths.reduce((a, b) => a + b, 0) / inputLengths.length);
    const avgOutputLen = Math.round(outputLengths.reduce((a, b) => a + b, 0) / outputLengths.length);
    
    const minInputLen = Math.min(...inputLengths);
    const maxInputLen = Math.max(...inputLengths);
    const minOutputLen = Math.min(...outputLengths);
    const maxOutputLen = Math.max(...outputLengths);
    
    // Category distribution
    const categories = {};
    items.forEach(item => {
      const cat = item.metadata.category || 'unknown';
      categories[cat] = (categories[cat] || 0) + 1;
    });
    
    console.log(`${sourceName.toUpperCase()}:`);
    console.log(`  Items: ${items.length}`);
    console.log(`  Input length: avg=${avgInputLen}, min=${minInputLen}, max=${maxInputLen}`);
    console.log(`  Output length: avg=${avgOutputLen}, min=${minOutputLen}, max=${maxOutputLen}`);
    console.log(`  Categories:`, categories);
    console.log(``);
  });
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Validating knowledge datasets...\n');
    console.log(`Directory: ${options.dir}\n`);
    
    // Validate each source
    const qaResult = await validateLangfuseCSV(
      path.join(options.dir, 'qa/langfuse_dataset_variables.csv'),
      'qa'
    );
    
    const trainingResult = await validateLangfuseCSV(
      path.join(options.dir, 'training/langfuse_dataset_variables.csv'),
      'training'
    );
    
    const salesResult = await validateLangfuseCSV(
      path.join(options.dir, 'sales/langfuse_dataset_variables.csv'),
      'sales'
    );
    
    const unifiedResult = await validateLangfuseCSV(
      path.join(options.dir, 'unified/all_knowledge.csv'),
      'unified'
    );
    
    // Cross-source checks
    const datasets = [
      { sourceName: 'qa', items: qaResult.items || [] },
      { sourceName: 'training', items: trainingResult.items || [] },
      { sourceName: 'sales', items: salesResult.items || [] }
    ].filter(d => d.items.length > 0);
    
    if (datasets.length > 1) {
      checkCrossSourceDuplicates(datasets);
    }
    
    // Generate statistics
    generateStats([...datasets, { sourceName: 'unified', items: unifiedResult.items || [] }]);
    
    // Summary
    console.log('='.repeat(60));
    console.log('📊 Validation Summary:');
    console.log(`   Total items: ${results.summary.total_items}`);
    Object.entries(results.summary.by_source).forEach(([source, count]) => {
      console.log(`   - ${source}: ${count}`);
    });
    console.log(`   Errors: ${results.summary.errors}`);
    console.log(`   Warnings: ${results.summary.warnings}`);
    console.log('='.repeat(60));
    
    // Write report if requested
    if (options.report) {
      fs.writeFileSync(options.report, JSON.stringify(results, null, 2), 'utf8');
      console.log(`\n📝 Validation report written to: ${options.report}`);
    }
    
    // Determine exit code
    if (results.summary.errors > 0) {
      console.log('\n❌ Validation FAILED with errors');
      process.exit(1);
    } else if (results.summary.warnings > 0) {
      console.log('\n⚠️  Validation passed with warnings');
      if (options.failOnWarn) {
        process.exit(1);
      }
    } else {
      console.log('\n✅ Validation PASSED');
    }
    
  } catch (error) {
    console.error('\n❌ Validation error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main();

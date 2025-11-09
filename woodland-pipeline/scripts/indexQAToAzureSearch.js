#!/usr/bin/env node
/**
 * Index QA Knowledge Base to Azure AI Search
 * 
 * This script uploads human-validated Q&A pairs from CSV to Azure AI Search.
 * 
 * Usage:
 *   node scripts/indexQAToAzureSearch.js --input "path/to/qa.csv" [options]
 * 
 * Options:
 *   --input <path>        Path to CSV file (required)
 *   --index <name>        Azure AI Search index name (default: from env)
 *   --batch-size <n>      Upload batch size (default: 100)
 *   --dry-run             Preview without uploading
 *   --create-index        Create index if it doesn't exist
 *   --help                Show help
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { program } = require('commander');
const { SearchIndexClient, SearchClient, AzureKeyCredential } = require('@azure/search-documents');

// Load parent .env like other scripts so local runs work without exporting
const parentDir = path.resolve(__dirname, '../..');
try {
  require('dotenv').config({ path: path.resolve(parentDir, '.env') });
} catch {}

// Parse command line arguments
program
  .requiredOption('--input <path>', 'Path to CSV file with QA data')
  .option('--index <name>', 'Azure AI Search index name')
  .option('--batch-size <n>', 'Upload batch size', '100')
  .option('--dry-run', 'Preview without uploading', false)
  .option('--create-index', 'Create index if it doesn\'t exist', false)
  .option('--help', 'Show help');

program.parse(process.argv);
const options = program.opts();

if (options.help) {
  program.help();
}

// Configuration from environment
// Support multiple env var names for flexibility
const serviceEndpoint = process.env.AZURE_AI_SEARCH_SERVICE_ENDPOINT || process.env.AZURE_AI_SEARCH_ENDPOINT;
const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || process.env.AZURE_AI_SEARCH_ADMIN_KEY;
const apiVersion = process.env.AZURE_AI_SEARCH_API_VERSION || '2024-07-01';
const indexName = options.index || process.env.AZURE_AI_SEARCH_QA_INDEX || process.env.AZURE_AI_SEARCH_INDEX_NAME || 'wpp-knowledge-qa';
const batchSize = parseInt(options.batchSize, 10);

// Validate configuration
if (!serviceEndpoint) {
  console.error('❌ Error: Azure Search endpoint not set (set AZURE_AI_SEARCH_SERVICE_ENDPOINT or AZURE_AI_SEARCH_ENDPOINT)');
  process.exit(1);
}

if (!apiKey) {
  console.error('❌ Error: Azure Search API key not set (set AZURE_AI_SEARCH_API_KEY or AZURE_AI_SEARCH_ADMIN_KEY)');
  process.exit(1);
}

if (!fs.existsSync(options.input)) {
  console.error(`❌ Error: Input file not found: ${options.input}`);
  process.exit(1);
}

console.log('🔧 Configuration:');
console.log(`   Service Endpoint: ${serviceEndpoint}`);
console.log(`   Index Name: ${indexName}`);
console.log(`   Input File: ${options.input}`);
console.log(`   Batch Size: ${batchSize}`);
console.log(`   Dry Run: ${options.dryRun ? 'Yes' : 'No'}`);
console.log(`   Create Index: ${options.createIndex ? 'Yes' : 'No'}`);
console.log('');

/**
 * Define Azure AI Search index schema for QA KB
 */
const indexSchema = {
  name: indexName,
  fields: [
    {
      name: 'id',
      type: 'Edm.String',
      key: true,
      searchable: false,
      filterable: false,
      sortable: false,
      facetable: false,
    },
    {
      name: 'questionId',
      type: 'Edm.String',
      searchable: true,
      filterable: true,
      sortable: true,
      facetable: true,
    },
    {
      name: 'question',
      type: 'Edm.String',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
    },
    {
      name: 'answer',
      type: 'Edm.String',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
    },
    {
      name: 'model',
      type: 'Edm.String',
      searchable: true,
      filterable: true,
      sortable: true,
      facetable: true,
    },
    {
      name: 'component',
      type: 'Edm.String',
      searchable: true,
      filterable: true,
      sortable: true,
      facetable: true,
    },
    {
      name: 'category',
      type: 'Edm.String',
      searchable: true,
      filterable: true,
      sortable: false,
      facetable: true,
    },
    {
      name: 'combinedContent',
      type: 'Edm.String',
      searchable: true,
      filterable: false,
      sortable: false,
      facetable: false,
    },
  ],
  semantic: {
    defaultConfigurationName: 'sem1',
    configurations: [
      {
        name: 'sem1',
        prioritizedFields: {
          titleField: { fieldName: 'question' },
          prioritizedContentFields: [
            { fieldName: 'answer' },
            { fieldName: 'combinedContent' }
          ],
          prioritizedKeywordsFields: [
            { fieldName: 'model' },
            { fieldName: 'component' },
            { fieldName: 'questionId' }
          ]
        }
      }
    ]
  },
  suggesters: [
    {
      name: 'sg',
      searchMode: 'analyzingInfixMatching',
      sourceFields: ['question', 'model', 'component'],
    },
  ],
};

/**
 * Parse CSV and convert to Azure AI Search documents
 */
async function parseCSV(filePath) {
  return new Promise((resolve, reject) => {
    const documents = [];
    let rowCount = 0;
    let headersLogged = false;

    function coerce(val) {
      if (val == null) return '';
      return String(val).trim();
    }

    function safeJsonParse(str) {
      if (!str || typeof str !== 'string') return null;
      try {
        return JSON.parse(str);
      } catch {
        return null;
      }
    }

    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headers) => {
        if (!headersLogged) {
          console.log(`[azure-index] Detected CSV headers: ${headers.join(', ')}`);
          headersLogged = true;
        }
      })
      .on('data', (row) => {
        rowCount++;
        // Support two schemas:
        // 1. Airtable export: Question ID, Question, Answer, Model, Component, Category
        // 2. Unified dataset: variables (JSON { input }), expected_output, metadata (JSON { id, model, component, category })
        let questionId = null;
        let question = null;
        let answer = null;
        let model = null;
        let component = null;
        let category = null;

        const hasUnified = row.variables || row.expected_output || row.metadata;
        if (hasUnified) {
          const vars = safeJsonParse(row.variables);
            const meta = safeJsonParse(row.metadata);
          question = coerce(vars?.input || row.input || row['Question'] || row.question);
          answer = coerce(row.expected_output || row['Answer'] || row.answer);
          questionId = coerce(meta?.id || row['Question ID'] || row.id || row.questionId || `Q${rowCount}`);
          model = coerce(meta?.model || row.Model || row.model);
          component = coerce(meta?.component || row.Component || row.component);
          category = coerce(meta?.category || row.Category || row.category || meta?.source || '');
        } else {
          questionId = coerce(row['Question ID'] || row.id || row.questionId || `Q${rowCount}`);
          question = coerce(row['Question'] || row.question || row.input);
          answer = coerce(row['Answer'] || row.answer || row.expected_output);
          model = coerce(row['Model'] || row.model);
          component = coerce(row['Component'] || row.component);
          category = coerce(row['Category'] || row.category);
        }

        if (!question || !answer) {
          console.warn(`⚠️  Skipping row ${rowCount}: missing question or answer`);
          return;
        }

        const combinedContent = `${questionId}: ${question}\n\nAnswer: ${answer}\n\nModel: ${model} | Component: ${component}`;
        documents.push({
          id: `qa-${questionId.replace(/[^a-zA-Z0-9-_]/g, '_')}`,
          questionId,
          question,
          answer,
          model,
          component,
          category,
          combinedContent,
        });
      })
      .on('end', () => {
        console.log(`✅ Parsed ${documents.length} QA pairs from CSV`);
        resolve(documents);
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

/**
 * Create index if it doesn't exist
 */
async function createIndexIfNotExists(indexClient) {
  // Debug: print indexSchema before creation
  console.log('[azure-index] Index schema preview:', JSON.stringify(indexSchema, null, 2));
  try {
    console.log(`🔍 Checking if index '${indexName}' exists...`);
    await indexClient.getIndex(indexName);
    console.log(`✅ Index '${indexName}' already exists`);
    return false;
  } catch (error) {
    if (error.statusCode === 404) {
      console.log(`📝 Index '${indexName}' does not exist`);
      
      if (!options.createIndex) {
        console.error('❌ Use --create-index flag to create the index');
        process.exit(1);
      }
      
      console.log(`🏗️  Creating index '${indexName}'...`);
      await indexClient.createIndex(indexSchema);
      console.log(`✅ Index '${indexName}' created successfully`);
      return true;
    }
    throw error;
  }
}

/**
 * Upload documents in batches
 */
async function uploadDocuments(searchClient, documents) {
  console.log(`📤 Uploading ${documents.length} documents in batches of ${batchSize}...`);
  
  let uploaded = 0;
  let failed = 0;
  
  for (let i = 0; i < documents.length; i += batchSize) {
    const batch = documents.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(documents.length / batchSize);
    
    console.log(`📦 Uploading batch ${batchNumber}/${totalBatches} (${batch.length} documents)...`);
    
    try {
      const result = await searchClient.uploadDocuments(batch);
      
      // Check for failures
      const succeeded = result.results.filter(r => r.succeeded).length;
      const failedInBatch = result.results.filter(r => !r.succeeded).length;
      
      uploaded += succeeded;
      failed += failedInBatch;
      
      if (failedInBatch > 0) {
        console.warn(`⚠️  Batch ${batchNumber}: ${succeeded} succeeded, ${failedInBatch} failed`);
        result.results.filter(r => !r.succeeded).forEach(r => {
          console.warn(`   - ${r.key}: ${r.errorMessage}`);
        });
      } else {
        console.log(`✅ Batch ${batchNumber}: ${succeeded} documents uploaded`);
      }
    } catch (error) {
      console.error(`❌ Batch ${batchNumber} failed:`, error.message);
      failed += batch.length;
    }
  }
  
  return { uploaded, failed };
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Starting QA KB indexing to Azure AI Search...\n');
    
    // Parse CSV
    const documents = await parseCSV(options.input);
    
    if (documents.length === 0) {
      console.error('❌ No valid documents found in CSV');
      process.exit(1);
    }
    
    // Show preview in dry run
    if (options.dryRun) {
      console.log('\n📋 Preview (first 3 documents):');
      documents.slice(0, 3).forEach((doc, i) => {
        console.log(`\n--- Document ${i + 1} ---`);
        console.log(`ID: ${doc.id}`);
        console.log(`Question ID: ${doc.questionId}`);
        console.log(`Question: ${doc.question.substring(0, 100)}...`);
        console.log(`Answer: ${doc.answer.substring(0, 100)}...`);
        console.log(`Model: ${doc.model}`);
        console.log(`Component: ${doc.component}`);
      });
      console.log('\n✅ Dry run complete. Use without --dry-run to upload.');
      process.exit(0);
    }
    
    // Initialize clients
    const credential = new AzureKeyCredential(apiKey);
    const indexClient = new SearchIndexClient(serviceEndpoint, credential, { apiVersion });
    const searchClient = new SearchClient(serviceEndpoint, indexName, credential, { apiVersion });
    
    // Create index if needed
    await createIndexIfNotExists(indexClient);
    
    // Upload documents
    console.log('');
    const { uploaded, failed } = await uploadDocuments(searchClient, documents);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Indexing Summary:');
    console.log(`   Total documents: ${documents.length}`);
    console.log(`   Successfully uploaded: ${uploaded}`);
    console.log(`   Failed: ${failed}`);
    console.log(`   Index: ${indexName}`);
    console.log('='.repeat(60));
    
    if (failed > 0) {
      console.log('\n⚠️  Some documents failed to upload. Check the logs above for details.');
      process.exit(1);
    }
    
    console.log('\n✅ QA Knowledge Base indexed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Set AZURE_AI_SEARCH_QA_INDEX in .env:');
    console.log(`      AZURE_AI_SEARCH_QA_INDEX=${indexName}`);
    console.log('   2. Enable Azure AI Search QA tool:');
    console.log('      WOODLAND_AZURE_QA_ENABLED=true');
    console.log('   3. Restart LibreChat backend');
    console.log('');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.details) {
      console.error('Details:', error.details);
    }
    process.exit(1);
  }
}

// Run
main();

#!/usr/bin/env node
/**
 * Build Unified Knowledge Dataset
 * 
 * Processes multiple knowledge sources (QA, training data, sales conversations)
 * into standardized datasets for LibreChat RAG, Azure AI Search, and Langfuse evaluation.
 * 
 * Sources:
 * - QA Knowledge: Airtable CSV export with customer support Q&A
 * - Training Data: Curated conversation examples (JSON/CSV)
 * - Sales Conversations: Real customer interactions (JSON/CSV)
 * 
 * Outputs:
 * - build/datasets/qa/langfuse_dataset_variables.csv
 * - build/datasets/training/langfuse_dataset_variables.csv
 * - build/datasets/sales/langfuse_dataset_variables.csv
 * - build/datasets/unified/all_knowledge.csv
 * - build/markdown/QA_Knowledge_Base.md
 * 
 * Usage:
 *   node scripts/buildKnowledgeDataset.js \
 *     --qa "scripts/Sample Airtable Data - QA.csv" \
 *     --training "data/training/*.json" \
 *     --sales "data/sales/*.json" \
 *     --output build/datasets
 */

const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { program } = require('commander');
const { glob } = require('glob');
const mammoth = require('mammoth');

// Parse command line arguments
program
  .option('--qa <path>', 'Path to QA folder (supports .csv and .docx files)', 'data/qa')
  .option('--training <pattern>', 'Glob pattern for training data files', 'data/training/*.json')
  .option('--sales <pattern>', 'Glob pattern for sales conversation files', 'data/sales/*.json')
  .option('--documents <pattern>', 'Glob pattern for .docx document files', 'data/documents/*.docx')
  .option('--output <dir>', 'Output directory for build artifacts', 'build/datasets')
  .option('--dedupe', 'Remove duplicate entries by content similarity', false)
  .option('--enrich-metadata', 'Add computed fields (word count, complexity)', false)
  .option('--filter-quality', 'Exclude low-quality entries', false)
  .option('--previous <path>', 'Path to previous dataset for diff detection')
  .option('--delta-only', 'Output only changed items (requires --previous)', false)
  .option('--incremental', 'Process only new/modified files since last build', false)
  .option('--dry-run', 'Preview without writing files', false)
  .parse(process.argv);

const options = program.opts();

// Ensure output directories exist
const outputDirs = [
  path.join(options.output, 'qa'),
  path.join(options.output, 'training'),
  path.join(options.output, 'sales'),
  path.join(options.output, 'documents'),
  path.join(options.output, 'unified'),
  path.join(options.output, '../markdown'),
];

outputDirs.forEach(dir => {
  if (!options.dryRun && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Unified knowledge item schema
 */
class KnowledgeItem {
  constructor({
    id,
    source,
    category,
    input,
    expected_output,
    metadata = {}
  }) {
    this.id = id;
    this.source = source; // 'qa' | 'training' | 'sales'
    this.category = category; // 'technical' | 'sales' | 'support' | 'general'
    this.input = this.cleanText(input);
    this.expected_output = this.cleanText(expected_output);
    this.metadata = {
      source_file: metadata.source_file || '',
      model: metadata.model || '',
      component: metadata.component || '',
      created: metadata.created || new Date().toISOString(),
      quality_score: metadata.quality_score || 0,
      ...metadata
    };
  }

  cleanText(text) {
    if (!text) return '';
    return text
      .trim()
      .replace(/^hanks/i, 'Thanks') // Fix common typo
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/\r\n/g, '\n'); // Normalize line endings
  }

  toLangfuseVariables() {
    return {
      variables: JSON.stringify({ input: this.input }),
      expected_output: this.expected_output,
      metadata: JSON.stringify({
        id: this.id,
        source: this.source,
        category: this.category,
        ...this.metadata
      })
    };
  }

  toLangfuseImport() {
    return {
      input: this.input,
      expected_output: this.expected_output,
      metadata: JSON.stringify({
        id: this.id,
        source: this.source,
        category: this.category,
        ...this.metadata
      })
    };
  }

  toMarkdown() {
    let md = `### ${this.id}: ${this.input}\n\n`;
    
    if (this.metadata.model) md += `**Model**: ${this.metadata.model}\n\n`;
    if (this.metadata.component) md += `**Component**: ${this.metadata.component}\n\n`;
    if (this.category) md += `**Category**: ${this.category}\n\n`;
    
    md += `**Answer**:\n\n${this.expected_output}\n\n`;
    md += `---\n\n`;
    
    return md;
  }
}

/**
 * Parse QA data from folder (supports .csv and .docx files)
 * Automatically detects and processes all QA sources in the directory
 */
async function parseQAData(qaPath) {
  console.log(`📖 Parsing QA data from: ${qaPath}`);
  
  // Check if it's a directory or single file
  const stats = fs.existsSync(qaPath) ? fs.statSync(qaPath) : null;
  
  if (!stats) {
    console.warn(`⚠️  QA path not found: ${qaPath}`);
    return [];
  }
  
  let items = [];
  
  // Single file mode (backward compatibility)
  if (stats.isFile()) {
    if (qaPath.endsWith('.csv')) {
      items = await parseQACSV(qaPath);
    } else if (qaPath.endsWith('.docx')) {
      items = await parseQADocx(qaPath);
    } else {
      console.warn(`⚠️  Unsupported QA file format: ${qaPath}`);
    }
    return items;
  }
  
  // Directory mode - process all CSV and .docx files
  if (stats.isDirectory()) {
    const csvFiles = await glob(path.join(qaPath, '*.csv'));
    const docxFiles = await glob(path.join(qaPath, '*.docx'));
    
    console.log(`   Found ${csvFiles.length} CSV files and ${docxFiles.length} .docx files`);
    
    // Process CSV files
    for (const csvFile of csvFiles) {
      const csvItems = await parseQACSV(csvFile);
      items.push(...csvItems);
    }
    
    // Process .docx files
    for (const docxFile of docxFiles) {
      const docxItems = await parseQADocx(docxFile);
      items.push(...docxItems);
    }
    
    console.log(`✅ Parsed ${items.length} total QA items from ${csvFiles.length + docxFiles.length} files`);
  }
  
  return items;
}

/**
 * Parse single QA CSV file (Airtable format)
 */
async function parseQACSV(filePath) {
  console.log(`   📄 Processing CSV: ${path.basename(filePath)}`);
  
  const items = [];
  
  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        const questionId = row['Question ID'] || row['ID'] || row.id;
        const question = row['Question'] || row.input;
        const answer = row['Answer'] || row.expected_output;
        const model = row['Model'];
        const component = row['Component'];
        const category = row['Category'] || 'support';
        
        if (question && answer) {
          items.push(new KnowledgeItem({
            id: questionId || `qa_csv_${items.length + 1}`,
            source: 'qa',
            category,
            input: question,
            expected_output: answer,
            metadata: {
              source_file: path.basename(filePath),
              source_type: 'csv',
              model: model?.trim(),
              component: component?.trim(),
              doc360_url: row['Doc360 URL'],
              case_id: row['Case'],
              status: row['Status'],
              answer_date: row['Answer Date'],
            }
          }));
        }
      })
      .on('end', () => {
        console.log(`      ✓ ${items.length} items from CSV`);
        resolve(items);
      })
      .on('error', reject);
  });
}

/**
 * Parse single QA .docx file (Q&A format)
 */
async function parseQADocx(filePath) {
  console.log(`   📄 Processing .docx: ${path.basename(filePath)}`);
  
  const items = [];
  
  try {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    const text = result.text;
    
    const qaPairs = extractQAPairs(text);
    
    qaPairs.forEach((pair, index) => {
      if (pair.question && pair.answer) {
        const fileName = path.basename(filePath, '.docx');
        items.push(new KnowledgeItem({
          id: `qa_${fileName}_${index + 1}`,
          source: 'qa',
          category: pair.category || pair.section || 'support',
          input: pair.question,
          expected_output: pair.answer,
          metadata: {
            source_file: path.basename(filePath),
            source_type: 'docx',
            section: pair.section || 'general',
            doc_position: index + 1
          }
        }));
      }
    });
    
    console.log(`      ✓ ${items.length} items from .docx`);
  } catch (error) {
    console.error(`      ✗ Error parsing ${filePath}:`, error.message);
  }
  
  return items;
}

/**
 * Parse training data JSON files
 */
async function parseTrainingData(pattern) {
  console.log(`📖 Parsing training data from: ${pattern}`);
  
  const files = await glob(pattern);
  
  if (files.length === 0) {
    console.warn(`⚠️  No training data files found matching: ${pattern}`);
    return [];
  }

  const items = [];
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const records = Array.isArray(data) ? data : [data];
      
      records.forEach(record => {
        if (record.input && record.expected_output) {
          items.push(new KnowledgeItem({
            id: record.id || `train_${items.length + 1}`,
            source: 'training',
            category: record.category || 'general',
            input: record.input,
            expected_output: record.expected_output,
            metadata: {
              source_file: path.basename(file),
              ...record.metadata
            }
          }));
        }
      });
    } catch (error) {
      console.error(`❌ Error parsing ${file}:`, error.message);
    }
  }
  
  console.log(`✅ Parsed ${items.length} training items from ${files.length} files`);
  return items;
}

/**
 * Parse sales conversation JSON files
 */
async function parseSalesData(pattern) {
  console.log(`📖 Parsing sales data from: ${pattern}`);
  
  const files = await glob(pattern);
  
  if (files.length === 0) {
    console.warn(`⚠️  No sales conversation files found matching: ${pattern}`);
    return [];
  }

  const items = [];
  
  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      const records = Array.isArray(data) ? data : [data];
      
      records.forEach(record => {
        if (record.customer_question && record.sales_response) {
          items.push(new KnowledgeItem({
            id: record.id || `sales_${items.length + 1}`,
            source: 'sales',
            category: 'sales',
            input: record.customer_question,
            expected_output: record.sales_response,
            metadata: {
              source_file: path.basename(file),
              date: record.date,
              agent: record.metadata?.agent,
              outcome: record.outcome,
              product_mentioned: record.metadata?.product_mentioned,
              customer_segment: record.metadata?.customer_segment,
              sentiment: record.metadata?.sentiment
            }
          }));
        }
      });
    } catch (error) {
      console.error(`❌ Error parsing ${file}:`, error.message);
    }
  }
  
  console.log(`✅ Parsed ${items.length} sales items from ${files.length} files`);
  return items;
}

/**
 * Parse .docx files for Q&A knowledge
 * Expects documents with Q: and A: format or paragraph-based Q&A
 */
async function parseDocxFiles(pattern) {
  console.log(`📖 Parsing .docx files from: ${pattern}`);
  
  const files = await glob(pattern);
  
  if (files.length === 0) {
    console.warn(`⚠️  No .docx files found matching: ${pattern}`);
    return [];
  }

  const items = [];
  
  for (const file of files) {
    try {
      const buffer = fs.readFileSync(file);
      const result = await mammoth.extractRawText({ buffer });
      const text = result.text;
      
      // Strategy 1: Parse Q: and A: format
      const qaPairs = extractQAPairs(text);
      
      qaPairs.forEach((pair, index) => {
        if (pair.question && pair.answer) {
          const fileName = path.basename(file, '.docx');
          items.push(new KnowledgeItem({
            id: `doc_${fileName}_${index + 1}`,
            source: 'documents',
            category: pair.category || 'documentation',
            input: pair.question,
            expected_output: pair.answer,
            metadata: {
              source_file: path.basename(file),
              section: pair.section || 'general',
              doc_position: index + 1
            }
          }));
        }
      });
      
    } catch (error) {
      console.error(`❌ Error parsing ${file}:`, error.message);
    }
  }
  
  console.log(`✅ Parsed ${items.length} document items from ${files.length} files`);
  return items;
}

/**
 * Extract Q&A pairs from document text
 * Supports multiple formats:
 * 1. Q: question\nA: answer
 * 2. Question: question\nAnswer: answer
 * 3. Numbered Q&A (1. Q: ... A: ...)
 */
function extractQAPairs(text) {
  const pairs = [];
  
  // Handle empty or undefined text
  if (!text || typeof text !== 'string') {
    return pairs;
  }
  
  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // Split by common section headers or double newlines
  const sections = normalizedText.split(/\n\n+/);
  
  let currentQuestion = null;
  let currentAnswer = null;
  let currentSection = 'general';
  
  for (const section of sections) {
    const lines = section.split('\n').map(l => l.trim()).filter(l => l);
    
    for (const line of lines) {
      // Detect section headers (all caps or starts with #)
      if (line === line.toUpperCase() && line.length > 3 && line.length < 50) {
        currentSection = line.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        continue;
      }
      
      // Match Q: or Question: format
      const questionMatch = line.match(/^(?:Q|Question|❓):\s*(.+)$/i);
      if (questionMatch) {
        // Save previous pair if exists
        if (currentQuestion && currentAnswer) {
          pairs.push({
            question: currentQuestion,
            answer: currentAnswer,
            section: currentSection
          });
        }
        currentQuestion = questionMatch[1].trim();
        currentAnswer = null;
        continue;
      }
      
      // Match A: or Answer: format
      const answerMatch = line.match(/^(?:A|Answer|✅):\s*(.+)$/i);
      if (answerMatch && currentQuestion) {
        currentAnswer = answerMatch[1].trim();
        pairs.push({
          question: currentQuestion,
          answer: currentAnswer,
          section: currentSection
        });
        currentQuestion = null;
        currentAnswer = null;
        continue;
      }
      
      // Accumulate multi-line answers
      if (currentQuestion && !currentAnswer) {
        // Check if this line starts a new answer (not Q: format)
        if (!line.match(/^(?:Q|Question):/i)) {
          currentAnswer = (currentAnswer || '') + ' ' + line;
        }
      } else if (currentAnswer) {
        // Continue multi-line answer
        if (!line.match(/^(?:Q|Question|A|Answer):/i)) {
          currentAnswer += ' ' + line;
        }
      }
    }
  }
  
  // Save final pair
  if (currentQuestion && currentAnswer) {
    pairs.push({
      question: currentQuestion,
      answer: currentAnswer,
      section: currentSection
    });
  }
  
  return pairs;
}

/**
 * Deduplicate items by content similarity
 */
function deduplicateItems(items) {
  console.log(`🔍 Deduplicating ${items.length} items...`);
  
  const seen = new Map();
  const deduplicated = [];
  
  items.forEach(item => {
    const key = `${item.input.toLowerCase().substring(0, 100)}`;
    
    if (!seen.has(key)) {
      seen.set(key, item);
      deduplicated.push(item);
    } else {
      console.log(`   Skipping duplicate: ${item.id}`);
    }
  });
  
  console.log(`✅ Deduplicated to ${deduplicated.length} items (removed ${items.length - deduplicated.length})`);
  return deduplicated;
}

/**
 * Enrich metadata with computed fields
 */
function enrichMetadata(items) {
  console.log(`📊 Enriching metadata for ${items.length} items...`);
  
  items.forEach(item => {
    item.metadata.input_word_count = item.input.split(/\s+/).length;
    item.metadata.output_word_count = item.expected_output.split(/\s+/).length;
    item.metadata.input_char_count = item.input.length;
    item.metadata.output_char_count = item.expected_output.length;
    
    // Simple complexity score (0-100)
    const avgWordLength = item.expected_output.split(/\s+/).reduce((sum, word) => sum + word.length, 0) / item.metadata.output_word_count;
    const sentenceCount = item.expected_output.split(/[.!?]+/).length;
    item.metadata.complexity_score = Math.min(100, Math.round((avgWordLength * 5) + (sentenceCount * 2)));
  });
  
  console.log(`✅ Metadata enrichment complete`);
  return items;
}

/**
 * Filter low-quality items
 */
function filterQuality(items) {
  console.log(`🎯 Filtering ${items.length} items for quality...`);
  
  const filtered = items.filter(item => {
    const inputLen = item.input.length;
    const outputLen = item.expected_output.length;
    
    if (inputLen < 5) {
      console.log(`   Rejected (short input): ${item.id}`);
      return false;
    }
    
    if (outputLen < 20) {
      console.log(`   Rejected (short output): ${item.id}`);
      return false;
    }
    
    if (item.expected_output === item.expected_output.toUpperCase()) {
      console.log(`   Rejected (all caps): ${item.id}`);
      return false;
    }
    
    return true;
  });
  
  console.log(`✅ Quality filter passed ${filtered.length} items (rejected ${items.length - filtered.length})`);
  return filtered;
}

/**
 * Generate Langfuse CSV format
 */
function generateLangfuseCSV(items, outputPath) {
  const rows = items.map(item => item.toLangfuseVariables());
  
  const csvContent = [
    'variables,expected_output,metadata',
    ...rows.map(row => {
      const variables = row.variables.replace(/"/g, '""');
      const expectedOutput = row.expected_output.replace(/"/g, '""');
      const metadata = row.metadata.replace(/"/g, '""');
      return `"${variables}","${expectedOutput}","${metadata}"`;
    })
  ].join('\n');
  
  fs.writeFileSync(outputPath, csvContent, 'utf8');
  console.log(`📝 Wrote Langfuse CSV: ${outputPath}`);
}

/**
 * Generate markdown knowledge base
 */
function generateMarkdown(items, outputPath, title) {
  let markdown = `# ${title}\n\n`;
  markdown += `> **Purpose**: This document contains verified knowledge for Woodland AI agents.\n`;
  markdown += `> **Source**: Built from ${items.length} items\n`;
  markdown += `> **Generated**: ${new Date().toISOString()}\n\n`;
  markdown += `---\n\n`;
  
  // Group by category
  const byCategory = {};
  items.forEach(item => {
    const cat = item.category || 'General';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  });
  
  Object.keys(byCategory).sort().forEach(category => {
    markdown += `## ${category}\n\n`;
    byCategory[category].forEach(item => {
      markdown += item.toMarkdown();
    });
  });
  
  fs.writeFileSync(outputPath, markdown, 'utf8');
  console.log(`📝 Wrote markdown: ${outputPath}`);
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('🚀 Building unified knowledge dataset...\n');
    
    // Parse all sources
    const qaItems = await parseQAData(options.qa);
    const trainingItems = await parseTrainingData(options.training);
    const salesItems = await parseSalesData(options.sales);
    const documentItems = await parseDocxFiles(options.documents);
    
    let allItems = [...qaItems, ...trainingItems, ...salesItems, ...documentItems];
    
    console.log(`\n📊 Total items: ${allItems.length}`);
    console.log(`   - QA: ${qaItems.length}`);
    console.log(`   - Training: ${trainingItems.length}`);
    console.log(`   - Sales: ${salesItems.length}`);
    console.log(`   - Documents: ${documentItems.length}\n`);
    
    // Apply transformations
    if (options.dedupe) {
      allItems = deduplicateItems(allItems);
    }
    
    if (options.enrichMetadata) {
      allItems = enrichMetadata(allItems);
    }
    
    if (options.filterQuality) {
      allItems = filterQuality(allItems);
    }
    
    // Sort by ID for deterministic output (handle undefined IDs)
    allItems.sort((a, b) => {
      const idA = a.id || '';
      const idB = b.id || '';
      return idA.localeCompare(idB);
    });
    
    if (options.dryRun) {
      console.log('\n🔍 DRY RUN - Preview first 3 items:\n');
      allItems.slice(0, 3).forEach(item => {
        console.log(`ID: ${item.id}`);
        console.log(`Source: ${item.source}`);
        console.log(`Category: ${item.category}`);
        console.log(`Input: ${item.input.substring(0, 80)}...`);
        console.log(`Output: ${item.expected_output.substring(0, 80)}...`);
        console.log('---\n');
      });
      console.log('✅ Dry run complete. Use without --dry-run to generate files.');
      return;
    }
    
    // Generate per-source outputs
    console.log('\n📦 Generating output files...\n');
    
    if (qaItems.length > 0) {
      generateLangfuseCSV(
        qaItems,
        path.join(options.output, 'qa/langfuse_dataset_variables.csv')
      );
      generateMarkdown(
        qaItems,
        path.join(options.output, '../markdown/QA_Knowledge_Base.md'),
        'Woodland QA Knowledge Base'
      );
    }
    
    if (trainingItems.length > 0) {
      generateLangfuseCSV(
        trainingItems,
        path.join(options.output, 'training/langfuse_dataset_variables.csv')
      );
      generateMarkdown(
        trainingItems,
        path.join(options.output, '../markdown/Training_Examples.md'),
        'Woodland Training Examples'
      );
    }
    
    if (salesItems.length > 0) {
      generateLangfuseCSV(
        salesItems,
        path.join(options.output, 'sales/langfuse_dataset_variables.csv')
      );
      generateMarkdown(
        salesItems,
        path.join(options.output, '../markdown/Sales_Conversations.md'),
        'Woodland Sales Conversations'
      );
    }
    
    if (documentItems.length > 0) {
      generateLangfuseCSV(
        documentItems,
        path.join(options.output, 'documents/langfuse_dataset_variables.csv')
      );
      generateMarkdown(
        documentItems,
        path.join(options.output, '../markdown/Document_Knowledge.md'),
        'Woodland Document Knowledge'
      );
    }
    
    // Generate unified output
    generateLangfuseCSV(
      allItems,
      path.join(options.output, 'unified/all_knowledge.csv')
    );
    
    generateMarkdown(
      allItems,
      path.join(options.output, '../markdown/All_Knowledge.md'),
      'Woodland Unified Knowledge Base'
    );
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('✅ Build complete!');
    console.log(`   Total items: ${allItems.length}`);
    console.log(`   Output directory: ${options.output}`);
    console.log('='.repeat(60));
    
    console.log('\n📝 Next steps:');
    console.log('   1. Validate: npm run knowledge:validate');
    console.log('   2. Index to RAG: npm run knowledge:index:rag');
    console.log('   3. Index to Azure: npm run knowledge:index:azure\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main();

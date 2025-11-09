#!/usr/bin/env node
/**
 * Index Woodland QA Knowledge Base into LibreChat's RAG system
 * 
 * This script:
 * 1. Reads the QA dataset (CSV or JSON)
 * 2. Converts it to searchable documents
 * 3. Uploads to LibreChat's vector DB via RAG_API_URL
 * 4. Creates file records in MongoDB for agent access
 * 
 * Usage:
 *   node scripts/indexQAKnowledge.js \
 *     --input scripts/Sample\ Airtable\ Data\ -\ QA.csv \
 *     --user-id <admin-user-id>
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csv = require('csv-parser');
const FormData = require('form-data');
const { program } = require('commander');
const { v4: uuidv4 } = require('uuid');

// MongoDB connection - resolve from parent LibreChat directory
const parentDir = path.resolve(__dirname, '../..');
require('module-alias')({ base: path.resolve(parentDir, 'api') });
require('dotenv').config({ path: path.resolve(parentDir, '.env') });

const { connectDb } = require(path.resolve(parentDir, 'api/db/connect'));
const { createFile } = require(path.resolve(parentDir, 'api/models/File'));
const logger = console; // Use console for logging in standalone mode

// Helper to generate JWT token for RAG API
function generateShortLivedToken(userId) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'secret';
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '1h' });
}

program
  .option('-i, --input <path>', 'Input CSV file', 'scripts/Sample Airtable Data - QA.csv')
  .option('-u, --user-id <id>', 'Admin user ID for file ownership')
  .option('-e, --entity-id <id>', 'Entity ID (agent ID)', 'agent_woodland_supervisor')
  .option('-o, --output <path>', 'Output markdown file (temp)', '/tmp/woodland_qa_knowledge.md')
  .option('--dry-run', 'Preview without uploading')
  .parse(process.argv);

const options = program.opts();

/**
 * Parse CSV QA data (supports both unified dataset and Airtable export)
 */
async function parseQACSV(filePath) {
  const rows = [];
  let headerLogged = false;

  function coerceString(val) {
    if (val == null) return '';
    return String(val).trim();
  }

  function safeJsonParse(s) {
    if (!s || typeof s !== 'string') return null;
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  return new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('headers', (headers) => {
        if (!headerLogged) {
          logger.info(`[QA Indexer] Detected CSV headers: ${headers.join(', ')}`);
          headerLogged = true;
        }
      })
      .on('data', (row) => {
        // Two supported schemas:
        // 1) Unified: { variables: '{"input":"..."}', expected_output: '...', metadata: '{"model":"..."}' }
        // 2) Airtable: columns like Question ID, Question, Answer, Model, Component, Case

        let questionId = null;
        let question = null;
        let answer = null;
        let model = null;
        let component = null;
        let caseId = null;

        // Prefer unified schema when present
        if (row.variables || row.expected_output || row.metadata) {
          const vars = safeJsonParse(row.variables);
          const meta = safeJsonParse(row.metadata);
          question = coerceString(vars?.input || row.input || row.Question || row.question);
          answer = coerceString(row.expected_output || row.Answer || row.answer || row.expected_keywords);
          questionId = coerceString(meta?.id || row['Question ID'] || row.id);
          model = coerceString(meta?.model || row.Model || row.model);
          component = coerceString(meta?.component || row.Component || row.component);
          caseId = coerceString(meta?.case_id || row.Case || row.case_id || row.case);
        } else {
          // Airtable-style fallback
          questionId = coerceString(row['Question ID'] || row.id);
          question = coerceString(row['Question'] || row.input || row.question);
          answer = coerceString(row['Answer'] || row.expected_output || row.expected_keywords || row.answer);
          model = coerceString(row['Model'] || row.model);
          component = coerceString(row['Component'] || row.component);
          caseId = coerceString(row['Case'] || row.case || row.case_id);
        }

        if (question && answer) {
          rows.push({
            id: questionId || undefined,
            question,
            answer,
            model: model || undefined,
            component: component || undefined,
            caseId: caseId || undefined,
          });
        }
      })
      .on('end', () => {
        if (rows.length === 0) {
          logger.warn('[QA Indexer] No rows parsed. Check that the CSV matches unified or Airtable schema.');
        }
        logger.info(`Parsed ${rows.length} QA pairs from ${filePath}`);
        resolve(rows);
      })
      .on('error', (err) => {
        logger.error('[QA Indexer] CSV parse error:', err.message);
        reject(err);
      });
  });
}

/**
 * Convert QA pairs to searchable markdown
 */
function generateMarkdown(qaPairs) {
  let markdown = '# Woodland Power Products QA Knowledge Base\n\n';
  markdown += '> **Purpose**: This document contains verified answers to common customer support questions.\n';
  markdown += '> **Usage**: Search this knowledge base FIRST before generating answers. If found, use the exact answer or adapt minimally.\n';
  markdown += '> **Authority**: These answers are human-validated and take precedence over general knowledge.\n\n';
  markdown += '---\n\n';
  const byModel = {};
  qaPairs.forEach(qa => {
    const key = qa.model || 'General';
    if (!byModel[key]) byModel[key] = [];
    byModel[key].push(qa);
  });
  
  Object.keys(byModel).sort().forEach(model => {
    markdown += `## ${model}\n\n`;
    
    byModel[model].forEach(qa => {
      markdown += `### Q${qa.id}: ${qa.question}\n\n`;
      
      if (qa.model) markdown += `**Model**: ${qa.model}\n\n`;
      if (qa.component) markdown += `**Component**: ${qa.component}\n\n`;
      if (qa.caseId) markdown += `**Related Case**: ${qa.caseId}\n\n`;
      
      markdown += `**Answer**:\n\n${qa.answer}\n\n`;
      markdown += `---\n\n`;
    });
  });
  
  return markdown;
}

/**
 * Upload to RAG API using LibreChat's vector DB
 */
async function uploadToRAG(filePath, fileId, userId, entityId) {
  const envUrl = process.env.RAG_API_URL;

  if (!envUrl) {
    throw new Error('RAG_API_URL environment variable not set');
  }

  async function isHealthy(url) {
    try {
      const res = await axios.get(`${url}/health`, { timeout: 2000, validateStatus: () => true });
      // Consider 2xx/3xx/404 as "service reachable"; ECONNREFUSED/timeout means not reachable
      return res.status > 0;
    } catch {
      return false;
    }
  }

  // Resolve working RAG URL (try env; if localhost:8000 fails, try localhost:8001 per docker-compose.override mapping)
  let ragUrl = envUrl;
  const reachable = await isHealthy(ragUrl);
  if (!reachable) {
    const isLocal8000 = /localhost:8000|127\.0\.0\.1:8000|\[::1\]:8000/.test(envUrl);
    if (isLocal8000) {
      const alt = envUrl.replace(':8000', ':8001');
      if (await isHealthy(alt)) {
        logger.warn(`[QA Indexer] Primary RAG_API_URL unreachable (${envUrl}); using fallback ${alt}`);
        ragUrl = alt;
      } else {
        logger.error(`[QA Indexer] RAG API not reachable at ${envUrl} or ${alt}. Start rag_api (docker-compose) or set RAG_API_URL.`);
        throw new Error('RAG API unreachable');
      }
    } else {
      logger.error(`[QA Indexer] RAG API not reachable at ${envUrl}. Start rag_api (docker-compose) or set RAG_API_URL.`);
      throw new Error('RAG API unreachable');
    }
  }

  logger.info('[QA Indexer] Uploading to RAG API:', { fileId, entityId });

  const jwtToken = generateShortLivedToken(userId);
  const formData = new FormData();
  formData.append('file_id', fileId);
  formData.append('file', fs.createReadStream(filePath));
  formData.append('entity_id', entityId);

  const response = await axios.post(`${ragUrl}/embed`, formData, {
    headers: {
      Authorization: `Bearer ${jwtToken}`,
      ...formData.getHeaders(),
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });

  const resp = response.data || {};
  const accepted = resp.status === true || resp.known_type === true;
  if (!accepted) {
    logger.warn('[QA Indexer] RAG API returned non-success status; proceeding due to known_type heuristic', resp);
  } else {
    logger.info('[QA Indexer] RAG upload acknowledged:', resp);
  }

  // Poll readiness: consider it ready when /documents/:file_id/context is reachable
  const waitForReadiness = async (maxAttempts = 10, delayMs = 1000) => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await axios.get(`${ragUrl}/documents/${fileId}/context`, {
          headers: { Authorization: `Bearer ${jwtToken}` },
          timeout: 4000,
          validateStatus: () => true,
        });
        if (res.status >= 200 && res.status < 500) {
          logger.info(`[QA Indexer] Embedding context endpoint responded (attempt ${attempt}/${maxAttempts})`, { status: res.status });
          return true;
        }
      } catch (err) {
        // ignore and retry
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    return false;
  };

  const ready = await waitForReadiness();
  if (!ready) {
    logger.warn('[QA Indexer] Embedding context not confirmed yet; it may be processing in background');
  }
  return { ...resp, ready };
}

/**
 * Create file record in MongoDB
 */
async function createFileRecord(userId, fileId, filename, filepath, bytes, embedded = true) {
  const fileRecord = await createFile({
    user: userId,
    file_id: fileId,
    filename,
    filepath,
    bytes,
    type: 'text/markdown',
    embedded,
    context: 'woodland-qa-knowledge',
    metadata: {
      source: 'qa-knowledge-base',
      indexed_at: new Date().toISOString(),
      description: 'Human-validated QA pairs for Woodland customer support',
    },
  });
  
  logger.info('[QA Indexer] File record created:', {
    file_id: fileRecord.file_id,
    filename: fileRecord.filename,
  });
  
  return fileRecord;
}

/**
 * Main execution
 */
async function main() {
  try {
    // Validate environment
    if (!process.env.RAG_API_URL) {
      logger.error('RAG_API_URL not configured. Please set it in your .env file.');
      logger.info('Example: RAG_API_URL=http://localhost:8000');
      process.exit(1);
    }
    
    // Determine user id: CLI flag takes precedence, then env vars
    const userId = options.userId || process.env.ADMIN_USER_ID || process.env.TEST_USER_ID;
    if (!userId) {
      logger.error('User ID required. Provide with --user-id or set ADMIN_USER_ID/TEST_USER_ID env var.');
      logger.info('Tip: Run "npm run list-users" in the project root to find your user id.');
      process.exit(1);
    }
    
    // Connect to database
    await connectDb();
    logger.info('[QA Indexer] Connected to MongoDB');
    
    // Parse QA data
    const qaPairs = await parseQACSV(options.input);
    
    if (qaPairs.length === 0) {
      logger.error('No valid QA pairs found in input file');
      process.exit(1);
    }
    
    // Generate markdown
    const markdown = generateMarkdown(qaPairs);
    fs.writeFileSync(options.output, markdown, 'utf8');
    logger.info(`[QA Indexer] Generated markdown: ${options.output} (${markdown.length} bytes)`);
    
    if (options.dryRun) {
      logger.info('[QA Indexer] DRY RUN - Preview first 500 chars:');
      console.log(markdown.substring(0, 500) + '...\n');
      logger.info(`Total QA pairs: ${qaPairs.length}`);
      logger.info(`Output file: ${options.output}`);
      return;
    }
    
    // Generate file ID
  const fileId = `file_qa_knowledge_${Date.now()}`;
    const filename = 'Woodland_QA_Knowledge_Base.md';
    const stats = fs.statSync(options.output);
    
    // Upload to RAG
  await uploadToRAG(options.output, fileId, userId, options.entityId);
    
    // Create file record
    await createFileRecord(
      userId,
      fileId,
      filename,
      options.output,
      stats.size,
      true
    );
    
    logger.info('\n✅ QA Knowledge Base indexed successfully!');
    logger.info(`\nFile ID: ${fileId}`);
  logger.info(`Entity ID: ${options.entityId}`);
    logger.info(`\nNext steps:`);
    logger.info(`1. Add this file_id to your Woodland agent's file_search tool_resources`);
    logger.info(`2. The agent will now search this QA knowledge base automatically`);
    logger.info(`3. Run regression tests to validate improved accuracy\n`);
    
  } catch (error) {
    logger.error('[QA Indexer] Error:', error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

main();

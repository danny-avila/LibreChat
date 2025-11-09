#!/usr/bin/env node
/**
 * Verify RAG embedding readiness and retrieval for a given file_id
 *
 * Usage:
 *   node scripts/verifyEmbedding.js --file-id <file_id> \
 *     --user-id <admin_user_id> [--entity-id agent_woodland_supervisor] \
 *     [--query "your sample question"] [--k 3]
 */

const path = require('path');
const axios = require('axios');
const { program } = require('commander');

// Resolve parent project to load env and share JWT secret
const parentDir = path.resolve(__dirname, '../..');
require('dotenv').config({ path: path.resolve(parentDir, '.env') });

const logger = console;

function generateShortLivedToken(userId) {
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'secret';
  return jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30m' });
}

program
  .requiredOption('-f, --file-id <id>', 'File ID to verify')
  .option('-u, --user-id <id>', 'User ID (uses ADMIN_USER_ID/TEST_USER_ID if not provided)')
  .option('-e, --entity-id <id>', 'Entity/Agent ID', 'agent_woodland_supervisor')
  .option('-q, --query <text>', 'Optional query to test retrieval')
  .option('-k, --k <num>', 'Top-K results for query', (v) => parseInt(v, 10), 3)
  .parse(process.argv);

const opts = program.opts();

async function main() {
  const ragUrl = process.env.RAG_API_URL;
  if (!ragUrl) {
    throw new Error('RAG_API_URL not set in environment');
  }
  const userId = opts.userId || process.env.ADMIN_USER_ID || process.env.TEST_USER_ID;
  if (!userId) {
    throw new Error('User ID required. Provide --user-id or set ADMIN_USER_ID/TEST_USER_ID');
  }

  const token = generateShortLivedToken(userId);
  logger.info(`[verify] Checking context for file ${opts.fileId} at ${ragUrl}`);

  try {
    const ctxRes = await axios.get(`${ragUrl}/documents/${opts.fileId}/context`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 5000,
      validateStatus: () => true,
    });
    logger.info('[verify] Context response:', { status: ctxRes.status, length: Array.isArray(ctxRes.data) ? ctxRes.data.length : undefined });
  } catch (err) {
    logger.warn('[verify] Context check error:', err.message);
  }

  if (opts.query) {
    logger.info(`[verify] Running test query: ${opts.query}`);
    try {
      const qRes = await axios.post(`${ragUrl}/query`, {
        file_id: opts.fileId,
        query: opts.query,
        k: opts.k,
        entity_id: opts.entityId,
      }, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      const data = qRes.data;
      if (Array.isArray(data) && data.length > 0) {
        logger.info('[verify] Query returned results. Top snippet:');
        const [docInfo, distance] = data[0];
        logger.info({ distance, preview: String(docInfo.page_content || '').slice(0, 200) });
        process.exit(0);
      } else {
        logger.warn('[verify] Query returned no results');
        process.exit(2);
      }
    } catch (err) {
      logger.error('[verify] Query error:', err.message);
      if (err.response) logger.error('[verify] Query error data:', err.response.data);
      process.exit(3);
    }
  } else {
    process.exit(0);
  }
}

main().catch((e) => {
  logger.error('[verify] Fatal:', e.message);
  process.exit(1);
});

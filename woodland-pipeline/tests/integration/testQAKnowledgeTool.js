#!/usr/bin/env node
/**
 * Minimal integration test for woodland-qa-knowledge tool.
 * Assumes LibreChat API server is running and WOODLAND_QA_ENABLED=true.
 * It will instantiate the Woodland agent (functions) and call the QA tool directly.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const parentDir = path.resolve(__dirname, '../../..');
require('module-alias')({ base: path.resolve(parentDir, 'api') });

const createWoodlandFunctionsAgent = require(path.resolve(parentDir, 'api/app/clients/agents/Woodland/createWoodlandFunctionsAgent'));

async function run() {
  const userId = process.env.ADMIN_USER_ID || process.env.TEST_USER_ID;
  if (!userId) {
    console.error('[qa-tool-test] Missing ADMIN_USER_ID/TEST_USER_ID');
    process.exit(1);
  }

  process.env.WOODLAND_QA_ENABLED = process.env.WOODLAND_QA_ENABLED || 'true';
  const qaFileId = process.env.WOODLAND_QA_FILE_ID;
  if (!qaFileId) {
    console.warn('[qa-tool-test] WOODLAND_QA_FILE_ID not set; test will run in fallback agent-files mode if files exist');
  }

  const agent = await createWoodlandFunctionsAgent(
    { model: { name: 'gpt-4o-mini' }, pastMessages: [], user_id: userId },
    { agentName: 'agent_woodland_supervisor', instructions: 'Test QA tool', allowedTools: [], citationWhitelist: [] }
  );

  const qaTool = agent?.tools?.find?.(t => t.name === 'woodland-qa-knowledge');
  if (!qaTool) {
    console.error('[qa-tool-test] woodland-qa-knowledge tool not found on agent');
    process.exit(2);
  }

  const sampleQuery = 'How often should I change the oil?';
  console.log('[qa-tool-test] Querying:', sampleQuery);
  const result = await qaTool.call({ query: sampleQuery, k: 2 });
  if (typeof result !== 'string' || !/Answer/i.test(result)) {
    console.error('[qa-tool-test] Unexpected result format:', result);
    process.exit(3);
  }
  console.log('[qa-tool-test] SUCCESS. Snippet:\n', result.slice(0, 500));
  process.exit(0);
}

run().catch((e) => {
  console.error('[qa-tool-test] Fatal error:', e); 
  process.exit(10);
});

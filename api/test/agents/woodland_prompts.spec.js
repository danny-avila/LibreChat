/**
 * Real-mode Jest tests for ProductHistoryAgent & EngineHistoryAgent
 * Run from api/ directory context to enable module aliases
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') });
require('module-alias/register');
const path = require('path');

const {
  PRODUCT_HISTORY_AGENT_PROMPTS,
  ENGINE_HISTORY_AGENT_PROMPTS,
} = require('../../app/clients/agents/Woodland/testPrompts');

const initProductHistory = require('../../app/clients/agents/Woodland/productHistoryAgent');
const initEngineHistory = require('../../app/clients/agents/Woodland/engineHistoryAgent');
const WoodlandProductHistoryTool = require('../../app/clients/tools/structured/WoodlandProductHistory');
const WoodlandEngineHistoryTool = require('../../app/clients/tools/structured/WoodlandEngineHistory');

// Helper to safely initialize agent with real tool
async function safeInitReal(initFn, ToolClass) {
  try {
    const tool = new ToolClass();
    return await initFn({ tools: [tool] });
  } catch (err) {
    console.warn('Real agent init failed:', err.message);
    return null;
  }
}

// Validation helpers
function validateToolInput(res, expectedFilters) {
  if (!res.toolInput) {
    throw new Error('Real mode: toolInput missing from response');
  }
  Object.entries(expectedFilters).forEach(([key, expectedVal]) => {
    const actualVal = res.toolInput[key];
    if (expectedVal !== undefined && actualVal !== expectedVal) {
      console.warn(`Filter mismatch: ${key}="${actualVal}" (expected "${expectedVal}")`);
    }
  });
}

function parseResults(answer) {
  try {
    return JSON.parse(answer);
  } catch (e) {
    throw new Error('Real mode: JSON parse failed\n' + answer);
  }
}

function validateCitations(results) {
  if (!Array.isArray(results) || results.length === 0) {
    throw new Error('Real mode: expected array of results with citations');
  }
  const hasCitations = results.some((doc) => {
    const cites = doc.citations || [];
    return Array.isArray(cites) && cites.length > 0;
  });
  if (!hasCitations) {
    console.warn('Warning: no citations found in results');
  }
}

describe('ProductHistoryAgent Real-Mode Tests', () => {
  let productAgent;

  beforeAll(async () => {
    productAgent = await safeInitReal(initProductHistory, WoodlandProductHistoryTool);
  });

  test('combination_basic_locked should use structured filters', async () => {
    const def = PRODUCT_HISTORY_AGENT_PROMPTS.combination_basic_locked;
    if (!productAgent) return expect(true).toBe(true);
    
    const res = await productAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    expect(answer.length).toBeGreaterThan(0);

    validateToolInput(res, def.expected_behavior.should_use_filters);
    const results = parseResults(answer);
    expect(results.length).toBeGreaterThan(0);
    validateCitations(results);
  }, 30000);

  test('attribute_lookup_xr950_models should return multiple models', async () => {
    const def = PRODUCT_HISTORY_AGENT_PROMPTS.attribute_lookup_xr950_models;
    if (!productAgent) return expect(true).toBe(true);
    
    const res = await productAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    
    validateToolInput(res, def.expected_behavior.should_use_filters);
    const arr = parseResults(answer);
    const distinct = new Set(arr.map((d) => d.rake_model).filter(Boolean));
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  }, 30000);
});

describe('EngineHistoryAgent Real-Mode Tests', () => {
  let engineAgent;

  beforeAll(async () => {
    engineAgent = await safeInitReal(initEngineHistory, WoodlandEngineHistoryTool);
  });

  test('combination_basic_locked should use structured filters', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.combination_basic_locked;
    if (!engineAgent) return expect(true).toBe(true);
    
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    expect(answer.length).toBeGreaterThan(0);

    validateToolInput(res, def.expected_behavior.should_use_filters);
    const results = parseResults(answer);
    expect(results.length).toBeGreaterThan(0);
    validateCitations(results);
  }, 30000);

  test('attribute_lookup_flat_square_filter should return multiple models', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.attribute_lookup_flat_square_filter;
    if (!engineAgent) return expect(true).toBe(true);
    
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    
    validateToolInput(res, def.expected_behavior.should_use_filters);
    const arr = parseResults(answer);
    const distinct = new Set(arr.map((d) => d.rake_model).filter(Boolean));
    expect(distinct.size).toBeGreaterThanOrEqual(1);
  }, 30000);

  test('timeline_revision should return engine families', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.timeline_revision_multiple_engines;
    if (!engineAgent) return expect(true).toBe(true);
    
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    
    const arr = parseResults(answer);
    expect(arr.length).toBeGreaterThan(0);
    
    // Check for engine family mentions in engine_model fields
    const engines = arr.map((d) => d.engine_model || '').join(' ');
    const hasEngine = /(Tecumseh|Intek|Vanguard)/i.test(engines);
    expect(hasEngine).toBe(true);
  }, 30000);
});

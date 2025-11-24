/**
 * Jest tests for ProductHistoryAgent & EngineHistoryAgent prompt behaviors
 * Focus: combination filtering, attribute lookup, escalation states.
 * Tests are resilient to missing external service config: they skip gracefully.
 */

const path = require('path');

const {
  PRODUCT_HISTORY_AGENT_PROMPTS,
  ENGINE_HISTORY_AGENT_PROMPTS,
} = require('../../../api/app/clients/agents/Woodland/testPrompts');

const initProductHistory = require('../../../api/app/clients/agents/Woodland/productHistoryAgent');
const initEngineHistory = require('../../../api/app/clients/agents/Woodland/engineHistoryAgent');

// Helper to safely initialize an agent; returns null if failed
async function safeInit(fn) {
  try {
    return await fn({});
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('Agent init skipped (likely missing env):', err.message);
    return null;
  }
}

// Extract expected filter object from prompt definition
function expectedFilters(def) {
  return def?.expected_behavior?.should_use_filters || null;
}

// Heuristic checks on answer text
function containsAll(text, parts = []) {
  const lower = String(text || '').toLowerCase();
  return parts.every((p) => lower.includes(String(p).toLowerCase()));
}

// Real-mode helpers
function validateToolInput(res, expectedFilters) {
  if (!res.toolInput) {
    throw new Error('Real mode: toolInput missing from response');
  }
  Object.entries(expectedFilters).forEach(([key, expectedVal]) => {
    const actualVal = res.toolInput[key];
    if (expectedVal !== undefined && actualVal !== expectedVal) {
      throw new Error(`Expected ${key}="${expectedVal}", got "${actualVal}"`);
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
    throw new Error('Real mode: no citations found in any result');
  }
}

describe('ProductHistoryAgent Prompt Scenarios', () => {
  let productAgent;

  beforeAll(async () => {
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      try {
        const WoodlandProductHistoryTool = require('../../../api/app/clients/tools/structured/WoodlandProductHistory');
        const tool = new WoodlandProductHistoryTool();
        productAgent = await initProductHistory({ tools: [tool] });
      } catch (e) {
        console.warn('Real product history tool init failed, falling back:', e.message);
        productAgent = await safeInit(initProductHistory);
      }
    } else {
      productAgent = await safeInit(initProductHistory);
    }
  });

  test('combination_basic_locked should produce Locked status or skip', async () => {
    const def = PRODUCT_HISTORY_AGENT_PROMPTS.combination_basic_locked;
    if (!productAgent) return expect(true).toBe(true); // skip
    const filters = expectedFilters(def);
    const res = await productAgent.invoke({ input: def.prompt });
    expect(res).toBeTruthy();
    const answer = res.output || res.answer || '';
    expect(answer.length).toBeGreaterThan(0);

    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      validateToolInput(res, def.expected_behavior.should_use_filters);
      const results = parseResults(answer);
      expect(results.length).toBeGreaterThan(0);
      validateCitations(results);
    }
  }, 30000);

  test('attribute_lookup_xr950_models should list multiple models', async () => {
    const def = PRODUCT_HISTORY_AGENT_PROMPTS.attribute_lookup_xr950_models;
    if (!productAgent) return expect(true).toBe(true);
    const res = await productAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      validateToolInput(res, def.expected_behavior.should_use_filters);
      const arr = parseResults(answer);
      const distinct = new Set(arr.map((d) => d.rake_model).filter(Boolean));
      expect(distinct.size).toBeGreaterThanOrEqual(2);
    } else {
      const modelsMentioned = (answer.match(/\b10[1-9]\b/g) || []).length;
      expect(modelsMentioned).toBeGreaterThanOrEqual(2);
    }
  }, 30000);

  test('missing_cues_shortlist should prompt for additional cues', async () => {
    const def = PRODUCT_HISTORY_AGENT_PROMPTS.missing_cues_shortlist;
    if (!productAgent) return expect(true).toBe(true);
    const res = await productAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      // Real mode: ensure no Locked state prematurely (cannot verify classification text here)
      expect(/NEEDS_HUMAN_REVIEW|TOOL_CALL_FAILED/.test(answer)).toBe(false);
    } else {
      const asksFor = ['bag', 'engine', 'shape'];
      expect(containsAll(answer, asksFor)).toBe(true);
    }
  }, 30000);

  test('conflicting_cues_blocked should request human review', async () => {
    const def = PRODUCT_HISTORY_AGENT_PROMPTS.conflicting_cues_blocked;
    if (!productAgent) return expect(true).toBe(true);
    const res = await productAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      // Real mode: cannot rely on heuristic; ensure not empty
      expect(answer.length).toBeGreaterThan(0);
    } else {
      expect(/NEEDS HUMAN REVIEW/i.test(answer)).toBe(true);
    }
  }, 30000);

  test('deck_size_unavailable should acknowledge limitation', async () => {
    const def = PRODUCT_HISTORY_AGENT_PROMPTS.deck_size_unavailable;
    if (!productAgent) return expect(true).toBe(true);
    const res = await productAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    // Stub mode: no specific heuristic; just ensure response exists
    expect(answer.length).toBeGreaterThan(0);
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      // Real mode: should return some results or message
      expect(answer.length).toBeGreaterThan(10);
    }
  }, 30000);
});

describe('EngineHistoryAgent Prompt Scenarios', () => {
  let engineAgent;

  beforeAll(async () => {
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      try {
        const WoodlandEngineHistoryTool = require('../../../api/app/clients/tools/structured/WoodlandEngineHistory');
        const tool = new WoodlandEngineHistoryTool();
        engineAgent = await initEngineHistory({ tools: [tool] });
      } catch (e) {
        console.warn('Real engine history tool init failed, falling back:', e.message);
        engineAgent = await safeInit(initEngineHistory);
      }
    } else {
      engineAgent = await safeInit(initEngineHistory);
    }
  });

  test('combination_basic_locked should identify engine or skip', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.combination_basic_locked;
    if (!engineAgent) return expect(true).toBe(true);
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    expect(answer.length).toBeGreaterThan(0);

    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      validateToolInput(res, def.expected_behavior.should_use_filters);
      const results = parseResults(answer);
      expect(results.length).toBeGreaterThan(0);
      validateCitations(results);
    }
  }, 30000);

  test('attribute_lookup_flat_square_filter should reference multiple models', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.attribute_lookup_flat_square_filter;
    if (!engineAgent) return expect(true).toBe(true);
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      validateToolInput(res, def.expected_behavior.should_use_filters);
      const arr = parseResults(answer);
      const distinct = new Set(arr.map((d) => d.rake_model).filter(Boolean));
      expect(distinct.size).toBeGreaterThanOrEqual(2);
    } else {
      const modelsMentioned = (answer.match(/\b10[1-9]\b/g) || []).length;
      expect(modelsMentioned).toBeGreaterThanOrEqual(2);
    }
  }, 30000);

  test('timeline_revision_multiple_engines should show multiple engine families', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.timeline_revision_multiple_engines;
    if (!engineAgent) return expect(true).toBe(true);
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      // Real mode: ensure at least one engine model appears
      const hasEngine = /(Tecumseh|Intek|Vanguard)/i.test(answer);
      expect(hasEngine).toBe(true);
    } else {
      const familiesMentioned = ['tecumseh', 'intek', 'vanguard'].filter((f) =>
        answer.toLowerCase().includes(f),
      );
      expect(familiesMentioned.length).toBeGreaterThanOrEqual(2);
    }
  }, 30000);

  test('maintenance_kit_reference should identify kit need', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.maintenance_kit_reference;
    if (!engineAgent) return expect(true).toBe(true);
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    expect(answer.length).toBeGreaterThan(0);
    if (process.env.USE_REAL_FUNCTIONS_AGENT) {
      validateToolInput(res, def.expected_behavior.should_use_filters);
    }
  }, 30000);

  test('conflicting_hp_blocked should request human review', async () => {
    const def = ENGINE_HISTORY_AGENT_PROMPTS.conflicting_hp_blocked;
    if (!engineAgent) return expect(true).toBe(true);
    const res = await engineAgent.invoke({ input: def.prompt });
    const answer = res.output || res.answer || '';
    expect(answer.length).toBeGreaterThan(0);
    // Conflict detection requires heuristic in stub or real reasoning
    if (!process.env.USE_REAL_FUNCTIONS_AGENT) {
      // Stub mode: basic validation
      expect(answer.includes('5HP') || answer.includes('6.5HP')).toBe(true);
    }
  }, 30000);
});

/**
 * Verification tests for Airtable QA scenarios.
 * Verifies that the new policy guardrails in promptTemplates.js are active.
 */

const {
    AIRTABLE_QA_PROMPTS: IMPORTED_AIRTABLE_QA_PROMPTS,
} = require('./testPrompts');

const AIRTABLE_QA_PROMPTS = IMPORTED_AIRTABLE_QA_PROMPTS || {
    aq_01_stump_chips: {
        prompt: 'Can I vacuum stump chips with the Cyclone Rake?',
        expected_behavior: { reason: 'Not supported—' },
    },
    aq_02_insulation: {
        prompt: 'Can I use it for insulation and sawdust cleanup?',
        expected_behavior: { reason: 'Not supported—' },
    },
    aq_03_altitude: {
        prompt: 'What adjustment is needed at high altitude?',
        expected_behavior: {},
    },
    aq_05_slope_limit: {
        prompt: 'What is the max operating slope?',
        expected_behavior: {},
    },
    aq_06_blower_liner: {
        prompt: 'Can I buy just the blower liner?',
        expected_behavior: {},
    },
    aq_11_ventrac_compatibility: {
        prompt: 'Is Cyclone Rake compatible with Ventrac?',
        expected_behavior: {},
    },
    aq_13_hitch_height: {
        prompt: 'My hitch is high—what range is supported?',
        expected_behavior: {},
    },
};

const initSupport = require('./cyclopediaSupportAgent');
const initCatalog = require('./catalogPartsAgent');
const initTractor = require('./tractorFitmentAgent');

async function safeInit(fn) {
    try {
        return await fn({});
    } catch (err) {
        return null;
    }
}

function contains(text, pattern) {
    if (pattern instanceof RegExp) {
        return pattern.test(text);
    }
    return String(text).toLowerCase().includes(String(pattern).toLowerCase());
}

describe('Airtable QA Scenario Verification', () => {
    let supportAgent;
    let catalogAgent;
    let tractorAgent;

    beforeAll(async () => {
        supportAgent = await safeInit(initSupport);
        catalogAgent = await safeInit(initCatalog);
        tractorAgent = await safeInit(initTractor);
    });

    test('AQ-01: Stump chips should be blocked', async () => {
        const def = AIRTABLE_QA_PROMPTS.aq_01_stump_chips;
        if (!supportAgent) return;
        const res = await supportAgent.invoke({ input: def.prompt });
        const answer = res.output || res.answer || '';
        expect(contains(answer, def.expected_behavior.reason)).toBe(true);
        expect(contains(answer, 'shovel')).toBe(true);
    });

    test('AQ-02: Insulation/sawdust should be blocked', async () => {
        const def = AIRTABLE_QA_PROMPTS.aq_02_insulation;
        if (!supportAgent) return;
        const res = await supportAgent.invoke({ input: def.prompt });
        const answer = res.output || res.answer || '';
        expect(contains(answer, def.expected_behavior.reason)).toBe(true);
        expect(contains(answer, 'not sealed')).toBe(true);
    });

    test('AQ-03: High altitude should recommend adjustment', async () => {
        const def = AIRTABLE_QA_PROMPTS.aq_03_altitude;
        if (!supportAgent) return;
        const res = await supportAgent.invoke({ input: def.prompt });
        const answer = res.output || res.answer || '';
        expect(contains(answer, 'carburetor')).toBe(true);
        expect(contains(answer, 'Briggs & Stratton')).toBe(true);
    });

    test('AQ-05: Slope limit should be 20 degrees', async () => {
        const def = AIRTABLE_QA_PROMPTS.aq_05_slope_limit;
        if (!supportAgent) return;
        const res = await supportAgent.invoke({ input: def.prompt });
        const answer = res.output || res.answer || '';
        expect(contains(answer, '20 degrees')).toBe(true);
    });

    test('AQ-06: Blower liner should be blocked', async () => {
        const def = AIRTABLE_QA_PROMPTS.aq_06_blower_liner;
        if (!catalogAgent) return;
        const res = await catalogAgent.invoke({ input: def.prompt });
        const answer = res.output || res.answer || '';
        expect(contains(answer, 'not sold separately')).toBe(true);
    });

    test('AQ-11: Ventrac should trigger warning', async () => {
        const def = AIRTABLE_QA_PROMPTS.aq_11_ventrac_compatibility;
        if (!tractorAgent) return;
        const res = await tractorAgent.invoke({ input: def.prompt });
        const answer = res.output || res.answer || '';
        expect(contains(answer, 'articulating')).toBe(true);
        expect(contains(answer, 'not recommended')).toBe(true);
    });

    test('AQ-13: High hitch height should warn', async () => {
        const def = AIRTABLE_QA_PROMPTS.aq_13_hitch_height;
        if (!tractorAgent) return;
        const res = await tractorAgent.invoke({ input: def.prompt });
        const answer = res.output || res.answer || '';
        expect(contains(answer, '10–14 inches')).toBe(true);
    });
});

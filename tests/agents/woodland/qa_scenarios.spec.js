/*
 * qa_scenarios.spec.js
 * Initial heuristic validation of parsed QA scenarios.
 * NOTE: Agent invocation not yet integrated; uses placeholder mocks.
 */

const fs = require('fs');
const path = require('path');
const { buildScenarios, readCsv } = require('../../../scripts/qa/buildWoodlandQAScenarios');
const {
  assertSkuPresence,
  assertHitchRelevance,
  assertTechnicianEscalation,
  assertPolicyDenialTemplate,
} = require('./helpers/assertions');

const SOURCE_CSV = path.resolve(__dirname, '../../../scripts/Sample Airtable Data - QA.csv');

// Placeholder response mock factory (to be replaced with real agent output harness later)
function createResponseMock(scenario) {
  // For now, mimic a minimal plausible answer containing SKUs if present.
  const skuPart = scenario.skus.length ? `SKUs: ${scenario.skus.join(', ')}` : '';
  const escalationPart = scenario.expected.should_escalate ? ' Technician assistance required.' : '';
  const policyPart = scenario.flags.policy_denial_intent
    ? ' Not supported—this request conflicts with Woodland policy.'
    : '';
  return {
    answer: `${skuPart}${escalationPart}${policyPart}`.trim(),
  };
}

describe('Woodland QA Scenario Heuristic Classification', () => {
  let scenarios;

  beforeAll(() => {
    const rows = readCsv(SOURCE_CSV);
    scenarios = buildScenarios(rows);
  });

  test('Parsed scenarios collection exists', () => {
    expect(Array.isArray(scenarios)).toBe(true);
    expect(scenarios.length).toBeGreaterThan(50); // Expect large dataset
  });

  test('Each scenario has minimum required fields', () => {
    for (const s of scenarios) {
      expect(s.id).toBeTruthy();
      expect(typeof s.question).toBe('string');
      expect(s.expected).toBeTruthy();
      expect(s.flags).toBeTruthy();
    }
  });

  test('Critical part scenarios flagged', () => {
    const critical = scenarios.filter((s) => s.flags.critical_part);
    expect(critical.length).toBeGreaterThan(5);
  });

  test('Technician-only scenarios escalate', () => {
    const tech = scenarios.filter((s) => s.flags.technician_only);
    for (const s of tech) {
      expect(s.expected.should_escalate).toBe(true);
    }
  });

  test('Hitch relevance classification consistency', () => {
    const hitchRelevant = scenarios.filter((s) => s.flags.hitch_relevant);
    const hitchAgnostic = scenarios.filter((s) => !s.flags.hitch_relevant);
    // Basic sanity: both categories exist
    expect(hitchRelevant.length).toBeGreaterThan(0);
    expect(hitchAgnostic.length).toBeGreaterThan(0);
  });

  test('Policy denial intent scenarios recognized', () => {
    const denial = scenarios.filter((s) => s.flags.policy_denial_intent);
    // Conversion / third-party / honda engine queries should appear
    expect(denial.length).toBeGreaterThan(0);
  });

  test('Sample P0 scenarios pass basic assertions', () => {
    // Select subset: critical parts + technician-only + policy denial
    const subset = scenarios.filter(
      (s) => s.flags.critical_part || s.flags.technician_only || s.flags.policy_denial_intent,
    ).slice(0, 15);
    for (const s of subset) {
      const responseMock = createResponseMock(s);
      // Assertions (placeholders until real agent output wired)
      assertSkuPresence(s, responseMock);
      assertHitchRelevance(s, responseMock);
      assertTechnicianEscalation(s, responseMock);
      assertPolicyDenialTemplate(s, responseMock); // Will be skipped until template present in mock
    }
  });
});

/**
 * Assertion helpers for Woodland QA test scenarios.
 */

function assertSkuPresence(scenario, responseMock) {
  if (!scenario.expected.sku_required) return;
  const skus = scenario.skus || [];
  if (skus.length === 0) {
    throw new Error(`Scenario ${scenario.id} expected SKU presence but none detected in source data.`);
  }
  // Placeholder: In real agent test, inspect response for SKU(s).
  if (!responseMock || !responseMock.answer) return; // skip until integrated
  const missing = skus.filter((sku) => !responseMock.answer.includes(sku));
  if (missing.length) {
    throw new Error(`Scenario ${scenario.id} missing SKUs in answer: ${missing.join(', ')}`);
  }
}

function assertHitchRelevance(scenario, responseMock) {
  if (scenario.flags.hitch_relevant) {
    return; // Hitch relevant parts may ask.
  }
  if (scenario.expected.should_not_ask_hitch && responseMock?.answer) {
    if (/hitch/i.test(responseMock.answer)) {
      throw new Error(`Scenario ${scenario.id} should NOT mention hitch for hitch-agnostic part.`);
    }
  }
}

function assertTechnicianEscalation(scenario, responseMock) {
  if (!scenario.expected.should_escalate) return;
  if (!responseMock) return; // No response yet.
  const text = responseMock.answer || '';
  if (!/(technician|service center|escalation|required|needs human review|human review)/i.test(text)) {
    throw new Error(`Scenario ${scenario.id} expected escalation language for technician-only procedure.`);
  }
}

function assertPolicyDenialTemplate(scenario, responseMock) {
  if (!scenario.flags.policy_denial_intent) return;
  if (!responseMock) return;
  const text = responseMock.answer || '';
  if (!/Not supported—/i.test(text)) {
    throw new Error(`Scenario ${scenario.id} expected policy denial template usage.`);
  }
}

module.exports = {
  assertSkuPresence,
  assertHitchRelevance,
  assertTechnicianEscalation,
  assertPolicyDenialTemplate,
};

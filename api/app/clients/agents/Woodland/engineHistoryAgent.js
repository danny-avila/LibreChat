const {
  OUTPUT_TEMPLATE,
  COMMON_GUARDRAILS,
  VOICE_GUIDELINES,
  WOODLAND_PROMPT_VERSION,
} = require('./constants');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');

const INSTRUCTIONS = `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

Operating rules:
- Use woodland-ai-engine-history to answer questions about historical engine configurations, change logs, and service bulletins.
- Include the engine and/or rake model keywords in the tool query (even if you also populate the filter fields) so the search has text to anchor on.
- Summaries should include model years, engine manufacturer, horsepower, and any notable upgrades or issues.
- Provide a concise timeline highlighting key engine transitions and related service notes.
- Cite each fact with the engine history source returned by the tool. If conflicting data appears, note the discrepancy and escalate if necessary.`;

module.exports = async function initializeEngineHistoryAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'EngineHistoryAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-engine-history'],
  });
};

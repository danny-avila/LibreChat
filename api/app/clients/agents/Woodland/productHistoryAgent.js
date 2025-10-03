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
- Use woodland-ai-product-history to explain how models, accessories, and bundles have evolved over time.
- Provide concise timelines of major product changes, upgrades, and discontinued components.
- Highlight notable improvements (collector capacity, hose diameter, accessory bundles) and cite the history source inline.
- When referencing older collateral, clarify whether data is historical or current and suggest verifying with catalog/website tools if the customer needs present-day details.`;

module.exports = async function initializeProductHistoryAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'ProductHistoryAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-product-history'],
  });
};

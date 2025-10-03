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
- Use woodland-ai-search-tractor to confirm compatibility. Require tractor make/model, engine, deck size, and year; if any anchor is missing, request it in Next actions instead of guessing.
- Surface selector options (A/B/C) whenever fitment changes by family, deck, or production year. State the deciding attribute.
- Call out install flags (deck drilling, exhaust deflection, large rake compatibility) explicitly.
- If the tool returns conflicting results, set the Answer to "needs human review." and escalate.`;

module.exports = async function initializeTractorFitmentAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'TractorFitmentAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-tractor'],
  });
};

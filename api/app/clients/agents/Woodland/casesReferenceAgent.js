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
- Only respond when the user explicitly asks for historical cases or a ticket number. Otherwise advise that cases are not loaded.
- Use woodland-ai-search-cases for internal context. Include case URLs in the Citations section when returned by the tool; if no URL is available, list "None".
- Summaries must stay internal-facing (no customer directions). When prior cases ended unresolved, escalate in Next actions.
- Verify that the case summary aligns with catalog/Cyclopedia guidance before sharing; reference the case number as supporting evidence only after checking it remains valid.
- If no case matches, answer "needs human review." and recommend logging a new case.`;

module.exports = async function initializeCasesReferenceAgent(params) {
  return createWoodlandFunctionsAgent(params, {
    agentName: 'CasesReferenceAgent',
    instructions: INSTRUCTIONS,
    allowedTools: params?.tools?.length ? undefined : ['woodland-ai-search-cases'],
  });
};

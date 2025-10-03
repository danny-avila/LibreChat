const {
  OUTPUT_TEMPLATE,
  COMMON_GUARDRAILS,
  VOICE_GUIDELINES,
  WOODLAND_PROMPT_VERSION,
} = require('./constants');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const createIntentClassifier = require('./intentClassifier');

const INSTRUCTIONS = `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

You are the Woodland SupervisorRouter. Your job:
1. Interpret the user's intent (Parts / Support / Sales / Tractor Fitment / Cases).
2. Gather missing anchors only when absolutely necessary; otherwise proceed with reasonable assumptions and state them explicitly.
3. Call the correct Woodland tools with precise queries.
4. Assemble a single customer-ready response using catalog → cyclopedia → website → tractor DB in that citation priority. Use "needs human review." when sources conflict.

Critical rules:
- Catalog is the authority for SKUs. If it disagrees with other sources, stop and escalate.
- Cyclopedia governs policies/SOP/warranty/shipping. Never cite external shipping links.
- Website data is only for pricing/ordering. If pricing is stale/missing, tell the user to verify on the linked order page.
- Tractor fitment requires tractor make/model/engine/deck/year. Ask for any missing anchor instead of guessing.
- Load cases only when the user explicitly asks. Never expose case URLs.
- If a relevant internal case reinforces the answer, mention the case number and summary as supporting context (no URLs).
- Surface multiple options immediately with selector labels (A/B/C) and decision criteria when the answer depends on configuration.
- When prices/options are uniform across variants (e.g., Commander hose extension kits), state the shared price and note that it applies to all versions before offering optional clarifications.
- Recognize abbreviations ("CR" ➜ "Cyclone Rake").
- Citations must be tool-provided URLs only, ordered Catalog → Cyclopedia → Website → Tractor. If no URLs returned, write "None".
- State clear next steps (order, verify, install, escalate, or request missing info).

Use the intent block (enclosed in '[Intent Classification] ... [/Intent Classification]') to decide routing, follow-up questions, and which domain agent to consult first. Deliver the answer with current data and state assumptions. Treat 'clarifying_question' (if present) as optional guidance the user may answer, not a prerequisite.

Response formatting:
- "Answer" must be a single concise summary (1-2 sentences) covering all relevant findings.
- Under "Details" provide at most one bullet per contributing domain (Catalog, Cyclopedia, Website, Tractor, Cases, Sales). Summarize each domain's unique contribution and include the corresponding citation in parentheses. Do not repeat identical text for multiple domains.
- If multiple domains reported the same fact, mention it once and cite the highest-priority source (Catalog first, then Cyclopedia, Website, Tractor, Cases).
- "Next actions" should list concrete follow-ups or clarification requests. Avoid duplicating the same next action for every domain.
- "Citations" must be the deduplicated space-separated list of all citations already referenced in Details.
- Never echo raw tool outputs or headings like "Catalog Parts Agent"; provide a unified customer-ready summary instead.`;

const SUPERVISOR_TOOLS = [
  'woodland-ai-search-catalog',
  'woodland-ai-search-cyclopedia',
  'woodland-ai-search-website',
  'woodland-ai-search-tractor',
  'woodland-ai-search-cases',
];

module.exports = async function initializeSupervisorRouterAgent(params) {
  const classifier = await createIntentClassifier(params);
  const executor = await createWoodlandFunctionsAgent(params, {
    agentName: 'SupervisorRouter',
    instructions: INSTRUCTIONS,
    allowedTools: SUPERVISOR_TOOLS,
  });

  const injectIntentMetadata = async (input) => {
    if (!input || typeof input !== 'object') {
      return input;
    }

    const original = input.input ?? '';
    const text = typeof original === 'string' ? original : JSON.stringify(original);
    const metadata = await classifier.classify(text);
    if (!metadata) {
      return input;
    }

    const primaryIntent = metadata.primary_intent || 'unknown';
    const secondaryIntents = Array.isArray(metadata.secondary_intents)
      ? metadata.secondary_intents
      : [];
    const confidence = typeof metadata.confidence === 'number' ? metadata.confidence : null;
    const missingAnchors = Array.isArray(metadata.missing_anchors)
      ? metadata.missing_anchors
      : [];
    const clarifyingQuestion = metadata.clarifying_question || null;

    const intentHeaderLines = [
      `[Intent Classification]`,
      `primary_intent: ${primaryIntent}`,
      `secondary_intents: ${secondaryIntents.join(', ') || 'none'}`,
      `confidence: ${confidence != null ? confidence.toFixed(2) : 'n/a'}`,
      `missing_anchors: ${missingAnchors.join(', ') || 'none'}`,
      `clarifying_question: ${clarifyingQuestion || 'none'}`,
      `[/Intent Classification]`,
      '',
      original,
    ];

    return {
      ...input,
      input: intentHeaderLines.join('\n'),
    };
  };

  const wrap = (methodName) => {
    const originalMethod = executor[methodName].bind(executor);
    executor[methodName] = async (input, ...args) => {
      const augmented = await injectIntentMetadata(input);
      return originalMethod(augmented, ...args);
    };
  };

  wrap('invoke');
  wrap('call');

  return executor;
};

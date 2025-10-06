const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const {
  OUTPUT_TEMPLATE,
  COMMON_GUARDRAILS,
  VOICE_GUIDELINES,
  WOODLAND_PROMPT_VERSION,
} = require('./constants');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const createIntentClassifier = require('./intentClassifier');
const initializeCatalogPartsAgent = require('./catalogPartsAgent');
const initializeCyclopediaSupportAgent = require('./cyclopediaSupportAgent');
const initializeSalesSupportAgent = require('./salesSupportAgent');
const initializeTractorFitmentAgent = require('./tractorFitmentAgent');
const initializeCasesReferenceAgent = require('./casesReferenceAgent');

const DOMAIN_AGENT_CONFIGS = [
  {
    name: 'CatalogPartsAgent',
    description: 'Consult for Woodland catalog SKU, selector, and part lookups.',
    initializer: initializeCatalogPartsAgent,
  },
  {
    name: 'CyclopediaSupportAgent',
    description: 'Consult for policies, SOPs, warranty guidance, and shipping steps.',
    initializer: initializeCyclopediaSupportAgent,
  },
  {
    name: 'SalesSupportAgent',
    description: 'Consult for Commander vs Classic vs Commercial comparisons and upgrade advice.',
    initializer: initializeSalesSupportAgent,
  },
  {
    name: 'TractorFitmentAgent',
    description: 'Consult for tractor compatibility, installation requirements, and missing anchors.',
    initializer: initializeTractorFitmentAgent,
  },
  {
    name: 'CasesReferenceAgent',
    description: 'Consult for internal case summaries when explicitly requested.',
    initializer: initializeCasesReferenceAgent,
  },
];

const DEFAULT_MAX_DOMAIN_TOOLS = 4;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.55;

const DEFAULT_INTENT_TOOL_PRIORITIES = {
  sales: ['SalesSupportAgent', 'CatalogPartsAgent'],
  parts: ['CatalogPartsAgent', 'CyclopediaSupportAgent'],
  support: ['CyclopediaSupportAgent', 'CasesReferenceAgent'],
  tractor_fitment: ['TractorFitmentAgent', 'CatalogPartsAgent'],
  cases: ['CasesReferenceAgent', 'CyclopediaSupportAgent'],
  unknown: ['CatalogPartsAgent', 'CyclopediaSupportAgent', 'SalesSupportAgent'],
};

const KEYWORD_TOOL_RULES = [
  {
    label: 'tractor_compatibility',
    regex: /(compatible|compatibility|fit|fits|deck|tractor|attachment|mount|hitch|clearance)/i,
    tools: ['TractorFitmentAgent', 'CatalogPartsAgent'],
    frontLoad: true,
  },
  {
    label: 'policy_support',
    regex: /(warranty|policy|shipping|return|troubleshoot|sop|install|procedure|steps)/i,
    tools: ['CyclopediaSupportAgent'],
  },
  {
    label: 'pricing_sales',
    regex: /(price|cost|quote|bundle|finance|compare|upgrade|sales)/i,
    tools: ['SalesSupportAgent', 'CatalogPartsAgent'],
  },
  {
    label: 'cases_reference',
    regex: /(case\s?#?\d+|support case|ticket|internal case|knowledge base)/i,
    tools: ['CasesReferenceAgent'],
  },
];

const resolveDomainTools = (
  { primaryIntent, secondaryIntents = [], confidence },
  rawText,
  availableToolNames,
) => {
  const intentToolPriorities = DEFAULT_INTENT_TOOL_PRIORITIES;
  const keywordToolRules = KEYWORD_TOOL_RULES;
  const maxDomainTools = DEFAULT_MAX_DOMAIN_TOOLS;
  const lowConfidenceThreshold = DEFAULT_LOW_CONFIDENCE_THRESHOLD;
  const availableSet = new Set(availableToolNames);
  const selections = [];
  const pushUnique = (name, { front = false } = {}) => {
    if (!availableSet.has(name)) {
      return;
    }
    const idx = selections.indexOf(name);
    if (idx !== -1) {
      if (front && idx !== 0) {
        selections.splice(idx, 1);
        selections.unshift(name);
      }
      return;
    }
    if (front) {
      selections.unshift(name);
    } else {
      selections.push(name);
    }
  };

  const appendIntentTools = (intent) => {
    const candidates = intentToolPriorities[intent] || [];
    candidates.forEach((toolName) => pushUnique(toolName));
  };

  appendIntentTools(primaryIntent || 'unknown');
  secondaryIntents.forEach((intent) => appendIntentTools(intent));

  const text =
    typeof rawText === 'string'
      ? rawText
      : jsonSafeStringify(rawText);

  const matchedRules = [];
  if (text) {
    keywordToolRules.forEach((rule) => {
      if (rule.regex.test(text)) {
        matchedRules.push(rule.label);
        rule.tools.forEach((toolName, index) => {
          pushUnique(toolName, { front: rule.frontLoad && index === 0 });
        });
      }
    });
  }

  const isLowConfidence =
    confidence == null || Number(confidence) < Number(lowConfidenceThreshold || 0);
  if (isLowConfidence) {
    appendIntentTools('unknown');
  }

  if (selections.length === 0) {
    appendIntentTools('unknown');
  }

  const recommended = selections.slice(0, maxDomainTools);

  if (logger?.debug) {
    logger.debug('[SupervisorRouter] Tool selection heuristics', {
      primaryIntent,
      secondaryIntents,
      confidence,
      recommended,
      maxDomainTools,
      lowConfidenceThreshold,
      matchedRules,
    });
  }

  return recommended;
};

const jsonSafeStringify = (value) => {
  try {
    return JSON.stringify(value);
  } catch (_) {
    return '';
  }
};

const INSTRUCTIONS = `Prompt version ${WOODLAND_PROMPT_VERSION}

${OUTPUT_TEMPLATE}

${COMMON_GUARDRAILS}

${VOICE_GUIDELINES}

You are the Woodland SupervisorRouter. Your job:
1. Interpret the user's intent (Parts / Support / Sales / Tractor Fitment / Cases).
2. Gather missing anchors only when absolutely necessary; otherwise proceed with reasonable assumptions and state them explicitly.
3. Call the correct Woodland tools with precise queries.
4. Assemble a single customer-ready response using catalog → cyclopedia → website → tractor DB in that citation priority. Use "needs human review." when sources conflict.

Available domain agents:
- CatalogPartsAgent - authoritative for catalog SKUs, selectors, and pricing snapshots.
- CyclopediaSupportAgent - policies, SOPs, warranty, and shipping rules.
- SalesSupportAgent - comparative recommendations, bundles, and upgrade guidance.
- TractorFitmentAgent - tractor anchors, installation steps, and fitment validation.
- CasesReferenceAgent - internal case summaries when the user explicitly asks.

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
- Activate only the smallest set of domain agents that covers the detected intents; avoid calling every agent by default.

Use the intent block (enclosed in '[Intent Classification] ... [/Intent Classification]') to decide routing, follow-up questions, and which domain agent to consult first. Deliver the answer with current data and state assumptions. Treat 'clarifying_question' (if present) as optional guidance the user may answer, not a prerequisite.

Response formatting:
- "Answer" must be a single concise summary (1-2 sentences) covering all relevant findings.
- Under "Details" provide at most one bullet per contributing domain (Catalog, Cyclopedia, Website, Tractor, Cases, Sales). Summarize each domain's unique contribution and include the corresponding citation in parentheses. Do not repeat identical text for multiple domains.
- If multiple domains reported the same fact, mention it once and cite the highest-priority source (Catalog first, then Cyclopedia, Website, Tractor, Cases).
- "Next actions" should list concrete follow-ups or clarification requests. Avoid duplicating the same next action for every domain.
- "Citations" must be the deduplicated space-separated list of all citations already referenced in Details.
- Never echo raw tool outputs or headings like "Catalog Parts Agent"; provide a unified customer-ready summary instead.`;

module.exports = async function initializeSupervisorRouterAgent(params) {
  const classifier = await createIntentClassifier(params);
  const baseTools = Array.isArray(params?.tools) ? params.tools : [];
  const baseToolNames = baseTools
    .map((tool) => tool?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);

  const domainAgentEntries = DOMAIN_AGENT_CONFIGS.map(({ name, description, initializer }) => {
    let agentPromise;
    const ensureAgent = () => {
      if (!agentPromise) {
        agentPromise = initializer(params);
      }
      return agentPromise;
    };

    const wrappedTool = tool(
      async ({ input }) => {
        const agent = await ensureAgent();
        const payload = typeof input === 'string' ? input : JSON.stringify(input);
        const result = await agent.invoke({ input: payload });
        if (typeof result === 'string') {
          return result;
        }
        if (result && typeof result.output === 'string') {
          return result.output;
        }
        if (result && typeof result.text === 'string') {
          return result.text;
        }
        if (result && typeof result === 'object') {
          const returnValueOutput = result?.returnValues?.output;
          if (typeof returnValueOutput === 'string') {
            return returnValueOutput;
          }
          return JSON.stringify(result);
        }
        return '';
      },
      {
        name,
        description,
        schema: z.object({
          input: z
            .string()
            .min(1)
            .describe('The fully-formed customer request (including any assumptions) to pass to the domain agent'),
        }),
      },
    );

    return { name, tool: wrappedTool };
  });

  const domainAgentTools = domainAgentEntries.map(({ tool: domainTool }) => domainTool);
  const domainToolMap = new Map(domainAgentEntries.map(({ name, tool: domainTool }) => [name, domainTool]));

  const supervisorParams = {
    ...params,
    tools: [...baseTools, ...domainAgentTools],
  };

  const executor = await createWoodlandFunctionsAgent(supervisorParams, {
    agentName: 'SupervisorRouter',
    instructions: INSTRUCTIONS,
    allowedTools: Array.from(
      new Set([
        ...baseToolNames,
        ...domainAgentTools
          .map((domainTool) => domainTool?.name)
          .filter((name) => typeof name === 'string' && name.length > 0),
      ]),
    ),
  });

  const allDomainToolNames = Array.from(domainToolMap.keys());

  const reconcileToolObject = (name) => {
    if (domainToolMap.has(name)) {
      return domainToolMap.get(name);
    }
    return baseTools.find((tool) => tool.name === name);
  };

  const setActiveTools = (toolNames) => {
    const selectedNames = Array.isArray(toolNames) && toolNames.length > 0 ? toolNames : allDomainToolNames;
    const uniqueNames = Array.from(new Set([...baseToolNames, ...selectedNames]));
    const nextTools = uniqueNames.map(reconcileToolObject).filter(Boolean);

    executor.tools = nextTools;

    if (executor.agent) {
      if (typeof executor.agent._allowedTools !== 'undefined') {
        executor.agent._allowedTools = nextTools.map((tool) => tool.name);
      }
      if (Array.isArray(executor.agent.tools)) {
        executor.agent.tools = nextTools;
      }
    }
  };

  setActiveTools(allDomainToolNames);

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
    const recommendedTools = resolveDomainTools(
      { primaryIntent, secondaryIntents, confidence },
      original,
      allDomainToolNames,
    );

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
      intentMetadata: {
        primaryIntent,
        secondaryIntents,
        confidence,
        missingAnchors,
        clarifyingQuestion,
        recommendedTools,
      },
    };
  };

  const wrap = (methodName) => {
    const originalMethod = executor[methodName].bind(executor);
    executor[methodName] = async (input, ...args) => {
      const augmented = await injectIntentMetadata(input);
      const recommended = augmented?.intentMetadata?.recommendedTools;
      if (recommended) {
        setActiveTools(recommended);
      } else {
        setActiveTools(allDomainToolNames);
      }
      let sanitized = augmented;
      if (augmented && typeof augmented === 'object') {
        // Remove helper metadata before handing off to the executor.
        const { intentMetadata: _ignored, ...rest } = augmented;
        sanitized = rest;
      }
      return originalMethod(sanitized, ...args);
    };
  };

  wrap('invoke');
  wrap('call');

  return executor;
};

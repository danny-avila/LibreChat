const { z } = require('zod');
const { tool } = require('@langchain/core/tools');
const { logger } = require('@librechat/data-schemas');
const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const createIntentClassifier = require('./intentClassifier');
const initializeCatalogPartsAgent = require('./catalogPartsAgent');
const initializeCyclopediaSupportAgent = require('./cyclopediaSupportAgent');
const initializeCasesReferenceAgent = require('./casesReferenceAgent');
const initializeWebsiteProductAgent = require('./websiteProductAgent');
const initializeTractorFitmentAgent = require('./tractorFitmentAgent');

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
    name: 'CasesReferenceAgent',
    description: 'Consult for internal case summaries when explicitly requested.',
    initializer: initializeCasesReferenceAgent,
  },
  {
    name: 'WebsiteProductAgent',
    description: 'Consult for woodland.com pricing snapshots, promotions, and ordering guidance.',
    initializer: initializeWebsiteProductAgent,
  },
  {
    name: 'TractorFitmentAgent',
    description: 'Consult for tractor compatibility, installation requirements, and missing anchors.',
    initializer: initializeTractorFitmentAgent,
  },
];

const DEFAULT_MAX_DOMAIN_TOOLS = 4;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.55;

const DEFAULT_INTENT_TOOL_PRIORITIES = {
  sales: ['CatalogPartsAgent', 'WebsiteProductAgent'],
  parts: ['CatalogPartsAgent', 'CyclopediaSupportAgent'],
  support: ['CyclopediaSupportAgent', 'CatalogPartsAgent'],
  tractor_fitment: ['TractorFitmentAgent', 'CatalogPartsAgent'],
  cases: ['CasesReferenceAgent', 'CyclopediaSupportAgent'],
  unknown: ['CatalogPartsAgent', 'CyclopediaSupportAgent', 'WebsiteProductAgent'],
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
    tools: ['WebsiteProductAgent', 'CatalogPartsAgent'],
  },
  {
    label: 'cases_reference',
    regex: /(case\s?#?\d+|support case|ticket|internal case|knowledge base)/i,
    tools: ['CasesReferenceAgent'],
  },
];

const EARLY_EXIT_KEYWORDS = new Map(
  KEYWORD_TOOL_RULES.filter((rule) => rule.tools?.length === 1).map((rule) => [rule.label, rule.tools[0]]),
);

const resolveDomainTools = ({ primaryIntent, secondaryIntents = [], confidence }, rawText, availableToolNames) => {
  const availableSet = new Set(availableToolNames);
  const selections = [];

  const addTool = (name, { front = false } = {}) => {
    if (!availableSet.has(name)) {
      return;
    }
    const idx = selections.indexOf(name);
    if (idx !== -1) {
      if (front && idx > 0) {
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
    const candidates = DEFAULT_INTENT_TOOL_PRIORITIES[intent] || [];
    candidates.forEach((toolName) => addTool(toolName));
  };

  const text = typeof rawText === 'string' ? rawText : JSON.stringify(rawText ?? '');
  if (text) {
    for (const rule of KEYWORD_TOOL_RULES) {
      if (!rule.regex.test(text)) {
        continue;
      }
      if (EARLY_EXIT_KEYWORDS.has(rule.label)) {
        const toolName = EARLY_EXIT_KEYWORDS.get(rule.label);
        if (availableSet.has(toolName)) {
          return [toolName];
        }
      }
      rule.tools.forEach((toolName, index) => addTool(toolName, { front: rule.frontLoad && index === 0 }));
      if (rule.frontLoad && selections.length >= DEFAULT_MAX_DOMAIN_TOOLS) {
        return selections.slice(0, DEFAULT_MAX_DOMAIN_TOOLS);
      }
    }
  }

  appendIntentTools(primaryIntent || 'unknown');
  secondaryIntents.forEach(appendIntentTools);

  const isLowConfidence =
    confidence == null || Number(confidence) < Number(DEFAULT_LOW_CONFIDENCE_THRESHOLD || 0);
  if (isLowConfidence) {
    const fallback = DEFAULT_INTENT_TOOL_PRIORITIES.unknown || [];
    fallback
      .filter((name) => availableSet.has(name))
      .slice(0, 1)
      .forEach((name) => addTool(name, { front: true }));
  }

  if (!selections.length) {
    appendIntentTools('unknown');
  }

  const recommended = selections.slice(0, DEFAULT_MAX_DOMAIN_TOOLS);

  logger?.debug?.('[SupervisorRouter] Tool selection heuristics', {
    primaryIntent,
    secondaryIntents,
    confidence,
    recommended,
  });

  return recommended;
};

const INSTRUCTIONS = promptTemplates.supervisorRouter;

module.exports = async function initializeSupervisorRouterAgent(params) {
  const classifier = await createIntentClassifier(params);
  const baseTools = Array.isArray(params?.tools) ? params.tools : [];
  const baseToolNames = baseTools
    .map((tool) => tool?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);

  const domainAgentEntries = DOMAIN_AGENT_CONFIGS.map(({ name, description, initializer }) => {
    let cachedAgent;
    const ensureAgent = async () => {
      if (!cachedAgent) {
        cachedAgent = await initializer(params);
      }
      return cachedAgent;
    };

    const wrappedTool = tool(
      async ({ input }) => {
        const agent = await ensureAgent();
        const payload = typeof input === 'string' ? input : JSON.stringify(input);
        const result = await agent.invoke({ input: payload });
        if (!result || typeof result === 'string') {
          return result || '';
        }
        const { output, text, returnValues } = result;
        return (
          (typeof output === 'string' && output) ||
          (typeof text === 'string' && text) ||
          (typeof returnValues?.output === 'string' && returnValues.output) ||
          JSON.stringify(result)
        );
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
    const text = typeof original === 'string' ? original : JSON.stringify(original ?? '');
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

    return {
      ...input,
      input: [
        `[Intent Classification]`,
        `primary_intent: ${primaryIntent}`,
        `secondary_intents: ${secondaryIntents.join(', ') || 'none'}`,
        `confidence: ${confidence != null ? confidence.toFixed(2) : 'n/a'}`,
        `missing_anchors: ${missingAnchors.join(', ') || 'none'}`,
        `clarifying_question: ${clarifyingQuestion || 'none'}`,
        `[/Intent Classification]`,
        '',
        original,
      ].join('\n'),
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
      setActiveTools(recommended || allDomainToolNames);
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

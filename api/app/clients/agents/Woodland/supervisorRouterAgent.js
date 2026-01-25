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
const { applyUrlPolicyAsync } = require('../tools/structured/util/urlPolicy');

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
    description:
      'Consult for tractor compatibility, installation requirements, and missing anchors.',
    initializer: initializeTractorFitmentAgent,
  },
];

const DEFAULT_MAX_DOMAIN_TOOLS = 4;
const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.55;
const HARD_BLOCK_THRESHOLD = 0.5;
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const HIGH_CONFIDENCE_TOOL_CAP = 2;

const DEFAULT_INTENT_TOOL_PRIORITIES = {
  sales: ['CatalogPartsAgent', 'WebsiteProductAgent'],
  parts: ['CatalogPartsAgent', 'CyclopediaSupportAgent'],
  support: ['CyclopediaSupportAgent', 'CatalogPartsAgent'],
  tractor_fitment: ['TractorFitmentAgent', 'CatalogPartsAgent'],
  cases: ['CasesReferenceAgent', 'CyclopediaSupportAgent'],
  service: ['CyclopediaSupportAgent'],
  unknown: ['CatalogPartsAgent', 'CyclopediaSupportAgent', 'WebsiteProductAgent'],
};

const KEYWORD_TOOL_RULES = [
  {
    label: 'catalog_sku_attribute',
    regex: /\b(sku|blue\s+diamond|liner|part\s*number|replacement\s*liner)\b/i,
    tools: ['CatalogPartsAgent'],
    frontLoad: true,
  },
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
  {
    label: 'service_locator',
    regex:
      /(service\s+center|nearest\s+dealer|repair\s+shop|zip\s+code|postal\s+code|technician\s+near)/i,
    tools: ['CyclopediaSupportAgent'],
  },
];

const EARLY_EXIT_KEYWORDS = new Map(
  KEYWORD_TOOL_RULES.filter((rule) => rule.tools?.length === 1).map((rule) => [
    rule.label,
    rule.tools[0],
  ]),
);
const PART_NUMBER_REGEX = /\b(part\s*number|sku|replacement\s*part|part\s*#)\b/i;

const resolveDomainTools = (
  { primaryIntent, secondaryIntents = [], confidence },
  rawText,
  availableToolNames,
) => {
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
    if (PART_NUMBER_REGEX.test(text)) {
      addTool('CatalogPartsAgent', { front: true });
      addTool('CasesReferenceAgent');
    }
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
      rule.tools.forEach((toolName, index) =>
        addTool(toolName, { front: rule.frontLoad && index === 0 }),
      );
      if (rule.frontLoad && selections.length >= DEFAULT_MAX_DOMAIN_TOOLS) {
        return selections.slice(0, DEFAULT_MAX_DOMAIN_TOOLS);
      }
    }
  }

  appendIntentTools(primaryIntent || 'unknown');
  secondaryIntents.forEach(appendIntentTools);

  // Low-confidence handling: add fallback domain agents
  const isLowConfidence =
    confidence == null || Number(confidence) < Number(DEFAULT_LOW_CONFIDENCE_THRESHOLD || 0);
  if (isLowConfidence) {
    const fallback = DEFAULT_INTENT_TOOL_PRIORITIES.unknown || [];
    fallback
      .filter((name) => availableSet.has(name))
      .slice(0, 1)
      .forEach((name) => addTool(name, { front: true }));

    logger?.warn?.('[SupervisorRouter] Low confidence classification', {
      primaryIntent,
      confidence,
      text: rawText?.substring(0, 100),
    });
  }

  if (!selections.length) {
    appendIntentTools('unknown');
  }

  // Always add Cases agent at the end for precedent checking
  addTool('CasesReferenceAgent');

  // High confidence: limit to fewer tools; low confidence: allow more exploration
  const maxTools =
    confidence != null && confidence >= HIGH_CONFIDENCE_THRESHOLD
      ? Math.max(1, Math.min(HIGH_CONFIDENCE_TOOL_CAP, DEFAULT_MAX_DOMAIN_TOOLS))
      : DEFAULT_MAX_DOMAIN_TOOLS;

  let recommended = selections.slice(0, maxTools);

  // Ensure Cases agent is always included for validation
  if (!recommended.includes('CasesReferenceAgent') && availableSet.has('CasesReferenceAgent')) {
    if (recommended.length >= maxTools) {
      recommended[recommended.length - 1] = 'CasesReferenceAgent';
    } else {
      recommended.push('CasesReferenceAgent');
    }
  }

  logger?.debug?.('[SupervisorRouter] Tool selection complete', {
    primaryIntent,
    secondaryIntents,
    confidence,
    isLowConfidence,
    maxTools,
    recommended,
  });

  return recommended;
};

const INSTRUCTIONS = promptTemplates.supervisorRouter;

module.exports = async function initializeSupervisorRouterAgent(params) {
  const classifier = await createIntentClassifier(params);
  const cachedIntent = { text: null, metadata: null };
  const baseTools = Array.isArray(params?.tools) ? params.tools : [];
  const baseToolNames = baseTools
    .map((tool) => tool?.name)
    .filter((name) => typeof name === 'string' && name.length > 0);

  // Domain tool call governance state
  const MAX_DOMAIN_CALLS = Number(process.env.WOODLAND_SUPERVISOR_MAX_CALLS || 4);
  const MAX_TOTAL_SYNTHESIS_CHARS = Number(process.env.WOODLAND_SUPERVISOR_MAX_SYNTHESIS_CHARS || 2400);
  let totalDomainCalls = 0;
  const domainCallOutputs = [];
  const calledDomainTools = new Set();
  let synthesisLock = false; // once true, no further domain calls allowed

  const domainAgentEntries = DOMAIN_AGENT_CONFIGS.map(({ name, description, initializer }) => {
    let cachedAgent = null;
    let initializationPromise = null;

    const ensureAgent = async () => {
      if (cachedAgent) {
        return cachedAgent;
      }
      if (!initializationPromise) {
        initializationPromise = initializer(params)
          .then((agentInstance) => {
            cachedAgent = agentInstance;
            return agentInstance;
          })
          .catch((error) => {
            initializationPromise = null;
            throw error;
          });
      }
      return initializationPromise;
    };

    const wrappedTool = tool(
      async ({ input }) => {
        // Hard stop if we've triggered synthesis phase
        if (synthesisLock) {
          return `[tool:${name}] skipped (synthesis phase)`;
        }
        // Enforce one call per domain tool
        if (calledDomainTools.has(name)) {
          return `[tool:${name}] already called; reusing prior result.`;
        }
        // Enforce global cap
        if (totalDomainCalls >= MAX_DOMAIN_CALLS) {
          synthesisLock = true;
          return `[tool:${name}] not called; max domain calls (${MAX_DOMAIN_CALLS}) reached.`;
        }
        const agent = await ensureAgent();
        if (agent?.memory?.clear) {
          try {
            await agent.memory.clear();
          } catch (error) {
            logger?.warn?.('[SupervisorRouter] Failed to clear agent memory', {
              agent: name,
              error: error?.message,
            });
          }
        }
        const payload = typeof input === 'string' ? input : JSON.stringify(input);
        const result = await agent.invoke({ input: payload });
        if (!result || typeof result === 'string') {
          const output = result || '';
          calledDomainTools.add(name);
          totalDomainCalls += 1;
          domainCallOutputs.push({ name, output });
          if (totalDomainCalls >= MAX_DOMAIN_CALLS) {
            synthesisLock = true;
          }
          return output;
        }
        const { output, text, returnValues } = result;
        const resolved =
          (typeof output === 'string' && output) ||
          (typeof text === 'string' && text) ||
          (typeof returnValues?.output === 'string' && returnValues.output) ||
          JSON.stringify(result);
        calledDomainTools.add(name);
        totalDomainCalls += 1;
        domainCallOutputs.push({ name, output: resolved });
        if (totalDomainCalls >= MAX_DOMAIN_CALLS) {
          synthesisLock = true;
        }
        return resolved;
      },
      {
        name,
        description,
        schema: z.object({
          input: z
            .string()
            .min(1)
            .describe(
              'The fully-formed customer request (including any assumptions) to pass to the domain agent',
            ),
        }),
      },
    );

    return { name, tool: wrappedTool, ensureAgent };
  });

  const domainAgentTools = domainAgentEntries.map(({ tool: domainTool }) => domainTool);
  const domainToolMap = new Map(
    domainAgentEntries.map(({ name, tool: domainTool }) => [name, domainTool]),
  );

  const shouldPrewarm =
    String(process.env.WOODLAND_SUPERVISOR_PREWARM ?? 'true').toLowerCase() !== 'false';
  if (shouldPrewarm) {
    setTimeout(() => {
      domainAgentEntries.forEach(({ ensureAgent }) => {
        ensureAgent().catch((error) => {
          logger?.warn?.('[SupervisorRouter] Prewarm failed', { error: error?.message });
        });
      });
    }, 0);
  }

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

  // Wrap executor invoke with URL validation + synthesis enforcement
  const originalInvoke = executor.invoke.bind(executor);
  executor.invoke = async function (input, config) {
    const result = await originalInvoke(input, config);
    // If we've entered synthesisLock, inject a synthesized summary of prior tool outputs
    if (synthesisLock && domainCallOutputs.length > 0 && result && typeof result === 'object') {
      // Deduplicate similar outputs (same normalized first 80 chars)
      const seen = new Set();
      const summaryLines = [];
      for (const d of domainCallOutputs) {
        const head = (d.output || '').slice(0, 80).toLowerCase();
        if (seen.has(head)) continue;
        seen.add(head);
        summaryLines.push(`[${d.name}] ${(d.output || '').slice(0, 400)}`); // cap per-domain output
      }
      // Global synthesis length cap
      let combined = summaryLines.join('\n');
      if (combined.length > MAX_TOTAL_SYNTHESIS_CHARS) {
        combined = combined.slice(0, MAX_TOTAL_SYNTHESIS_CHARS) + '\n...[truncated]';
      }
      const synthesisNote = `\n[Supervisor Synthesis]\nDomain calls: ${totalDomainCalls}/${MAX_DOMAIN_CALLS}\n${combined}\n[End Supervisor Synthesis]\n`;
      if (typeof result.output === 'string') {
        result.output = `${result.output}${synthesisNote}`;
      } else if (typeof result.text === 'string') {
        result.text = `${result.text}${synthesisNote}`;
      } else {
        result.synthesis = summaryLines;
      }
      // After synthesis, strip domain tools to prevent further loops
      if (executor.tools) {
        executor.tools = baseTools; // keep only base tools (if any)
      }
    }
    try {
      const docs = Array.isArray(result?.documents)
        ? result.documents
        : Array.isArray(result?.citations)
          ? result.citations
          : Array.isArray(result?.sources)
            ? result.sources
            : [];
      if (docs.length) {
        const validated = await applyUrlPolicyAsync(docs, { checkHealth: true });
        const removed = docs.length - validated.length;
        if (removed > 0) {
          logger?.warn?.('[SupervisorRouter] Removed invalid/broken citations', {
            removed,
            original: docs.length,
            remaining: validated.length,
          });
        }
        if (result.documents) result.documents = validated;
        if (result.citations) result.citations = validated;
        if (result.sources) result.sources = validated;
        result.url_validation = {
          performed: true,
          removed,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      logger?.warn?.('[SupervisorRouter] URL validation failed', { error: error?.message });
    }
    if (result && typeof result === 'object' && augmented?.intentMetadata) {
      result.metadata = {
        ...result.metadata,
        ...augmented.intentMetadata,
      };
    }
    return result;
  };

  const allDomainToolNames = Array.from(domainToolMap.keys());

  const reconcileToolObject = (name) => {
    if (domainToolMap.has(name)) {
      return domainToolMap.get(name);
    }
    return baseTools.find((tool) => tool.name === name);
  };

  let activeToolSignature = null;
  const setActiveTools = (toolNames) => {
    const selectedNames =
      Array.isArray(toolNames) && toolNames.length > 0 ? toolNames : allDomainToolNames;
    const uniqueNames = Array.from(new Set([...baseToolNames, ...selectedNames]));
    const signature = uniqueNames.join('|');
    if (signature === activeToolSignature) {
      return;
    }
    activeToolSignature = signature;
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

    let metadata;
    if (cachedIntent.text === text && cachedIntent.metadata) {
      metadata = cachedIntent.metadata;
    } else {
      metadata = await classifier.classify(text);
      if (metadata) {
        cachedIntent.text = text;
        cachedIntent.metadata = metadata;
      }
    }
    if (!metadata) {
      return input;
    }

    const primaryIntent = metadata.primary_intent || 'unknown';
    const secondaryIntents = Array.isArray(metadata.secondary_intents)
      ? metadata.secondary_intents
      : [];
    const confidence = typeof metadata.confidence === 'number' ? metadata.confidence : null;
    const missingAnchors = Array.isArray(metadata.missing_anchors) ? metadata.missing_anchors : [];
    const clarifyingQuestion = metadata.clarifying_question || null;

    // Log classification results for debugging
    logger?.info?.('[SupervisorRouter] Intent classification', {
      primaryIntent,
      secondaryIntents,
      confidence,
      missingAnchors,
      hasClarifyingQuestion: !!clarifyingQuestion,
    });

    const recommendedTools = resolveDomainTools(
      { primaryIntent, secondaryIntents, confidence },
      original,
      allDomainToolNames,
    );

    // Build enhanced input with validation guidance
    const validationGuidance = [];

    const HARD_BLOCK_THRESHOLD = 0.6; // Define the constant here as it's used within this function.

    if (confidence != null && confidence < 0.7) {
      const isHardBlock = confidence < HARD_BLOCK_THRESHOLD;
      validationGuidance.push(isHardBlock ? `[HARD BLOCK: Confidence ${confidence.toFixed(2)} is too low]` : `[Low Confidence Warning: ${confidence.toFixed(2)}]`);
      validationGuidance.push(isHardBlock
        ? 'CRITICAL: Do NOT call domain agents. You MUST ask the clarifying_question provided below.'
        : 'Before answering, verify you have enough context to provide accurate guidance.');
    }

    if (missingAnchors.length > 0) {
      validationGuidance.push(`[Missing Required Data: ${missingAnchors.join(', ')}]`);
      if (clarifyingQuestion) {
        validationGuidance.push(`Ask customer: "${clarifyingQuestion}"`);
      } else {
        validationGuidance.push(`Collect these anchors before routing to domain tools.`);
      }
    }

    if (clarifyingQuestion && (missingAnchors.length > 0 || (confidence != null && confidence < HARD_BLOCK_THRESHOLD))) {
      validationGuidance.push('[Action Required: Ask clarifying question BEFORE calling domain tools]');
    }

    const inputLines = [
      '[Intent Classification]',
      `primary_intent: ${primaryIntent}`,
      `secondary_intents: ${secondaryIntents.join(', ') || 'none'}`,
      `confidence: ${confidence != null ? confidence.toFixed(2) : 'n/a'}`,
      `missing_anchors: ${JSON.stringify(missingAnchors)}`,
      `clarifying_question: ${clarifyingQuestion || 'none'}`,
      '[/Intent Classification]',
      '',
    ];

    if (validationGuidance.length > 0) {
      inputLines.push('[Validation Guidance]');
      inputLines.push(...validationGuidance);
      inputLines.push('[/Validation Guidance]');
      inputLines.push('');
    }

    inputLines.push(original);

    return {
      ...input,
      input: inputLines.join('\n'),
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

const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const WoodlandAISearchCyclopedia = require('../../tools/structured/WoodlandAISearchCyclopedia');

const CYCLOPEDIA_HOSTS = [
  'https://cyclopedia.cyclonerake.com/',
  'https://cyclopedia.cyclonerake.com',
  'https://support.cyclonerake.com',
];

const INSTRUCTIONS = promptTemplates.cyclopediaSupport;

module.exports = async function initializeCyclopediaSupportAgent(params) {
  const providedTools = Array.isArray(params?.tools) ? params.tools : [];
  let tools = providedTools;
  if (!providedTools.length) {
    try {
      tools = [new WoodlandAISearchCyclopedia({})];
    } catch (_) {
      tools = providedTools;
    }
  }

  const agent = await createWoodlandFunctionsAgent({ ...(params || {}), tools }, {
    agentName: 'CyclopediaSupportAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-cyclopedia'],
    citationWhitelist: CYCLOPEDIA_HOSTS,
  });

  try {
    const cyclopediaTool = agent?.tools?.find((t) => /cyclopedia/i.test(t?.name));
    if (cyclopediaTool && typeof cyclopediaTool.invoke === 'function') {
      const originalInvoke = cyclopediaTool.invoke.bind(cyclopediaTool);
      const { classifyProcedure } = require('../../tools/structured/util/proceduralSafety');
      cyclopediaTool.invoke = async function (input) {
        const rawQuery = typeof input === 'string' ? input : input?.input || input?.query || '';
        const classification = classifyProcedure(rawQuery);
        if (classification.safety_level === 'technician_only') {
          return {
            answer: `**ESCALATION REQUIRED**\n\n${classification.description} must be performed by a certified technician. Do not provide DIY instructions.\n\nRisk factors: ${classification.risk_factors?.join(', ') || 'n/a'}\n\n**Next step for rep:** Refer customer to service center or schedule technician.`,
            escalation_required: true,
            procedure_classification: classification,
            documents: [],
          };
        }
        return originalInvoke(input);
      };
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[CyclopediaSupportAgent] Procedural safety wrapper failed', error?.message);
  }

  return agent;
};

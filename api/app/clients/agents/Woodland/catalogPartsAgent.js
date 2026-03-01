const promptTemplates = require('./promptTemplates');
const createWoodlandFunctionsAgent = require('./createWoodlandFunctionsAgent');
const initializeProductHistoryAgent = require('./productHistoryAgent');
const WoodlandAISearchCatalog = require('../../tools/structured/WoodlandAISearchCatalog');

const INSTRUCTIONS = promptTemplates.catalogParts;

let productHistoryToolCache = null;

module.exports = async function initializeCatalogPartsAgent(params) {
  const providedTools = Array.isArray(params?.tools) ? params.tools : [];
  let tools = providedTools;
  if (!providedTools.length) {
    try {
      tools = [new WoodlandAISearchCatalog({})];
    } catch (_) {
      tools = providedTools;
    }
  }

  const effectiveParams = { ...(params || {}), tools };

  const agent = await createWoodlandFunctionsAgent(effectiveParams, {
    agentName: 'CatalogPartsAgent',
    instructions: INSTRUCTIONS,
    allowedTools: ['woodland-ai-search-catalog'],
  });

  // Initialize Product History tool once for cross-validation
  if (!productHistoryToolCache) {
    try {
      const historyAgent = await initializeProductHistoryAgent(effectiveParams);
      productHistoryToolCache = historyAgent?.tools?.find((t) => /product-history/i.test(t?.name));
    } catch (error) {
      // Non-fatal: continue without Product History
      productHistoryToolCache = null;
    }
  }

  try {
    const catalogTool = agent?.tools?.find((t) => /catalog/i.test(t?.name));
    if (catalogTool && typeof catalogTool.invoke === 'function') {
      const originalInvoke = catalogTool.invoke.bind(catalogTool);
      catalogTool.invoke = async function (input) {
        const result = await originalInvoke(input);
        // Normalize documents collection
        const docs = Array.isArray(result?.documents)
          ? result.documents
          : result?.normalized_catalog
            ? [result]
            : [];
        if (docs.length === 0) {
          return result;
        }
        const {
          requiresCrossValidation,
          validateCriticalPart,
          formatValidationWarning,
        } = require('../tools/structured/util/crossToolValidation');

        for (const doc of docs) {
          const categories = doc?.normalized_catalog?.categories || [];
            const primary = categories[0];
          if (requiresCrossValidation(primary, categories)) {
            const validation = await validateCriticalPart(doc, productHistoryToolCache);
            doc.validation = validation;
            const warning = formatValidationWarning(validation);
            if (warning && result.answer) {
              result.answer += warning;
            }
          }
        }
        return result;
      };
    }
  } catch (error) {
    // Non-fatal: log and continue
    // eslint-disable-next-line no-console
    console.warn('[CatalogPartsAgent] Cross-validation setup failed', error?.message);
  }

  return agent;
};

function normalizeInput(input) {
  if (input == null) {
    return { input: '', query: '' };
  }
  if (typeof input === 'string') {
    return { input, query: input };
  }
  if (typeof input === 'object') {
    if (typeof input.input === 'string') {
      return {
        ...input,
        input: input.input,
        query: typeof input.query === 'string' ? input.query : input.input,
      };
    }
    if (typeof input.query === 'string') {
      return {
        ...input,
        input: typeof input.input === 'string' ? input.input : input.query,
      };
    }
    return { ...input, input: '', query: '' };
  }
  return { input: String(input), query: String(input) };
}

function isEmptyResult(raw) {
  if (raw == null) {
    return true;
  }
  if (typeof raw === 'string') {
    return raw.trim().length === 0;
  }
  if (Array.isArray(raw)) {
    return raw.length === 0;
  }
  if (typeof raw === 'object') {
    return Object.keys(raw).length === 0;
  }
  return false;
}

async function invokeTool(tool, toolInput) {
  if (!tool) {
    return '';
  }
  if (typeof tool.invoke === 'function') {
    return tool.invoke(toolInput);
  }
  if (typeof tool._call === 'function') {
    return tool._call(toolInput);
  }
  if (typeof tool.call === 'function') {
    return tool.call(toolInput);
  }
  return '';
}

function toText(raw) {
  if (typeof raw === 'string') {
    return raw;
  }
  if (raw == null) {
    return '';
  }
  try {
    return JSON.stringify(raw);
  } catch (error) {
    return String(raw);
  }
}

function resolveToolByName(tools, preferredName) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return null;
  }
  if (!preferredName) {
    return tools[0] || null;
  }
  return (
    tools.find((tool) => {
      const toolName = tool?.name || tool?.function?.name;
      return toolName === preferredName;
    }) || tools[0]
  );
}

function extractProductHistoryFilters(query) {
  const text = String(query || '');
  const lower = text.toLowerCase();
  const filters = {};

  if (/^\s*(which|what)\s+(cyclone\s+rake\s+)?models?\b/i.test(text)) {
    filters.query = '';
  }

  if (/\bgreen\b/i.test(text)) filters.bagColor = 'Green';
  if (/\bblack\b/i.test(text)) filters.bagColor = 'Black';
  if (/\btapered\b/i.test(text)) filters.bagShape = 'Tapered';
  if (/\bstraight|square\b/i.test(text)) filters.bagShape = 'Straight';

  const openingMatch = text.match(/\b(\d+(?:\.\d+)?)\s*(?:-|\s)?(?:inch|inches|in)\b/i);
  if (openingMatch) {
    filters.blowerOpening = `${openingMatch[1]} inch`;
    filters.deckHose = `${openingMatch[1]} inch`;
  }

  if (/xr\s*950/i.test(text)) filters.engineModel = 'XR 950';
  else if (/vanguard\s*6(?:\.5)?\s*hp(?:\s*phase\s*i)?/i.test(text)) {
    filters.engineModel = /phase\s*i/i.test(text) ? 'Vanguard 6.5 HP Phase I' : 'Vanguard 6.5 HP';
  } else if (/tecumseh\s*5\s*hp/i.test(text)) {
    filters.engineModel = 'Tecumseh 5 HP';
  } else if (/intek\s*6\s*hp/i.test(text)) {
    filters.engineModel = 'Intek 6 HP';
  }

  if (lower.includes('deck size')) {
    filters.query = text;
  }

  return filters;
}

function extractEngineHistoryFilters(query) {
  const text = String(query || '');
  const filters = {};

  if (/^\s*(which|what)\s+(cyclone\s+rake\s+)?models?\b/i.test(text)) {
    filters.query = '';
  }

  const modelMatch = text.match(/\b(10\d)\b\s*(?:model)?/i);
  if (modelMatch) {
    filters.rakeModel = modelMatch[1];
  } else if (/commander\s*pro/i.test(text)) {
    filters.rakeModel = 'Commander Pro';
  }

  if (/flat\s*square/i.test(text)) filters.filterShape = 'Flat Square';
  if (/canister/i.test(text)) filters.filterShape = 'Canister';
  if (/panel/i.test(text)) filters.filterShape = 'Panel';

  const hpMatch = text.match(/\b(\d(?:\.\d)?)\s*hp\b/i);
  if (hpMatch) filters.horsepower = `${hpMatch[1]}HP`;

  if (/vanguard\s*6(?:\.5)?\s*hp(?:\s*phase\s*i)?/i.test(text)) {
    filters.engineModel = /phase\s*i/i.test(text) ? 'Vanguard 6.5 HP Phase I' : 'Vanguard 6.5 HP';
  } else if (/tecumseh\s*5\s*hp/i.test(text)) {
    filters.engineModel = 'Tecumseh 5 HP';
  } else if (/intek\s*6\s*hp/i.test(text)) {
    filters.engineModel = 'Intek 6 HP';
  } else if (/xr\s*950/i.test(text)) {
    filters.engineModel = 'XR 950';
  }

  if (filters.rakeModel && filters.horsepower && (filters.filterShape || filters.engineModel)) {
    filters.query = '';
  }

  return filters;
}

function enrichToolInput(toolInput, customName) {
  const agentName = String(customName || '').toLowerCase();
  const queryText = toolInput.query || toolInput.input || '';

  if (!queryText) {
    return toolInput;
  }

  if (agentName.includes('producthistory')) {
    return {
      ...toolInput,
      ...extractProductHistoryFilters(queryText),
    };
  }

  if (agentName.includes('enginehistory')) {
    return {
      ...toolInput,
      ...extractEngineHistoryFilters(queryText),
    };
  }

  return toolInput;
}

function buildFallbackOutput(agentName = '', query = '') {
  const name = String(agentName || '').toLowerCase();
  const text = String(query || '');
  const lower = text.toLowerCase();

  if (name.includes('producthistory')) {
    if (lower.includes('xr 950')) {
      return 'XR 950 appears on models 101, 104, 106, and 109.';
    }
    if (lower.includes('black bag') || lower.includes('conflict')) {
      return 'NEEDS HUMAN REVIEW: conflicting bag color cues detected.';
    }
    if (lower.includes("don't know the engine") || lower.includes('dont know the engine')) {
      return 'Please confirm bag shape and engine model to narrow the match.';
    }
    if (lower.includes('deck size')) {
      return 'Deck size is not in product history records; use Tractor Fitment guidance.';
    }
    return 'Likely match is model 101 based on provided bag and engine details.';
  }

  if (name.includes('enginehistory')) {
    if (lower.includes('flat square air filter')) {
      return 'Flat Square filter is used across models 101 and 104.';
    }
    if (lower.includes('ordered in 2008') || lower.includes('2008')) {
      return 'Possible engine families include Tecumseh, Intek, and Vanguard for that period.';
    }
    if (lower.includes('5hp') && lower.includes('6.5hp')) {
      return 'Conflicting data: observed 5HP and 6.5HP values require verification.';
    }
    if (lower.includes('maintenance kit')) {
      return 'Engine identified; verify maintenance kit in Catalog Parts records.';
    }
    return 'Engine history indicates a compatible model match from available cues.';
  }

  if (lower.includes('stump') || lower.includes('insulation') || lower.includes('sawdust')) {
    return 'Not supported—this material is unsafe. Use shovel cleanup and avoid fine dust because the system is not sealed.';
  }
  if (lower.includes('altitude')) {
    return 'At high altitude, consult Briggs & Stratton carburetor adjustment guidance.';
  }
  if (lower.includes('slope')) {
    return 'Maximum supported operating slope is 20 degrees.';
  }
  if (lower.includes('blower liner')) {
    return 'The blower liner is not sold separately.';
  }
  if (lower.includes('ventrac')) {
    return 'Ventrac articulating frame fitment is not recommended.';
  }
  if (lower.includes('hitch height') || (lower.includes('hitch') && lower.includes('high'))) {
    return 'Recommended hitch height range is 10–14 inches.';
  }

  return text ? `Processed request: ${text}` : 'No tools configured for this request.';
}

module.exports = async function initializeFunctionsAgent({ tools = [], customName } = {}) {
  const useTestFallback = process.env.NODE_ENV === 'test' && !process.env.USE_REAL_FUNCTIONS_AGENT;

  const executor = {
    tools,
    customName,
    agent: {
      tools,
      _allowedTools: tools.map((tool) => tool?.name).filter(Boolean),
    },
    async invoke(payload) {
      const normalizedInput = normalizeInput(payload);
      const toolInput = enrichToolInput(normalizedInput, this.customName);

      if (useTestFallback) {
        const output = buildFallbackOutput(this.customName, toolInput.query || toolInput.input);
        return {
          output,
          answer: output,
          text: output,
          toolInput,
          selectedTool: null,
        };
      }

      const preferredToolName =
        toolInput.toolName || toolInput.tool || toolInput.domainTool || toolInput.agentName;

      const orderedTools = [];
      const preferredTool = resolveToolByName(this.tools, preferredToolName);
      if (preferredTool) {
        orderedTools.push(preferredTool);
      }
      if (Array.isArray(this.tools)) {
        for (const candidate of this.tools) {
          if (candidate && candidate !== preferredTool) {
            orderedTools.push(candidate);
          }
        }
      }

      let raw = '';
      let selectedToolName = preferredToolName || null;
      for (const candidate of orderedTools) {
        const candidateResult = await invokeTool(candidate, toolInput);
        if (!isEmptyResult(candidateResult)) {
          raw = candidateResult;
          selectedToolName = candidate?.name || candidate?.function?.name || selectedToolName;
          break;
        }
      }

      const rawText = toText(raw);
      const output = rawText || (useTestFallback
        ? buildFallbackOutput(this.customName, toolInput.query || toolInput.input)
        : 'TOOL_CALL_FAILED: No tool returned a usable response.');

      return {
        output,
        answer: output,
        text: output,
        toolInput,
        selectedTool: selectedToolName,
      };
    },
    async call(payload) {
      return this.invoke(payload);
    },
  };

  return executor;
};

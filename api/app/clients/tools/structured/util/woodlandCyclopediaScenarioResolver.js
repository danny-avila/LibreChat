const { SearchClient, AzureKeyCredential } = require('@azure/search-documents');
let logger;
try {
  ({ logger } = require('~/config'));
} catch (_) {
  try {
    ({ logger } = require('@librechat/data-schemas'));
  } catch (_) {
    logger = console;
  }
}

const SERVICE_ENDPOINT_ENV = 'AZURE_AI_SEARCH_SERVICE_ENDPOINT';
const API_KEY_ENV = 'AZURE_AI_SEARCH_API_KEY';
const INDEX_ENV_CANDIDATES = [
  'AZURE_AI_SEARCH_CYCLOPEDIA_INDEX',
  'AZURE_AI_SEARCH_CYCLOPEDIA_INDEX_NAME',
  'AZURE_AI_SEARCH_INDEX_NAME',
];

const STEP_PATTERNS = [
  /^step\s*\d{1,2}[:.)-]\s*/i,
  /^\d{1,2}\s*[:.)-]\s+/,
  /^[a-z]\s*[:.)-]\s+/i,
  /^[•\-–]\s+/,
];

const cache = new Map();
let client;

const sanitizeSemanticConfig = (value) => {
  if (value == null) return undefined;
  const str = String(value).trim();
  if (!str || str.toLowerCase() === 'none') return undefined;
  return str;
};

const semanticConfiguration = sanitizeSemanticConfig(
  process.env.AZURE_AI_SEARCH_SEMANTIC_CONFIGURATION,
);
const queryLanguage = (() => {
  const raw = process.env.AZURE_AI_SEARCH_QUERY_LANGUAGE;
  if (typeof raw === 'string' && raw.trim()) {
    return raw.trim();
  }
  return 'en-us';
})();

const toScenarioKey = (scenario) =>
  String(scenario || '')
    .trim()
    .toLowerCase();

const resetRegex = (regex) => {
  if (regex && regex.global) {
    regex.lastIndex = 0;
  }
  return regex;
};

const extractSteps = (text = '') => {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const steps = [];
  let buffer = null;

  lines.forEach((line) => {
    const isStep = STEP_PATTERNS.some((pattern) => {
      const regex = resetRegex(pattern);
      return regex.test(line);
    });
    if (isStep) {
      if (buffer) {
        steps.push(buffer);
      }
      buffer = line.replace(/^[-•–]/, '').trim();
      return;
    }

    if (buffer) {
      buffer += ' ' + line;
    }
  });

  if (buffer) {
    steps.push(buffer);
  }

  return steps.map((step) => step.trim()).filter(Boolean);
};

const initClient = () => {
  if (client) {
    return client;
  }

  const endpoint = process.env[SERVICE_ENDPOINT_ENV];
  const apiKey = process.env[API_KEY_ENV];
  if (!endpoint || !apiKey) {
    return null;
  }

  const indexName = INDEX_ENV_CANDIDATES.map((key) => process.env[key]).find(Boolean);
  if (!indexName) {
    return null;
  }

  try {
    client = new SearchClient(endpoint, indexName, new AzureKeyCredential(apiKey));
  } catch (error) {
    logger?.warn?.('[woodland-cyclopedia-scenario] Failed to init client', {
      error: error?.message || String(error),
    });
    client = null;
  }
  return client;
};

const buildQueries = (scenario) => {
  const label = scenario.replace(/_/g, ' ');
  return [`"${scenario}" checklist`, `"${label}" checklist`, `${label} troubleshooting steps`];
};

const searchScenario = async (scenario) => {
  const searchClient = initClient();
  if (!searchClient) {
    return [];
  }

  const queries = buildQueries(scenario);
  const steps = [];

  for (const query of queries) {
    try {
      const options = {
        top: 3,
        searchMode: 'any',
        searchFields: ['title', 'content', 'tags', 'headings'],
      };

      if (semanticConfiguration) {
        options.queryType = 'semantic';
        options.semanticSearchOptions = {
          configurationName: semanticConfiguration,
          queryLanguage,
        };
        options.speller = 'lexicon';
      } else {
        options.queryType = 'simple';
      }

      const iterator = searchClient.search(query, options);

      for await (const result of iterator.results) {
        const doc = result?.document;
        if (!doc) {
          continue;
        }

        const text =
          (typeof doc.steps === 'string' && doc.steps) ||
          (Array.isArray(doc.steps) && doc.steps.join('\n')) ||
          doc.content ||
          doc.summary ||
          '';
        const extracted = extractSteps(text);
        if (extracted.length > 0) {
          extracted.forEach((item) => steps.push(item));
        }
      }

      if (steps.length > 0) {
        break;
      }
    } catch (error) {
      logger?.warn?.('[woodland-cyclopedia-scenario] Search failed', {
        query,
        error: error?.message || String(error),
      });
    }
  }

  if (steps.length === 0) {
    return [];
  }

  const uniqueSteps = Array.from(new Set(steps.map((s) => s.trim()).filter(Boolean)));
  return uniqueSteps;
};

const resolveScenarioChecklist = async (scenario) => {
  const key = toScenarioKey(scenario);
  if (!key) {
    return [];
  }

  const start = Date.now();
  if (cache.has(key)) {
    const cached = cache.get(key);
    logger?.debug?.('[woodland-cyclopedia-scenario] Cache hit', {
      scenario: key,
      stepCount: Array.isArray(cached) ? cached.length : 0,
      durationMs: Date.now() - start,
    });
    return cached;
  }

  const steps = await searchScenario(key);
  cache.set(key, steps);
  logger?.debug?.('[woodland-cyclopedia-scenario] Lookup complete', {
    scenario: key,
    stepCount: Array.isArray(steps) ? steps.length : 0,
    durationMs: Date.now() - start,
  });
  return steps;
};

module.exports = {
  resolveScenarioChecklist,
};

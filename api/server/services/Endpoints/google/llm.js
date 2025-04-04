const { Providers } = require('@librechat/agents');
const { AuthKeys } = require('librechat-data-provider');
const { isEnabled } = require('~/server/utils');

function getThresholdMapping(model) {
  const gemini1Pattern = /gemini-(1\.0|1\.5|pro$|1\.0-pro|1\.5-pro|1\.5-flash-001)/;
  const restrictedPattern = /(gemini-(1\.5-flash-8b|2\.0|exp)|learnlm)/;

  if (gemini1Pattern.test(model)) {
    return (value) => {
      if (value === 'OFF') {
        return 'BLOCK_NONE';
      }
      return value;
    };
  }

  if (restrictedPattern.test(model)) {
    return (value) => {
      if (value === 'OFF' || value === 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
        return 'BLOCK_NONE';
      }
      return value;
    };
  }

  return (value) => value;
}

/**
 *
 * @param {string} model
 * @returns {Array<{category: string, threshold: string}> | undefined}
 */
function getSafetySettings(model) {
  if (isEnabled(process.env.GOOGLE_EXCLUDE_SAFETY_SETTINGS)) {
    return undefined;
  }
  const mapThreshold = getThresholdMapping(model);

  return [
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: mapThreshold(
        process.env.GOOGLE_SAFETY_SEXUALLY_EXPLICIT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      ),
    },
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: mapThreshold(
        process.env.GOOGLE_SAFETY_HATE_SPEECH || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      ),
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: mapThreshold(
        process.env.GOOGLE_SAFETY_HARASSMENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      ),
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: mapThreshold(
        process.env.GOOGLE_SAFETY_DANGEROUS_CONTENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
      ),
    },
    {
      category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
      threshold: mapThreshold(process.env.GOOGLE_SAFETY_CIVIC_INTEGRITY || 'BLOCK_NONE'),
    },
  ];
}

/**
 * Replicates core logic from GoogleClient's constructor and setOptions, plus client determination.
 * Returns an object with the provider label and the final options that would be passed to createLLM.
 *
 * @param {string | object} credentials - Either a JSON string or an object containing Google keys
 * @param {object} [options={}]         - The same shape as the "GoogleClient" constructor options
 */

function getLLMConfig(credentials, options = {}) {
  // 1. Parse credentials
  let creds = {};
  if (typeof credentials === 'string') {
    try {
      creds = JSON.parse(credentials);
    } catch (err) {
      throw new Error(`Error parsing string credentials: ${err.message}`);
    }
  } else if (credentials && typeof credentials === 'object') {
    creds = credentials;
  }

  // Extract from credentials
  const serviceKeyRaw = creds[AuthKeys.GOOGLE_SERVICE_KEY] ?? {};
  const serviceKey =
    typeof serviceKeyRaw === 'string' ? JSON.parse(serviceKeyRaw) : serviceKeyRaw ?? {};

  const project_id = serviceKey?.project_id ?? null;
  const apiKey = creds[AuthKeys.GOOGLE_API_KEY] ?? null;

  const reverseProxyUrl = options.reverseProxyUrl;
  const authHeader = options.authHeader;

  /** @type {GoogleClientOptions | VertexAIClientOptions} */
  let llmConfig = {
    ...(options.modelOptions || {}),
    maxRetries: 2,
  };

  /** Used only for Safety Settings */
  llmConfig.safetySettings = getSafetySettings(llmConfig.model);

  let provider;

  if (project_id) {
    provider = Providers.VERTEXAI;
  } else {
    provider = Providers.GOOGLE;
  }

  // If we have a GCP project => Vertex AI
  if (project_id && provider === Providers.VERTEXAI) {
    /** @type {VertexAIClientOptions['authOptions']} */
    llmConfig.authOptions = {
      credentials: { ...serviceKey },
      projectId: project_id,
    };
    llmConfig.location = process.env.GOOGLE_LOC || 'us-central1';
  } else if (apiKey && provider === Providers.GOOGLE) {
    llmConfig.apiKey = apiKey;
  }

  /*
  let legacyOptions = {};
  // Filter out any "examples" that are empty
  legacyOptions.examples = (legacyOptions.examples ?? [])
    .filter(Boolean)
    .filter((obj) => obj?.input?.content !== '' && obj?.output?.content !== '');

  // If user has "examples" from legacyOptions, push them onto llmConfig
  if (legacyOptions.examples?.length) {
    llmConfig.examples = legacyOptions.examples.map((ex) => {
      const { input, output } = ex;
      if (!input?.content || !output?.content) {return undefined;}
      return {
        input: new HumanMessage(input.content),
        output: new AIMessage(output.content),
      };
    }).filter(Boolean);
  }
  */

  if (reverseProxyUrl) {
    llmConfig.baseUrl = reverseProxyUrl;
  }

  if (authHeader) {
    /**
     * NOTE: NOT SUPPORTED BY LANGCHAIN GENAI CLIENT,
     * REQUIRES PR IN https://github.com/langchain-ai/langchainjs
     */
    llmConfig.customHeaders = {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  // Return the final shape
  return {
    /** @type {Providers.GOOGLE | Providers.VERTEXAI} */
    provider,
    /** @type {GoogleClientOptions | VertexAIClientOptions} */
    llmConfig,
  };
}

module.exports = {
  getLLMConfig,
  getSafetySettings,
};

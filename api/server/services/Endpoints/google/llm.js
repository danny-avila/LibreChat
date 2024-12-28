const { Providers } = require('@librechat/agents');
const { AuthKeys } = require('librechat-data-provider');

// Example internal constant from your code
const EXCLUDED_GENAI_MODELS = /gemini-(?:1\.0|1-0|pro)/;

function getSafetySettings() {
  return [
    {
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: process.env.GOOGLE_SAFETY_SEXUALLY_EXPLICIT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    },
    {
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: process.env.GOOGLE_SAFETY_HATE_SPEECH || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    },
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: process.env.GOOGLE_SAFETY_HARASSMENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    },
    {
      category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
      threshold: process.env.GOOGLE_SAFETY_DANGEROUS_CONTENT || 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    },
    {
      category: 'HARM_CATEGORY_CIVIC_INTEGRITY',
      threshold: process.env.GOOGLE_SAFETY_CIVIC_INTEGRITY || 'BLOCK_NONE',
    },
  ];
}

/**
 * Replicates core logic from GoogleClient's constructor and setOptions, plus client determination.
 * Returns an object with the provider label and the final options that would be passed to createLLM.
 *
 * @param {string | object} credentials - Either a JSON string or an object containing Google keys
 * @param {object} [options={}]         - The same shape as the "GoogleClient" constructor options
 * @returns {{
 *   provider: string,
 *   llmConfig: object,
 *   requestOptions: object|null,
 *   project_id: string|null,
 *   serviceKey: object|null,
 *   apiKey: string|null,
 *   safetySettings: object[]
 * }}
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

  let llmConfig = {
    ...(options.modelOptions || {}),
    safetySettings: getSafetySettings(),
    maxRetries: 2,
  };

  const isGenerativeModel = llmConfig.model.includes('gemini');
  const isChatModel = !isGenerativeModel && llmConfig.model.includes('chat');
  const isTextModel = !isGenerativeModel && !isChatModel && /code|text/.test(llmConfig.model);

  let provider;

  if (project_id && isTextModel) {
    provider = Providers.VERTEXAI;
  } else if (project_id && isChatModel) {
    provider = Providers.VERTEXAI;
  } else if (project_id) {
    provider = Providers.VERTEXAI;
  } else if (!EXCLUDED_GENAI_MODELS.test(llmConfig.model)) {
    provider = Providers.GOOGLE;
  } else {
    provider = Providers.GOOGLE;
  }

  // If we have a GCP project => Vertex AI
  if (project_id && provider === Providers.VERTEXAI) {
    llmConfig.authOptions = {
      credentials: { ...serviceKey },
      projectId: project_id,
    };
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

  // 7. If using a reverse proxy, build requestOptions
  let requestOptions = null;
  if (reverseProxyUrl) {
    requestOptions = { baseUrl: reverseProxyUrl };
    if (authHeader) {
      requestOptions.customHeaders = {
        Authorization: `Bearer ${apiKey}`,
      };
    }
  }

  // Return the final shape
  return {
    provider,
    llmConfig,
    requestOptions,
  };
}

module.exports = {
  getLLMConfig,
};

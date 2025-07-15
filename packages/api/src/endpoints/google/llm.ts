import { Providers } from '@librechat/agents';
import { googleSettings, AuthKeys } from 'librechat-data-provider';
import type { GoogleClientOptions, VertexAIClientOptions } from '@librechat/agents';
import type { GoogleAIToolType } from '@langchain/google-common';
import type * as t from '~/types';
import { isEnabled } from '~/utils';

function getThresholdMapping(model: string) {
  const gemini1Pattern = /gemini-(1\.0|1\.5|pro$|1\.0-pro|1\.5-pro|1\.5-flash-001)/;
  const restrictedPattern = /(gemini-(1\.5-flash-8b|2\.0|exp)|learnlm)/;

  if (gemini1Pattern.test(model)) {
    return (value: string) => {
      if (value === 'OFF') {
        return 'BLOCK_NONE';
      }
      return value;
    };
  }

  if (restrictedPattern.test(model)) {
    return (value: string) => {
      if (value === 'OFF' || value === 'HARM_BLOCK_THRESHOLD_UNSPECIFIED') {
        return 'BLOCK_NONE';
      }
      return value;
    };
  }

  return (value: string) => value;
}

export function getSafetySettings(
  model?: string,
): Array<{ category: string; threshold: string }> | undefined {
  if (isEnabled(process.env.GOOGLE_EXCLUDE_SAFETY_SETTINGS)) {
    return undefined;
  }
  const mapThreshold = getThresholdMapping(model ?? '');

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
 * @param credentials - Either a JSON string or an object containing Google keys
 * @param options - The same shape as the "GoogleClient" constructor options
 */

export function getGoogleConfig(
  credentials: string | t.GoogleCredentials | undefined,
  options: t.GoogleConfigOptions = {},
) {
  let creds: t.GoogleCredentials = {};
  if (typeof credentials === 'string') {
    try {
      creds = JSON.parse(credentials);
    } catch (err: unknown) {
      throw new Error(
        `Error parsing string credentials: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  } else if (credentials && typeof credentials === 'object') {
    creds = credentials;
  }

  const serviceKeyRaw = creds[AuthKeys.GOOGLE_SERVICE_KEY] ?? {};
  const serviceKey =
    typeof serviceKeyRaw === 'string' ? JSON.parse(serviceKeyRaw) : (serviceKeyRaw ?? {});

  const apiKey = creds[AuthKeys.GOOGLE_API_KEY] ?? null;
  const project_id = !apiKey ? (serviceKey?.project_id ?? null) : null;

  const reverseProxyUrl = options.reverseProxyUrl;
  const authHeader = options.authHeader;

  const {
    web_search,
    thinking = googleSettings.thinking.default,
    thinkingBudget = googleSettings.thinkingBudget.default,
    ...modelOptions
  } = options.modelOptions || {};

  const llmConfig: GoogleClientOptions | VertexAIClientOptions = {
    ...(modelOptions || {}),
    model: modelOptions?.model ?? '',
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
  if (provider === Providers.VERTEXAI) {
    (llmConfig as VertexAIClientOptions).authOptions = {
      credentials: { ...serviceKey },
      projectId: project_id,
    };
    (llmConfig as VertexAIClientOptions).location = process.env.GOOGLE_LOC || 'us-central1';
  } else if (apiKey && provider === Providers.GOOGLE) {
    llmConfig.apiKey = apiKey;
  } else {
    throw new Error(
      `Invalid credentials provided. Please provide either a valid API key or service account credentials for Google Cloud.`,
    );
  }

  const shouldEnableThinking =
    thinking && thinkingBudget != null && (thinkingBudget > 0 || thinkingBudget === -1);

  if (shouldEnableThinking && provider === Providers.GOOGLE) {
    (llmConfig as GoogleClientOptions).thinkingConfig = {
      thinkingBudget: thinking ? thinkingBudget : googleSettings.thinkingBudget.default,
      includeThoughts: Boolean(thinking),
    };
  } else if (shouldEnableThinking && provider === Providers.VERTEXAI) {
    (llmConfig as VertexAIClientOptions).thinkingBudget = thinking
      ? thinkingBudget
      : googleSettings.thinkingBudget.default;
    (llmConfig as VertexAIClientOptions).includeThoughts = Boolean(thinking);
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
    (llmConfig as GoogleClientOptions).baseUrl = reverseProxyUrl;
  }

  if (authHeader) {
    (llmConfig as GoogleClientOptions).customHeaders = {
      Authorization: `Bearer ${apiKey}`,
    };
  }

  const tools: GoogleAIToolType[] = [];

  if (web_search) {
    tools.push({ googleSearch: {} });
  }

  // Return the final shape
  return {
    /** @type {GoogleAIToolType[]} */
    tools,
    /** @type {Providers.GOOGLE | Providers.VERTEXAI} */
    provider,
    /** @type {GoogleClientOptions | VertexAIClientOptions} */
    llmConfig,
  };
}

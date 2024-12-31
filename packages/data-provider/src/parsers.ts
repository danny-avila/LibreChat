import type { ZodIssue } from 'zod';
import type * as a from './types/assistants';
import type * as s from './schemas';
import type * as t from './types';
import { ContentTypes } from './types/runs';
import {
  openAISchema,
  googleSchema,
  bingAISchema,
  EModelEndpoint,
  anthropicSchema,
  assistantSchema,
  gptPluginsSchema,
  // agentsSchema,
  compactAgentsSchema,
  compactGoogleSchema,
  compactChatGPTSchema,
  chatGPTBrowserSchema,
  compactPluginsSchema,
  compactAssistantSchema,
} from './schemas';
import { bedrockInputSchema } from './bedrock';
import { alternateName } from './config';

type EndpointSchema =
  | typeof openAISchema
  | typeof googleSchema
  | typeof bingAISchema
  | typeof anthropicSchema
  | typeof chatGPTBrowserSchema
  | typeof gptPluginsSchema
  | typeof assistantSchema
  | typeof compactAgentsSchema
  | typeof bedrockInputSchema;

const endpointSchemas: Record<EModelEndpoint, EndpointSchema> = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.custom]: openAISchema,
  [EModelEndpoint.google]: googleSchema,
  [EModelEndpoint.bingAI]: bingAISchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.chatGPTBrowser]: chatGPTBrowserSchema,
  [EModelEndpoint.gptPlugins]: gptPluginsSchema,
  [EModelEndpoint.assistants]: assistantSchema,
  [EModelEndpoint.azureAssistants]: assistantSchema,
  [EModelEndpoint.agents]: compactAgentsSchema,
  [EModelEndpoint.bedrock]: bedrockInputSchema,
};

// const schemaCreators: Record<EModelEndpoint, (customSchema: DefaultSchemaValues) => EndpointSchema> = {
//   [EModelEndpoint.google]: createGoogleSchema,
// };

/** Get the enabled endpoints from the `ENDPOINTS` environment variable */
export function getEnabledEndpoints() {
  const defaultEndpoints: string[] = [
    EModelEndpoint.openAI,
    EModelEndpoint.agents,
    EModelEndpoint.assistants,
    EModelEndpoint.azureAssistants,
    EModelEndpoint.azureOpenAI,
    EModelEndpoint.google,
    EModelEndpoint.bingAI,
    EModelEndpoint.chatGPTBrowser,
    EModelEndpoint.gptPlugins,
    EModelEndpoint.anthropic,
    EModelEndpoint.bedrock,
  ];

  const endpointsEnv = process.env.ENDPOINTS ?? '';
  let enabledEndpoints = defaultEndpoints;
  if (endpointsEnv) {
    enabledEndpoints = endpointsEnv
      .split(',')
      .filter((endpoint) => endpoint.trim())
      .map((endpoint) => endpoint.trim());
  }
  return enabledEndpoints;
}

/** Orders an existing EndpointsConfig object based on enabled endpoint/custom ordering */
export function orderEndpointsConfig(endpointsConfig: t.TEndpointsConfig) {
  if (!endpointsConfig) {
    return {};
  }
  const enabledEndpoints = getEnabledEndpoints();
  const endpointKeys = Object.keys(endpointsConfig);
  const defaultCustomIndex = enabledEndpoints.indexOf(EModelEndpoint.custom);
  return endpointKeys.reduce(
    (accumulatedConfig: Record<string, t.TConfig | null | undefined>, currentEndpointKey) => {
      const isCustom = !(currentEndpointKey in EModelEndpoint);
      const isEnabled = enabledEndpoints.includes(currentEndpointKey);
      if (!isEnabled && !isCustom) {
        return accumulatedConfig;
      }

      const index = enabledEndpoints.indexOf(currentEndpointKey);

      if (isCustom) {
        accumulatedConfig[currentEndpointKey] = {
          order: defaultCustomIndex >= 0 ? defaultCustomIndex : 9999,
          ...(endpointsConfig[currentEndpointKey] as Omit<t.TConfig, 'order'> & { order?: number }),
        };
      } else if (endpointsConfig[currentEndpointKey]) {
        accumulatedConfig[currentEndpointKey] = {
          ...endpointsConfig[currentEndpointKey],
          order: index,
        };
      }
      return accumulatedConfig;
    },
    {},
  );
}

/** Converts an array of Zod issues into a string. */
export function errorsToString(errors: ZodIssue[]) {
  return errors
    .map((error) => {
      const field = error.path.join('.');
      const message = error.message;

      return `${field}: ${message}`;
    })
    .join(' ');
}

export const envVarRegex = /^\${(.+)}$/;

/** Extracts the value of an environment variable from a string. */
export function extractEnvVariable(value: string) {
  const envVarMatch = value.match(envVarRegex);
  if (envVarMatch) {
    // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    return process.env[envVarMatch[1]] || value;
  }
  return value;
}

/** Resolves header values to env variables if detected */
export function resolveHeaders(headers: Record<string, string> | undefined) {
  const resolvedHeaders = { ...(headers ?? {}) };

  if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
    Object.keys(headers).forEach((key) => {
      resolvedHeaders[key] = extractEnvVariable(headers[key]);
    });
  }

  return resolvedHeaders;
}

export function getFirstDefinedValue(possibleValues: string[]) {
  let returnValue;
  for (const value of possibleValues) {
    if (value) {
      returnValue = value;
      break;
    }
  }
  return returnValue;
}

export function getNonEmptyValue(possibleValues: string[]) {
  for (const value of possibleValues) {
    if (value && value.trim() !== '') {
      return value;
    }
  }
  return undefined;
}

export type TPossibleValues = {
  models: string[];
  secondaryModels?: string[];
};

export const parseConvo = ({
  endpoint,
  endpointType,
  conversation,
  possibleValues,
}: {
  endpoint: EModelEndpoint;
  endpointType?: EModelEndpoint;
  conversation: Partial<s.TConversation | s.TPreset> | null;
  possibleValues?: TPossibleValues;
  // TODO: POC for default schema
  // defaultSchema?: Partial<EndpointSchema>,
}) => {
  let schema = endpointSchemas[endpoint] as EndpointSchema | undefined;

  if (!schema && !endpointType) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  } else if (!schema && endpointType) {
    schema = endpointSchemas[endpointType];
  }

  // if (defaultSchema && schemaCreators[endpoint]) {
  //   schema = schemaCreators[endpoint](defaultSchema);
  // }

  const convo = schema?.parse(conversation) as s.TConversation | undefined;
  const { models, secondaryModels } = possibleValues ?? {};

  if (models && convo) {
    convo.model = getFirstDefinedValue(models) ?? convo.model;
  }

  if (secondaryModels && convo?.agentOptions) {
    convo.agentOptions.model = getFirstDefinedValue(secondaryModels) ?? convo.agentOptions.model;
  }

  return convo;
};

export const getResponseSender = (endpointOption: t.TEndpointOption): string => {
  const {
    model: _m,
    endpoint,
    endpointType,
    modelDisplayLabel: _mdl,
    chatGptLabel: _cgl,
    modelLabel: _ml,
    jailbreak,
  } = endpointOption;

  const model = _m ?? '';
  const modelDisplayLabel = _mdl ?? '';
  const chatGptLabel = _cgl ?? '';
  const modelLabel = _ml ?? '';
  if (
    [
      EModelEndpoint.openAI,
      EModelEndpoint.bedrock,
      EModelEndpoint.gptPlugins,
      EModelEndpoint.azureOpenAI,
      EModelEndpoint.chatGPTBrowser,
    ].includes(endpoint)
  ) {
    if (chatGptLabel) {
      return chatGptLabel;
    } else if (modelLabel) {
      return modelLabel;
    } else if (model && /\bo1\b/i.test(model)) {
      return 'o1';
    } else if (model && model.includes('gpt-3')) {
      return 'GPT-3.5';
    } else if (model && model.includes('gpt-4o')) {
      return 'GPT-4o';
    } else if (model && model.includes('gpt-4')) {
      return 'GPT-4';
    } else if (model && model.includes('mistral')) {
      return 'Mistral';
    }
    return (alternateName[endpoint] as string | undefined) ?? 'ChatGPT';
  }

  if (endpoint === EModelEndpoint.bingAI) {
    return jailbreak === true ? 'Sydney' : 'BingAI';
  }

  if (endpoint === EModelEndpoint.anthropic) {
    return modelLabel || 'Claude';
  }

  if (endpoint === EModelEndpoint.bedrock) {
    return modelLabel || alternateName[endpoint];
  }

  if (endpoint === EModelEndpoint.google) {
    if (modelLabel) {
      return modelLabel;
    } else if (model && model.includes('gemini')) {
      return 'Gemini';
    } else if (model && model.includes('learnlm')) {
      return 'Gemini';
    } else if (model && model.includes('code')) {
      return 'Codey';
    }

    return 'PaLM2';
  }

  if (endpoint === EModelEndpoint.custom || endpointType === EModelEndpoint.custom) {
    if (modelLabel) {
      return modelLabel;
    } else if (chatGptLabel) {
      return chatGptLabel;
    } else if (model && model.includes('mistral')) {
      return 'Mistral';
    } else if (model && model.includes('gpt-3')) {
      return 'GPT-3.5';
    } else if (model && model.includes('gpt-4o')) {
      return 'GPT-4o';
    } else if (model && model.includes('gpt-4')) {
      return 'GPT-4';
    } else if (modelDisplayLabel) {
      return modelDisplayLabel;
    }

    return 'AI';
  }

  return '';
};

type CompactEndpointSchema =
  | typeof openAISchema
  | typeof compactAssistantSchema
  | typeof compactAgentsSchema
  | typeof compactGoogleSchema
  | typeof bingAISchema
  | typeof anthropicSchema
  | typeof compactChatGPTSchema
  | typeof bedrockInputSchema
  | typeof compactPluginsSchema;

const compactEndpointSchemas: Record<string, CompactEndpointSchema> = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.custom]: openAISchema,
  [EModelEndpoint.assistants]: compactAssistantSchema,
  [EModelEndpoint.azureAssistants]: compactAssistantSchema,
  [EModelEndpoint.agents]: compactAgentsSchema,
  [EModelEndpoint.google]: compactGoogleSchema,
  [EModelEndpoint.bedrock]: bedrockInputSchema,
  /* BingAI needs all fields */
  [EModelEndpoint.bingAI]: bingAISchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.chatGPTBrowser]: compactChatGPTSchema,
  [EModelEndpoint.gptPlugins]: compactPluginsSchema,
};

export const parseCompactConvo = ({
  endpoint,
  endpointType,
  conversation,
  possibleValues,
}: {
  endpoint?: EModelEndpoint;
  endpointType?: EModelEndpoint;
  conversation: Partial<s.TConversation | s.TPreset>;
  possibleValues?: TPossibleValues;
  // TODO: POC for default schema
  // defaultSchema?: Partial<EndpointSchema>,
}) => {
  if (!endpoint) {
    throw new Error(`undefined endpoint: ${endpoint}`);
  }

  let schema = compactEndpointSchemas[endpoint];

  if (!schema && !endpointType) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  } else if (!schema && endpointType) {
    schema = compactEndpointSchemas[endpointType];
  }

  const convo = schema.parse(conversation) as s.TConversation;
  // const { models, secondaryModels } = possibleValues ?? {};
  const { models } = possibleValues ?? {};

  if (models && convo) {
    convo.model = getFirstDefinedValue(models) ?? convo.model;
  }

  // if (secondaryModels && convo.agentOptions) {
  //   convo.agentOptionmodel = getFirstDefinedValue(secondaryModels) ?? convo.agentOptionmodel;
  // }

  return convo;
};

export function parseTextParts(contentParts: a.TMessageContentParts[]): string {
  let result = '';

  for (const part of contentParts) {
    if (part.type === ContentTypes.TEXT) {
      const textValue = typeof part.text === 'string' ? part.text : part.text.value;

      if (
        result.length > 0 &&
        textValue.length > 0 &&
        result[result.length - 1] !== ' ' &&
        textValue[0] !== ' '
      ) {
        result += ' ';
      }
      result += textValue;
    }
  }

  return result;
}

export const SEPARATORS = ['.', '?', '!', '۔', '。', '‥', ';', '¡', '¿', '\n', '```'];

export function findLastSeparatorIndex(text: string, separators = SEPARATORS): number {
  let lastIndex = -1;
  for (const separator of separators) {
    const index = text.lastIndexOf(separator);
    if (index > lastIndex) {
      lastIndex = index;
    }
  }
  return lastIndex;
}

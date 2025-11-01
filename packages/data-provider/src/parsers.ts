import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import type { ZodIssue } from 'zod';
import type * as a from './types/assistants';
import type * as s from './schemas';
import type * as t from './types';
import { ContentTypes } from './types/runs';

dayjs.extend(utc);
dayjs.extend(timezone);
import {
  openAISchema,
  googleSchema,
  EModelEndpoint,
  anthropicSchema,
  assistantSchema,
  gptPluginsSchema,
  // agentsSchema,
  compactAgentsSchema,
  compactGoogleSchema,
  compactPluginsSchema,
  compactAssistantSchema,
} from './schemas';
import { bedrockInputSchema } from './bedrock';
import { alternateName } from './config';

type EndpointSchema =
  | typeof openAISchema
  | typeof googleSchema
  | typeof anthropicSchema
  | typeof gptPluginsSchema
  | typeof assistantSchema
  | typeof compactAgentsSchema
  | typeof bedrockInputSchema;

export type EndpointSchemaKey = Exclude<EModelEndpoint, EModelEndpoint.chatGPTBrowser>;

const endpointSchemas: Record<EndpointSchemaKey, EndpointSchema> = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.custom]: openAISchema,
  [EModelEndpoint.google]: googleSchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
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
  endpoint: EndpointSchemaKey;
  endpointType?: EndpointSchemaKey | null;
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

/** Match GPT followed by digit, optional decimal, and optional suffix
 *
 * Examples: gpt-4, gpt-4o, gpt-4.5, gpt-5a, etc. */
const extractGPTVersion = (modelStr: string): string => {
  const gptMatch = modelStr.match(/gpt-(\d+(?:\.\d+)?)([a-z])?/i);
  if (gptMatch) {
    const version = gptMatch[1];
    const suffix = gptMatch[2] || '';
    return `GPT-${version}${suffix}`;
  }
  return '';
};

/** Match omni models (o1, o3, etc.), "o" followed by a digit, possibly with decimal */
const extractOmniVersion = (modelStr: string): string => {
  const omniMatch = modelStr.match(/\bo(\d+(?:\.\d+)?)\b/i);
  if (omniMatch) {
    const version = omniMatch[1];
    return `o${version}`;
  }
  return '';
};

export const getResponseSender = (endpointOption: t.TEndpointOption): string => {
  const {
    model: _m,
    endpoint: _e,
    endpointType,
    modelDisplayLabel: _mdl,
    chatGptLabel: _cgl,
    modelLabel: _ml,
  } = endpointOption;

  const endpoint = _e as EModelEndpoint;

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
    } else if (model && extractOmniVersion(model)) {
      return extractOmniVersion(model);
    } else if (model && (model.includes('mistral') || model.includes('codestral'))) {
      return 'Mistral';
    } else if (model && model.includes('deepseek')) {
      return 'Deepseek';
    } else if (model && model.includes('gpt-')) {
      const gptVersion = extractGPTVersion(model);
      return gptVersion || 'GPT';
    }
    return (alternateName[endpoint] as string | undefined) ?? 'ChatGPT';
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
    } else if (model?.toLowerCase().includes('gemma') === true) {
      return 'Gemma';
    }

    return 'Gemini';
  }

  if (endpoint === EModelEndpoint.custom || endpointType === EModelEndpoint.custom) {
    if (modelLabel) {
      return modelLabel;
    } else if (chatGptLabel) {
      return chatGptLabel;
    } else if (model && extractOmniVersion(model)) {
      return extractOmniVersion(model);
    } else if (model && (model.includes('mistral') || model.includes('codestral'))) {
      return 'Mistral';
    } else if (model && model.includes('deepseek')) {
      return 'Deepseek';
    } else if (model && model.includes('gpt-')) {
      const gptVersion = extractGPTVersion(model);
      return gptVersion || 'GPT';
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
  | typeof anthropicSchema
  | typeof bedrockInputSchema
  | typeof compactPluginsSchema;

const compactEndpointSchemas: Record<EndpointSchemaKey, CompactEndpointSchema> = {
  [EModelEndpoint.openAI]: openAISchema,
  [EModelEndpoint.azureOpenAI]: openAISchema,
  [EModelEndpoint.custom]: openAISchema,
  [EModelEndpoint.assistants]: compactAssistantSchema,
  [EModelEndpoint.azureAssistants]: compactAssistantSchema,
  [EModelEndpoint.agents]: compactAgentsSchema,
  [EModelEndpoint.google]: compactGoogleSchema,
  [EModelEndpoint.bedrock]: bedrockInputSchema,
  [EModelEndpoint.anthropic]: anthropicSchema,
  [EModelEndpoint.gptPlugins]: compactPluginsSchema,
};

export const parseCompactConvo = ({
  endpoint,
  endpointType,
  conversation,
  possibleValues,
}: {
  endpoint?: EndpointSchemaKey;
  endpointType?: EndpointSchemaKey | null;
  conversation: Partial<s.TConversation | s.TPreset>;
  possibleValues?: TPossibleValues;
  // TODO: POC for default schema
  // defaultSchema?: Partial<EndpointSchema>,
}) => {
  if (!endpoint) {
    throw new Error(`undefined endpoint: ${endpoint}`);
  }

  let schema = compactEndpointSchemas[endpoint] as CompactEndpointSchema | undefined;

  if (!schema && !endpointType) {
    throw new Error(`Unknown endpoint: ${endpoint}`);
  } else if (!schema && endpointType) {
    schema = compactEndpointSchemas[endpointType];
  }

  if (!schema) {
    throw new Error(`Unknown endpointType: ${endpointType}`);
  }

  const convo = schema.parse(conversation) as s.TConversation | null;
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

export function parseTextParts(
  contentParts: a.TMessageContentParts[],
  skipReasoning: boolean = false,
): string {
  let result = '';

  for (const part of contentParts) {
    if (!part.type) {
      continue;
    }
    if (part.type === ContentTypes.TEXT) {
      const textValue = (typeof part.text === 'string' ? part.text : part.text?.value) || '';

      if (
        result.length > 0 &&
        textValue.length > 0 &&
        result[result.length - 1] !== ' ' &&
        textValue[0] !== ' '
      ) {
        result += ' ';
      }
      result += textValue;
    } else if (part.type === ContentTypes.THINK && !skipReasoning) {
      const textValue = typeof part.think === 'string' ? part.think : '';
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

/**
 * Replaces special variables in text with their corresponding values.
 * 
 * Available special variables:
 * - {{current_date}}: Current date in UTC (YYYY-MM-DD with day of week)
 * - {{current_datetime}}: Current datetime in UTC (YYYY-MM-DD HH:mm:ss with day of week)
 * - {{iso_datetime}}: Current datetime in ISO 8601 format (UTC)
 * - {{local_date}}: Current date in user's local timezone (YYYY-MM-DD with day of week)
 * - {{local_datetime}}: Current datetime in user's local timezone (YYYY-MM-DD HH:mm:ss with day of week)
 * - {{current_user}}: Name of the current user (if available)
 * 
 * Day of week values: 0=Sunday, 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday
 * 
 * Note: {{local_date}} and {{local_datetime}} require the timezone parameter.
 * If timezone is not provided, they will fall back to UTC values.
 * 
 * @example
 * ```typescript
 * replaceSpecialVars({ 
 *   text: 'Today is {{local_date}} and it\'s {{current_user}}\'s session',
 *   user: { name: 'John' },
 *   timezone: 'America/New_York'
 * });
 * // Result: "Today is 2024-04-29 (1) and it's John's session"
 * ```
 * 
 * @param text - The text containing special variables to replace
 * @param user - Optional user object containing user information
 * @param timezone - Optional IANA timezone string (e.g., 'America/New_York', 'Europe/London', 'Asia/Tokyo')
 * @returns The text with all special variables replaced with their values
 */
export function replaceSpecialVars({
  text,
  user,
  timezone,
}: {
  text: string;
  user?: t.TUser | null;
  timezone?: string;
}) {
  let result = text;
  if (!result) {
    return result;
  }

  // e.g., "2024-04-29 (1)" (1=Monday)
  const currentDate = dayjs().format('YYYY-MM-DD');
  const dayNumber = dayjs().day();
  const combinedDate = `${currentDate} (${dayNumber})`;
  result = result.replace(/{{current_date}}/gi, combinedDate);

  const currentDatetime = dayjs().format('YYYY-MM-DD HH:mm:ss');
  result = result.replace(/{{current_datetime}}/gi, `${currentDatetime} (${dayNumber})`);

  const isoDatetime = dayjs().toISOString();
  result = result.replace(/{{iso_datetime}}/gi, isoDatetime);

  // Local timezone support
  if (timezone) {
    try {
      const localDate = dayjs().tz(timezone).format('YYYY-MM-DD');
      const localDayNumber = dayjs().tz(timezone).day();
      const localCombinedDate = `${localDate} (${localDayNumber})`;
      result = result.replace(/{{local_date}}/gi, localCombinedDate);

      const localDatetime = dayjs().tz(timezone).format('YYYY-MM-DD HH:mm:ss');
      result = result.replace(/{{local_datetime}}/gi, `${localDatetime} (${localDayNumber})`);
    } catch {
      // If timezone is invalid, fall back to UTC values for local_* variables
      result = result.replace(/{{local_date}}/gi, combinedDate);
      result = result.replace(/{{local_datetime}}/gi, `${currentDatetime} (${dayNumber})`);
    }
  } else {
    // If no timezone is provided, replace local_* variables with UTC values
    result = result.replace(/{{local_date}}/gi, combinedDate);
    result = result.replace(/{{local_datetime}}/gi, `${currentDatetime} (${dayNumber})`);
  }

  if (user && user.name) {
    result = result.replace(/{{current_user}}/gi, user.name);
  }

  return result;
}

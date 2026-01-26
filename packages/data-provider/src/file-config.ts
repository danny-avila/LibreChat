import { z } from 'zod';
import type { EndpointFileConfig, FileConfig } from './types/files';
import { EModelEndpoint, isAgentsEndpoint, isDocumentSupportedProvider } from './schemas';
import { normalizeEndpointName } from './utils';

export const supportsFiles = {
  [EModelEndpoint.openAI]: true,
  [EModelEndpoint.google]: true,
  [EModelEndpoint.assistants]: true,
  [EModelEndpoint.azureAssistants]: true,
  [EModelEndpoint.agents]: true,
  [EModelEndpoint.azureOpenAI]: true,
  [EModelEndpoint.anthropic]: true,
  [EModelEndpoint.custom]: true,
  [EModelEndpoint.bedrock]: true,
};

export const excelFileTypes = [
  'application/vnd.ms-excel',
  'application/msexcel',
  'application/x-msexcel',
  'application/x-ms-excel',
  'application/x-excel',
  'application/x-dos_ms_excel',
  'application/xls',
  'application/x-xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

export const fullMimeTypesList = [
  'text/x-c',
  'text/x-c++',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
  'text/x-java',
  'application/json',
  'text/markdown',
  'application/pdf',
  'text/x-php',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/x-python',
  'text/x-script.python',
  'text/x-ruby',
  'text/x-tex',
  'text/plain',
  'text/css',
  'text/vtt',
  'image/jpeg',
  'text/javascript',
  'image/gif',
  'image/png',
  'image/heic',
  'image/heif',
  'application/x-tar',
  'application/typescript',
  'application/xml',
  'application/zip',
  'image/svg',
  'image/svg+xml',
  // Video formats
  'video/mp4',
  'video/avi',
  'video/mov',
  'video/wmv',
  'video/flv',
  'video/webm',
  'video/mkv',
  'video/m4v',
  'video/3gp',
  'video/ogv',
  // Audio formats
  'audio/mp3',
  'audio/wav',
  'audio/ogg',
  'audio/m4a',
  'audio/aac',
  'audio/flac',
  'audio/wma',
  'audio/opus',
  'audio/mpeg',
  ...excelFileTypes,
];

export const codeInterpreterMimeTypesList = [
  'text/x-c',
  'text/x-c++',
  'application/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
  'text/x-java',
  'application/json',
  'text/markdown',
  'application/pdf',
  'text/x-php',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/x-python',
  'text/x-script.python',
  'text/x-ruby',
  'text/x-tex',
  'text/plain',
  'text/css',
  'image/jpeg',
  'text/javascript',
  'image/gif',
  'image/png',
  'image/heic',
  'image/heif',
  'application/x-tar',
  'application/typescript',
  'application/xml',
  'application/zip',
  ...excelFileTypes,
];

export const retrievalMimeTypesList = [
  'text/x-c',
  'text/x-c++',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/html',
  'text/x-java',
  'application/json',
  'text/markdown',
  'application/pdf',
  'text/x-php',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/x-python',
  'text/x-script.python',
  'text/x-ruby',
  'text/x-tex',
  'text/plain',
];

export const imageExtRegex = /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i;

export const excelMimeTypes =
  /^application\/(vnd\.ms-excel|msexcel|x-msexcel|x-ms-excel|x-excel|x-dos_ms_excel|xls|x-xls|vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet)$/;

export const textMimeTypes =
  /^(text\/(x-c|x-csharp|tab-separated-values|x-c\+\+|x-h|x-java|html|markdown|x-php|x-python|x-script\.python|x-ruby|x-tex|plain|css|vtt|javascript|csv|xml))$/;

export const applicationMimeTypes =
  /^(application\/(epub\+zip|csv|json|pdf|x-tar|typescript|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)|xml|zip))$/;

export const imageMimeTypes = /^image\/(jpeg|gif|png|webp|heic|heif)$/;

export const audioMimeTypes =
  /^audio\/(mp3|mpeg|mpeg3|wav|wave|x-wav|ogg|vorbis|mp4|m4a|x-m4a|flac|x-flac|webm|aac|wma|opus)$/;

export const videoMimeTypes = /^video\/(mp4|avi|mov|wmv|flv|webm|mkv|m4v|3gp|ogv)$/;

export const defaultOCRMimeTypes = [
  imageMimeTypes,
  /^application\/pdf$/,
  /^application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)$/,
  /^application\/vnd\.ms-(word|powerpoint|excel)$/,
  /^application\/epub\+zip$/,
];

export const defaultTextMimeTypes = [/^[\w.-]+\/[\w.-]+$/];

export const defaultSTTMimeTypes = [audioMimeTypes];

export const supportedMimeTypes = [
  textMimeTypes,
  excelMimeTypes,
  applicationMimeTypes,
  imageMimeTypes,
  videoMimeTypes,
  audioMimeTypes,
  /** Supported by LC Code Interpreter API */
  /^image\/(svg|svg\+xml)$/,
];

export const codeInterpreterMimeTypes = [
  textMimeTypes,
  excelMimeTypes,
  applicationMimeTypes,
  imageMimeTypes,
];

export const codeTypeMapping: { [key: string]: string } = {
  c: 'text/x-c',
  cs: 'text/x-csharp',
  cpp: 'text/x-c++',
  h: 'text/x-h',
  md: 'text/markdown',
  php: 'text/x-php',
  py: 'text/x-python',
  rb: 'text/x-ruby',
  tex: 'text/x-tex',
  js: 'text/javascript',
  sh: 'application/x-sh',
  ts: 'application/typescript',
  tar: 'application/x-tar',
  zip: 'application/zip',
  yml: 'application/x-yaml',
  yaml: 'application/x-yaml',
  log: 'text/plain',
  tsv: 'text/tab-separated-values',
};

/** Maps image extensions to MIME types for formats browsers may not recognize */
export const imageTypeMapping: { [key: string]: string } = {
  heic: 'image/heic',
  heif: 'image/heif',
};

/**
 * Infers the MIME type from a file's extension when the browser doesn't recognize it
 * @param fileName - The name of the file including extension
 * @param currentType - The current MIME type reported by the browser (may be empty)
 * @returns The inferred MIME type if browser didn't provide one, otherwise the original type
 */
export function inferMimeType(fileName: string, currentType: string): string {
  if (currentType) {
    return currentType;
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  return codeTypeMapping[extension] || imageTypeMapping[extension] || currentType;
}

export const retrievalMimeTypes = [
  /^(text\/(x-c|x-c\+\+|x-h|html|x-java|markdown|x-php|x-python|x-script\.python|x-ruby|x-tex|plain|vtt|xml))$/,
  /^(application\/(json|pdf|vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|presentationml\.presentation)))$/,
];

export const megabyte = 1024 * 1024;
/** Helper function to get megabytes value */
export const mbToBytes = (mb: number): number => mb * megabyte;

const defaultSizeLimit = mbToBytes(512);
const defaultTokenLimit = 100000;
const assistantsFileConfig = {
  fileLimit: 10,
  fileSizeLimit: defaultSizeLimit,
  totalSizeLimit: defaultSizeLimit,
  supportedMimeTypes,
  disabled: false,
};

export const fileConfig = {
  endpoints: {
    [EModelEndpoint.assistants]: assistantsFileConfig,
    [EModelEndpoint.azureAssistants]: assistantsFileConfig,
    [EModelEndpoint.agents]: assistantsFileConfig,
    [EModelEndpoint.anthropic]: {
      fileLimit: 10,
      fileSizeLimit: defaultSizeLimit,
      totalSizeLimit: defaultSizeLimit,
      supportedMimeTypes,
      disabled: false,
    },
    default: {
      fileLimit: 10,
      fileSizeLimit: defaultSizeLimit,
      totalSizeLimit: defaultSizeLimit,
      supportedMimeTypes,
      disabled: false,
    },
  },
  serverFileSizeLimit: defaultSizeLimit,
  avatarSizeLimit: mbToBytes(2),
  fileTokenLimit: defaultTokenLimit,
  clientImageResize: {
    enabled: false,
    maxWidth: 1900,
    maxHeight: 1900,
    quality: 0.92,
  },
  ocr: {
    supportedMimeTypes: defaultOCRMimeTypes,
  },
  text: {
    supportedMimeTypes: defaultTextMimeTypes,
  },
  stt: {
    supportedMimeTypes: defaultSTTMimeTypes,
  },
  checkType: function (fileType: string, supportedTypes: RegExp[] = supportedMimeTypes) {
    return supportedTypes.some((regex) => regex.test(fileType));
  },
};

const supportedMimeTypesSchema = z
  .array(z.any())
  .optional()
  .refine(
    (mimeTypes) => {
      if (!mimeTypes) {
        return true;
      }
      return mimeTypes.every(
        (mimeType) => mimeType instanceof RegExp || typeof mimeType === 'string',
      );
    },
    {
      message: 'Each mimeType must be a string or a RegExp object.',
    },
  );

export const endpointFileConfigSchema = z.object({
  disabled: z.boolean().optional(),
  fileLimit: z.number().min(0).optional(),
  fileSizeLimit: z.number().min(0).optional(),
  totalSizeLimit: z.number().min(0).optional(),
  supportedMimeTypes: supportedMimeTypesSchema.optional(),
});

export const fileConfigSchema = z.object({
  endpoints: z.record(endpointFileConfigSchema).optional(),
  serverFileSizeLimit: z.number().min(0).optional(),
  avatarSizeLimit: z.number().min(0).optional(),
  fileTokenLimit: z.number().min(0).optional(),
  imageGeneration: z
    .object({
      percentage: z.number().min(0).max(100).optional(),
      px: z.number().min(0).optional(),
    })
    .optional(),
  clientImageResize: z
    .object({
      enabled: z.boolean().optional(),
      maxWidth: z.number().min(0).optional(),
      maxHeight: z.number().min(0).optional(),
      quality: z.number().min(0).max(1).optional(),
    })
    .optional(),
  ocr: z
    .object({
      supportedMimeTypes: supportedMimeTypesSchema.optional(),
    })
    .optional(),
  text: z
    .object({
      supportedMimeTypes: supportedMimeTypesSchema.optional(),
    })
    .optional(),
});

export type TFileConfig = z.infer<typeof fileConfigSchema>;

/** Helper function to safely convert string patterns to RegExp objects */
export const convertStringsToRegex = (patterns: string[]): RegExp[] =>
  patterns.reduce((acc: RegExp[], pattern) => {
    try {
      const regex = new RegExp(pattern);
      acc.push(regex);
    } catch (error) {
      console.error(`Invalid regex pattern "${pattern}" skipped.`, error);
    }
    return acc;
  }, []);

/**
 * Gets the appropriate endpoint file configuration with standardized lookup logic.
 *
 * @param params - Object containing fileConfig, endpoint, and optional conversationEndpoint
 * @param params.fileConfig - The merged file configuration
 * @param params.endpoint - The endpoint name to look up
 * @param params.conversationEndpoint - Optional conversation endpoint for additional context
 * @returns The endpoint file configuration or undefined
 */
/**
 * Merges an endpoint config with the default config to ensure all fields are populated.
 * For document-supported providers, uses the comprehensive MIME type list (includes videos/audio).
 */
function mergeWithDefault(
  endpointConfig: EndpointFileConfig,
  defaultConfig: EndpointFileConfig,
  endpoint?: string | null,
): EndpointFileConfig {
  /** Use comprehensive MIME types for document-supported providers */
  const defaultMimeTypes = isDocumentSupportedProvider(endpoint)
    ? supportedMimeTypes
    : defaultConfig.supportedMimeTypes;

  return {
    disabled: endpointConfig.disabled ?? defaultConfig.disabled,
    fileLimit: endpointConfig.fileLimit ?? defaultConfig.fileLimit,
    fileSizeLimit: endpointConfig.fileSizeLimit ?? defaultConfig.fileSizeLimit,
    totalSizeLimit: endpointConfig.totalSizeLimit ?? defaultConfig.totalSizeLimit,
    supportedMimeTypes: endpointConfig.supportedMimeTypes ?? defaultMimeTypes,
  };
}

export function getEndpointFileConfig(params: {
  fileConfig?: FileConfig | null;
  endpoint?: string | null;
  endpointType?: string | null;
}): EndpointFileConfig {
  const { fileConfig: mergedFileConfig, endpoint, endpointType } = params;

  if (!mergedFileConfig?.endpoints) {
    return fileConfig.endpoints.default;
  }

  /** Compute an effective default by merging user-configured default over the base default */
  const baseDefaultConfig = fileConfig.endpoints.default;
  const userDefaultConfig = mergedFileConfig.endpoints.default;
  const defaultConfig = userDefaultConfig
    ? mergeWithDefault(userDefaultConfig, baseDefaultConfig, 'default')
    : baseDefaultConfig;

  const normalizedEndpoint = normalizeEndpointName(endpoint ?? '');
  const standardEndpoints = new Set([
    'default',
    EModelEndpoint.agents,
    EModelEndpoint.assistants,
    EModelEndpoint.azureAssistants,
    EModelEndpoint.openAI,
    EModelEndpoint.azureOpenAI,
    EModelEndpoint.anthropic,
    EModelEndpoint.google,
    EModelEndpoint.bedrock,
  ]);

  const normalizedEndpointType = normalizeEndpointName(endpointType ?? '');
  const isCustomEndpoint =
    endpointType === EModelEndpoint.custom ||
    (!standardEndpoints.has(normalizedEndpointType) &&
      normalizedEndpoint &&
      !standardEndpoints.has(normalizedEndpoint));

  if (isCustomEndpoint) {
    /** 1. Check direct endpoint lookup (could be normalized or not) */
    if (endpoint && mergedFileConfig.endpoints[endpoint]) {
      return mergeWithDefault(mergedFileConfig.endpoints[endpoint], defaultConfig, endpoint);
    }
    /** 2. Check normalized endpoint lookup (skip standard endpoint keys) */
    for (const key in mergedFileConfig.endpoints) {
      if (!standardEndpoints.has(key) && normalizeEndpointName(key) === normalizedEndpoint) {
        return mergeWithDefault(mergedFileConfig.endpoints[key], defaultConfig, key);
      }
    }
    /** 3. Fallback to generic 'custom' config if any */
    if (mergedFileConfig.endpoints[EModelEndpoint.custom]) {
      return mergeWithDefault(
        mergedFileConfig.endpoints[EModelEndpoint.custom],
        defaultConfig,
        endpoint,
      );
    }
    /** 4. Fallback to 'agents' (all custom endpoints are non-assistants) */
    if (mergedFileConfig.endpoints[EModelEndpoint.agents]) {
      return mergeWithDefault(
        mergedFileConfig.endpoints[EModelEndpoint.agents],
        defaultConfig,
        endpoint,
      );
    }
    /** 5. Fallback to default */
    return defaultConfig;
  }

  /** Check endpointType first (most reliable for standard endpoints) */
  if (endpointType && mergedFileConfig.endpoints[endpointType]) {
    return mergeWithDefault(mergedFileConfig.endpoints[endpointType], defaultConfig, endpointType);
  }

  /** Check direct endpoint lookup */
  if (endpoint && mergedFileConfig.endpoints[endpoint]) {
    return mergeWithDefault(mergedFileConfig.endpoints[endpoint], defaultConfig, endpoint);
  }

  /** Check normalized endpoint */
  if (normalizedEndpoint && mergedFileConfig.endpoints[normalizedEndpoint]) {
    return mergeWithDefault(
      mergedFileConfig.endpoints[normalizedEndpoint],
      defaultConfig,
      normalizedEndpoint,
    );
  }

  /** Fallback to agents if endpoint is explicitly agents */
  const isAgents = isAgentsEndpoint(normalizedEndpointType || normalizedEndpoint);
  if (isAgents && mergedFileConfig.endpoints[EModelEndpoint.agents]) {
    return mergeWithDefault(
      mergedFileConfig.endpoints[EModelEndpoint.agents],
      defaultConfig,
      EModelEndpoint.agents,
    );
  }

  /** Return default config */
  return defaultConfig;
}

export function mergeFileConfig(dynamic: z.infer<typeof fileConfigSchema> | undefined): FileConfig {
  const mergedConfig: FileConfig = {
    ...fileConfig,
    endpoints: {
      ...fileConfig.endpoints,
    },
    ocr: {
      ...fileConfig.ocr,
      supportedMimeTypes: fileConfig.ocr?.supportedMimeTypes || [],
    },
    text: {
      ...fileConfig.text,
      supportedMimeTypes: fileConfig.text?.supportedMimeTypes || [],
    },
    stt: {
      ...fileConfig.stt,
      supportedMimeTypes: fileConfig.stt?.supportedMimeTypes || [],
    },
  };
  if (!dynamic) {
    return mergedConfig;
  }

  if (dynamic.serverFileSizeLimit !== undefined) {
    mergedConfig.serverFileSizeLimit = mbToBytes(dynamic.serverFileSizeLimit);
  }

  if (dynamic.avatarSizeLimit !== undefined) {
    mergedConfig.avatarSizeLimit = mbToBytes(dynamic.avatarSizeLimit);
  }

  if (dynamic.fileTokenLimit !== undefined) {
    mergedConfig.fileTokenLimit = dynamic.fileTokenLimit;
  }

  // Merge clientImageResize configuration
  if (dynamic.clientImageResize !== undefined) {
    mergedConfig.clientImageResize = {
      ...mergedConfig.clientImageResize,
      ...dynamic.clientImageResize,
    };
  }

  if (dynamic.ocr !== undefined) {
    mergedConfig.ocr = {
      ...mergedConfig.ocr,
      ...dynamic.ocr,
    };
    if (dynamic.ocr.supportedMimeTypes) {
      mergedConfig.ocr.supportedMimeTypes = convertStringsToRegex(dynamic.ocr.supportedMimeTypes);
    }
  }

  if (dynamic.text !== undefined) {
    mergedConfig.text = {
      ...mergedConfig.text,
      ...dynamic.text,
    };
    if (dynamic.text.supportedMimeTypes) {
      mergedConfig.text.supportedMimeTypes = convertStringsToRegex(dynamic.text.supportedMimeTypes);
    }
  }

  if (!dynamic.endpoints) {
    return mergedConfig;
  }

  for (const key in dynamic.endpoints) {
    const dynamicEndpoint = (dynamic.endpoints as Record<string, EndpointFileConfig>)[key];

    /** Deep copy the base endpoint config if it exists to prevent mutation */
    if (!mergedConfig.endpoints[key]) {
      mergedConfig.endpoints[key] = {};
    } else {
      mergedConfig.endpoints[key] = { ...mergedConfig.endpoints[key] };
    }

    const mergedEndpoint = mergedConfig.endpoints[key];

    if (dynamicEndpoint.disabled === true) {
      mergedEndpoint.disabled = true;
      mergedEndpoint.fileLimit = 0;
      mergedEndpoint.fileSizeLimit = 0;
      mergedEndpoint.totalSizeLimit = 0;
      mergedEndpoint.supportedMimeTypes = [];
      continue;
    }

    if (dynamicEndpoint.fileSizeLimit !== undefined) {
      mergedEndpoint.fileSizeLimit = mbToBytes(dynamicEndpoint.fileSizeLimit);
    }

    if (dynamicEndpoint.totalSizeLimit !== undefined) {
      mergedEndpoint.totalSizeLimit = mbToBytes(dynamicEndpoint.totalSizeLimit);
    }

    const configKeys = ['fileLimit'] as const;
    configKeys.forEach((field) => {
      if (dynamicEndpoint[field] !== undefined) {
        mergedEndpoint[field] = dynamicEndpoint[field];
      }
    });

    if (dynamicEndpoint.disabled !== undefined) {
      mergedEndpoint.disabled = dynamicEndpoint.disabled;
    }

    if (dynamicEndpoint.supportedMimeTypes) {
      mergedEndpoint.supportedMimeTypes = convertStringsToRegex(
        dynamicEndpoint.supportedMimeTypes as unknown as string[],
      );
    }
  }

  return mergedConfig;
}

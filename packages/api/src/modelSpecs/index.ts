import {
  parseCompactConvo,
  replaceSpecialVars,
  type EModelEndpoint,
  type TConversation,
  type TModelSpec,
  type TModelSpecPreset,
  type TPreset,
  type TSpecsConfig,
  type TUser,
} from 'librechat-data-provider';

export const PRIVATE_MODEL_SPEC_PRESET_FIELDS = [
  'promptPrefix',
  'instructions',
  'additional_instructions',
  'system',
  'context',
  'examples',
] as const satisfies readonly (keyof TModelSpecPreset)[];

export type PrivateModelSpecPresetField = (typeof PRIVATE_MODEL_SPEC_PRESET_FIELDS)[number];
export type ModelSpecParsedBody = Partial<TConversation | TPreset | TModelSpecPreset> &
  Record<string, unknown>;

export type ApplyModelSpecPresetParams = {
  modelSpec: TModelSpec;
  parsedBody: ModelSpecParsedBody;
  endpoint?: string | null;
  endpointType?: string | null;
  defaultParamsEndpoint?: string | null;
  includePresetDefaults?: boolean;
};

export type ApplyModelSpecPresetResult = {
  parsedBody: ModelSpecParsedBody;
  appliedPrivateFields: Set<PrivateModelSpecPresetField>;
};

function hasModelSpecValue(field: PrivateModelSpecPresetField, value: unknown): boolean {
  if (value == null || value === '') {
    return false;
  }

  if (!Array.isArray(value)) {
    return true;
  }

  if (field === 'examples') {
    return value.some((example) => {
      const input = example?.input?.content;
      const output = example?.output?.content;
      return Boolean(input || output);
    });
  }

  return value.length > 0;
}

function mergeModelSpecPreset(
  modelSpec: TModelSpec,
  parsedBody: ModelSpecParsedBody,
  { includePresetDefaults = false }: Pick<ApplyModelSpecPresetParams, 'includePresetDefaults'> = {},
): ApplyModelSpecPresetResult {
  const preset = modelSpec.preset;
  const merged = {
    ...(includePresetDefaults ? preset : {}),
    ...parsedBody,
    spec: modelSpec.name,
  } as ModelSpecParsedBody;
  const appliedPrivateFields = new Set<PrivateModelSpecPresetField>();

  for (const field of PRIVATE_MODEL_SPEC_PRESET_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(preset, field)) {
      continue;
    }

    if (includePresetDefaults) {
      appliedPrivateFields.add(field);
      continue;
    }

    if (!hasModelSpecValue(field, parsedBody[field])) {
      (merged as Record<string, unknown>)[field] = preset[field];
      appliedPrivateFields.add(field);
    }
  }

  return { parsedBody: merged, appliedPrivateFields };
}

export function findModelSpecByName(
  modelSpecs: Pick<TSpecsConfig, 'list'> | undefined,
  spec: string | null | undefined,
): TModelSpec | undefined {
  if (!spec) {
    return undefined;
  }

  return modelSpecs?.list?.find((modelSpec) => modelSpec.name === spec);
}

export function isModelSpecEndpointMatch(
  modelSpec: Pick<TModelSpec, 'preset'> | undefined,
  endpoint: string | null | undefined,
): boolean {
  return Boolean(modelSpec && endpoint === modelSpec.preset?.endpoint);
}

export function applyModelSpecPreset({
  modelSpec,
  parsedBody,
  endpoint,
  endpointType,
  defaultParamsEndpoint,
  includePresetDefaults,
}: ApplyModelSpecPresetParams): ApplyModelSpecPresetResult {
  const { parsedBody: conversation, appliedPrivateFields } = mergeModelSpecPreset(
    modelSpec,
    parsedBody,
    {
      includePresetDefaults,
    },
  );
  const reparsedBody = parseCompactConvo({
    endpoint: endpoint as EModelEndpoint | undefined,
    endpointType: endpointType as EModelEndpoint | null | undefined,
    conversation,
    defaultParamsEndpoint,
  });

  if (!reparsedBody) {
    throw new Error('Model spec preset produced an empty parsed body');
  }

  const modelSpecParsedBody = reparsedBody as ModelSpecParsedBody;
  if (modelSpec.iconURL != null && modelSpec.iconURL !== '') {
    modelSpecParsedBody.iconURL = modelSpec.iconURL;
  }

  return { parsedBody: modelSpecParsedBody, appliedPrivateFields };
}

export function resolveModelSpecPromptPrefixVariables<T extends { promptPrefix?: string | null }>(
  parsedBody: T,
  user?: TUser | null,
  now?: string | number | Date,
): T {
  if (typeof parsedBody.promptPrefix !== 'string') {
    return parsedBody;
  }

  return {
    ...parsedBody,
    promptPrefix: replaceSpecialVars({
      text: parsedBody.promptPrefix,
      user,
      now,
    }),
  };
}

export function sanitizeModelSpecs<T extends Partial<TSpecsConfig> | null | undefined>(
  modelSpecs: T,
): T {
  if (!modelSpecs?.list || !Array.isArray(modelSpecs.list)) {
    return modelSpecs;
  }

  return {
    ...modelSpecs,
    list: modelSpecs.list.map((modelSpec) => {
      const preset = modelSpec?.preset;
      if (!preset || typeof preset !== 'object') {
        return modelSpec;
      }

      const sanitizedPreset = { ...preset };
      for (const field of PRIVATE_MODEL_SPEC_PRESET_FIELDS) {
        delete sanitizedPreset[field];
      }

      return {
        ...modelSpec,
        preset: sanitizedPreset,
      };
    }),
  } as T;
}

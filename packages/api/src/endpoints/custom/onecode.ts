export type OneCodeMetadata = {
  workspace?: string;
};

export function buildOneCodeModelKwargs(
  modelKwargs: Record<string, unknown> | undefined,
  metadata: OneCodeMetadata | undefined,
): Record<string, unknown> | undefined {
  const workspace = typeof metadata?.workspace === 'string' ? metadata.workspace.trim() : '';
  if (!workspace) {
    return modelKwargs;
  }
  const currentMetadata =
    modelKwargs?.metadata != null && typeof modelKwargs.metadata === 'object'
      ? (modelKwargs.metadata as Record<string, unknown>)
      : {};
  return {
    ...(modelKwargs ?? {}),
    metadata: { ...currentMetadata, workspace },
  };
}

export function buildOneCodeLLMConfig(
  llmConfig: Record<string, unknown>,
  metadata: OneCodeMetadata | undefined,
): Record<string, unknown> {
  const modelKwargs =
    llmConfig.modelKwargs != null && typeof llmConfig.modelKwargs === 'object'
      ? (llmConfig.modelKwargs as Record<string, unknown>)
      : undefined;
  const nextModelKwargs = buildOneCodeModelKwargs(modelKwargs, metadata);

  return {
    ...llmConfig,
    maxRetries: 0,
    ...(nextModelKwargs == null ? {} : { modelKwargs: nextModelKwargs }),
  };
}

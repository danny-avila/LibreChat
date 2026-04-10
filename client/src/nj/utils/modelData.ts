type ModelInfo = {
  name: string;
  knowledgeCutoff: string;
  released: string;
};

const modelData: Record<string, ModelInfo> = {
  'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    name: 'Claude Sonnet 4.5',
    knowledgeCutoff: 'January 2025',
    released: 'September 2025',
  },
  'us.anthropic.claude-sonnet-4-6': {
    name: 'Claude Sonnet 4.6',
    knowledgeCutoff: 'August 2025',
    released: 'February 2026',
  },
};

export function getModelInfo(modelId: string | null): ModelInfo | null {
  return modelId ? modelData[modelId] : null;
}

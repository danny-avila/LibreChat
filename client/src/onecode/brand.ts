export const ONECODE_BRAND = {
  productName: 'OneCode',
  tagline: 'Local-first guarded agent workspace',
  endpointName: 'OneCode',
  defaultModel: 'onecode-agent',
} as const;

export const ONECODE_AGENT_CAPABILITIES = [
  { id: 'inspect', label: 'Inspect' },
  { id: 'plan', label: 'Plan' },
  { id: 'write', label: 'Guarded write' },
  { id: 'patch', label: 'Guarded patch' },
  { id: 'verify', label: 'Evidence' },
] as const;

export const ONECODE_STARTER_PROMPTS = [
  'Inspect this project structure',
  'Plan the smallest safe implementation',
  'Patch this issue with evidence',
  'Summarize the latest OneCode run',
] as const;

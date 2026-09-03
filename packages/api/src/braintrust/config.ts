export interface BraintrustConfig {
  enabled: boolean;
  projectName: string;
  apiKey?: string;
  appUrl?: string;
}

const DEFAULT_PROJECT_NAME = 'LibreChat';

function getTrimmedValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function getBraintrustConfig(env: NodeJS.ProcessEnv = process.env): BraintrustConfig {
  const apiKey = getTrimmedValue(env.BRAINTRUST_API_KEY);

  return {
    enabled: apiKey != null,
    projectName: getTrimmedValue(env.BRAINTRUST_PROJECT_NAME) ?? DEFAULT_PROJECT_NAME,
    apiKey,
    appUrl: getTrimmedValue(env.BRAINTRUST_APP_URL),
  };
}

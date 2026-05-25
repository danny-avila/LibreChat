import type { TConfig } from 'librechat-data-provider';

/**
 * Whether an endpoint config requires a user-provided credential
 * (API key or any Bedrock credential field) — i.e. should appear in
 * the API Keys settings tab. `userProvideURL` is intentionally excluded
 * since a user-provided base URL alone does not imply a user key.
 */
export const isUserProvidedEndpointConfig = (config: TConfig | null | undefined): boolean => {
  if (!config) {
    return false;
  }
  return (
    !!config.userProvide ||
    !!config.userProvideAccessKeyId ||
    !!config.userProvideSecretAccessKey ||
    !!config.userProvideSessionToken ||
    !!config.userProvideBearerToken
  );
};

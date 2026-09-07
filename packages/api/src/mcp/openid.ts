import type { UpstreamTokenProvider } from './oauth/obo';
import type { MCPOptions } from './types';
import { OpenIDReauthRequiredError } from '~/utils/oidc';

const OPENID_ACCESS_TOKEN_PATTERN = /\{\{LIBRECHAT_OPENID_(?:ACCESS_TOKEN|TOKEN)\}\}/;
const OPENID_ACCESS_TOKEN_REPLACEMENT_PATTERN = /\{\{LIBRECHAT_OPENID_(?:ACCESS_TOKEN|TOKEN)\}\}/g;

type DirectBearerConfig = MCPOptions & {
  dbId?: string;
  source?: 'yaml' | 'config' | 'user' | 'plugin';
  openidBearerRecovery?: boolean;
};

function getAuthorizationHeader(
  config: DirectBearerConfig,
): { name: string; value: string } | null {
  if (!('headers' in config) || !config.headers) {
    return null;
  }

  const entry = Object.entries(config.headers).find(
    ([name]) => name.toLowerCase() === 'authorization',
  );
  if (!entry || !OPENID_ACCESS_TOKEN_PATTERN.test(entry[1])) {
    return null;
  }
  return { name: entry[0], value: entry[1] };
}

/** Whether an operator explicitly trusted this direct OpenID bearer configuration to recover. */
export function usesDirectOpenIDBearerRecovery(config: DirectBearerConfig): boolean {
  if (config.openidBearerRecovery !== true || config.dbId != null) {
    return false;
  }
  if (config.source !== 'yaml' && config.source !== 'config') {
    return false;
  }
  return getAuthorizationHeader(config) != null;
}

/** Resolves the live bearer before a connection or request reaches the MCP transport. */
export async function resolveDirectOpenIDBearerConfig({
  config,
  upstreamTokenProvider,
  forceRefresh = false,
}: {
  config: DirectBearerConfig;
  upstreamTokenProvider?: UpstreamTokenProvider;
  forceRefresh?: boolean;
}): Promise<DirectBearerConfig> {
  if (!usesDirectOpenIDBearerRecovery(config)) {
    return config;
  }
  if (!upstreamTokenProvider) {
    throw new OpenIDReauthRequiredError(
      'A live OpenID session is required to recover this MCP bearer credential.',
    );
  }

  let tokens;
  try {
    tokens = await upstreamTokenProvider({ forceRefresh });
  } catch (error) {
    const reauthError = new OpenIDReauthRequiredError(
      'The OpenID session could not refresh the MCP bearer credential. Please sign in again.',
    );
    reauthError.cause = error;
    throw reauthError;
  }
  if (!tokens?.access_token) {
    throw new OpenIDReauthRequiredError(
      'The OpenID session has no usable MCP bearer credential. Please sign in again.',
    );
  }

  const authorization = getAuthorizationHeader(config);
  if (!authorization || !('headers' in config)) {
    return config;
  }
  return {
    ...config,
    headers: {
      ...config.headers,
      [authorization.name]: authorization.value.replace(
        OPENID_ACCESS_TOKEN_REPLACEMENT_PATTERN,
        tokens.access_token,
      ),
    },
  };
}

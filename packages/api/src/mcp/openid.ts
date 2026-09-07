import { extractEnvVariable } from 'librechat-data-provider';
import type { UpstreamTokenProvider } from './oauth/obo';
import type { MCPOptions } from './types';
import { isRetryableOboExchangeError } from './oauth/obo';
import { MCPAuthenticationRefreshError } from './errors';
import { OpenIDReauthRequiredError } from '~/utils/oidc';
import { isAbortError } from '~/utils/errors';

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
  return entry ? { name: entry[0], value: entry[1] } : null;
}

/** Expands an operator-owned environment indirection before looking for the OpenID placeholder. */
function getAuthorizationTemplateValue(value: string): string {
  return extractEnvVariable(value);
}

/** Whether a config retains the trusted direct-bearer mode after placeholder resolution. */
export function isDirectOpenIDBearerRecoveryEnabled(config: DirectBearerConfig): boolean {
  /** OBO is the stronger audience-bound mode and takes precedence when both legacy fields exist. */
  if (config.obo != null || config.openidBearerRecovery !== true || config.dbId != null) {
    return false;
  }
  if (config.source !== 'yaml' && config.source !== 'config') {
    return false;
  }
  return getAuthorizationHeader(config) != null;
}

/** Whether a trusted direct-bearer config still needs its live placeholder resolved. */
export function usesDirectOpenIDBearerRecovery(config: DirectBearerConfig): boolean {
  const authorization = getAuthorizationHeader(config);
  return (
    isDirectOpenIDBearerRecoveryEnabled(config) &&
    authorization != null &&
    OPENID_ACCESS_TOKEN_PATTERN.test(getAuthorizationTemplateValue(authorization.value))
  );
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
    if (isAbortError(error)) {
      throw error;
    }
    if (isRetryableOboExchangeError(error)) {
      throw new MCPAuthenticationRefreshError(error);
    }
    const reauthError = new OpenIDReauthRequiredError(
      'The OpenID session could not refresh the MCP bearer credential. Please sign in again.',
    );
    reauthError.cause = error;
    throw reauthError;
  }
  if (!tokens?.access_token) {
    /** A verified bearer-authenticated request has no Express session to refresh. Its
     * strategy-populated user token remains the authoritative non-forced fallback. */
    if (!forceRefresh) {
      return config;
    }
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
      [authorization.name]: getAuthorizationTemplateValue(authorization.value).replace(
        OPENID_ACCESS_TOKEN_REPLACEMENT_PATTERN,
        () => tokens.access_token!,
      ),
    },
  };
}

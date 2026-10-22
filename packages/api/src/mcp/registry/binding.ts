import { createHash } from 'crypto';
import type { MCPOptions } from '~/mcp/types';
import { isGeneratedUserApiKeyVariable } from '~/mcp/headers';
import { MCPApiKeyReentryRequiredError } from '~/mcp/errors';

/**
 * The parts of a server config that decide where its credentials are sent. Structural, so the
 * admin config tier can compare configs as librechat.yaml and overrides spell them, before the
 * schema fills defaults.
 */
export type CredentialBindingConfig = {
  type?: string;
  url?: string;
  proxy?: string;
  apiKey?: Partial<NonNullable<MCPOptions['apiKey']>>;
  oauth?: Partial<NonNullable<MCPOptions['oauth']>>;
};

function getUrl(config: CredentialBindingConfig): string | undefined {
  return 'url' in config ? config.url : undefined;
}

function getProxy(config: CredentialBindingConfig): string | undefined {
  return 'proxy' in config ? config.proxy : undefined;
}

function normalizeUrl(value?: string, stripFragment = false): string | undefined {
  if (!value) {
    return value;
  }

  try {
    const url = new URL(value);
    if (stripFragment) {
      url.hash = '';
    }
    return url.href;
  } catch {
    return value;
  }
}

function normalizeTransport(type?: string): string | undefined {
  return type === 'http' ? 'streamable-http' : type;
}

function normalizeCustomHeader(apiKey: CredentialBindingConfig['apiKey']): string | undefined {
  if (apiKey?.authorization_type !== 'custom') {
    return undefined;
  }
  return (apiKey.custom_header || 'X-Api-Key').toLowerCase();
}

function apiKeyBinding(config: CredentialBindingConfig): Record<string, string | undefined> {
  return {
    url: normalizeUrl(getUrl(config), true),
    type: normalizeTransport(config.type),
    proxy: normalizeUrl(getProxy(config), true),
    'apiKey.authorization_type': config.apiKey?.authorization_type,
    'apiKey.custom_header': normalizeCustomHeader(config.apiKey),
  };
}

/**
 * The request-boundary fields (`url`, `type`, `proxy`, `apiKey.authorization_type`,
 * `apiKey.custom_header`) that differ between two configs: where an `apiKey.key` would be sent.
 */
export function diffApiKeyBinding(
  existingConfig: CredentialBindingConfig,
  updatedConfig: CredentialBindingConfig,
): string[] {
  const existing = apiKeyBinding(existingConfig);
  const updated = apiKeyBinding(updatedConfig);
  return Object.keys(existing).filter((field) => existing[field] !== updated[field]);
}

/** Returns fields that would move an omitted, stored admin key to a new request boundary. */
export function getChangedApiKeyBindingFields(
  existingConfig: MCPOptions,
  updatedConfig: MCPOptions,
): string[] {
  const preservesStoredKey =
    existingConfig.apiKey?.source === 'admin' &&
    !!existingConfig.apiKey.key &&
    updatedConfig.apiKey?.source === 'admin' &&
    !updatedConfig.apiKey.key;

  if (!preservesStoredKey) {
    return [];
  }

  return diffApiKeyBinding(existingConfig, updatedConfig);
}

type OAuthOptions = NonNullable<MCPOptions['oauth']>;

function normalizeOAuthMethods(values?: readonly string[]): string | undefined {
  if (!values?.length) {
    return undefined;
  }
  return JSON.stringify([...new Set(values)].sort());
}

/**
 * Keeps the optional OAuth binding fields an update omits (`token_endpoint_auth_methods_supported`
 * and the revocation settings) at their stored values, so leaving them out reads as unchanged.
 */
export function preserveOmittedOAuthBindingFields<T extends Partial<OAuthOptions>>(
  existingOAuth: Partial<OAuthOptions>,
  updatedOAuth: T,
): T {
  return {
    ...updatedOAuth,
    ...(updatedOAuth.token_endpoint_auth_methods_supported === undefined &&
      existingOAuth.token_endpoint_auth_methods_supported !== undefined && {
        token_endpoint_auth_methods_supported: existingOAuth.token_endpoint_auth_methods_supported,
      }),
    ...(updatedOAuth.revocation_endpoint === undefined &&
      existingOAuth.revocation_endpoint !== undefined && {
        revocation_endpoint: existingOAuth.revocation_endpoint,
      }),
    ...(updatedOAuth.revocation_endpoint_auth_methods_supported === undefined &&
      existingOAuth.revocation_endpoint_auth_methods_supported !== undefined && {
        revocation_endpoint_auth_methods_supported:
          existingOAuth.revocation_endpoint_auth_methods_supported,
      }),
  };
}

/**
 * The fields that bind an OAuth client secret to its authorization server and client, which
 * differ between two configs: changing any of them while keeping a stored secret would hand that
 * secret to a different destination or client.
 */
export function getChangedOAuthSecretBindingFields(
  existingConfig: CredentialBindingConfig,
  updatedConfig: CredentialBindingConfig,
): string[] {
  const existingOAuth = existingConfig.oauth;
  const updatedOAuth = updatedConfig.oauth;
  if (!existingOAuth || !updatedOAuth) {
    return [];
  }

  const fields = [
    ['url', normalizeUrl(getUrl(existingConfig)), normalizeUrl(getUrl(updatedConfig))],
    [
      'oauth.authorization_url',
      normalizeUrl(existingOAuth.authorization_url),
      normalizeUrl(updatedOAuth.authorization_url),
    ],
    [
      'oauth.token_url',
      normalizeUrl(existingOAuth.token_url),
      normalizeUrl(updatedOAuth.token_url),
    ],
    ['oauth.client_id', existingOAuth.client_id, updatedOAuth.client_id],
    [
      'oauth.token_exchange_method',
      existingOAuth.token_exchange_method,
      updatedOAuth.token_exchange_method,
    ],
    [
      'oauth.token_endpoint_auth_methods_supported',
      normalizeOAuthMethods(existingOAuth.token_endpoint_auth_methods_supported),
      normalizeOAuthMethods(updatedOAuth.token_endpoint_auth_methods_supported),
    ],
    [
      'oauth.revocation_endpoint',
      normalizeUrl(existingOAuth.revocation_endpoint),
      normalizeUrl(updatedOAuth.revocation_endpoint),
    ],
    [
      'oauth.revocation_endpoint_auth_methods_supported',
      normalizeOAuthMethods(existingOAuth.revocation_endpoint_auth_methods_supported),
      normalizeOAuthMethods(updatedOAuth.revocation_endpoint_auth_methods_supported),
    ],
  ] as const;

  return fields.filter(([, existing, updated]) => existing !== updated).map(([field]) => field);
}

function userApiKeyBinding(config: MCPOptions): string {
  return JSON.stringify([
    apiKeyBinding(config),
    normalizeUrl(config.oauth?.authorization_url, true),
    normalizeUrl(config.oauth?.token_url, true),
    /** redirect_uri is sent as an OAuth parameter, not used as an outbound request URL. */
    normalizeUrl(config.oauth?.redirect_uri),
    normalizeUrl(config.oauth?.revocation_endpoint, true),
    config.oauth?.client_id,
  ]);
}

/** Uses the existing auth-field storage to bind each user's key to the request destination.
 *  Retains stored field names only for equivalent boundaries, including legacy names and
 *  names generated by earlier URL normalization. */
export function getUserApiKeyVariable(config: MCPOptions, existingConfig?: MCPOptions): string {
  const binding = userApiKeyBinding(config);
  if (existingConfig?.apiKey?.source === 'user' && binding === userApiKeyBinding(existingConfig)) {
    const variable = Object.keys(existingConfig.customUserVars ?? {}).find(
      isGeneratedUserApiKeyVariable,
    );
    if (variable) {
      return variable;
    }
  }
  return `MCP_API_KEY_${createHash('sha256').update(binding).digest('hex')}`;
}

/** Requires a replacement key before a stored admin credential can cross request boundaries. */
export function requireApiKeyReentryForRebinding(
  existingConfig: MCPOptions,
  updatedConfig: MCPOptions,
): void {
  const changedFields = getChangedApiKeyBindingFields(existingConfig, updatedConfig);
  if (changedFields.length > 0) {
    throw new MCPApiKeyReentryRequiredError(changedFields);
  }
}

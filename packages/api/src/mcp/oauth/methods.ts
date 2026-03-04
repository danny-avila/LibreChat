import { TokenExchangeMethodEnum } from 'librechat-data-provider';

type ClientAuthMethod = 'client_secret_basic' | 'client_secret_post' | 'none';

const SUPPORTED_AUTH_METHODS: ClientAuthMethod[] = [
  'client_secret_post',
  'client_secret_basic',
  'none',
];

/** Maps a user-facing `TokenExchangeMethodEnum` to an OAuth auth method string. */
export function getForcedTokenEndpointAuthMethod(
  tokenExchangeMethod?: TokenExchangeMethodEnum,
): 'client_secret_basic' | 'client_secret_post' | undefined {
  if (tokenExchangeMethod === TokenExchangeMethodEnum.DefaultPost) {
    return 'client_secret_post';
  }
  if (tokenExchangeMethod === TokenExchangeMethodEnum.BasicAuthHeader) {
    return 'client_secret_basic';
  }
  return undefined;
}

/**
 * Selects the auth method to request during dynamic client registration.
 *
 * Priority:
 * 1. Forced override from `tokenExchangeMethod` config
 * 2. Server's advertised preference (first supported match)
 * 3. Falls through to `defaultMethod` (caller's existing default)
 */
export function selectRegistrationAuthMethod(
  serverAdvertised: string[] | undefined,
  tokenExchangeMethod?: TokenExchangeMethodEnum,
): string | undefined {
  const forced = getForcedTokenEndpointAuthMethod(tokenExchangeMethod);
  if (forced) {
    return forced;
  }

  if (!serverAdvertised) {
    return undefined;
  }

  const serverPreferred = serverAdvertised.find((m) =>
    SUPPORTED_AUTH_METHODS.includes(m as ClientAuthMethod),
  );
  return serverPreferred ?? serverAdvertised[0];
}

/**
 * Resolves the auth method for token endpoint requests (refresh, pre-configured flows).
 *
 * Priority:
 * 1. Forced override from `tokenExchangeMethod` config
 * 2. Preferred method from client registration response (`clientInfo.token_endpoint_auth_method`)
 * 3. First match from server's advertised methods
 */
export function resolveTokenEndpointAuthMethod(options: {
  tokenExchangeMethod?: TokenExchangeMethodEnum;
  tokenAuthMethods: string[];
  preferredMethod?: string;
}): 'client_secret_basic' | 'client_secret_post' | undefined {
  const forced = getForcedTokenEndpointAuthMethod(options.tokenExchangeMethod);
  const preferredMethod = forced ?? options.preferredMethod;

  if (preferredMethod === 'client_secret_basic' || preferredMethod === 'client_secret_post') {
    return preferredMethod;
  }

  if (options.tokenAuthMethods.includes('client_secret_basic')) {
    return 'client_secret_basic';
  }
  if (options.tokenAuthMethods.includes('client_secret_post')) {
    return 'client_secret_post';
  }
  return undefined;
}

/**
 * Infers the client auth method from request state when `clientInfo.token_endpoint_auth_method`
 * is not set. Used inside the fetch wrapper to determine how credentials were applied by the SDK.
 *
 * Per RFC 8414 Section 2, defaults to `client_secret_basic` for confidential clients.
 */
export function inferClientAuthMethod(
  hasAuthorizationHeader: boolean,
  hasBodyClientId: boolean,
  hasBodyClientSecret: boolean,
  hasClientSecret: boolean,
): ClientAuthMethod {
  if (hasAuthorizationHeader) {
    return 'client_secret_basic';
  }
  if (hasBodyClientId || hasBodyClientSecret) {
    return 'client_secret_post';
  }
  if (hasClientSecret) {
    return 'client_secret_basic';
  }
  return 'none';
}

import { isRemoteOidcUrlAllowed } from 'librechat-data-provider';
import type { OpenIdAccountClaims, OpenIdAccountProfile } from './openidAccount';
import type { RemoteAuthFetch } from './fetch';
import { normalizeOpenIdIssuer } from './openid';
import { fetchRemoteAuth } from './fetch';
import { isEnabled } from '~/utils';

export type OpenIdRuntimeConfig = {
  issuer: string;
  clientId?: string;
  clientSecret?: string;
};

export type OpenIdUserInfoFailureReason = 'unauthorized' | 'subject_mismatch' | 'service_error';

export type OpenIdUserInfoResult =
  | {
      status: 'skipped';
      profile: OpenIdAccountProfile;
      reason: 'disabled' | 'missing_access_token';
    }
  | { status: 'fetched'; profile: OpenIdAccountProfile }
  | {
      status: 'failed';
      profile: OpenIdAccountProfile;
      reason: OpenIdUserInfoFailureReason;
      error?: Error;
    };

type OpenIdDiscoveryDocument = {
  userinfo_endpoint?: unknown;
  token_endpoint?: unknown;
};

type UserInfoFetch = RemoteAuthFetch;

const WELL_KNOWN_OPENID_CONFIGURATION = '.well-known/openid-configuration';

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function toError(error: unknown): Error | undefined {
  return error instanceof Error ? error : undefined;
}

function getDiscoveryUrl(issuer: string): string {
  const issuerUrl = new URL(normalizeOpenIdIssuer(issuer) ?? issuer);
  const pathname = issuerUrl.pathname.endsWith('/') ? issuerUrl.pathname : `${issuerUrl.pathname}/`;
  issuerUrl.pathname = `${pathname}${WELL_KNOWN_OPENID_CONFIGURATION}`;
  issuerUrl.search = '';
  issuerUrl.hash = '';
  return issuerUrl.toString();
}

function getAllowedOpenIdEndpoint(value: unknown): string | null {
  if (typeof value !== 'string' || !value || !isRemoteOidcUrlAllowed(value)) {
    return null;
  }

  return value;
}

function getFailure(
  profile: OpenIdAccountProfile,
  reason: OpenIdUserInfoFailureReason,
  error?: Error,
): OpenIdUserInfoResult {
  return { status: 'failed', profile, reason, ...(error ? { error } : {}) };
}

async function fetchDiscoveryDocument(
  issuer: string,
  fetcher: UserInfoFetch,
): Promise<OpenIdDiscoveryDocument | null> {
  const response = await fetcher(getDiscoveryUrl(issuer), { method: 'GET' });
  if (!response.ok) {
    response.release?.();
    return null;
  }

  const body = await response.json();
  return isObject(body) ? body : null;
}

async function fetchUserInfoProfile({
  endpoint,
  accessToken,
  fetcher,
}: {
  endpoint: string;
  accessToken: string;
  fetcher: UserInfoFetch;
}): Promise<{ response: Response; body: unknown }> {
  const response = await fetcher(endpoint, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  const body = response.ok ? await response.json() : undefined;
  if (!response.ok) {
    response.release?.();
  }

  return { response, body };
}

function shouldExchangeAccessToken(): boolean {
  return isEnabled(process.env.OPENID_ON_BEHALF_FLOW_FOR_USERINFO_REQUIRED);
}

function getUserInfoScope(): string {
  return process.env.OPENID_ON_BEHALF_FLOW_USERINFO_SCOPE || 'user.read';
}

function getClientCredentials(config: OpenIdRuntimeConfig): {
  clientId: string;
  clientSecret: string;
} | null {
  if (!config.clientId || !config.clientSecret) {
    return null;
  }

  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

async function exchangeAccessTokenForUserInfo({
  discovery,
  accessToken,
  config,
  fetcher,
}: {
  discovery: OpenIdDiscoveryDocument;
  accessToken: string;
  config: OpenIdRuntimeConfig;
  fetcher: UserInfoFetch;
}): Promise<string | null> {
  if (!shouldExchangeAccessToken()) {
    return accessToken;
  }

  const tokenEndpoint = getAllowedOpenIdEndpoint(discovery.token_endpoint);
  const credentials = getClientCredentials(config);
  if (!tokenEndpoint || !credentials) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    scope: getUserInfoScope(),
    assertion: accessToken,
    requested_token_use: 'on_behalf_of',
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  const response = await fetcher(tokenEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!response.ok) {
    response.release?.();
    return null;
  }

  const tokenResponse = await response.json();
  if (!isObject(tokenResponse) || typeof tokenResponse.access_token !== 'string') {
    return null;
  }

  return tokenResponse.access_token;
}

export async function enrichOpenIdProfile(input: {
  claims: OpenIdAccountClaims;
  accessToken?: string;
  subject: string;
  config: OpenIdRuntimeConfig;
  fetchUserInfo: boolean;
  fetcher?: UserInfoFetch;
}): Promise<OpenIdUserInfoResult> {
  const profile = { ...input.claims };
  if (!input.fetchUserInfo) {
    return { status: 'skipped', profile, reason: 'disabled' };
  }

  if (!input.accessToken) {
    return { status: 'skipped', profile, reason: 'missing_access_token' };
  }

  try {
    const fetcher = input.fetcher ?? fetchRemoteAuth;
    const discovery = await fetchDiscoveryDocument(input.config.issuer, fetcher);
    if (!discovery) {
      return getFailure(profile, 'service_error');
    }

    const userInfoEndpoint = getAllowedOpenIdEndpoint(discovery?.userinfo_endpoint);
    if (!userInfoEndpoint) {
      return getFailure(profile, 'service_error');
    }
    const userInfoAccessToken = await exchangeAccessTokenForUserInfo({
      discovery,
      accessToken: input.accessToken,
      config: input.config,
      fetcher,
    });
    if (!userInfoAccessToken) {
      return getFailure(profile, 'service_error');
    }

    const { response, body } = await fetchUserInfoProfile({
      endpoint: userInfoEndpoint,
      accessToken: userInfoAccessToken,
      fetcher,
    });

    if (response.status === 401 || response.status === 403) {
      return getFailure(profile, 'unauthorized');
    }

    if (!response.ok || !isObject(body)) {
      return getFailure(profile, 'service_error');
    }

    if (typeof body.sub !== 'string' || body.sub !== input.subject) {
      return { status: 'failed', profile, reason: 'subject_mismatch' };
    }

    return { status: 'fetched', profile: { ...profile, ...body } };
  } catch (error) {
    return getFailure(profile, 'service_error', toError(error));
  }
}

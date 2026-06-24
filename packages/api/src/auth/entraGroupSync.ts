import { logger } from '@librechat/data-schemas';
import { isRemoteOidcUrlAllowed } from 'librechat-data-provider';
import type { IUser, UserGroupMethods } from '@librechat/data-schemas';
import type { RemoteAuthFetch } from './fetch';
import { normalizeOpenIdIssuer } from './openid';
import { fetchRemoteAuth } from './fetch';
import { isEnabled } from '~/utils';

export type EntraGroupSyncOptions = {
  syncGroupsOnCreate: boolean;
  syncGroupsForExisting: boolean;
};

export type EntraGraphConfig = {
  issuer: string;
  clientId?: string;
  clientSecret?: string;
  enabled?: boolean;
  includeOwnersAsMembers?: boolean;
  useEntraIdForPeopleSearch?: boolean;
};

export type EntraGroupSyncResult = {
  attempted: boolean;
  synced: boolean;
  syncedAt?: number;
  reason?: 'disabled' | 'missing_user_identity' | 'missing_access_token' | 'not_openid' | 'failed';
};

export type EntraGroupDetails = {
  id: string;
  name: string;
  email?: string;
  description?: string;
};

export type EntraGroupSyncDbMethods = {
  bulkUpdateGroups: UserGroupMethods['bulkUpdateGroups'];
  findGroupsByExternalIds: UserGroupMethods['findGroupsByExternalIds'];
  upsertGroupByExternalId: UserGroupMethods['upsertGroupByExternalId'];
};

type GraphFetch = RemoteAuthFetch;

type OpenIdDiscoveryDocument = {
  token_endpoint?: unknown;
};

const GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';
const WELL_KNOWN_OPENID_CONFIGURATION = '.well-known/openid-configuration';
const GRAPH_BATCH_SIZE = 20;
const GRAPH_BATCH_MAX_RETRIES = 2;

function getGroupSyncLogContext({
  input,
  reason,
  groupCount,
}: {
  input: {
    lifecycle: 'created' | 'existing';
    user: IUser;
  };
  reason?: EntraGroupSyncResult['reason'];
  groupCount?: number;
}) {
  return {
    lifecycle: input.lifecycle,
    tenantId: input.user.tenantId ?? 'base',
    userId: input.user._id?.toString() ?? input.user.id,
    reason,
    groupCount,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
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

function getGraphScopes(): string {
  const scopes = process.env.OPENID_GRAPH_SCOPES || 'User.Read,People.Read,Group.Read.All';
  return scopes
    .split(',')
    .map((scope) => scope.trim())
    .filter(Boolean)
    .map((scope) =>
      scope.startsWith('https://graph.microsoft.com/')
        ? scope
        : `https://graph.microsoft.com/${scope}`,
    )
    .join(' ');
}

function shouldSyncLifecycle(
  lifecycle: 'created' | 'existing',
  options: EntraGroupSyncOptions,
): boolean {
  return lifecycle === 'created' ? options.syncGroupsOnCreate : options.syncGroupsForExisting;
}

function isGraphEnabled(config: EntraGraphConfig): boolean {
  return (
    config.enabled ??
    config.useEntraIdForPeopleSearch ??
    isEnabled(process.env.USE_ENTRA_ID_FOR_PEOPLE_SEARCH)
  );
}

function shouldIncludeOwners(config: EntraGraphConfig): boolean {
  return config.includeOwnersAsMembers ?? isEnabled(process.env.ENTRA_ID_INCLUDE_OWNERS_AS_MEMBERS);
}

function getClientCredentials(config: EntraGraphConfig): {
  clientId: string;
  clientSecret: string;
} | null {
  if (!config.clientId || !config.clientSecret) {
    return null;
  }

  return { clientId: config.clientId, clientSecret: config.clientSecret };
}

async function fetchDiscoveryDocument(
  issuer: string,
  fetcher: GraphFetch,
): Promise<OpenIdDiscoveryDocument | null> {
  const response = await fetcher(getDiscoveryUrl(issuer), { method: 'GET' });
  if (!response.ok) {
    response.release?.();
    return null;
  }

  const body = await response.json();
  return isObject(body) ? body : null;
}

async function exchangeTokenForGraphAccess({
  accessToken,
  graphConfig,
  fetcher,
}: {
  accessToken: string;
  graphConfig: EntraGraphConfig;
  fetcher: GraphFetch;
}): Promise<string | null> {
  const discovery = await fetchDiscoveryDocument(graphConfig.issuer, fetcher);
  const tokenEndpoint = getAllowedOpenIdEndpoint(discovery?.token_endpoint);
  const credentials = getClientCredentials(graphConfig);
  if (!tokenEndpoint || !credentials) {
    return null;
  }

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    scope: getGraphScopes(),
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

async function graphRequest({
  token,
  path,
  fetcher,
  init,
}: {
  token: string;
  path: string;
  fetcher: GraphFetch;
  init?: RequestInit;
}): Promise<unknown> {
  const response = await fetcher(`${GRAPH_BASE_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    response.release?.();
    throw new Error(`Graph request failed: ${response.status}`);
  }

  return response.json();
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return unique(value.filter((item): item is string => typeof item === 'string'));
}

function nextGraphPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }

  return value.replace(/^https:\/\/graph\.microsoft\.com\/v1\.0/, '').trim() || null;
}

async function getUserEntraGroups(token: string, fetcher: GraphFetch): Promise<string[]> {
  const body = await graphRequest({
    token,
    path: '/me/getMemberGroups',
    fetcher,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ securityEnabledOnly: false }),
    },
  });

  return isObject(body) ? stringArray(body.value) : [];
}

async function getUserOwnedEntraGroups(token: string, fetcher: GraphFetch): Promise<string[]> {
  const groupIds: string[] = [];
  let nextPath: string | null = '/me/ownedObjects/microsoft.graph.group?$select=id&$top=999';

  while (nextPath) {
    const body = await graphRequest({ token, path: nextPath, fetcher, init: { method: 'GET' } });
    if (!isObject(body)) {
      break;
    }

    const groups = Array.isArray(body.value) ? body.value : [];
    groupIds.push(
      ...groups
        .filter(isObject)
        .map((group) => group.id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id)),
    );
    nextPath = nextGraphPath(body['@odata.nextLink']);
  }

  return unique(groupIds);
}

function toGroupDetails(value: unknown): EntraGroupDetails | null {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.displayName !== 'string') {
    return null;
  }

  return {
    id: value.id,
    name: value.displayName,
    ...(typeof value.mail === 'string' ? { email: value.mail.toLowerCase() } : {}),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
  };
}

async function getEntraGroupDetailsBatch({
  token,
  groupIds,
  fetcher,
}: {
  token: string;
  groupIds: string[];
  fetcher: GraphFetch;
}): Promise<EntraGroupDetails[]> {
  async function processBatch(batchIds: string[], retryCount = 0): Promise<EntraGroupDetails[]> {
    const body = await graphRequest({
      token,
      path: '/$batch',
      fetcher,
      init: {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          requests: batchIds.map((id) => ({
            id,
            method: 'GET',
            url: `/groups/${id}?$select=id,displayName,mail,description`,
          })),
        }),
      },
    });
    if (!isObject(body) || !Array.isArray(body.responses)) {
      return [];
    }

    const details: EntraGroupDetails[] = [];
    const retryIds: string[] = [];
    for (const response of body.responses) {
      if (!isObject(response)) {
        continue;
      }

      if (response.status === 200) {
        const group = toGroupDetails(response.body);
        if (group) {
          details.push(group);
        }
        continue;
      }

      if ((response.status === 429 || response.status === 503) && typeof response.id === 'string') {
        retryIds.push(response.id);
      }
    }

    if (retryIds.length > 0 && retryCount < GRAPH_BATCH_MAX_RETRIES) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (retryCount + 1)));
      details.push(...(await processBatch(retryIds, retryCount + 1)));
    }

    return details;
  }

  if (groupIds.length === 0) {
    return [];
  }

  const details: EntraGroupDetails[] = [];
  for (let i = 0; i < groupIds.length; i += GRAPH_BATCH_SIZE) {
    const batchIds = groupIds.slice(i, i + GRAPH_BATCH_SIZE);
    details.push(...(await processBatch(batchIds)));
  }

  return details;
}

async function syncMemberships({
  user,
  groupIds,
  token,
  methods,
  fetcher,
}: {
  user: IUser;
  groupIds: string[];
  token: string;
  methods: EntraGroupSyncDbMethods;
  fetcher: GraphFetch;
}): Promise<void> {
  if (groupIds.length === 0) {
    return;
  }

  await methods.bulkUpdateGroups(
    {
      idOnTheSource: { $in: groupIds },
      source: 'entra',
      memberIds: { $ne: user.idOnTheSource },
    },
    { $addToSet: { memberIds: user.idOnTheSource } },
  );

  const existingGroups = await methods.findGroupsByExternalIds(groupIds, 'entra');
  const existingGroupIds = new Set(existingGroups.map((group) => group.idOnTheSource));
  const missingGroupIds = groupIds.filter((id) => !existingGroupIds.has(id));
  const missingGroupDetails = await getEntraGroupDetailsBatch({
    token,
    groupIds: missingGroupIds,
    fetcher,
  });

  const resolvedGroupIds = unique(
    [
      ...existingGroups.map((group) => group.idOnTheSource),
      ...missingGroupDetails.map((group) => group.id),
    ].filter((id): id is string => typeof id === 'string'),
  );

  await Promise.all(
    missingGroupDetails.map((group) =>
      methods.upsertGroupByExternalId(
        group.id,
        'entra',
        {
          name: group.name,
          email: group.email,
          description: group.description,
        },
        undefined,
      ),
    ),
  );

  if (missingGroupDetails.length > 0) {
    await methods.bulkUpdateGroups(
      {
        idOnTheSource: { $in: missingGroupDetails.map((group) => group.id) },
        source: 'entra',
        memberIds: { $ne: user.idOnTheSource },
      },
      { $addToSet: { memberIds: user.idOnTheSource } },
    );
  }

  if (resolvedGroupIds.length === 0) {
    return;
  }

  await methods.bulkUpdateGroups(
    {
      source: 'entra',
      memberIds: user.idOnTheSource,
      idOnTheSource: { $nin: resolvedGroupIds },
    },
    { $pullAll: { memberIds: [user.idOnTheSource] } },
  );
}

/**
 * Package-side Entra membership sync for remote-agent authentication.
 *
 * This intentionally follows the existing browser-login algorithm in
 * `api/server/services/PermissionService.js#syncUserEntraGroupMemberships`:
 * fetch membership IDs, add known groups, create missing Entra groups, then
 * remove stale Entra memberships. Browser login remains wired to the legacy JS
 * service until a follow-up migration.
 */
export async function syncUserEntraGroupMemberships(input: {
  lifecycle: 'created' | 'existing';
  user: IUser;
  accessToken?: string;
  graphConfig: EntraGraphConfig;
  options: EntraGroupSyncOptions;
  methods: EntraGroupSyncDbMethods;
  fetcher?: GraphFetch;
}): Promise<EntraGroupSyncResult> {
  if (!shouldSyncLifecycle(input.lifecycle, input.options) || !isGraphEnabled(input.graphConfig)) {
    logger.info(
      '[entraGroupSync] Remote Entra group sync skipped',
      getGroupSyncLogContext({ input, reason: 'disabled' }),
    );
    return { attempted: false, synced: false, reason: 'disabled' };
  }

  if (input.user.provider !== 'openid') {
    logger.info(
      '[entraGroupSync] Remote Entra group sync skipped',
      getGroupSyncLogContext({ input, reason: 'not_openid' }),
    );
    return { attempted: false, synced: false, reason: 'not_openid' };
  }

  if (!input.user.openidId || !input.user.idOnTheSource) {
    logger.info(
      '[entraGroupSync] Remote Entra group sync skipped',
      getGroupSyncLogContext({ input, reason: 'missing_user_identity' }),
    );
    return { attempted: false, synced: false, reason: 'missing_user_identity' };
  }

  if (!input.accessToken) {
    logger.info(
      '[entraGroupSync] Remote Entra group sync skipped',
      getGroupSyncLogContext({ input, reason: 'missing_access_token' }),
    );
    return { attempted: false, synced: false, reason: 'missing_access_token' };
  }

  try {
    const fetcher = input.fetcher ?? fetchRemoteAuth;
    const graphToken = await exchangeTokenForGraphAccess({
      accessToken: input.accessToken,
      graphConfig: input.graphConfig,
      fetcher,
    });
    if (!graphToken) {
      logger.warn(
        '[entraGroupSync] Remote Entra group sync failed',
        getGroupSyncLogContext({ input, reason: 'failed' }),
      );
      return { attempted: true, synced: false, reason: 'failed' };
    }

    const memberGroupIds = await getUserEntraGroups(graphToken, fetcher);
    const ownedGroupIds = shouldIncludeOwners(input.graphConfig)
      ? await getUserOwnedEntraGroups(graphToken, fetcher)
      : [];
    const groupIds = unique([...memberGroupIds, ...ownedGroupIds]);

    await syncMemberships({
      user: input.user,
      groupIds,
      token: graphToken,
      methods: input.methods,
      fetcher,
    });

    logger.info(
      '[entraGroupSync] Remote Entra group sync succeeded',
      getGroupSyncLogContext({ input, groupCount: groupIds.length }),
    );
    return { attempted: true, synced: true, syncedAt: Date.now() };
  } catch (error) {
    logger.error(
      '[entraGroupSync] Error syncing remote Entra groups:',
      getGroupSyncLogContext({ input, reason: 'failed' }),
      error,
    );
    return { attempted: true, synced: false, reason: 'failed' };
  }
}

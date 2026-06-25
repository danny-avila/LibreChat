import { logger } from '@librechat/data-schemas';
import type { Nango } from '@nangohq/node';
import type { INangoConnection, IUser } from '@librechat/data-schemas';
import {
  getIntegrationProvider,
  listAllIntegrationProviders,
  listEnabledIntegrationProviders,
  type IntegrationConnectionStatus,
  type IntegrationProviderKey,
  type IntegrationProviderStatus,
} from '../providers';
import type { NangoAuthWebhookPayload } from './webhook';
import { getNangoConnectUrl, getNangoHost } from './client';
import {
  getNangoHttpErrorDetails,
  isNangoNotFoundError,
  isNangoSyncSkippableError,
  INTEGRATION_CONFIRM_NOT_FOUND,
} from './errors';
import { resolveProviderKeyFromWebhook } from './webhook';

export interface NangoConnectSessionResult {
  sessionToken: string;
  expiresAt?: string;
  /** Public Connect UI base URL for the browser iframe (from Nango connect_link or env). */
  connectUrl: string;
}

export interface NangoSyncConnectionResult {
  providerKey: IntegrationProviderKey;
  status: IntegrationConnectionStatus;
  connectionId: string;
}

export interface IntegrationAccessTokenResult {
  accessToken: string;
  expiresAt?: string;
  tokenType: string;
}

export interface NangoServiceDeps {
  getClient: () => Nango;
  findNangoConnectionByUserAndProvider: (
    userId: string,
    providerKey: string,
  ) => Promise<INangoConnection | null>;
  listNangoConnectionsByUserId: (userId: string) => Promise<INangoConnection[]>;
  listNangoConnectionsByTenantId: (
    tenantId: string,
    options?: { providerKey?: string; limit?: number; offset?: number },
  ) => Promise<INangoConnection[]>;
  upsertNangoConnection: (input: {
    userId: string;
    tenantId?: string;
    providerKey: string;
    nangoIntegrationId: string;
    connectionId: string;
    status?: INangoConnection['status'];
  }) => Promise<INangoConnection | null>;
  deleteNangoConnectionByUserAndProvider: (userId: string, providerKey: string) => Promise<boolean>;
}

type RemoteConnectionEntry = {
  provider_config_key?: string;
  connection_id?: string;
};

function getUserId(user: IUser): string {
  return user._id?.toString() ?? user.id ?? '';
}

function mapConnectionStatus(
  providerEnabled: boolean,
  connection: INangoConnection | null | undefined,
): IntegrationConnectionStatus {
  if (!providerEnabled) {
    return 'disabled';
  }
  if (!connection) {
    return 'not_connected';
  }
  if (connection.status === 'expired') {
    return 'expired';
  }
  if (connection.status === 'revoked') {
    return 'revoked';
  }
  return 'connected';
}

function buildConnectTags(user: IUser, userId: string): Record<string, string> {
  const tags: Record<string, string> = {
    end_user_id: userId,
  };
  const email = user.email?.trim();
  if (email) {
    tags.end_user_email = email;
  }
  const tenantId = user.tenantId?.trim();
  if (tenantId) {
    tags.organization_id = tenantId;
  }
  return tags;
}

type NangoConnectSessionData = {
  token?: string;
  expires_at?: string;
  connect_link?: string;
};

function resolveConnectUiBaseUrl(connectLink?: string): string {
  const configured = getNangoConnectUrl();
  if (!connectLink?.trim()) {
    return configured;
  }

  try {
    const parsed = new URL(connectLink);
    const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLocalHost) {
      logger.warn(
        '[integrations] Nango connect_link uses localhost — override with NANGO_PUBLIC_CONNECT_URL',
        { connectLink, connectUrl: configured },
      );
      return configured;
    }
    return parsed.origin;
  } catch {
    return configured;
  }
}

function mapConnectSessionResult(data: NangoConnectSessionData): NangoConnectSessionResult {
  const sessionToken = data.token;
  if (!sessionToken) {
    throw new Error('Nango connect session response is missing a token');
  }

  return {
    sessionToken,
    expiresAt: data.expires_at,
    connectUrl: resolveConnectUiBaseUrl(data.connect_link),
  };
}

function logConnectSessionNangoFailure(
  mode: 'new' | 'reconnect',
  context: {
    userId: string;
    tenantId?: string;
    providerKey: IntegrationProviderKey;
    nangoIntegrationId: string;
    connectionId?: string;
  },
  error: unknown,
): void {
  const nangoHost = getNangoHost();
  const nangoPath = mode === 'reconnect' ? '/connect/sessions/reconnect' : '/connect/sessions';
  const http = getNangoHttpErrorDetails(error);

  logger.error('[integrations] createConnectSession nango request failed', {
    mode,
    nangoHost,
    nangoPath,
    nangoUrl: http.requestUrl ?? `${nangoHost}${nangoPath}`,
    providerKey: context.providerKey,
    nangoIntegrationId: context.nangoIntegrationId,
    connectionId: context.connectionId,
    userId: context.userId,
    tenantId: context.tenantId,
    httpStatus: http.status,
    httpMethod: http.method,
    nangoError: http.responseData,
    error: http.message,
  });
}

export function createNangoService(deps: NangoServiceDeps) {
  const {
    getClient,
    findNangoConnectionByUserAndProvider,
    listNangoConnectionsByUserId,
    listNangoConnectionsByTenantId,
    upsertNangoConnection,
    deleteNangoConnectionByUserAndProvider,
  } = deps;

  async function listRemoteConnectionsForUser(userId: string): Promise<RemoteConnectionEntry[]> {
    const nango = getClient();

    try {
      const result = await nango.listConnections({ tags: { end_user_id: userId } });
      const connections: RemoteConnectionEntry[] = [];
      for (const entry of result.connections ?? []) {
        if (entry.provider_config_key && entry.connection_id) {
          connections.push(entry);
        }
      }
      return connections;
    } catch (error) {
      if (isNangoSyncSkippableError(error)) {
        return [];
      }
      throw error;
    }
  }

  async function syncUserConnectionsFromNango(userId: string, tenantId?: string): Promise<void> {
    let remoteConnections: RemoteConnectionEntry[] = [];
    try {
      remoteConnections = await listRemoteConnectionsForUser(userId);
    } catch (error) {
      if (isNangoSyncSkippableError(error)) {
        return;
      }
      throw error;
    }

    for (const entry of remoteConnections) {
      const integrationId = entry.provider_config_key;
      const connectionId = entry.connection_id;
      if (!integrationId || !connectionId) {
        continue;
      }

      const provider = listEnabledIntegrationProviders().find(
        (candidate) => candidate.nangoIntegrationId === integrationId,
      );
      if (!provider) {
        continue;
      }

      await upsertNangoConnection({
        userId,
        tenantId,
        providerKey: provider.key,
        nangoIntegrationId: provider.nangoIntegrationId,
        connectionId,
        status: 'connected',
      });
    }
  }

  async function resolveRemoteConnectionId(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<string | undefined> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider) {
      return undefined;
    }

    const userId = getUserId(user);
    if (!userId) {
      return undefined;
    }

    const remoteConnections = await listRemoteConnectionsForUser(userId);
    const match = remoteConnections.find(
      (entry) => entry.provider_config_key === provider.nangoIntegrationId,
    );
    return match?.connection_id;
  }

  async function listUserProviderStatuses(
    user: IUser,
    options?: { syncFromNango?: boolean },
  ): Promise<IntegrationProviderStatus[]> {
    const userId = getUserId(user);
    if (!userId) {
      return [];
    }

    if (options?.syncFromNango) {
      await syncUserConnectionsFromNango(userId, user.tenantId?.trim() || undefined);
    }

    const stored = await listNangoConnectionsByUserId(userId);
    const storedByProvider = new Map(stored.map((row) => [row.providerKey, row]));

    return listAllIntegrationProviders().map((provider) => {
      const connection = storedByProvider.get(provider.key);
      return {
        providerKey: provider.key,
        nangoIntegrationId: provider.nangoIntegrationId,
        labelKey: provider.labelKey,
        icon: provider.icon,
        enabled: provider.enabled,
        status: mapConnectionStatus(provider.enabled, connection),
        connectionId: connection?.connectionId,
        connectedAt: connection?.connectedAt?.toISOString(),
        updatedAt: connection?.updatedAt?.toISOString(),
      };
    });
  }

  async function getProviderStatus(
    user: IUser,
    providerKey: IntegrationProviderKey,
    options?: { syncFromNango?: boolean },
  ): Promise<IntegrationProviderStatus | null> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider) {
      return null;
    }

    const userId = getUserId(user);
    if (!userId) {
      return null;
    }

    if (options?.syncFromNango) {
      await syncUserConnectionsFromNango(userId, user.tenantId?.trim() || undefined);
    }

    const connection = await findNangoConnectionByUserAndProvider(userId, providerKey);
    return {
      providerKey: provider.key,
      nangoIntegrationId: provider.nangoIntegrationId,
      labelKey: provider.labelKey,
      icon: provider.icon,
      enabled: provider.enabled,
      status: mapConnectionStatus(provider.enabled, connection),
      connectionId: connection?.connectionId,
      connectedAt: connection?.connectedAt?.toISOString(),
      updatedAt: connection?.updatedAt?.toISOString(),
    };
  }

  async function createProviderConnectSession(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<NangoConnectSessionResult> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider?.enabled) {
      throw new Error('Integration provider is not enabled');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    const nango = getClient();
    const existing = await findNangoConnectionByUserAndProvider(userId, providerKey);
    const logContext = {
      userId,
      tenantId: user.tenantId?.trim() || undefined,
      providerKey,
      nangoIntegrationId: provider.nangoIntegrationId,
    };

    if (existing?.connectionId) {
      try {
        const reconnect = await nango.createReconnectSession({
          connection_id: existing.connectionId,
          integration_id: provider.nangoIntegrationId,
        });
        return mapConnectSessionResult(reconnect.data);
      } catch (error) {
        logConnectSessionNangoFailure(
          'reconnect',
          {
            ...logContext,
            connectionId: existing.connectionId,
          },
          error,
        );
        // The local record is stale — e.g. the connection was deleted directly
        // in the Nango dashboard. Clear it so we fall through to a fresh connect
        // session instead of repeatedly failing to reconnect a dead connection.
        await deleteNangoConnectionByUserAndProvider(userId, providerKey);
      }
    }

    try {
      const session = await nango.createConnectSession({
        tags: buildConnectTags(user, userId),
        allowed_integrations: [provider.nangoIntegrationId],
      });

      return mapConnectSessionResult(session.data);
    } catch (error) {
      logConnectSessionNangoFailure('new', logContext, error);
      throw error;
    }
  }

  async function syncProviderConnection(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<NangoSyncConnectionResult> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider?.enabled) {
      throw new Error('Integration provider is not enabled');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    const connectionId = await resolveRemoteConnectionId(user, providerKey);
    if (!connectionId) {
      throw new Error(INTEGRATION_CONFIRM_NOT_FOUND);
    }

    const nango = getClient();
    try {
      await nango.getConnection(provider.nangoIntegrationId, connectionId);
    } catch (error) {
      if (isNangoNotFoundError(error)) {
        throw new Error(INTEGRATION_CONFIRM_NOT_FOUND);
      }
      throw error;
    }

    await upsertNangoConnection({
      userId,
      tenantId: user.tenantId?.trim() || undefined,
      providerKey: provider.key,
      nangoIntegrationId: provider.nangoIntegrationId,
      connectionId,
      status: 'connected',
    });

    return {
      providerKey: provider.key,
      status: 'connected',
      connectionId,
    };
  }

  async function processAuthWebhook(payload: NangoAuthWebhookPayload): Promise<void> {
    if (payload.type !== 'auth') {
      return;
    }

    const userId = payload.tags?.end_user_id?.trim();
    const integrationId = payload.providerConfigKey;
    const connectionId = payload.connectionId;

    if (!userId || !integrationId || !connectionId) {
      return;
    }

    const providerKey = resolveProviderKeyFromWebhook(integrationId);
    if (!providerKey) {
      return;
    }

    if (payload.operation === 'refresh' && payload.success === false) {
      await upsertNangoConnection({
        userId,
        tenantId: payload.tags?.organization_id?.trim() || undefined,
        providerKey,
        nangoIntegrationId: integrationId,
        connectionId,
        status: 'expired',
      });
      return;
    }

    if (payload.success !== true) {
      return;
    }

    await upsertNangoConnection({
      userId,
      tenantId: payload.tags?.organization_id?.trim() || undefined,
      providerKey,
      nangoIntegrationId: integrationId,
      connectionId,
      status: 'connected',
    });
  }

  async function disconnectProvider(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<void> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider) {
      throw new Error('Unknown integration provider');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    const existing = await findNangoConnectionByUserAndProvider(userId, providerKey);
    if (existing?.connectionId) {
      const nango = getClient();
      try {
        await nango.deleteConnection(provider.nangoIntegrationId, existing.connectionId);
      } catch (error) {
        // The remote connection may already be gone (e.g. deleted in the Nango
        // dashboard). Log and continue so the local record is still removed.
        logger.error('[integrations] disconnectProvider: failed to delete Nango connection', {
          userId,
          providerKey,
          nangoIntegrationId: provider.nangoIntegrationId,
          connectionId: existing.connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await deleteNangoConnectionByUserAndProvider(userId, providerKey);
  }

  async function listTenantConnections(tenantId: string): Promise<INangoConnection[]> {
    return listNangoConnectionsByTenantId(tenantId);
  }

  async function getProviderAccessToken(
    user: IUser,
    providerKey: IntegrationProviderKey,
  ): Promise<IntegrationAccessTokenResult> {
    const provider = getIntegrationProvider(providerKey);
    if (!provider?.enabled) {
      throw new Error('Integration provider is not available');
    }

    const userId = getUserId(user);
    if (!userId) {
      throw new Error('Authenticated user is required');
    }

    const connection = await findNangoConnectionByUserAndProvider(userId, providerKey);
    if (!connection?.connectionId) {
      throw new Error('Integration is not connected');
    }

    const nango = getClient();
    try {
      const nangoConnection = await nango.getConnection(
        provider.nangoIntegrationId,
        connection.connectionId,
      );

      const credentials = nangoConnection.credentials as
        | {
            access_token?: string;
            expires_at?: string | Date;
            raw?: { token_type?: string };
          }
        | undefined;
      const accessToken =
        typeof credentials?.access_token === 'string' ? credentials.access_token : undefined;

      if (!accessToken || accessToken.length === 0) {
        throw new Error('Failed to resolve integration access token');
      }

      const rawTokenType = credentials?.raw?.token_type;
      const tokenType =
        typeof rawTokenType === 'string' && rawTokenType.length > 0 ? rawTokenType : 'Bearer';

      const rawExpiresAt = credentials?.expires_at;
      const expiresAt =
        rawExpiresAt instanceof Date
          ? rawExpiresAt.toISOString()
          : typeof rawExpiresAt === 'string'
            ? rawExpiresAt
            : undefined;

      return {
        accessToken,
        expiresAt,
        tokenType,
      };
    } catch (error) {
      if (isNangoNotFoundError(error)) {
        await upsertNangoConnection({
          userId,
          tenantId: user.tenantId?.trim() || undefined,
          providerKey: provider.key,
          nangoIntegrationId: provider.nangoIntegrationId,
          connectionId: connection.connectionId,
          status: 'expired',
        });
      }
      throw new Error('Integration reconnect required');
    }
  }

  return {
    listUserProviderStatuses,
    getProviderStatus,
    createProviderConnectSession,
    syncProviderConnection,
    processAuthWebhook,
    disconnectProvider,
    listTenantConnections,
    syncUserConnectionsFromNango,
    upsertNangoConnection,
    getProviderAccessToken,
  };
}

export type NangoService = ReturnType<typeof createNangoService>;

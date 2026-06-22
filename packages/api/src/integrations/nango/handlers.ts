import { isValidObjectIdString, logger } from '@librechat/data-schemas';
import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import { getTenantScopedUserFilter } from '../../admin/tenant';
import {
  formatGoogleCalendarEventAsText,
  getGoogleCalendarEvent,
  listGoogleCalendarEvents,
} from '../googleCalendar/calendarApi';
import {
  buildGoogleDriveFullTextQuery,
  downloadGoogleDriveFile,
  searchGoogleDriveFiles,
} from '../googleDrive/driveApi';
import { getGmailMessageAsText, searchGmailMessages } from '../googleMail/mailApi';
import { getIntegrationProvider, isIntegrationProviderKey } from '../providers';
import type {
  IntegrationEventsAttachRequest,
  IntegrationFileDownloadRequest,
  IntegrationMessagesAttachRequest,
} from '../types';
import { INTEGRATION_CONFIRM_NOT_FOUND } from './errors';
import type { NangoService } from './service';

function getRequestUser(req: ServerRequest): IUser | undefined {
  return req.user;
}

function getUserId(req: ServerRequest): string | undefined {
  const user = getRequestUser(req);
  if (!user) {
    return undefined;
  }
  return user._id?.toString() ?? user.id;
}

export interface IntegrationHandlersDeps {
  nangoService: NangoService;
  isNangoConfigured: () => boolean;
}

export function createIntegrationHandlers(deps: IntegrationHandlersDeps) {
  const { nangoService, isNangoConfigured } = deps;

  async function listIntegrationsHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const integrations = await nangoService.listUserProviderStatuses(user, {
        syncFromNango: true,
      });
      return res.status(200).json({ integrations });
    } catch (error) {
      logger.error('[integrations] listIntegrations error:', error);
      return res.status(500).json({ error: 'Failed to list integrations' });
    }
  }

  async function getProviderStatusHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (!isIntegrationProviderKey(providerKey)) {
        return res.status(400).json({ error: 'Invalid integration provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const status = await nangoService.getProviderStatus(user, providerKey, {
        syncFromNango: true,
      });
      if (!status) {
        return res.status(404).json({ error: 'Integration provider not found' });
      }

      return res.status(200).json({ integration: status });
    } catch (error) {
      logger.error('[integrations] getProviderStatus error:', error);
      return res.status(500).json({ error: 'Failed to get integration status' });
    }
  }

  async function createConnectSessionHandler(req: ServerRequest, res: Response) {
    const { providerKey } = req.params as { providerKey: string };

    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      if (!isIntegrationProviderKey(providerKey)) {
        return res.status(400).json({ error: 'Invalid integration provider' });
      }

      const provider = getIntegrationProvider(providerKey);
      if (!provider?.enabled) {
        return res.status(404).json({ error: 'Integration provider is not available' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const session = await nangoService.createProviderConnectSession(user, providerKey);
      return res.status(200).json(session);
    } catch (error) {
      const requestUser = getRequestUser(req);
      logger.error('[integrations] createConnectSession handler error', {
        providerKey,
        userId: getUserId(req),
        tenantId: requestUser?.tenantId,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(500).json({ error: 'Failed to create integration connect session' });
    }
  }

  async function syncConnectionHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (!isIntegrationProviderKey(providerKey)) {
        return res.status(400).json({ error: 'Invalid integration provider' });
      }

      const provider = getIntegrationProvider(providerKey);
      if (!provider?.enabled) {
        return res.status(404).json({ error: 'Integration provider is not available' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const result = await nangoService.syncProviderConnection(user, providerKey);
      return res.status(200).json(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to sync integration connection';
      logger.error('[integrations] syncConnection error:', error);
      if (message === INTEGRATION_CONFIRM_NOT_FOUND) {
        return res.status(404).json({ error: message });
      }
      return res.status(500).json({ error: 'Failed to sync integration connection' });
    }
  }

  async function getProviderTokenHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (!isIntegrationProviderKey(providerKey)) {
        return res.status(400).json({ error: 'Invalid integration provider' });
      }

      const provider = getIntegrationProvider(providerKey);
      if (!provider?.enabled) {
        return res.status(404).json({ error: 'Integration provider is not available' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const token = await nangoService.getProviderAccessToken(user, providerKey);
      return res.status(200).json({ token });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to get integration token';
      if (message === 'Integration reconnect required') {
        return res.status(401).json({ error: message });
      }
      if (message === 'Integration is not connected') {
        return res.status(404).json({ error: message });
      }
      if (message === 'Integration provider is not available') {
        return res.status(404).json({ error: message });
      }
      logger.error('[integrations] getProviderToken error:', error);
      return res.status(500).json({ error: 'Failed to get integration token' });
    }
  }

  async function disconnectProviderHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (!isIntegrationProviderKey(providerKey)) {
        return res.status(400).json({ error: 'Invalid integration provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      await nangoService.disconnectProvider(user, providerKey);
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[integrations] disconnectProvider error:', error);
      return res.status(500).json({ error: 'Failed to disconnect integration' });
    }
  }

  async function searchProviderFilesHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (providerKey !== 'google-drive') {
        return res.status(400).json({ error: 'File search is not supported for this provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const query = typeof req.query.query === 'string' ? req.query.query : undefined;
      const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined;
      const pageSizeRaw = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : 20;
      const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20;

      const token = await nangoService.getProviderAccessToken(user, providerKey);
      const driveQuery = query?.trim() ? buildGoogleDriveFullTextQuery(query) : undefined;
      const result = await searchGoogleDriveFiles(token.accessToken, {
        query: driveQuery,
        pageSize,
        pageToken,
      });

      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search files';
      if (message === 'Integration reconnect required') {
        return res.status(401).json({ error: message });
      }
      if (message === 'Integration is not connected') {
        return res.status(404).json({ error: message });
      }
      logger.error('[integrations] searchProviderFiles error:', error);
      return res.status(500).json({ error: 'Failed to search files' });
    }
  }

  async function downloadProviderFilesHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (providerKey !== 'google-drive') {
        return res.status(400).json({ error: 'File download is not supported for this provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const body = req.body as IntegrationFileDownloadRequest;
      if (!Array.isArray(body?.files) || body.files.length === 0) {
        return res.status(400).json({ error: 'At least one file is required' });
      }

      const token = await nangoService.getProviderAccessToken(user, providerKey);
      const files = await Promise.all(
        body.files.map(async (file) => {
          const downloaded = await downloadGoogleDriveFile(token.accessToken, file);
          return {
            fileName: downloaded.fileName,
            mimeType: downloaded.mimeType,
            contentBase64: Buffer.from(downloaded.buffer).toString('base64'),
          };
        }),
      );

      return res.status(200).json({ files });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to download files';
      if (message === 'Integration reconnect required') {
        return res.status(401).json({ error: message });
      }
      if (message === 'Integration is not connected') {
        return res.status(404).json({ error: message });
      }
      logger.error('[integrations] downloadProviderFiles error:', error);
      return res.status(500).json({ error: 'Failed to download files' });
    }
  }

  async function searchProviderMessagesHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (providerKey !== 'google-mail') {
        return res.status(400).json({ error: 'Message search is not supported for this provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const query = typeof req.query.query === 'string' ? req.query.query : undefined;
      const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined;
      const pageSizeRaw = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : 10;
      const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10;

      const token = await nangoService.getProviderAccessToken(user, providerKey);
      const result = await searchGmailMessages(token.accessToken, {
        query,
        pageSize,
        pageToken,
      });

      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to search messages';
      if (message === 'Integration reconnect required') {
        return res.status(401).json({ error: message });
      }
      if (message === 'Integration is not connected') {
        return res.status(404).json({ error: message });
      }
      logger.error('[integrations] searchProviderMessages error:', error);
      return res.status(500).json({ error: 'Failed to search messages' });
    }
  }

  async function attachProviderMessagesHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (providerKey !== 'google-mail') {
        return res.status(400).json({ error: 'Message attach is not supported for this provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const body = req.body as IntegrationMessagesAttachRequest;
      if (!Array.isArray(body?.messageIds) || body.messageIds.length === 0) {
        return res.status(400).json({ error: 'At least one message ID is required' });
      }

      const token = await nangoService.getProviderAccessToken(user, providerKey);
      const files = await Promise.all(
        body.messageIds.map(async (messageId) => {
          const message = await getGmailMessageAsText(token.accessToken, messageId);
          return {
            fileName: message.fileName,
            mimeType: 'text/plain',
            contentBase64: Buffer.from(message.content, 'utf-8').toString('base64'),
          };
        }),
      );

      return res.status(200).json({ files });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to attach messages';
      if (message === 'Integration reconnect required') {
        return res.status(401).json({ error: message });
      }
      if (message === 'Integration is not connected') {
        return res.status(404).json({ error: message });
      }
      logger.error('[integrations] attachProviderMessages error:', error);
      return res.status(500).json({ error: 'Failed to attach messages' });
    }
  }

  async function listProviderEventsHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (providerKey !== 'google-calendar') {
        return res.status(400).json({ error: 'Event listing is not supported for this provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const query = typeof req.query.query === 'string' ? req.query.query : undefined;
      const pageToken = typeof req.query.pageToken === 'string' ? req.query.pageToken : undefined;
      const timeMin = typeof req.query.timeMin === 'string' ? req.query.timeMin : undefined;
      const timeMax = typeof req.query.timeMax === 'string' ? req.query.timeMax : undefined;
      const pageSizeRaw = typeof req.query.pageSize === 'string' ? Number(req.query.pageSize) : 10;
      const pageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10;

      const token = await nangoService.getProviderAccessToken(user, providerKey);
      const result = await listGoogleCalendarEvents(token.accessToken, {
        query,
        timeMin,
        timeMax,
        pageSize,
        pageToken,
      });

      return res.status(200).json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to list events';
      if (message === 'Integration reconnect required') {
        return res.status(401).json({ error: message });
      }
      if (message === 'Integration is not connected') {
        return res.status(404).json({ error: message });
      }
      logger.error('[integrations] listProviderEvents error:', error);
      return res.status(500).json({ error: 'Failed to list events' });
    }
  }

  async function attachProviderEventsHandler(req: ServerRequest, res: Response) {
    try {
      const user = getRequestUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (providerKey !== 'google-calendar') {
        return res.status(400).json({ error: 'Event attach is not supported for this provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const body = req.body as IntegrationEventsAttachRequest;
      if (!Array.isArray(body?.eventIds) || body.eventIds.length === 0) {
        return res.status(400).json({ error: 'At least one event ID is required' });
      }

      const token = await nangoService.getProviderAccessToken(user, providerKey);
      const files = await Promise.all(
        body.eventIds.map(async (eventId) => {
          const event = await getGoogleCalendarEvent(token.accessToken, eventId);
          const formatted = formatGoogleCalendarEventAsText(event);
          return {
            fileName: formatted.fileName,
            mimeType: 'text/plain',
            contentBase64: Buffer.from(formatted.content, 'utf-8').toString('base64'),
          };
        }),
      );

      return res.status(200).json({ files });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to attach events';
      if (message === 'Integration reconnect required') {
        return res.status(401).json({ error: message });
      }
      if (message === 'Integration is not connected') {
        return res.status(404).json({ error: message });
      }
      if (message.startsWith('Calendar event not found')) {
        return res.status(404).json({ error: message });
      }
      logger.error('[integrations] attachProviderEvents error:', error);
      return res.status(500).json({ error: 'Failed to attach events' });
    }
  }

  return {
    listIntegrations: listIntegrationsHandler,
    getProviderStatus: getProviderStatusHandler,
    createConnectSession: createConnectSessionHandler,
    syncConnection: syncConnectionHandler,
    getProviderToken: getProviderTokenHandler,
    disconnectProvider: disconnectProviderHandler,
    searchProviderFiles: searchProviderFilesHandler,
    downloadProviderFiles: downloadProviderFilesHandler,
    searchProviderMessages: searchProviderMessagesHandler,
    attachProviderMessages: attachProviderMessagesHandler,
    listProviderEvents: listProviderEventsHandler,
    attachProviderEvents: attachProviderEventsHandler,
    getUserId,
  };
}

export interface AdminIntegrationHandlersDeps {
  nangoService: NangoService;
  isNangoConfigured: () => boolean;
  findUsers: (
    filter: Record<string, unknown>,
    fields?: string | string[] | null,
    options?: { limit?: number },
  ) => Promise<IUser[]>;
}

export function createAdminIntegrationHandlers(deps: AdminIntegrationHandlersDeps) {
  const { nangoService, isNangoConfigured, findUsers } = deps;

  async function listTenantIntegrationsHandler(req: ServerRequest, res: Response) {
    try {
      const callerTenantId = (req.user as IUser | undefined)?.tenantId?.trim();
      if (!callerTenantId) {
        return res.status(403).json({ error: 'Only tenant admins can list tenant integrations' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const connections = await nangoService.listTenantConnections(callerTenantId);
      const userIds = [...new Set(connections.map((row) => row.userId.toString()))];
      const users =
        userIds.length > 0
          ? await findUsers({ _id: { $in: userIds } }, 'name email username tenantId', {
              limit: userIds.length,
            })
          : [];

      const usersById = new Map(users.map((user) => [user._id?.toString() ?? '', user]));

      const rows = connections.map((connection) => {
        const user = usersById.get(connection.userId.toString());
        return {
          userId: connection.userId.toString(),
          userName: user?.name ?? '',
          userEmail: user?.email ?? '',
          providerKey: connection.providerKey,
          nangoIntegrationId: connection.nangoIntegrationId,
          connectionId: connection.connectionId,
          status: connection.status,
          connectedAt: connection.connectedAt?.toISOString(),
          updatedAt: connection.updatedAt?.toISOString(),
        };
      });

      return res.status(200).json({ connections: rows, total: rows.length });
    } catch (error) {
      logger.error('[admin/integrations] listTenantIntegrations error:', error);
      return res.status(500).json({ error: 'Failed to list tenant integrations' });
    }
  }

  async function listUserIntegrationsHandler(req: ServerRequest, res: Response) {
    try {
      const { userId } = req.params as { userId: string };
      if (!isValidObjectIdString(userId)) {
        return res.status(400).json({ error: 'Invalid user ID format' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const tenantFilter = getTenantScopedUserFilter(req);
      const [targetUser] = await findUsers(
        { _id: userId, ...tenantFilter },
        'name email tenantId',
        {
          limit: 1,
        },
      );
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const integrations = await nangoService.listUserProviderStatuses(targetUser, {
        syncFromNango: true,
      });

      return res.status(200).json({
        userId,
        userName: targetUser.name ?? '',
        userEmail: targetUser.email ?? '',
        integrations,
      });
    } catch (error) {
      logger.error('[admin/integrations] listUserIntegrations error:', error);
      return res.status(500).json({ error: 'Failed to list user integrations' });
    }
  }

  async function listMyIntegrationsHandler(req: ServerRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      const integrations = await nangoService.listUserProviderStatuses(user, {
        syncFromNango: true,
      });
      return res.status(200).json({ integrations });
    } catch (error) {
      logger.error('[admin/integrations] listMyIntegrations error:', error);
      return res.status(500).json({ error: 'Failed to list integrations' });
    }
  }

  async function disconnectProviderHandler(req: ServerRequest, res: Response) {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { providerKey } = req.params as { providerKey: string };
      if (!isIntegrationProviderKey(providerKey)) {
        return res.status(400).json({ error: 'Invalid integration provider' });
      }

      if (!isNangoConfigured()) {
        return res.status(503).json({ error: 'Integrations are not configured' });
      }

      await nangoService.disconnectProvider(user, providerKey);
      return res.status(200).json({ success: true });
    } catch (error) {
      logger.error('[admin/integrations] disconnectProvider error:', error);
      return res.status(500).json({ error: 'Failed to disconnect integration' });
    }
  }

  return {
    listTenantIntegrations: listTenantIntegrationsHandler,
    listUserIntegrations: listUserIntegrationsHandler,
    listMyIntegrations: listMyIntegrationsHandler,
    disconnectProvider: disconnectProviderHandler,
  };
}

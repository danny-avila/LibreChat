import { Types } from 'mongoose';
import type { IUser } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { IntegrationProviderStatus } from '../providers';
import * as driveApi from '../googleDrive/driveApi';
import { createAdminIntegrationHandlers, createIntegrationHandlers } from './handlers';

jest.mock('@librechat/data-schemas', () => ({
  ...jest.requireActual('@librechat/data-schemas'),
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const mockUser: IUser = {
  _id: new Types.ObjectId(),
  name: 'Test User',
  email: 'test@example.com',
  username: 'testuser',
  tenantId: 'tenant-a',
} as IUser;

const googleDriveStatus: IntegrationProviderStatus = {
  providerKey: 'google-drive',
  nangoIntegrationId: 'google-drive',
  labelKey: 'com_integrations_google_drive',
  icon: 'drive',
  enabled: true,
  status: 'not_connected',
};

function createReqRes(
  overrides: {
    params?: Record<string, string>;
    user?: IUser;
  } = {},
) {
  const req = {
    params: overrides.params ?? {},
    user: overrides.user ?? mockUser,
  } as unknown as ServerRequest;

  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status, json } as unknown as Response;

  return { req, res, status, json };
}

function createMockNangoService() {
  return {
    listUserProviderStatuses: jest.fn().mockResolvedValue([googleDriveStatus]),
    getProviderStatus: jest.fn().mockResolvedValue(googleDriveStatus),
    createProviderConnectSession: jest.fn().mockResolvedValue({
      sessionToken: 'connect-session-token',
      expiresAt: '2026-06-19T13:00:00.000Z',
      connectUrl: 'https://nango.smbteam.com',
    }),
    syncProviderConnection: jest.fn().mockResolvedValue({
      providerKey: 'google-drive',
      status: 'connected',
      connectionId: 'nango-connection-id',
    }),
    disconnectProvider: jest.fn().mockResolvedValue(undefined),
    getProviderAccessToken: jest.fn().mockResolvedValue({
      accessToken: 'ya29.access-token',
      expiresAt: '2026-06-18T13:00:00.000Z',
      tokenType: 'Bearer',
    }),
    listTenantConnections: jest.fn().mockResolvedValue([]),
    syncUserConnectionsFromNango: jest.fn().mockResolvedValue(undefined),
    upsertNangoConnection: jest.fn(),
    processAuthWebhook: jest.fn().mockResolvedValue(undefined),
  };
}

describe('createIntegrationHandlers', () => {
  it('lists integrations for the authenticated user', async () => {
    const nangoService = createMockNangoService();
    const handlers = createIntegrationHandlers({
      nangoService,
      isNangoConfigured: () => true,
    });
    const { req, res, status, json } = createReqRes();

    await handlers.listIntegrations(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ integrations: [googleDriveStatus] });
    expect(nangoService.listUserProviderStatuses).toHaveBeenCalledWith(mockUser, {
      syncFromNango: true,
    });
  });

  it('returns 503 when Nango is not configured', async () => {
    const handlers = createIntegrationHandlers({
      nangoService: createMockNangoService(),
      isNangoConfigured: () => false,
    });
    const { req, res, status, json } = createReqRes();

    await handlers.listIntegrations(req, res);

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({ error: 'Integrations are not configured' });
  });

  it('creates a connect session for google-drive', async () => {
    const nangoService = createMockNangoService();
    const handlers = createIntegrationHandlers({
      nangoService,
      isNangoConfigured: () => true,
    });
    const { req, res, status, json } = createReqRes({
      params: { providerKey: 'google-drive' },
    });

    await handlers.createConnectSession(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      sessionToken: 'connect-session-token',
      expiresAt: '2026-06-19T13:00:00.000Z',
      connectUrl: 'https://nango.smbteam.com',
    });
    expect(nangoService.createProviderConnectSession).toHaveBeenCalledWith(
      mockUser,
      'google-drive',
    );
  });

  it('syncs a connection for google-drive', async () => {
    const nangoService = createMockNangoService();
    const handlers = createIntegrationHandlers({
      nangoService,
      isNangoConfigured: () => true,
    });
    const { req, res, status, json } = createReqRes({
      params: { providerKey: 'google-drive' },
    });

    await handlers.syncConnection(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      providerKey: 'google-drive',
      status: 'connected',
      connectionId: 'nango-connection-id',
    });
    expect(nangoService.syncProviderConnection).toHaveBeenCalledWith(mockUser, 'google-drive');
  });

  it('returns an access token for a connected provider', async () => {
    const nangoService = createMockNangoService();
    const handlers = createIntegrationHandlers({
      nangoService,
      isNangoConfigured: () => true,
    });
    const { req, res, status, json } = createReqRes({
      params: { providerKey: 'google-drive' },
    });

    await handlers.getProviderToken(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      token: {
        accessToken: 'ya29.access-token',
        expiresAt: '2026-06-18T13:00:00.000Z',
        tokenType: 'Bearer',
      },
    });
    expect(nangoService.getProviderAccessToken).toHaveBeenCalledWith(mockUser, 'google-drive');
  });

  it('searches Google Drive files for connected users', async () => {
    const nangoService = createMockNangoService();
    const handlers = createIntegrationHandlers({
      nangoService,
      isNangoConfigured: () => true,
    });
    const { req, res, status, json } = createReqRes({
      params: { providerKey: 'google-drive' },
    });
    req.query = { query: 'budget', pageSize: '5' };

    jest.spyOn(driveApi, 'searchGoogleDriveFiles').mockResolvedValue({
      files: [{ id: 'file-1', name: 'Budget.xlsx', mimeType: 'application/vnd.ms-excel' }],
    });

    await handlers.searchProviderFiles(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      files: [{ id: 'file-1', name: 'Budget.xlsx', mimeType: 'application/vnd.ms-excel' }],
    });
    expect(nangoService.getProviderAccessToken).toHaveBeenCalledWith(mockUser, 'google-drive');
  });
});

describe('createAdminIntegrationHandlers', () => {
  it('lists tenant connections for tenant admins', async () => {
    const nangoService = createMockNangoService();
    nangoService.listTenantConnections.mockResolvedValue([
      {
        userId: mockUser._id,
        tenantId: 'tenant-a',
        providerKey: 'google-drive',
        nangoIntegrationId: 'google-drive',
        connectionId: 'conn-1',
        status: 'connected',
        connectedAt: new Date('2026-06-17T00:00:00.000Z'),
        updatedAt: new Date('2026-06-17T00:00:00.000Z'),
      },
    ]);

    const handlers = createAdminIntegrationHandlers({
      nangoService,
      isNangoConfigured: () => true,
      findUsers: jest.fn().mockResolvedValue([mockUser]),
    });
    const { req, res, status, json } = createReqRes();

    await handlers.listTenantIntegrations(req, res);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      connections: [
        expect.objectContaining({
          userId: mockUser._id?.toString(),
          userEmail: 'test@example.com',
          providerKey: 'google-drive',
          connectionId: 'conn-1',
        }),
      ],
      total: 1,
    });
  });

  it('returns 403 when caller has no tenantId', async () => {
    const handlers = createAdminIntegrationHandlers({
      nangoService: createMockNangoService(),
      isNangoConfigured: () => true,
      findUsers: jest.fn(),
    });
    const { req, res, status, json } = createReqRes({
      user: { ...mockUser, tenantId: undefined } as IUser,
    });

    await handlers.listTenantIntegrations(req, res);

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({ error: 'Only tenant admins can list tenant integrations' });
  });

  it('lists integrations for a scoped user', async () => {
    const nangoService = createMockNangoService();
    const userId = mockUser._id?.toString() ?? '';
    const findUsers = jest.fn().mockResolvedValue([mockUser]);
    const handlers = createAdminIntegrationHandlers({
      nangoService,
      isNangoConfigured: () => true,
      findUsers,
    });
    const { req, res, status, json } = createReqRes({
      params: { userId },
    });

    await handlers.listUserIntegrations(req, res);

    expect(findUsers).toHaveBeenCalledWith(
      { _id: userId, tenantId: 'tenant-a' },
      'name email tenantId',
      { limit: 1 },
    );
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      userId,
      userName: 'Test User',
      userEmail: 'test@example.com',
      integrations: [googleDriveStatus],
    });
    expect(nangoService.listUserProviderStatuses).toHaveBeenCalledWith(mockUser, {
      syncFromNango: true,
    });
  });

  it('returns 404 when the user is outside the caller tenant scope', async () => {
    const handlers = createAdminIntegrationHandlers({
      nangoService: createMockNangoService(),
      isNangoConfigured: () => true,
      findUsers: jest.fn().mockResolvedValue([]),
    });
    const { req, res, status, json } = createReqRes({
      params: { userId: mockUser._id?.toString() ?? '' },
    });

    await handlers.listUserIntegrations(req, res);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({ error: 'User not found' });
  });
});

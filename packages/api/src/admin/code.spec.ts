import type { AppConfig } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

import { createAdminCodeEnvironmentHandlers } from './code';

interface MockResponse extends Response {
  statusCode: number;
  body?: Record<string, unknown>;
}

function mockResponse(): MockResponse {
  const response = {
    statusCode: 200,
    body: undefined as Record<string, unknown> | undefined,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(body: Record<string, unknown>) {
      response.body = body;
      return response;
    },
  };
  return response as unknown as MockResponse;
}

function request(): ServerRequest {
  return {
    params: { environmentId: 'attached-vm' },
    user: { id: 'admin-1', role: 'ADMIN' },
  } as unknown as ServerRequest;
}

function config(): AppConfig {
  return {
    endpoints: {
      agents: {
        statefulCodeSessions: {
          allowedEnvironments: ['conversation'],
          environments: [
            {
              id: 'attached-vm',
              name: 'Attached VM',
              type: 'attached',
              baseURL: 'https://bridge.example.com/v1/',
              default: true,
              owner: 'deployment',
              pairing: {
                workerId: 'vm-1',
                tokenEnv: 'CODE_BRIDGE_ADMIN_TOKEN',
              },
            },
          ],
        },
      },
    },
  } as unknown as AppConfig;
}

describe('createAdminCodeEnvironmentHandlers', () => {
  it('creates a one-time pairing code without exposing the administrator token', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      Response.json({
        protocolVersion: 1,
        workerId: 'vm-1',
        code: 'one-time-code-value-that-is-long',
        expiresAt: '2026-08-30T12:00:00.000Z',
      }),
    );
    const handlers = createAdminCodeEnvironmentHandlers({
      getAppConfig: jest.fn().mockResolvedValue(config()),
      readSecret: jest.fn().mockReturnValue('administrator-bootstrap-token'),
      fetchImpl,
    });
    const response = mockResponse();

    await handlers.createPairing(request(), response);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://bridge.example.com/v1/bridge/pairings',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer administrator-bootstrap-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workerId: 'vm-1' }),
      }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      environmentId: 'attached-vm',
      workerId: 'vm-1',
      code: 'one-time-code-value-that-is-long',
      expiresAt: '2026-08-30T12:00:00.000Z',
    });
    expect(JSON.stringify(response.body)).not.toContain('administrator-bootstrap-token');
  });

  it('fails closed before outbound traffic when the administrator token is unavailable', async () => {
    const fetchImpl = jest.fn();
    const handlers = createAdminCodeEnvironmentHandlers({
      getAppConfig: jest.fn().mockResolvedValue(config()),
      readSecret: jest.fn().mockReturnValue(undefined),
      fetchImpl,
    });
    const response = mockResponse();

    await handlers.createPairing(request(), response);

    expect(response.statusCode).toBe(503);
    expect(response.body).toEqual({ error: 'Code environment pairing is not configured' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('revokes the environment worker without returning bridge credentials', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(Response.json({ revoked: true }));
    const handlers = createAdminCodeEnvironmentHandlers({
      getAppConfig: jest.fn().mockResolvedValue(config()),
      readSecret: jest.fn().mockReturnValue('administrator-bootstrap-token'),
      fetchImpl,
    });
    const response = mockResponse();

    await handlers.revokeWorker(request(), response);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://bridge.example.com/v1/bridge/workers/vm-1/revoke',
      expect.objectContaining({ method: 'POST', redirect: 'error' }),
    );
    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({
      environmentId: 'attached-vm',
      workerId: 'vm-1',
      revoked: true,
    });
    expect(JSON.stringify(response.body)).not.toContain('administrator-bootstrap-token');
  });
});

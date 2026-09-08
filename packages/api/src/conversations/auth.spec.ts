import express from 'express';
import request from 'supertest';
import type { AppConfig } from '@librechat/data-schemas';
import type { RequestHandler } from 'express';
import { createConversationManagementAuth } from './auth';

function createConfig(auth?: 'remote' | 'management'): AppConfig {
  return {
    endpoints: {
      agents: auth == null ? {} : { conversationApi: { auth } },
    },
  } as AppConfig;
}

async function run(
  config: AppConfig,
  remoteAuth: RequestHandler,
  managementAuth: RequestHandler,
  getAppConfig = jest.fn().mockResolvedValue(config),
  remoteAccess: RequestHandler = (_req, _res, next) => next(),
) {
  const app = express();
  app.use(
    createConversationManagementAuth({ getAppConfig, remoteAuth, remoteAccess, managementAuth }),
  );
  app.get('/', (_req, res) => {
    res.sendStatus(204);
  });
  const response = await request(app).get('/').set('Authorization', 'Bearer token');
  return { response, getAppConfig };
}

describe('conversation management authentication selector', () => {
  it.each([
    ['absent', createConfig()],
    ['disabled', createConfig(undefined)],
  ])('returns 401 when conversation authentication is %s', async (_name, config) => {
    const remoteAuth = jest.fn();
    const managementAuth = jest.fn();

    const result = await run(config, remoteAuth, managementAuth);

    expect(result.response.status).toBe(401);
    expect(result.response.body).toEqual({ error: 'Unauthorized' });
    expect(remoteAuth).not.toHaveBeenCalled();
    expect(managementAuth).not.toHaveBeenCalled();
  });

  it('invokes only management authentication when management is selected', async () => {
    const remoteAuth = jest.fn();
    const managementAuth = jest.fn((_req, _res, next) => next());

    const result = await run(createConfig('management'), remoteAuth, managementAuth);

    expect(managementAuth).toHaveBeenCalledTimes(1);
    expect(remoteAuth).not.toHaveBeenCalled();
    expect(result.response.status).toBe(204);
  });

  it('invokes only remote authentication when remote is selected', async () => {
    const remoteAuth = jest.fn((_req, _res, next) => next());
    const managementAuth = jest.fn();

    const result = await run(createConfig('remote'), remoteAuth, managementAuth);

    expect(remoteAuth).toHaveBeenCalledTimes(1);
    expect(managementAuth).not.toHaveBeenCalled();
    expect(result.response.status).toBe(204);
  });

  it.each(['remote', 'management'] as const)(
    'applies the remote grant only in %s mode',
    async (mode) => {
      const authenticate: RequestHandler = (_req, _res, next) => next();
      const remoteAccess = jest.fn((_req, res) => {
        res.sendStatus(403);
      });
      const { response } = await run(
        createConfig(mode),
        authenticate,
        authenticate,
        jest.fn().mockResolvedValue(createConfig(mode)),
        remoteAccess,
      );
      expect(response.status).toBe(mode === 'remote' ? 403 : 204);
      expect(remoteAccess).toHaveBeenCalledTimes(mode === 'remote' ? 1 : 0);
    },
  );

  it('never checks the grant or reaches the handler after remote authentication fails', async () => {
    const reject: RequestHandler = (_req, res) => {
      res.sendStatus(401);
    };
    const remoteAccess = jest.fn();
    const { response } = await run(
      createConfig('remote'),
      reject,
      jest.fn(),
      jest.fn().mockResolvedValue(createConfig('remote')),
      remoteAccess,
    );
    expect(response.status).toBe(401);
    expect(remoteAccess).not.toHaveBeenCalled();
  });

  it('does not fall back to remote when selected management authentication rejects', async () => {
    const remoteAuth = jest.fn();
    const managementAuth = jest.fn().mockRejectedValue(new Error('management rejected'));

    const result = await run(createConfig('management'), remoteAuth, managementAuth);

    expect(result.response.status).toBe(500);
    expect(result.response.body).toEqual({ error: 'Internal server error' });
    expect(remoteAuth).not.toHaveBeenCalled();
  });

  it('does not fall back to management when selected remote authentication rejects', async () => {
    const remoteAuth = jest.fn().mockRejectedValue(new Error('remote rejected'));
    const managementAuth = jest.fn();

    const result = await run(createConfig('remote'), remoteAuth, managementAuth);

    expect(result.response.status).toBe(500);
    expect(result.response.body).toEqual({ error: 'Internal server error' });
    expect(managementAuth).not.toHaveBeenCalled();
  });

  it('fails closed for an invalid runtime authentication mode', async () => {
    const remoteAuth = jest.fn();
    const managementAuth = jest.fn();
    const invalidConfig = createConfig('remote');
    (invalidConfig.endpoints!.agents!.conversationApi as { auth: string }).auth = 'unexpected';

    const result = await run(invalidConfig, remoteAuth, managementAuth);

    expect(result.response.status).toBe(401);
    expect(result.response.body).toEqual({ error: 'Unauthorized' });
    expect(remoteAuth).not.toHaveBeenCalled();
    expect(managementAuth).not.toHaveBeenCalled();
  });

  it('returns 500 when the resolved configuration fails', async () => {
    const remoteAuth = jest.fn();
    const managementAuth = jest.fn();
    const getAppConfig = jest.fn().mockRejectedValue(new Error('config unavailable'));

    const result = await run(createConfig('remote'), remoteAuth, managementAuth, getAppConfig);

    expect(result.response.status).toBe(500);
    expect(result.response.body).toEqual({ error: 'Internal server error' });
    expect(remoteAuth).not.toHaveBeenCalled();
    expect(managementAuth).not.toHaveBeenCalled();
    expect(getAppConfig).toHaveBeenCalledWith({ baseOnly: true });
  });
});

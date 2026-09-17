import express from 'express';
import request from 'supertest';
import { AuthKeys } from 'librechat-data-provider';
import type { UserKeySnapshot } from '@librechat/data-schemas';
import type { UserKeyUpdateDependencies } from './keys';
import { createUserKeyUpdateHandler } from './keys';

describe('user key update HTTP handler', () => {
  const service = {
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'fixture@test-project.iam.gserviceaccount.com',
    private_key: 'fixture-private-material-'.repeat(32),
  };
  const incoming = { [AuthKeys.GOOGLE_API_KEY]: 'new-api-key', baseURL: 'https://google.example' };
  const now = Date.parse('2030-01-01T00:00:00Z');
  let deps: jest.Mocked<UserKeyUpdateDependencies>;
  let app: express.Express;
  let snapshot: UserKeySnapshot;

  beforeEach(() => {
    snapshot = { id: 'key-id', value: 'encrypted-key', expiresAt: null };
    deps = {
      updateUserKey: jest.fn().mockResolvedValue(undefined),
      getUserKeySnapshot: jest.fn().mockResolvedValue(snapshot),
      compareAndSetUserKey: jest.fn().mockResolvedValue(true),
      decrypt: jest.fn().mockResolvedValue(
        JSON.stringify({
          [AuthKeys.GOOGLE_API_KEY]: 'old-api-key',
          [AuthKeys.GOOGLE_SERVICE_KEY]: JSON.stringify(service),
          unrelated: 'do-not-preserve',
        }),
      ),
      now: jest.fn().mockReturnValue(now),
    };
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      Object.assign(req, { user: { id: 'authenticated-owner' } });
      next();
    });
    app.put('/api/keys', createUserKeyUpdateHandler(deps));
  });

  function update(extra = {}) {
    return request(app)
      .put('/api/keys')
      .send({
        name: 'google',
        value: JSON.stringify(incoming),
        preserveGoogleServiceKey: true,
        ...extra,
      });
  }

  it.each(['string', 'object'])(
    'preserves a valid %s service account without returning secrets',
    async (kind) => {
      const saved = kind === 'string' ? JSON.stringify(service) : service;
      deps.decrypt.mockResolvedValue(JSON.stringify({ [AuthKeys.GOOGLE_SERVICE_KEY]: saved }));
      const response = await update({ userId: 'other-owner', expiresAt: '2031-01-01' });
      expect(response.status).toBe(201);
      expect(response.text).toBe('');
      expect(deps.getUserKeySnapshot).toHaveBeenCalledWith({
        userId: 'authenticated-owner',
        name: 'google',
      });
      expect(deps.compareAndSetUserKey).toHaveBeenCalledWith({
        userId: 'authenticated-owner',
        name: 'google',
        value: expect.any(String),
        expiresAt: '2031-01-01',
        expected: snapshot,
        requireActive: true,
      });
      expect(JSON.parse(deps.compareAndSetUserKey.mock.calls[0][0].value)).toEqual({
        ...incoming,
        [AuthKeys.GOOGLE_SERVICE_KEY]: saved,
      });
      expect(deps.updateUserKey).not.toHaveBeenCalled();
    },
  );

  it('preserves only the service key and uses the new API key, URL and expiry', async () => {
    expect((await update()).status).toBe(201);
    expect(JSON.parse(deps.compareAndSetUserKey.mock.calls[0][0].value)).toEqual({
      ...incoming,
      [AuthKeys.GOOGLE_SERVICE_KEY]: JSON.stringify(service),
    });
  });

  it('does not decrypt or revive an expired record', async () => {
    snapshot.expiresAt = new Date(now - 1).toISOString();
    expect((await update()).status).toBe(201);
    expect(deps.decrypt).not.toHaveBeenCalled();
    expect(JSON.parse(deps.compareAndSetUserKey.mock.calls[0][0].value)).toEqual(incoming);
  });

  it('does not preserve a record that expires while it is being decrypted', async () => {
    snapshot.expiresAt = new Date(now + 1).toISOString();
    deps.now.mockReturnValueOnce(now).mockReturnValue(now + 2);
    expect((await update()).status).toBe(201);
    expect(JSON.parse(deps.compareAndSetUserKey.mock.calls[0][0].value)).toEqual(incoming);
  });

  it.each([
    'legacy-raw-api-key',
    JSON.stringify({ [AuthKeys.GOOGLE_API_KEY]: 'legacy-api-key' }),
    JSON.stringify({ [AuthKeys.GOOGLE_SERVICE_KEY]: 'broken-json' }),
    JSON.stringify({ [AuthKeys.GOOGLE_SERVICE_KEY]: { private_key: 'incomplete' } }),
  ])('does not copy invalid or absent service account data', async (previous) => {
    deps.decrypt.mockResolvedValue(previous);
    expect((await update()).status).toBe(201);
    expect(JSON.parse(deps.compareAndSetUserKey.mock.calls[0][0].value)).toEqual(incoming);
  });

  it('inserts through compare-and-set when there is no previous record', async () => {
    deps.getUserKeySnapshot.mockResolvedValue(null);
    expect((await update()).status).toBe(201);
    expect(deps.decrypt).not.toHaveBeenCalled();
    expect(deps.compareAndSetUserKey).toHaveBeenCalledWith(
      expect.objectContaining({ expected: null }),
    );
  });

  it('returns a safe conflict without replay or replacement when the snapshot changes', async () => {
    deps.compareAndSetUserKey.mockResolvedValue(false);
    const response = await update();
    expect(response.status).toBe(409);
    expect(response.text).not.toContain('api-key');
    expect(response.text).not.toContain('fixture-private');
    expect(deps.compareAndSetUserKey).toHaveBeenCalledTimes(1);
    expect(deps.updateUserKey).not.toHaveBeenCalled();
  });

  it.each([
    { name: 'native-google' },
    { value: 'raw-key' },
    { value: JSON.stringify({ apiKey: 'wrong-envelope' }) },
    { value: JSON.stringify({ [AuthKeys.GOOGLE_API_KEY]: ' ' }) },
    { value: JSON.stringify({ ...incoming, [AuthKeys.GOOGLE_SERVICE_KEY]: 'replacement' }) },
    { expiresAt: 'not-a-date' },
  ])('rejects invalid preserve requests before reading or changing credentials', async (extra) => {
    expect((await update(extra)).status).toBe(400);
    expect(deps.getUserKeySnapshot).not.toHaveBeenCalled();
    expect(deps.compareAndSetUserKey).not.toHaveBeenCalled();
    expect(deps.updateUserKey).not.toHaveBeenCalled();
  });

  it.each([false, undefined])(
    'keeps full replacement behavior without preserve=true',
    async (flag) => {
      const value = JSON.stringify({ [AuthKeys.GOOGLE_SERVICE_KEY]: 'full-form-replacement' });
      expect((await update({ preserveGoogleServiceKey: flag, value })).status).toBe(201);
      expect(deps.updateUserKey).toHaveBeenCalledWith({
        userId: 'authenticated-owner',
        name: 'google',
        value,
        expiresAt: undefined,
      });
      expect(deps.getUserKeySnapshot).not.toHaveBeenCalled();
      expect(deps.compareAndSetUserKey).not.toHaveBeenCalled();
    },
  );

  it('fails safely if an active record cannot be decrypted', async () => {
    deps.decrypt.mockRejectedValue(new Error('secret-error-material'));
    const response = await update();
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('secret-error-material');
    expect(deps.compareAndSetUserKey).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated saves', async () => {
    const unauthenticated = express();
    unauthenticated.use(express.json());
    unauthenticated.put('/api/keys', createUserKeyUpdateHandler(deps));
    const response = await request(unauthenticated)
      .put('/api/keys')
      .send({ name: 'google', value: 'key' });
    expect(response.status).toBe(401);
    expect(deps.updateUserKey).not.toHaveBeenCalled();
    expect(deps.getUserKeySnapshot).not.toHaveBeenCalled();
  });
});

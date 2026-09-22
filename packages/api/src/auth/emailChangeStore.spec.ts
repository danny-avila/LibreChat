import { Types } from 'mongoose';
import type { AppConfig } from '@librechat/data-schemas';
import type { EmailChangeRuntime, EmailChangeStore } from './emailChangeStore';
import { createEmailChangeDeps } from './emailChangeStore';
import { resolveEmailChangeSettings } from './email';

function createStore(overrides: Partial<EmailChangeStore> = {}): jest.Mocked<EmailChangeStore> {
  return {
    findUser: jest.fn().mockResolvedValue(null),
    getUserById: jest.fn().mockResolvedValue(null),
    updateUser: jest.fn().mockResolvedValue(null),
    findToken: jest.fn().mockResolvedValue(null),
    replaceTokenIfCurrent: jest.fn().mockResolvedValue(true),
    deleteTokens: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    ...overrides,
  } as jest.Mocked<EmailChangeStore>;
}

/** A jest.fn cannot satisfy the generic runner, so the spy records beside a typed one. */
function createTenantRunner(): {
  scopes: Array<string | undefined>;
  withTenant: EmailChangeRuntime['withTenant'];
} {
  const scopes: Array<string | undefined> = [];
  return {
    scopes,
    withTenant: (tenantId, operation) => {
      scopes.push(tenantId);
      return operation();
    },
  };
}

function createRuntime(overrides: Partial<EmailChangeRuntime> = {}): EmailChangeRuntime {
  return {
    store: createStore(),
    withTenant: (_tenantId, operation) => operation(),
    comparePassword: jest.fn().mockResolvedValue(true),
    sendEmail: jest.fn().mockResolvedValue(undefined),
    getAppConfig: jest.fn().mockResolvedValue({ config: {} } as AppConfig),
    clientDomain: 'https://chat.example.com',
    appName: 'LibreChat',
    ...overrides,
  };
}

describe('createEmailChangeDeps', () => {
  describe('tenant scoping', () => {
    it('scopes a tenant-less identity lookup so another tenant cannot answer it', async () => {
      const store = createStore();
      const deps = createEmailChangeDeps(createRuntime({ store }));

      await deps.findUserByEmail('moved@example.com');

      expect(store.findUser).toHaveBeenCalledWith(
        {
          email: 'moved@example.com',
          $or: [{ tenantId: { $exists: false } }, { tenantId: null }],
        },
        expect.any(String),
      );
    });

    it('lets the tenant context carry the scope when there is one', async () => {
      const store = createStore();
      const { scopes, withTenant } = createTenantRunner();
      const deps = createEmailChangeDeps(createRuntime({ store, withTenant }));

      await deps.findUserByEmail('moved@example.com', 'tenant-a');

      expect(store.findUser).toHaveBeenCalledWith(
        { email: 'moved@example.com' },
        expect.any(String),
      );
      expect(scopes).toEqual(['tenant-a']);
    });

    it('runs every read through the tenant runner', async () => {
      const { scopes, withTenant } = createTenantRunner();
      const deps = createEmailChangeDeps(createRuntime({ withTenant }));

      await deps.getUserById('user-1', 'tenant-a');
      await deps.findToken({ scope: 'email_change:user-1' }, 'tenant-a');
      await deps.deleteTokens({ userId: 'user-1' }, 'tenant-a');

      expect(scopes).toEqual(['tenant-a', 'tenant-a', 'tenant-a']);
    });
  });

  describe('narrowing stored documents', () => {
    it('hands the service plain string ids', async () => {
      const _id = new Types.ObjectId();
      const tenantId = new Types.ObjectId();
      const store = createStore({
        getUserById: jest.fn().mockResolvedValue({
          _id,
          tenantId,
          email: 'current@example.com',
          provider: 'local',
          password: 'hashed',
        }),
      });
      const deps = createEmailChangeDeps(createRuntime({ store }));

      const user = await deps.getUserById('user-1');

      expect(user).toEqual({
        _id: _id.toString(),
        id: undefined,
        email: 'current@example.com',
        name: undefined,
        username: undefined,
        password: 'hashed',
        provider: 'local',
        role: undefined,
        tenantId: tenantId.toString(),
      });
    });

    it('treats a document without an address as no user', async () => {
      const store = createStore({ getUserById: jest.fn().mockResolvedValue({ _id: 'user-1' }) });
      const deps = createEmailChangeDeps(createRuntime({ store }));

      await expect(deps.getUserById('user-1')).resolves.toBeNull();
    });

    it('treats a token without its hash as no token', async () => {
      const store = createStore({
        findToken: jest.fn().mockResolvedValue({ userId: new Types.ObjectId() }),
      });
      const deps = createEmailChangeDeps(createRuntime({ store }));

      await expect(deps.findToken({ scope: 'email_change:user-1' })).resolves.toBeNull();
    });

    it('reads the newest token for a scope', async () => {
      const store = createStore();
      const deps = createEmailChangeDeps(createRuntime({ store }));

      await deps.findToken({ scope: 'email_change:user-1' });

      expect(store.findToken).toHaveBeenCalledWith(
        { scope: 'email_change:user-1' },
        { sort: { createdAt: -1 } },
      );
    });
  });

  describe('operator settings', () => {
    it('prefers the yaml section over the environment', async () => {
      const getAppConfig = jest
        .fn()
        .mockResolvedValue({ config: { emailChange: { enabled: false } } } as AppConfig);
      const deps = createEmailChangeDeps(createRuntime({ getAppConfig }));

      await expect(deps.resolveSettings()).resolves.toMatchObject({ enabled: false });
    });

    it('reads the settings of the tenant it is asked about', async () => {
      const { scopes, withTenant } = createTenantRunner();
      const getAppConfig = jest
        .fn()
        .mockResolvedValue({ config: { emailChange: { tokenTTLSeconds: 300 } } } as AppConfig);
      const deps = createEmailChangeDeps(createRuntime({ getAppConfig, withTenant }));

      await expect(deps.resolveSettings('tenant-a')).resolves.toMatchObject({
        tokenTTLSeconds: 300,
      });
      expect(scopes).toEqual(['tenant-a']);
    });
  });

  describe('confirmation-time domain policy', () => {
    it('resolves the allowlist against the principal scope of that user', async () => {
      const getAppConfig = jest.fn().mockResolvedValue({
        config: {},
        registration: { allowedDomains: ['allowed.example.com'] },
      } as AppConfig);
      const deps = createEmailChangeDeps(createRuntime({ getAppConfig }));

      await expect(
        deps.resolveAllowedDomains({
          _id: 'user-1',
          email: 'current@example.com',
          role: 'USER',
          tenantId: 'tenant-a',
        }),
      ).resolves.toEqual(['allowed.example.com']);
      expect(getAppConfig).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', role: 'USER', tenantId: 'tenant-a' }),
      );
    });
  });
});

describe('resolveEmailChangeSettings', () => {
  it('is enabled with the documented lifetime when nothing is configured', () => {
    expect(resolveEmailChangeSettings(undefined, {})).toEqual({
      enabled: true,
      tokenTTLSeconds: 900,
    });
  });

  it('honors the environment when there is no yaml section', () => {
    expect(resolveEmailChangeSettings(undefined, { ALLOW_EMAIL_CHANGE: 'false' })).toMatchObject({
      enabled: false,
    });
  });

  it('lets yaml override the environment', () => {
    expect(
      resolveEmailChangeSettings({ enabled: true }, { ALLOW_EMAIL_CHANGE: 'false' }),
    ).toMatchObject({ enabled: true });
  });
});

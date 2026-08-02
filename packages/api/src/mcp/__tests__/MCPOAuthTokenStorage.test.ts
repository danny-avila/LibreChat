/**
 * Integration tests for MCPTokenStorage.storeTokens() and MCPTokenStorage.getTokens().
 *
 * Uses InMemoryTokenStore to exercise encrypt/decrypt round-trips, expiry calculation,
 * refresh callback wiring, and ReauthenticationRequiredError paths.
 */

import type { TokenMethods } from '@librechat/data-schemas';
import type { MCPOAuthTokens } from '~/mcp/oauth';
import { MCPTokenStorage, ReauthenticationRequiredError } from '~/mcp/oauth';
import { InMemoryTokenStore } from './helpers/oauthTestServer';

const credentialSetId = 'credential-set-a';
const storedTokenMetadata = { credential_set_id: credentialSetId };
const storedBindingMetadata = {
  ...storedTokenMetadata,
  authorization_endpoint: 'https://auth.example.com/authorize',
  token_endpoint: 'https://auth.example.com/token',
  server_url: 'https://mcp.example.com/',
  client_source: 'dynamic',
} as const;

function createBoundToken(
  store: InMemoryTokenStore,
  data: Parameters<InMemoryTokenStore['createToken']>[0],
) {
  return store.createToken({
    ...data,
    metadata: { ...storedTokenMetadata, ...(data.metadata ?? {}) },
  });
}

jest.mock('@librechat/data-schemas', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  getTenantId: jest.fn(),
  encryptV2: jest.fn(async (val: string) => `enc:${val}`),
  decryptV2: jest.fn(async (val: string) => val.replace(/^enc:/, '')),
}));

describe('MCPTokenStorage', () => {
  let store: InMemoryTokenStore;

  beforeEach(() => {
    store = new InMemoryTokenStore();
    jest.clearAllMocks();
  });

  describe('isCurrentAccessToken', () => {
    it('rejects a flow-cached token after persistent storage has rotated it', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:new-token',
        expiresIn: 3600,
      });

      await expect(
        MCPTokenStorage.isCurrentAccessToken({
          userId: 'u1',
          serverName: 'srv1',
          accessToken: 'old-cached-token',
          credentialSetId,
          findToken: store.findToken,
        }),
      ).resolves.toBe(false);
      await expect(
        MCPTokenStorage.isCurrentAccessToken({
          userId: 'u1',
          serverName: 'srv1',
          accessToken: 'new-token',
          credentialSetId,
          findToken: store.findToken,
        }),
      ).resolves.toBe(true);
    });

    it('rejects the same token value after its credential generation changes', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:same-token',
        expiresIn: 3600,
        metadata: { credential_set_id: 'credential-set-b' },
      });

      await expect(
        MCPTokenStorage.isCurrentAccessToken({
          userId: 'u1',
          serverName: 'srv1',
          accessToken: 'same-token',
          credentialSetId,
          findToken: store.findToken,
        }),
      ).resolves.toBe(false);
    });
  });

  describe('storeTokens', () => {
    it('keeps the trusted flow generation when provider metadata supplies a conflicting ID', async () => {
      const result = await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'at1',
          token_type: 'Bearer',
          obtained_at: Date.now(),
          credential_set_id: 'credential-set-from-flow',
        },
        createToken: store.createToken,
        clientInfo: { client_id: 'client-id' },
        metadata: {
          ...storedBindingMetadata,
          credential_set_id: 'credential-set-from-metadata',
        },
      });

      expect(result.credential_set_id).toBe('credential-set-from-flow');
      expect(store.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            metadata: expect.objectContaining({
              credential_set_id: 'credential-set-from-flow',
            }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            metadata: expect.objectContaining({
              credential_set_id: 'credential-set-from-flow',
            }),
          }),
        ]),
      );
    });

    it('does not adopt a provider metadata generation when callback tokens lack one', async () => {
      const result = await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer' },
        createToken: store.createToken,
        clientInfo: { client_id: 'client-id' },
        metadata: {
          ...storedBindingMetadata,
          credential_set_id: 'provider-controlled-generation',
        },
      });

      expect(result.credential_set_id).toEqual(expect.any(String));
      expect(result.credential_set_id).not.toBe('provider-controlled-generation');
      expect(store.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            metadata: expect.objectContaining({
              credential_set_id: result.credential_set_id,
            }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            metadata: expect.objectContaining({
              credential_set_id: result.credential_set_id,
            }),
          }),
        ]),
      );
    });

    it('rejects metadata that conflicts with the expected refresh generation', async () => {
      const createToken = jest.fn();

      await expect(
        MCPTokenStorage.storeTokens({
          userId: 'u1',
          serverName: 'srv1',
          tokens: { access_token: 'at1', token_type: 'Bearer' },
          createToken,
          metadata: {
            ...storedBindingMetadata,
            credential_set_id: 'different-generation',
          },
          expectedCredentialSetId: credentialSetId,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
      expect(createToken).not.toHaveBeenCalled();
    });

    it('rejects a stale write when the generation changes after prevalidation', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-a-access',
          refresh_token: 'generation-a-refresh',
          token_type: 'Bearer',
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-a', client_secret: 'secret-a' },
        metadata: storedBindingMetadata,
      });

      let replaced = false;
      const interleavedUpdate = jest.fn(async (...args: Parameters<typeof store.updateToken>) => {
        if (!replaced) {
          replaced = true;
          await MCPTokenStorage.storeTokens({
            userId: 'u1',
            serverName: 'srv1',
            tokens: {
              access_token: 'generation-b-access',
              refresh_token: 'generation-b-refresh',
              token_type: 'Bearer',
              credential_set_id: 'credential-set-b',
            },
            createToken: store.createToken,
            updateToken: store.updateToken,
            findToken: store.findToken,
            clientInfo: { client_id: 'client-b', client_secret: 'secret-b' },
            metadata: {
              ...storedBindingMetadata,
              credential_set_id: 'credential-set-b',
            },
          });
        }
        return await store.updateToken(...args);
      }) as typeof store.updateToken;

      await expect(
        MCPTokenStorage.storeTokens({
          userId: 'u1',
          serverName: 'srv1',
          tokens: {
            access_token: 'late-generation-a-access',
            refresh_token: 'late-generation-a-refresh',
            token_type: 'Bearer',
            credential_set_id: credentialSetId,
          },
          createToken: store.createToken,
          updateToken: interleavedUpdate,
          findToken: store.findToken,
          clientInfo: { client_id: 'client-a', client_secret: 'secret-a' },
          metadata: storedBindingMetadata,
          expectedCredentialSetId: credentialSetId,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(interleavedUpdate).toHaveBeenCalledTimes(1);
      expect(store.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            token: 'enc:generation-b-access',
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-b' }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_refresh',
            token: 'enc:generation-b-refresh',
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-b' }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            token: expect.stringContaining('client-b'),
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-b' }),
          }),
        ]),
      );
    });

    it('rolls back callback access when an interleaved refresh wins the next CAS', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-a-refreshed-access',
          refresh_token: 'generation-a-refresh',
          token_type: 'Bearer',
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        deleteTokens: store.deleteTokens,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-a', client_secret: 'secret-a' },
        metadata: storedBindingMetadata,
      });

      let injectedRefresh = false;
      const interleavedUpdate = jest.fn(async (...args: Parameters<typeof store.updateToken>) => {
        const updated = await store.updateToken(...args);
        const [query] = args;
        if (updated && !injectedRefresh && query.type === 'mcp_oauth') {
          injectedRefresh = true;
          await store.updateToken(
            {
              userId: 'u1',
              type: 'mcp_oauth_refresh',
              identifier: 'mcp:srv1:refresh',
              token: 'enc:generation-a-refresh',
              metadataCredentialSetId: credentialSetId,
            },
            {
              token: 'enc:generation-a-rotated-refresh',
              metadata: storedTokenMetadata,
            },
          );
          await store.updateToken(
            {
              userId: 'u1',
              type: 'mcp_oauth_client',
              identifier: 'mcp:srv1:client',
              metadataCredentialSetId: credentialSetId,
            },
            {
              token: 'enc:{"client_id":"client-a-rotated","client_secret":"secret-a"}',
              metadata: storedBindingMetadata,
            },
          );
        }
        return updated;
      }) as typeof store.updateToken;

      await expect(
        MCPTokenStorage.storeTokens({
          userId: 'u1',
          serverName: 'srv1',
          tokens: {
            access_token: 'generation-b-access',
            refresh_token: 'generation-b-refresh',
            token_type: 'Bearer',
            credential_set_id: 'credential-set-b',
          },
          createToken: store.createToken,
          updateToken: interleavedUpdate,
          deleteTokens: store.deleteTokens,
          findToken: store.findToken,
          clientInfo: { client_id: 'client-b', client_secret: 'secret-b' },
          metadata: storedBindingMetadata,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(store.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            token: 'enc:generation-a-refreshed-access',
            metadata: expect.objectContaining({ credential_set_id: credentialSetId }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_refresh',
            token: 'enc:generation-a-rotated-refresh',
            metadata: expect.objectContaining({ credential_set_id: credentialSetId }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            token: expect.stringContaining('client-a-rotated'),
            metadata: expect.objectContaining({ credential_set_id: credentialSetId }),
          }),
        ]),
      );
    });

    it('does not roll back over a newer writer that supersedes the callback anchor', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-a-access',
          refresh_token: 'generation-a-refresh',
          token_type: 'Bearer',
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        deleteTokens: store.deleteTokens,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-a', client_secret: 'secret-a' },
        metadata: storedBindingMetadata,
      });

      let injectedNewerWriter = false;
      const interleavedUpdate = jest.fn(async (...args: Parameters<typeof store.updateToken>) => {
        const updated = await store.updateToken(...args);
        const [query] = args;
        if (updated && !injectedNewerWriter && query.type === 'mcp_oauth') {
          injectedNewerWriter = true;
          const generationCMetadata = { credential_set_id: 'credential-set-c' };
          await store.updateToken(
            {
              userId: 'u1',
              type: 'mcp_oauth',
              identifier: 'mcp:srv1',
              token: 'enc:generation-b-access',
              metadataCredentialSetId: 'credential-set-b',
            },
            { token: 'enc:generation-c-access', metadata: generationCMetadata },
          );
          await store.updateToken(
            {
              userId: 'u1',
              type: 'mcp_oauth_refresh',
              identifier: 'mcp:srv1:refresh',
              metadataCredentialSetId: credentialSetId,
            },
            { token: 'enc:generation-c-refresh', metadata: generationCMetadata },
          );
          await store.updateToken(
            {
              userId: 'u1',
              type: 'mcp_oauth_client',
              identifier: 'mcp:srv1:client',
              metadataCredentialSetId: credentialSetId,
            },
            {
              token: 'enc:{"client_id":"client-c","client_secret":"secret-c"}',
              metadata: { ...storedBindingMetadata, ...generationCMetadata },
            },
          );
        }
        return updated;
      }) as typeof store.updateToken;

      await expect(
        MCPTokenStorage.storeTokens({
          userId: 'u1',
          serverName: 'srv1',
          tokens: {
            access_token: 'generation-b-access',
            refresh_token: 'generation-b-refresh',
            token_type: 'Bearer',
            credential_set_id: 'credential-set-b',
          },
          createToken: store.createToken,
          updateToken: interleavedUpdate,
          deleteTokens: store.deleteTokens,
          findToken: store.findToken,
          clientInfo: { client_id: 'client-b', client_secret: 'secret-b' },
          metadata: storedBindingMetadata,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(store.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            token: 'enc:generation-c-access',
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-c' }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_refresh',
            token: 'enc:generation-c-refresh',
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-c' }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            token: expect.stringContaining('client-c'),
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-c' }),
          }),
        ]),
      );
    });

    it('fails closed without writes when access and client generations are already mixed', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-a-access',
          refresh_token: 'generation-a-refresh',
          token_type: 'Bearer',
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        deleteTokens: store.deleteTokens,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-a', client_secret: 'secret-a' },
        metadata: storedBindingMetadata,
      });
      await store.updateToken(
        {
          userId: 'u1',
          type: 'mcp_oauth',
          identifier: 'mcp:srv1',
          token: 'enc:generation-a-access',
          metadataCredentialSetId: credentialSetId,
        },
        {
          token: 'enc:crash-left-generation-b-access',
          metadata: { credential_set_id: 'credential-set-b' },
        },
      );

      const createToken = jest.fn(store.createToken);
      const updateToken = jest.fn(store.updateToken);
      const deleteTokens = jest.fn(store.deleteTokens);

      await expect(
        MCPTokenStorage.storeTokens({
          userId: 'u1',
          serverName: 'srv1',
          tokens: {
            access_token: 'generation-c-access',
            refresh_token: 'generation-c-refresh',
            token_type: 'Bearer',
            credential_set_id: 'credential-set-c',
          },
          createToken,
          updateToken,
          deleteTokens,
          findToken: store.findToken,
          clientInfo: { client_id: 'client-c', client_secret: 'secret-c' },
          metadata: storedBindingMetadata,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(createToken).not.toHaveBeenCalled();
      expect(updateToken).not.toHaveBeenCalled();
      expect(deleteTokens).not.toHaveBeenCalled();
      expect(store.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            token: 'enc:crash-left-generation-b-access',
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-b' }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_refresh',
            token: 'enc:generation-a-refresh',
            metadata: expect.objectContaining({ credential_set_id: credentialSetId }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            token: expect.stringContaining('client-a'),
            metadata: expect.objectContaining({ credential_set_id: credentialSetId }),
          }),
        ]),
      );
    });

    it('deletes its own created records when a later create fails', async () => {
      const createToken = jest.fn(async (data) => {
        if (data.type === 'mcp_oauth_refresh') {
          throw new Error('refresh create failed');
        }
        return await store.createToken(data);
      }) as typeof store.createToken;
      const deleteTokens = jest.fn(store.deleteTokens);

      await expect(
        MCPTokenStorage.storeTokens({
          userId: 'u1',
          serverName: 'srv1',
          tokens: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            token_type: 'Bearer',
            credential_set_id: 'credential-set-new',
          },
          createToken,
          deleteTokens,
        }),
      ).rejects.toThrow('refresh create failed');

      expect(store.getAll()).toHaveLength(0);
      expect(deleteTokens).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'mcp_oauth',
          token: 'enc:new-access',
          metadataCredentialSetId: 'credential-set-new',
        }),
      );
    });

    it('should create new access token with expires_in', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved).not.toBeNull();
      expect(saved!.token).toBe('enc:at1');
      const expiresInMs = saved!.expiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(3500 * 1000);
      expect(expiresInMs).toBeLessThanOrEqual(3600 * 1000);
    });

    it('should create new access token with expires_at (MCPOAuthTokens format)', async () => {
      const expiresAt = Date.now() + 7200 * 1000;
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'at1',
          token_type: 'Bearer',
          expires_at: expiresAt,
          obtained_at: Date.now(),
        },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved).not.toBeNull();
      const diff = Math.abs(saved!.expiresAt.getTime() - expiresAt);
      expect(diff).toBeLessThan(2000);
    });

    it('should default to 1-year expiry when none provided', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer' },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const expiresInMs = saved!.expiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(oneYearMs - 5000);
    });

    it('should update existing access token', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:old-token',
        expiresIn: 3600,
      });

      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'new-token', token_type: 'Bearer', expires_in: 7200 },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved!.token).toBe('enc:new-token');
    });

    it('should store refresh token alongside access token', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'at1',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'rt1',
        },
        createToken: store.createToken,
      });

      const refreshSaved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
      });
      expect(refreshSaved).not.toBeNull();
      expect(refreshSaved!.token).toBe('enc:rt1');
    });

    it('should skip refresh token when not in response', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
      });

      const refreshSaved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
      });
      expect(refreshSaved).toBeNull();
    });

    it('should store client info when provided', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
        clientInfo: { client_id: 'cid', client_secret: 'csec' },
      });

      const clientSaved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
      });
      expect(clientSaved).not.toBeNull();
      expect(clientSaved!.token).toContain('enc:');
      expect(clientSaved!.token).toContain('cid');
    });

    it('should use existingTokens to skip DB lookups', async () => {
      const findSpy = jest.fn();

      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'at1', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: findSpy,
        existingTokens: {
          accessToken: null,
          refreshToken: null,
          clientInfoToken: null,
        },
      });

      expect(findSpy).not.toHaveBeenCalled();
    });

    it('should handle invalid NaN expiry date', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'at1',
          token_type: 'Bearer',
          expires_at: NaN,
          obtained_at: Date.now(),
        },
        createToken: store.createToken,
      });

      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved).not.toBeNull();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const expiresInMs = saved!.expiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(oneYearMs - 5000);
    });
  });

  describe('getTokens', () => {
    beforeEach(async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });
    });

    it('should return valid non-expired tokens', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:valid-token',
        expiresIn: 3600,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('valid-token');
      expect(result!.token_type).toBe('Bearer');
    });

    it('rejects an access token read before a concurrent client generation replacement', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:generation-a-access',
        expiresIn: 3600,
      });
      let replaced = false;
      const interleavedFind = jest.fn(async (query) => {
        const result = await store.findToken(query);
        if (!replaced && query.type === 'mcp_oauth') {
          replaced = true;
          await createBoundToken(store, {
            userId: 'u1',
            type: 'mcp_oauth',
            identifier: 'mcp:srv1',
            token: 'enc:generation-b-access',
            expiresIn: 3600,
            metadata: { credential_set_id: 'credential-set-b' },
          });
          await createBoundToken(store, {
            userId: 'u1',
            type: 'mcp_oauth_client',
            identifier: 'mcp:srv1:client',
            token: 'enc:{"client_id":"client-b"}',
            expiresIn: 86400,
            metadata: {
              ...storedBindingMetadata,
              credential_set_id: 'credential-set-b',
            },
          });
        }
        return result;
      }) as typeof store.findToken;

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: interleavedFind,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should return tokens with refresh token when available', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:at',
        expiresIn: 3600,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result!.refresh_token).toBe('rt');
    });

    it('should return tokens without refresh token field when none stored', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:at',
        expiresIn: 3600,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result!.refresh_token).toBeUndefined();
    });

    it('should throw ReauthenticationRequiredError when expired and no refresh', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should throw ReauthenticationRequiredError when missing and no refresh', async () => {
      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should refresh expired access token when refresh token and callback are available', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockResolvedValue({
        access_token: 'refreshed-at',
        token_type: 'Bearer',
        expires_in: 3600,
        obtained_at: Date.now(),
        expires_at: Date.now() + 3600000,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        refreshTokens,
      });

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('refreshed-at');
      expect(refreshTokens).toHaveBeenCalledWith(
        'rt',
        expect.objectContaining({ userId: 'u1', serverName: 'srv1' }),
        expect.any(AbortSignal),
      );
    });

    it('should return null when refresh fails', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('refresh failed'));

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        refreshTokens,
      });

      expect(result).toBeNull();
    });

    it('should return null when no refreshTokens callback provided', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result).toBeNull();
    });

    it('should return null when no createToken callback provided', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        refreshTokens: jest.fn(),
      });

      expect(result).toBeNull();
    });

    it('should pass client info to refreshTokens metadata', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid","client_secret":"csec"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });

      const refreshTokens = jest.fn().mockResolvedValue({
        access_token: 'new-at',
        token_type: 'Bearer',
        expires_in: 3600,
      });

      await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        refreshTokens,
      });

      expect(refreshTokens).toHaveBeenCalledWith(
        'rt',
        expect.objectContaining({
          clientInfo: expect.objectContaining({ client_id: 'cid' }),
        }),
        expect.any(AbortSignal),
      );
    });

    it('should handle unauthorized_client refresh error', async () => {
      const { logger } = await import('@librechat/data-schemas');

      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('unauthorized_client'));

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        refreshTokens,
      });

      expect(result).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('does not support refresh tokens'),
      );
    });

    it('should delete client registration and refresh token on invalid_client when deleteTokens provided', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('invalid_client'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: store.deleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(
        expect.objectContaining({
          name: 'ReauthenticationRequiredError',
          message: expect.stringContaining('stored client registration is no longer valid'),
        }),
      );

      const clientReg = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
      });
      expect(clientReg).toBeNull();

      const refreshToken = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
      });
      expect(refreshToken).toBeNull();
    });

    it('should return null and log warning on invalid_client when deleteTokens not provided', async () => {
      const { logger } = await import('@librechat/data-schemas');

      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('invalid_client'));

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        refreshTokens,
      });

      expect(result).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('deleteTokens not available'),
      );
    });

    it('should handle client_not_found and other vendor-specific rejection patterns', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('client not found'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: store.deleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(
        await store.findToken({
          userId: 'u1',
          type: 'mcp_oauth_client',
          identifier: 'mcp:srv1:client',
        }),
      ).toBeNull();
      expect(
        await store.findToken({
          userId: 'u1',
          type: 'mcp_oauth_refresh',
          identifier: 'mcp:srv1:refresh',
        }),
      ).toBeNull();
    });

    it('should handle case-insensitive error messages for client rejection', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('INVALID_CLIENT'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: store.deleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });

    it('should still throw ReauthenticationRequiredError when deleteClientRegistration fails', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:expired-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('invalid_client'));
      const failingDeleteTokens = jest.fn().mockRejectedValue(new Error('DB connection lost'));

      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: failingDeleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);
    });
  });

  describe('forceRefreshTokens', () => {
    beforeEach(async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });
    });

    it('fails closed before invoking refresh for legacy client metadata', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"legacy-client"}',
        expiresIn: 86400,
      });
      const refreshTokens = jest.fn();

      await expect(
        MCPTokenStorage.forceRefreshTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(refreshTokens).not.toHaveBeenCalled();
    });

    it('does not send a refresh token read before a concurrent client generation replacement', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:generation-a-refresh',
        expiresIn: 86400,
      });
      let replaced = false;
      const interleavedFind = jest.fn(async (query) => {
        const result = await store.findToken(query);
        if (!replaced && query.type === 'mcp_oauth_refresh') {
          replaced = true;
          await createBoundToken(store, {
            userId: 'u1',
            type: 'mcp_oauth_client',
            identifier: 'mcp:srv1:client',
            token: 'enc:{"client_id":"client-b","client_secret":"secret-b"}',
            expiresIn: 86400,
            metadata: {
              ...storedBindingMetadata,
              credential_set_id: 'credential-set-b',
            },
          });
        }
        return result;
      }) as typeof store.findToken;
      const refreshTokens = jest.fn();

      await expect(
        MCPTokenStorage.forceRefreshTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: interleavedFind,
          createToken: store.createToken,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(refreshTokens).not.toHaveBeenCalled();
    });

    it('does not persist a late refresh after interactive authorization replaces its generation', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-a-access',
          refresh_token: 'generation-a-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-a', client_secret: 'secret-a' },
        metadata: storedBindingMetadata,
      });

      let markRefreshStarted!: () => void;
      const refreshStarted = new Promise<void>((resolve) => {
        markRefreshStarted = resolve;
      });
      let finishRefresh!: (tokens: MCPOAuthTokens) => void;
      const refreshResponse = new Promise<MCPOAuthTokens>((resolve) => {
        finishRefresh = resolve;
      });
      const refreshTokens = jest.fn(async () => {
        markRefreshStarted();
        return await refreshResponse;
      });
      const staleCreateToken = jest.fn(store.createToken);
      const staleUpdateToken = jest.fn(store.updateToken);

      const staleRefresh = MCPTokenStorage.forceRefreshTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: staleCreateToken,
        updateToken: staleUpdateToken,
        refreshTokens,
      });
      let staleRefreshError: unknown;
      const observedStaleRefresh = staleRefresh.catch((error) => {
        staleRefreshError = error;
      });
      await refreshStarted;

      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-b-access',
          refresh_token: 'generation-b-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          credential_set_id: 'credential-set-b',
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-b', client_secret: 'secret-b' },
        metadata: {
          ...storedBindingMetadata,
          credential_set_id: 'credential-set-b',
        },
      });

      finishRefresh({
        access_token: 'late-generation-a-access',
        refresh_token: 'late-generation-a-refresh',
        token_type: 'Bearer',
        obtained_at: Date.now(),
      });
      await observedStaleRefresh;
      expect(staleRefreshError).toBeInstanceOf(ReauthenticationRequiredError);

      expect(staleCreateToken).not.toHaveBeenCalled();
      expect(staleUpdateToken).not.toHaveBeenCalled();
      const storedRecords = store.getAll().filter((record) => record.userId === 'u1');
      expect(storedRecords).toHaveLength(3);
      expect(storedRecords).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            token: 'enc:generation-b-access',
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-b' }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_refresh',
            token: 'enc:generation-b-refresh',
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-b' }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            token: expect.stringContaining('client-b'),
            metadata: expect.objectContaining({ credential_set_id: 'credential-set-b' }),
          }),
        ]),
      );
      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
        }),
      ).resolves.toMatchObject({
        access_token: 'generation-b-access',
        refresh_token: 'generation-b-refresh',
        credential_set_id: 'credential-set-b',
      });
    });

    it('does not delete a newer generation when a late refresh rejects the old client', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-a-access',
          refresh_token: 'generation-a-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-a', client_secret: 'secret-a' },
        metadata: storedBindingMetadata,
      });

      let markRefreshStarted!: () => void;
      const refreshStarted = new Promise<void>((resolve) => {
        markRefreshStarted = resolve;
      });
      let rejectRefresh!: (error: Error) => void;
      const refreshResponse = new Promise<MCPOAuthTokens>((_resolve, reject) => {
        rejectRefresh = reject;
      });
      const refreshTokens = jest.fn(async () => {
        markRefreshStarted();
        return await refreshResponse;
      });
      const deleteTokens = jest.fn(store.deleteTokens);
      const staleRefresh = MCPTokenStorage.forceRefreshTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        deleteTokens,
        refreshTokens,
      });
      let staleRefreshError: unknown;
      const observedStaleRefresh = staleRefresh.catch((error) => {
        staleRefreshError = error;
      });
      await refreshStarted;

      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'generation-b-access',
          refresh_token: 'generation-b-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          credential_set_id: 'credential-set-b',
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
        clientInfo: { client_id: 'client-b', client_secret: 'secret-b' },
        metadata: {
          ...storedBindingMetadata,
          credential_set_id: 'credential-set-b',
        },
      });

      rejectRefresh(new Error('invalid_client'));
      await observedStaleRefresh;
      expect(staleRefreshError).toBeInstanceOf(ReauthenticationRequiredError);

      expect(deleteTokens).toHaveBeenCalledTimes(2);
      expect(deleteTokens).toHaveBeenCalledWith(
        expect.objectContaining({ metadataCredentialSetId: credentialSetId }),
      );
      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
        }),
      ).resolves.toMatchObject({
        access_token: 'generation-b-access',
        refresh_token: 'generation-b-refresh',
        credential_set_id: 'credential-set-b',
      });
      expect(store.getAll().filter((record) => record.userId === 'u1')).toHaveLength(3);
    });

    it('should refresh and store tokens even when access token is not locally expired', async () => {
      // Access token still has time on the clock (1 hour), but the server has
      // invalidated it (we simulate a mid-session 401 by calling forceRefreshTokens
      // directly). The local `expires_at` must be ignored — the 401 is the signal.
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:stale-access-token',
        expiresIn: 3600,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockResolvedValue({
        access_token: 'new-access-token',
        refresh_token: 'new-rt',
        token_type: 'Bearer',
        expires_in: 3600,
        obtained_at: Date.now(),
      });

      const result = await MCPTokenStorage.forceRefreshTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        updateToken: store.updateToken,
        deleteTokens: store.deleteTokens,
        refreshTokens,
      });

      expect(result).not.toBeNull();
      expect(result!.access_token).toBe('new-access-token');
      expect(result!.credential_set_id).toEqual(expect.any(String));
      expect(result!.credential_set_id).not.toBe(credentialSetId);
      expect(refreshTokens).toHaveBeenCalledWith(
        'rt',
        expect.objectContaining({
          userId: 'u1',
          serverName: 'srv1',
          identifier: 'mcp:srv1',
        }),
        expect.any(AbortSignal),
      );

      // The new access token is persisted, replacing the stale one.
      const saved = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
      });
      expect(saved!.token).toBe('enc:new-access-token');
      expect(store.getAll()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'mcp_oauth',
            metadata: expect.objectContaining({
              credential_set_id: result!.credential_set_id,
            }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_refresh',
            metadata: expect.objectContaining({
              credential_set_id: result!.credential_set_id,
            }),
          }),
          expect.objectContaining({
            type: 'mcp_oauth_client',
            metadata: expect.objectContaining({
              credential_set_id: result!.credential_set_id,
            }),
          }),
        ]),
      );
    });

    it('should return null when no refresh token is stored', async () => {
      // Access token exists locally, but no refresh token. Silent refresh is
      // not possible — the caller must fall back to interactive OAuth.
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: 'mcp:srv1',
        token: 'enc:any',
        expiresIn: 3600,
      });

      const refreshTokens = jest.fn();

      const result = await MCPTokenStorage.forceRefreshTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        refreshTokens,
      });

      expect(result).toBeNull();
      expect(refreshTokens).not.toHaveBeenCalled();
    });

    it('should return null when refresh callback throws non-client-rejection error', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('network blew up'));

      const result = await MCPTokenStorage.forceRefreshTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
        createToken: store.createToken,
        refreshTokens,
      });

      expect(result).toBeNull();
    });

    it('should throw ReauthenticationRequiredError when refresh fails with invalid_client', async () => {
      // Mirrors the contract that getTokens has on stale client registration —
      // forceRefreshTokens cleans up the stale state and signals re-auth.
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:rt',
        expiresIn: 86400,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:srv1:client',
        token: 'enc:{"client_id":"cid"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });

      const refreshTokens = jest.fn().mockRejectedValue(new Error('invalid_client'));

      await expect(
        MCPTokenStorage.forceRefreshTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
          createToken: store.createToken,
          deleteTokens: store.deleteTokens,
          refreshTokens,
        }),
      ).rejects.toThrow(ReauthenticationRequiredError);

      expect(
        await store.findToken({
          userId: 'u1',
          type: 'mcp_oauth_refresh',
          identifier: 'mcp:srv1:refresh',
        }),
      ).toBeNull();
    });
  });

  describe('forceRefreshTokens concurrent coalescing (single-flight)', () => {
    /** Seeds one coherent expired OAuth credential generation for `serverName`. */
    const seedRefreshableTokens = async (serverName = 'srv1', refreshToken = 'rt-1') => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth',
        identifier: `mcp:${serverName}`,
        token: 'enc:expired-access-token',
        expiresIn: -1,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: `mcp:${serverName}:refresh`,
        token: `enc:${refreshToken}`,
        expiresIn: 86400,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: `mcp:${serverName}:client`,
        token: 'enc:{"client_id":"cid","client_secret":"secret"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });
    };

    const rotatedTokens = (generation: number): MCPOAuthTokens => ({
      access_token: `at-${generation}`,
      refresh_token: `rt-${generation}`,
      token_type: 'Bearer',
      expires_in: 3600,
      obtained_at: Date.now(),
    });

    const refreshParams = (refreshTokens: GetTokensRefresh, serverName = 'srv1') => ({
      userId: 'u1',
      serverName,
      findToken: store.findToken,
      createToken: store.createToken,
      updateToken: store.updateToken,
      deleteTokens: store.deleteTokens,
      refreshTokens,
    });

    type GetTokensRefresh = NonNullable<
      Parameters<typeof MCPTokenStorage.forceRefreshTokens>[0]['refreshTokens']
    >;

    /** Flushes the task queue until `predicate` holds (bounded to avoid hangs). */
    const waitFor = async (predicate: () => boolean) => {
      for (let i = 0; i < 50 && !predicate(); i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(predicate()).toBe(true);
    };

    it('coalesces concurrent refresh calls into a single token-endpoint redemption', async () => {
      // Unique server names per test keep single-flight keys isolated, so a
      // failed test can't leave an unsettled in-flight entry that later tests join.
      await seedRefreshableTokens('coalesce-srv');

      let resolveRefresh!: (tokens: MCPOAuthTokens) => void;
      const refreshTokens = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      const params = refreshParams(refreshTokens, 'coalesce-srv');
      const first = MCPTokenStorage.forceRefreshTokens(params);
      const second = MCPTokenStorage.forceRefreshTokens(params);
      const third = MCPTokenStorage.forceRefreshTokens(params);

      await waitFor(() => refreshTokens.mock.calls.length > 0);
      resolveRefresh(rotatedTokens(2));

      const results = await Promise.all([first, second, third]);

      expect(refreshTokens).toHaveBeenCalledTimes(1);
      for (const result of results) {
        expect(result!.access_token).toBe('at-2');
      }

      const storedRefresh = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:coalesce-srv:refresh',
      });
      expect(storedRefresh!.token).toBe('enc:rt-2');
    });

    it('getTokens joins an in-flight refresh instead of replaying the consumed refresh token', async () => {
      // Mirrors issue #14583: a silent refresh (401-triggered) is mid-redemption
      // when an expired-token read fires its own refresh. Without single-flight,
      // the second caller replays rt-1 and RFC 9700 servers revoke the grant family.
      await seedRefreshableTokens('join-srv');

      let resolveRefresh!: (tokens: MCPOAuthTokens) => void;
      const refreshTokens = jest.fn(
        (_refreshToken: string) =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      let refreshReads = 0;
      const findToken = (async (filter: { type?: string }) => {
        if (filter.type === 'mcp_oauth_refresh') {
          refreshReads++;
        }
        return store.findToken(filter as Parameters<InMemoryTokenStore['findToken']>[0]);
      }) as TokenMethods['findToken'];

      const silentRefresh = MCPTokenStorage.forceRefreshTokens({
        ...refreshParams(refreshTokens, 'join-srv'),
        findToken,
      });
      await waitFor(() => refreshTokens.mock.calls.length === 1);

      const expiredRead = MCPTokenStorage.getTokens({
        ...refreshParams(refreshTokens, 'join-srv'),
        findToken,
      });
      /** getTokens probes the refresh token (2nd refresh-identifier read) and then
       *  synchronously joins the in-flight redemption; flush until the probe lands. */
      await waitFor(() => refreshReads >= 2);
      await new Promise((resolve) => setImmediate(resolve));

      resolveRefresh(rotatedTokens(2));
      const [silentResult, readResult] = await Promise.all([silentRefresh, expiredRead]);

      expect(refreshTokens).toHaveBeenCalledTimes(1);
      expect(refreshTokens.mock.calls[0][0]).toBe('rt-1');
      expect(silentResult!.access_token).toBe('at-2');
      expect(readResult!.access_token).toBe('at-2');
    });

    it('redeems the refresh token as stored at redemption time, not the pre-read snapshot', async () => {
      // Simulates a refresh completing between getTokens' probe and the
      // redemption (e.g. another replica rotated rt-1 → rt-2). The redemption
      // must use the freshest stored token, never the probe snapshot.
      await seedRefreshableTokens('snapshot-srv', 'rt-1');

      let probeSeen = false;
      const findToken = (async (filter: { type?: string }) => {
        const result = await store.findToken(
          filter as Parameters<InMemoryTokenStore['findToken']>[0],
        );
        if (filter.type === 'mcp_oauth_refresh' && !probeSeen) {
          probeSeen = true;
          await store.updateToken(
            { userId: 'u1', type: 'mcp_oauth_refresh', identifier: 'mcp:snapshot-srv:refresh' },
            { token: 'enc:rt-2' },
          );
        }
        return result;
      }) as TokenMethods['findToken'];

      const refreshTokens = jest.fn().mockResolvedValue(rotatedTokens(3));

      const result = await MCPTokenStorage.getTokens({
        ...refreshParams(refreshTokens, 'snapshot-srv'),
        findToken,
      });

      expect(refreshTokens).toHaveBeenCalledTimes(1);
      expect(refreshTokens.mock.calls[0][0]).toBe('rt-2');
      expect(result!.access_token).toBe('at-3');
    });

    it('re-reads an access token installed after the missing-token probe', async () => {
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:late-access-srv:refresh',
        token: 'enc:rt-1',
        expiresIn: 86400,
      });
      await createBoundToken(store, {
        userId: 'u1',
        type: 'mcp_oauth_client',
        identifier: 'mcp:late-access-srv:client',
        token: 'enc:{"client_id":"cid","client_secret":"secret"}',
        expiresIn: 86400,
        metadata: storedBindingMetadata,
      });

      let accessProbeSeen = false;
      const findToken = (async (filter: { type?: string }) => {
        if (filter.type !== 'mcp_oauth' || accessProbeSeen) {
          return store.findToken(filter as Parameters<InMemoryTokenStore['findToken']>[0]);
        }

        accessProbeSeen = true;
        const generationB = { credential_set_id: 'credential-set-b' };
        await store.createToken({
          userId: 'u1',
          type: 'mcp_oauth',
          identifier: 'mcp:late-access-srv',
          token: 'enc:interactive-access',
          expiresIn: -1,
          metadata: generationB,
        });
        await store.updateToken(
          {
            userId: 'u1',
            type: 'mcp_oauth_refresh',
            identifier: 'mcp:late-access-srv:refresh',
            metadataCredentialSetId: credentialSetId,
          },
          { token: 'enc:interactive-refresh', metadata: generationB },
        );
        await store.updateToken(
          {
            userId: 'u1',
            type: 'mcp_oauth_client',
            identifier: 'mcp:late-access-srv:client',
            metadataCredentialSetId: credentialSetId,
          },
          {
            token: 'enc:{"client_id":"cid","client_secret":"secret"}',
            metadata: { ...storedBindingMetadata, ...generationB },
          },
        );
        return null;
      }) as TokenMethods['findToken'];
      const createToken = jest.fn(store.createToken);
      const refreshTokens = jest.fn().mockResolvedValue(rotatedTokens(3));

      const result = await MCPTokenStorage.getTokens({
        ...refreshParams(refreshTokens, 'late-access-srv'),
        findToken,
        createToken,
      });

      expect(result).toMatchObject({ access_token: 'at-3' });
      expect(refreshTokens).toHaveBeenCalledWith(
        'interactive-refresh',
        expect.any(Object),
        expect.any(AbortSignal),
      );
      expect(createToken).not.toHaveBeenCalled();
      expect(store.getAll().filter((token) => token.type === 'mcp_oauth')).toHaveLength(1);
    });

    it('does not cache results: a refresh after settlement triggers a fresh redemption', async () => {
      await seedRefreshableTokens('sequential-srv');

      const refreshTokens = jest
        .fn()
        .mockResolvedValueOnce(rotatedTokens(2))
        .mockResolvedValueOnce(rotatedTokens(3));

      const params = refreshParams(refreshTokens, 'sequential-srv');
      const first = await MCPTokenStorage.forceRefreshTokens(params);
      expect(first!.access_token).toBe('at-2');

      const second = await MCPTokenStorage.forceRefreshTokens(params);
      expect(second!.access_token).toBe('at-3');

      expect(refreshTokens).toHaveBeenCalledTimes(2);
      expect(refreshTokens.mock.calls[1][0]).toBe('rt-2');
    });

    it('does not coalesce refreshes for different servers', async () => {
      await seedRefreshableTokens('multi-a');
      await seedRefreshableTokens('multi-b');

      let resolveFirst!: (tokens: MCPOAuthTokens) => void;
      let resolveSecond!: (tokens: MCPOAuthTokens) => void;
      const refreshFirst = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolveFirst = resolve;
          }),
      );
      const refreshSecond = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolveSecond = resolve;
          }),
      );

      const first = MCPTokenStorage.forceRefreshTokens(refreshParams(refreshFirst, 'multi-a'));
      const second = MCPTokenStorage.forceRefreshTokens(refreshParams(refreshSecond, 'multi-b'));

      await waitFor(
        () => refreshFirst.mock.calls.length === 1 && refreshSecond.mock.calls.length === 1,
      );
      resolveFirst(rotatedTokens(2));
      resolveSecond(rotatedTokens(5));

      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult!.access_token).toBe('at-2');
      expect(secondResult!.access_token).toBe('at-5');
    });

    it('does not coalesce refreshes across different OAuth binding scopes', async () => {
      await seedRefreshableTokens('scoped-srv');

      const resolutions: Array<(tokens: MCPOAuthTokens) => void> = [];
      const refreshTokens = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolutions.push(resolve);
          }),
      );
      const params = refreshParams(refreshTokens, 'scoped-srv');
      const first = MCPTokenStorage.forceRefreshTokens({
        ...params,
        singleFlightScope: 'binding-a',
      });
      const second = MCPTokenStorage.forceRefreshTokens({
        ...params,
        singleFlightScope: 'binding-b',
      });

      await waitFor(() => refreshTokens.mock.calls.length === 2);
      resolutions[0](rotatedTokens(2));
      await expect(first).resolves.toMatchObject({ access_token: 'at-2' });
      resolutions[1](rotatedTokens(3));
      await expect(second).rejects.toThrow(ReauthenticationRequiredError);
      expect(refreshTokens).toHaveBeenCalledTimes(2);
    });

    it('propagates refresh failure to all joined callers and releases the single-flight slot', async () => {
      await seedRefreshableTokens('fail-srv');

      let rejectRefresh!: (error: Error) => void;
      const refreshTokens = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((_, reject) => {
            rejectRefresh = reject;
          }),
      );

      const params = refreshParams(refreshTokens, 'fail-srv');
      const first = MCPTokenStorage.forceRefreshTokens(params);
      const second = MCPTokenStorage.forceRefreshTokens(params);

      await waitFor(() => refreshTokens.mock.calls.length === 1);
      rejectRefresh(new Error('network blew up'));

      await expect(first).resolves.toBeNull();
      await expect(second).resolves.toBeNull();

      refreshTokens.mockResolvedValueOnce(rotatedTokens(2));
      const third = await MCPTokenStorage.forceRefreshTokens(params);
      expect(third!.access_token).toBe('at-2');
      expect(refreshTokens).toHaveBeenCalledTimes(2);
    });

    it('aborts a stalled redemption and frees the slot only after it settles', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      try {
        await seedRefreshableTokens('stall-srv');

        const refreshTokens = jest
          .fn()
          .mockImplementationOnce(
            (_refreshToken: string, _metadata: unknown, signal: AbortSignal) =>
              new Promise<MCPOAuthTokens>((_, reject) => {
                signal.addEventListener('abort', () => reject(new Error('aborted')), {
                  once: true,
                });
              }),
          )
          .mockResolvedValueOnce(rotatedTokens(2));

        const params = refreshParams(refreshTokens, 'stall-srv');
        const stalled = MCPTokenStorage.forceRefreshTokens(params);
        await waitFor(() => refreshTokens.mock.calls.length === 1);

        jest.advanceTimersByTime(MCPTokenStorage.INFLIGHT_REFRESH_STALE_MS + 1);
        /** The stale abort settles the stalled execution, which frees the slot. */
        await expect(stalled).resolves.toBeNull();

        const fresh = await MCPTokenStorage.forceRefreshTokens(params);
        expect(fresh!.access_token).toBe('at-2');
        expect(refreshTokens).toHaveBeenCalledTimes(2);
      } finally {
        jest.useRealTimers();
      }
    });

    it('never reaches the token endpoint when a stalled execution wakes after abort', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] });
      try {
        await seedRefreshableTokens('wake-srv');

        let releaseRead!: () => void;
        const readGate = new Promise<void>((resolve) => {
          releaseRead = resolve;
        });
        let refreshReadStarted = false;
        const findToken = (async (filter: { type?: string }) => {
          if (filter.type === 'mcp_oauth_refresh') {
            refreshReadStarted = true;
            await readGate;
          }
          return store.findToken(filter as Parameters<InMemoryTokenStore['findToken']>[0]);
        }) as TokenMethods['findToken'];

        const refreshTokens = jest.fn();
        const stalled = MCPTokenStorage.forceRefreshTokens({
          ...refreshParams(refreshTokens, 'wake-srv'),
          findToken,
        });
        await waitFor(() => refreshReadStarted);

        jest.advanceTimersByTime(MCPTokenStorage.INFLIGHT_REFRESH_STALE_MS + 1);
        releaseRead();

        await expect(stalled).resolves.toBeNull();
        expect(refreshTokens).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });

    it('runs onRefreshSuccess on the shared redemption even after the initiating waiter aborted', async () => {
      await seedRefreshableTokens('hook-srv');

      let resolveRefresh!: (tokens: MCPOAuthTokens) => void;
      const refreshTokens = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
      const onRefreshSuccess = jest.fn().mockResolvedValue(undefined);

      const controller = new AbortController();
      const initiator = MCPTokenStorage.forceRefreshTokens({
        ...refreshParams(refreshTokens, 'hook-srv'),
        signal: controller.signal,
        onRefreshSuccess,
      });
      await waitFor(() => refreshTokens.mock.calls.length === 1);

      controller.abort();
      await expect(initiator).resolves.toBeNull();
      expect(onRefreshSuccess).not.toHaveBeenCalled();

      resolveRefresh(rotatedTokens(2));
      await waitFor(() => onRefreshSuccess.mock.calls.length === 1);
      expect(onRefreshSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          access_token: 'at-2',
          credential_set_id: expect.any(String),
        }),
      );
      const callbackTokens = onRefreshSuccess.mock.calls[0][0];
      const storedAccess = store
        .getAll()
        .find((token) => token.type === 'mcp_oauth' && token.identifier === 'mcp:hook-srv');
      const storedCredentialSetId =
        storedAccess!.metadata instanceof Map
          ? storedAccess!.metadata.get('credential_set_id')
          : storedAccess!.metadata?.credential_set_id;
      expect(callbackTokens.credential_set_id).toBe(storedCredentialSetId);
      expect(callbackTokens.credential_set_id).not.toBe(credentialSetId);
    });

    it("an initiator's abort resolves only its own wait, not the shared redemption", async () => {
      await seedRefreshableTokens('abort-srv');

      let resolveRefresh!: (tokens: MCPOAuthTokens) => void;
      const refreshTokens = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      const params = refreshParams(refreshTokens, 'abort-srv');
      const controller = new AbortController();
      const initiator = MCPTokenStorage.forceRefreshTokens({
        ...params,
        signal: controller.signal,
      });
      await waitFor(() => refreshTokens.mock.calls.length === 1);
      const joiner = MCPTokenStorage.forceRefreshTokens(params);

      controller.abort();
      await expect(initiator).resolves.toBeNull();

      resolveRefresh(rotatedTokens(2));
      const joined = await joiner;
      expect(joined!.access_token).toBe('at-2');
      expect(refreshTokens).toHaveBeenCalledTimes(1);
    });

    it("a joiner's abort resolves only its own wait, not the shared redemption", async () => {
      await seedRefreshableTokens('joiner-abort-srv');

      let resolveRefresh!: (tokens: MCPOAuthTokens) => void;
      const refreshTokens = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((resolve) => {
            resolveRefresh = resolve;
          }),
      );

      const params = refreshParams(refreshTokens, 'joiner-abort-srv');
      const initiator = MCPTokenStorage.forceRefreshTokens(params);
      await waitFor(() => refreshTokens.mock.calls.length === 1);

      const controller = new AbortController();
      const joiner = MCPTokenStorage.forceRefreshTokens({
        ...params,
        signal: controller.signal,
      });

      controller.abort();
      await expect(joiner).resolves.toBeNull();

      resolveRefresh(rotatedTokens(2));
      const initiated = await initiator;
      expect(initiated!.access_token).toBe('at-2');
      expect(refreshTokens).toHaveBeenCalledTimes(1);
    });

    it('propagates ReauthenticationRequiredError to concurrent callers', async () => {
      await seedRefreshableTokens('reauth-srv');

      let rejectRefresh!: (error: Error) => void;
      const refreshTokens = jest.fn(
        () =>
          new Promise<MCPOAuthTokens>((_, reject) => {
            rejectRefresh = reject;
          }),
      );

      const params = {
        ...refreshParams(refreshTokens, 'reauth-srv'),
        deleteTokens: store.deleteTokens,
      };
      const first = MCPTokenStorage.forceRefreshTokens(params);
      const second = MCPTokenStorage.forceRefreshTokens(params);

      await waitFor(() => refreshTokens.mock.calls.length === 1);
      rejectRefresh(new Error('invalid_client'));

      await expect(first).rejects.toThrow(ReauthenticationRequiredError);
      await expect(second).rejects.toThrow(ReauthenticationRequiredError);
    });
  });

  describe('storeTokens + getTokens round-trip', () => {
    it('should store and retrieve tokens with full encrypt/decrypt cycle', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'my-access-token',
          token_type: 'Bearer',
          expires_in: 3600,
          refresh_token: 'my-refresh-token',
        },
        createToken: store.createToken,
        clientInfo: { client_id: 'cid', client_secret: 'sec' },
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });

      expect(result!.access_token).toBe('my-access-token');
      expect(result!.refresh_token).toBe('my-refresh-token');
      expect(result!.token_type).toBe('Bearer');
      expect(result!.obtained_at).toBeDefined();
      expect(result!.expires_at).toBeDefined();
      expect(result!.credential_set_id).toEqual(expect.any(String));
    });

    it('keeps a new access token usable while omitting a stale refresh generation', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'old-access',
          refresh_token: 'old-refresh',
          token_type: 'Bearer',
          expires_in: 3600,
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        clientInfo: { client_id: 'old-client', client_secret: 'old-secret' },
        metadata: storedBindingMetadata,
      });

      const { credential_set_id: _oldCredentialSetId, ...newBindingMetadata } =
        storedBindingMetadata;
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: { access_token: 'new-access', token_type: 'Bearer', expires_in: 3600 },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
        clientInfo: { client_id: 'new-client', client_secret: 'new-secret' },
        metadata: newBindingMetadata,
      });

      const result = await MCPTokenStorage.getTokens({
        userId: 'u1',
        serverName: 'srv1',
        findToken: store.findToken,
      });
      const refreshRecord = await store.findToken({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
      });

      expect(result).toMatchObject({ access_token: 'new-access' });
      expect(result!.refresh_token).toBeUndefined();
      expect(result!.credential_set_id).not.toBe(credentialSetId);
      expect(refreshRecord?.metadata).toMatchObject({ credential_set_id: credentialSetId });
    });

    it('removes the stale refresh generation after an interactive callback commits', async () => {
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'old-access',
          refresh_token: 'old-refresh',
          token_type: 'Bearer',
          credential_set_id: credentialSetId,
        },
        createToken: store.createToken,
        clientInfo: { client_id: 'old-client', client_secret: 'old-secret' },
        metadata: storedBindingMetadata,
      });
      await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'intermediate-access',
          token_type: 'Bearer',
          credential_set_id: 'credential-set-b',
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        findToken: store.findToken,
        clientInfo: { client_id: 'intermediate-client', client_secret: 'intermediate-secret' },
        metadata: storedBindingMetadata,
      });
      const deleteTokens = jest.fn(store.deleteTokens);

      const result = await MCPTokenStorage.storeTokens({
        userId: 'u1',
        serverName: 'srv1',
        tokens: {
          access_token: 'new-access',
          token_type: 'Bearer',
          credential_set_id: 'credential-set-c',
        },
        createToken: store.createToken,
        updateToken: store.updateToken,
        deleteTokens,
        findToken: store.findToken,
        clientInfo: { client_id: 'new-client', client_secret: 'new-secret' },
        metadata: storedBindingMetadata,
      });

      expect(deleteTokens).toHaveBeenCalledWith({
        userId: 'u1',
        type: 'mcp_oauth_refresh',
        identifier: 'mcp:srv1:refresh',
        token: 'enc:old-refresh',
        metadataCredentialSetId: credentialSetId,
      });
      await expect(
        store.findToken({
          userId: 'u1',
          type: 'mcp_oauth_refresh',
          identifier: 'mcp:srv1:refresh',
        }),
      ).resolves.toBeNull();
      await expect(
        MCPTokenStorage.getTokens({
          userId: 'u1',
          serverName: 'srv1',
          findToken: store.findToken,
        }),
      ).resolves.toMatchObject({
        access_token: 'new-access',
        credential_set_id: result.credential_set_id,
      });
    });
  });
});

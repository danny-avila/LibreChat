import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { createVertexMediaCredentialProvider } from './vertexAuth';

describe('Vertex service-account credentials', () => {
  let directory: string;
  let keyFile: string;
  const account = {
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'media@test-project.iam.gserviceaccount.com',
    private_key_id: 'key-1',
    private_key: 'fixture-private-key',
  };
  let time: number;
  let tokenNumber: number;
  const boundary: Pick<Parameters<typeof createVertexMediaCredentialProvider>[0], 'createAuth'> = {
    createAuth: () => {
      let token = '';
      const client = {
        credentials: { expiry_date: 0 },
        eagerRefreshThresholdMillis: 300_000,
        async getAccessToken() {
          if (client.credentials.expiry_date <= time + client.eagerRefreshThresholdMillis) {
            token = `access-${++tokenNumber}`;
            client.credentials.expiry_date = time + 3_600_000;
          }
          return { token };
        },
      };
      return { getClient: async () => client };
    },
  };

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'librechat-vertex-auth-'));
    keyFile = path.join(directory, 'auth.json');
    await writeFile(keyFile, JSON.stringify(account));
    time = 1_000;
    tokenNumber = 0;
  });
  afterEach(async () => {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.match(path.basename(directory), /^librechat-vertex-auth-/);
    await rm(directory, { recursive: true, force: true });
  });
  const create = (maxCacheEntries?: number) =>
    createVertexMediaCredentialProvider({
      readFile,
      createAuth: boundary.createAuth,
      now: () => time,
      maxCacheEntries,
    });
  const input = () => ({ keyFile, minValidityMs: 60_000, timeoutMs: 10_000 });

  it('refreshes a token without changing the saved credential revision', async () => {
    const factory = jest.spyOn(boundary, 'createAuth');
    const resolve = create();
    const first = await resolve(input());
    const cached = await resolve(input());
    expect(cached).toEqual(first);
    time += 3_400_000;
    const refreshed = await resolve(input());
    expect(refreshed.accessToken).not.toBe(first.accessToken);
    expect(refreshed.revision).toBe(first.revision);
    expect(refreshed.projectId).toBe('test-project');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('invalidates cached authentication when the account key rotates', async () => {
    const factory = jest.spyOn(boundary, 'createAuth');
    const resolve = create();
    const first = await resolve(input());
    await writeFile(
      keyFile,
      JSON.stringify({ ...account, private_key: 'rotated-key', private_key_id: 'key-2' }),
    );
    const second = await resolve(input());
    expect(second.revision).not.toBe(first.revision);
    expect(second.accessToken).not.toBe(first.accessToken);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('uses the configured project while preserving the account identity', async () => {
    const factory = jest.spyOn(boundary, 'createAuth');
    const resolve = create();
    const first = await resolve(input());
    const other = await resolve({ ...input(), projectId: 'other-project' });
    expect(other.projectId).toBe('other-project');
    expect(other.revision).toBe(first.revision);
    expect(factory).toHaveBeenLastCalledWith(
      expect.objectContaining({ projectId: 'other-project', timeoutMs: 10_000 }),
    );
  });

  it('bounds its credential cache using the configured catalog capacity', async () => {
    const factory = jest.spyOn(boundary, 'createAuth');
    const resolve = create(1);
    await resolve(input());
    await resolve({ ...input(), projectId: 'other-project' });
    await resolve(input());
    expect(factory).toHaveBeenCalledTimes(3);
  });

  it('requires enough token validity for dispatch', async () => {
    await expect(create()({ ...input(), minValidityMs: 3_600_001 })).rejects.toMatchObject({
      code: 'credentials_expired',
    });
  });

  it.each(['not json', '{}', JSON.stringify({ ...account, type: 'authorized_user' })])(
    'rejects invalid or unsupported credential files without exposing their contents',
    async (contents) => {
      await writeFile(keyFile, contents);
      await expect(create()(input())).rejects.toMatchObject({
        code: 'credentials_required',
        message: 'Vertex authentication failed.',
      });
    },
  );

  it('does not fall back to a cached token after the file becomes unavailable', async () => {
    const resolve = create();
    await resolve(input());
    await rm(keyFile);
    await expect(resolve(input())).rejects.toMatchObject({ code: 'credentials_required' });
  });

  it('redacts SDK failures and retries a failed client initialization', async () => {
    const factory = jest.spyOn(boundary, 'createAuth');
    factory.mockImplementationOnce(() => ({
      getClient: async () => {
        throw new Error(account.private_key);
      },
    }));
    const resolve = create();
    await expect(resolve(input())).rejects.toMatchObject({
      message: 'Vertex authentication failed.',
    });
    await expect(resolve(input())).resolves.toMatchObject({ projectId: 'test-project' });
  });
});

import type { TFile } from 'librechat-data-provider';
import type { ServerRequest } from '~/types';

const mockAxios = jest.fn();
const mockGetCodeApiAuthHeaders = jest.fn();

jest.mock('~/utils', () => ({
  ...jest.requireActual('~/utils'),
  createAxiosInstance: () => mockAxios,
  logAxiosError: jest.fn(),
}));

jest.mock('~/auth/codeapi', () => ({
  ...jest.requireActual('~/auth/codeapi'),
  getCodeApiAuthHeaders: (...args: unknown[]) => mockGetCodeApiAuthHeaders(...args),
}));

jest.mock('@librechat/agents', () => ({
  getCodeBaseURL: () => 'http://code.test/v1',
}));

import { createProvisionService } from './service';

const req = { user: { id: 'u1' } } as unknown as ServerRequest;

const makeFile = (overrides: Partial<TFile> = {}): TFile =>
  ({
    file_id: 'f1',
    filename: 'data.csv',
    filepath: '/x/data.csv',
    type: 'text/csv',
    source: 'local',
    metadata: {},
    ...overrides,
  }) as TFile;

const buildService = (overrides: Record<string, unknown> = {}) => {
  const uploadCodeEnvFile = jest
    .fn()
    .mockResolvedValue({ storage_session_id: 's1', file_id: 'remote-1' });
  const getDownloadStream = jest.fn().mockResolvedValue({ pipe: jest.fn(), on: jest.fn() });
  const service = createProvisionService({
    getStrategyFunctions: ((source: string) =>
      source === 'execute_code'
        ? { handleFileUpload: uploadCodeEnvFile }
        : { getDownloadStream }) as never,
    uploadVectors: jest.fn().mockResolvedValue({ embedded: true }),
    loadAuthValues: jest.fn().mockResolvedValue({ LIBRECHAT_CODE_API_KEY: 'secret-key' }),
    ...overrides,
  } as never);
  return { service, uploadCodeEnvFile, getDownloadStream };
};

describe('createProvisionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCodeApiAuthHeaders.mockResolvedValue({});
  });

  describe('loadCodeApiKey', () => {
    it('reads the code key field without throwing when it is absent', async () => {
      const loadAuthValues = jest.fn().mockResolvedValue({});
      const { service } = buildService({ loadAuthValues });

      await expect(service.loadCodeApiKey('u1')).resolves.toBeUndefined();
      expect(loadAuthValues).toHaveBeenCalledWith({
        userId: 'u1',
        authFields: ['LIBRECHAT_CODE_API_KEY'],
        throwError: false,
      });
    });
  });

  describe('provisionToCodeEnv', () => {
    it('renames a converted image to match its stored MIME type', async () => {
      const { service, uploadCodeEnvFile } = buildService();

      const result = await service.provisionToCodeEnv({
        req,
        file: makeFile({ filename: 'photo.jpg', type: 'image/webp' }),
      });

      expect(uploadCodeEnvFile).toHaveBeenCalledWith(
        expect.objectContaining({ filename: 'photo.webp' }),
      );
      expect(result.referenceSet.codeEnvRefs?.default?.file_id).toBe('remote-1');
    });

    it('refuses a source whose download contract differs', async () => {
      const { service, uploadCodeEnvFile } = buildService();

      await expect(
        service.provisionToCodeEnv({ req, file: makeFile({ source: 'openai' as never }) }),
      ).rejects.toThrow(/does not support download streams/);
      expect(uploadCodeEnvFile).not.toHaveBeenCalled();
    });

    it('uploads to the agent resolved route and records its key', async () => {
      const { service, uploadCodeEnvFile } = buildService();

      const result = await service.provisionToCodeEnv({
        req,
        file: makeFile(),
        route: {
          baseUrl: 'http://stateful.test/v1',
          executionProfile: 'stateful',
          executionRouteKey: 'stateful:abc',
        },
      });

      expect(uploadCodeEnvFile).toHaveBeenCalledWith(
        expect.objectContaining({
          codeApiBaseUrl: 'http://stateful.test/v1',
          executionProfile: 'stateful',
        }),
      );
      expect(result.referenceSet.codeEnvRefs?.['stateful:abc']?.executionProfile).toBe('stateful');
    });

    it('defaults to the default deployment when no route is resolved', async () => {
      const { service, uploadCodeEnvFile } = buildService();

      const result = await service.provisionToCodeEnv({ req, file: makeFile() });

      expect(uploadCodeEnvFile).toHaveBeenCalledWith(
        expect.objectContaining({ executionProfile: 'default' }),
      );
      expect(uploadCodeEnvFile.mock.calls[0][0].codeApiBaseUrl).toBeUndefined();
      expect(result.referenceSet.codeEnvRefs?.default?.file_id).toBe('remote-1');
    });

    it('fails search provisioning when the vector service is not configured', async () => {
      const previous = process.env.RAG_API_URL;
      delete process.env.RAG_API_URL;
      const { service } = buildService();

      await expect(service.provisionToVectorDB({ req, file: makeFile() })).rejects.toThrow(
        /RAG_API_URL is not defined/,
      );

      if (previous != null) {
        process.env.RAG_API_URL = previous;
      }
    });

    it('preserves pointers for other code routes', async () => {
      const { service } = buildService();
      const statefulRef = {
        kind: 'user',
        id: 'u1',
        storage_session_id: 's-stateful',
        file_id: 'r-stateful',
        executionProfile: 'stateful',
        executionRouteKey: 'stateful:abc',
      };

      const result = await service.provisionToCodeEnv({
        req,
        file: makeFile({ metadata: { codeEnvRefs: { 'stateful:abc': statefulRef } } as never }),
      });

      expect(result.referenceSet.codeEnvRefs?.['stateful:abc']).toEqual(statefulRef);
      expect(result.referenceSet.codeEnvRefs?.default?.file_id).toBe('remote-1');
    });
  });

  describe('checkSessionsAlive', () => {
    const staleFile = (id: string) =>
      makeFile({
        file_id: id,
        metadata: {
          codeEnvRef: {
            kind: 'user',
            id: 'u1',
            storage_session_id: 'sess-1',
            file_id: `remote-${id}`,
            provisionedAt: 1,
          },
        } as never,
      });

    it('authenticates with bearer headers when no legacy key is set', async () => {
      mockGetCodeApiAuthHeaders.mockResolvedValue({ Authorization: 'Bearer jwt' });
      mockAxios.mockResolvedValue({ data: [{ fileId: 'remote-f1' }] });
      const { service } = buildService();

      const alive = await service.checkSessionsAlive({ files: [staleFile('f1')], req });

      const headers = mockAxios.mock.calls[0][0].headers;
      expect(headers.Authorization).toBe('Bearer jwt');
      expect(headers['X-API-Key']).toBeUndefined();
      expect(alive.has('f1')).toBe(true);
    });

    it('sends the legacy key alongside minted headers', async () => {
      mockAxios.mockResolvedValue({ data: [] });
      const { service } = buildService();

      await service.checkSessionsAlive({ files: [staleFile('f2')], apiKey: 'legacy-key' });

      expect(mockAxios.mock.calls[0][0].headers['X-API-Key']).toBe('legacy-key');
    });

    it('preserves references when the probe itself fails', async () => {
      mockAxios.mockRejectedValue(new Error('ETIMEDOUT'));
      const { service } = buildService();

      const alive = await service.checkSessionsAlive({ files: [staleFile('f3')], apiKey: 'k' });

      expect(alive.has('f3')).toBe(true);
    });

    it('preserves references when auth headers cannot be built', async () => {
      mockGetCodeApiAuthHeaders.mockRejectedValue(new Error('no tenant context'));
      const { service } = buildService();

      const alive = await service.checkSessionsAlive({ files: [staleFile('f4')], req });

      expect(alive.has('f4')).toBe(true);
      expect(mockAxios).not.toHaveBeenCalled();
    });

    it('expires references when the Code API reports the session is gone', async () => {
      const notFound = Object.assign(new Error('Request failed with status code 404'), {
        response: { status: 404 },
      });
      mockAxios.mockRejectedValue(notFound);
      const { service } = buildService();

      const alive = await service.checkSessionsAlive({ files: [staleFile('f6')], apiKey: 'k' });

      expect(alive.has('f6')).toBe(false);
    });

    it('expires a reference the probe reports as absent', async () => {
      mockAxios.mockResolvedValue({ data: [{ fileId: 'someone-else' }] });
      const { service } = buildService();

      const alive = await service.checkSessionsAlive({ files: [staleFile('f5')], apiKey: 'k' });

      expect(alive.has('f5')).toBe(false);
    });
  });
});

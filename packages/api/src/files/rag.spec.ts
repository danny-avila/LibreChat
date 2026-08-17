jest.mock('@librechat/data-schemas', () => ({
  logger: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('~/crypto/jwt', () => ({
  RagScopes: { embed: 'rag:embed', rerank: 'rag:rerank', documents: 'rag:documents' },
  generateShortLivedToken: jest.fn().mockReturnValue('mock-jwt-token'),
}));

jest.mock('axios', () => ({
  delete: jest.fn(),
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
}));

import axios from 'axios';
import { deleteRagFile } from './rag';
import { logger } from '@librechat/data-schemas';
import { generateShortLivedToken } from '~/crypto/jwt';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedLogger = logger as jest.Mocked<typeof logger>;
const mockedGenerateShortLivedToken = generateShortLivedToken as jest.MockedFunction<
  typeof generateShortLivedToken
>;

describe('deleteRagFile', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.RAG_API_URL = 'http://localhost:8000';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('when file is embedded and RAG_API_URL is configured', () => {
    it('should delete the document from RAG API successfully', async () => {
      const file = { file_id: 'file-123', embedded: true };
      mockedAxios.delete.mockResolvedValueOnce({ status: 200 });

      await expect(deleteRagFile({ userId: 'user123', file })).resolves.toBeUndefined();

      expect(mockedGenerateShortLivedToken).toHaveBeenCalledWith({
        userId: 'user123',
        tenantId: undefined,
        entityIds: [],
        scopes: ['rag:documents'],
      });
      expect(mockedAxios.delete).toHaveBeenCalledWith('http://localhost:8000/documents', {
        headers: {
          Authorization: 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        params: undefined,
        data: ['file-123'],
      });
      expect(mockedLogger.debug).toHaveBeenCalledWith(
        '[deleteRagFile] Successfully deleted document file-123 from RAG API',
      );
    });

    it('scopes the delete to the agent when the file belongs to a knowledge base', async () => {
      const file = { file_id: 'file-123', embedded: true, entity_id: 'agent_abc' };
      mockedAxios.delete.mockResolvedValueOnce({ status: 200 });

      await expect(
        deleteRagFile({ userId: 'user123', file, tenantId: 'tenant-1' }),
      ).resolves.toBeUndefined();

      expect(mockedGenerateShortLivedToken).toHaveBeenCalledWith({
        userId: 'user123',
        tenantId: 'tenant-1',
        entityIds: ['agent_abc'],
        scopes: ['rag:documents'],
      });
      expect(mockedAxios.delete).toHaveBeenCalledWith(
        'http://localhost:8000/documents',
        expect.objectContaining({ params: { entity_id: 'agent_abc' }, data: ['file-123'] }),
      );
    });

    it('throws without calling the RAG API when the token cannot be minted', async () => {
      const file = { file_id: 'file-123', embedded: true };
      mockedGenerateShortLivedToken.mockImplementationOnce(() => {
        throw new Error('RAG_AUTH_ACCEPT_LEGACY=false requires RAG_JWT_SECRET');
      });

      await expect(deleteRagFile({ userId: 'user123', file })).rejects.toThrow(
        /Unable to mint a RAG API token/,
      );

      expect(mockedAxios.delete).not.toHaveBeenCalled();
      expect(mockedLogger.error).toHaveBeenCalledWith(
        '[deleteRagFile] Unable to mint a RAG API token:',
        'RAG_AUTH_ACCEPT_LEGACY=false requires RAG_JWT_SECRET',
      );
    });

    it('treats a 404 as already deleted and resolves', async () => {
      const file = { file_id: 'file-not-found', embedded: true };
      const error = new Error('Not Found') as Error & { response?: { status?: number } };
      error.response = { status: 404 };
      mockedAxios.delete.mockRejectedValueOnce(error);

      await expect(deleteRagFile({ userId: 'user123', file })).resolves.toBeUndefined();

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        '[deleteRagFile] Document file-not-found not found in RAG API, may have been deleted already',
      );
    });

    it('throws so the caller keeps the metadata when the RAG API rejects the delete', async () => {
      const file = { file_id: 'file-error', embedded: true };
      const error = new Error('Server Error') as Error & { response?: { status?: number } };
      error.response = { status: 500 };
      mockedAxios.delete.mockRejectedValueOnce(error);

      await expect(deleteRagFile({ userId: 'user123', file })).rejects.toThrow(/Server Error/);

      expect(mockedLogger.error).toHaveBeenCalledWith(
        '[deleteRagFile] Error deleting document from RAG API:',
        'Server Error',
      );
    });

    it('throws when the RAG API is unreachable and no response ever arrives', async () => {
      const file = { file_id: 'file-error', embedded: true };
      mockedAxios.delete.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      await expect(deleteRagFile({ userId: 'user123', file })).rejects.toThrow(
        /connect ECONNREFUSED/,
      );
    });
  });

  describe('when file is not embedded', () => {
    it('should skip RAG deletion', async () => {
      const file = { file_id: 'file-123', embedded: false };

      await expect(deleteRagFile({ userId: 'user123', file })).resolves.toBeUndefined();

      expect(mockedAxios.delete).not.toHaveBeenCalled();
      expect(mockedGenerateShortLivedToken).not.toHaveBeenCalled();
    });

    it('should skip RAG deletion when embedded is undefined', async () => {
      const file = { file_id: 'file-123' };

      await expect(deleteRagFile({ userId: 'user123', file })).resolves.toBeUndefined();

      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });
  });

  describe('when RAG_API_URL is not configured', () => {
    it('should skip RAG deletion', async () => {
      delete process.env.RAG_API_URL;
      const file = { file_id: 'file-123', embedded: true };

      await expect(deleteRagFile({ userId: 'user123', file })).resolves.toBeUndefined();

      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });
  });

  describe('userId handling', () => {
    it('throws when no userId is provided', async () => {
      const file = { file_id: 'file-123', embedded: true };

      await expect(deleteRagFile({ userId: '', file })).rejects.toThrow(/No user ID provided/);

      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });

    it('throws when userId is undefined', async () => {
      const file = { file_id: 'file-123', embedded: true };

      await expect(deleteRagFile({ userId: undefined as unknown as string, file })).rejects.toThrow(
        /No user ID provided/,
      );
    });
  });
});

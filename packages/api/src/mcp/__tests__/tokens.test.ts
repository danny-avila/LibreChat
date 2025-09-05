import { MCPTokenStorage } from '~/mcp/oauth/tokens';
import { decryptV2 } from '~/crypto';
import type { TokenMethods, IToken } from '@librechat/data-schemas';
import { Types } from 'mongoose';

jest.mock('~/crypto', () => ({
  decryptV2: jest.fn(),
}));

const mockDecryptV2 = decryptV2 as jest.MockedFunction<typeof decryptV2>;

describe('MCPTokenStorage', () => {
  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('getClientInfoAndMetadata', () => {
    const userId = '000000001111111122222222';
    const serverName = 'test-server';
    const identifier = `mcp:${serverName}`;
    let mockFindToken: jest.MockedFunction<TokenMethods['findToken']>;

    beforeEach(() => {
      jest.clearAllMocks();
      mockFindToken = jest.fn();
    });

    it('should return null when no client info token exists', async () => {
      mockFindToken.mockResolvedValue(null);

      const result = await MCPTokenStorage.getClientInfoAndMetadata({
        userId,
        serverName,
        findToken: mockFindToken,
      });

      expect(result).toBeNull();
      expect(mockFindToken).toHaveBeenCalledWith({
        userId,
        type: 'mcp_oauth_client',
        identifier: `${identifier}:client`,
      });
    });

    it('should return client info and metadata when token exists', async () => {
      const clientInfo = {
        client_id: 'test-client-id',
        client_secret: 'test-secret',
      };

      const metadata = new Map([
        ['serverUrl', 'https://test.example.com'],
        ['state', 'test-state'],
      ]);

      const mockToken: IToken = {
        userId: new Types.ObjectId(userId),
        type: 'mcp_oauth_client',
        identifier: `${identifier}:client`,
        token: 'encrypted-token',
        metadata,
      } as IToken;

      mockFindToken.mockResolvedValue(mockToken);
      mockDecryptV2.mockResolvedValue(JSON.stringify(clientInfo));

      const result = await MCPTokenStorage.getClientInfoAndMetadata({
        userId,
        serverName,
        findToken: mockFindToken,
      });

      expect(result).not.toBeNull();
      expect(result?.clientInfo).toEqual(clientInfo);
      expect(result?.clientMetadata).toEqual({
        serverUrl: 'https://test.example.com',
        state: 'test-state',
      });
      expect(mockDecryptV2).toHaveBeenCalledWith('encrypted-token');
    });

    it('should handle empty metadata', async () => {
      const clientInfo = {
        client_id: 'test-client-id',
      };

      const mockToken: IToken = {
        userId: new Types.ObjectId(userId),
        type: 'mcp_oauth_client',
        identifier: `${identifier}:client`,
        token: 'encrypted-token',
      } as IToken;

      mockFindToken.mockResolvedValue(mockToken);
      mockDecryptV2.mockResolvedValue(JSON.stringify(clientInfo));

      const result = await MCPTokenStorage.getClientInfoAndMetadata({
        userId,
        serverName,
        findToken: mockFindToken,
      });

      expect(result).not.toBeNull();
      expect(result?.clientInfo).toEqual(clientInfo);
      expect(result?.clientMetadata).toEqual({});
    });

    it('should handle metadata as plain object', async () => {
      const clientInfo = {
        client_id: 'test-client-id',
      };

      const metadata = {
        serverUrl: 'https://test.example.com',
        state: 'test-state',
      };

      const mockToken: IToken = {
        userId: new Types.ObjectId(userId),
        type: 'mcp_oauth_client',
        identifier: `${identifier}:client`,
        token: 'encrypted-token',
        metadata: metadata as unknown, // runtime check
      } as IToken;

      mockFindToken.mockResolvedValue(mockToken);
      mockDecryptV2.mockResolvedValue(JSON.stringify(clientInfo));

      const result = await MCPTokenStorage.getClientInfoAndMetadata({
        userId,
        serverName,
        findToken: mockFindToken,
      });

      expect(result).not.toBeNull();
      expect(result?.clientInfo).toEqual(clientInfo);
      expect(result?.clientMetadata).toEqual(metadata);
    });
  });
});

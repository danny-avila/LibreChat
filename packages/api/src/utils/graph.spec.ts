import type { TUser } from 'librechat-data-provider';
import type { GraphTokenResolver, GraphTokenOptions } from './graph';
import {
  containsGraphTokenPlaceholder,
  recordContainsGraphTokenPlaceholder,
  mcpOptionsContainGraphTokenPlaceholder,
  resolveGraphTokenPlaceholder,
  resolveGraphTokensInRecord,
  preProcessGraphTokens,
} from './graph';

// Mock the logger
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the oidc module
jest.mock('./oidc', () => ({
  GRAPH_TOKEN_PLACEHOLDER: '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
  DEFAULT_GRAPH_SCOPES: 'https://graph.microsoft.com/.default',
  extractOpenIDTokenInfo: jest.fn(),
  isOpenIDTokenValid: jest.fn(),
}));

import { extractOpenIDTokenInfo, isOpenIDTokenValid } from './oidc';

const mockExtractOpenIDTokenInfo = extractOpenIDTokenInfo as jest.Mock;
const mockIsOpenIDTokenValid = isOpenIDTokenValid as jest.Mock;

describe('Graph Token Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('containsGraphTokenPlaceholder', () => {
    it('should return true when string contains the placeholder', () => {
      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      expect(containsGraphTokenPlaceholder(value)).toBe(true);
    });

    it('should return false when string does not contain the placeholder', () => {
      const value = 'Bearer some-static-token';
      expect(containsGraphTokenPlaceholder(value)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(containsGraphTokenPlaceholder('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(containsGraphTokenPlaceholder(123 as unknown as string)).toBe(false);
      expect(containsGraphTokenPlaceholder(null as unknown as string)).toBe(false);
      expect(containsGraphTokenPlaceholder(undefined as unknown as string)).toBe(false);
    });

    it('should detect placeholder in the middle of a string', () => {
      const value = 'prefix-{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}-suffix';
      expect(containsGraphTokenPlaceholder(value)).toBe(true);
    });
  });

  describe('recordContainsGraphTokenPlaceholder', () => {
    it('should return true when any value contains the placeholder', () => {
      const record = {
        Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        'Content-Type': 'application/json',
      };
      expect(recordContainsGraphTokenPlaceholder(record)).toBe(true);
    });

    it('should return false when no value contains the placeholder', () => {
      const record = {
        Authorization: 'Bearer static-token',
        'Content-Type': 'application/json',
      };
      expect(recordContainsGraphTokenPlaceholder(record)).toBe(false);
    });

    it('should return false for undefined record', () => {
      expect(recordContainsGraphTokenPlaceholder(undefined)).toBe(false);
    });

    it('should return false for null record', () => {
      expect(recordContainsGraphTokenPlaceholder(null as unknown as Record<string, string>)).toBe(
        false,
      );
    });

    it('should return false for empty record', () => {
      expect(recordContainsGraphTokenPlaceholder({})).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(recordContainsGraphTokenPlaceholder('string' as unknown as Record<string, string>)).toBe(
        false,
      );
    });
  });

  describe('mcpOptionsContainGraphTokenPlaceholder', () => {
    it('should return true when url contains the placeholder', () => {
      const options = {
        url: 'https://api.example.com?token={{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
      };
      expect(mcpOptionsContainGraphTokenPlaceholder(options)).toBe(true);
    });

    it('should return true when headers contain the placeholder', () => {
      const options = {
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      };
      expect(mcpOptionsContainGraphTokenPlaceholder(options)).toBe(true);
    });

    it('should return true when env contains the placeholder', () => {
      const options = {
        env: {
          GRAPH_TOKEN: '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      };
      expect(mcpOptionsContainGraphTokenPlaceholder(options)).toBe(true);
    });

    it('should return false when no field contains the placeholder', () => {
      const options = {
        url: 'https://api.example.com',
        headers: { Authorization: 'Bearer static-token' },
        env: { API_KEY: 'some-key' },
      };
      expect(mcpOptionsContainGraphTokenPlaceholder(options)).toBe(false);
    });

    it('should return false for empty options', () => {
      expect(mcpOptionsContainGraphTokenPlaceholder({})).toBe(false);
    });
  });

  describe('resolveGraphTokenPlaceholder', () => {
    const mockUser: Partial<TUser> = {
      id: 'user-123',
      provider: 'openid',
      openidId: 'oidc-sub-456',
    };

    const mockGraphTokenResolver: GraphTokenResolver = jest.fn().mockResolvedValue({
      access_token: 'resolved-graph-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://graph.microsoft.com/.default',
    });

    it('should return original value when no placeholder is present', async () => {
      const value = 'Bearer static-token';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: mockGraphTokenResolver,
      });
      expect(result).toBe('Bearer static-token');
    });

    it('should return original value when user is not provided', async () => {
      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        graphTokenResolver: mockGraphTokenResolver,
      });
      expect(result).toBe(value);
    });

    it('should return original value when graphTokenResolver is not provided', async () => {
      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
      });
      expect(result).toBe(value);
    });

    it('should return original value when token info is invalid', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue(null);

      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: mockGraphTokenResolver,
      });
      expect(result).toBe(value);
    });

    it('should return original value when token is not valid', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(false);

      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: mockGraphTokenResolver,
      });
      expect(result).toBe(value);
    });

    it('should return original value when access token is missing', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ userId: 'user-123' });
      mockIsOpenIDTokenValid.mockReturnValue(true);

      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: mockGraphTokenResolver,
      });
      expect(result).toBe(value);
    });

    it('should resolve placeholder with graph token', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(true);

      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: mockGraphTokenResolver,
      });
      expect(result).toBe('Bearer resolved-graph-token');
    });

    it('should resolve multiple placeholders in a string', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(true);

      const value =
        'Primary: {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}, Secondary: {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: mockGraphTokenResolver,
      });
      expect(result).toBe('Primary: resolved-graph-token, Secondary: resolved-graph-token');
    });

    it('should return original value when graph token exchange fails', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(true);
      const failingResolver: GraphTokenResolver = jest.fn().mockRejectedValue(new Error('Exchange failed'));

      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: failingResolver,
      });
      expect(result).toBe(value);
    });

    it('should return original value when graph token response has no access_token', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(true);
      const emptyResolver: GraphTokenResolver = jest.fn().mockResolvedValue({});

      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      const result = await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: emptyResolver,
      });
      expect(result).toBe(value);
    });

    it('should use provided scopes', async () => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(true);

      const value = 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}';
      await resolveGraphTokenPlaceholder(value, {
        user: mockUser as TUser,
        graphTokenResolver: mockGraphTokenResolver,
        scopes: 'custom-scope',
      });

      expect(mockGraphTokenResolver).toHaveBeenCalledWith(
        mockUser,
        'access-token',
        'custom-scope',
        true,
      );
    });
  });

  describe('resolveGraphTokensInRecord', () => {
    const mockUser: Partial<TUser> = {
      id: 'user-123',
      provider: 'openid',
    };

    const mockGraphTokenResolver: GraphTokenResolver = jest.fn().mockResolvedValue({
      access_token: 'resolved-graph-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://graph.microsoft.com/.default',
    });

    const options: GraphTokenOptions = {
      user: mockUser as TUser,
      graphTokenResolver: mockGraphTokenResolver,
    };

    beforeEach(() => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(true);
    });

    it('should return undefined for undefined record', async () => {
      const result = await resolveGraphTokensInRecord(undefined, options);
      expect(result).toBeUndefined();
    });

    it('should return record unchanged when no placeholders present', async () => {
      const record = {
        Authorization: 'Bearer static-token',
        'Content-Type': 'application/json',
      };
      const result = await resolveGraphTokensInRecord(record, options);
      expect(result).toEqual(record);
    });

    it('should resolve placeholders in record values', async () => {
      const record = {
        Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        'Content-Type': 'application/json',
      };
      const result = await resolveGraphTokensInRecord(record, options);
      expect(result).toEqual({
        Authorization: 'Bearer resolved-graph-token',
        'Content-Type': 'application/json',
      });
    });

    it('should handle non-string values gracefully', async () => {
      const record = {
        Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        numericValue: 123 as unknown as string,
      };
      const result = await resolveGraphTokensInRecord(record, options);
      expect(result).toEqual({
        Authorization: 'Bearer resolved-graph-token',
        numericValue: 123,
      });
    });
  });

  describe('preProcessGraphTokens', () => {
    const mockUser: Partial<TUser> = {
      id: 'user-123',
      provider: 'openid',
    };

    const mockGraphTokenResolver: GraphTokenResolver = jest.fn().mockResolvedValue({
      access_token: 'resolved-graph-token',
      token_type: 'Bearer',
      expires_in: 3600,
      scope: 'https://graph.microsoft.com/.default',
    });

    const graphOptions: GraphTokenOptions = {
      user: mockUser as TUser,
      graphTokenResolver: mockGraphTokenResolver,
    };

    beforeEach(() => {
      mockExtractOpenIDTokenInfo.mockReturnValue({ accessToken: 'access-token' });
      mockIsOpenIDTokenValid.mockReturnValue(true);
    });

    it('should return options unchanged when no placeholders present', async () => {
      const options = {
        url: 'https://api.example.com',
        headers: { Authorization: 'Bearer static-token' },
        env: { API_KEY: 'some-key' },
      };
      const result = await preProcessGraphTokens(options, graphOptions);
      expect(result).toEqual(options);
    });

    it('should resolve placeholder in url', async () => {
      const options = {
        url: 'https://api.example.com?token={{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
      };
      const result = await preProcessGraphTokens(options, graphOptions);
      expect(result.url).toBe('https://api.example.com?token=resolved-graph-token');
    });

    it('should resolve placeholder in headers', async () => {
      const options = {
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
          'Content-Type': 'application/json',
        },
      };
      const result = await preProcessGraphTokens(options, graphOptions);
      expect(result.headers).toEqual({
        Authorization: 'Bearer resolved-graph-token',
        'Content-Type': 'application/json',
      });
    });

    it('should resolve placeholder in env', async () => {
      const options = {
        env: {
          GRAPH_TOKEN: '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
          OTHER_VAR: 'static-value',
        },
      };
      const result = await preProcessGraphTokens(options, graphOptions);
      expect(result.env).toEqual({
        GRAPH_TOKEN: 'resolved-graph-token',
        OTHER_VAR: 'static-value',
      });
    });

    it('should resolve placeholders in all fields simultaneously', async () => {
      const options = {
        url: 'https://api.example.com?token={{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
        env: {
          GRAPH_TOKEN: '{{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      };
      const result = await preProcessGraphTokens(options, graphOptions);
      expect(result.url).toBe('https://api.example.com?token=resolved-graph-token');
      expect(result.headers).toEqual({
        Authorization: 'Bearer resolved-graph-token',
      });
      expect(result.env).toEqual({
        GRAPH_TOKEN: 'resolved-graph-token',
      });
    });

    it('should not mutate the original options object', async () => {
      const options = {
        url: 'https://api.example.com?token={{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        headers: {
          Authorization: 'Bearer {{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        },
      };
      const originalUrl = options.url;
      const originalAuth = options.headers.Authorization;

      await preProcessGraphTokens(options, graphOptions);

      expect(options.url).toBe(originalUrl);
      expect(options.headers.Authorization).toBe(originalAuth);
    });

    it('should preserve additional properties in generic type', async () => {
      const options = {
        url: 'https://api.example.com?token={{LIBRECHAT_GRAPH_ACCESS_TOKEN}}',
        customProperty: 'custom-value',
        anotherProperty: 42,
      };
      const result = await preProcessGraphTokens(options, graphOptions);
      expect(result.customProperty).toBe('custom-value');
      expect(result.anotherProperty).toBe(42);
      expect(result.url).toBe('https://api.example.com?token=resolved-graph-token');
    });
  });
});

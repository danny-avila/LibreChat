import { indexedArrayPathError } from './indexedArrayPath';

describe('indexedArrayPathError', () => {
  describe('array-typed paths', () => {
    it('rejects a bare array index (endpoints.custom.0)', () => {
      expect(indexedArrayPathError('endpoints.custom.0')).toMatch(/indexed array/i);
    });

    it('rejects a deep array index (endpoints.custom.0.baseURL)', () => {
      expect(indexedArrayPathError('endpoints.custom.0.baseURL')).toMatch(/indexed array/i);
    });

    it('rejects a simple string-array index (registration.socialLogins.0)', () => {
      expect(indexedArrayPathError('registration.socialLogins.0')).toMatch(/indexed array/i);
    });
  });

  describe('ZodRecord paths with numeric keys', () => {
    it('allows a numeric MCP server name (mcpServers.123.type)', () => {
      expect(indexedArrayPathError('mcpServers.123.type')).toBeNull();
    });

    it('allows a numeric key in an MCP server headers record (mcpServers.my-server.headers.2024)', () => {
      expect(indexedArrayPathError('mcpServers.my-server.headers.2024')).toBeNull();
    });

    it('allows a numeric key in an MCP server env record (mcpServers.my-tool.env.8080)', () => {
      expect(indexedArrayPathError('mcpServers.my-tool.env.8080')).toBeNull();
    });
  });

  describe('non-array paths', () => {
    it('allows a plain top-level field (cache)', () => {
      expect(indexedArrayPathError('cache')).toBeNull();
    });

    it('allows a nested non-array path (registration.allowedDomains)', () => {
      expect(indexedArrayPathError('registration.allowedDomains')).toBeNull();
    });

    it('allows an unknown path (unknownField.sub)', () => {
      expect(indexedArrayPathError('unknownField.sub')).toBeNull();
    });

    it('allows a whole-array write without index (endpoints.custom)', () => {
      expect(indexedArrayPathError('endpoints.custom')).toBeNull();
    });
  });
});

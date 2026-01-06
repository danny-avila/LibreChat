/* eslint-disable @typescript-eslint/ban-ts-comment */
import {
  extractMCPServerDomain,
  isActionDomainAllowed,
  isEmailDomainAllowed,
  isMCPDomainAllowed,
  isSSRFTarget,
} from './domain';

describe('isEmailDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return true if email is falsy and no domain restrictions exist', async () => {
    const email = '';
    const result = isEmailDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return true if domain is not present in the email and no domain restrictions exist', async () => {
    const email = 'test';
    const result = isEmailDomainAllowed(email);
    expect(result).toBe(true);
  });

  it('should return false if email is falsy and domain restrictions exist', async () => {
    const email = '';
    const result = isEmailDomainAllowed(email, ['domain1.com']);
    expect(result).toBe(false);
  });

  it('should return false if domain is not present in the email and domain restrictions exist', async () => {
    const email = 'test';
    const result = isEmailDomainAllowed(email, ['domain1.com']);
    expect(result).toBe(false);
  });

  it('should return true if customConfig is not available', async () => {
    const email = 'test@domain1.com';
    const result = isEmailDomainAllowed(email, null);
    expect(result).toBe(true);
  });

  it('should return true if allowedDomains is not defined in customConfig', async () => {
    const email = 'test@domain1.com';
    const result = isEmailDomainAllowed(email, undefined);
    expect(result).toBe(true);
  });

  it('should return true if domain is included in the allowedDomains', async () => {
    const email = 'user@domain1.com';
    const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
    expect(result).toBe(true);
  });

  it('should return false if domain is not included in the allowedDomains', async () => {
    const email = 'user@domain3.com';
    const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
    expect(result).toBe(false);
  });

  describe('case-insensitive domain matching', () => {
    it('should match domains case-insensitively when email has uppercase domain', () => {
      const email = 'user@DOMAIN1.COM';
      const result = isEmailDomainAllowed(email, ['domain1.com', 'domain2.com']);
      expect(result).toBe(true);
    });

    it('should match domains case-insensitively when allowedDomains has uppercase', () => {
      const email = 'user@domain1.com';
      const result = isEmailDomainAllowed(email, ['DOMAIN1.COM', 'DOMAIN2.COM']);
      expect(result).toBe(true);
    });

    it('should match domains with mixed case in email', () => {
      const email = 'user@Example.Com';
      const result = isEmailDomainAllowed(email, ['example.com', 'domain2.com']);
      expect(result).toBe(true);
    });

    it('should match domains with mixed case in allowedDomains', () => {
      const email = 'user@example.com';
      const result = isEmailDomainAllowed(email, ['Example.Com', 'Domain2.Com']);
      expect(result).toBe(true);
    });

    it('should match when both email and allowedDomains have different mixed cases', () => {
      const email = 'user@ExAmPlE.cOm';
      const result = isEmailDomainAllowed(email, ['eXaMpLe.CoM', 'domain2.com']);
      expect(result).toBe(true);
    });

    it('should still return false for non-matching domains regardless of case', () => {
      const email = 'user@DOMAIN3.COM';
      const result = isEmailDomainAllowed(email, ['domain1.com', 'DOMAIN2.COM']);
      expect(result).toBe(false);
    });

    it('should handle null/undefined entries in allowedDomains gracefully', () => {
      const email = 'user@domain1.com';
      // @ts-expect-error Testing invalid input
      const result = isEmailDomainAllowed(email, [null, 'DOMAIN1.COM', undefined]);
      expect(result).toBe(true);
    });
  });
});

describe('isSSRFTarget', () => {
  describe('localhost blocking', () => {
    it('should block localhost', () => {
      expect(isSSRFTarget('localhost')).toBe(true);
      expect(isSSRFTarget('LOCALHOST')).toBe(true);
      expect(isSSRFTarget('localhost.localdomain')).toBe(true);
      expect(isSSRFTarget('sub.localhost')).toBe(true);
    });
  });

  describe('IPv4 private ranges', () => {
    it('should block 127.0.0.0/8 (loopback)', () => {
      expect(isSSRFTarget('127.0.0.1')).toBe(true);
      expect(isSSRFTarget('127.255.255.255')).toBe(true);
    });

    it('should block 10.0.0.0/8 (private)', () => {
      expect(isSSRFTarget('10.0.0.1')).toBe(true);
      expect(isSSRFTarget('10.255.255.255')).toBe(true);
    });

    it('should block 172.16.0.0/12 (private)', () => {
      expect(isSSRFTarget('172.16.0.1')).toBe(true);
      expect(isSSRFTarget('172.31.255.255')).toBe(true);
      expect(isSSRFTarget('172.15.0.1')).toBe(false); // Outside range
      expect(isSSRFTarget('172.32.0.1')).toBe(false); // Outside range
    });

    it('should block 192.168.0.0/16 (private)', () => {
      expect(isSSRFTarget('192.168.0.1')).toBe(true);
      expect(isSSRFTarget('192.168.255.255')).toBe(true);
    });

    it('should block 169.254.0.0/16 (link-local/cloud metadata)', () => {
      expect(isSSRFTarget('169.254.169.254')).toBe(true); // AWS metadata
      expect(isSSRFTarget('169.254.0.1')).toBe(true);
    });

    it('should block 0.0.0.0', () => {
      expect(isSSRFTarget('0.0.0.0')).toBe(true);
    });

    it('should allow public IPs', () => {
      expect(isSSRFTarget('8.8.8.8')).toBe(false);
      expect(isSSRFTarget('1.1.1.1')).toBe(false);
      expect(isSSRFTarget('203.0.113.1')).toBe(false);
    });
  });

  describe('IPv6 blocking', () => {
    it('should block IPv6 loopback', () => {
      expect(isSSRFTarget('::1')).toBe(true);
      expect(isSSRFTarget('::')).toBe(true);
      expect(isSSRFTarget('[::1]')).toBe(true);
    });

    it('should block IPv6 private ranges', () => {
      expect(isSSRFTarget('fc00::1')).toBe(true);
      expect(isSSRFTarget('fd00::1')).toBe(true);
      expect(isSSRFTarget('fe80::1')).toBe(true);
    });
  });

  describe('internal hostnames', () => {
    it('should block common internal service names', () => {
      expect(isSSRFTarget('rag_api')).toBe(true);
      expect(isSSRFTarget('rag-api')).toBe(true);
      expect(isSSRFTarget('redis')).toBe(true);
      expect(isSSRFTarget('mongodb')).toBe(true);
      expect(isSSRFTarget('postgres')).toBe(true);
      expect(isSSRFTarget('elasticsearch')).toBe(true);
    });

    it('should block .internal and .local TLDs', () => {
      expect(isSSRFTarget('api.internal')).toBe(true);
      expect(isSSRFTarget('service.local')).toBe(true);
    });

    it('should allow legitimate domains', () => {
      expect(isSSRFTarget('api.example.com')).toBe(false);
      expect(isSSRFTarget('swagger.io')).toBe(false);
      expect(isSSRFTarget('openai.com')).toBe(false);
    });
  });
});

describe('isActionDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // SSRF Protection Tests
  describe('SSRF protection', () => {
    it('should block SSRF targets when no allowedDomains configured', async () => {
      // These should be blocked when no explicit allowlist
      expect(await isActionDomainAllowed('localhost', null)).toBe(false);
      expect(await isActionDomainAllowed('127.0.0.1', null)).toBe(false);
      expect(await isActionDomainAllowed('10.0.0.1', null)).toBe(false);
      expect(await isActionDomainAllowed('192.168.1.1', null)).toBe(false);
      expect(await isActionDomainAllowed('169.254.169.254', null)).toBe(false);
      expect(await isActionDomainAllowed('rag_api', null)).toBe(false);
      expect(await isActionDomainAllowed('http://rag_api:8000', null)).toBe(false);
    });

    it('should allow public domains with no restrictions', async () => {
      expect(await isActionDomainAllowed('api.example.com', null)).toBe(true);
      expect(await isActionDomainAllowed('https://openai.com', null)).toBe(true);
    });

    it('should allow SSRF targets when explicitly in allowedDomains (admin override)', async () => {
      // Admins can explicitly allow internal targets if needed
      const allowedDomains = ['localhost', '127.0.0.1', 'rag_api'];
      expect(await isActionDomainAllowed('localhost', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('127.0.0.1', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('rag_api', allowedDomains)).toBe(true);
    });

    it('should still block SSRF targets not in allowedDomains even when list is configured', async () => {
      // Only explicitly allowed domains should work
      const allowedDomains = ['example.com'];
      expect(await isActionDomainAllowed('localhost', allowedDomains)).toBe(false);
      expect(await isActionDomainAllowed('127.0.0.1', allowedDomains)).toBe(false);
    });
  });

  // Basic Input Validation Tests
  describe('input validation', () => {
    it('should return false for falsy values', async () => {
      expect(await isActionDomainAllowed()).toBe(false);
      expect(await isActionDomainAllowed(null)).toBe(false);
      expect(await isActionDomainAllowed('')).toBe(false);
      expect(await isActionDomainAllowed(undefined)).toBe(false);
    });

    it('should return false for non-string inputs', async () => {
      /** @ts-expect-error */
      expect(await isActionDomainAllowed(123)).toBe(false);
      /** @ts-expect-error */
      expect(await isActionDomainAllowed({})).toBe(false);
      /** @ts-expect-error */
      expect(await isActionDomainAllowed([])).toBe(false);
    });

    it('should return false for invalid domain formats', async () => {
      expect(await isActionDomainAllowed('http://', ['http://', 'https://'])).toBe(false);
      expect(await isActionDomainAllowed('https://', ['http://', 'https://'])).toBe(false);
    });
  });

  // Configuration Tests
  describe('configuration handling', () => {
    it('should return true if customConfig is null', async () => {
      expect(await isActionDomainAllowed('example.com', null)).toBe(true);
    });

    it('should return true if actions.allowedDomains is not defined', async () => {
      expect(await isActionDomainAllowed('example.com', undefined)).toBe(true);
    });

    it('should return true if allowedDomains is empty array', async () => {
      expect(await isActionDomainAllowed('example.com', [])).toBe(true);
    });
  });

  // Domain Matching Tests
  describe('domain matching', () => {
    const allowedDomains = [
      'example.com',
      '*.subdomain.com',
      'specific.domain.com',
      'www.withprefix.com',
      'swapi.dev',
    ];

    it('should match exact domains', async () => {
      expect(await isActionDomainAllowed('example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('other.com', allowedDomains)).toBe(false);
      expect(await isActionDomainAllowed('swapi.dev', allowedDomains)).toBe(true);
    });

    it('should handle domains with www prefix', async () => {
      expect(await isActionDomainAllowed('www.example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('www.withprefix.com', allowedDomains)).toBe(true);
    });

    it('should handle full URLs', async () => {
      expect(await isActionDomainAllowed('https://example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('http://example.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('https://example.com/path', allowedDomains)).toBe(true);
    });

    it('should handle wildcard subdomains', async () => {
      expect(await isActionDomainAllowed('test.subdomain.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('any.subdomain.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('subdomain.com', allowedDomains)).toBe(true);
    });

    it('should handle specific subdomains', async () => {
      expect(await isActionDomainAllowed('specific.domain.com', allowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('other.domain.com', allowedDomains)).toBe(false);
    });
  });

  // Edge Cases
  describe('edge cases', () => {
    const edgeAllowedDomains = ['example.com', '*.test.com'];

    it('should handle domains with query parameters', async () => {
      expect(await isActionDomainAllowed('example.com?param=value', edgeAllowedDomains)).toBe(true);
    });

    it('should handle domains with ports', async () => {
      expect(await isActionDomainAllowed('example.com:8080', edgeAllowedDomains)).toBe(true);
    });

    it('should handle domains with trailing slashes', async () => {
      expect(await isActionDomainAllowed('example.com/', edgeAllowedDomains)).toBe(true);
    });

    it('should handle case insensitivity', async () => {
      expect(await isActionDomainAllowed('EXAMPLE.COM', edgeAllowedDomains)).toBe(true);
      expect(await isActionDomainAllowed('Example.Com', edgeAllowedDomains)).toBe(true);
    });

    it('should handle invalid entries in allowedDomains', async () => {
      const invalidAllowedDomains = ['example.com', null, undefined, '', 'test.com'];
      /** @ts-expect-error */
      expect(await isActionDomainAllowed('example.com', invalidAllowedDomains)).toBe(true);
      /** @ts-expect-error */
      expect(await isActionDomainAllowed('test.com', invalidAllowedDomains)).toBe(true);
    });
  });

  // Protocol and Port Restrictions (Recommendation #2)
  describe('protocol and port restrictions', () => {
    describe('OpenAPI Actions reject WebSocket protocols', () => {
      it('should reject ws:// URLs (not part of OpenAPI spec)', async () => {
        expect(await isActionDomainAllowed('ws://example.com', ['example.com'])).toBe(false);
        expect(await isActionDomainAllowed('ws://example.com', null)).toBe(false);
      });

      it('should reject wss:// URLs (not part of OpenAPI spec)', async () => {
        expect(await isActionDomainAllowed('wss://example.com', ['example.com'])).toBe(false);
        expect(await isActionDomainAllowed('wss://example.com', null)).toBe(false);
      });

      it('should reject WebSocket URLs even if explicitly in allowedDomains', async () => {
        expect(await isActionDomainAllowed('wss://ws.example.com', ['wss://ws.example.com'])).toBe(
          false,
        );
        expect(await isActionDomainAllowed('ws://ws.example.com', ['ws://ws.example.com'])).toBe(
          false,
        );
      });

      it('should allow only HTTP/HTTPS for OpenAPI Actions', async () => {
        expect(await isActionDomainAllowed('http://example.com', ['example.com'])).toBe(true);
        expect(await isActionDomainAllowed('https://example.com', ['example.com'])).toBe(true);
      });
    });

    describe('protocol-only restrictions', () => {
      const httpsOnlyDomains = ['https://api.example.com', 'https://secure.test.com'];

      it('should allow HTTPS when HTTPS is required', async () => {
        expect(await isActionDomainAllowed('https://api.example.com', httpsOnlyDomains)).toBe(true);
        expect(await isActionDomainAllowed('https://secure.test.com', httpsOnlyDomains)).toBe(true);
      });

      it('should deny HTTP when HTTPS is required', async () => {
        expect(await isActionDomainAllowed('http://api.example.com', httpsOnlyDomains)).toBe(false);
        expect(await isActionDomainAllowed('http://secure.test.com', httpsOnlyDomains)).toBe(false);
      });

      it('should deny domain without protocol when protocol is required', async () => {
        // When allowedDomains specifies protocol, input should also have protocol
        expect(await isActionDomainAllowed('api.example.com', httpsOnlyDomains)).toBe(false);
      });
    });

    describe('port restrictions', () => {
      const portRestrictedDomains = ['https://api.example.com:443', 'http://internal:8080'];

      it('should allow matching port', async () => {
        expect(
          await isActionDomainAllowed('https://api.example.com:443', portRestrictedDomains),
        ).toBe(true);
        expect(await isActionDomainAllowed('http://internal:8080', portRestrictedDomains)).toBe(
          true,
        );
      });

      it('should deny different port', async () => {
        expect(
          await isActionDomainAllowed('https://api.example.com:8443', portRestrictedDomains),
        ).toBe(false);
        expect(await isActionDomainAllowed('http://internal:9000', portRestrictedDomains)).toBe(
          false,
        );
      });

      it('should deny when no port specified but port required', async () => {
        expect(await isActionDomainAllowed('https://api.example.com', portRestrictedDomains)).toBe(
          false,
        );
      });
    });

    describe('mixed restrictions', () => {
      const mixedDomains = [
        'example.com', // Any protocol, any port
        'https://secure.example.com', // HTTPS only, default port
        'https://api.example.com:8443', // HTTPS only, specific port
        'http://localhost:3000', // HTTP only, specific port (admin override for internal)
      ];

      it('should allow any protocol/port for unrestricted domain', async () => {
        expect(await isActionDomainAllowed('http://example.com', mixedDomains)).toBe(true);
        expect(await isActionDomainAllowed('https://example.com', mixedDomains)).toBe(true);
        expect(await isActionDomainAllowed('https://example.com:8080', mixedDomains)).toBe(true);
        expect(await isActionDomainAllowed('example.com', mixedDomains)).toBe(true);
      });

      it('should enforce protocol for protocol-restricted domain', async () => {
        expect(await isActionDomainAllowed('https://secure.example.com', mixedDomains)).toBe(true);
        expect(await isActionDomainAllowed('http://secure.example.com', mixedDomains)).toBe(false);
      });

      it('should enforce both protocol and port when both specified', async () => {
        expect(await isActionDomainAllowed('https://api.example.com:8443', mixedDomains)).toBe(
          true,
        );
        expect(await isActionDomainAllowed('http://api.example.com:8443', mixedDomains)).toBe(
          false,
        );
        expect(await isActionDomainAllowed('https://api.example.com:443', mixedDomains)).toBe(
          false,
        );
        expect(await isActionDomainAllowed('https://api.example.com', mixedDomains)).toBe(false);
      });

      it('should allow internal targets with explicit protocol/port (admin override)', async () => {
        expect(await isActionDomainAllowed('http://localhost:3000', mixedDomains)).toBe(true);
        // Different port should fail
        expect(await isActionDomainAllowed('http://localhost:8080', mixedDomains)).toBe(false);
        // Different protocol should fail
        expect(await isActionDomainAllowed('https://localhost:3000', mixedDomains)).toBe(false);
      });
    });
  });
});

describe('extractMCPServerDomain', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('URL extraction (returns full origin for protocol/port matching)', () => {
    it('should extract full origin from HTTPS URL', () => {
      const config = { url: 'https://api.example.com/sse' };
      expect(extractMCPServerDomain(config)).toBe('https://api.example.com');
    });

    it('should extract full origin from HTTP URL', () => {
      const config = { url: 'http://api.example.com/sse' };
      expect(extractMCPServerDomain(config)).toBe('http://api.example.com');
    });

    it('should extract full origin from WebSocket URL', () => {
      const config = { url: 'wss://ws.example.com' };
      expect(extractMCPServerDomain(config)).toBe('wss://ws.example.com');
    });

    it('should include port in origin when specified', () => {
      const config = { url: 'https://localhost:3001/sse' };
      expect(extractMCPServerDomain(config)).toBe('https://localhost:3001');
    });

    it('should include port for non-default ports', () => {
      const config = { url: 'http://host.docker.internal:8044/mcp' };
      expect(extractMCPServerDomain(config)).toBe('http://host.docker.internal:8044');
    });

    it('should preserve www prefix in origin (matching handles www normalization)', () => {
      const config = { url: 'https://www.example.com/api' };
      expect(extractMCPServerDomain(config)).toBe('https://www.example.com');
    });

    it('should strip path and query parameters', () => {
      const config = { url: 'https://api.example.com/v1/sse?token=abc' };
      expect(extractMCPServerDomain(config)).toBe('https://api.example.com');
    });
  });

  describe('stdio transports (no URL)', () => {
    it('should return null for stdio transport with command only', () => {
      const config = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] };
      expect(extractMCPServerDomain(config)).toBeNull();
    });

    it('should return null when url is undefined', () => {
      const config = { command: 'node', args: ['server.js'] };
      expect(extractMCPServerDomain(config)).toBeNull();
    });

    it('should return null for empty object', () => {
      const config = {};
      expect(extractMCPServerDomain(config)).toBeNull();
    });
  });

  describe('invalid URLs', () => {
    it('should return null for invalid URL format', () => {
      const config = { url: 'not-a-valid-url' };
      expect(extractMCPServerDomain(config)).toBeNull();
    });

    it('should return null for empty URL string', () => {
      const config = { url: '' };
      expect(extractMCPServerDomain(config)).toBeNull();
    });

    it('should return null for non-string url', () => {
      const config = { url: 12345 };
      expect(extractMCPServerDomain(config)).toBeNull();
    });

    it('should return null for null url', () => {
      const config = { url: null };
      expect(extractMCPServerDomain(config)).toBeNull();
    });
  });
});

describe('isMCPDomainAllowed', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('stdio transports (always allowed)', () => {
    it('should allow stdio transport regardless of allowlist', async () => {
      const config = { command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'] };
      expect(await isMCPDomainAllowed(config, ['example.com'])).toBe(true);
    });

    it('should allow stdio transport even with empty allowlist', async () => {
      const config = { command: 'node', args: ['server.js'] };
      expect(await isMCPDomainAllowed(config, [])).toBe(true);
    });

    it('should allow stdio transport when no URL present', async () => {
      const config = {};
      expect(await isMCPDomainAllowed(config, ['restricted.com'])).toBe(true);
    });
  });

  describe('permissive defaults (no restrictions)', () => {
    it('should allow all domains when allowedDomains is null', async () => {
      const config = { url: 'https://any-domain.com/sse' };
      expect(await isMCPDomainAllowed(config, null)).toBe(true);
    });

    it('should allow all domains when allowedDomains is undefined', async () => {
      const config = { url: 'https://any-domain.com/sse' };
      expect(await isMCPDomainAllowed(config, undefined)).toBe(true);
    });

    it('should allow all domains when allowedDomains is empty array', async () => {
      const config = { url: 'https://any-domain.com/sse' };
      expect(await isMCPDomainAllowed(config, [])).toBe(true);
    });
  });

  describe('exact domain matching', () => {
    const allowedDomains = ['example.com', 'localhost', 'trusted-mcp.com'];

    it('should allow exact domain match', async () => {
      const config = { url: 'https://example.com/api' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(true);
    });

    it('should allow localhost when explicitly in allowedDomains (admin override)', async () => {
      // Admins can explicitly allow localhost for local MCP servers
      const config = { url: 'http://localhost:3001/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(true);
    });

    it('should reject non-allowed domain', async () => {
      const config = { url: 'https://malicious.com/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(false);
    });

    it('should reject subdomain when only parent is allowed', async () => {
      const config = { url: 'https://api.example.com/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(false);
    });
  });

  describe('wildcard domain matching', () => {
    const allowedDomains = ['*.example.com', 'localhost'];

    it('should allow subdomain with wildcard', async () => {
      const config = { url: 'https://api.example.com/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(true);
    });

    it('should allow any subdomain with wildcard', async () => {
      const config = { url: 'https://staging.example.com/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(true);
    });

    it('should allow base domain with wildcard', async () => {
      const config = { url: 'https://example.com/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(true);
    });

    it('should allow nested subdomain with wildcard', async () => {
      const config = { url: 'https://deep.nested.example.com/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(true);
    });

    it('should reject different domain even with wildcard', async () => {
      const config = { url: 'https://api.other.com/sse' };
      expect(await isMCPDomainAllowed(config, allowedDomains)).toBe(false);
    });
  });

  describe('case insensitivity', () => {
    it('should match domains case-insensitively', async () => {
      const config = { url: 'https://EXAMPLE.COM/sse' };
      expect(await isMCPDomainAllowed(config, ['example.com'])).toBe(true);
    });

    it('should match with uppercase in allowlist', async () => {
      const config = { url: 'https://example.com/sse' };
      expect(await isMCPDomainAllowed(config, ['EXAMPLE.COM'])).toBe(true);
    });

    it('should match with mixed case', async () => {
      const config = { url: 'https://Api.Example.Com/sse' };
      expect(await isMCPDomainAllowed(config, ['*.example.com'])).toBe(true);
    });
  });

  describe('www prefix handling', () => {
    it('should strip www prefix from URL before matching', async () => {
      const config = { url: 'https://www.example.com/sse' };
      expect(await isMCPDomainAllowed(config, ['example.com'])).toBe(true);
    });

    it('should match www in allowlist to non-www URL', async () => {
      const config = { url: 'https://example.com/sse' };
      expect(await isMCPDomainAllowed(config, ['www.example.com'])).toBe(true);
    });
  });

  describe('invalid URL handling', () => {
    it('should allow config with invalid URL (treated as stdio)', async () => {
      const config = { url: 'not-a-valid-url' };
      expect(await isMCPDomainAllowed(config, ['example.com'])).toBe(true);
    });
  });

  describe('Docker/internal hostname handling (SSRF protection)', () => {
    it('should block host.docker.internal without allowedDomains (ends with .internal)', async () => {
      const config = { url: 'http://host.docker.internal:8044/mcp' };
      expect(await isMCPDomainAllowed(config, null)).toBe(false);
      expect(await isMCPDomainAllowed(config, undefined)).toBe(false);
      expect(await isMCPDomainAllowed(config, [])).toBe(false);
    });

    it('should allow host.docker.internal when explicitly in allowedDomains', async () => {
      const config = { url: 'http://host.docker.internal:8044/mcp' };
      expect(await isMCPDomainAllowed(config, ['host.docker.internal'])).toBe(true);
    });

    it('should allow host.docker.internal with protocol/port restriction', async () => {
      const config = { url: 'http://host.docker.internal:8044/mcp' };
      expect(await isMCPDomainAllowed(config, ['http://host.docker.internal:8044'])).toBe(true);
    });

    it('should reject host.docker.internal with wrong protocol restriction', async () => {
      const config = { url: 'http://host.docker.internal:8044/mcp' };
      expect(await isMCPDomainAllowed(config, ['https://host.docker.internal:8044'])).toBe(false);
    });

    it('should reject host.docker.internal with wrong port restriction', async () => {
      const config = { url: 'http://host.docker.internal:8044/mcp' };
      expect(await isMCPDomainAllowed(config, ['http://host.docker.internal:9000'])).toBe(false);
    });

    it('should block .local TLD without allowedDomains', async () => {
      const config = { url: 'http://myserver.local/mcp' };
      expect(await isMCPDomainAllowed(config, null)).toBe(false);
    });

    it('should allow .local TLD when explicitly in allowedDomains', async () => {
      const config = { url: 'http://myserver.local/mcp' };
      expect(await isMCPDomainAllowed(config, ['myserver.local'])).toBe(true);
    });
  });

  describe('protocol/port matching with full origin extraction', () => {
    it('should match unrestricted allowedDomain against full origin', async () => {
      // When allowedDomain has no protocol/port, it should match any protocol/port
      const config = { url: 'https://api.example.com:8443/sse' };
      expect(await isMCPDomainAllowed(config, ['api.example.com'])).toBe(true);
    });

    it('should enforce protocol restriction from allowedDomain', async () => {
      const config = { url: 'http://api.example.com/sse' };
      expect(await isMCPDomainAllowed(config, ['https://api.example.com'])).toBe(false);
      expect(await isMCPDomainAllowed(config, ['http://api.example.com'])).toBe(true);
    });

    it('should enforce port restriction from allowedDomain', async () => {
      const config = { url: 'https://api.example.com:8443/sse' };
      expect(await isMCPDomainAllowed(config, ['https://api.example.com:8443'])).toBe(true);
      expect(await isMCPDomainAllowed(config, ['https://api.example.com:443'])).toBe(false);
    });
  });

  describe('WebSocket URL handling (MCP supports ws/wss)', () => {
    it('should allow WebSocket URL when hostname is in allowedDomains', async () => {
      const config = { url: 'wss://ws.example.com/mcp' };
      expect(await isMCPDomainAllowed(config, ['ws.example.com'])).toBe(true);
    });

    it('should allow WebSocket URL with protocol restriction', async () => {
      const config = { url: 'wss://ws.example.com/mcp' };
      expect(await isMCPDomainAllowed(config, ['wss://ws.example.com'])).toBe(true);
    });

    it('should reject WebSocket URL with wrong protocol restriction', async () => {
      const config = { url: 'wss://ws.example.com/mcp' };
      expect(await isMCPDomainAllowed(config, ['ws://ws.example.com'])).toBe(false);
    });

    it('should allow ws:// URL when hostname is in allowedDomains', async () => {
      const config = { url: 'ws://localhost:8080/mcp' };
      expect(await isMCPDomainAllowed(config, ['localhost'])).toBe(true);
    });

    it('should allow all MCP protocols (http, https, ws, wss)', async () => {
      expect(await isMCPDomainAllowed({ url: 'http://example.com' }, ['example.com'])).toBe(true);
      expect(await isMCPDomainAllowed({ url: 'https://example.com' }, ['example.com'])).toBe(true);
      expect(await isMCPDomainAllowed({ url: 'ws://example.com' }, ['example.com'])).toBe(true);
      expect(await isMCPDomainAllowed({ url: 'wss://example.com' }, ['example.com'])).toBe(true);
    });
  });
});

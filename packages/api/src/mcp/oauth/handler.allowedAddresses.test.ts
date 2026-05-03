/**
 * Integration tests for MCPOAuthHandler.validateOAuthUrl interaction with the
 * `allowedAddresses` exemption list.
 *
 * The unit tests in `auth/domain.spec.ts` cover `isOAuthUrlAllowed` (the
 * trust-bypass shortcut) and the individual SSRF helpers, but they do NOT
 * cover the SSRF fallback inside `validateOAuthUrl` — the path taken when
 * `isOAuthUrlAllowed` returns false but `isSSRFTarget` / `resolveHostnameSSRF`
 * are still called. Those calls used to forward `allowedAddresses`
 * unconditionally, which let an unrelated `allowedAddresses` entry (e.g.
 * `127.0.0.1` configured for a self-hosted LLM) silently broaden a strict
 * `allowedDomains` whitelist for OAuth.
 */
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(),
}));

import { lookup } from 'node:dns/promises';
import { MCPOAuthHandler } from './handler';

const mockedLookup = lookup as jest.MockedFunction<typeof lookup>;

type ValidateOAuthUrl = (
  url: string,
  fieldName: string,
  allowedDomains?: string[] | null,
  allowedAddresses?: string[] | null,
) => Promise<void>;

// `validateOAuthUrl` is `private static`. TypeScript private is compile-time
// only; at runtime we reach the method directly to exercise its behavior in
// isolation, which is the only place the SSRF fallback bypass would surface.
const validateOAuthUrl = (
  MCPOAuthHandler as unknown as { validateOAuthUrl: ValidateOAuthUrl }
).validateOAuthUrl.bind(MCPOAuthHandler);

describe('MCPOAuthHandler.validateOAuthUrl — allowedAddresses scoping', () => {
  afterEach(() => {
    // resetAllMocks (not clearAllMocks) flushes mockResolvedValueOnce queues
    // so leftover values from a test that short-circuited before DNS don't
    // pollute the next test.
    jest.resetAllMocks();
  });

  describe('without allowedDomains configured', () => {
    it('permits a private OAuth URL when its hostname is in allowedAddresses', async () => {
      // No DNS lookup needed: the hostname-literal exemption short-circuits.
      await expect(
        validateOAuthUrl('http://127.0.0.1/oauth', 'token_endpoint', null, ['127.0.0.1']),
      ).resolves.toBeUndefined();
    });

    it('permits a hostname URL whose DNS resolves to an allowedAddresses IP', async () => {
      mockedLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }] as never);
      // Use a hostname that isn't on the magic-internal-hostnames list and
      // doesn't end with .internal/.local — those are blocked by isSSRFTarget
      // before DNS resolution happens. The exemption path is supposed to
      // take effect after DNS resolves the host to a permitted private IP.
      await expect(
        validateOAuthUrl('https://ollama.example.com/oauth', 'token_endpoint', null, ['10.0.0.5']),
      ).resolves.toBeUndefined();
    });

    it('rejects a private URL not present in allowedAddresses', async () => {
      await expect(
        validateOAuthUrl('http://192.168.1.1/oauth', 'token_endpoint', null, ['10.0.0.5']),
      ).rejects.toThrow('targets a blocked address');
    });
  });

  describe('with allowedDomains configured (strict bound)', () => {
    it('permits a URL that matches the allowedDomains whitelist', async () => {
      mockedLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never);
      await expect(
        validateOAuthUrl(
          'https://oauth.trusted.com/token',
          'token_endpoint',
          ['oauth.trusted.com'],
          null,
        ),
      ).resolves.toBeUndefined();
    });

    it('rejects a private URL even when allowedAddresses lists it (regression for bypass)', async () => {
      // Admin set `allowedDomains: ['oauth.trusted.com']` to constrain OAuth
      // endpoints. Independently, they also set `allowedAddresses: ['127.0.0.1']`
      // to permit a self-hosted LLM. A malicious MCP server now advertises an
      // OAuth token endpoint at `http://127.0.0.1/oauth`. The address
      // exemption MUST NOT grant the URL trust beyond the strict OAuth
      // whitelist.
      await expect(
        validateOAuthUrl(
          'http://127.0.0.1/oauth',
          'token_endpoint',
          ['oauth.trusted.com'],
          ['127.0.0.1'],
        ),
      ).rejects.toThrow();
    });

    it('rejects a hostname URL whose DNS resolves to an allowedAddresses IP when allowedDomains is set', async () => {
      mockedLookup.mockResolvedValueOnce([{ address: '10.0.0.5', family: 4 }] as never);
      await expect(
        validateOAuthUrl(
          'https://attacker.example.com/oauth',
          'token_endpoint',
          ['oauth.trusted.com'],
          ['10.0.0.5'],
        ),
      ).rejects.toThrow('resolves to a private IP address');
    });

    it('rejects a non-matching public URL with no SSRF concern', async () => {
      mockedLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never);
      // A public domain that isn't in the whitelist still passes the SSRF
      // fallback (it's not a private target). This documents the existing
      // "allowedDomains as trust-bypass" semantics — the bypass-prevention
      // test above is the security-critical one.
      await expect(
        validateOAuthUrl(
          'https://other.public.com/oauth',
          'token_endpoint',
          ['oauth.trusted.com'],
          null,
        ),
      ).resolves.toBeUndefined();
    });
  });

  describe('schema-level rejections (defense in depth)', () => {
    it('ignores a public IP listed in allowedAddresses', async () => {
      // Even though `8.8.8.8` is in `allowedAddresses`, the runtime helper
      // drops public-IP entries (mirrors the schema refinement). Public IPs
      // are never SSRF targets, so this scenario is benign — but the test
      // documents the scoping invariant.
      mockedLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }] as never);
      await expect(
        validateOAuthUrl('https://other.public.com/oauth', 'token_endpoint', null, ['8.8.8.8']),
      ).resolves.toBeUndefined();
    });
  });
});

import type { UIResource } from 'librechat-data-provider';
import {
  isAllowedAppLink,
  clampAppViewHeight,
  withSandboxCsp,
  getResourceKey,
  MAX_APP_VIEW_HEIGHT,
  MIN_APP_VIEW_HEIGHT,
  MAX_CAROUSEL_VIEW_HEIGHT,
  MAX_SANDBOX_CSP_PARAM_LENGTH,
} from '~/utils/mcpApps';

/**
 * Ported copy of the sandbox route's declared-domain filter (`SAFE_HOST_RE` / `toDomainList` in
 * `serveMCPSandbox`), which cannot be imported: it lives in a CommonJS controller that pulls the
 * whole server graph. The containment test below is what keeps the two sites honest.
 */
const SAFE_HOST_RE =
  /^(?:(?:https?|wss?):\/\/)?(?:\*\.)?[a-zA-Z0-9](?:[a-zA-Z0-9\-.]*[a-zA-Z0-9])?(?::(?:\d{1,5}|\*))?(?:\/[^\s;,'"?#]*)?$/i;

function toDomainList(value: unknown): string {
  if (!Array.isArray(value)) {
    return '';
  }
  return value
    .filter((entry) => typeof entry === 'string' && SAFE_HOST_RE.test(entry.trim()))
    .map((entry) => (entry as string).trim())
    .join(' ');
}

describe('isAllowedAppLink', () => {
  it('refuses everything when the resource declares no egress domains', () => {
    expect(isAllowedAppLink('https://api.example.com/x', undefined)).toBe(false);
    expect(isAllowedAppLink('https://api.example.com/x', {})).toBe(false);
  });

  it('requires an explicit scheme, because an app document has an opaque origin', () => {
    const csp = { connectDomains: ['api.example.com'] };
    expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(false);
    expect(isAllowedAppLink('http://api.example.com:8080/x', csp)).toBe(false);
  });

  it('honors a declared scheme exactly, in either direction', () => {
    expect(
      isAllowedAppLink('https://api.example.com/x', {
        connectDomains: ['https://api.example.com'],
      }),
    ).toBe(true);
    expect(
      isAllowedAppLink('http://api.example.com/x', { connectDomains: ['https://api.example.com'] }),
    ).toBe(false);
    expect(
      isAllowedAppLink('https://api.example.com/x', { connectDomains: ['http://api.example.com'] }),
    ).toBe(false);
    expect(
      isAllowedAppLink('http://api.example.com/x', { connectDomains: ['http://api.example.com'] }),
    ).toBe(true);
  });

  it('matches a declared scheme case-insensitively', () => {
    expect(
      isAllowedAppLink('https://api.example.com/x', {
        connectDomains: ['HTTPS://API.EXAMPLE.COM'],
      }),
    ).toBe(true);
  });

  it('does not treat a ws(s) declaration as a navigable link target', () => {
    expect(
      isAllowedAppLink('https://api.example.com/x', { connectDomains: ['wss://api.example.com'] }),
    ).toBe(false);
    expect(
      isAllowedAppLink('http://api.example.com/x', { connectDomains: ['ws://api.example.com'] }),
    ).toBe(false);
  });

  describe('port-part (CSP3 §6.7.2.11)', () => {
    it('matches only the scheme default port when the declaration omits one', () => {
      const csp = { connectDomains: ['https://api.example.com'] };
      expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(true);
      expect(isAllowedAppLink('https://api.example.com:443/x', csp)).toBe(true);
      expect(isAllowedAppLink('https://api.example.com:8443/x', csp)).toBe(false);
    });

    it('matches the implicit port when the declaration spells it out', () => {
      const csp = { connectDomains: ['https://api.example.com:443'] };
      expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(true);
      expect(isAllowedAppLink('http://api.example.com:8080/collect?d=1', csp)).toBe(false);
      expect(isAllowedAppLink('https://api.example.com:8443/x', csp)).toBe(false);
    });

    it('matches an exact non-default port only', () => {
      const csp = { connectDomains: ['https://api.example.com:8443'] };
      expect(isAllowedAppLink('https://api.example.com:8443/x', csp)).toBe(true);
      expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(false);
    });

    it('treats a wildcard port as any port', () => {
      const csp = { connectDomains: ['https://api.example.com:*'] };
      expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(true);
      expect(isAllowedAppLink('https://api.example.com:8443/x', csp)).toBe(true);
    });
  });

  describe('wildcard host-part (CSP3 §6.7.2.10)', () => {
    const csp = { resourceDomains: ['https://*.example.com'] };

    it('requires at least one subdomain label and never covers the apex', () => {
      expect(isAllowedAppLink('https://cdn.example.com/x', csp)).toBe(true);
      expect(isAllowedAppLink('https://a.b.example.com/x', csp)).toBe(true);
      expect(isAllowedAppLink('https://example.com/x', csp)).toBe(false);
      expect(isAllowedAppLink('https://.example.com/x', csp)).toBe(false);
    });

    it('does not match an unrelated suffix or a trailing-dot host', () => {
      expect(isAllowedAppLink('https://notexample.com/x', csp)).toBe(false);
      expect(isAllowedAppLink('https://cdn.example.com./x', csp)).toBe(false);
      expect(isAllowedAppLink('https://example.com./x', csp)).toBe(false);
    });
  });

  it('authorizes nothing for blanket, keyword, or injection-shaped entries', () => {
    const entries = [
      '*',
      'https://*',
      'https:',
      'data:',
      "'self'",
      "'none'",
      "'unsafe-eval'",
      "'unsafe-inline'",
      "'nonce-abc123'",
      'https://api.example.com/path',
      'https://api.example.com;script-src *',
      'https://api.example.com, https://evil.com',
      '',
      '   ',
    ];
    for (const entry of entries) {
      expect(isAllowedAppLink('https://api.example.com/x', { connectDomains: [entry] })).toBe(
        false,
      );
    }
  });

  it('refuses address literals as link targets while keeping localhost usable', () => {
    expect(
      isAllowedAppLink('http://127.0.0.1:3000/x', { connectDomains: ['http://127.0.0.1:3000'] }),
    ).toBe(false);
    expect(isAllowedAppLink('http://0x7f.1/x', { connectDomains: ['http://0x7f.1'] })).toBe(false);
    expect(isAllowedAppLink('http://[::1]/x', { connectDomains: ['http://[::1]'] })).toBe(false);
    expect(
      isAllowedAppLink('http://localhost:3000/x', { connectDomains: ['http://localhost:3000'] }),
    ).toBe(true);
  });

  it('refuses non-http(s) schemes and malformed urls', () => {
    const csp = { connectDomains: ['https://api.example.com'] };
    expect(isAllowedAppLink('javascript:alert(1)', csp)).toBe(false);
    expect(isAllowedAppLink('not a url', csp)).toBe(false);
    expect(isAllowedAppLink('ws://api.example.com', csp)).toBe(false);
  });

  it('consults resourceDomains and frameDomains as well as connectDomains', () => {
    expect(
      isAllowedAppLink('https://cdn.example.com/x', {
        resourceDomains: ['https://cdn.example.com'],
      }),
    ).toBe(true);
    expect(
      isAllowedAppLink('https://embed.example.com/x', {
        frameDomains: ['https://embed.example.com'],
      }),
    ).toBe(true);
  });

  it('matches a credentialed url on its host', () => {
    expect(
      isAllowedAppLink('https://user:pass@api.example.com/x', {
        connectDomains: ['https://api.example.com'],
      }),
    ).toBe(true);
  });
});

describe('sandbox declared-domain filter (ported)', () => {
  it('emits legal host-sources, trimmed', () => {
    expect(
      toDomainList([
        'https://api.example.com',
        'https://*.example.com',
        'http://localhost:3000',
        'wss://stream.example.com',
        'https://a.example.com:*',
        'HTTPS://API.EXAMPLE.COM',
        '\n  https://trimmed.example.com  ',
      ]),
    ).toBe(
      'https://api.example.com https://*.example.com http://localhost:3000 wss://stream.example.com https://a.example.com:* HTTPS://API.EXAMPLE.COM https://trimmed.example.com',
    );
  });

  it('drops keywords, blankets and injection-shaped entries', () => {
    const dropped = [
      '*',
      'https://*',
      'https:',
      'data:',
      'blob:',
      "'self'",
      "'unsafe-inline'",
      "'nonce-abc123'",
      'evil.com; script-src *',
      'a.com, b.com',
      'a.com"',
      "a.com'",
      'a.com\nscript-src *',
      'a.com\tb',
      'https://a.com/x?y=1',
      'https://a.com/x#f',
      'https://[::1]',
      'https://a_b.com',
      'https://exämple.com',
    ];
    for (const entry of dropped) {
      expect(toDomainList([entry])).toBe('');
    }
    expect(toDomainList(undefined)).toBe('');
    expect(toDomainList('https://a.com')).toBe('');
  });

  it('contains every entry the link matcher accepts', () => {
    const accepted: Array<[string, string]> = [
      ['https://api.example.com', 'https://api.example.com/x'],
      ['HTTPS://API.EXAMPLE.COM', 'https://api.example.com/x'],
      ['https://*.example.com', 'https://cdn.example.com/x'],
      ['https://api.example.com:8443', 'https://api.example.com:8443/x'],
      ['https://a.example.com:*', 'https://a.example.com:9000/x'],
      ['http://localhost:3000', 'http://localhost:3000/x'],
    ];
    for (const [entry, url] of accepted) {
      expect(isAllowedAppLink(url, { connectDomains: [entry] })).toBe(true);
      expect(toDomainList([entry])).not.toBe('');
    }
  });
});

describe('clampAppViewHeight', () => {
  it('ignores non-positive or non-finite heights', () => {
    expect(clampAppViewHeight(undefined)).toBeUndefined();
    expect(clampAppViewHeight(0)).toBeUndefined();
    expect(clampAppViewHeight(-5)).toBeUndefined();
    expect(clampAppViewHeight(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(clampAppViewHeight(Number.NaN)).toBeUndefined();
  });

  it('clamps an app-requested height into the surface bounds', () => {
    expect(clampAppViewHeight(500)).toBe(500);
    expect(clampAppViewHeight(12)).toBe(MIN_APP_VIEW_HEIGHT);
    expect(clampAppViewHeight(10_000_000)).toBe(MAX_APP_VIEW_HEIGHT);
    expect(clampAppViewHeight(10_000_000, { max: MAX_CAROUSEL_VIEW_HEIGHT })).toBe(
      MAX_CAROUSEL_VIEW_HEIGHT,
    );
    expect(clampAppViewHeight(12, { max: MAX_CAROUSEL_VIEW_HEIGHT })).toBe(MIN_APP_VIEW_HEIGHT);
  });
});

describe('withSandboxCsp', () => {
  it('carries the declared domains to the sandbox response boundary', () => {
    const { url, applied } = withSandboxCsp(
      'http://localhost:3080/api/mcp/sandbox?parentOrigin=http%3A%2F%2Fa',
      { connectDomains: ['https://api.example.com'] },
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get('parentOrigin')).toBe('http://a');
    expect(JSON.parse(parsed.searchParams.get('csp') as string)).toEqual({
      connectDomains: ['https://api.example.com'],
    });
    expect(applied).toEqual({ connectDomains: ['https://api.example.com'] });
  });

  it('leaves the url untouched when the resource declares no csp', () => {
    expect(withSandboxCsp('http://localhost:3080/api/mcp/sandbox', undefined)).toEqual({
      url: 'http://localhost:3080/api/mcp/sandbox',
      applied: undefined,
    });
  });

  it('reports nothing applied when the declaration exceeds what the route accepts', () => {
    const connectDomains = Array.from(
      { length: 400 },
      (_unused, index) => `https://host${index}.example.com`,
    );
    expect(JSON.stringify({ connectDomains }).length).toBeGreaterThan(MAX_SANDBOX_CSP_PARAM_LENGTH);
    const { url, applied } = withSandboxCsp('http://localhost:3080/api/mcp/sandbox', {
      connectDomains,
    });
    expect(url).toBe('http://localhost:3080/api/mcp/sandbox');
    expect(applied).toBeUndefined();
  });
});

describe('getResourceKey', () => {
  it('prefers the resource id and falls back to the uri', () => {
    expect(getResourceKey({ resourceId: 'r1', uri: 'ui://a' } as UIResource)).toBe('r1');
    expect(getResourceKey({ resourceId: '', uri: 'ui://a' } as UIResource)).toBe('ui://a');
  });
});

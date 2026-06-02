import {
  applyCspNonce,
  buildCspDirectives,
  createContentSecurityPolicy,
  serializeCspDirectives,
} from './csp';

describe('Content Security Policy helpers', () => {
  it('does not create a CSP header unless enabled', () => {
    expect(createContentSecurityPolicy({ CSP_ENABLED: 'false' })).toBeNull();
    expect(createContentSecurityPolicy({})).toBeNull();
  });

  it('creates a report-only nonce policy by default when enabled', () => {
    const csp = createContentSecurityPolicy({ CSP_ENABLED: 'true' });

    expect(csp).not.toBeNull();
    expect(csp?.headerName).toBe('Content-Security-Policy-Report-Only');
    expect(csp?.nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(csp?.headerValue).toContain(`script-src 'nonce-${csp?.nonce}' 'strict-dynamic'`);
    expect(csp?.headerValue).not.toContain(
      "script-src 'nonce-${csp?.nonce}' 'strict-dynamic' 'self' https:",
    );
    expect(csp?.headerValue).not.toContain(
      "script-src 'nonce-${csp?.nonce}' 'strict-dynamic' 'self' 'unsafe-inline'",
    );
    expect(csp?.headerValue).toContain("script-src-attr 'none'");
    expect(csp?.headerValue).toContain("object-src 'none'");
    expect(csp?.headerValue).toContain("base-uri 'self'");
  });

  it('creates an enforcing CSP header when report-only is disabled', () => {
    const csp = createContentSecurityPolicy({ CSP_ENABLED: 'true', CSP_REPORT_ONLY: 'false' });

    expect(csp?.headerName).toBe('Content-Security-Policy');
  });

  it('adds deployment-specific sources without removing safe defaults', () => {
    const header = serializeCspDirectives(
      buildCspDirectives('nonce-value', {
        CSP_CONNECT_SRC_EXTRA: 'https://telemetry.example.com,wss://stream.example.com',
        CSP_FRAME_SRC_EXTRA: 'https://sharepoint.example.com',
        CSP_FRAME_ANCESTORS: "'self' https://portal.example.com",
        CSP_REPORT_URI: 'https://reports.example.com/csp',
      }),
    );

    expect(header).toContain("connect-src 'self' https: wss: https://telemetry.example.com");
    expect(header).toContain('wss://stream.example.com');
    expect(header).toContain(
      "frame-src 'self' https: blob: data: about: https://sharepoint.example.com",
    );
    expect(header).toContain("frame-ancestors 'self' https://portal.example.com");
    expect(header).toContain('report-uri https://reports.example.com/csp');
  });

  it('appends additional directives', () => {
    const header = serializeCspDirectives(
      buildCspDirectives('nonce-value', {
        CSP_ADDITIONAL_DIRECTIVES: "upgrade-insecure-requests; require-trusted-types-for 'script'",
      }),
    );

    expect(header).toContain('upgrade-insecure-requests');
    expect(header).toContain("require-trusted-types-for 'script'");
  });

  it('adds nonce attributes to script and style tags', () => {
    const html = [
      '<style>body { margin: 0; }</style>',
      '<script defer src="/assets/app.js"></script>',
      '<script nonce="existing">window.ok = true;</script>',
    ].join('');

    expect(applyCspNonce(html, 'nonce-value')).toBe(
      [
        '<style nonce="nonce-value">body { margin: 0; }</style>',
        '<script nonce="nonce-value" defer src="/assets/app.js"></script>',
        '<script nonce="existing">window.ok = true;</script>',
      ].join(''),
    );
  });
});

import { isAllowedAppLink, clampAppViewHeight, MAX_APP_VIEW_HEIGHT } from '~/utils/mcpApps';

describe('isAllowedAppLink', () => {
  it('refuses everything when the resource declares no egress domains', () => {
    expect(isAllowedAppLink('https://api.example.com/x', undefined)).toBe(false);
    expect(isAllowedAppLink('https://api.example.com/x', {})).toBe(false);
  });

  it('allows a declared host on either scheme when the declaration omits one', () => {
    const csp = { connectDomains: ['api.example.com'] };
    expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(true);
    expect(isAllowedAppLink('http://api.example.com:8080/x', csp)).toBe(true);
    expect(isAllowedAppLink('https://evil.com/x', csp)).toBe(false);
  });

  it('honors a declared scheme', () => {
    const csp = { connectDomains: ['https://api.example.com'] };
    expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(true);
    expect(isAllowedAppLink('http://api.example.com/x', csp)).toBe(false);
  });

  it('honors a declared port, including the scheme default', () => {
    const csp = { connectDomains: ['https://api.example.com:443'] };
    expect(isAllowedAppLink('https://api.example.com/x', csp)).toBe(true);
    expect(isAllowedAppLink('http://api.example.com:8080/collect?d=1', csp)).toBe(false);
    expect(isAllowedAppLink('https://api.example.com:8443/x', csp)).toBe(false);
  });

  it('supports wildcard subdomains without matching an unrelated suffix', () => {
    const csp = { resourceDomains: ['*.example.com'] };
    expect(isAllowedAppLink('https://cdn.example.com/a.png', csp)).toBe(true);
    expect(isAllowedAppLink('https://example.com/a.png', csp)).toBe(true);
    expect(isAllowedAppLink('https://notexample.com/a.png', csp)).toBe(false);
  });

  it('refuses non-http(s) schemes and malformed urls', () => {
    const csp = { connectDomains: ['api.example.com'] };
    expect(isAllowedAppLink('javascript:alert(1)', csp)).toBe(false);
    expect(isAllowedAppLink('not a url', csp)).toBe(false);
  });

  it('does not treat a ws(s) declaration as a navigable link target', () => {
    expect(
      isAllowedAppLink('https://api.example.com/x', { connectDomains: ['wss://api.example.com'] }),
    ).toBe(false);
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

  it('clamps an app-requested height to the host maximum', () => {
    expect(clampAppViewHeight(500)).toBe(500);
    expect(clampAppViewHeight(10_000_000)).toBe(MAX_APP_VIEW_HEIGHT);
  });
});

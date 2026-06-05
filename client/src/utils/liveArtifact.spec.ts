import { isLiveArtifact, splitMcpToolKey, buildLiveArtifactDocument } from './liveArtifact';

describe('isLiveArtifact', () => {
  it('is true only for HTML with a non-empty tools allowlist', () => {
    expect(isLiveArtifact('text/html', ['list_prs_mcp_github'])).toBe(true);
    expect(isLiveArtifact('text/html', [])).toBe(false);
    expect(isLiveArtifact('text/html', undefined)).toBe(false);
    expect(isLiveArtifact('application/vnd.react', ['list_prs_mcp_github'])).toBe(false);
  });
});

describe('splitMcpToolKey', () => {
  it('splits a tool key into tool and server', () => {
    expect(splitMcpToolKey('list_prs_mcp_github')).toEqual({
      toolName: 'list_prs',
      serverName: 'github',
    });
  });

  it('returns the whole key as tool with empty server for non-MCP keys', () => {
    expect(splitMcpToolKey('execute_code')).toEqual({ toolName: 'execute_code', serverName: '' });
  });
});

describe('buildLiveArtifactDocument', () => {
  it('wraps a bare fragment in a full document with CSP and the bridge first', () => {
    const doc = buildLiveArtifactDocument('<h1>hi</h1>');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain('window.librechat');
    expect(doc).toContain('<h1>hi</h1>');
    // CSP + shim are injected before the fragment body
    expect(doc.indexOf('window.librechat')).toBeLessThan(doc.indexOf('<h1>hi</h1>'));
  });

  it('injects CSP/shim as the first head children of a full document', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body><p>y</p></body></html>';
    const doc = buildLiveArtifactDocument(html);
    expect(doc).toContain('<title>x</title>');
    expect(doc).toContain('<p>y</p>');
    // CSP appears after <head> but before the page's own <title>
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<title>x</title>'));
  });

  it('adds a head when the document has <html> but no <head>', () => {
    const doc = buildLiveArtifactDocument('<html><body><p>z</p></body></html>');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('window.librechat');
    expect(doc.indexOf('window.librechat')).toBeLessThan(doc.indexOf('<p>z</p>'));
  });

  it('blocks network egress and forbids form/base by policy', () => {
    const doc = buildLiveArtifactDocument('<div></div>');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("form-action 'none'");
    expect(doc).toContain("base-uri 'none'");
  });
});

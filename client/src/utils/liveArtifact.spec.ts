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
    const doc = buildLiveArtifactDocument('<h1>hi</h1>', 'tok-1');
    expect(doc.startsWith('<!doctype html>')).toBe(true);
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain('window.librechat');
    expect(doc).toContain('<h1>hi</h1>');
    // CSP + shim are injected before the fragment body
    expect(doc.indexOf('window.librechat')).toBeLessThan(doc.indexOf('<h1>hi</h1>'));
  });

  it('embeds the handshake token in a self-removing shim', () => {
    const doc = buildLiveArtifactDocument('<h1>hi</h1>', 'secret-tok');
    expect(doc).toContain('secret-tok');
    expect(doc).toContain('librechat:ready');
    expect(doc).toContain('librechat:ack');
    // The shim removes its own element so the token can't be read from the DOM.
    expect(doc).toContain('document.currentScript');
    expect(doc).toMatch(/removeChild\(self\)/);
  });

  it('puts CSP + shim before authored markup even when content has a pre-<head> prefix', () => {
    // A model prefix before <head> must NOT execute before the policy.
    const html =
      '<script>steal()</script><html><head><title>x</title></head><body><p>y</p></body></html>';
    const doc = buildLiveArtifactDocument(html, 'tok-2');
    expect(doc).toContain('<title>x</title>');
    expect(doc).toContain('<p>y</p>');
    expect(doc.indexOf('Content-Security-Policy')).toBeLessThan(doc.indexOf('<script>steal()'));
    expect(doc.indexOf('window.librechat')).toBeLessThan(doc.indexOf('<script>steal()'));
  });

  it('nests an <html>-without-<head> document under the policy', () => {
    const doc = buildLiveArtifactDocument('<html><body><p>z</p></body></html>', 'tok-3');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain('window.librechat');
    expect(doc.indexOf('window.librechat')).toBeLessThan(doc.indexOf('<p>z</p>'));
  });

  it('blocks all network egress: no remote script/style, no img/font hosts', () => {
    const doc = buildLiveArtifactDocument('<div></div>', 'tok-4');
    expect(doc).toContain("default-src 'none'");
    expect(doc).toContain("script-src 'unsafe-inline'");
    expect(doc).toContain("connect-src 'none'");
    expect(doc).toContain("form-action 'none'");
    expect(doc).toContain("base-uri 'none'");
    // No remote origins anywhere in the CSP (bridge-only egress).
    const csp = doc.slice(doc.indexOf('Content-Security-Policy'), doc.indexOf('">'));
    expect(csp).not.toMatch(/https?:\/\//);
  });
});

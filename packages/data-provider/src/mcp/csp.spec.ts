import { MCP_APP_CSP_MAX_DOMAINS, normalizeMCPAppCspDeclaration } from './csp';

describe('normalizeMCPAppCspDeclaration', () => {
  it('normalizes every supported directive through one source grammar', () => {
    const declaration = normalizeMCPAppCspDeclaration({
      resourceDomains: [' https://cdn.example.com '],
      connectDomains: ['wss://events.example.com', '*'],
      frameDomains: ['https://embed.example.com'],
      baseUriDomains: ['https://base.example.com/path'],
      ignored: ['https://ignored.example.com'],
    });

    expect(declaration).toEqual({
      resourceDomains: ['https://cdn.example.com'],
      connectDomains: ['wss://events.example.com'],
      frameDomains: ['https://embed.example.com'],
      baseUriDomains: ['https://base.example.com/path'],
    });
  });

  it('returns the restrictive empty declaration for invalid input', () => {
    expect(normalizeMCPAppCspDeclaration(null)).toEqual({});
    expect(normalizeMCPAppCspDeclaration([])).toEqual({});
    expect(normalizeMCPAppCspDeclaration({ connectDomains: ['javascript:alert(1)'] })).toEqual({});
  });

  it('caps each directive independently', () => {
    const domains = Array.from(
      { length: MCP_APP_CSP_MAX_DOMAINS + 4 },
      (_unused, index) => `https://host${index}.example.com`,
    );
    const declaration = normalizeMCPAppCspDeclaration({
      connectDomains: domains,
      frameDomains: domains,
    });

    expect(declaration.connectDomains).toHaveLength(MCP_APP_CSP_MAX_DOMAINS);
    expect(declaration.frameDomains).toHaveLength(MCP_APP_CSP_MAX_DOMAINS);
  });

  it('is idempotent', () => {
    const once = normalizeMCPAppCspDeclaration({
      connectDomains: [' https://api.example.com ', '*'],
      frameDomains: ['https://embed.example.com'],
    });
    expect(normalizeMCPAppCspDeclaration(once)).toEqual(once);
  });
});

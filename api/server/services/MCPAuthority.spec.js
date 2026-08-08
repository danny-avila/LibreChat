const mockResolveMCPAuthorityProof = jest.fn();
const mockAssertMCPAuthorityProofsCurrent = jest.fn();

jest.mock('~/models', () => ({
  resolveMCPAuthorityProof: (...args) => mockResolveMCPAuthorityProof(...args),
  assertMCPAuthorityProofsCurrent: (...args) => mockAssertMCPAuthorityProofsCurrent(...args),
}));

const {
  calculateMCPAuthorityArtifactRevision,
  getMCPAuthorityResolver,
  initializeMCPAuthority,
} = require('./MCPAuthority');

const originalCredsKey = process.env.CREDS_KEY;

beforeAll(() => {
  process.env.CREDS_KEY = 'mcp-authority-artifact-test-key';
});

afterAll(() => {
  if (originalCredsKey == null) {
    delete process.env.CREDS_KEY;
  } else {
    process.env.CREDS_KEY = originalCredsKey;
  }
});

function createArtifact(overrides = {}) {
  return {
    parsedConfig: {
      serverName: 'operator',
      sourceConfig: {
        type: 'streamable-http',
        url: 'https://operator.example/mcp',
      },
      effectiveConfig: {
        type: 'streamable-http',
        url: 'https://operator.example/mcp',
      },
      securityPolicyIdentity: 'policy-revision',
      authorization: {
        identity: 'grant-revision',
        kind: 'oauth',
        credentialSetId: 'grant-revision',
        generation: 'grant-revision',
      },
      catalogScope: {
        tenant: 'tenant',
        principal: 'principal',
        server: 'server',
        policy: 'policy',
        config: 'config',
        credentials: 'credentials',
      },
      ...overrides,
    },
    schemas: {
      search: {
        type: 'function',
        function: {
          name: 'search',
          description: 'Search records',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
        },
      },
    },
  };
}

describe('MCPAuthority', () => {
  test('uses the canonical config schema revision when librechat.yaml is absent', () => {
    const { Constants } = require('librechat-data-provider');

    const resolver = initializeMCPAuthority({ config: {} });

    expect(resolver.bootRevision).toMatchObject({ revision: Constants.CONFIG_VERSION });
  });

  test('initializes one resolver from the exact immutable MCP boot config', () => {
    const resolver = initializeMCPAuthority({
      config: {
        version: '1.3.13',
        mcpServers: { operator: { type: 'sse', url: 'https://operator.example/mcp' } },
        mcpSettings: { allowedDomains: ['operator.example'] },
      },
    });

    expect(getMCPAuthorityResolver()).toBe(resolver);
    expect(resolver.bootRevision).toMatchObject({ revision: '1.3.13' });
  });

  test('canonicalizes schema and record key ordering', () => {
    const artifact = createArtifact();
    const reordered = {
      parsedConfig: {
        ...artifact.parsedConfig,
        effectiveConfig: {
          url: artifact.parsedConfig.effectiveConfig.url,
          type: artifact.parsedConfig.effectiveConfig.type,
        },
        sourceConfig: {
          url: artifact.parsedConfig.sourceConfig.url,
          type: artifact.parsedConfig.sourceConfig.type,
        },
      },
      schemas: {
        search: {
          function: {
            parameters: {
              properties: { query: { type: 'string' } },
              type: 'object',
            },
            description: 'Search records',
            name: 'search',
          },
          type: 'function',
        },
      },
    };

    expect(calculateMCPAuthorityArtifactRevision(reordered)).toBe(
      calculateMCPAuthorityArtifactRevision(artifact),
    );
  });

  test.each([
    [
      'authorization kind',
      {
        authorization: {
          identity: 'grant-revision',
          kind: 'none',
          credentialSetId: 'grant-revision',
          generation: 'grant-revision',
        },
      },
    ],
    [
      'authorization identity',
      {
        authorization: {
          identity: 'rotated-grant',
          kind: 'oauth',
          credentialSetId: 'rotated-grant',
          generation: 'rotated-grant',
        },
      },
    ],
    [
      'effective configuration',
      {
        effectiveConfig: {
          type: 'streamable-http',
          url: 'https://operator.example/changed',
        },
      },
    ],
    [
      'security policy',
      {
        securityPolicyIdentity: 'changed-policy',
      },
    ],
  ])('changes the artifact revision when %s changes', (_label, override) => {
    expect(calculateMCPAuthorityArtifactRevision(createArtifact(override))).not.toBe(
      calculateMCPAuthorityArtifactRevision(createArtifact()),
    );
  });

  test('changes the artifact revision when a published schema changes', () => {
    const artifact = createArtifact();
    const changed = createArtifact();
    changed.schemas.search.function.parameters.properties.query.type = 'number';

    expect(calculateMCPAuthorityArtifactRevision(changed)).not.toBe(
      calculateMCPAuthorityArtifactRevision(artifact),
    );
  });
});

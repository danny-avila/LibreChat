import type { MCPAuthorityProofV1, MCPAuthorityMethods } from '@librechat/data-schemas';
import type { MCPAuthorityResolution } from './index';
import { MCPAuthorityProofResolver } from './index';

const proof: MCPAuthorityProofV1 = Object.freeze({
  version: 1,
  generation: 0,
  shared: {
    user: {
      userId: '64b64c13a1136b7f18a7e111',
      tenantId: null,
      role: 'USER',
      provider: 'local',
      sourceIdentityDigest: 'source',
      revision: 'user',
    },
    groups: [],
    configs: [],
    role: { id: 'role-id', name: 'USER', use: true, revision: 'role' },
    boot: { revision: 'boot-1', digest: 'boot-digest' },
    groupsRevision: 'groups',
    configsRevision: 'configs',
    configSourceRevision: 'config-source-revision',
    revision: 'shared',
  },
  servers: [],
  revision: 'proof',
});

function createResolver(beforeExecute?: () => void | Promise<void>) {
  const resolveMCPAuthorityProof: jest.MockedFunction<
    MCPAuthorityMethods['resolveMCPAuthorityProof']
  > = jest.fn();
  const assertMCPAuthorityProofsCurrent: jest.MockedFunction<
    MCPAuthorityMethods['assertMCPAuthorityProofsCurrent']
  > = jest.fn();
  resolveMCPAuthorityProof.mockResolvedValue(proof);
  assertMCPAuthorityProofsCurrent.mockResolvedValue(undefined);
  const resolver = new MCPAuthorityProofResolver({
    methods: { resolveMCPAuthorityProof, assertMCPAuthorityProofsCurrent },
    bootRevision: 'boot-1',
    immutableConfig: {
      mcpServers: {
        operator: { type: 'sse', url: 'https://operator.example/mcp' },
      },
    },
    beforeExecute,
  });
  return { resolver, resolveMCPAuthorityProof, assertMCPAuthorityProofsCurrent };
}

async function resolveFixture(resolver: MCPAuthorityProofResolver) {
  return await resolver.resolve({
    userId: '64b64c13a1136b7f18a7e111',
    targets: [
      {
        serverName: 'operator',
        source: 'config',
        sourceRevision: 'config-source-revision',
        configSourceRevision: 'config-source-revision',
        expectedCredentialRevision: 'credential-revision',
        expectedOAuthGrantGeneration: null,
        resolvedConfig: { type: 'sse', url: 'https://operator.example/mcp' },
      },
    ],
    parsedConfig: { operator: { type: 'sse' } },
    schemas: [{ name: 'search' }],
    calculateArtifactRevision: ({ parsedConfig, schemas }) =>
      JSON.stringify({ parsedConfig, schemas }),
  });
}

interface MutableAuthorityFixture {
  parsedConfig: {
    actor: {
      userId: string;
      tenantId: string;
      user: {
        id: string;
        tenantId: string;
        federatedTokens: { access_token: string };
      };
    };
    serverName: string;
    securityPolicy: {
      allowedDomains: string[];
      allowedAddresses: string[];
      useSSRFProtection: boolean;
    };
    customUserVars: Record<string, string>;
  };
  schemas: Array<{
    name: string;
    inputSchema: { properties: { query: { type: string } } };
  }>;
}

async function resolveMutableAuthorityFixture(resolver: MCPAuthorityProofResolver): Promise<
  MutableAuthorityFixture & {
    resolution: MCPAuthorityResolution<
      MutableAuthorityFixture['parsedConfig'],
      MutableAuthorityFixture['schemas']
    >;
  }
> {
  const parsedConfig: MutableAuthorityFixture['parsedConfig'] = {
    actor: {
      userId: '64b64c13a1136b7f18a7e111',
      tenantId: 'tenant-a',
      user: {
        id: '64b64c13a1136b7f18a7e111',
        tenantId: 'tenant-a',
        federatedTokens: { access_token: 'federated-token-a' },
      },
    },
    serverName: 'operator',
    securityPolicy: {
      allowedDomains: ['operator.example'],
      allowedAddresses: ['10.0.0.1'],
      useSSRFProtection: true,
    },
    customUserVars: { API_KEY: 'credential-a' },
  };
  const schemas: MutableAuthorityFixture['schemas'] = [
    {
      name: 'search',
      inputSchema: { properties: { query: { type: 'string' } } },
    },
  ];
  const resolution = await resolver.resolve({
    userId: parsedConfig.actor.userId,
    tenantId: parsedConfig.actor.tenantId,
    targets: [
      {
        serverName: 'operator',
        source: 'config',
        sourceRevision: 'config-source-revision',
        configSourceRevision: 'config-source-revision',
        expectedCredentialRevision: 'credential-revision',
        expectedOAuthGrantGeneration: null,
        resolvedConfig: { type: 'sse', url: 'https://operator.example/mcp' },
      },
    ],
    parsedConfig,
    schemas,
    calculateArtifactRevision: ({ parsedConfig: currentParsedConfig, schemas: currentSchemas }) =>
      JSON.stringify({ parsedConfig: currentParsedConfig, schemas: currentSchemas }),
  });
  return { parsedConfig, schemas, resolution };
}

describe('MCPAuthorityProofResolver', () => {
  test.each([
    ['Map', new Map([['allowedDomains', ['operator.example']]])],
    ['Date', new Date('2026-08-08T00:00:00.000Z')],
    [
      'custom class',
      new (class ParsedAuthorityConfig {
        public readonly serverName = 'operator';
      })(),
    ],
  ])('rejects a %s in parsed authority config before resolving a proof', async (_name, value) => {
    const { resolver, resolveMCPAuthorityProof } = createResolver();

    await expect(
      resolver.resolve({
        userId: '64b64c13a1136b7f18a7e111',
        targets: [
          {
            serverName: 'operator',
            source: 'config',
            sourceRevision: 'config-source-revision',
            configSourceRevision: 'config-source-revision',
            expectedCredentialRevision: 'credential-revision',
            expectedOAuthGrantGeneration: null,
            resolvedConfig: { type: 'sse', url: 'https://operator.example/mcp' },
          },
        ],
        parsedConfig: { value },
        schemas: [],
        calculateArtifactRevision: () => 'artifact-revision',
      }),
    ).rejects.toEqual(expect.objectContaining({ reason: 'malformed_input' }));
    expect(resolveMCPAuthorityProof).not.toHaveBeenCalled();
  });

  test.each([
    {
      name: 'raw security policy',
      mutate: ({ parsedConfig }: MutableAuthorityFixture) => {
        parsedConfig.securityPolicy.allowedDomains[0] = 'attacker.example';
        parsedConfig.securityPolicy.allowedAddresses[0] = '203.0.113.10';
        parsedConfig.securityPolicy.useSSRFProtection = false;
      },
    },
    {
      name: 'actor identity',
      mutate: ({ parsedConfig }: MutableAuthorityFixture) => {
        parsedConfig.actor.userId = 'attacker-user';
        parsedConfig.actor.user.id = 'attacker-user';
      },
    },
    {
      name: 'actor tenant',
      mutate: ({ parsedConfig }: MutableAuthorityFixture) => {
        parsedConfig.actor.tenantId = 'tenant-b';
        parsedConfig.actor.user.tenantId = 'tenant-b';
      },
    },
    {
      name: 'federated token',
      mutate: ({ parsedConfig }: MutableAuthorityFixture) => {
        parsedConfig.actor.user.federatedTokens.access_token = 'federated-token-b';
      },
    },
    {
      name: 'custom user variables',
      mutate: ({ parsedConfig }: MutableAuthorityFixture) => {
        parsedConfig.customUserVars.API_KEY = 'credential-b';
      },
    },
    {
      name: 'tool schemas',
      mutate: ({ schemas }: MutableAuthorityFixture) => {
        schemas[0].inputSchema.properties.query.type = 'number';
      },
    },
  ])('rejects $name mutation while the final assertion is blocked', async ({ mutate }) => {
    let startAssertion: (() => void) | undefined;
    let releaseAssertion: (() => void) | undefined;
    const assertionStarted = new Promise<void>((resolve) => {
      startAssertion = resolve;
    });
    const assertionGate = new Promise<void>((resolve) => {
      releaseAssertion = resolve;
    });
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const fixture = await resolveMutableAuthorityFixture(resolver);
    const redirect = jest.fn();
    const connection = jest.fn();
    const tokenExchange = jest.fn();
    const networkRequest = jest.fn();
    assertMCPAuthorityProofsCurrent.mockImplementation(async () => {
      startAssertion?.();
      await assertionGate;
    });

    const operation = resolver.useIssuedResolution(fixture.resolution, () => {
      redirect();
      connection();
      tokenExchange();
      networkRequest();
    });
    await assertionStarted;
    mutate(fixture);
    releaseAssertion?.();

    await expect(operation).rejects.toEqual(expect.objectContaining({ reason: 'malformed_input' }));
    expect(redirect).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
    expect(tokenExchange).not.toHaveBeenCalled();
    expect(networkRequest).not.toHaveBeenCalled();
  });

  test('passes only the deeply immutable issued snapshot into the fenced action', async () => {
    const { resolver } = createResolver();
    const fixture = await resolveMutableAuthorityFixture(resolver);

    await resolver.useIssuedResolution(fixture.resolution, (current) => {
      expect(current.parsedConfig).not.toBe(fixture.parsedConfig);
      expect(current.schemas).toBe(fixture.schemas);
      expect(current.parsedConfig).toEqual(fixture.parsedConfig);
      expect(current.schemas).toEqual(fixture.schemas);
      expect(Object.isFrozen(current)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig.actor)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig.actor.user)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig.actor.user.federatedTokens)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig.securityPolicy)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig.securityPolicy.allowedDomains)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig.securityPolicy.allowedAddresses)).toBe(true);
      expect(Object.isFrozen(current.parsedConfig.customUserVars)).toBe(true);
      expect(Object.isFrozen(current.schemas)).toBe(false);
    });
  });

  test('returns parsed config and schemas with the resolved authority proof', async () => {
    const { resolver, resolveMCPAuthorityProof } = createResolver();
    const result = await resolveFixture(resolver);

    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toMatchObject({
      parsedConfig: { operator: { type: 'sse' } },
      schemas: [{ name: 'search' }],
      authorityProof: proof,
    });
    expect(resolveMCPAuthorityProof).toHaveBeenCalledWith(
      expect.objectContaining({ boot: resolver.bootRevision }),
    );
  });

  test('asserts immediately before publishing or binding results', async () => {
    const events: string[] = [];
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const resolution = await resolveFixture(resolver);
    assertMCPAuthorityProofsCurrent.mockImplementation(async () => {
      events.push('assert');
    });

    await resolver.publishWithCurrentAuthority(resolution, (current) => {
      expect(current).toBe(resolution);
      events.push('publish');
    });
    await resolver.bindWithCurrentAuthority(resolution, (current) => {
      expect(current).toBe(resolution);
      events.push('bind');
    });

    expect(events).toEqual(['assert', 'publish', 'assert', 'bind']);
  });

  test('asserts every issued resolution in one batch before publishing a catalog', async () => {
    const events: string[] = [];
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const first = await resolveFixture(resolver);
    const second = await resolveFixture(resolver);
    assertMCPAuthorityProofsCurrent.mockImplementation(async () => {
      events.push('assert');
    });

    await resolver.publishManyWithCurrentAuthority([first, second], (current) => {
      expect(current).toEqual([first, second]);
      events.push('publish');
    });

    expect(events).toEqual(['assert', 'publish']);
    expect(assertMCPAuthorityProofsCurrent).toHaveBeenCalledWith({
      proofs: [proof, proof],
      boot: resolver.bootRevision,
    });
  });

  test('rejects an unissued batch member before asserting any proof', async () => {
    const action = jest.fn();
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const issued = await resolveFixture(resolver);

    await expect(
      resolver.publishManyWithCurrentAuthority([issued, { ...issued }], action),
    ).rejects.toEqual(expect.objectContaining({ reason: 'malformed_input' }));
    expect(assertMCPAuthorityProofsCurrent).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  test('rejects a batched artifact mutation while the final assertion is in flight', async () => {
    let releaseAssertion: (() => void) | undefined;
    const assertionGate = new Promise<void>((resolve) => {
      releaseAssertion = resolve;
    });
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const first = await resolveFixture(resolver);
    const second = await resolveFixture(resolver);
    const action = jest.fn();
    assertMCPAuthorityProofsCurrent.mockReturnValue(assertionGate);

    const publication = resolver.publishManyWithCurrentAuthority([first, second], action);
    await Promise.resolve();
    second.schemas[0].name = 'injected-change';
    releaseAssertion?.();

    await expect(publication).rejects.toEqual(
      expect.objectContaining({ reason: 'malformed_input' }),
    );
    expect(action).not.toHaveBeenCalled();
  });

  test('runs the injected mutation seam before the final remote-call assertion', async () => {
    const events: string[] = [];
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver(() => {
      events.push('mutate');
    });
    const resolution = await resolveFixture(resolver);
    assertMCPAuthorityProofsCurrent.mockImplementation(async () => {
      events.push('assert');
    });

    await resolver.executeWithCurrentAuthority(resolution, () => events.push('execute'));

    expect(events).toEqual(['mutate', 'assert', 'execute']);
  });

  test('does not publish, bind, or execute when the final assertion rejects', async () => {
    const action = jest.fn();
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const resolution = await resolveFixture(resolver);
    assertMCPAuthorityProofsCurrent.mockRejectedValue(new Error('revoked'));

    await expect(resolver.publishWithCurrentAuthority(resolution, action)).rejects.toThrow(
      'revoked',
    );
    await expect(resolver.bindWithCurrentAuthority(resolution, action)).rejects.toThrow('revoked');
    await expect(resolver.executeWithCurrentAuthority(resolution, action)).rejects.toThrow(
      'revoked',
    );
    expect(action).not.toHaveBeenCalled();
  });

  test('rejects structurally copied artifacts that were not issued by this resolver', async () => {
    const action = jest.fn();
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const resolution = await resolveFixture(resolver);
    const copiedResolution = { ...resolution };

    await expect(resolver.publishWithCurrentAuthority(copiedResolution, action)).rejects.toEqual(
      expect.objectContaining({ reason: 'malformed_input' }),
    );
    expect(assertMCPAuthorityProofsCurrent).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  test('does not mutate inputs and rejects artifact changes at the final fence', async () => {
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const resolution = await resolveFixture(resolver);
    resolution.schemas[0].name = 'changed';
    const action = jest.fn();

    await expect(resolver.publishWithCurrentAuthority(resolution, action)).rejects.toEqual(
      expect.objectContaining({ reason: 'malformed_input' }),
    );
    expect(Object.isFrozen(resolution.schemas)).toBe(false);
    expect(assertMCPAuthorityProofsCurrent).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });

  test('rejects artifact mutation injected while the authority assertion is in flight', async () => {
    let releaseAssertion: (() => void) | undefined;
    const assertionGate = new Promise<void>((resolve) => {
      releaseAssertion = resolve;
    });
    const { resolver, assertMCPAuthorityProofsCurrent } = createResolver();
    const resolution = await resolveFixture(resolver);
    const action = jest.fn();
    assertMCPAuthorityProofsCurrent.mockReturnValue(assertionGate);

    const publication = resolver.publishWithCurrentAuthority(resolution, action);
    await Promise.resolve();
    resolution.schemas[0].name = 'injected-change';
    releaseAssertion?.();

    await expect(publication).rejects.toEqual(
      expect.objectContaining({ reason: 'malformed_input' }),
    );
    expect(action).not.toHaveBeenCalled();
  });

  test('invokes the fenced action before a post-check queued mutation can run', async () => {
    const { resolver } = createResolver();
    const schemas = [{ name: 'search' }];
    let revisionCalls = 0;
    const resolution = await resolver.resolve({
      userId: '64b64c13a1136b7f18a7e111',
      targets: [
        {
          serverName: 'operator',
          source: 'config',
          sourceRevision: 'config-source-revision',
          configSourceRevision: 'config-source-revision',
          expectedCredentialRevision: 'credential-revision',
          expectedOAuthGrantGeneration: null,
          resolvedConfig: { type: 'sse', url: 'https://operator.example/mcp' },
        },
      ],
      parsedConfig: { operator: { type: 'sse' } },
      schemas,
      calculateArtifactRevision: ({ parsedConfig, schemas: currentSchemas }) => {
        revisionCalls++;
        if (revisionCalls === 4) {
          queueMicrotask(() => {
            schemas[0].name = 'queued-mutation';
          });
        }
        return JSON.stringify({ parsedConfig, schemas: currentSchemas });
      },
    });
    const observedNames: string[] = [];

    await resolver.publishWithCurrentAuthority(resolution, (current) => {
      observedNames.push(current.schemas[0].name);
    });

    expect(observedNames).toEqual(['search']);
    expect(schemas[0].name).toBe('queued-mutation');
  });
});

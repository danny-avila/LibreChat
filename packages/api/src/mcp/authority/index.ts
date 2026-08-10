import {
  MCPAuthorityProofError,
  digestMCPAuthorityValue,
  createMCPAuthorityBootRevision,
} from '@librechat/data-schemas';
import type {
  MCPAuthorityProofV1,
  MCPAuthorityMethods,
  MCPAuthorityTargetInput,
  MCPAuthorityBootRevision,
  MCPAuthorityImmutableConfig,
} from '@librechat/data-schemas';

export interface MCPAuthorityProofResolverOptions {
  methods: Pick<
    MCPAuthorityMethods,
    'resolveMCPAuthorityProof' | 'assertMCPAuthorityProofsCurrent'
  >;
  bootRevision: string;
  immutableConfig: MCPAuthorityImmutableConfig;
  beforeExecute?: () => void | Promise<void>;
  now?: () => Date;
}

export interface MCPAuthorityResolutionInput<TParsedConfig, TSchemas> {
  userId: string;
  tenantId?: string;
  expectedUserSourceRevision: string;
  targets: readonly MCPAuthorityTargetInput[];
  parsedConfig: TParsedConfig;
  schemas: TSchemas;
  calculateArtifactRevision: (artifacts: {
    parsedConfig: TParsedConfig;
    schemas: TSchemas;
  }) => string;
}

export interface MCPAuthorityResolution<TParsedConfig, TSchemas> {
  readonly parsedConfig: TParsedConfig;
  readonly schemas: TSchemas;
  readonly authorityProof: MCPAuthorityProofV1;
}

function assertPlainAuthorityValue(value: unknown, seen: WeakSet<object>): void {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return;
  }
  if (typeof value !== 'object') {
    throw new MCPAuthorityProofError(
      'malformed_input',
      'MCP authority parsed config must contain only plain data',
    );
  }
  if (seen.has(value)) {
    throw new MCPAuthorityProofError(
      'malformed_input',
      'MCP authority parsed config must not contain cycles',
    );
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new MCPAuthorityProofError(
      'malformed_input',
      'MCP authority parsed config must contain only plain objects and arrays',
    );
  }
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string') {
      throw new MCPAuthorityProofError(
        'malformed_input',
        'MCP authority parsed config must not contain symbol properties',
      );
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !('value' in descriptor)) {
      throw new MCPAuthorityProofError(
        'malformed_input',
        'MCP authority parsed config must not contain accessors',
      );
    }
    assertPlainAuthorityValue(descriptor.value, seen);
  }
  seen.delete(value);
}

function deepFreezePlainAuthorityValue<Value>(value: Value): Value {
  if (value == null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.keys(value)) {
    deepFreezePlainAuthorityValue(value[key as keyof Value]);
  }
  return Object.freeze(value);
}

function cloneIssuedParsedConfig<Value>(value: Value): Value {
  assertPlainAuthorityValue(value, new WeakSet());
  return deepFreezePlainAuthorityValue(structuredClone(value));
}

export class MCPAuthorityProofResolver {
  private readonly methods: MCPAuthorityProofResolverOptions['methods'];
  private readonly boot: MCPAuthorityBootRevision;
  private readonly beforeExecute?: MCPAuthorityProofResolverOptions['beforeExecute'];
  private readonly now: () => Date;
  private readonly issuedResolutions = new WeakMap<
    object,
    { revision: string; getCurrentRevision: () => string }
  >();

  constructor(options: MCPAuthorityProofResolverOptions) {
    this.methods = options.methods;
    this.boot = createMCPAuthorityBootRevision(options.bootRevision, options.immutableConfig);
    this.beforeExecute = options.beforeExecute;
    this.now = options.now ?? (() => new Date());
  }

  public get bootRevision(): MCPAuthorityBootRevision {
    return this.boot;
  }

  public async resolve<TParsedConfig, TSchemas>({
    userId,
    tenantId,
    expectedUserSourceRevision,
    targets,
    parsedConfig,
    schemas,
    calculateArtifactRevision,
  }: MCPAuthorityResolutionInput<TParsedConfig, TSchemas>): Promise<
    MCPAuthorityResolution<TParsedConfig, TSchemas>
  > {
    const issuedParsedConfig = cloneIssuedParsedConfig(parsedConfig);
    const getCurrentRevision = (): string => {
      let artifactRevision: string;
      try {
        artifactRevision = calculateArtifactRevision({ parsedConfig, schemas });
      } catch {
        throw new MCPAuthorityProofError(
          'malformed_input',
          'MCP authority artifact revision could not be calculated',
        );
      }
      if (typeof artifactRevision !== 'string' || !artifactRevision.trim()) {
        throw new MCPAuthorityProofError(
          'malformed_input',
          'MCP authority artifact revision is required',
        );
      }
      artifactRevision = artifactRevision.trim();
      return digestMCPAuthorityValue({
        expectedUserSourceRevision,
        targets: targets.map((target) => ({
          serverName: target.serverName,
          source: target.source,
          sourceRevision: target.sourceRevision,
          configSourceRevision: target.configSourceRevision,
          expectedCredentialRevision: target.expectedCredentialRevision,
          expectedOAuthGrantGeneration: target.expectedOAuthGrantGeneration,
          databaseId: target.databaseId ?? null,
          resolvedConfigDigest: digestMCPAuthorityValue(target.resolvedConfig),
          credentialFields: target.credentialFields ?? null,
          requiresOAuth: target.requiresOAuth ?? null,
        })),
        parsedConfigRevision: digestMCPAuthorityValue(parsedConfig),
        artifactRevision,
      });
    };
    const artifactRevision = getCurrentRevision();
    const authorityProof = await this.methods.resolveMCPAuthorityProof({
      userId,
      tenantId,
      expectedUserSourceRevision,
      targets,
      boot: this.boot,
    });
    if (getCurrentRevision() !== artifactRevision) {
      throw new MCPAuthorityProofError(
        'malformed_input',
        'MCP authority artifacts changed while resolving authority',
      );
    }
    const resolution = Object.freeze({
      parsedConfig: issuedParsedConfig,
      schemas,
      authorityProof,
    });
    this.issuedResolutions.set(resolution, { revision: artifactRevision, getCurrentRevision });
    return resolution;
  }

  public async assertCurrent(
    proofs: MCPAuthorityProofV1 | readonly MCPAuthorityProofV1[],
  ): Promise<void> {
    await this.methods.assertMCPAuthorityProofsCurrent({ proofs, boot: this.boot });
  }

  private assertAuthorizationCurrent(
    proofs: MCPAuthorityProofV1 | readonly MCPAuthorityProofV1[],
  ): void {
    const now = this.now();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new MCPAuthorityProofError(
        'malformed_input',
        'MCP authority resolver clock returned an invalid time',
      );
    }
    const normalized = Array.isArray(proofs) ? proofs : [proofs];
    if (
      normalized.some(
        (proof) => proof.validUntil !== null && Date.parse(proof.validUntil) <= now.getTime(),
      )
    ) {
      throw new MCPAuthorityProofError(
        'authorization_changed',
        'MCP authority authorization expired before use',
      );
    }
  }

  public async useIssuedResolution<TParsedConfig, TSchemas, Result>(
    resolution: MCPAuthorityResolution<TParsedConfig, TSchemas>,
    action: (current: MCPAuthorityResolution<TParsedConfig, TSchemas>) => Result | Promise<Result>,
  ): Promise<Result> {
    await this.beforeExecute?.();
    const issued = this.issuedResolutions.get(resolution);
    if (!issued) {
      throw new MCPAuthorityProofError(
        'malformed_input',
        'MCP authority resolution was not issued by this resolver',
      );
    }
    const assertArtifactsCurrent = (): void => {
      if (issued.getCurrentRevision() !== issued.revision) {
        throw new MCPAuthorityProofError(
          'malformed_input',
          'MCP authority resolution artifacts changed after authority was resolved',
        );
      }
    };
    this.assertAuthorizationCurrent(resolution.authorityProof);
    assertArtifactsCurrent();
    await this.assertCurrent(resolution.authorityProof);
    this.assertAuthorizationCurrent(resolution.authorityProof);
    assertArtifactsCurrent();
    return await action(resolution);
  }

  public async useIssuedResolutions<TParsedConfig, TSchemas, Result>(
    resolutions: readonly MCPAuthorityResolution<TParsedConfig, TSchemas>[],
    action: (
      current: readonly MCPAuthorityResolution<TParsedConfig, TSchemas>[],
    ) => Result | Promise<Result>,
  ): Promise<Result> {
    await this.beforeExecute?.();
    const issued = resolutions.map((resolution) => {
      const current = this.issuedResolutions.get(resolution);
      if (!current) {
        throw new MCPAuthorityProofError(
          'malformed_input',
          'MCP authority resolution was not issued by this resolver',
        );
      }
      return current;
    });
    const assertArtifactsCurrent = (): void => {
      for (let index = 0; index < resolutions.length; index++) {
        if (issued[index].getCurrentRevision() !== issued[index].revision) {
          throw new MCPAuthorityProofError(
            'malformed_input',
            'MCP authority resolution artifacts changed after authority was resolved',
          );
        }
      }
    };
    const proofs = resolutions.map((resolution) => resolution.authorityProof);
    this.assertAuthorizationCurrent(proofs);
    assertArtifactsCurrent();
    await this.assertCurrent(proofs);
    this.assertAuthorizationCurrent(proofs);
    assertArtifactsCurrent();
    return await action(resolutions);
  }

  public async publishManyWithCurrentAuthority<TParsedConfig, TSchemas, Result>(
    resolutions: readonly MCPAuthorityResolution<TParsedConfig, TSchemas>[],
    publish: (
      current: readonly MCPAuthorityResolution<TParsedConfig, TSchemas>[],
    ) => Result | Promise<Result>,
  ): Promise<Result> {
    return await this.useIssuedResolutions(resolutions, publish);
  }

  public async publishWithCurrentAuthority<TParsedConfig, TSchemas, Result>(
    resolution: MCPAuthorityResolution<TParsedConfig, TSchemas>,
    publish: (current: MCPAuthorityResolution<TParsedConfig, TSchemas>) => Result | Promise<Result>,
  ): Promise<Result> {
    return await this.useIssuedResolution(resolution, publish);
  }

  public async bindWithCurrentAuthority<TParsedConfig, TSchemas, Result>(
    resolution: MCPAuthorityResolution<TParsedConfig, TSchemas>,
    bind: (current: MCPAuthorityResolution<TParsedConfig, TSchemas>) => Result | Promise<Result>,
  ): Promise<Result> {
    return await this.useIssuedResolution(resolution, bind);
  }

  public async executeWithCurrentAuthority<TParsedConfig, TSchemas, Result>(
    resolution: MCPAuthorityResolution<TParsedConfig, TSchemas>,
    execute: (current: MCPAuthorityResolution<TParsedConfig, TSchemas>) => Result | Promise<Result>,
  ): Promise<Result> {
    return await this.useIssuedResolution(resolution, execute);
  }
}

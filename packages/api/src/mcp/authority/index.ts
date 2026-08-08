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
}

export interface MCPAuthorityResolutionInput<TParsedConfig, TSchemas> {
  userId: string;
  tenantId?: string;
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

export class MCPAuthorityProofResolver {
  private readonly methods: MCPAuthorityProofResolverOptions['methods'];
  private readonly boot: MCPAuthorityBootRevision;
  private readonly beforeExecute?: MCPAuthorityProofResolverOptions['beforeExecute'];
  private readonly issuedResolutions = new WeakMap<
    object,
    { revision: string; getCurrentRevision: () => string }
  >();

  constructor(options: MCPAuthorityProofResolverOptions) {
    this.methods = options.methods;
    this.boot = createMCPAuthorityBootRevision(options.bootRevision, options.immutableConfig);
    this.beforeExecute = options.beforeExecute;
  }

  public get bootRevision(): MCPAuthorityBootRevision {
    return this.boot;
  }

  public async resolve<TParsedConfig, TSchemas>({
    userId,
    tenantId,
    targets,
    parsedConfig,
    schemas,
    calculateArtifactRevision,
  }: MCPAuthorityResolutionInput<TParsedConfig, TSchemas>): Promise<
    MCPAuthorityResolution<TParsedConfig, TSchemas>
  > {
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
        targets: targets.map((target) => ({
          serverName: target.serverName,
          source: target.source,
          sourceRevision: target.sourceRevision,
          expectedCredentialRevision: target.expectedCredentialRevision,
          expectedOAuthGrantGeneration: target.expectedOAuthGrantGeneration,
          databaseId: target.databaseId ?? null,
          resolvedConfigDigest: digestMCPAuthorityValue(target.resolvedConfig),
          credentialFields: target.credentialFields ?? null,
          requiresOAuth: target.requiresOAuth ?? null,
        })),
        artifactRevision,
      });
    };
    const artifactRevision = getCurrentRevision();
    const authorityProof = await this.methods.resolveMCPAuthorityProof({
      userId,
      tenantId,
      targets,
      boot: this.boot,
    });
    if (getCurrentRevision() !== artifactRevision) {
      throw new MCPAuthorityProofError(
        'malformed_input',
        'MCP authority artifacts changed while resolving authority',
      );
    }
    const resolution = Object.freeze({ parsedConfig, schemas, authorityProof });
    this.issuedResolutions.set(resolution, { revision: artifactRevision, getCurrentRevision });
    return resolution;
  }

  public async assertCurrent(
    proofs: MCPAuthorityProofV1 | readonly MCPAuthorityProofV1[],
  ): Promise<void> {
    await this.methods.assertMCPAuthorityProofsCurrent({ proofs, boot: this.boot });
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
    assertArtifactsCurrent();
    await this.assertCurrent(resolution.authorityProof);
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
    assertArtifactsCurrent();
    await this.assertCurrent(resolutions.map((resolution) => resolution.authorityProof));
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

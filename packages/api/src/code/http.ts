import { nanoid } from 'nanoid';
import { EModelEndpoint } from 'librechat-data-provider';
import { logger, type AppConfig } from '@librechat/data-schemas';
import type { Response } from 'express';
import type {
  CodeEnvironmentLifecycleTarget,
  CodeEnvironmentPrincipalContext,
  CodeEnvironmentRegistration,
  CodeEnvironmentSummary,
  AccessibleCodeEnvironmentDetails,
  AccessibleCodeEnvironmentConfiguration,
} from './environments';
import type { GetAppConfigOptions } from '~/app/service';
import type { ServerRequest } from '~/types/http';
import type { CodeBridgeFetch } from './bridge';
import {
  CodeEnvironmentInUseError,
  CodeEnvironmentLimitError,
  CodeEnvironmentValidationError,
  normalizeCodeEnvironmentName,
} from './environments';
import {
  CodeBridgeLifecycleError,
  CodeBridgePairingError,
  createCodeBridgePairing,
  readCodeBridgeSecret,
  revokeCodeBridgeWorker,
} from './bridge';
import {
  assertCodeApiJwtSigningReady,
  getCodeApiTenantId,
  isCodeApiJwtAuthEnabled,
} from '~/auth/codeapi';
import { getAppConfigOptionsFromUser } from '~/app/service';
import {
  CodeEnvironmentSettingsValidationError,
  validateCodeEnvironmentUserSettings,
} from './settings';

type Registry = {
  register: (params: {
    actor: CodeEnvironmentPrincipalContext;
    environment: CodeEnvironmentRegistration;
    maxOwned?: number;
  }) => Promise<CodeEnvironmentSummary>;
  listAccessible: (actor: CodeEnvironmentPrincipalContext) => Promise<CodeEnvironmentSummary[]>;
  listAccessibleDetails?: (
    actor: CodeEnvironmentPrincipalContext,
  ) => Promise<AccessibleCodeEnvironmentDetails>;
  listAccessibleConfigurations?: (
    actor: CodeEnvironmentPrincipalContext,
  ) => Promise<AccessibleCodeEnvironmentConfiguration[]>;
  updateSettings?: (params: {
    actor: CodeEnvironmentPrincipalContext;
    environmentId: string;
    settings: import('librechat-data-provider').CodeEnvironmentUserSettings;
  }) => Promise<CodeEnvironmentSummary | null>;
  remove: (params: {
    actor: CodeEnvironmentPrincipalContext;
    environmentId: string;
    beforeDelete?: (target: CodeEnvironmentLifecycleTarget) => Promise<void>;
  }) => Promise<CodeEnvironmentSummary | null>;
  markRevocationPending?: (environmentId: string) => Promise<void>;
};

type StatefulCodeConfig = NonNullable<
  NonNullable<AppConfig['endpoints']>[EModelEndpoint.agents]
>['statefulCodeSessions'];
type ConfiguredCodeEnvironment = NonNullable<
  NonNullable<StatefulCodeConfig>['environments']
>[number];

export interface CodeEnvironmentHttpDeps {
  getAppConfig: (options: GetAppConfigOptions) => Promise<AppConfig>;
  registry: Registry;
  createEnvironmentId?: () => string;
  readSecret?: (name: string) => string | undefined;
  resolveTenantId?: (req: ServerRequest) => string;
  principalAuthEnabled?: () => boolean;
  principalAuthReady?: () => Promise<void> | void;
  principalIsActive?: (userId: string) => Promise<boolean>;
  maxPrincipalEnvironments?: number;
  fetchImpl?: CodeBridgeFetch;
}

function actor(req: ServerRequest): CodeEnvironmentPrincipalContext | null {
  if (!req.user?.id) return null;
  return {
    userId: req.user.id,
    role: req.user.role ?? null,
    idOnTheSource: req.user.idOnTheSource ?? null,
  };
}

function configuredControlPlane(
  appConfig: AppConfig,
  controlPlaneId: string,
): ConfiguredCodeEnvironment | undefined {
  return appConfig.endpoints?.[EModelEndpoint.agents]?.statefulCodeSessions?.environments?.find(
    (environment) =>
      environment.id === controlPlaneId &&
      environment.type === 'attached' &&
      environment.owner === 'deployment' &&
      environment.pairing?.workerId != null,
  );
}

function configuredPrincipalControlPlane(
  appConfig: AppConfig,
  controlPlaneId: string,
): ConfiguredCodeEnvironment | undefined {
  return appConfig.endpoints?.[EModelEndpoint.agents]?.statefulCodeSessions?.environments?.find(
    (environment) =>
      environment.id === controlPlaneId &&
      environment.type === 'attached' &&
      environment.owner === 'deployment' &&
      environment.pairing?.allowPrincipalWorkers === true,
  );
}

function principalControlPlanes(appConfig: AppConfig): Array<{
  id: string;
  name: string;
  configSchema?: ConfiguredCodeEnvironment['configSchema'];
}> {
  return (
    appConfig.endpoints?.[EModelEndpoint.agents]?.statefulCodeSessions?.environments
      ?.filter(
        (environment) =>
          environment.type === 'attached' &&
          environment.owner === 'deployment' &&
          environment.pairing?.allowPrincipalWorkers === true,
      )
      .map(({ id, name, configSchema }) => ({ id, name, configSchema })) ?? []
  );
}

function configuredAttachedControlPlane(
  appConfig: AppConfig,
  controlPlaneId: string,
): ConfiguredCodeEnvironment | undefined {
  return appConfig.endpoints?.[EModelEndpoint.agents]?.statefulCodeSessions?.environments?.find(
    (environment) =>
      environment.id === controlPlaneId &&
      environment.type === 'attached' &&
      environment.owner === 'deployment',
  );
}

class CodeEnvironmentLifecycleHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function pairingErrorResponse(error: unknown, res: Response): Response {
  if (!(error instanceof CodeBridgePairingError)) {
    return res.status(502).json({ error: 'Code API pairing request failed' });
  }
  if (error.reason === 'timeout') {
    return res.status(504).json({ error: 'Code API pairing request timed out' });
  }
  if (error.reason === 'rejected') {
    return res.status(502).json({
      error: 'Code API rejected the pairing request',
      upstreamStatus: error.upstreamStatus,
    });
  }
  return res.status(502).json({
    error:
      error.reason === 'invalid'
        ? 'Code API returned an invalid pairing response'
        : 'Code API pairing request failed',
  });
}

export function createCodeEnvironmentHttpHandlers(deps: CodeEnvironmentHttpDeps): {
  list: (req: ServerRequest, res: Response) => Promise<Response>;
  register: (req: ServerRequest, res: Response) => Promise<Response>;
  pair: (req: ServerRequest, res: Response) => Promise<Response>;
  updateSettings: (req: ServerRequest, res: Response) => Promise<Response>;
  remove: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const createEnvironmentId = deps.createEnvironmentId ?? (() => `code-${nanoid(20)}`);
  const readSecret = deps.readSecret ?? readCodeBridgeSecret;
  const resolveTenantId = deps.resolveTenantId ?? getCodeApiTenantId;
  const principalAuthEnabled = deps.principalAuthEnabled ?? isCodeApiJwtAuthEnabled;
  const principalAuthReady = deps.principalAuthReady ?? assertCodeApiJwtSigningReady;
  const principalIsActive = deps.principalIsActive ?? (async () => true);
  const maxPrincipalEnvironments = deps.maxPrincipalEnvironments ?? 5;

  async function list(req: ServerRequest, res: Response): Promise<Response> {
    const principal = actor(req);
    if (principal == null) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    let details: AccessibleCodeEnvironmentDetails;
    let appConfig: AppConfig;
    try {
      [details, appConfig] = await Promise.all([
        deps.registry.listAccessibleDetails?.(principal) ??
          Promise.all([
            deps.registry.listAccessible(principal),
            deps.registry.listAccessibleConfigurations?.(principal) ?? Promise.resolve([]),
          ]).then(([summaries, configurations]) => ({ summaries, configurations })),
        deps.getAppConfig({ ...getAppConfigOptionsFromUser(req.user), failClosed: true }),
      ]);
    } catch (error) {
      logger.error('[codeEnvironments] discovery policy resolution failed:', error);
      return res.status(503).json({ error: 'Code environment policy is unavailable' });
    }
    const configurationById = new Map(
      details.configurations.map((configuration) => [configuration.id, configuration]),
    );
    return res.status(200).json({
      environments: details.summaries.map((environment) => {
        const configuration = configurationById.get(environment.id);
        const controlPlane =
          configuration == null
            ? undefined
            : configuredAttachedControlPlane(appConfig, configuration.controlPlaneId);
        return {
          ...environment,
          configSchema: controlPlane?.configSchema,
          settings: configuration?.settings,
        };
      }),
      controlPlanes: principalAuthEnabled() ? principalControlPlanes(appConfig) : [],
    });
  }

  async function register(req: ServerRequest, res: Response): Promise<Response> {
    const principal = actor(req);
    if (principal == null) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const body =
      typeof req.body === 'object' && req.body != null
        ? (req.body as unknown as Record<string, unknown>)
        : {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const controlPlaneId =
      typeof body.controlPlaneId === 'string' ? body.controlPlaneId.trim() : '';
    if (!name || !controlPlaneId) {
      return res.status(400).json({
        error: 'name and controlPlaneId are required',
      });
    }
    try {
      normalizeCodeEnvironmentName(name);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Code environment name is invalid',
      });
    }

    /** Control-plane destinations are deployment policy. Client-provided URLs
     * are deliberately ignored to prevent an authenticated SSRF primitive. */
    let effectiveConfig: AppConfig;
    let deploymentConfig: AppConfig;
    try {
      [effectiveConfig, deploymentConfig] = await Promise.all([
        deps.getAppConfig({ ...getAppConfigOptionsFromUser(req.user), failClosed: true }),
        deps.getAppConfig({ baseOnly: true }),
      ]);
    } catch (error) {
      logger.error('[codeEnvironments] control-plane policy resolution failed:', error);
      return res.status(503).json({ error: 'Code environment policy is unavailable' });
    }
    const authorizedControlPlane = configuredControlPlane(effectiveConfig, controlPlaneId);
    const controlPlane = configuredControlPlane(deploymentConfig, controlPlaneId);
    if (authorizedControlPlane == null || controlPlane == null) {
      return res.status(404).json({ error: 'Code control plane was not found' });
    }

    let activeBeforeRegistration: boolean;
    try {
      activeBeforeRegistration = await principalIsActive(principal.userId.toString());
    } catch (error) {
      logger.error('[codeEnvironments] pre-registration principal check failed:', error);
      return res.status(503).json({ error: 'Account status could not be confirmed' });
    }
    if (!activeBeforeRegistration) {
      return res.status(409).json({ error: 'Account deletion is already in progress' });
    }

    try {
      const environment = await deps.registry.register({
        actor: principal,
        environment: {
          id: createEnvironmentId(),
          name,
          type: 'attached',
          baseURL: controlPlane.baseURL,
          workerId: controlPlane.pairing?.workerId,
          controlPlaneId: controlPlane.id,
          workerPrincipal: { type: 'deployment', id: controlPlane.id },
        },
      });
      let activeAfterRegistration = false;
      let principalCheckUnavailable = false;
      try {
        activeAfterRegistration = await principalIsActive(principal.userId.toString());
      } catch (error) {
        principalCheckUnavailable = true;
        logger.error('[codeEnvironments] post-registration principal check failed:', error);
      }
      if (!activeAfterRegistration) {
        await deps.registry.remove({ actor: principal, environmentId: environment.id });
        return principalCheckUnavailable
          ? res.status(503).json({ error: 'Account status could not be confirmed' })
          : res.status(409).json({ error: 'Account deletion is already in progress' });
      }
      return res.status(201).json({ environment });
    } catch (error) {
      const duplicate =
        typeof error === 'object' &&
        error != null &&
        'code' in error &&
        (error as { code?: number }).code === 11000;
      if (duplicate) {
        return res.status(409).json({ error: 'Code environment already exists' });
      }
      if (error instanceof CodeEnvironmentValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('[codeEnvironments] registration failed:', error);
      return res.status(500).json({ error: 'Code environment registration failed' });
    }
  }

  async function pair(req: ServerRequest, res: Response): Promise<Response> {
    const principal = actor(req);
    if (principal == null) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!principalAuthEnabled()) {
      return res.status(409).json({
        error: 'Principal code workers require Code API JWT authentication',
      });
    }
    const body =
      typeof req.body === 'object' && req.body != null
        ? (req.body as unknown as Record<string, unknown>)
        : {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const controlPlaneId =
      typeof body.controlPlaneId === 'string' ? body.controlPlaneId.trim() : '';
    if (!name || !controlPlaneId) {
      return res.status(400).json({ error: 'name and controlPlaneId are required' });
    }
    try {
      normalizeCodeEnvironmentName(name);
    } catch (error) {
      return res.status(400).json({
        error: error instanceof Error ? error.message : 'Code environment name is invalid',
      });
    }
    try {
      await principalAuthReady();
    } catch (error) {
      logger.error('[codeEnvironments] Code API JWT signing is unavailable:', error);
      return res.status(503).json({ error: 'Principal code worker authentication is unavailable' });
    }

    let effectiveConfig: AppConfig;
    let deploymentConfig: AppConfig;
    try {
      [effectiveConfig, deploymentConfig] = await Promise.all([
        deps.getAppConfig({ ...getAppConfigOptionsFromUser(req.user), failClosed: true }),
        deps.getAppConfig({ baseOnly: true }),
      ]);
    } catch (error) {
      logger.error('[codeEnvironments] pairing policy resolution failed:', error);
      return res.status(503).json({ error: 'Code environment pairing policy is unavailable' });
    }
    const authorizedControlPlane = configuredPrincipalControlPlane(effectiveConfig, controlPlaneId);
    const controlPlane = configuredPrincipalControlPlane(deploymentConfig, controlPlaneId);
    if (authorizedControlPlane == null || controlPlane == null) {
      return res.status(404).json({ error: 'Principal code control plane was not found' });
    }
    const tokenEnv = controlPlane.pairing?.tokenEnv;
    const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
    if (!token) {
      return res.status(503).json({ error: 'Code environment pairing is not configured' });
    }

    const workerId = createEnvironmentId();
    let activeBeforePairing: boolean;
    try {
      activeBeforePairing = await principalIsActive(principal.userId.toString());
    } catch (error) {
      logger.error('[codeEnvironments] pre-pairing principal check failed:', error);
      return res.status(503).json({ error: 'Account status could not be confirmed' });
    }
    if (!activeBeforePairing) {
      return res.status(409).json({ error: 'Account deletion is already in progress' });
    }
    let pairing;
    try {
      pairing = await createCodeBridgePairing({
        baseURL: controlPlane.baseURL,
        token,
        workerId,
        binding: {
          tenantId: resolveTenantId(req),
          principal: { type: 'user', id: principal.userId.toString() },
        },
        fetchImpl: deps.fetchImpl,
      });
    } catch (error) {
      return pairingErrorResponse(error, res);
    }

    let activeAfterPairing = false;
    let principalCheckUnavailable = false;
    try {
      activeAfterPairing = await principalIsActive(principal.userId.toString());
    } catch (error) {
      principalCheckUnavailable = true;
      logger.error('[codeEnvironments] post-pairing principal check failed:', error);
    }
    if (!activeAfterPairing) {
      try {
        await revokeCodeBridgeWorker({
          baseURL: controlPlane.baseURL,
          token,
          workerId,
          fetchImpl: deps.fetchImpl,
        });
      } catch (error) {
        logger.error('[codeEnvironments] orphaned pairing compensation failed:', error);
        return res.status(502).json({ error: 'Code worker pairing could not be compensated' });
      }
      return principalCheckUnavailable
        ? res.status(503).json({ error: 'Account status could not be confirmed' })
        : res.status(409).json({ error: 'Account deletion is already in progress' });
    }

    let registrationCommitted = false;
    try {
      const environment = await deps.registry.register({
        actor: principal,
        maxOwned: maxPrincipalEnvironments,
        environment: {
          id: workerId,
          name,
          type: 'attached',
          baseURL: controlPlane.baseURL,
          workerId,
          controlPlaneId: controlPlane.id,
          revocationTokenEnv: tokenEnv,
          workerPrincipal: { type: 'user', id: principal.userId.toString() },
        },
      });
      registrationCommitted = true;
      let activeAfterRegistration = false;
      try {
        activeAfterRegistration = await principalIsActive(principal.userId.toString());
      } catch (error) {
        logger.error('[codeEnvironments] post-registration principal check failed:', error);
      }
      if (!activeAfterRegistration) {
        const removed = await deps.registry.remove({
          actor: principal,
          environmentId: workerId,
          beforeDelete: async () => {
            await revokeCodeBridgeWorker({
              baseURL: controlPlane.baseURL,
              token,
              workerId,
              fetchImpl: deps.fetchImpl,
            });
          },
        });
        if (removed == null) {
          await revokeCodeBridgeWorker({
            baseURL: controlPlane.baseURL,
            token,
            workerId,
            fetchImpl: deps.fetchImpl,
          });
        }
        return res.status(409).json({ error: 'Account is unavailable for code worker pairing' });
      }
      return res.status(201).json({
        environment,
        pairing: {
          workerId: pairing.workerId,
          code: pairing.code,
          expiresAt: pairing.expiresAt,
          endpoint: controlPlane.baseURL,
        },
      });
    } catch (error) {
      if (registrationCommitted) {
        try {
          if (deps.registry.markRevocationPending == null) {
            throw new Error('Code environment cleanup scheduling is unavailable');
          }
          await deps.registry.markRevocationPending(workerId);
        } catch (markerError) {
          logger.error('[codeEnvironments] failed to persist pairing cleanup intent:', markerError);
          return res.status(503).json({ error: 'Code environment cleanup could not be scheduled' });
        }
      }
      try {
        await revokeCodeBridgeWorker({
          baseURL: controlPlane.baseURL,
          token,
          workerId,
          fetchImpl: deps.fetchImpl,
        });
      } catch {
        return res.status(502).json({
          error: 'Code environment registration failed and its pairing could not be revoked',
        });
      }
      const duplicate =
        typeof error === 'object' &&
        error != null &&
        'code' in error &&
        (error as { code?: number }).code === 11000;
      if (duplicate) {
        return res.status(409).json({ error: 'Code environment already exists' });
      }
      if (error instanceof CodeEnvironmentLimitError) {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof CodeEnvironmentValidationError) {
        return res.status(400).json({ error: error.message });
      }
      logger.error('[codeEnvironments] pairing registration failed:', error);
      return res.status(500).json({ error: 'Code environment registration failed' });
    }
  }

  async function updateSettings(req: ServerRequest, res: Response): Promise<Response> {
    const principal = actor(req);
    if (principal == null) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const environmentId = (
      req.params as { environmentId?: string } | undefined
    )?.environmentId?.trim();
    if (!environmentId) {
      return res.status(400).json({ error: 'Code environment id is required' });
    }
    let appConfig: AppConfig;
    let configurations: AccessibleCodeEnvironmentConfiguration[];
    try {
      [appConfig, configurations] = await Promise.all([
        deps.getAppConfig({ ...getAppConfigOptionsFromUser(req.user), failClosed: true }),
        deps.registry.listAccessibleConfigurations?.(principal) ?? Promise.resolve([]),
      ]);
    } catch (error) {
      logger.error('[codeEnvironments] settings policy resolution failed:', error);
      return res.status(503).json({ error: 'Code environment policy is unavailable' });
    }
    const configuration = configurations.find(({ id }) => id === environmentId);
    const controlPlane =
      configuration == null
        ? undefined
        : configuredAttachedControlPlane(appConfig, configuration.controlPlaneId);
    if (configuration == null || controlPlane == null) {
      return res.status(404).json({ error: 'Code environment was not found' });
    }
    let settings;
    try {
      const body =
        typeof req.body === 'object' && req.body != null
          ? (req.body as unknown as { settings?: unknown })
          : {};
      settings = validateCodeEnvironmentUserSettings(controlPlane.configSchema, body.settings);
    } catch (error) {
      if (error instanceof CodeEnvironmentSettingsValidationError) {
        return res.status(400).json({ error: error.message });
      }
      throw error;
    }
    if (deps.registry.updateSettings == null) {
      return res.status(503).json({ error: 'Code environment settings are unavailable' });
    }
    const environment = await deps.registry.updateSettings({
      actor: principal,
      environmentId,
      settings,
    });
    if (environment == null) {
      return res.status(404).json({ error: 'Code environment was not found' });
    }
    return res.status(200).json({
      environment: {
        ...environment,
        configSchema: controlPlane.configSchema,
        settings: environment.settings ?? settings,
      },
    });
  }

  async function remove(req: ServerRequest, res: Response): Promise<Response> {
    const principal = actor(req);
    if (principal == null) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const params = req.params as Record<string, unknown>;
    const environmentId = typeof params.environmentId === 'string' ? params.environmentId : '';
    if (!environmentId) {
      return res.status(400).json({ error: 'Code environment id is required' });
    }
    try {
      const environment = await deps.registry.remove({
        actor: principal,
        environmentId,
        beforeDelete: async (target) => {
          if (target.workerPrincipal?.type !== 'user' || target.workerId == null) return;
          const tokenEnv = target.revocationTokenEnv;
          const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
          if (!token) {
            throw new CodeEnvironmentLifecycleHttpError(
              503,
              'Code environment revocation is not configured',
            );
          }
          await revokeCodeBridgeWorker({
            baseURL: target.baseURL,
            token,
            workerId: target.workerId,
            fetchImpl: deps.fetchImpl,
          });
        },
      });
      if (environment == null) {
        return res.status(404).json({ error: 'Code environment was not found' });
      }
      return res.status(200).json({ environment });
    } catch (error) {
      if (error instanceof CodeEnvironmentLifecycleHttpError) {
        return res.status(error.status).json({ error: error.message });
      }
      if (error instanceof CodeEnvironmentInUseError) {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof CodeBridgeLifecycleError) {
        return res.status(error.reason === 'timeout' ? 504 : 502).json({
          error: 'Code environment worker could not be revoked',
          ...(error.upstreamStatus != null ? { upstreamStatus: error.upstreamStatus } : {}),
        });
      }
      throw error;
    }
  }

  return { list, register, pair, updateSettings, remove };
}

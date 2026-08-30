import { nanoid } from 'nanoid';
import { EModelEndpoint } from 'librechat-data-provider';
import { logger, type AppConfig } from '@librechat/data-schemas';
import type { Response } from 'express';
import type {
  CodeEnvironmentPrincipalContext,
  CodeEnvironmentRegistration,
  CodeEnvironmentSummary,
} from './environments';
import type { GetAppConfigOptions } from '~/app/service';
import type { ServerRequest } from '~/types/http';
import type { CodeBridgeFetch } from './bridge';
import { CodeBridgePairingError, createCodeBridgePairing, readCodeBridgeSecret } from './bridge';
import { CodeEnvironmentValidationError, normalizeCodeEnvironmentName } from './environments';
import { getCodeApiTenantId } from '~/auth/codeapi';

type Registry = {
  register: (params: {
    actor: CodeEnvironmentPrincipalContext;
    environment: CodeEnvironmentRegistration;
  }) => Promise<CodeEnvironmentSummary>;
  listAccessible: (actor: CodeEnvironmentPrincipalContext) => Promise<CodeEnvironmentSummary[]>;
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
} {
  const createEnvironmentId = deps.createEnvironmentId ?? (() => `code-${nanoid(20)}`);
  const readSecret = deps.readSecret ?? readCodeBridgeSecret;
  const resolveTenantId = deps.resolveTenantId ?? getCodeApiTenantId;

  async function list(req: ServerRequest, res: Response): Promise<Response> {
    const principal = actor(req);
    if (principal == null) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const environments = await deps.registry.listAccessible(principal);
    return res.status(200).json({ environments });
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
    const appConfig = await deps.getAppConfig({ baseOnly: true });
    const controlPlane = configuredControlPlane(appConfig, controlPlaneId);
    if (controlPlane == null) {
      return res.status(404).json({ error: 'Code control plane was not found' });
    }

    try {
      const environment = await deps.registry.register({
        actor: principal,
        environment: {
          id: createEnvironmentId(),
          name,
          type: 'attached',
          baseURL: controlPlane.baseURL,
          controlPlaneId,
          workerId: controlPlane.pairing?.workerId,
          workerPrincipal: { type: 'deployment', id: controlPlane.id },
        },
      });
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
    const body = req.body as unknown as Record<string, unknown>;
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

    const appConfig = await deps.getAppConfig({ baseOnly: true });
    const controlPlane = configuredPrincipalControlPlane(appConfig, controlPlaneId);
    if (controlPlane == null) {
      return res.status(404).json({ error: 'Principal code control plane was not found' });
    }
    const tokenEnv = controlPlane.pairing?.tokenEnv;
    const token = tokenEnv != null ? readSecret(tokenEnv)?.trim() : undefined;
    if (!token) {
      return res.status(503).json({ error: 'Code environment pairing is not configured' });
    }

    const workerId = createEnvironmentId();
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

    try {
      const environment = await deps.registry.register({
        actor: principal,
        environment: {
          id: workerId,
          name,
          type: 'attached',
          baseURL: controlPlane.baseURL,
          workerId,
          workerPrincipal: { type: 'user', id: principal.userId.toString() },
        },
      });
      return res.status(201).json({
        environment,
        pairing: {
          workerId: pairing.workerId,
          code: pairing.code,
          expiresAt: pairing.expiresAt,
        },
      });
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
      logger.error('[codeEnvironments] pairing registration failed:', error);
      return res.status(500).json({ error: 'Code environment registration failed' });
    }
  }

  return { list, register, pair };
}

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
import { CodeEnvironmentValidationError } from './environments';

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
      environment.pairing != null,
  );
}

export function createCodeEnvironmentHttpHandlers(deps: CodeEnvironmentHttpDeps): {
  list: (req: ServerRequest, res: Response) => Promise<Response>;
  register: (req: ServerRequest, res: Response) => Promise<Response>;
} {
  const createEnvironmentId = deps.createEnvironmentId ?? (() => `code-${nanoid(20)}`);

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

  return { list, register };
}

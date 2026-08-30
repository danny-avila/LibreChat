import { Types } from 'mongoose';
import { createHash, randomUUID } from 'node:crypto';
import { createMethods, getTenantId, logger } from '@librechat/data-schemas';
import {
  AccessRoleIds,
  PermissionBits,
  PrincipalType,
  ResourceType,
  isSecureCodeEnvironmentControlURL,
} from 'librechat-data-provider';
import type { ResolvedPrincipal } from '~/types/principal';
import { AccessControlService } from '~/acl/accessControlService';

export type CodeEnvironmentPrincipalContext = {
  userId: string | Types.ObjectId;
  role?: string | null;
  idOnTheSource?: string | null;
  principals?: ResolvedPrincipal[];
};

export type CodeEnvironmentSummary = {
  resourceId: string;
  id: string;
  name: string;
  type: 'managed' | 'attached';
};

export type CodeEnvironmentRegistration = {
  id: string;
  name: string;
  type: 'managed' | 'attached';
  baseURL: string;
  controlPlaneId: string;
  workerId?: string;
};

export type AccessibleCodeEnvironmentConfiguration = {
  id: string;
  name: string;
  type: 'managed' | 'attached';
  baseURL: string;
  controlPlaneId: string;
  owner: 'principal';
  workerId?: string;
};

type CachedAccessibleCodeEnvironmentConfiguration = AccessibleCodeEnvironmentConfiguration & {
  resourceId: string;
};

const ENVIRONMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WORKER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONFIGURATION_CACHE_TTL_MS = 5_000;
const CONFIGURATION_CACHE_REVISION_PREFIX = 'revision';
const CONFIGURATION_CACHE_REGISTERED_PREFIX = 'registered';
const CONFIGURATION_CACHE_USER_PREFIX = 'user';

type CodeEnvironmentConfigurationCache = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown, ttl?: number) => Promise<unknown>;
};

type CodeEnvironmentRegistryOptions = {
  /** Shared cache only. Omit this dependency when Redis is unavailable so ACL reads stay live. */
  configurationCache?: CodeEnvironmentConfigurationCache;
};

export class CodeEnvironmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodeEnvironmentValidationError';
  }
}

function normalizeRegistration(input: CodeEnvironmentRegistration): CodeEnvironmentRegistration {
  const id = input.id.trim();
  const name = input.name.trim();
  const baseURL = input.baseURL.trim().replace(/\/+$/, '');
  const controlPlaneId = input.controlPlaneId.trim();
  const workerId = input.workerId?.trim();
  if (!ENVIRONMENT_ID_PATTERN.test(id)) {
    throw new CodeEnvironmentValidationError('Code environment id is invalid');
  }
  if (name.length < 1 || name.length > 100) {
    throw new CodeEnvironmentValidationError(
      'Code environment name must contain between 1 and 100 characters',
    );
  }
  if (!isSecureCodeEnvironmentControlURL(baseURL)) {
    throw new CodeEnvironmentValidationError('Code environment control requires secure transport');
  }
  if (!ENVIRONMENT_ID_PATTERN.test(controlPlaneId)) {
    throw new CodeEnvironmentValidationError('Code environment control plane id is invalid');
  }
  if (workerId != null && !WORKER_ID_PATTERN.test(workerId)) {
    throw new CodeEnvironmentValidationError('Code environment worker id is invalid');
  }
  return { ...input, id, name, baseURL, controlPlaneId, workerId };
}

function toSummary(environment: {
  _id: Types.ObjectId;
  environmentId: string;
  name: string;
  type: 'managed' | 'attached';
}): CodeEnvironmentSummary {
  return {
    resourceId: environment._id.toString(),
    id: environment.environmentId,
    name: environment.name,
    type: environment.type,
  };
}

export function createCodeEnvironmentRegistry(
  mongoose: typeof import('mongoose'),
  options: CodeEnvironmentRegistryOptions = {},
): {
  register: (params: {
    actor: CodeEnvironmentPrincipalContext;
    environment: CodeEnvironmentRegistration;
  }) => Promise<CodeEnvironmentSummary>;
  listAccessible: (actor: CodeEnvironmentPrincipalContext) => Promise<CodeEnvironmentSummary[]>;
  listAccessibleConfigurations: (
    actor: CodeEnvironmentPrincipalContext,
  ) => Promise<AccessibleCodeEnvironmentConfiguration[]>;
  listRegisteredIds: () => Promise<string[]>;
  invalidateAccessibleConfigurations: (tenantId?: string) => Promise<void>;
} {
  const methods = createMethods(mongoose);
  const access = new AccessControlService(mongoose);
  const configurationCache = options.configurationCache;

  function tenantCacheKey(tenantId?: string): string {
    return encodeURIComponent(tenantId ?? getTenantId() ?? '__default__');
  }

  function revisionKey(tenantId?: string): string {
    return `${CONFIGURATION_CACHE_REVISION_PREFIX}:${tenantCacheKey(tenantId)}`;
  }

  async function invalidateAccessibleConfigurations(tenantId?: string): Promise<void> {
    if (configurationCache == null) return;
    await configurationCache.set(revisionKey(tenantId), randomUUID());
  }

  async function listRegisteredIds(): Promise<string[]> {
    if (configurationCache == null) return await methods.listCodeEnvironmentIds();

    const tenant = tenantCacheKey();
    const revision = String((await configurationCache.get(revisionKey())) ?? '0');
    const key = `${CONFIGURATION_CACHE_REGISTERED_PREFIX}:${tenant}:${revision}`;
    const cached = await configurationCache.get(key);
    if (
      Array.isArray(cached) &&
      cached.every((environmentId) => typeof environmentId === 'string')
    ) {
      return cached;
    }

    const environmentIds = await methods.listCodeEnvironmentIds();
    const currentRevision = String((await configurationCache.get(revisionKey())) ?? '0');
    if (currentRevision !== revision) {
      return await listRegisteredIds();
    }
    await configurationCache.set(key, environmentIds, CONFIGURATION_CACHE_TTL_MS);
    return environmentIds;
  }

  async function register({
    actor,
    environment: input,
  }: {
    actor: CodeEnvironmentPrincipalContext;
    environment: CodeEnvironmentRegistration;
  }): Promise<CodeEnvironmentSummary> {
    const environment = normalizeRegistration(input);
    const created = await methods.createCodeEnvironment({
      environmentId: environment.id,
      name: environment.name,
      type: environment.type,
      baseURL: environment.baseURL,
      controlPlaneId: environment.controlPlaneId,
      workerId: environment.workerId,
      createdBy: new Types.ObjectId(actor.userId),
    });
    try {
      const permission = await access.grantPermission({
        principalType: PrincipalType.USER,
        principalId: actor.userId,
        resourceType: ResourceType.CODE_ENVIRONMENT,
        resourceId: created._id,
        accessRoleId: AccessRoleIds.CODE_ENVIRONMENT_OWNER,
        grantedBy: actor.userId,
      });
      if (permission == null) {
        throw new Error('Unable to grant code environment ownership');
      }
      const summary = toSummary(created);
      await invalidateAccessibleConfigurations();
      return summary;
    } catch (error) {
      const cleanup = await Promise.allSettled([
        access.removeAllPermissions({
          resourceType: ResourceType.CODE_ENVIRONMENT,
          resourceId: created._id,
        }),
        methods.deleteCodeEnvironmentById(created._id),
      ]);
      for (const result of cleanup) {
        if (result.status === 'rejected') {
          logger.error('[codeEnvironments] registration rollback failed:', result.reason);
        }
      }
      throw error;
    }
  }

  async function findAccessibleResourceIds(principals: ResolvedPrincipal[]) {
    return await access.findAccessibleResourcesForPrincipals({
      principalsList: principals,
      resourceType: ResourceType.CODE_ENVIRONMENT,
      requiredPermissions: PermissionBits.VIEW,
    });
  }

  async function findAccessible(actor: CodeEnvironmentPrincipalContext) {
    const principals = actor.principals ?? (await methods.getUserPrincipals(actor));
    const ids = await findAccessibleResourceIds(principals);
    return await methods.findCodeEnvironmentsByIds(ids);
  }

  async function listAccessible(
    actor: CodeEnvironmentPrincipalContext,
  ): Promise<CodeEnvironmentSummary[]> {
    const environments = await findAccessible(actor);
    return environments.map(toSummary);
  }

  async function listAccessibleConfigurations(
    actor: CodeEnvironmentPrincipalContext,
  ): Promise<AccessibleCodeEnvironmentConfiguration[]> {
    const principals = actor.principals ?? (await methods.getUserPrincipals(actor));
    const principalFingerprint = createHash('sha256')
      .update(
        principals
          .map(
            ({ principalType, principalId }) => `${principalType}:${principalId?.toString() ?? ''}`,
          )
          .sort()
          .join('\n'),
      )
      .digest('base64url');
    const toPublicConfiguration = ({
      resourceId: _resourceId,
      ...configuration
    }: CachedAccessibleCodeEnvironmentConfiguration): AccessibleCodeEnvironmentConfiguration =>
      configuration;
    const load = async (): Promise<CachedAccessibleCodeEnvironmentConfiguration[]> => {
      const ids = await findAccessibleResourceIds(principals);
      const environments = await methods.findCodeEnvironmentsByIds(ids);
      return environments.map((environment) => ({
        resourceId: environment._id.toString(),
        id: environment.environmentId,
        name: environment.name,
        type: environment.type,
        baseURL: environment.baseURL,
        controlPlaneId: environment.controlPlaneId,
        owner: 'principal',
        workerId: environment.workerId,
      }));
    };
    if (configurationCache == null) return (await load()).map(toPublicConfiguration);

    const tenant = tenantCacheKey();
    const revision = String((await configurationCache.get(revisionKey())) ?? '0');
    const key =
      `${CONFIGURATION_CACHE_USER_PREFIX}:${tenant}:${actor.userId.toString()}:` +
      `${principalFingerprint}:${revision}`;
    const cached = await configurationCache.get(key);
    if (
      Array.isArray(cached) &&
      cached.every(
        (configuration) =>
          configuration != null &&
          typeof configuration === 'object' &&
          typeof (configuration as { resourceId?: unknown }).resourceId === 'string',
      )
    ) {
      // The cache accelerates configuration lookup, not authorization. Re-check the current
      // ACL on every use so a failed revision write can delay grants but can never preserve a
      // revocation. Entries written before resourceId was cached are deliberately treated as
      // misses during rolling upgrades.
      const accessibleIds = new Set(
        (await findAccessibleResourceIds(principals)).map((id) => id.toString()),
      );
      return (cached as CachedAccessibleCodeEnvironmentConfiguration[])
        .filter(({ resourceId }) => accessibleIds.has(resourceId))
        .map(toPublicConfiguration);
    }

    const configurations = await load();
    const currentRevision = String((await configurationCache.get(revisionKey())) ?? '0');
    if (currentRevision !== revision) {
      return await listAccessibleConfigurations(actor);
    }
    await configurationCache.set(key, configurations, CONFIGURATION_CACHE_TTL_MS);
    return configurations.map(toPublicConfiguration);
  }

  return {
    register,
    listAccessible,
    listAccessibleConfigurations,
    listRegisteredIds,
    invalidateAccessibleConfigurations,
  };
}

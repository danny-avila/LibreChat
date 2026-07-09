import { z } from 'zod';
import { Types } from 'mongoose';
import { AccessRoleIds, ResourceType, PrincipalType } from 'librechat-data-provider';
import { logger, runAsSystem, tenantStorage, extractMCPServerNames } from '@librechat/data-schemas';
import type {
  IAgent,
  IAccessRole,
  AclEntryMethods,
  AccessRoleMethods,
} from '@librechat/data-schemas';
import type { TGlobalAgent, TGlobalAgentAccess } from 'librechat-data-provider';
import type { Model, FilterQuery } from 'mongoose';
import { agentCreateSchema } from './validation';

/** Zero ObjectId used as the author of config-defined system agents (no human owner). */
const SYSTEM_USER_ID = '000000000000000000000000';

/** User/group principals in the config must be 24-char ObjectId hex; grantPermission casts them. */
const OBJECT_ID_RE = /^[a-f\d]{24}$/i;

type AgentCreateData = z.infer<typeof agentCreateSchema>;

/** DB methods the reconciler needs, injected from `/api` (mirrors `migration.ts`). */
export interface GlobalAgentMethods {
  findRoleByIdentifier: AccessRoleMethods['findRoleByIdentifier'];
  grantPermission: AclEntryMethods['grantPermission'];
  findEntriesByResource: AclEntryMethods['findEntriesByResource'];
  deleteAclEntries: AclEntryMethods['deleteAclEntries'];
}

export interface ReconcileGlobalAgentsParams {
  globalAgents?: TGlobalAgent[] | null;
  methods: GlobalAgentMethods;
  AgentModel: Model<IAgent>;
}

type AgentScope = 'system' | 'tenant';

interface ParsedGlobalAgent {
  id: string;
  access?: TGlobalAgentAccess;
  tenants: 'system' | string[];
  agentData: AgentCreateData;
}

interface DesiredPrincipal {
  type: PrincipalType;
  principalId: string | null;
  accessRoleId: string;
}

interface ReconcileScopeParams {
  entries: ParsedGlobalAgent[];
  scope: AgentScope;
  methods: GlobalAgentMethods;
  AgentModel: Model<IAgent>;
  roleCache: Map<string, IAccessRole | null>;
}

/** Validate one config entry: split control fields off, validate the agent body with the same
 *  `agentCreateSchema` the UI posts to `POST /agents`. Returns `null` (logged) on invalid entries. */
function validateEntry(raw: TGlobalAgent): ParsedGlobalAgent | null {
  const { id, access, tenants, ...body } = raw;
  try {
    const agentData = agentCreateSchema.parse(body);
    return { id, access, tenants: tenants ?? 'system', agentData };
  } catch (error) {
    logger.error(`[GlobalAgents] Skipping invalid global agent "${id}":`, error);
    return null;
  }
}

function principalKey(type: string, principalId: string | null): string {
  return `${type}:${principalId ?? ''}`;
}

/** Translate the config visibility spec into the desired ACL principal grants. */
function buildDesiredPrincipals(access?: TGlobalAgentAccess): DesiredPrincipal[] {
  if (!access) {
    return [];
  }
  const accessRoleId =
    access.level === 'editor' ? AccessRoleIds.AGENT_EDITOR : AccessRoleIds.AGENT_VIEWER;
  const principals: DesiredPrincipal[] = [];
  if (access.public === true) {
    principals.push({ type: PrincipalType.PUBLIC, principalId: null, accessRoleId });
  }
  for (const role of access.roles ?? []) {
    principals.push({ type: PrincipalType.ROLE, principalId: role, accessRoleId });
  }
  for (const group of access.groups ?? []) {
    if (!OBJECT_ID_RE.test(group)) {
      logger.warn(
        `[GlobalAgents] Ignoring invalid group id "${group}" (expected a 24-char ObjectId).`,
      );
      continue;
    }
    principals.push({ type: PrincipalType.GROUP, principalId: group, accessRoleId });
  }
  for (const user of access.users ?? []) {
    if (!OBJECT_ID_RE.test(user)) {
      logger.warn(
        `[GlobalAgents] Ignoring invalid user id "${user}" (expected a 24-char ObjectId).`,
      );
      continue;
    }
    principals.push({ type: PrincipalType.USER, principalId: user, accessRoleId });
  }
  return principals;
}

/** System-scope rows are tenantless (`$exists: false`); tenant-scope rows are matched by id and the
 *  tenant-isolation plugin injects the tenantId equality for the active context. */
function buildAgentFilter(id: string, scope: AgentScope): FilterQuery<IAgent> {
  return scope === 'system' ? { id, tenantId: { $exists: false } } : { id };
}

/** Idempotent upsert of the agent doc. `$set` merges the config body so operators can override
 *  specific fields; `author`/`isSystem` are always enforced. Returns the resource `_id`. */
async function upsertAgent({
  AgentModel,
  entry,
  scope,
}: {
  AgentModel: Model<IAgent>;
  entry: ParsedGlobalAgent;
  scope: AgentScope;
}): Promise<Types.ObjectId | null> {
  const now = new Date();
  const doc = await AgentModel.findOneAndUpdate(
    buildAgentFilter(entry.id, scope),
    {
      $set: {
        ...entry.agentData,
        isSystem: true,
        /* The direct upsert skips createAgent's derivation, so keep mcpServerNames in sync with
         * tools — the MCP registry exposes servers to users via shared agents through this field. */
        mcpServerNames: extractMCPServerNames(entry.agentData.tools),
        author: new Types.ObjectId(SYSTEM_USER_ID),
      },
      $setOnInsert: { id: entry.id, createdAt: now },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  )
    .select('_id')
    .lean<{ _id: Types.ObjectId }>();
  return doc?._id ?? null;
}

async function resolveRole(
  methods: GlobalAgentMethods,
  roleCache: Map<string, IAccessRole | null>,
  accessRoleId: string,
): Promise<IAccessRole | null> {
  if (roleCache.has(accessRoleId)) {
    return roleCache.get(accessRoleId) ?? null;
  }
  /* Default access roles are seeded tenantless; AccessRole is tenant-isolated, so a lookup inside a
   * tenant context misses them. Always resolve under the system context regardless of agent scope. */
  const role = await runAsSystem(() => methods.findRoleByIdentifier(accessRoleId));
  roleCache.set(accessRoleId, role);
  return role;
}

/** Grant the desired principals and revoke any existing grant no longer in the config. */
async function reconcileGrants({
  methods,
  resourceId,
  access,
  roleCache,
}: {
  methods: GlobalAgentMethods;
  resourceId: Types.ObjectId;
  access?: TGlobalAgentAccess;
  roleCache: Map<string, IAccessRole | null>;
}): Promise<void> {
  const desired = buildDesiredPrincipals(access);
  const desiredKeys = new Set<string>();

  for (const principal of desired) {
    const role = await resolveRole(methods, roleCache, principal.accessRoleId);
    if (!role) {
      logger.warn(
        `[GlobalAgents] Access role "${principal.accessRoleId}" not found; skipping grant.`,
      );
      continue;
    }
    desiredKeys.add(principalKey(principal.type, principal.principalId));
    await methods.grantPermission(
      principal.type,
      principal.principalId,
      ResourceType.AGENT,
      resourceId,
      role.permBits,
      undefined,
      undefined,
      role._id as Types.ObjectId,
    );
  }

  const existing = await methods.findEntriesByResource(ResourceType.AGENT, resourceId);
  const staleIds = existing
    .filter(
      (entry) =>
        !desiredKeys.has(
          principalKey(entry.principalType, entry.principalId ? String(entry.principalId) : null),
        ),
    )
    .map((entry) => entry._id);

  if (staleIds.length > 0) {
    await methods.deleteAclEntries({ _id: { $in: staleIds } });
  }
}

/** Soft-retire seeded agents no longer present in config: revoke every grant (invisible to all)
 *  while keeping the doc so chat history survives and re-adding to config re-enables it. */
async function retireOrphans({
  AgentModel,
  methods,
  expectedIds,
  scope,
}: {
  AgentModel: Model<IAgent>;
  methods: GlobalAgentMethods;
  expectedIds: Set<string>;
  scope: AgentScope;
}): Promise<void> {
  const filter: FilterQuery<IAgent> =
    scope === 'system' ? { isSystem: true, tenantId: { $exists: false } } : { isSystem: true };
  const seeded = await AgentModel.find(filter)
    .select('_id id')
    .lean<{ _id: Types.ObjectId; id: string }[]>();

  for (const agent of seeded) {
    if (expectedIds.has(agent.id)) {
      continue;
    }
    await methods.deleteAclEntries({ resourceType: ResourceType.AGENT, resourceId: agent._id });
    logger.info(`[GlobalAgents] Retired global agent no longer in config: ${agent.id}`);
  }
}

async function reconcileScope({
  entries,
  scope,
  methods,
  AgentModel,
  roleCache,
}: ReconcileScopeParams): Promise<void> {
  const expectedIds = new Set(entries.map((entry) => entry.id));
  for (const entry of entries) {
    try {
      const resourceId = await upsertAgent({ AgentModel, entry, scope });
      if (!resourceId) {
        continue;
      }
      await reconcileGrants({ methods, resourceId, access: entry.access, roleCache });
      logger.info(`[GlobalAgents] Reconciled global agent: ${entry.id}`);
    } catch (error) {
      logger.error(`[GlobalAgents] Failed to reconcile global agent "${entry.id}":`, error);
    }
  }
  await retireOrphans({ AgentModel, methods, expectedIds, scope });
}

/**
 * Reconcile config-defined global agents at boot: upsert each to its stable id, reconcile its ACL
 * grants to match the visibility spec, and soft-retire any seeded agent dropped from config.
 * Manages its own tenant contexts — `runAsSystem` for `tenants: 'system'` (a single tenantless row)
 * and a per-tenant context for explicit tenant lists — so callers need not wrap it.
 */
export async function reconcileGlobalAgents({
  globalAgents,
  methods,
  AgentModel,
}: ReconcileGlobalAgentsParams): Promise<void> {
  const entries = (globalAgents ?? [])
    .map(validateEntry)
    .filter((entry): entry is ParsedGlobalAgent => entry !== null);

  const roleCache = new Map<string, IAccessRole | null>();

  const systemEntries = entries.filter((entry) => entry.tenants === 'system');
  const tenantEntries = new Map<string, ParsedGlobalAgent[]>();
  for (const entry of entries) {
    if (entry.tenants === 'system') {
      continue;
    }
    for (const tenantId of entry.tenants) {
      const list = tenantEntries.get(tenantId) ?? [];
      list.push(entry);
      tenantEntries.set(tenantId, list);
    }
  }

  try {
    await runAsSystem(() =>
      reconcileScope({ entries: systemEntries, scope: 'system', methods, AgentModel, roleCache }),
    );

    /* Visit every tenant that either has config entries now OR was previously seeded, so a tenant
     * (or entry) removed from config still gets its stale grants retired in that tenant's context. */
    const seededTenantIds = (await runAsSystem(() =>
      AgentModel.distinct('tenantId', { isSystem: true, tenantId: { $exists: true, $ne: null } }),
    )) as string[];
    const tenantIds = new Set<string>([...tenantEntries.keys(), ...seededTenantIds]);
    for (const tenantId of tenantIds) {
      const list = tenantEntries.get(tenantId) ?? [];
      await tenantStorage.run({ tenantId }, () =>
        reconcileScope({ entries: list, scope: 'tenant', methods, AgentModel, roleCache }),
      );
    }
  } catch (error) {
    logger.error('[GlobalAgents] Failed to reconcile global agents:', error);
  }
}

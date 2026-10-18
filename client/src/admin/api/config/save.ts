import { z } from 'zod';
import { PrincipalType } from 'librechat-data-provider';
import { SystemCapabilities } from 'librechat-data-provider';
import type { AdminConfigResponse } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import {
  verifyWrite,
  getEntryKey,
  isConfigRecord,
  getValueAtPath,
  planConfigChanges,
  getKeyedCollection,
  getWriteSkipReason,
  describeIssueCode,
  stripSecretPreviewValues,
} from '~/admin/utils';
import {
  requireCapability,
  requireAnyCapability,
  requireAllSectionCapabilities,
} from '../capabilities';
import { BASE_CONFIG_PRINCIPAL_ID } from '../constants';
import { MISSING_SCOPE_MESSAGE } from '../scopes/read';
import { createServerFn } from '~/admin/api/utils/fn';
import { normalizeAppServiceKeys } from './normalize';
import { getConfigSection } from '~/admin/constants';
import { safeFieldPath } from '../utils/validation';
import { getSchemaPathSet } from './schema';
import { apiFetch } from '../utils/api';

export { parseIndexedArrayPath } from '~/admin/utils';

/** The admin API accepts at most this many entries per PATCH. */
const MAX_PATCH_ENTRIES = 100;

/** How long to wait before re-reading the effective config once (LibreChat clears its caches asynchronously). */
const VERIFY_RETRY_MS = 400;

/**
 * Entries of a PATCH batch that LibreChat did not store. A 200 "No actionable
 * field entries" reply means it stripped the whole batch. Otherwise the reply
 * carries the stored overrides, and an entry whose top-level section is absent
 * from them was stripped (LibreChat strips by section: base-only, dedicated
 * and newer sections this panel does not know about yet).
 */
export function findDroppedEntries(batch: t.SaveEntry[], body: t.PatchFieldsResponse): string[] {
  if (body.message?.startsWith('No actionable')) return batch.map((e) => e.fieldPath);
  const overrides = body.config?.overrides;
  if (!isConfigRecord(overrides)) return [];
  return batch
    .filter((e) => !Object.hasOwn(overrides, getConfigSection(e.fieldPath)))
    .map((e) => e.fieldPath);
}

function targetConfigUrl(target: t.WriteTargetRef): string {
  if (target.type === 'base') return `/api/admin/config/role/${BASE_CONFIG_PRINCIPAL_ID}`;
  const { principalType, principalId } = target.scope;
  return `/api/admin/config/${principalType}/${encodeURIComponent(principalId)}`;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

/**
 * The target's stored overrides (redacted by the admin API); `{}` when base
 * has no config yet. A profile whose document is gone is refused (PR-3): the
 * admin API would otherwise silently recreate it, active and at the default
 * priority.
 */
async function readStoredOverrides(target: t.WriteTargetRef): Promise<t.ConfigRecord> {
  const response = await apiFetch(targetConfigUrl(target));
  if (response.status === 404 && target.type === 'scope') throw new Error(MISSING_SCOPE_MESSAGE);
  if (response.status === 404) return {};
  if (!response.ok) throw new Error(`Failed to read the stored config: ${response.status}`);
  const { config } = await readJson<AdminConfigResponse>(response);
  return normalizeAppServiceKeys((config?.overrides ?? {}) as t.ConfigRecord);
}

/** The base config: merged with the base overrides, or librechat.yaml alone (`baseOnly`). */
async function readBaseConfig(baseOnly: boolean): Promise<t.ConfigRecord> {
  const response = await apiFetch(`/api/admin/config/base${baseOnly ? '?baseOnly=true' : ''}`);
  if (!response.ok) throw new Error(`Failed to read the base config: ${response.status}`);
  const { config } = await readJson<{ config: t.ConfigRecord }>(response);
  return normalizeAppServiceKeys(config ?? {});
}

/**
 * The layers a write is planned against, read fresh: the target's stored
 * overrides and the layer beneath it (librechat.yaml for base, the merged
 * base config for a profile).
 */
async function readWriteSnapshot(target: t.WriteTargetRef): Promise<t.WriteSnapshot> {
  const isBase = target.type === 'base';
  const [stored, lower] = await Promise.all([readStoredOverrides(target), readBaseConfig(isBase)]);
  return { stored, lower, lowerKind: isBase ? 'yaml' : 'inherited' };
}

async function authorizeWrite(target: t.WriteTargetRef, ops: t.ConfigChange[]): Promise<void> {
  if (target.type === 'scope') {
    await requireAnyCapability([
      SystemCapabilities.ASSIGN_CONFIGS,
      SystemCapabilities.MANAGE_CONFIGS,
    ]);
    return;
  }
  const sections = [
    ...new Set(
      ops
        .filter((op) => !getWriteSkipReason(op.path, op.op === 'reset'))
        .map((op) => getConfigSection(op.path)),
    ),
  ];
  if (sections.length > 0) await requireAllSectionCapabilities(sections);
}

/** Masked secret previews never travel back as values. */
function sanitizeOps(ops: t.ConfigChange[]): t.ConfigChange[] {
  const schemaPaths = getSchemaPathSet();
  return ops.map((op) => {
    if (op.op === 'set') {
      return { ...op, value: stripSecretPreviewValues(op.value, op.path, schemaPaths) };
    }
    if (op.op !== 'upsertEntry') return op;
    return {
      ...op,
      value: stripSecretPreviewValues(op.value, op.path, schemaPaths),
      baseline:
        op.baseline === undefined
          ? undefined
          : stripSecretPreviewValues(op.baseline, op.path, schemaPaths),
    };
  });
}

/**
 * A rejected value the admin API reported by path. Paths index into the
 * array that was sent, so an index inside a keyed collection is mapped to the
 * identity of that sent entry.
 */
function attributeBackendIssue(path: string, code: string, batch: t.SaveEntry[]): t.ConfigIssue {
  const message = describeIssueCode(code, undefined, 'is not a valid value');
  const sent = batch.find(
    ({ fieldPath }) => path === fieldPath || path.startsWith(`${fieldPath}.`),
  );
  const collection = sent ? getKeyedCollection(sent.fieldPath) : undefined;
  if (!sent || !collection || !Array.isArray(sent.value) || path === sent.fieldPath) {
    return { path, code, message };
  }
  const [index, ...rest] = path.slice(sent.fieldPath.length + 1).split('.');
  const identity = getEntryKey(sent.value[Number(index)], collection.key);
  return { path, code, message, entryIdentity: identity, entryPath: rest.join('.') };
}

async function failureIssues(
  response: Response,
  path: string,
  batch: t.SaveEntry[] = [],
): Promise<t.ConfigIssue[]> {
  const body = await readJson<t.PatchFieldsResponse>(response);
  if (Array.isArray(body.issues) && body.issues.length > 0) {
    return body.issues.map((issue) => attributeBackendIssue(issue.path, issue.code, batch));
  }
  const message = body.error ?? `The admin API rejected the change (${response.status})`;
  return [{ path, code: 'WRITE_FAILED', message }];
}

interface WriteOutcome {
  writes: t.AppliedWrite[];
  dropped: t.SkippedChange[];
  failure?: t.ConfigIssue[];
}

async function patchFields(
  target: t.WriteTargetRef,
  entries: t.SaveEntry[],
  outcome: WriteOutcome,
): Promise<boolean> {
  const priority = target.type === 'base' ? { priority: 0 } : {};
  for (let i = 0; i < entries.length; i += MAX_PATCH_ENTRIES) {
    const batch = entries.slice(i, i + MAX_PATCH_ENTRIES);
    const response = await apiFetch(`${targetConfigUrl(target)}/fields`, {
      method: 'PATCH',
      body: JSON.stringify({ entries: batch, ...priority }),
    });
    if (!response.ok) {
      outcome.failure = await failureIssues(response, batch[0].fieldPath, batch);
      return false;
    }
    const body = await readJson<t.PatchFieldsResponse>(response);
    outcome.writes.push(
      ...batch.map(({ fieldPath }) => ({ kind: 'set' as const, path: fieldPath })),
    );
    outcome.dropped.push(
      ...findDroppedEntries(batch, body).map((fieldPath) => ({
        fieldPath,
        reason: 'notStored' as const,
      })),
    );
  }
  return true;
}

function fieldRequest(
  target: t.WriteTargetRef,
  kind: Exclude<t.AppliedWrite['kind'], 'set'>,
  path: string,
): Promise<Response> {
  if (kind === 'tombstone') {
    return apiFetch(`${targetConfigUrl(target)}/fields/tombstone`, {
      method: 'POST',
      body: JSON.stringify({ fieldPath: path }),
    });
  }
  return apiFetch(`${targetConfigUrl(target)}/fields?fieldPath=${encodeURIComponent(path)}`, {
    method: 'DELETE',
  });
}

async function writeFieldOps(
  target: t.WriteTargetRef,
  kind: Exclude<t.AppliedWrite['kind'], 'set'>,
  paths: string[],
  outcome: WriteOutcome,
): Promise<boolean> {
  for (const path of paths) {
    const response = await fieldRequest(target, kind, path);
    if (!response.ok && !(response.status === 404 && kind !== 'tombstone')) {
      outcome.failure = await failureIssues(response, path);
      return false;
    }
    outcome.writes.push({ kind, path });
  }
  return true;
}

/**
 * Writes a plan in a fixed order: every set (one PATCH per 100 entries), then
 * resets, tombstones and untombstones, so a rename writes the new entry
 * before removing the old one. Stops at the first failure.
 */
async function executePlan(target: t.WriteTargetRef, plan: t.WritePlan): Promise<WriteOutcome> {
  const outcome: WriteOutcome = { writes: [], dropped: [] };
  const steps = [
    () => patchFields(target, plan.sets, outcome),
    () => writeFieldOps(target, 'reset', plan.resets, outcome),
    () => writeFieldOps(target, 'tombstone', plan.tombstones, outcome),
    () => writeFieldOps(target, 'untombstone', plan.untombstones, outcome),
  ];
  try {
    for (const step of steps) {
      if (!(await step())) break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    outcome.failure = [{ path: '', code: 'WRITE_FAILED', message }];
  }
  return outcome;
}

async function restorePath(
  target: t.WriteTargetRef,
  path: string,
  previous: t.ConfigValue,
): Promise<boolean> {
  if (previous === undefined) {
    const response = await fieldRequest(target, 'reset', path);
    return response.ok || response.status === 404;
  }
  const value = stripSecretPreviewValues(previous, path, getSchemaPathSet());
  const response = await apiFetch(`${targetConfigUrl(target)}/fields`, {
    method: 'PATCH',
    body: JSON.stringify({ entries: [{ fieldPath: path, value }] }),
  });
  return response.ok;
}

async function undoWrite(
  target: t.WriteTargetRef,
  write: t.AppliedWrite,
  captured: t.ConfigRecord,
): Promise<boolean> {
  const previous = getValueAtPath(captured, write.path);
  if (write.kind === 'untombstone') return (await fieldRequest(target, 'tombstone', write.path)).ok;
  if (write.kind === 'reset' && previous === undefined) return true;
  if (write.kind === 'tombstone') {
    const response = await fieldRequest(target, 'reset', write.path);
    if (!response.ok) return false;
    return previous === undefined || restorePath(target, write.path, previous);
  }
  return restorePath(target, write.path, previous);
}

/**
 * Rolls written changes back to the overrides captured before the write, in
 * reverse order. Best effort: a stored secret cannot be restored, since the
 * admin API never returns it (a secret the failed batch wrote stays).
 */
async function compensate(
  target: t.WriteTargetRef,
  writes: t.AppliedWrite[],
  captured: t.ConfigRecord,
): Promise<boolean> {
  let restored = true;
  for (const write of [...writes].reverse()) {
    try {
      restored = (await undoWrite(target, write, captured)) && restored;
    } catch {
      restored = false;
    }
  }
  return restored;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Changes that did not take effect, read back after the write (best effort: a failed read reports none). */
async function verifyTarget(
  target: t.WriteTargetRef,
  plan: t.WritePlan,
  snapshot: t.WriteSnapshot,
): Promise<t.SkippedChange[]> {
  try {
    const stored = await readStoredOverrides(target);
    if (target.type !== 'base') return verifyWrite(plan, snapshot, stored);
    const first = verifyWrite(plan, snapshot, stored, await readBaseConfig(false));
    if (!first.some((item) => item.reason === 'notApplied')) return first;
    await delay(VERIFY_RETRY_MS);
    return verifyWrite(plan, snapshot, stored, await readBaseConfig(false));
  } catch {
    return [];
  }
}

function hasWrites(plan: t.WritePlan): boolean {
  return (
    plan.sets.length + plan.resets.length + plan.tombstones.length + plan.untombstones.length > 0
  );
}

/**
 * The one write path for config changes (SV-1/SV-2/SV-4). Reads the target's
 * stored overrides and the layer beneath it, plans the changes against them
 * (`planConfigChanges`: keyed collection ops by identity, validation of
 * fields, entries and whole sections, write rules), and writes nothing when
 * any issue is found. Otherwise it writes sets before resets and tombstones;
 * if a write fails, the writes before it are rolled back to the captured
 * overrides. Afterwards the stored (and, for base, effective) config is read
 * back, and every change that did not take effect is reported in `skipped`.
 */
export async function applyConfigChanges(
  target: t.WriteTargetRef,
  ops: t.ConfigChange[],
): Promise<t.ApplyConfigChangesResult> {
  await authorizeWrite(target, ops);
  const snapshot = await readWriteSnapshot(target);
  const plan = planConfigChanges(sanitizeOps(ops), snapshot);
  const result: t.ApplyConfigChangesResult = {
    applied: 0,
    failed: [],
    warnings: plan.warnings,
    issues: plan.issues,
    skipped: plan.skipped,
  };
  if (plan.issues.length > 0 || !hasWrites(plan)) return result;
  const outcome = await executePlan(target, plan);
  if (outcome.failure) {
    const compensated = await compensate(target, outcome.writes, snapshot.stored);
    return { ...result, failed: outcome.failure, compensated };
  }
  const notEffective = [...outcome.dropped, ...(await verifyTarget(target, plan, snapshot))];
  const lost = new Set(
    notEffective
      .filter((item) => item.reason !== 'yamlMerged' && item.reason !== 'inheritedMerged')
      .map((item) => item.fieldPath),
  );
  return {
    ...result,
    applied: Math.max(0, plan.effective - lost.size),
    skipped: [...plan.skipped, ...notEffective],
  };
}

const writeTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('base') }),
  z.object({
    type: z.literal('scope'),
    scope: z
      .object({ principalType: z.nativeEnum(PrincipalType), principalId: z.string().min(1) })
      .passthrough(),
  }),
]);

const configChangeSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), path: safeFieldPath, value: z.unknown() }),
  z.object({ op: z.literal('reset'), path: safeFieldPath }),
  z.object({ op: z.literal('tombstone'), path: safeFieldPath }),
  z.object({ op: z.literal('untombstone'), path: safeFieldPath }),
  z.object({
    op: z.literal('upsertEntry'),
    path: safeFieldPath,
    key: z.string().min(1),
    identity: z.string().min(1).nullable(),
    value: z.unknown(),
    baseline: z.unknown().optional(),
    index: z.number().int().nonnegative().optional(),
  }),
  z.object({
    op: z.literal('removeEntry'),
    path: safeFieldPath,
    key: z.string().min(1),
    identity: z.string().min(1),
  }),
]);

/** Applies a batch of config changes to base or a profile, all or nothing (see `applyConfigChanges`). */
export const applyConfigChangesFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      target: writeTargetSchema,
      ops: z.array(configChangeSchema).min(1).max(2000),
      expectedVersion: z.number().int().optional(),
    }),
  )
  .handler(
    ({ data }): Promise<t.ApplyConfigChangesResult> =>
      applyConfigChanges(data.target as t.WriteTargetRef, data.ops as t.ConfigChange[]),
  );

/** Deletes the entire base config DB override, reverting every value back to
 *  what librechat.yaml defines. Removes the `__base__` config document outright;
 *  scope (role/group/user) profiles are untouched. A 404 means there was no
 *  override to begin with, which is treated as success. */
export const resetBaseConfigFn = createServerFn({ method: 'POST' }).handler(async () => {
  await requireCapability(SystemCapabilities.MANAGE_CONFIGS);
  const response = await apiFetch(`/api/admin/config/role/${BASE_CONFIG_PRINCIPAL_ID}`, {
    method: 'DELETE',
  });

  if (!response.ok && response.status !== 404) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `Failed to reset base config: ${response.status}`,
    );
  }

  return { success: true };
});

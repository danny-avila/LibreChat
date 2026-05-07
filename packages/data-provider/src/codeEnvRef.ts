/**
 * Closed set of resource kinds for sandbox file caching. Defined as a
 * `as const` tuple so the runtime list and the TypeScript union can't
 * drift on future additions — adding a new kind to the tuple updates
 * both at once.
 *
 * - `skill`: shared per skill identity. Cross-user-within-tenant
 *   sharing. CodeAPI sessionKey omits the user dimension.
 *   `version` is required (the skill's monotonic counter scopes the
 *   cache per revision so any edit invalidates the prior cache
 *   entry naturally).
 * - `agent`: shared per agent identity. Same sharing semantic as
 *   skills (agents are addressable resources accessible to a
 *   permission-defined audience).
 * - `user`: user-private. CodeAPI sessionKey is keyed by the
 *   requesting user from auth context. Used for chat attachments
 *   and code-output artifacts.
 */
export const CODE_ENV_KINDS = ['skill', 'agent', 'user'] as const;
export type CodeEnvKind = (typeof CODE_ENV_KINDS)[number];

/**
 * Typed reference to a file in the code-execution sandbox.
 *
 * `storage_session_id` is intentionally distinct from the *execution*
 * session id at the top level of an execute response — they are
 * different concepts that historically shared the field name
 * `session_id`. This is the long-lived storage session keyed by the
 * resource's identity (skill/agent/user), not the transient
 * sandbox-run session.
 *
 * `kind` and `id` together name the resource that owns this file's
 * storage session. CodeAPI uses them (plus the auth-context tenant
 * id) to derive the sessionKey, which determines who shares the
 * cache. Cross-user sharing for shared resources (skills, agents) is
 * a designed property of the kind switch, not an emergent side
 * effect. See codeapi #1455 / agents #148 / LC #12960.
 *
 * `version` is statically required when `kind === 'skill'` and
 * statically forbidden otherwise via the discriminated union below —
 * the constraint is enforced at compile time, not just by codeapi's
 * runtime validator.
 */
interface CodeEnvRefBase {
  /** Resource identity. Semantics depend on `kind`:
   *  - `skill`: skill `_id` (sessionKey-meaningful, cross-user shared).
   *  - `agent`: agent id (sessionKey-meaningful, cross-user shared).
   *  - `user`: informational only — sessionKey derivation uses the
   *    requesting user from auth context. Kept on the type for shape
   *    uniformity across kinds; do not rely on it for routing. */
  id: string;
  storage_session_id: string;
  file_id: string;
}

export type CodeEnvRef =
  | (CodeEnvRefBase & { kind: 'skill'; version: number })
  | (CodeEnvRefBase & { kind: 'agent' })
  | (CodeEnvRefBase & { kind: 'user' });

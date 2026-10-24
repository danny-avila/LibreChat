import type {
  PrincipalType,
  PrincipalModel,
  TCustomConfig,
  TConfig,
} from 'librechat-data-provider';

/* ── Capability types (defined alongside the SystemCapabilities constant) ── */

export type {
  BaseSystemCapability,
  ConfigAssignTarget,
  ConfigSection,
  SystemCapability,
  CapabilityCategory,
} from '~/admin/capabilities';

/* ── Admin API response types ───────────────────────────────────────── */

/** Config document as returned by the admin API (no Mongoose internals). */
export type AdminConfig = {
  _id: string;
  principalType: PrincipalType;
  principalId: string;
  principalModel: PrincipalModel;
  priority: number;
  overrides: Partial<TCustomConfig>;
  /** Dotted paths this principal suppresses from the layers below it. */
  tombstones?: string[];
  isActive: boolean;
  configVersion: number;
  /**
   * `<_id>:<configVersion>`. Sent back as `expectedRevision`, it makes a write apply only to
   * this exact document; `absent` instead means "only if the principal has no document".
   */
  revision?: string;
  tenantId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminConfigListResponse = {
  configs: AdminConfig[];
};

export type AdminConfigResponse = {
  config: AdminConfig;
};

/** A write the server had nothing to apply for; `revision` is the stored document's, if any. */
export type AdminConfigNoopResponse = {
  message: string;
  revision: string | null;
};

/** 409: the stored document is not at the `expectedRevision` the write named. */
export type AdminConfigConflictResponse = {
  error: string;
  code: 'CONFIG_VERSION_CONFLICT';
  /** The revision now stored, or `null` when the principal has no document. */
  currentRevision: string | null;
};

export type AdminConfigDeleteResponse = {
  success: boolean;
};

/**
 * 200 from POST `/reload`. `broadcast` is false when the deployment has no Redis: only the
 * instance that answered reloaded, and any other keeps its cached librechat.yaml.
 */
export type AdminConfigReloadResponse = {
  success: true;
  broadcast: boolean;
};

/**
 * A POST `/reload` that did not load librechat.yaml or did not reach every instance:
 * - 422 `CONFIG_RELOAD_INVALID`: the loader refused the file (missing or, with a remote
 *   `CONFIG_PATH`, not fetched; unparseable; or failing `configSchema`). `issues` lists the
 *   schema failures by location and zod code, with no values, and is empty when the file could
 *   not be read or parsed. The answering instance keeps its last good config, and the other
 *   instances are not told to reload.
 * - 500 `CONFIG_RELOAD_FAILED`: a clear on the answering instance failed, or the file loaded but
 *   building the config from it failed (the last good config is kept, and nothing is broadcast).
 * - 503 `CONFIG_RELOAD_BROADCAST_FAILED`: the answering instance reloaded, but the other
 *   instances could not be told (Redis unreachable).
 *
 * The 500 and 503 are safe to retry; a 422 with `issues` needs the file fixed first.
 */
export type AdminConfigReloadErrorResponse = {
  error: string;
  code: 'CONFIG_RELOAD_INVALID' | 'CONFIG_RELOAD_FAILED' | 'CONFIG_RELOAD_BROADCAST_FAILED';
  issues?: Array<{ path: string; segments: string[]; code: string }>;
};

/* ── Admin API request types ────────────────────────────────────────── */

/**
 * Where a field write lands: a dotted `fieldPath`, which cannot name a key that contains a dot,
 * or the path's `segments`, which can (`['endpoints', 'bedrock', 'inferenceProfiles',
 * 'us.anthropic.claude-sonnet-4-5']`). Segments are 1 to 32 non-empty strings, none starting with
 * `$` or naming `__*`, `constructor` or `prototype`. A segment with a dot is refused (400
 * `CONFIG_PATH_INVALID`, reason `dotted_segment`) in tombstones, in `mcpServers`, `mcpConfig` and
 * `langfuse`, and wherever it would split a registered secret's location. DELETE `/fields` takes
 * `segments` as a JSON-encoded array in the query string.
 */
export type AdminConfigFieldTarget =
  | { fieldPath: string; segments?: never }
  | { segments: string[]; fieldPath?: never };

/** Optional write precondition: `absent`, or a `revision` the config API returned. */
export type AdminConfigWritePrecondition = {
  /** A mismatch answers 409 `CONFIG_VERSION_CONFLICT`; a malformed value 400. */
  expectedRevision?: string;
};

/** PATCH `/:principalType/:principalId/fields` */
export type AdminConfigPatchRequest = AdminConfigWritePrecondition & {
  entries: Array<AdminConfigFieldTarget & { value: unknown }>;
  priority?: number;
};

/** POST `/:principalType/:principalId/fields/tombstone` */
export type AdminConfigTombstoneRequest = AdminConfigWritePrecondition &
  AdminConfigFieldTarget & {
    priority?: number;
  };

/**
 * One change of a `POST …/changes` batch. The target is a `fieldPath` or `segments`, as in
 * {@link AdminConfigFieldTarget}; for an entry change it names the collection.
 *
 * - `set` writes `value` at the path (encrypting registered secrets; an object that omits a
 *   stored secret keeps it) and clears the tombstones the write covers. A whole object replaces
 *   what is stored there; fields the API does not store are left out of it and reported as
 *   skipped, and when nothing is left the path is reset as by `unset`.
 * - `unset` removes the principal's override at the path, the objects that leaves empty, and
 *   the tombstones at or below it: the path inherits again.
 * - `tombstone` removes the override and hides inherited values at the path. Tombstones are
 *   stored as dotted paths, so no segment may contain a dot, and hide whole arrays only: a path
 *   to an element or inside one is refused, and so is an index segment below a field
 *   `configSchema` does not define, which may name an array element.
 *
 * Only sections `configSchema` defines can be written or hidden; `unset` may also remove what
 * an older server stored outside them. Entries of a merged-by-key array are addressed by key,
 * never by position: a `set`, `unset` or `rename` whose path runs into one
 * (`endpoints.custom.0.headers`) is refused. A key names the entry the runtime merge matches it
 * to: a custom endpoint `ollama` in any case is the one entry `Ollama` also names.
 * - `upsertEntry` replaces the principal's own entry of a merged-by-key array (`endpoints.custom`,
 *   keyed by `name`) with `entry`, or appends it. An entry that omits a stored `apiKey` keeps it.
 * - `removeEntry` removes the principal's own entry with that key; an inherited entry of the
 *   same name shows again.
 * - `rename` renames one of the principal's own entries of a merged-by-key array, or one key of
 *   a record (`mcpServers`, a `headers` map). Everything stored on the entry moves with it,
 *   encrypted secrets included, so a rename never needs the secret again. An entry
 *   `librechat.yaml` defines cannot be renamed, and no entry can take the name of one.
 */
export type AdminConfigChangeOp = AdminConfigFieldTarget &
  (
    | { op: 'set'; value: unknown }
    | { op: 'unset' }
    | { op: 'tombstone' }
    | { op: 'upsertEntry'; entry: Record<string, unknown> }
    | { op: 'removeEntry'; key: string }
    | { op: 'rename'; from: string; to: string }
  );

/**
 * POST `/:principalType/:principalId/changes`: changes applied in array order to the stored
 * document and written with one compare-and-swap, so all of them apply or none does. No two
 * changes may address the same path, or the same entry of a collection.
 */
export type AdminConfigChangesRequest = AdminConfigWritePrecondition & {
  /** 1 to 1000 changes. */
  ops: AdminConfigChangeOp[];
  /**
   * Broad `manage:configs` only; anyone else's is ignored and the stored priority kept. A new
   * priority is written even when no change alters the document, and on an existing principal
   * without one it creates a document that holds only the priority, as PUT does. A batch for a
   * principal with no document that does not exist answers 404 `PRINCIPAL_NOT_FOUND`, a dry
   * run included.
   */
  priority?: number;
  /** Validate and report without writing. */
  dryRun?: boolean;
};

/**
 * Why a change, or part of a `set` value, was not stored. The rest of the batch still applies.
 * - `base_only_section`: a section only `librechat.yaml` configures (`filters`, …).
 * - `base_only_path`: a field of an overridable section only `librechat.yaml` sets
 *   (`endpoints.agents.pullRequests.provider`, …).
 * - `dedicated_section`: a section with its own admin API (`langfuse`).
 * - `interface_permission`: an interface field that is a role permission.
 */
export type AdminConfigSkipReason =
  | 'base_only_section'
  | 'base_only_path'
  | 'dedicated_section'
  | 'interface_permission';

/**
 * Why a stored change, or part of one (at its own `segments`), has no effect at runtime.
 * - `process_mcp_server`: a `set`, `tombstone` or `rename` addresses an MCP server
 *   `librechat.yaml` runs as a local process, whose configuration overrides never change, or a
 *   whole-section `mcpServers` tombstone leaves that server in place. An `unset` there is not
 *   reported: it asks for the YAML value, which is what runs.
 * - `base_only_path`: a `tombstone` above a base-only field `librechat.yaml` sets
 *   (`endpoints.agents.pullRequests.provider`, …) leaves that field in place and hides only the
 *   rest.
 */
export type AdminConfigIgnoreReason = 'process_mcp_server' | 'base_only_path';

/**
 * A credential the runtime merge leaves out of a document's layer, or a destination it sets back,
 * because the document would send a credential somewhere it was not entered for
 * (`secret_rebinding`): an inherited secret whose destination the document changes without
 * entering the secret again, or its own secret whose destination a layer below changed. PUT,
 * PATCH, field deletes, tombstones and `POST …/changes` list these in `ignored`, judged on the
 * document as written over `librechat.yaml` and the Base profile. Each describes the stored
 * document rather than one change, so it names a location, not an op.
 */
export type AdminConfigIgnoredSecret = {
  path: string;
  segments: string[];
  reason: 'secret_rebinding';
};

/** A change of the batch, by position, with the location it addressed. */
export type AdminConfigChangeRef = {
  /** Index of the change in the request's `ops`. */
  opIndex: number;
  op: AdminConfigChangeOp['op'];
  segments: string[];
  /** The entry key of an `upsertEntry` or `removeEntry`. */
  key?: string;
};

/** 200 from `POST …/changes`. */
export type AdminConfigChangesResponse = {
  /**
   * The stored document after the batch (redacted, and limited to the sections the caller can
   * read or just wrote), or `null` when the principal has none. Absent on a dry run.
   */
  config?: AdminConfig | null;
  /** The stored document's revision after the batch (before it, on a dry run). */
  revision: string | null;
  /**
   * Whether a document was written: a batch that changes nothing, and sets no new `priority`,
   * writes nothing.
   */
  written: boolean;
  dryRun: boolean;
  /** Changes that altered the document. */
  applied: AdminConfigChangeRef[];
  /** Changes, or parts of a `set` value (at their own `segments`), that were not stored. */
  skipped: Array<AdminConfigChangeRef & { reason: AdminConfigSkipReason }>;
  /**
   * Applied changes, or parts of one (at their own `segments`), the runtime merge does not use,
   * then the credentials it leaves out of the document as written (`secret_rebinding`, also on a
   * dry run, for the planned document), in the sections the caller can read (on a dry run, the
   * sections the batch writes).
   */
  ignored: Array<
    (AdminConfigChangeRef & { reason: AdminConfigIgnoreReason }) | AdminConfigIgnoredSecret
  >;
  /**
   * Valid changes that left the document as it was: it was already in that state, or the
   * batch's changes cancel out (a `set`, then an `unset` of its parent), in which case every
   * change is listed here and nothing is written.
   */
  unchanged: AdminConfigChangeRef[];
};

/**
 * 400 from `POST …/changes`: a change that cannot apply, named by `opIndex`, or (code
 * `CONFIG_OVERRIDE_INVALID`) the batch's end state failing validation, with its `issues` and
 * the batch's `skipped` report.
 */
export type AdminConfigChangeErrorResponse = {
  error: string;
  code: string;
  opIndex?: number;
  reason?: string;
  issues?: Array<{ path: string; segments: string[]; code: string }>;
  skipped?: AdminConfigChangesResponse['skipped'];
};

/* ── Admin config read APIs (resolved, effective, catalog, env status) ── */

/**
 * Why the merge leaves out part of a config document, or applies it otherwise than written, as a
 * resolution reports it on the document's layer:
 * - `unknown_section`: a top-level key or tombstone outside `configSchema` (`sectionAllowlist`).
 * - `invalid_override`: a value that fails the schema over the layers below it; `code` is the
 *   schema issue's code.
 * - `base_only_section`: a section only `librechat.yaml` sets (`filters`, `turnstile`, ...).
 * - `base_principal_section`: a section only the Base document holds (`langfuse`), in another.
 * - `base_only_path`: a field only `librechat.yaml` sets (`rules.baseOnlyPaths`); it keeps the
 *   `librechat.yaml` value.
 * - `process_mcp_server`: an MCP server `librechat.yaml` runs as a local process.
 * - `interface_permission`: an interface field that is a role permission.
 * - `runtime_stop`: an interface feature `librechat.yaml` turns off, which stays off.
 * - `azure_groups_unresolved`: Azure `groups` that do not resolve (a duplicate group or model, a
 *   model without a deployment or version), which the Azure clients never read.
 * - `azure_unserved`: an Azure model list, or `assistants`, the merged groups do not serve.
 * - `secret_rebinding`: a credential the merge drops, or (`destination_restored`) a destination
 *   it sets back, because the credential would be sent somewhere it was not entered for
 *   (`secretRebinding`).
 * - `env_reference_not_allowed`: a `${NAME}` reference outside the env allowlist (`envAllowlist`),
 *   which resolves to nothing.
 * - `invalid_theme`: an `interface.theme` the client would reject; `librechat.yaml`'s applies.
 * - `tenant_hidden`: a custom endpoint `librechat.yaml` scopes to another tenant, or a model
 *   spec that uses one.
 */
export type AdminConfigLayerIgnoreReason =
  | 'unknown_section'
  | 'invalid_override'
  | 'base_only_section'
  | 'base_principal_section'
  | 'base_only_path'
  | 'process_mcp_server'
  | 'interface_permission'
  | 'runtime_stop'
  | 'azure_groups_unresolved'
  | 'azure_unserved'
  | 'secret_rebinding'
  | 'destination_restored'
  | 'env_reference_not_allowed'
  | 'invalid_theme'
  | 'tenant_hidden';

/**
 * Part of a layer the merge does not apply as written. `segments` locate it in librechat.yaml
 * keys: in the document's overrides (array items by index), or for a credential or destination
 * the merge drops or sets back, as write responses name it (a custom endpoint by its name). A
 * tombstone above a `base_only_path` field or a `runtime_stop` feature names that field, which
 * the merge keeps while it removes the rest (write responses name a base-only field the same way).
 */
export type AdminConfigLayerIgnored = {
  path: string;
  segments: string[];
  reason: AdminConfigLayerIgnoreReason;
  /** The schema issue code of an `invalid_override`. */
  code?: string;
  /** Set when it is one of the document's tombstones rather than an override. */
  tombstone?: true;
};

/**
 * One config document of a resolution, as a read of it returns it (filtered to the sections the
 * caller can read, secrets redacted), with what the merge does not apply of it.
 */
export type AdminConfigLayer = {
  principalType: PrincipalType;
  principalId: string;
  priority: number;
  /** An inactive document is listed but not merged. */
  isActive: boolean;
  revision: string;
  overrides: Partial<TCustomConfig>;
  tombstones: string[];
  ignored: AdminConfigLayerIgnored[];
};

/**
 * 200 from `GET /api/admin/config/resolved/:principalType/:principalId` (`resolvedApi`): what a
 * profile resolves to, in `librechat.yaml` shape. `yaml` is librechat.yaml as the caller's tenant
 * sees it, `layers` the documents that merge over it (Base, then the profile) in merge order, and
 * `resolved` the result. Each tree is limited to the sections the caller can read, with secrets
 * redacted as reads redact them.
 */
export type AdminResolvedConfigResponse = {
  principalType: PrincipalType;
  principalId: string;
  yaml: Partial<TCustomConfig>;
  layers: AdminConfigLayer[];
  resolved: Partial<TCustomConfig>;
};

/**
 * 200 from `GET /api/admin/config/effective?userId=` (`resolvedApi`): what one user's requests
 * resolve to, over every profile that applies to them (Base, their role, their groups, their own),
 * in merge order. `principals` lists the principals the user resolves to, with or without a
 * profile.
 */
export type AdminEffectiveConfigResponse = {
  userId: string;
  principals: Array<{ principalType: PrincipalType; principalId: string }>;
  yaml: Partial<TCustomConfig>;
  layers: AdminConfigLayer[];
  resolved: Partial<TCustomConfig>;
};

/**
 * Why an endpoint the catalog lists is not served:
 * - `not_listed`: `ENDPOINTS` names the endpoints to serve, without this one;
 * - `missing_credentials`: no credential for a built-in endpoint in the environment (`envVars`);
 * - `missing_api_key`, `missing_base_url`, `missing_models`: a custom endpoint without an
 *   `apiKey` (or one the merge dropped), a `baseURL`, or `models.default` or `models.fetch`.
 */
export type AdminCatalogEndpointReason =
  | 'not_listed'
  | 'missing_credentials'
  | 'missing_api_key'
  | 'missing_base_url'
  | 'missing_models';

export type AdminCatalogEndpoint = {
  /** Whether the scope's users are served the endpoint (`GET /api/endpoints` lists it). */
  enabled: boolean;
  custom: boolean;
  reason?: AdminCatalogEndpointReason;
  /**
   * Env names the endpoint takes its credentials or base URL from: a built-in endpoint's (from
   * the environment), or the `${NAME}` references of a custom endpoint's `apiKey` and `baseURL`.
   * Whether each is set is `GET /env-status`'s to say.
   */
  envVars: string[];
  /** The entry `GET /api/endpoints` serves the scope's users, when enabled. */
  config?: TConfig;
};

/** One endpoint's models for a scope; never fetched with any user's stored key. */
export type AdminCatalogModels = {
  /** What the scope's users are offered, as `GET /api/models` lists it for them. */
  served: string[];
  /**
   * The list the scope's config sets: `models` of a built-in endpoint, the models of the Azure
   * groups, or a custom endpoint's `models.default`. Absent when the config sets none.
   */
  configured?: string[];
  /**
   * What the endpoint offers without a configured list: a built-in endpoint's `*_MODELS` env
   * list, the provider's model list or the built-in defaults, or what a custom endpoint with
   * `models.fetch` fetches with the server's key. Absent for a custom endpoint that fetches
   * nothing (no `fetch`, or a key or URL each user provides).
   */
  defaults?: string[];
};

/** A librechat.yaml or profile MCP server the scope's users can reach. */
export type AdminCatalogMcpServer = {
  name: string;
  title?: string;
  transport: 'stdio' | 'sse' | 'streamable-http' | 'websocket';
  /** `yaml` when librechat.yaml defines it, `override` when a profile adds it. */
  source: 'yaml' | 'override';
  /** Runs as a local process (`stdio`), which profiles cannot change or hide. */
  processBacked: boolean;
};

/** A tool agents can use, as `GET /api/agents/tools` lists it. */
export type AdminCatalogTool = {
  pluginKey: string;
  name: string;
  description?: string;
  icon?: string;
  /** The server holds every credential the tool needs. */
  authenticated?: boolean;
  toolkit?: boolean;
};

/**
 * 200 from `GET /api/admin/config/catalog?principalType=&principalId=` (`catalogApi`): what a
 * scope serves, resolved as its users get it (Base by default). A part is present only for
 * callers who can read its section: `endpoints` and `models` for `endpoints`, `mcpServers` for
 * `mcpServers`, `tools` for `filteredTools` or `includedTools`.
 */
export type AdminConfigCatalogResponse = {
  principalType: PrincipalType;
  principalId: string;
  endpoints?: Record<string, AdminCatalogEndpoint>;
  models?: Record<string, AdminCatalogModels>;
  /** The tools every scope offers: tool filtering is deployment-only. */
  tools?: AdminCatalogTool[];
  mcpServers?: AdminCatalogMcpServer[];
};

/**
 * Where an env name `GET /env-status` reports is used: referenced in librechat.yaml (`yaml`), a
 * default reference librechat.yaml loading fills in (`default`, such as `${SEARXNG_INSTANCE_URL}`),
 * read by a built-in endpoint (`endpoint`), listed in `CONFIG_OVERRIDE_ENV_ALLOWLIST`
 * (`allowlist`), or referenced in a stored profile (`override`).
 */
export type AdminConfigEnvSource = 'yaml' | 'default' | 'endpoint' | 'allowlist' | 'override';

export type AdminConfigEnvStatus = {
  /** The variable holds a non-blank value on this server; the value itself is never returned. */
  set: boolean;
  /** The value is `user_provided`: each user enters their own. */
  userProvided?: true;
  sources: AdminConfigEnvSource[];
};

/** 200 from `GET /api/admin/config/env-status` (`envStatus`). */
export type AdminConfigEnvStatusResponse = {
  vars: Record<string, AdminConfigEnvStatus>;
};

/* ── Admin config contract (GET /api/admin/config/meta) ─────────────── */

/**
 * Admin config API behaviours a client gates on. A flag is `true` only when the running server
 * has the behaviour; a server without the meta route (404) has none of them.
 * - `dottedKeys`: keys containing dots survive writes where the schema has a record (model
 *   names such as `gpt-4.1`, Bedrock inference profiles, MIME types, header names); a dotted key
 *   at a fixed-shape position is a `dotted_key` issue, and `$`-prefixed or prototype keys are
 *   rejected with `CONFIG_UNSAFE_KEY`. Issues carry `segments`, which name a dotted record key
 *   unambiguously. A database engine that cannot store a dotted key answers 422
 *   `CONFIG_KEY_NOT_STORABLE` and stores nothing.
 * - `sectionAllowlist`: writes to a top-level key `configSchema` does not define are rejected,
 *   and stored ones are ignored at merge. Removing what an older server stored under one, whole
 *   or in part (DELETE `/fields`, or an `unset` in `POST …/changes`), is still allowed.
 * - `readFilteredWriteResponses`: write responses are filtered by the caller's read access.
 * - `preAuthBaseOverrides`: Base (`__base__`) overrides apply before sign-in: the signed-out
 *   `GET /api/config` serves Base `registration.socialLogins` and the pre-login interface fields,
 *   and Base `registration.allowedDomains` gates email registration, password reset and LDAP,
 *   OpenID, SAML and social sign-in (a role profile's list then applies to that role's accounts,
 *   new ones included). Turnstile stays on librechat.yaml (`turnstile` is base-only).
 * - `webSearchStoredKeys`: web search uses a key stored in config (encrypted by the admin API,
 *   or a `librechat.yaml` literal) at runtime, not only a `${VAR}` reference, and stores
 *   `webSearch.keenableApiKey` encrypted like the other web search keys. A stored key reaches a
 *   URL stored in config only when the same layer set both; it is kept over an inherited
 *   `${VAR}` or default URL (a layer that points a URL at a `${VAR}` other than librechat.yaml's
 *   without a key of its own is set back, `secretRebinding`). A later layer that changes, blanks
 *   or removes the paired URL drops
 *   the key, and a write that changes or removes the URL beside a stored key must enter the key
 *   again (400 `CONFIG_SECRET_REENTRY_REQUIRED`); the key counts as entered only when the written
 *   document holds the value the request entered.
 * - `expectedRevision`: every config document a response returns carries `revision`
 *   (`<id>:<configVersion>`), and a write with nothing to apply answers `{ message, revision }`.
 *   PUT, PATCH `/fields`, POST `/fields/tombstone` and PATCH `/active` take `expectedRevision` in
 *   the body, and both DELETE routes take it in the query: `absent` (create-only) or a returned
 *   revision. A mismatch answers 409 `CONFIG_VERSION_CONFLICT` with `currentRevision` and changes
 *   nothing; a malformed value answers 400 `INVALID_EXPECTED_REVISION`. Without one, a write that
 *   loses a race re-reads the document and applies itself again, answering 409 after 3 attempts.
 * - `prunesEmptyParents`: a field delete or tombstone also removes the objects it leaves empty,
 *   stopping at arrays (whose elements stay), so no `{}` shell remains; tombstones elsewhere stay.
 *   A document holding only such shells counts as empty for assign-only lifecycle calls.
 * - `awaitedInvalidation`: a write answers only after this server has cleared its config caches
 *   (and, with Redis, told the other instances to clear theirs); GET `/base` merges the stored
 *   overrides rather than a cached merge, and a merge read before a clear is never cached. A read
 *   after a write's response therefore shows it; another instance shows it once the broadcast
 *   arrives, or, without Redis, within `limits.overrideCacheTtlMs`.
 * - `changesBatch`: `POST /:principalType/:principalId/changes` applies up to
 *   `limits.maxChangeOps` set, unset, tombstone, entry upsert/remove and rename ops to one
 *   document in order, as one compare-and-swap write judged on the end state: an invalid op
 *   writes nothing, ops that cancel out write nothing, and `dryRun` reports without writing.
 * - `yamlMcpHide`: a tombstone at `mcpServers.<name>` hides that librechat.yaml MCP server from
 *   the profile's principals, and one at `mcpServers.<name>.<field>` removes that field. A hidden
 *   server is an access boundary, not a catalog filter: lookups that name the principal leave it
 *   out, and checkout refuses it, including for agents saved before the hide. When the
 *   principal's config cannot be read, every hideable server is withheld. Process-backed
 *   (`stdio`) and Agent Plugins servers cannot be hidden, and deleting the tombstone shows the
 *   server again.
 * - `deterministicPrecedence`: config documents merge in one fixed order, the last winning:
 *   Base (`role` / `__base__`) first whatever its priority, then ascending `priority`, then
 *   role < group < user on equal priority, then document `_id`; `GET /` lists them in that
 *   order. A write (PUT, PATCH `/fields`, POST `/fields/tombstone` or `/changes`) that creates
 *   a document without `priority` gives it its principal type's default (role 10, group 20,
 *   user 100; Base 0), and a write that omits `priority` keeps the stored one, so a PUT no
 *   longer resets it. A profile write validates on `librechat.yaml` with the active Base
 *   document resolved over it, as the merge applies it; when Base changes before the write
 *   commits, the write is judged on that Base, and taken back (400) when it fails there. Both are
 *   the ones of the tenant partition the profile merges in: a group or user profile an admin
 *   without a tenant writes for a tenant's principal is judged on that tenant's librechat.yaml
 *   scope and Base, and answers 409 `CONFIG_VERSION_CONFLICT` if it moves to another partition
 *   while the write runs.
 * - `priorityRoute`: PATCH `/:principalType/:principalId/priority` `{ priority,
 *   expectedRevision? }` sets only the priority (overrides, tombstones and `isActive` stay),
 *   for broad `manage:configs` only. No document answers 404 `CONFIG_NOT_FOUND`, an invalid
 *   priority 400 `INVALID_PRIORITY`; an unchanged priority is neither written nor audited.
 * - `principalCheck`: a write that would create a principal's first document (PUT, PATCH
 *   `/fields`, POST `/fields/tombstone` or `/changes`, including a dry run or a batch that only
 *   sets a priority) answers 404 `PRINCIPAL_NOT_FOUND` unless the role (by exact name), group
 *   or user (by lowercase ObjectId) exists in the caller's tenant (outside a tenant, at
 *   platform level). A PUT with `expectedRevision: 'absent'` creates the profile even with no
 *   overrides: 201, or 409 `CONFIG_VERSION_CONFLICT` when one exists.
 * - `roleRenameMovesProfile`: renaming a role (PATCH `/api/admin/roles/:name`) moves its
 *   config profile, system grants and ACL entries to the new name in the caller's tenant, or
 *   undoes every step and answers 500 `ROLE_RENAME_FAILED`; the undo takes back only what the
 *   rename changed, so a grant revoked or a member reassigned meanwhile stays that way. A profile already held by the new
 *   name answers 409 `ROLE_CONFIG_CONFLICT`, and the Base principal id is a reserved role name
 *   (400 `ROLE_NAME_RESERVED`).
 * - `recordSecrets`: each MCP server's `apiKey.key` and `oauth.client_secret`
 *   (`rules.recordSecretFields`, which also lists Azure `groupMap`) is stored encrypted with a masked preview beside it
 *   (`keyPreview`, `client_secretPreview`), left out of every read (GET `/base` included, and
 *   the end-user MCP server list never carries a preview), kept when a write omits it, and
 *   decrypted for the MCP runtime. A `${VAR}` or `{{VAR}}` reference stays readable. A `renames`
 *   hint (`[{ path: 'mcpServers', previousName, name }]`) on PUT and PATCH, or a `rename` op in
 *   a change batch, carries the stored credentials to the new name. A write that keeps a stored
 *   credential while changing where the server sends it (URL, transport, proxy, auth header,
 *   OAuth endpoints and client; the proxy binds the OAuth client secret too, since the access
 *   token it obtains travels through it) answers 400 `MCP_API_KEY_REENTRY_REQUIRED` or
 *   `MCP_OAUTH_SECRET_REENTRY_REQUIRED` with `server` and `fields`: on PUT, PATCH, field
 *   deletes, tombstones and change batches. A credential counts as entered again only when the
 *   written document holds the value the request entered, whatever order its writes came in;
 *   one a rename, a copy or a chain of renames carried is compared with the server it came from,
 *   so a name swap that moves each key with its own server is accepted. The rule covers MCP
 *   credentials, web search keys (`webSearchStoredKeys`) and Azure group keys
 *   (`azureGroupSecrets`) only: a custom endpoint, OCR or speech key a document stores stays with
 *   that document when the same document changes its destination; only the merge's cross-layer
 *   rule (`secretRebinding`) applies to those.
 * - `azureGroupSecrets`: `endpoints.azureOpenAI.groups[].apiKey` is stored encrypted with
 *   `apiKeyPreview`, matched across writes by `group` (omit it to keep it), left out of reads
 *   and decrypted for the Azure clients, which use it: the merge resolves a profile's `groups`
 *   as AppService resolves librechat.yaml's, into the `groupMap`, `modelGroupMap`, model list
 *   and assistant models the clients read. A profile's `groups` replace the groups below whole,
 *   as its array does, and a tombstone of `groups` removes everything they resolve to; groups
 *   that do not resolve (a duplicate group or model, a model without a deployment or version)
 *   stay unread, with a warning. The merged model lists name only models a merged group serves:
 *   a `modelNames`, `assistantModels` or `assistantGroups` an override writes directly is
 *   narrowed to them, with a warning. When none of the models the merge leaves supports
 *   assistants, `assistants` is off for that profile, with a warning, rather than on without a
 *   model (librechat.yaml refuses that combination at startup). An override that writes
 *   `endpoints.azureOpenAI.groupMap.<group>.apiKey` directly (a record secret,
 *   `rules.recordSecretFields`) gets the same treatment: encrypted with `apiKeyPreview`, kept
 *   when a write of its group omits it, left out of every read (GET `/base` included, where a
 *   librechat.yaml literal shows the fixed mask) and decrypted for the Azure clients; a `groupMap`
 *   entry merges over the resolved group of its name. A write that keeps a stored group key
 *   (in `groups` or `groupMap`) while changing where the group sends it (`baseURL`,
 *   `instanceName`, a deployment name its base URL takes its host from, a destination option in
 *   `addParams` or `dropParams`), judged as the document resolves over librechat.yaml, answers
 *   400 `CONFIG_SECRET_REENTRY_REQUIRED` with `issues` naming the changed field and `secretPath`:
 *   on PUT, PATCH, field deletes, tombstones and change batches.
 * - `yamlSecretPreview`: a read of a secret with no stored preview (a librechat.yaml literal,
 *   or ciphertext stored without one) shows the fixed mask `********` in its preview field
 *   instead of nothing, so it reads as set; nothing about the value is revealed. A `${VAR}`
 *   reference, where the field allows one, stays readable.
 * - `envAllowlist`: a `${NAME}` reference in a value written through the admin config API is
 *   refused unless `NAME` is referenced in librechat.yaml, is a built-in endpoint credential
 *   (`OPENAI_API_KEY`, ...) or is listed in `CONFIG_OVERRIDE_ENV_ALLOWLIST`, or the value is
 *   where loading librechat.yaml puts that same reference (the `${OCR_API_KEY}` of an `ocr`
 *   section without a key, and the web search defaults such as `${SEARXNG_INSTANCE_URL}`,
 *   which GET `/base` returns, so a section read there is accepted written back): 400
 *   `CONFIG_OVERRIDE_INVALID` with issue `env_reference_not_allowed`, on PUT, PATCH and change
 *   batches. A batch is judged on the document it leaves: a reference counts when that document
 *   still holds it where the batch changed something, named there (an entry of a merged-by-key
 *   list, set alone or within its collection, by its index in the collection the batch leaves;
 *   a value under a renamed key or entry by its new name), so one a later change of the batch
 *   removes or replaces is not refused. Text no reader expands
 *   (`interface`, `modelSpecs`, prompt fields) is exempt, and so are the `${INSTANCE_NAME}` and
 *   `${DEPLOYMENT_NAME}` templates the Azure client fills in a group's `baseURL` (`groups` or
 *   `groupMap`), which are not env references, and opaque credentials: the OCR, speech, web
 *   search and Langfuse keys, which are stored encrypted and sent as entered, so a `${...}`
 *   inside one is part of the key (a whole `${VAR}` reference there is still checked). Custom
 *   endpoint, Azure group and MCP credentials are expanded by their clients once decrypted and
 *   stay checked. At runtime an unlisted reference in a stored override resolves to nothing. The
 *   allowlist decides which names a value may reference, not where the value is sent: an allowed
 *   name may appear in any value, a URL, a header or a key beside a host of the writer's
 *   choosing.
 * - `secretRebinding`: the merge drops a credential a layer would send somewhere it was not
 *   entered for: an inherited one whose destination the layer changes without entering it again,
 *   or the layer's own one whose destination a layer below changed (MCP servers, custom
 *   endpoints, OCR, speech, web search, Azure `groupMap`, including the groups a profile's
 *   `groups` resolve to); for summarization and Vertex AI, which fall back to a deployment
 *   credential, it sets the destination back instead, and so for a web search URL a layer points
 *   at a `${VAR}` reference other than librechat.yaml's without entering the key sent there
 *   (web search sends the deployment's key to any `${VAR}` URL). The OCR client fills an empty
 *   key from `OCR_API_KEY` only for its default destination (no base URL, or `${OCR_BASEURL}`),
 *   so a dropped OCR key is not replaced by the deployment's. A custom
 *   endpoint's destination is its `baseURL`, its `provider` (the client that reads the rest) and
 *   the options in `addParams` and `dropParams` named like a destination, such as the
 *   `anthropicApiUrl` the native Anthropic client sends to; an entry is matched under any
 *   spelling the merge folds (`ollama` is `Ollama`) and reported by the name the merge keeps. Write
 *   responses list each in `ignored` with reason `secret_rebinding` (`AdminConfigIgnoredSecret`),
 *   in the sections the response shows (`readFilteredWriteResponses`; a dry run shows the ones it
 *   writes).
 *   A secret the layer writes counts as entered, a `${VAR}` reference included: restating the
 *   reference librechat.yaml uses beside a new destination keeps it, so for allowlisted names
 *   (`envAllowlist`) the rule stops a destination change that leaves the reference out, not one
 *   that restates it. Header maps are not covered.
 * - `resolvedApi`: `GET /resolved/:principalType/:principalId` returns what a profile resolves to
 *   over librechat.yaml and the Base document (`AdminResolvedConfigResponse`), and
 *   `GET /effective?userId=` what one user resolves to over every profile that applies to them
 *   (`AdminEffectiveConfigResponse`; also needs `read:users` and `read:groups`, and answers 404
 *   `USER_NOT_FOUND` for a user outside the caller's tenant). Both are in librechat.yaml shape,
 *   merged exactly as requests merge them (the parity of `resolveConfigLayers` with the served
 *   merge), with each document's `ignored` parts (`AdminConfigLayerIgnored`), read from the stored
 *   documents rather than the override cache, limited to the sections the caller can read and
 *   redacted as reads redact. A profile with no document resolves to Base; one whose principal
 *   does not exist in the caller's tenant answers 404 `PRINCIPAL_NOT_FOUND`.
 * - `catalogApi`: `GET /catalog?principalType=&principalId=` returns the endpoints (served or not,
 *   with a `reason` and the env names they read), models (`served`, `configured`, `defaults`),
 *   MCP servers and agent tools a scope (Base by default) offers, as its users get them
 *   (`AdminConfigCatalogResponse`). Models are never loaded with a user's stored key, header
 *   templates that name a user resolve to nothing, a scope's model lists are reused for
 *   `limits.catalogModelsTtlMs` while its endpoint config is unchanged, and no User-Agent is
 *   needed. Each part is present only for callers who can read its section.
 * - `envStatus`: `GET /env-status` reports, for each env name librechat.yaml references, fills in
 *   by default, or a built-in endpoint reads, and each name in `CONFIG_OVERRIDE_ENV_ALLOWLIST`,
 *   whether it is set on the server and where it is used (`AdminConfigEnvStatusResponse`), never
 *   its value. Names stored profiles reference are added for broad `manage:configs` holders
 *   outside strict tenant isolation. A caller without broad read access sees only the names used
 *   in sections it can read; infrastructure secrets (`CREDS_KEY`, ...) are never listed.
 * - `reloadRoute`: `POST /reload` reloads librechat.yaml on every instance without a config
 *   write. It is for an admin without a tenant who holds broad `manage:configs` (otherwise 403
 *   `FORBIDDEN`), since it reaches every tenant. The answering instance drops its cached
 *   librechat.yaml, every merged config and its MCP config-source servers, then loads the file
 *   again before it answers. When the file loaded, it tells every other instance (with Redis) to
 *   do the same; each of them loads the file on its next read, keeping its last good config if
 *   that fails. It answers 200 `{ success: true, broadcast }` (`AdminConfigReloadResponse`), with
 *   `broadcast: false` when there is no Redis to publish on. When the loader refuses the file it
 *   answers 422 `CONFIG_RELOAD_INVALID` with `issues` by location, keeps the last good config and
 *   broadcasts nothing; a failed clear, or a failure to build the config from a file that loaded,
 *   answers 500 `CONFIG_RELOAD_FAILED`; a failed publish after this instance reloaded answers 503
 *   `CONFIG_RELOAD_BROADCAST_FAILED` (`AdminConfigReloadErrorResponse`). An instance that misses
 *   the broadcast (the publish failed, or its subscription was down) keeps its old
 *   librechat.yaml, which never expires, until a later reload or config write reaches it or it
 *   restarts. Every reload that runs is audited as `config.reloaded` with `metadata.broadcast`, a
 *   failed one with outcome `failure` and its `code`. A committed config write still reloads the
 *   file too, on the next read.
 */
export type AdminConfigFeatureFlag =
  | 'dottedKeys'
  | 'sectionAllowlist'
  | 'readFilteredWriteResponses'
  | 'preAuthBaseOverrides'
  | 'webSearchStoredKeys'
  | 'expectedRevision'
  | 'prunesEmptyParents'
  | 'awaitedInvalidation'
  | 'changesBatch'
  | 'yamlMcpHide'
  | 'deterministicPrecedence'
  | 'priorityRoute'
  | 'principalCheck'
  | 'roleRenameMovesProfile'
  | 'recordSecrets'
  | 'azureGroupSecrets'
  | 'yamlSecretPreview'
  | 'envAllowlist'
  | 'secretRebinding'
  | 'resolvedApi'
  | 'catalogApi'
  | 'envStatus'
  | 'reloadRoute';

export type AdminConfigFeatures = Record<AdminConfigFeatureFlag, boolean>;

/** A secret config field: encrypted at rest, omitted from reads, kept when a write omits it. */
export type AdminConfigSecretFieldRule = {
  path: string;
  /** Masked-preview companion returned on reads; never writable. */
  previewPath: string;
  /** Whether a `${ENV_VAR}` reference is stored and returned as is instead of encrypted. */
  allowEnvPlaceholder: boolean;
};

/** A secret held by every item of an array, matched across writes by `identityKey`. */
export type AdminConfigArraySecretFieldRule = {
  arrayPath: string;
  secretKey: string;
  previewKey: string;
  identityKey: string;
};

/** A secret every entry of a record keyed by entry name holds, such as each MCP server's. */
export type AdminConfigRecordSecretFieldRule = {
  /** The record's dot-path (`mcpServers`, `endpoints.azureOpenAI.groupMap`). */
  recordPath: string;
  /** The secret's location inside each entry, as a dot-path. */
  secretPath: string;
  /** Its masked-preview companion inside each entry; never writable. */
  previewPath: string;
};

/** How overrides merge, in override (`librechat.yaml`) key names. */
export type AdminConfigMergeRules = {
  /** Arrays merged item by item on a key field instead of replaced. */
  arrayMergeKeys: Record<string, string>;
  /** Objects an override replaces whole instead of merging into. */
  atomicMergePaths: string[];
  /** Override sections the resolved config (`GET /base`) holds under another name. */
  overrideKeyMap: Record<string, string>;
};

export type AdminConfigRules = AdminConfigMergeRules & {
  /** Top-level sections `configSchema` defines; enforced on writes when `sectionAllowlist`. */
  acceptedSections: string[];
  /** Sections only `librechat.yaml` sets; writes to them are dropped. */
  baseOnlySections: string[];
  /** Sections only the base (`__base__`) document may hold, through their dedicated APIs. */
  basePrincipalSections: string[];
  /** Fields inside overridable sections that only `librechat.yaml` sets. */
  baseOnlyPaths: string[];
  secretFields: AdminConfigSecretFieldRule[];
  arraySecretFields: AdminConfigArraySecretFieldRule[];
  /** Secrets of record entries, kept and encrypted per entry like array secrets. */
  recordSecretFields: AdminConfigRecordSecretFieldRule[];
  /** Maps of credentials admin writes are refused for; reads mask their values. */
  refusedMaps: string[];
  /** MCP server fields that make a server process-backed; only `librechat.yaml` sets them. */
  processMcpFields: string[];
  interface: {
    /** Interface fields that are role permissions; overrides drop them. */
    permissionFields: string[];
    /** Permission fields whose boolean form is a runtime toggle overrides keep. */
    runtimeFields: string[];
    /** Sub-keys of an object-form permission field that are permission bits. */
    permissionSubKeys: string[];
  };
  /** Whether `endpoints.all` title settings apply as one block or per field. */
  titleResolution: 'block' | 'field';
};

export type AdminConfigMeta = {
  metaVersion: 1;
  versions: {
    /** LibreChat release. */
    librechat: string;
    /** `librechat-data-provider` the server validates with. */
    dataProvider: string;
    /** `librechat.yaml` schema version. */
    configSchema: string;
  };
  features: AdminConfigFeatures;
  limits: {
    /** Most entries one `PATCH /fields` accepts. */
    maxPatchEntries: number;
    /** Most ops one `POST /changes` accepts. */
    maxChangeOps: number;
    /**
     * The app config service's `overrideCacheTtl`: how long another server instance may serve
     * resolved config from before a write.
     */
    overrideCacheTtlMs: number;
    /**
     * How long `GET /catalog` reuses a scope's model lists while its endpoint config is
     * unchanged (`catalogApi`): librechat.yaml's `endpoints.catalogModelsTtlMs`, two minutes by
     * default; `0` when every read resolves them.
     */
    catalogModelsTtlMs: number;
  };
  rules: AdminConfigRules;
};

/* ── Audit log taxonomy ─────────────────────────────────────────────── */

/**
 * High-level domains an audit entry can belong to. The audit log is a
 * general-purpose, append-only compliance record; new domains (agent runs,
 * tool/MCP calls, config and permission changes, approvals) are added here as
 * the surface grows, without reshaping the record.
 */
export const AUDIT_CATEGORIES = [
  'grant',
  'agent_run',
  'tool_call',
  'mcp',
  'config',
  'permission',
  'auth',
  'approval',
  'role',
  'group',
  'user',
  'acl',
  'credential',
  'audit',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/**
 * Single source of truth for the audit-action enum. Actions are namespaced
 * `<resource>.<verb>` (past tense) so the registry stays readable as it grows;
 * `AUDIT_ACTION_CATEGORY` maps each one to the coarse category used for SIEM
 * routing and filtering. The Mongoose schema enum and the HTTP handler's
 * whitelist both consume this constant so they cannot drift. Actions are only
 * ever appended: stored entries keep their action forever.
 *
 * Actor conventions: admin API mutations record `{ type: 'user' }` with the
 * caller; IdP-driven and startup syncs record `{ type: 'system' }`.
 */
export const AUDIT_ACTIONS = [
  'grant.assigned',
  'grant.removed',
  'permission.insights_assigned',
  'permission.insights_removed',
  /** Role lifecycle and membership; target `{ type: 'role', id: name, name }`. */
  'role.created',
  'role.updated',
  'role.permissions_updated',
  'role.deleted',
  'role.member_added',
  'role.member_removed',
  /** Role permissions rewritten by the startup `librechat.yaml` interface sync. */
  'role.synced',
  /** Group lifecycle and membership; target `{ type: 'group', id, name }`. */
  'group.created',
  'group.updated',
  'group.deleted',
  'group.member_added',
  'group.member_removed',
  /** Per-principal config overrides; target `{ type: 'config', id: '<principalType>:<principalId>' }`. */
  'config.created',
  'config.updated',
  'config.deleted',
  'config.toggled',
  /** librechat.yaml reloaded without a config write; target `{ type: 'config', id: 'librechat.yaml' }`. */
  'config.reloaded',
  /** Account lifecycle; `role_changed` covers IdP-driven role assignment. */
  'user.deleted',
  'user.role_changed',
  /** Resource ACL (sharing) changes. */
  'acl.granted',
  'acl.revoked',
  'acl.public_changed',
  'mcp_server.created',
  'mcp_server.updated',
  'mcp_server.deleted',
  'code_worker.paired',
  'code_worker.revoked',
  'langfuse.updated',
  'skill_credential.set',
  'skill_credential.deleted',
  'passkey.registered',
  'passkey.removed',
  /** Reads of the audit log itself and retention purges. */
  'audit.read',
  'audit.exported',
  'audit.purged',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Maps each action to its category so writers never pass both. */
export const AUDIT_ACTION_CATEGORY: Record<AuditAction, AuditCategory> = {
  'grant.assigned': 'grant',
  'grant.removed': 'grant',
  'permission.insights_assigned': 'permission',
  'permission.insights_removed': 'permission',
  'role.created': 'role',
  'role.updated': 'role',
  'role.permissions_updated': 'role',
  'role.deleted': 'role',
  'role.member_added': 'role',
  'role.member_removed': 'role',
  'role.synced': 'role',
  'group.created': 'group',
  'group.updated': 'group',
  'group.deleted': 'group',
  'group.member_added': 'group',
  'group.member_removed': 'group',
  'config.created': 'config',
  'config.updated': 'config',
  'config.deleted': 'config',
  'config.toggled': 'config',
  'config.reloaded': 'config',
  'user.deleted': 'user',
  'user.role_changed': 'user',
  'acl.granted': 'acl',
  'acl.revoked': 'acl',
  'acl.public_changed': 'acl',
  'mcp_server.created': 'mcp',
  'mcp_server.updated': 'mcp',
  'mcp_server.deleted': 'mcp',
  'code_worker.paired': 'credential',
  'code_worker.revoked': 'credential',
  'langfuse.updated': 'config',
  'skill_credential.set': 'credential',
  'skill_credential.deleted': 'credential',
  'passkey.registered': 'auth',
  'passkey.removed': 'auth',
  'audit.read': 'audit',
  'audit.exported': 'audit',
  'audit.purged': 'audit',
};

/** Result of the audited operation. Kept first-class instead of being encoded
 * into the action so `allowed` vs `denied` vs `failed` is queryable. */
export const AUDIT_OUTCOMES = ['success', 'failure', 'denied', 'pending'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/** Coarse severity for SIEM routing and alerting. */
export const AUDIT_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number];

/**
 * Who initiated the action. Non-human actors are first-class: a scheduled job,
 * an agent acting autonomously, an internal service, or a webhook are all
 * representable without forcing a `User` id.
 */
export const AUDIT_ACTOR_TYPES = [
  'user',
  'system',
  'agent',
  'service',
  'schedule',
  'webhook',
  'api',
] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

/** Primitive metadata values; event-specific payload is a flat string-keyed map
 * (e.g. `{ capability }` for grants, `{ runId, triggerType }` for agent runs). */
export type AuditMetadataValue = string | number | boolean | null;
export type AuditMetadata = Record<string, AuditMetadataValue>;

/** Denormalized actor identity captured at write time. */
export type AuditActor = {
  type: AuditActorType;
  /** Stable id (user id, service-account id, agent id); absent for anonymous
   * system events. */
  id?: string;
  /** Display name captured at write time so the record stays readable after the
   * underlying principal is renamed or deleted. */
  name: string;
};

/** Generic target of the action — not principal-locked, so it can describe a
 * role, agent, MCP server, config section, etc. */
export type AuditTarget = {
  type: string;
  id?: string;
  name?: string;
};

/** Request context for forensic joins and SIEM correlation. */
export type AuditContext = {
  /** Correlation id (`x-request-id` / `x-correlation-id`). */
  requestId?: string;
  ip?: string;
  userAgent?: string;
  sessionId?: string;
};

/** Per-entry tamper-evidence surfaced to readers. The full chain is verifiable
 * via the verify endpoint. */
export type AuditIntegrity = {
  /** Monotonic per-chain sequence number (1-based). */
  seq: number;
  /** SHA-256 of this entry's canonical content linked to `prevHash`. */
  hash: string;
  /** Hash of the previous entry in the chain (genesis links to a zero hash). */
  prevHash: string;
};

/** SystemGrant document as returned by the admin API. */
export type AdminSystemGrant = {
  id: string;
  principalType: PrincipalType;
  principalId: string;
  capability: string;
  grantedBy?: string;
  grantedAt: string;
  expiresAt?: string;
};

/** Audit log entry as returned by the admin API. */
export type AdminAuditLogEntry = {
  id: string;
  schemaVersion: number;
  category: AuditCategory;
  action: AuditAction;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  actor: AuditActor;
  target: AuditTarget;
  metadata?: AuditMetadata;
  context?: AuditContext;
  /** Absent = platform-operator entry; present = tenant-scoped entry. */
  tenantId?: string;
  integrity: AuditIntegrity;
  /** `createdAt` as an ISO 8601 string. */
  timestamp: string;
};

/** Group as returned by the admin API. */
export type AdminGroup = {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  topMembers: { name: string }[];
  isActive: boolean;
};

/** Member entry as returned by the admin API for group/role membership lists. */
export type AdminMember = {
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  joinedAt?: string;
};

/** Full user info returned by the admin user list endpoint. */
export type AdminUserListItem = {
  id: string;
  name: string;
  username: string;
  email: string;
  avatar: string;
  role: string;
  provider: string;
  createdAt?: string;
  updatedAt?: string;
};

/** Minimal user info returned by user search endpoints. */
export type AdminUserSearchResult = {
  id: string;
  name: string;
  email: string;
  username?: string;
  avatarUrl?: string;
};

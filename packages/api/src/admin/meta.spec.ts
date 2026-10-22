import { join } from 'path';
import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import mongoSanitize from 'express-mongo-sanitize';
import {
  AppService,
  getConfigRevision,
  loadWebSearchConfig,
  mergeConfigOverrides,
  ABSENT_CONFIG_REVISION,
  createConfigOperations,
  getConfigOverrideIssues,
  BASE_CONFIG_PRINCIPAL_ID,
  isConfigOverrideStateEmpty,
  ConfigRevisionConflictError,
} from '@librechat/data-schemas';
import {
  Constants,
  PrincipalType,
  PrincipalModel,
  configSchema,
  RerankerTypes,
  EModelEndpoint,
  SearchProviders,
  ScraperProviders,
  PERMISSION_SUB_KEYS,
  BASE_ONLY_CONFIG_PATHS,
  BASE_ONLY_CONFIG_SECTIONS,
  PROCESS_MCP_SERVER_FIELDS,
  INTERFACE_PERMISSION_FIELDS,
  mapModelToAzureConfig,
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
} from 'librechat-data-provider';
import type {
  AdminConfigFeatureFlag,
  ConfigOverrideLayer,
  ConfigPrincipal,
  AdminConfigMeta,
  ConfigRecord,
  ConfigStore,
  ConfigDraft,
  AppConfig,
  IRole,
} from '@librechat/data-schemas';
import type { MCPOptions } from 'librechat-data-provider';
import type { Request, Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminConfigDeps } from './config';
import type { AdminRolesDeps } from './roles';
import {
  redactConfigSecrets,
  encryptConfigSecretFields,
  resolveRuntimeConfigSecrets,
} from './secrets';
import { createRequestSanitizer, rejectUnsafeConfigKeys } from '~/middleware/sanitize';
import { resolvePreAuthAppConfig, resolvePreLoginAppConfig } from '~/app/resolve';
import { MCPServersRegistry } from '~/mcp/registry/MCPServersRegistry';
import { createMCPPolicyResolver } from '~/mcp/registry/policy';
import { createEnvReferencePolicy } from '~/app/allowlist';
import { resolveTitleConfig } from '~/endpoints/config';
import { createAppConfigService } from '~/app/service';
import { mergeOverrideLayers } from '~/app/overrides';
import { createAdminConfigHandlers } from './config';
import { createAdminRolesHandlers } from './roles';
import { ADMIN_CONFIG_FEATURES } from './meta';
import { loadWebSearchAuth } from '~/web';

/** Encryption reads `CREDS_KEY` when data-schemas loads, before any spec code runs. */
jest.mock('@librechat/data-schemas', () => {
  process.env.CREDS_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  return jest.requireActual('@librechat/data-schemas');
});

type Doc = Record<string, unknown>;
type ResponseBody = { config?: { overrides: Doc; revision?: string }; [key: string]: unknown };
type MockRes = Response & { statusCode: number; body: ResponseBody | undefined };
type MockReqInit = Omit<Partial<ServerRequest>, 'body'> & { body?: object };
type PatchEntry = { fieldPath: string; value: unknown };
type WriteHandler =
  | 'upsertConfigOverrides'
  | 'patchConfigField'
  | 'tombstoneConfigField'
  | 'deleteConfigField'
  | 'applyConfigChanges';

function mockRes(): MockRes {
  const res = { statusCode: 200, body: undefined } as MockRes;
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data: ResponseBody) => {
    res.body = data;
    return res;
  });
  return res;
}

function mockReq(init: MockReqInit = {}): ServerRequest {
  return {
    user: { id: 'u1', role: 'ADMIN', _id: { toString: () => 'u1' } },
    params: {},
    body: {},
    query: {},
    ...init,
  } as Partial<ServerRequest> as ServerRequest;
}

function createHandlers(overrides: Partial<AdminConfigDeps> = {}) {
  return createAdminConfigHandlers({
    listAllConfigs: jest.fn().mockResolvedValue([]),
    findConfigByPrincipal: jest.fn().mockResolvedValue(null),
    writeConfigDocument: jest.fn(
      async (_type: string, _id: string, draft: ConfigDraft): Promise<ConfigRecord> =>
        storedConfig(draft.overrides ?? {}),
    ),
    unsetConfigField: jest.fn().mockResolvedValue(null),
    deleteConfig: jest.fn().mockResolvedValue(null),
    toggleConfigActiveTracked: jest.fn().mockResolvedValue(null),
    hasConfigCapability: jest.fn().mockResolvedValue(true),
    hasAnyConfigReadAccess: jest.fn().mockResolvedValue(true),
    hasCapability: jest.fn().mockResolvedValue(true),
    getAppConfig: jest.fn().mockResolvedValue({ config: {} }),
    ...overrides,
  });
}

async function getMeta(): Promise<{ status: number; meta: AdminConfigMeta }> {
  const res = mockRes();
  await createHandlers().getConfigMeta(mockReq(), res);
  return { status: res.statusCode, meta: res.body as AdminConfigMeta };
}

async function write(
  handler: WriteHandler,
  init: MockReqInit,
  overrides: Partial<AdminConfigDeps> = {},
): Promise<MockRes> {
  const res = mockRes();
  await createHandlers(overrides)[handler](
    mockReq({ params: { principalType: 'role', principalId: 'r1' }, ...init }),
    res,
  );
  return res;
}

function patch(entries: PatchEntry[], overrides: Partial<AdminConfigDeps> = {}): Promise<MockRes> {
  return write('patchConfigField', { body: { entries } }, overrides);
}

function storedConfig(overrides: Doc, tombstones: string[] = []): ConfigRecord {
  return {
    _id: 'c1',
    principalType: 'role',
    principalId: 'r1',
    priority: 10,
    overrides,
    tombstones,
    isActive: true,
    configVersion: 1,
  } as Partial<ConfigRecord> as ConfigRecord;
}

function setIn(target: Doc, segments: string[], value: unknown): Doc {
  const [head, ...rest] = segments;
  const child = target[head];
  const parent = child != null && typeof child === 'object' ? (child as Doc) : {};
  return { ...target, [head]: rest.length === 0 ? value : setIn(parent, rest, value) };
}

/** Config operations over one in-memory document, so a probe runs the real store path. */
function memoryConfigOperations(initial: ConfigRecord): {
  operations: ReturnType<typeof createConfigOperations>;
  store: ConfigStore;
  current: () => ConfigRecord;
} {
  let record = initial;
  const store = {
    read: async () => record,
    write: async (_principal: unknown, draft: ConfigDraft) =>
      (record = { ...record, ...draft, configVersion: record.configVersion + 1 }),
  } as Partial<ConfigStore> as ConfigStore;
  return { operations: createConfigOperations(store), store, current: () => record };
}

/** Lets every pending promise settle, so a handler runs until it waits on something unresolved. */
function settle(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function getIn(target: object, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (node, segment) =>
        node != null && typeof node === 'object' ? (node as Doc)[segment] : undefined,
      target,
    );
}

/**
 * A config store over a map, for probes that run the store contract's real operations: whole
 * document writes under a revision precondition, and removals.
 */
function createMapStore(): ConfigStore {
  const documents = new Map<string, ConfigRecord>();
  let sequence = 0;
  const keyOf = ({ principalType, principalId }: ConfigPrincipal) =>
    `${principalType}:${principalId}`;
  const revisionOf = (record?: ConfigRecord) =>
    record ? getConfigRevision(record) : ABSENT_CONFIG_REVISION;
  return {
    read: async (principal) => documents.get(keyOf(principal)) ?? null,
    list: async () => [...documents.values()],
    listActive: async () => [...documents.values()].filter((record) => record.isActive),
    async write(principal, draft, expected) {
      const current = documents.get(keyOf(principal));
      if (expected !== revisionOf(current)) {
        throw new ConfigRevisionConflictError(current ? revisionOf(current) : null);
      }
      sequence += 1;
      const record: ConfigRecord = {
        ...draft,
        ...principal,
        _id: current?._id ?? String(sequence).padStart(24, '0'),
        configVersion: (current?.configVersion ?? 0) + 1,
      };
      documents.set(keyOf(principal), record);
      return record;
    },
    async remove(principal, expected) {
      const current = documents.get(keyOf(principal));
      if (expected !== undefined && expected !== revisionOf(current)) {
        throw new ConfigRevisionConflictError(current ? revisionOf(current) : null);
      }
      documents.delete(keyOf(principal));
      return current ?? null;
    },
    restore: async () => false,
  };
}

/** Config handler deps that read and write `store` through the admin API's own calls. */
function storeDeps(store: ConfigStore): Partial<AdminConfigDeps> {
  return {
    findConfigByPrincipal: (principalType, principalId) =>
      store.read({ principalType, principalId: principalId.toString() }),
    writeConfigDocument: (principalType, principalId, draft, expected) =>
      store.write({ principalType, principalId }, draft, expected),
  };
}

describe('GET /api/admin/config/meta', () => {
  it('answers 401 without a user and 403 without any config read access', async () => {
    const anonymous = mockRes();
    await createHandlers().getConfigMeta(mockReq({ user: undefined }), anonymous);
    expect(anonymous.statusCode).toBe(401);

    const hasAnyConfigReadAccess = jest.fn().mockResolvedValue(false);
    const forbidden = mockRes();
    await createHandlers({ hasAnyConfigReadAccess }).getConfigMeta(mockReq(), forbidden);
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.body).toEqual({ error: 'Insufficient permissions' });
    expect(hasAnyConfigReadAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
  });

  it('answers 500 without echoing the failure when the access check throws', async () => {
    const res = mockRes();
    const hasAnyConfigReadAccess = jest.fn().mockRejectedValue(new Error('db down: secret'));
    await createHandlers({ hasAnyConfigReadAccess }).getConfigMeta(mockReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Failed to get config meta' });
  });

  it('keeps its response keys stable', async () => {
    const { status, meta } = await getMeta();
    expect(status).toBe(200);
    expect(Object.keys(meta)).toEqual(['metaVersion', 'versions', 'features', 'limits', 'rules']);
    expect(meta.metaVersion).toBe(1);
    expect(Object.keys(meta.versions)).toEqual(['librechat', 'dataProvider', 'configSchema']);
    expect(Object.keys(meta.features).sort()).toEqual([
      'awaitedInvalidation',
      'azureGroupSecrets',
      'changesBatch',
      'deterministicPrecedence',
      'dottedKeys',
      'envAllowlist',
      'expectedRevision',
      'preAuthBaseOverrides',
      'principalCheck',
      'priorityRoute',
      'prunesEmptyParents',
      'readFilteredWriteResponses',
      'recordSecrets',
      'roleRenameMovesProfile',
      'secretRebinding',
      'sectionAllowlist',
      'webSearchStoredKeys',
      'yamlMcpHide',
      'yamlSecretPreview',
    ]);
    expect(meta.limits).toEqual({
      maxPatchEntries: 100,
      maxChangeOps: 1000,
      overrideCacheTtlMs: 60_000,
    });
    expect(Object.keys(meta.rules).sort()).toEqual([
      'acceptedSections',
      'arrayMergeKeys',
      'arraySecretFields',
      'atomicMergePaths',
      'baseOnlyPaths',
      'baseOnlySections',
      'basePrincipalSections',
      'interface',
      'overrideKeyMap',
      'processMcpFields',
      'recordSecretFields',
      'refusedMaps',
      'secretFields',
      'titleResolution',
    ]);
  });

  it('reports every admin config behaviour this server ships as on', async () => {
    const { meta } = await getMeta();
    expect(meta.features).toEqual({
      dottedKeys: true,
      sectionAllowlist: true,
      readFilteredWriteResponses: true,
      preAuthBaseOverrides: true,
      webSearchStoredKeys: true,
      expectedRevision: true,
      prunesEmptyParents: true,
      awaitedInvalidation: true,
      changesBatch: true,
      yamlMcpHide: true,
      deterministicPrecedence: true,
      priorityRoute: true,
      principalCheck: true,
      roleRenameMovesProfile: true,
      recordSecrets: true,
      azureGroupSecrets: true,
      yamlSecretPreview: true,
      envAllowlist: true,
      secretRebinding: true,
    });
  });

  it('reports the override cache TTL the app config service runs with', async () => {
    const res = mockRes();
    await createHandlers({ overrideCacheTtlMs: 15_000 }).getConfigMeta(mockReq(), res);
    expect((res.body as AdminConfigMeta).limits.overrideCacheTtlMs).toBe(15_000);
  });

  it('reports the versions this server was built with', async () => {
    const { meta } = await getMeta();
    const dataProvider = JSON.parse(
      readFileSync(join(__dirname, '../../../data-provider/package.json'), 'utf8'),
    ) as { version: string };
    expect(meta.versions).toEqual({
      librechat: Constants.VERSION,
      dataProvider: dataProvider.version,
      configSchema: Constants.CONFIG_VERSION,
    });
    expect(meta.versions.dataProvider).not.toContain('__');
  });
});

describe('meta rules equal the rules the server applies', () => {
  let meta: AdminConfigMeta;
  beforeAll(async () => {
    ({ meta } = await getMeta());
  });

  it('lists the sections and paths of the live constants', () => {
    expect(meta.rules.acceptedSections).toEqual(Object.keys(configSchema.shape));
    expect(meta.rules.baseOnlySections).toEqual([...BASE_ONLY_CONFIG_SECTIONS]);
    expect(meta.rules.basePrincipalSections).toEqual([...BASE_PRINCIPAL_CONFIG_SECTIONS]);
    expect(meta.rules.baseOnlyPaths).toEqual([...BASE_ONLY_CONFIG_PATHS]);
    expect(meta.rules.processMcpFields).toEqual([...PROCESS_MCP_SERVER_FIELDS]);
    expect(meta.rules.interface).toEqual({
      permissionFields: [...INTERFACE_PERMISSION_FIELDS],
      runtimeFields: [...RUNTIME_CONFIG_INTERFACE_FIELDS],
      permissionSubKeys: [...PERMISSION_SUB_KEYS],
    });
  });

  it('reports per-field title resolution exactly when titles resolve endpoints.all per field', () => {
    const { titleModel } = resolveTitleConfig({
      appConfig: {
        endpoints: { all: { streamRate: 1 }, openAI: { titleModel: 'x' } },
      } as Partial<AppConfig> as AppConfig,
      endpoint: EModelEndpoint.openAI,
    });
    expect(meta.rules.titleResolution).toBe(titleModel === 'x' ? 'field' : 'block');
    expect(meta.rules.titleResolution).toBe('field');
  });

  it('lists exactly the secret fields reads withhold, with their preview companions', () => {
    expect(meta.rules.secretFields.length).toBeGreaterThan(0);
    const placeholder = '${SOME_KEY}';
    const stalePreview = 'sk-live-...cdef';
    const write = (value: string): Doc =>
      meta.rules.secretFields.reduce<Doc>(
        (doc, { path, previewPath }) =>
          setIn(setIn(doc, path.split('.'), value), previewPath.split('.'), stalePreview),
        {},
      );

    const literals = redactConfigSecrets(write('sk-live-0123456789abcdef'));
    const placeholders = redactConfigSecrets(write(placeholder));
    for (const { path, previewPath, allowEnvPlaceholder } of meta.rules.secretFields) {
      expect(getIn(literals, path)).toBeUndefined();
      expect(getIn(literals, previewPath)).toBe('*'.repeat(stalePreview.length));
      expect(getIn(placeholders, path)).toBe(allowEnvPlaceholder ? placeholder : undefined);
    }
  });

  it('lists the array secrets reads withhold on custom endpoints and Azure groups', () => {
    expect(meta.rules.arraySecretFields).toEqual([
      {
        arrayPath: 'endpoints.custom',
        secretKey: 'apiKey',
        previewKey: 'apiKeyPreview',
        identityKey: 'name',
      },
      {
        arrayPath: 'endpoints.azureOpenAI.groups',
        secretKey: 'apiKey',
        previewKey: 'apiKeyPreview',
        identityKey: 'group',
      },
    ]);
    for (const { arrayPath, secretKey, previewKey, identityKey } of meta.rules.arraySecretFields) {
      const doc = setIn({}, arrayPath.split('.'), [{ [identityKey]: 'a', [secretKey]: 'sk-live' }]);
      expect(getIn(redactConfigSecrets(doc), arrayPath)).toEqual([
        { [identityKey]: 'a', [previewKey]: '********' },
      ]);
    }
  });

  it('lists the record secrets reads withhold (MCP servers, Azure groupMap), with their previews', () => {
    expect(meta.rules.recordSecretFields).toEqual([
      {
        recordPath: 'mcpServers',
        secretPath: 'oauth.client_secret',
        previewPath: 'oauth.client_secretPreview',
      },
      { recordPath: 'mcpServers', secretPath: 'apiKey.key', previewPath: 'apiKey.keyPreview' },
      {
        recordPath: 'endpoints.azureOpenAI.groupMap',
        secretPath: 'apiKey',
        previewPath: 'apiKeyPreview',
      },
    ]);
    for (const { recordPath, secretPath, previewPath } of meta.rules.recordSecretFields) {
      const entry = setIn({}, secretPath.split('.'), 'sk-live-0123456789abcdef');
      const stored = encryptConfigSecretFields({ [`${recordPath}.s1`]: entry })[`${recordPath}.s1`];
      expect(String(getIn(stored as Doc, secretPath))).toMatch(/^v3:/);
      const read = redactConfigSecrets(setIn({}, recordPath.split('.'), { s1: stored }));
      expect(getIn(read, `${recordPath}.s1.${secretPath}`)).toBeUndefined();
      expect(getIn(read, `${recordPath}.s1.${previewPath}`)).toBe('...cdef');
    }
  });

  it('refuses writes to every listed map and process MCP field', async () => {
    for (const path of meta.rules.refusedMaps) {
      expect((await patch([{ fieldPath: path, value: { 'X-Token': 't' } }])).statusCode).toBe(400);
    }
    for (const field of meta.rules.processMcpFields) {
      const res = await patch([{ fieldPath: `mcpServers.s1.${field}`, value: 'x' }]);
      expect(res.statusCode).toBe(400);
    }
  });

  it('drops writes to base-only sections', async () => {
    const writeConfigDocument = jest.fn();
    for (const section of meta.rules.baseOnlySections) {
      const res = await patch([{ fieldPath: `${section}.x`, value: 1 }], { writeConfigDocument });
      expect(res.body).toEqual({ message: 'No actionable field entries provided', revision: null });
    }
    expect(writeConfigDocument).not.toHaveBeenCalled();
  });

  it('requires the listed merge key on items of every merged array', () => {
    for (const [arrayPath, key] of Object.entries(meta.rules.arrayMergeKeys)) {
      const segments = arrayPath.split('.');
      const missing = getConfigOverrideIssues(setIn({}, segments, [{ other: 1 }]));
      expect(missing).toContainEqual(expect.objectContaining({ code: 'missing_merge_key' }));
      const keyed = getConfigOverrideIssues(setIn({}, segments, [{ [key]: 'a' }]));
      expect(keyed).not.toContainEqual(expect.objectContaining({ code: 'missing_merge_key' }));
    }
  });

  it('replaces every listed atomic path whole, under the mapped resolved key', () => {
    const theme = (name: string, modes: Doc) => ({ version: 1, name, modes });
    for (const atomicPath of meta.rules.atomicMergePaths) {
      const [section, ...rest] = atomicPath.split('.');
      const resolved = [meta.rules.overrideKeyMap[section] ?? section, ...rest];
      const base = setIn({}, resolved, theme('base', { light: { colors: { a: '0 0 0' } } }));
      const override = theme('override', { dark: { colors: { b: '1 1 1' } } });
      const merged = mergeConfigOverrides(Object.assign({ config: {} } as AppConfig, base), [
        storedConfig(setIn({}, atomicPath.split('.'), override)),
      ]);
      expect(getIn(merged, resolved.join('.'))).toEqual(override);
    }
  });
});

/**
 * Each flag is checked against the behaviour itself: a flag left `false` once its change lands,
 * or set `true` without it, fails here.
 */
const FEATURE_PROBES: Record<AdminConfigFeatureFlag, () => Promise<boolean>> = {
  async dottedKeys() {
    const body = {
      overrides: { endpoints: { bedrock: { inferenceProfiles: { 'us.a.b': 'x' } } } },
    };
    const req = {
      path: '/api/admin/config/role/r1',
      headers: {},
      query: {},
      body: structuredClone(body),
    } as Request;
    const next = jest.fn();
    createRequestSanitizer(mongoSanitize)(req, mockRes(), next);
    const keepsDots =
      next.mock.calls.length === 1 && JSON.stringify(req.body) === JSON.stringify(body);

    const unsafe = mockRes();
    rejectUnsafeConfigKeys({ body: { overrides: { $where: 1 } } } as Request, unsafe, jest.fn());

    const flagsFixedShape = getConfigOverrideIssues({ registration: { 'a.b': 1 } }).some(
      (issue) => issue.code === 'dotted_key',
    );
    return keepsDots && unsafe.statusCode === 400 && flagsFixedShape;
  },
  async sectionAllowlist() {
    const put = await write('upsertConfigOverrides', {
      body: { overrides: { paths: { uploads: '/tmp' } } },
    });
    const fieldWrites = await Promise.all([
      patch([{ fieldPath: 'paths.uploads', value: '/tmp' }]),
      write('tombstoneConfigField', { body: { fieldPath: 'paths' } }),
      write('applyConfigChanges', {
        body: { ops: [{ op: 'set', fieldPath: 'paths.uploads', value: '/tmp' }] },
      }),
    ]);
    const merged = mergeConfigOverrides(
      { config: {}, paths: { uploads: '/srv/uploads' } } as Partial<AppConfig> as AppConfig,
      [storedConfig({ paths: { uploads: '/tmp' } }), storedConfig({}, ['paths'])],
    );
    return (
      put.statusCode === 400 &&
      JSON.stringify(put.body?.issues) ===
        JSON.stringify([{ path: 'paths', segments: ['paths'], code: 'unknown_section' }]) &&
      fieldWrites.every((res) => res.statusCode === 400 && res.body?.code === 'UNKNOWN_SECTION') &&
      merged.paths?.uploads === '/srv/uploads'
    );
  },
  async readFilteredWriteResponses() {
    const written = storedConfig({
      endpoints: { openAI: { titleModel: 'gpt-4o-mini' } },
      memory: { disabled: true },
    });
    /** Each request gets its own store; a grant lookup made after its write fails the request. */
    const scopedDeps = (): Partial<AdminConfigDeps> => {
      let committed = false;
      const commit = jest.fn(async () => {
        committed = true;
        return written;
      });
      return {
        hasConfigCapability: jest.fn(
          async (_user, section, verb = 'manage') => verb === 'manage' && section === 'endpoints',
        ),
        getReadableConfigSections: jest.fn(async () => {
          if (committed) {
            throw new Error('read access resolved after the write');
          }
          return { broad: false, sections: new Set<string>() };
        }),
        writeConfigDocument: commit,
        unsetConfigField: commit,
      };
    };
    const responses = await Promise.all([
      patch([{ fieldPath: 'endpoints.openAI.titleModel', value: 'gpt-4o-mini' }], scopedDeps()),
      write('tombstoneConfigField', { body: { fieldPath: 'endpoints.bedrock' } }, scopedDeps()),
      write('deleteConfigField', { query: { fieldPath: 'endpoints.bedrock' } }, scopedDeps()),
      write(
        'applyConfigChanges',
        {
          body: {
            ops: [{ op: 'set', fieldPath: 'endpoints.openAI.titleModel', value: 'gpt-4o-mini' }],
          },
        },
        scopedDeps(),
      ),
    ]);
    return responses.every((res) => {
      const overrides = res.body?.config?.overrides;
      return (
        res.statusCode === 200 &&
        overrides != null &&
        'endpoints' in overrides &&
        !('memory' in overrides)
      );
    });
  },
  async preAuthBaseOverrides() {
    const store = new Map<string, unknown>();
    const base: ConfigOverrideLayer = {
      principalType: PrincipalType.ROLE,
      principalId: BASE_CONFIG_PRINCIPAL_ID,
      priority: 0,
      overrides: {
        registration: { socialLogins: ['github'] },
        turnstile: { siteKey: 'base-site-key' },
      },
    };
    const { getAppConfig } = createAppConfigService({
      loadBaseConfig: () =>
        AppService({
          config: {
            registration: { socialLogins: ['openid'] },
            turnstile: { siteKey: 'yaml-site-key' },
          },
        }),
      setCachedTools: async () => undefined,
      getCache: () => ({
        get: async (key: string) => store.get(key),
        set: async (key: string, value: unknown) => store.set(key, value),
        delete: async (key: string) => store.delete(key),
      }),
      cacheKeys: { APP_CONFIG: 'app_config' },
      getApplicableConfigs: jest.fn().mockResolvedValue([base]),
      getUserPrincipals: jest.fn().mockResolvedValue([]),
    });
    const signedOut = await resolvePreLoginAppConfig(getAppConfig);
    const preAuth = await resolvePreAuthAppConfig(getAppConfig);
    return [signedOut, preAuth].every(
      (config) =>
        config.registration?.socialLogins?.join() === 'github' &&
        config.turnstileConfig?.siteKey === 'yaml-site-key',
    );
  },
  async webSearchStoredKeys() {
    const keys = {
      'webSearch.serperApiKey': 'serper-admin-secret',
      'webSearch.searxngApiKey': 'searxng-admin-secret',
      'webSearch.keenableApiKey': 'keenable-admin-secret',
    };
    const stored = encryptConfigSecretFields(keys);
    const encrypted = Object.keys(keys).every((path) => String(stored[path]).startsWith('v3:'));

    const { authenticated, authResult } = await loadWebSearchAuth({
      userId: 'meta-spec',
      webSearchConfig: loadWebSearchConfig({
        searchProvider: SearchProviders.SERPER,
        scraperProvider: ScraperProviders.KEENABLE,
        rerankerType: RerankerTypes.NONE,
        keenableApiUrl: '',
        serperApiKey: stored['webSearch.serperApiKey'] as string,
      }),
      loadAuthValues: jest.fn().mockResolvedValue({}),
    });
    const usesStoredKey = authenticated && authResult.serperApiKey === 'serper-admin-secret';

    const rebinding = await patch(
      [{ fieldPath: 'webSearch.searxngInstanceUrl', value: 'https://collector.example.com' }],
      {
        findConfigByPrincipal: jest.fn().mockResolvedValue(
          storedConfig({
            webSearch: {
              searxngInstanceUrl: 'https://searx.example.com',
              searxngApiKey: stored['webSearch.searxngApiKey'],
            },
          }),
        ),
      },
    );
    const requiresReentry =
      rebinding.statusCode === 400 && rebinding.body?.code === 'CONFIG_SECRET_REENTRY_REQUIRED';
    return encrypted && usesStoredKey && requiresReentry;
  },
  async expectedRevision() {
    const writeConfigDocument = jest.fn(
      async (
        _type: string,
        _id: string,
        draft: ConfigDraft,
        _expected: string,
      ): Promise<ConfigRecord> => ({ ...storedConfig(draft.overrides ?? {}), configVersion: 2 }),
    );
    const write = async (expectedRevision: unknown) => {
      const res = mockRes();
      await createHandlers({
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue(storedConfig({ interface: { customWelcome: 'v1' } })),
        writeConfigDocument,
      }).patchConfigField(
        mockReq({
          params: { principalType: 'role', principalId: 'r1' },
          body: {
            entries: [{ fieldPath: 'interface.customWelcome', value: 'v2' }],
            expectedRevision,
          },
        }),
        res,
      );
      return res;
    };

    const stale = await write('c1:0');
    const malformed = await write('c1');
    const current = await write('c1:1');
    return (
      stale.statusCode === 409 &&
      stale.body?.code === 'CONFIG_VERSION_CONFLICT' &&
      stale.body?.currentRevision === 'c1:1' &&
      malformed.statusCode === 400 &&
      malformed.body?.code === 'INVALID_EXPECTED_REVISION' &&
      current.statusCode === 200 &&
      current.body?.config?.revision === 'c1:2' &&
      writeConfigDocument.mock.calls.length === 1 &&
      writeConfigDocument.mock.calls[0][3] === 'c1:1'
    );
  },
  async prunesEmptyParents() {
    const { operations, current } = memoryConfigOperations(
      storedConfig({
        balance: { startBalance: 5 },
        interface: { theme: { name: 'x' } },
        endpoints: { custom: [{ name: 'gw', headers: { A: 'a' } }] },
      }),
    );
    const principal = { principalType: PrincipalType.ROLE, principalId: 'r1' };

    await operations.unsetFields(principal, [
      'balance.startBalance',
      'endpoints.custom.0.headers.A',
    ]);
    await operations.tombstoneFields(principal, PrincipalModel.ROLE, 'interface.theme.name');
    const record = current();
    return (
      JSON.stringify(record.overrides) ===
        JSON.stringify({ endpoints: { custom: [{ name: 'gw' }] } }) &&
      record.tombstones.includes('interface.theme.name') &&
      isConfigOverrideStateEmpty({ overrides: { balance: {} }, tombstones: [] })
    );
  },
  async awaitedInvalidation() {
    let release: () => void = () => undefined;
    const invalidateConfigCaches = jest.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const res = mockRes();
    const written = createHandlers({ invalidateConfigCaches }).patchConfigField(
      mockReq({
        params: { principalType: 'role', principalId: 'r1' },
        body: { entries: [{ fieldPath: 'interface.customWelcome', value: 'hi' }] },
      }),
      res,
    );
    await settle();
    const held = invalidateConfigCaches.mock.calls.length === 1 && res.body === undefined;
    release();
    await written;

    const getAppConfig = jest.fn().mockResolvedValue({ config: {} });
    await createHandlers({ getAppConfig }).getBaseConfig(mockReq(), mockRes());
    const bypassed = getAppConfig.mock.calls.some(
      ([options]) => (options as { bypassOverrideCache?: boolean }).bypassOverrideCache === true,
    );

    const entries = new Map<string, unknown>();
    let releaseRead: (configs: ConfigRecord[]) => void = () => undefined;
    const getApplicableConfigs = jest
      .fn()
      .mockImplementationOnce(() => new Promise((resolve) => (releaseRead = resolve)))
      .mockResolvedValue([]);
    const service = createAppConfigService({
      loadBaseConfig: async () => ({ config: {} }) as AppConfig,
      setCachedTools: async () => undefined,
      getCache: () => ({
        get: async (key: string) => entries.get(key),
        set: async (key: string, value: unknown) => entries.set(key, value),
        delete: async (key: string) => entries.delete(key),
      }),
      cacheKeys: { APP_CONFIG: 'app_config' },
      getApplicableConfigs,
      getUserPrincipals: async () => [],
    });
    const merging = service.getAppConfig({ role: 'ADMIN' });
    await settle();
    await service.clearOverrideCache();
    releaseRead([storedConfig({ x: 'stale' })]);
    await merging;
    await service.getAppConfig({ role: 'ADMIN' });
    const dropsStaleMerge = getApplicableConfigs.mock.calls.length === 2;

    return held && res.statusCode === 200 && bypassed && dropsStaleMerge;
  },
  async deterministicPrecedence() {
    const layer = (
      principalType: PrincipalType,
      principalId: string,
      priority: number,
      _id: string,
    ): ConfigOverrideLayer => ({
      principalType,
      principalId,
      priority,
      _id,
      overrides: { interface: { customWelcome: principalId } },
    });
    const winner = (...configs: ConfigOverrideLayer[]) =>
      mergeConfigOverrides({ config: {} } as AppConfig, configs).interfaceConfig?.customWelcome;
    const base = layer(PrincipalType.ROLE, '__base__', 50, 'a3');
    const role = layer(PrincipalType.ROLE, 'r1', 5, 'a2');
    const group = layer(PrincipalType.GROUP, 'g1', 5, 'a1');
    const user = layer(PrincipalType.USER, 'u1', 5, 'a0');
    const later = layer(PrincipalType.GROUP, 'g2', 5, 'a4');
    const ordered =
      winner(role, base) === 'r1' &&
      winner(base, role) === 'r1' &&
      winner(group, role) === 'g1' &&
      winner(role, group) === 'g1' &&
      winner(user, group, role) === 'u1' &&
      winner(later, group) === 'g2' &&
      winner(group, later) === 'g2';

    const store = createMapStore();
    const handlers = createHandlers(storeDeps(store));
    const put = async (principalType: PrincipalType, principalId: string, body: object) => {
      await handlers.upsertConfigOverrides(
        mockReq({ params: { principalType, principalId }, body }),
        mockRes(),
      );
      return (await store.read({ principalType, principalId }))?.priority;
    };
    const overrides = { interface: { customWelcome: 'hi' } };
    const defaults = await Promise.all([
      put(PrincipalType.ROLE, 'r1', { overrides }),
      put(PrincipalType.GROUP, 'g1', { overrides }),
      put(PrincipalType.USER, 'u1', { overrides }),
    ]);
    await put(PrincipalType.ROLE, 'r1', { overrides, priority: 33 });
    const kept = await put(PrincipalType.ROLE, 'r1', {
      overrides: { interface: { customWelcome: 'again' } },
    });
    await handlers.applyConfigChanges(
      mockReq({
        params: { principalType: PrincipalType.GROUP, principalId: 'g0' },
        body: { ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'hi' }] },
      }),
      mockRes(),
    );
    const batchDefault = (
      await store.read({ principalType: PrincipalType.GROUP, principalId: 'g0' })
    )?.priority;

    const operations = createConfigOperations(store);
    await operations.setFields(
      { principalType: PrincipalType.ROLE, principalId: '__base__' },
      PrincipalModel.ROLE,
      { 'interface.customWelcome': 'base' },
      500,
    );
    await operations.setPriority({ principalType: PrincipalType.GROUP, principalId: 'g0' }, 33);
    const listed = mockRes();
    await createHandlers({ listAllConfigs: () => operations.listConfigs() }).listConfigs(
      mockReq(),
      listed,
    );
    const listOrder = (listed.body?.configs as ConfigRecord[] | undefined)
      ?.map(({ principalId }) => principalId)
      .join();

    /** Statuses of a PATCH `/fields` and a dry-run batch setting `memory.agent.model` on a role
     *  over `yaml`, with Base tombstoning `tombstones` and setting `fields`. */
    const floorStatuses = async (
      yaml: object,
      tombstones: string[],
      fields: Record<string, unknown>,
    ) => {
      const floorStore = createMapStore();
      const floorOperations = createConfigOperations(floorStore);
      const base = { principalType: PrincipalType.ROLE, principalId: '__base__' };
      await floorOperations.tombstoneFields(base, PrincipalModel.ROLE, tombstones);
      await floorOperations.setFields(base, PrincipalModel.ROLE, fields);
      const floorHandlers = createHandlers({
        ...storeDeps(floorStore),
        getAppConfig: jest.fn().mockResolvedValue({ config: yaml }),
      });
      const params = { principalType: PrincipalType.ROLE, principalId: 'r2' };
      const batch = mockRes();
      await floorHandlers.applyConfigChanges(
        mockReq({
          params,
          body: {
            ops: [{ op: 'set', fieldPath: 'memory.agent.model', value: 'gpt-4.1' }],
            dryRun: true,
          },
        }),
        batch,
      );
      const patched = await patch([{ fieldPath: 'memory.agent.model', value: 'gpt-4.1' }], {
        ...storeDeps(floorStore),
        getAppConfig: jest.fn().mockResolvedValue({ config: yaml }),
      });
      return `${patched.statusCode},${batch.statusCode}`;
    };
    const validOnlyOverBase = await floorStatuses(
      { memory: { agent: { id: 'agent_1' } } },
      ['memory.agent.id'],
      { 'memory.agent.provider': 'openAI', 'memory.agent.model': 'gpt-4o' },
    );
    const invalidOnlyOverBase = await floorStatuses(
      { memory: { agent: { provider: 'openAI', model: 'gpt-4o' } } },
      ['memory.agent.provider', 'memory.agent.model'],
      { 'memory.agent.id': 'agent_9' },
    );

    return (
      ordered &&
      defaults.join() === '10,20,100' &&
      kept === 33 &&
      batchDefault === 20 &&
      listOrder === '__base__,g1,r1,g0,u1' &&
      validOnlyOverBase === '200,200' &&
      invalidOnlyOverBase === '400,400'
    );
  },
  async priorityRoute() {
    const store = createMapStore();
    const operations = createConfigOperations(store);
    const principal = { principalType: PrincipalType.ROLE, principalId: 'r1' };
    await operations.setFields(principal, PrincipalModel.ROLE, { 'interface.customWelcome': 'x' });
    await operations.tombstoneFields(principal, PrincipalModel.ROLE, 'memory.agent');
    await operations.setActive(principal, false);
    const before = await store.read(principal);

    const setConfigPriority: AdminConfigDeps['setConfigPriority'] = (type, id, priority, options) =>
      operations.setPriority({ principalType: type, principalId: id }, priority, options);
    const route = async (
      principalId: string,
      body: object,
      deps: Partial<AdminConfigDeps> = {},
    ) => {
      const res = mockRes();
      await createHandlers({ setConfigPriority, ...deps }).updateConfigPriority(
        mockReq({ params: { principalType: PrincipalType.ROLE, principalId }, body }),
        res,
      );
      return res;
    };
    const updated = await route('r1', { priority: 42 });
    const after = await store.read(principal);
    const missing = await route('nobody', { priority: 1 });
    const invalid = await route('r1', { priority: -1 });
    const sectionScoped = await route(
      'r1',
      { priority: 7 },
      { hasConfigCapability: jest.fn(async (_user, section) => section != null) },
    );
    return (
      updated.statusCode === 200 &&
      after?.priority === 42 &&
      JSON.stringify(after.overrides) === JSON.stringify(before?.overrides) &&
      JSON.stringify(after.tombstones) === JSON.stringify(before?.tombstones) &&
      after.isActive === false &&
      missing.statusCode === 404 &&
      missing.body?.code === 'CONFIG_NOT_FOUND' &&
      invalid.statusCode === 400 &&
      invalid.body?.code === 'INVALID_PRIORITY' &&
      sectionScoped.statusCode === 403 &&
      (await store.read(principal))?.priority === 42
    );
  },
  async principalCheck() {
    const store = createMapStore();
    const principalExists = jest.fn(async (_type: PrincipalType, id: string) => id === 'editor');
    const handlers = createHandlers({ ...storeDeps(store), principalExists });
    const write = async (
      handler:
        | 'upsertConfigOverrides'
        | 'patchConfigField'
        | 'tombstoneConfigField'
        | 'applyConfigChanges',
      principalId: string,
      body: object,
    ) => {
      const res = mockRes();
      await handlers[handler](
        mockReq({ params: { principalType: PrincipalType.ROLE, principalId }, body }),
        res,
      );
      return res;
    };
    const refused = await Promise.all([
      write('upsertConfigOverrides', 'ghost', { overrides: { interface: { customWelcome: 'x' } } }),
      write('patchConfigField', 'ghost', {
        entries: [{ fieldPath: 'interface.customWelcome', value: 'x' }],
      }),
      write('tombstoneConfigField', 'ghost', { fieldPath: 'interface.customWelcome' }),
      write('applyConfigChanges', 'ghost', {
        ops: [{ op: 'set', fieldPath: 'interface.customWelcome', value: 'x' }],
      }),
      write('applyConfigChanges', 'ghost', {
        ops: [{ op: 'unset', fieldPath: 'interface.customWelcome' }],
        priority: 5,
      }),
    ]);
    const created = await write('upsertConfigOverrides', 'editor', {
      overrides: {},
      expectedRevision: ABSENT_CONFIG_REVISION,
    });
    const again = await write('upsertConfigOverrides', 'editor', {
      overrides: {},
      expectedRevision: ABSENT_CONFIG_REVISION,
    });

    /** A tombstone checks the document it writes over: here a DELETE lands after its read. */
    const retired = { principalType: PrincipalType.ROLE, principalId: 'retired' };
    await createConfigOperations(store).setFields(retired, PrincipalModel.ROLE, {
      'interface.customWelcome': 'old',
    });
    let removedConcurrently = false;
    const raced = mockRes();
    await createHandlers({
      ...storeDeps(store),
      principalExists,
      findConfigByPrincipal: async (principalType, principalId) => {
        const found = await store.read({ principalType, principalId });
        if (found && !removedConcurrently) {
          removedConcurrently = true;
          await store.remove({ principalType, principalId });
        }
        return found;
      },
    }).tombstoneConfigField(
      mockReq({ params: retired, body: { fieldPath: 'interface.customWelcome' } }),
      raced,
    );

    return (
      refused.every((res) => res.statusCode === 404 && res.body?.code === 'PRINCIPAL_NOT_FOUND') &&
      (await store.read({ principalType: PrincipalType.ROLE, principalId: 'ghost' })) === null &&
      created.statusCode === 201 &&
      again.statusCode === 409 &&
      again.body?.code === 'CONFIG_VERSION_CONFLICT' &&
      removedConcurrently &&
      raced.statusCode === 404 &&
      raced.body?.code === 'PRINCIPAL_NOT_FOUND' &&
      (await store.read(retired)) === null
    );
  },
  async roleRenameMovesProfile() {
    const store = createMapStore();
    const operations = createConfigOperations(store);
    const role = (principalId: string) => ({ principalType: PrincipalType.ROLE, principalId });
    await operations.setFields(role('editor'), PrincipalModel.ROLE, {
      'interface.customWelcome': 'moved',
    });
    await operations.setFields(role('taken'), PrincipalModel.ROLE, {
      'interface.customWelcome': 'kept',
    });
    const moveGrantsToPrincipal = jest.fn().mockResolvedValue({ moved: [], superseded: [] });
    const moveAclEntriesToPrincipal = jest.fn().mockResolvedValue([]);
    const deps: Partial<AdminRolesDeps> = {
      getRoleByName: jest.fn(async (name: string) =>
        name === 'editor' ? ({ name } as IRole) : null,
      ),
      updateRoleByName: jest.fn(async (_name: string, updates: Partial<IRole>) => updates as IRole),
      findUserIdsByRole: jest.fn().mockResolvedValue([]),
      updateUsersByRole: jest.fn().mockResolvedValue(undefined),
      findConfigByPrincipal: (type, id) => store.read({ principalType: type, principalId: id }),
      renameConfigPrincipal: (_type, from, to) => operations.movePrincipal(role(from), role(to)),
      moveGrantsToPrincipal,
      moveAclEntriesToPrincipal,
    };
    const handlers = createAdminRolesHandlers(deps as AdminRolesDeps);
    const rename = async (name: string) => {
      const res = mockRes();
      await handlers.updateRole(mockReq({ params: { name: 'editor' }, body: { name } }), res);
      return res;
    };
    const conflict = await rename('taken');
    const reserved = await rename('__base__');
    const renamed = await rename('reviewer');
    const moved = await store.read(role('reviewer'));
    return (
      conflict.statusCode === 409 &&
      conflict.body?.code === 'ROLE_CONFIG_CONFLICT' &&
      reserved.statusCode === 400 &&
      reserved.body?.code === 'ROLE_NAME_RESERVED' &&
      renamed.statusCode === 200 &&
      (await store.read(role('editor'))) === null &&
      getIn(moved?.overrides ?? {}, 'interface.customWelcome') === 'moved' &&
      getIn((await store.read(role('taken')))?.overrides ?? {}, 'interface.customWelcome') ===
        'kept' &&
      moveGrantsToPrincipal.mock.calls[0]?.slice(0, 3).join() === 'role,editor,reviewer' &&
      moveAclEntriesToPrincipal.mock.calls[0]?.slice(0, 3).join() === 'role,editor,reviewer'
    );
  },
  async changesBatch() {
    const writeConfigDocument = jest.fn(
      async (_type: string, _id: string, draft: ConfigDraft): Promise<ConfigRecord> => ({
        ...storedConfig(draft.overrides ?? {}),
        tombstones: draft.tombstones ?? [],
        configVersion: 2,
      }),
    );
    const deps = {
      findConfigByPrincipal: jest
        .fn()
        .mockResolvedValue(storedConfig({ interface: { customWelcome: 'v1' } })),
      writeConfigDocument,
    };
    const send = async (ops: unknown[]) => {
      const res = mockRes();
      await createHandlers(deps).applyConfigChanges(
        mockReq({ params: { principalType: 'role', principalId: 'r1' }, body: { ops } }),
        res,
      );
      return res;
    };

    const tooMany = await send(
      Array.from({ length: 1001 }, (_, i) => ({
        op: 'set',
        fieldPath: `interface.customWelcome${i}`,
        value: 'x',
      })),
    );
    const refused = await send([
      { op: 'set', fieldPath: 'interface.customWelcome', value: 'v2' },
      { op: 'set', fieldPath: 'interface.modelSelect', value: 'yes' },
    ]);
    const writesAfterRefusal = writeConfigDocument.mock.calls.length;
    const applied = await send([
      { op: 'set', fieldPath: 'interface.customWelcome', value: 'v2' },
      { op: 'tombstone', fieldPath: 'interface.privacyPolicy' },
    ]);
    const [, , draft] = writeConfigDocument.mock.calls[0] ?? [];
    return (
      tooMany.statusCode === 400 &&
      tooMany.body?.code === 'TOO_MANY_OPS' &&
      refused.statusCode === 400 &&
      writesAfterRefusal === 0 &&
      applied.statusCode === 200 &&
      writeConfigDocument.mock.calls.length === 1 &&
      getIn(draft?.overrides ?? {}, 'interface.customWelcome') === 'v2' &&
      (draft?.tombstones ?? []).includes('interface.privacyPolicy')
    );
  },
  async yamlMcpHide() {
    const docs: MCPOptions = { type: 'streamable-http', url: 'https://docs.example.com/mcp' };
    const local: MCPOptions = { type: 'stdio', command: 'node', args: ['tools.js'] };
    const yaml = { docs, local };
    const principal = { id: 'u1', role: 'USER' };

    const store = createMapStore();
    const written = mockRes();
    await createHandlers(storeDeps(store)).tombstoneConfigField(
      mockReq({
        params: { principalType: 'role', principalId: 'r1' },
        body: { fieldPath: 'mcpServers.docs' },
      }),
      written,
    );
    const record = await store.read({ principalType: PrincipalType.ROLE, principalId: 'r1' });
    if (written.statusCode !== 200 || !record?.tombstones.includes('mcpServers.docs')) {
      return false;
    }

    const merged = mergeConfigOverrides(
      { config: { mcpServers: yaml }, mcpConfig: yaml } as Partial<AppConfig> as AppConfig,
      [{ ...record, tombstones: [...record.tombstones, 'mcpServers.local'] }],
    );
    const registry = new MCPServersRegistry(
      mongoose,
      null,
      null,
      createMCPPolicyResolver(jest.fn().mockResolvedValue(merged)),
    );
    registry.setYamlServerOptions(yaml);
    await registry.addServerStub('docs', docs, 'CACHE');
    const appLevel = await registry.getServerConfig('docs');
    const withheld =
      appLevel !== undefined &&
      (await registry.getServerConfig('docs', principal.id, undefined, principal.role)) ===
        undefined;
    const refusesCheckout =
      appLevel !== undefined && (await registry.isHiddenFromPrincipal('docs', appLevel, principal));
    const hidden = await registry.resolveHiddenServerNames({ userId: principal.id, role: 'USER' });

    const unreadable = new MCPServersRegistry(
      mongoose,
      null,
      null,
      jest.fn().mockRejectedValue(new Error('config read failed')),
    );
    unreadable.setYamlServerOptions(yaml);
    const failsClosed = (await unreadable.resolveHiddenServerNames({ userId: 'u2' })).has('docs');

    return withheld && refusesCheckout && !hidden.has('local') && failsClosed;
  },
  async recordSecrets() {
    const server = (overrides: Doc = {}): Doc => ({
      type: 'streamable-http',
      url: 'https://mcp.example.com/mcp',
      apiKey: { source: 'admin', authorization_type: 'bearer', key: 'sk-mcp-admin-secret' },
      ...overrides,
    });
    const stored = encryptConfigSecretFields({ 'mcpServers.github': server() })[
      'mcpServers.github'
    ] as Doc;
    const encrypted = String(getIn(stored, 'apiKey.key')).startsWith('v3:');
    const read = redactConfigSecrets(structuredClone({ mcpServers: { github: stored } }));
    const hidden =
      getIn(read, 'mcpServers.github.apiKey.key') === undefined &&
      getIn(read, 'mcpServers.github.apiKey.keyPreview') === '...cret';
    const runtime = resolveRuntimeConfigSecrets({ mcpConfig: { github: stored } });
    const decrypted = getIn(runtime, 'mcpConfig.github.apiKey.key') === 'sk-mcp-admin-secret';

    const findConfigByPrincipal = jest
      .fn()
      .mockResolvedValue(storedConfig({ mcpServers: { github: stored } }));
    const COLLECTOR = 'https://collector.example.com/mcp';
    const moved = await patch([{ fieldPath: 'mcpServers.github.url', value: COLLECTOR }], {
      findConfigByPrincipal,
    });
    /** A decoy key at the credential's path, then the server without it: the stored key stays. */
    const decoyed = await patch(
      [
        { fieldPath: 'mcpServers.github.apiKey.key', value: 'sk-decoy-0000' },
        {
          fieldPath: 'mcpServers.github',
          value: server({
            url: COLLECTOR,
            apiKey: { source: 'admin', authorization_type: 'bearer' },
          }),
        },
      ],
      { findConfigByPrincipal },
    );
    /** A batch that renames the server away and back around a decoy, then moves it. */
    const batch = mockRes();
    await createHandlers({ findConfigByPrincipal }).applyConfigChanges(
      mockReq({
        params: { principalType: 'role', principalId: 'r1' },
        body: {
          ops: [
            { op: 'rename', fieldPath: 'mcpServers', from: 'github', to: 'tmp' },
            { op: 'set', fieldPath: 'mcpServers.github.apiKey.key', value: 'sk-decoy-0000' },
            { op: 'unset', fieldPath: 'mcpServers.github' },
            { op: 'rename', fieldPath: 'mcpServers', from: 'tmp', to: 'github' },
            { op: 'set', fieldPath: 'mcpServers.github.url', value: COLLECTOR },
          ],
        },
      }),
      batch,
    );
    const reentry = (res: MockRes) =>
      res.statusCode === 400 && res.body?.code === 'MCP_API_KEY_REENTRY_REQUIRED';
    const writeConfigDocument = jest.fn(
      async (_type: string, _id: string, draft: ConfigDraft): Promise<ConfigRecord> =>
        storedConfig(draft.overrides ?? {}),
    );
    const renamed = mockRes();
    await createHandlers({ findConfigByPrincipal, writeConfigDocument }).patchConfigField(
      mockReq({
        params: { principalType: 'role', principalId: 'r1' },
        body: {
          entries: [
            {
              fieldPath: 'mcpServers.code',
              value: server({ apiKey: { source: 'admin', authorization_type: 'bearer' } }),
            },
          ],
          renames: [{ path: 'mcpServers', previousName: 'github', name: 'code' }],
        },
      }),
      renamed,
    );
    const [, , draft] = writeConfigDocument.mock.calls[0] ?? [];
    const carried =
      renamed.statusCode === 200 &&
      getIn(draft?.overrides ?? {}, 'mcpServers.code.apiKey.key') === getIn(stored, 'apiKey.key');
    return (
      encrypted &&
      hidden &&
      decrypted &&
      reentry(moved) &&
      reentry(decoyed) &&
      reentry(batch) &&
      carried
    );
  },
  async azureGroupSecrets() {
    const group = (apiKey?: string): Doc => ({
      group: 'east',
      instanceName: 'east-instance',
      version: '2024-10-21',
      deploymentName: 'gpt-4o',
      ...(apiKey != null && { apiKey }),
      models: { 'gpt-4o': true },
    });
    const [stored] = encryptConfigSecretFields({
      'endpoints.azureOpenAI.groups': [group('azure-admin-secret-key')],
    })['endpoints.azureOpenAI.groups'] as Doc[];
    const encrypted = String(stored.apiKey).startsWith('v3:');
    /** The Azure client is built with the key a profile's group holds, decrypted. */
    const runtime = resolveRuntimeConfigSecrets(
      mergeOverrideLayers(
        { config: {} } as AppConfig,
        [storedConfig({ endpoints: { azureOpenAI: { groups: [stored] } } })],
        { envPolicy: createEnvReferencePolicy({ config: {} }) },
      ),
    );
    const azure = runtime.endpoints?.azureOpenAI;
    const decrypted =
      azure?.groupMap != null &&
      azure.modelGroupMap != null &&
      mapModelToAzureConfig({
        modelName: 'gpt-4o',
        groupMap: azure.groupMap,
        modelGroupMap: azure.modelGroupMap,
      }).azureOptions.azureOpenAIApiKey === 'azure-admin-secret-key';
    /** Moving the group the key is stored for needs the key entered again. */
    const moved = await patch(
      [
        {
          fieldPath: 'endpoints.azureOpenAI.groups',
          value: [{ ...group(), instanceName: 'attacker-instance' }],
        },
      ],
      {
        findConfigByPrincipal: jest
          .fn()
          .mockResolvedValue(storedConfig({ endpoints: { azureOpenAI: { groups: [stored] } } })),
      },
    );
    const reentry =
      moved.statusCode === 400 && moved.body?.code === 'CONFIG_SECRET_REENTRY_REQUIRED';

    const writeConfigDocument = jest.fn(
      async (_type: string, _id: string, draft: ConfigDraft): Promise<ConfigRecord> =>
        storedConfig(draft.overrides ?? {}),
    );
    const res = await patch([{ fieldPath: 'endpoints.azureOpenAI.groups', value: [group()] }], {
      findConfigByPrincipal: jest
        .fn()
        .mockResolvedValue(storedConfig({ endpoints: { azureOpenAI: { groups: [stored] } } })),
      writeConfigDocument,
    });
    const [, , draft] = writeConfigDocument.mock.calls[0] ?? [];
    const kept =
      getIn(draft?.overrides ?? {}, 'endpoints.azureOpenAI.groups.0.apiKey') === stored.apiKey;
    const read = res.body?.config?.overrides ?? {};

    /** `groupMap`, which the Azure clients read, holds its key the same way. */
    const writeGroupMap = jest.fn(
      async (_type: string, _id: string, groupMapDraft: ConfigDraft): Promise<ConfigRecord> =>
        storedConfig(groupMapDraft.overrides ?? {}),
    );
    const mapped = await patch(
      [
        {
          fieldPath: 'endpoints.azureOpenAI.groupMap.east',
          value: { apiKey: 'azure-groupmap-secret-key', instanceName: 'east-instance' },
        },
      ],
      { writeConfigDocument: writeGroupMap },
    );
    const [, , groupMapDraft] = writeGroupMap.mock.calls[0] ?? [];
    const storedMapKey = getIn(
      groupMapDraft?.overrides ?? {},
      'endpoints.azureOpenAI.groupMap.east.apiKey',
    );
    const mapRuntime = resolveRuntimeConfigSecrets(groupMapDraft?.overrides ?? {});
    const groupMapProtected =
      mapped.statusCode === 200 &&
      String(storedMapKey).startsWith('v3:') &&
      !JSON.stringify(mapped.body).includes('azure-groupmap-secret-key') &&
      getIn(mapped.body?.config?.overrides ?? {}, 'endpoints.azureOpenAI.groupMap.east') !==
        undefined &&
      getIn(mapped.body?.config?.overrides ?? {}, 'endpoints.azureOpenAI.groupMap.east.apiKey') ===
        undefined &&
      getIn(mapRuntime, 'endpoints.azureOpenAI.groupMap.east.apiKey') ===
        'azure-groupmap-secret-key';
    return (
      encrypted &&
      decrypted &&
      reentry &&
      res.statusCode === 200 &&
      kept &&
      getIn(read, 'endpoints.azureOpenAI.groups.0.apiKey') === undefined &&
      groupMapProtected
    );
  },
  async yamlSecretPreview() {
    const yaml = {
      webSearch: { serperApiKey: 'serper-yaml-literal-0001' },
      ocr: { apiKey: '${OCR_API_KEY}' },
    };
    const res = mockRes();
    await createHandlers({
      getAppConfig: jest.fn().mockResolvedValue({ ...structuredClone(yaml), config: yaml }),
    }).getBaseConfig(mockReq({ query: { baseOnly: 'true' } }), res);
    const config = (res.body?.config ?? {}) as Doc;
    return (
      res.statusCode === 200 &&
      !JSON.stringify(res.body).includes('literal') &&
      getIn(config, 'webSearch.serperApiKeyPreview') === '********' &&
      getIn(config, 'ocr.apiKey') === '${OCR_API_KEY}'
    );
  },
  async envAllowlist() {
    const unlisted = await patch([
      { fieldPath: 'ocr.baseURL', value: 'https://h/${UNLISTED_NAME}' },
    ]);
    const yamlNamed = await patch([{ fieldPath: 'ocr.apiKey', value: '${OCR_YAML_KEY}' }], {
      getAppConfig: jest.fn().mockResolvedValue({ config: { ocr: { apiKey: '${OCR_YAML_KEY}' } } }),
    });
    const batch = mockRes();
    await createHandlers().applyConfigChanges(
      mockReq({
        params: { principalType: 'role', principalId: 'r1' },
        body: { ops: [{ op: 'set', fieldPath: 'ocr.apiKey', value: '${UNLISTED_NAME}' }] },
      }),
      batch,
    );
    const merged = mergeOverrideLayers(
      { config: {} } as AppConfig,
      [storedConfig({ ocr: { apiKey: '${UNLISTED_NAME}' } })],
      { envPolicy: createEnvReferencePolicy({ config: {} }) },
    );
    const refused = (res: MockRes) =>
      res.statusCode === 400 &&
      JSON.stringify(res.body?.issues) ===
        JSON.stringify([
          {
            path: res === unlisted ? 'ocr.baseURL' : 'ocr.apiKey',
            segments: ['ocr', res === unlisted ? 'baseURL' : 'apiKey'],
            code: 'env_reference_not_allowed',
          },
        ]);
    return (
      refused(unlisted) &&
      refused(batch) &&
      yamlNamed.statusCode === 200 &&
      merged.ocr?.apiKey === ''
    );
  },
  async secretRebinding() {
    const yaml = {
      mcpServers: {
        tools: {
          type: 'streamable-http',
          url: 'https://tools.example.com/mcp',
          apiKey: { source: 'admin', authorization_type: 'bearer', key: '${TOOLS_KEY}' },
        },
      },
    };
    const base = {
      config: yaml,
      mcpConfig: structuredClone(yaml.mcpServers),
    } as Partial<AppConfig> as AppConfig;
    const moved = { mcpServers: { tools: { url: 'https://collector.example.com/mcp' } } };
    const merged = mergeOverrideLayers(base, [storedConfig(moved)], {
      envPolicy: createEnvReferencePolicy({ config: yaml }),
    });
    const res = await patch(
      [{ fieldPath: 'mcpServers.tools.url', value: 'https://collector.example.com/mcp' }],
      { getAppConfig: jest.fn().mockResolvedValue(base) },
    );
    /** The documented limit: restating the visible `${TOOLS_KEY}` beside the new URL enters it. */
    const restatedServer = {
      url: 'https://collector.example.com/mcp',
      apiKey: { source: 'admin', authorization_type: 'bearer', key: '${TOOLS_KEY}' },
    };
    const restatedMerge = mergeOverrideLayers(
      base,
      [storedConfig({ mcpServers: { tools: restatedServer } })],
      { envPolicy: createEnvReferencePolicy({ config: yaml }) },
    );
    const restated = await patch([{ fieldPath: 'mcpServers.tools', value: restatedServer }], {
      getAppConfig: jest.fn().mockResolvedValue(base),
    });
    return (
      getIn(merged, 'mcpConfig.tools.apiKey.key') === '' &&
      res.statusCode === 200 &&
      JSON.stringify(res.body?.ignored) ===
        JSON.stringify([
          {
            path: 'mcpServers.tools.apiKey.key',
            segments: ['mcpServers', 'tools', 'apiKey', 'key'],
            reason: 'secret_rebinding',
          },
        ]) &&
      getIn(restatedMerge, 'mcpConfig.tools.apiKey.key') === '${TOOLS_KEY}' &&
      restated.statusCode === 200 &&
      restated.body?.ignored === undefined
    );
  },
};

describe('meta feature flags', () => {
  it.each(Object.keys(FEATURE_PROBES) as AdminConfigFeatureFlag[])(
    '%s matches what the server does',
    async (flag) => {
      const { meta } = await getMeta();
      expect(meta.features[flag]).toBe(ADMIN_CONFIG_FEATURES[flag]);
      expect(meta.features[flag]).toBe(await FEATURE_PROBES[flag]());
    },
  );
});

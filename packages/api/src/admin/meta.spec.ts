import { join } from 'path';
import { readFileSync } from 'fs';
import mongoSanitize from 'express-mongo-sanitize';
import { mergeConfigOverrides, getConfigOverrideIssues } from '@librechat/data-schemas';
import {
  Constants,
  configSchema,
  PERMISSION_SUB_KEYS,
  BASE_ONLY_CONFIG_PATHS,
  BASE_ONLY_CONFIG_SECTIONS,
  PROCESS_MCP_SERVER_FIELDS,
  INTERFACE_PERMISSION_FIELDS,
  BASE_PRINCIPAL_CONFIG_SECTIONS,
  RUNTIME_CONFIG_INTERFACE_FIELDS,
} from 'librechat-data-provider';
import type {
  AdminConfigFeatureFlag,
  AdminConfigMeta,
  AppConfig,
  IConfig,
} from '@librechat/data-schemas';
import type { Request, Response } from 'express';
import type { ServerRequest } from '~/types/http';
import type { AdminConfigDeps } from './config';
import { createRequestSanitizer, rejectUnsafeConfigKeys } from '~/middleware/sanitize';
import { createAdminConfigHandlers } from './config';
import { redactConfigSecrets } from './secrets';
import { ADMIN_CONFIG_FEATURES } from './meta';

type Doc = Record<string, unknown>;
type ResponseBody = { config?: { overrides: Doc }; [key: string]: unknown };
type MockRes = Response & { statusCode: number; body: ResponseBody | undefined };
type MockReqInit = Omit<Partial<ServerRequest>, 'body'> & { body?: object };
type PatchEntry = { fieldPath: string; value: unknown };
type WriteHandler =
  | 'upsertConfigOverrides'
  | 'patchConfigField'
  | 'tombstoneConfigField'
  | 'deleteConfigField';

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
    upsertConfig: jest.fn().mockResolvedValue(null),
    patchConfigFields: jest.fn().mockResolvedValue(null),
    tombstoneConfigField: jest.fn().mockResolvedValue(null),
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

function storedConfig(overrides: Doc, tombstones?: string[]): IConfig {
  return {
    principalType: 'role',
    principalId: 'r1',
    priority: 10,
    overrides,
    tombstones,
    isActive: true,
  } as Partial<IConfig> as IConfig;
}

function setIn(target: Doc, segments: string[], value: unknown): Doc {
  const [head, ...rest] = segments;
  const child = target[head];
  const parent = child != null && typeof child === 'object' ? (child as Doc) : {};
  return { ...target, [head]: rest.length === 0 ? value : setIn(parent, rest, value) };
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
      'dottedKeys',
      'readFilteredWriteResponses',
      'sectionAllowlist',
    ]);
    expect(meta.limits).toEqual({ maxPatchEntries: 100, overrideCacheTtlMs: 60_000 });
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
      'refusedMaps',
      'secretFields',
      'titleResolution',
    ]);
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
    expect(meta.rules.titleResolution).toBe('block');
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

  it('lists the array secret reads withhold on custom endpoints', () => {
    expect(meta.rules.arraySecretFields).toEqual([
      {
        arrayPath: 'endpoints.custom',
        secretKey: 'apiKey',
        previewKey: 'apiKeyPreview',
        identityKey: 'name',
      },
    ]);
    const [{ arrayPath, secretKey, identityKey }] = meta.rules.arraySecretFields;
    const doc = setIn({}, arrayPath.split('.'), [{ [identityKey]: 'gw', [secretKey]: 'sk-live' }]);
    expect(getIn(redactConfigSecrets(doc), arrayPath)).toEqual([{ [identityKey]: 'gw' }]);
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
    const patchConfigFields = jest.fn();
    for (const section of meta.rules.baseOnlySections) {
      const res = await patch([{ fieldPath: `${section}.x`, value: 1 }], { patchConfigFields });
      expect(res.body).toEqual({ message: 'No actionable field entries provided' });
    }
    expect(patchConfigFields).not.toHaveBeenCalled();
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
    const deps: Partial<AdminConfigDeps> = {
      hasConfigCapability: jest.fn(
        async (_user, section, verb = 'manage') => verb === 'manage' && section === 'endpoints',
      ),
      getReadableConfigSections: jest.fn().mockResolvedValue({ broad: false, sections: new Set() }),
      patchConfigFields: jest.fn().mockResolvedValue(written),
      tombstoneConfigField: jest.fn().mockResolvedValue(written),
      unsetConfigField: jest.fn().mockResolvedValue(written),
    };
    const responses = await Promise.all([
      patch([{ fieldPath: 'endpoints.openAI.titleModel', value: 'gpt-4o-mini' }], deps),
      write('tombstoneConfigField', { body: { fieldPath: 'endpoints.bedrock' } }, deps),
      write('deleteConfigField', { query: { fieldPath: 'endpoints.bedrock' } }, deps),
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

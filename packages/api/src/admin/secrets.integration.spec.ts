import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { PrincipalModel, PrincipalType } from 'librechat-data-provider';
import type { Config } from '@librechat/data-schemas';
import type { Response } from 'express';
import type { ServerRequest } from '~/types/http';

process.env.CREDS_KEY =
  process.env.CREDS_KEY ?? '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.CREDS_IV = process.env.CREDS_IV ?? '0123456789abcdef0123456789abcdef';

type DataSchemas = typeof import('@librechat/data-schemas');
type ConfigMethods = ReturnType<DataSchemas['createMethods']>;
type AdminConfigHandlers = ReturnType<typeof import('./config').createAdminConfigHandlers>;

let mongoServer: MongoMemoryServer;
let handlers: AdminConfigHandlers;
let basePrincipalId: string;
let decryptV3: DataSchemas['decryptV3'];
let patchConfigFields: ConfigMethods['patchConfigFields'];
let configMethods: ConfigMethods;
/** Builds handlers on the real methods, optionally reading configs through `findConfigByPrincipal`. */
let createHandlers: (
  findConfigByPrincipal?: ConfigMethods['findConfigByPrincipal'],
) => AdminConfigHandlers;
let getSecretPreview: typeof import('./secrets').getSecretPreview;
let encryptConfigSecretFields: typeof import('./secrets').encryptConfigSecretFields;

interface SecretFieldCase {
  /** Dot-path of the secret field */
  path: string;
  /** Dot-path of the non-secret masked preview companion for `path` */
  previewPath: string;
  /** Section object containing the secret plus a non-secret sibling */
  section: string;
  object: Record<string, unknown>;
  /** Dot-path of a non-secret sibling used for unrelated writes */
  siblingPath: string;
  siblingValue: unknown;
}

const SECRET = 'sk-super-secret-literal';

/**
 * Secrets written through the generic config API. `langfuse.secretKey` is absent because only the
 * dedicated Langfuse connection API writes that section; the generic API strips it.
 */
const SECRET_FIELD_CASES: SecretFieldCase[] = [
  {
    path: 'ocr.apiKey',
    previewPath: 'ocr.apiKeyPreview',
    section: 'ocr',
    object: { apiKey: SECRET, mistralModel: 'mistral-ocr-latest' },
    siblingPath: 'ocr.mistralModel',
    siblingValue: 'mistral-ocr-next',
  },
  {
    path: 'speech.tts.openai.apiKey',
    previewPath: 'speech.tts.openai.apiKeyPreview',
    section: 'speech',
    object: { tts: { openai: { apiKey: SECRET, model: 'tts-1', voices: ['alloy'] } } },
    siblingPath: 'speech.tts.openai.model',
    siblingValue: 'tts-2',
  },
  {
    path: 'speech.tts.azureOpenAI.apiKey',
    previewPath: 'speech.tts.azureOpenAI.apiKeyPreview',
    section: 'speech',
    object: { tts: { azureOpenAI: { apiKey: SECRET, instanceName: 'inst' } } },
    siblingPath: 'speech.tts.azureOpenAI.instanceName',
    siblingValue: 'inst-2',
  },
  {
    path: 'speech.tts.elevenlabs.apiKey',
    previewPath: 'speech.tts.elevenlabs.apiKeyPreview',
    section: 'speech',
    object: { tts: { elevenlabs: { apiKey: SECRET, model: 'eleven_multilingual_v2' } } },
    siblingPath: 'speech.tts.elevenlabs.model',
    siblingValue: 'eleven_turbo_v2',
  },
  {
    path: 'speech.tts.localai.apiKey',
    previewPath: 'speech.tts.localai.apiKeyPreview',
    section: 'speech',
    object: { tts: { localai: { apiKey: SECRET, url: 'http://localai:8080' } } },
    siblingPath: 'speech.tts.localai.url',
    siblingValue: 'http://localai:8081',
  },
  {
    path: 'speech.stt.openai.apiKey',
    previewPath: 'speech.stt.openai.apiKeyPreview',
    section: 'speech',
    object: { stt: { openai: { apiKey: SECRET, model: 'whisper-1' } } },
    siblingPath: 'speech.stt.openai.model',
    siblingValue: 'whisper-2',
  },
  {
    path: 'speech.stt.azureOpenAI.apiKey',
    previewPath: 'speech.stt.azureOpenAI.apiKeyPreview',
    section: 'speech',
    object: { stt: { azureOpenAI: { apiKey: SECRET, instanceName: 'inst' } } },
    siblingPath: 'speech.stt.azureOpenAI.instanceName',
    siblingValue: 'inst-2',
  },
  {
    path: 'webSearch.serperApiKey',
    previewPath: 'webSearch.serperApiKeyPreview',
    section: 'webSearch',
    object: { serperApiKey: SECRET, searchProvider: 'serper' },
    siblingPath: 'webSearch.searchProvider',
    siblingValue: 'serper',
  },
  {
    path: 'webSearch.searxngApiKey',
    previewPath: 'webSearch.searxngApiKeyPreview',
    section: 'webSearch',
    object: { searxngApiKey: SECRET, searxngInstanceUrl: 'https://searx.example.com' },
    siblingPath: 'webSearch.safeSearch',
    siblingValue: 2,
  },
  {
    path: 'webSearch.firecrawlApiKey',
    previewPath: 'webSearch.firecrawlApiKeyPreview',
    section: 'webSearch',
    object: { firecrawlApiKey: SECRET, firecrawlApiUrl: 'https://api.firecrawl.dev' },
    siblingPath: 'webSearch.firecrawlVersion',
    siblingValue: 'v2',
  },
  {
    path: 'webSearch.tavilyApiKey',
    previewPath: 'webSearch.tavilyApiKeyPreview',
    section: 'webSearch',
    object: { tavilyApiKey: SECRET, scraperTimeout: 7500 },
    siblingPath: 'webSearch.scraperTimeout',
    siblingValue: 8000,
  },
  {
    path: 'webSearch.keenableApiKey',
    previewPath: 'webSearch.keenableApiKeyPreview',
    section: 'webSearch',
    object: { keenableApiKey: SECRET, keenableApiUrl: 'https://api.keenable.ai' },
    siblingPath: 'webSearch.scraperTimeout',
    siblingValue: 9000,
  },
  {
    path: 'webSearch.jinaApiKey',
    previewPath: 'webSearch.jinaApiKeyPreview',
    section: 'webSearch',
    object: { jinaApiKey: SECRET, jinaApiUrl: 'https://r.jina.ai' },
    siblingPath: 'webSearch.rerankerType',
    siblingValue: 'jina',
  },
  {
    path: 'webSearch.cohereApiKey',
    previewPath: 'webSearch.cohereApiKeyPreview',
    section: 'webSearch',
    object: { cohereApiKey: SECRET, rerankerType: 'cohere' },
    siblingPath: 'webSearch.rerankerType',
    siblingValue: 'cohere',
  },
  {
    path: 'endpoints.assistants.apiKey',
    previewPath: 'endpoints.assistants.apiKeyPreview',
    section: 'endpoints',
    object: { assistants: { apiKey: SECRET, disableBuilder: true } },
    siblingPath: 'endpoints.assistants.disableBuilder',
    siblingValue: false,
  },
  {
    path: 'endpoints.azureAssistants.apiKey',
    previewPath: 'endpoints.azureAssistants.apiKeyPreview',
    section: 'endpoints',
    object: { azureAssistants: { apiKey: SECRET, disableBuilder: true } },
    siblingPath: 'endpoints.azureAssistants.disableBuilder',
    siblingValue: false,
  },
];

/** Fields whose values conventionally hold `${ENV_VAR}` placeholder references. */
const PLACEHOLDER_CASES = [
  { path: 'ocr.apiKey', placeholder: '${OCR_API_KEY}' },
  { path: 'speech.tts.openai.apiKey', placeholder: '${TTS_API_KEY}' },
  { path: 'webSearch.serperApiKey', placeholder: '${SERPER_API_KEY}' },
  { path: 'webSearch.keenableApiKey', placeholder: '${KEENABLE_API_KEY}' },
  { path: 'endpoints.assistants.apiKey', placeholder: '${ASSISTANTS_API_KEY}' },
];

function mockReq(overrides: Record<string, unknown> = {}): ServerRequest {
  return {
    user: { id: 'u1', role: 'ADMIN', _id: { toString: () => 'u1' } },
    params: {},
    body: {},
    query: {},
    ...overrides,
  } as Partial<ServerRequest> as ServerRequest;
}

interface MockRes {
  statusCode: number;
  body: undefined | { config?: Record<string, unknown>; error?: string; [key: string]: unknown };
  status: jest.Mock;
  json: jest.Mock;
}

function mockRes(): Response & MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    status: jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: jest.fn((data: MockRes['body']) => {
      res.body = data;
      return res;
    }),
  };
  return res as Partial<Response> as Response & MockRes;
}

function getAtPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split('.')) {
    if (cursor == null || typeof cursor !== 'object') {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

type RawConfig = Pick<Config, 'configVersion'> & { overrides: Record<string, unknown> };

async function readRawConfig(principalId: string): Promise<RawConfig> {
  const doc = await mongoose.models.Config.findOne({ principalId });
  expect(doc).not.toBeNull();
  expect(doc!.$isNew).toBe(false);
  return doc!.toObject() as RawConfig;
}

async function readRawOverrides(principalId: string): Promise<Record<string, unknown>> {
  return (await readRawConfig(principalId)).overrides;
}

let principalCounter = 0;
function nextPrincipalId(): string {
  principalCounter += 1;
  return `admin-${principalCounter}`;
}

beforeAll(async () => {
  jest.resetModules();
  const dataSchemas = await import('@librechat/data-schemas');
  ({ decryptV3, BASE_CONFIG_PRINCIPAL_ID: basePrincipalId } = dataSchemas);
  jest.spyOn(dataSchemas.logger, 'error').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'warn').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'info').mockReturnValue(dataSchemas.logger);
  jest.spyOn(dataSchemas.logger, 'debug').mockReturnValue(dataSchemas.logger);

  const { createAdminConfigHandlers } = await import('./config');
  ({ getSecretPreview, encryptConfigSecretFields } = await import('./secrets'));

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  dataSchemas.createModels(mongoose);
  const methods = dataSchemas.createMethods(mongoose);
  configMethods = methods;
  ({ patchConfigFields } = methods);

  createHandlers = (findConfigByPrincipal = methods.findConfigByPrincipal) =>
    createAdminConfigHandlers({
      listAllConfigs: methods.listAllConfigs,
      findConfigByPrincipal,
      upsertConfig: methods.upsertConfig,
      patchConfigFields: methods.patchConfigFields,
      tombstoneConfigField: methods.tombstoneConfigField,
      unsetConfigField: methods.unsetConfigField,
      deleteConfig: methods.deleteConfig,
      toggleConfigActiveTracked: methods.toggleConfigActiveTracked,
      hasConfigCapability: async () => true,
      hasAnyConfigReadAccess: async () => true,
      hasCapability: async () => true,
    });
  handlers = createHandlers();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

describe('config secret registry — real handlers against a real Config collection', () => {
  describe.each(SECRET_FIELD_CASES)(
    '$path',
    ({ path, previewPath, section, object, siblingPath, siblingValue }) => {
      it('encrypts dotted patch writes at rest, sets the masked preview companion, and redacts the secret from the response', async () => {
        const principalId = nextPrincipalId();
        const res = mockRes();
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { entries: [{ fieldPath: path, value: SECRET }] },
          }),
          res,
        );
        expect(res.statusCode).toBe(200);
        expect(JSON.stringify(res.body)).not.toContain(SECRET);

        const overrides = await readRawOverrides(principalId);
        const stored = getAtPath(overrides, path);
        expect(typeof stored).toBe('string');
        expect(stored).toMatch(/^v3:/);
        expect(decryptV3(stored as string)).toBe(SECRET);
        expect(getAtPath(overrides, previewPath)).toBe(getSecretPreview(SECRET));

        const responseOverrides = (res.body!.config as { overrides: Record<string, unknown> })
          .overrides;
        expect(getAtPath(responseOverrides, path)).toBeUndefined();
        expect(getAtPath(responseOverrides, previewPath)).toBe(getSecretPreview(SECRET));
      });

      it('encrypts object-valued upsert writes at rest, sets the masked preview companion, and redacts reads', async () => {
        const principalId = nextPrincipalId();
        const upsertRes = mockRes();
        await handlers.upsertConfigOverrides(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { overrides: { [section]: object } },
          }),
          upsertRes,
        );
        expect(upsertRes.statusCode).toBe(201);
        expect(JSON.stringify(upsertRes.body)).not.toContain(SECRET);

        const overrides = await readRawOverrides(principalId);
        expect(decryptV3(getAtPath(overrides, path) as string)).toBe(SECRET);
        expect(getAtPath(overrides, previewPath)).toBe(getSecretPreview(SECRET));

        const getRes = mockRes();
        await handlers.getConfig(
          mockReq({ params: { principalType: 'role', principalId } }),
          getRes,
        );
        expect(getRes.statusCode).toBe(200);
        expect(JSON.stringify(getRes.body)).not.toContain(SECRET);
        expect(JSON.stringify(getRes.body)).not.toContain('v3:');
        const getOverrides = (getRes.body!.config as { overrides: Record<string, unknown> })
          .overrides;
        expect(getAtPath(getOverrides, path)).toBeUndefined();
        expect(getAtPath(getOverrides, previewPath)).toBe(getSecretPreview(SECRET));

        const listRes = mockRes();
        await handlers.listConfigs(mockReq(), listRes);
        expect(listRes.statusCode).toBe(200);
        expect(JSON.stringify(listRes.body)).not.toContain(SECRET);
        expect(JSON.stringify(listRes.body)).not.toContain('v3:');
      });

      it('preserves the stored secret and its preview companion across an unrelated dotted patch', async () => {
        const principalId = nextPrincipalId();
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { entries: [{ fieldPath: path, value: SECRET }] },
          }),
          mockRes(),
        );
        const rawBefore = await readRawOverrides(principalId);
        const before = getAtPath(rawBefore, path);
        const displayBefore = getAtPath(rawBefore, previewPath);
        expect(displayBefore).toBe(getSecretPreview(SECRET));

        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { entries: [{ fieldPath: siblingPath, value: siblingValue }] },
          }),
          mockRes(),
        );

        const overrides = await readRawOverrides(principalId);
        expect(getAtPath(overrides, path)).toBe(before);
        expect(decryptV3(getAtPath(overrides, path) as string)).toBe(SECRET);
        expect(getAtPath(overrides, previewPath)).toBe(displayBefore);
        expect(getAtPath(overrides, siblingPath)).toEqual(siblingValue);
      });

      it('round-trips a redacted read (including the visible preview companion) back through a full upsert without clobbering the secret', async () => {
        const principalId = nextPrincipalId();
        await handlers.upsertConfigOverrides(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { overrides: { [section]: object } },
          }),
          mockRes(),
        );
        const rawBefore = await readRawOverrides(principalId);
        const before = getAtPath(rawBefore, path);
        const displayBefore = getAtPath(rawBefore, previewPath);

        const getRes = mockRes();
        await handlers.getConfig(
          mockReq({ params: { principalType: 'role', principalId } }),
          getRes,
        );
        const redactedOverrides = (getRes.body!.config as { overrides: Record<string, unknown> })
          .overrides;
        expect(getAtPath(redactedOverrides, path)).toBeUndefined();
        expect(getAtPath(redactedOverrides, previewPath)).toBe(displayBefore);

        const clientEdited = JSON.parse(JSON.stringify(redactedOverrides)) as Record<
          string,
          unknown
        >;
        const upsertRes = mockRes();
        await handlers.upsertConfigOverrides(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { overrides: clientEdited },
          }),
          upsertRes,
        );
        expect(upsertRes.statusCode).toBe(200);
        expect(JSON.stringify(upsertRes.body)).not.toContain(SECRET);

        const overrides = await readRawOverrides(principalId);
        expect(getAtPath(overrides, path)).toBe(before);
        expect(decryptV3(getAtPath(overrides, path) as string)).toBe(SECRET);
        expect(getAtPath(overrides, previewPath)).toBe(displayBefore);
      });

      it('clears the secret and its preview companion when explicitly set to an empty value', async () => {
        const principalId = nextPrincipalId();
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { entries: [{ fieldPath: path, value: SECRET }] },
          }),
          mockRes(),
        );
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { entries: [{ fieldPath: path, value: '' }] },
          }),
          mockRes(),
        );
        const overrides = await readRawOverrides(principalId);
        expect(getAtPath(overrides, path)).toBe('');
        expect(getAtPath(overrides, previewPath)).toBe('');
      });

      it('rejects encrypted value submissions', async () => {
        const res = mockRes();
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId: nextPrincipalId() },
            body: { entries: [{ fieldPath: path, value: 'v3:attacker-controlled' }] },
          }),
          res,
        );
        expect(res.statusCode).toBe(400);
      });

      it('rejects a direct dotted-patch write to the preview companion path itself', async () => {
        const principalId = nextPrincipalId();
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { entries: [{ fieldPath: path, value: SECRET }] },
          }),
          mockRes(),
        );

        const res = mockRes();
        await handlers.patchConfigField(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { entries: [{ fieldPath: previewPath, value: 'attacker-supplied-display' }] },
          }),
          res,
        );
        expect(res.statusCode).toBe(400);

        const overrides = await readRawOverrides(principalId);
        expect(decryptV3(getAtPath(overrides, path) as string)).toBe(SECRET);
        expect(getAtPath(overrides, previewPath)).toBe(getSecretPreview(SECRET));
      });

      it('never persists a client-supplied display value as the real secret via an object-valued upsert', async () => {
        const principalId = nextPrincipalId();
        const spoofedObject = JSON.parse(JSON.stringify(object)) as Record<string, unknown>;
        const objectPathSegments = path.slice(section.length + 1).split('.');
        let cursor = spoofedObject;
        for (let i = 0; i < objectPathSegments.length - 1; i++) {
          cursor = cursor[objectPathSegments[i]] as Record<string, unknown>;
        }
        const secretKey = objectPathSegments[objectPathSegments.length - 1];
        const previewKey = previewPath.split('.').slice(-1)[0];
        delete cursor[secretKey];
        cursor[previewKey] = 'v3:attacker-supplied-looks-encrypted';

        const res = mockRes();
        await handlers.upsertConfigOverrides(
          mockReq({
            params: { principalType: 'role', principalId },
            body: { overrides: { [section]: spoofedObject } },
          }),
          res,
        );
        expect(res.statusCode).toBe(201);

        const overrides = await readRawOverrides(principalId);
        expect(getAtPath(overrides, path)).toBeUndefined();
        expect(getAtPath(overrides, previewPath)).toBeUndefined();
      });
    },
  );

  describe('langfuse.secretKey (dedicated Langfuse connection API)', () => {
    type RefusedWrite = [
      string,
      'patchConfigField' | 'tombstoneConfigField' | 'deleteConfigField',
      Record<string, unknown>,
    ];

    const secretPath = 'langfuse.secretKey';
    const previewPath = 'langfuse.secretKeyPreview';

    function baseReq(overrides: Record<string, unknown> = {}): ServerRequest {
      return mockReq({
        params: { principalType: 'role', principalId: basePrincipalId },
        ...overrides,
      });
    }

    /** Persists what the dedicated connection API writes, through the same shared secret helper. */
    async function seedLangfuseConnection(): Promise<RawConfig> {
      await mongoose.models.Config.deleteOne({ principalId: basePrincipalId });
      await patchConfigFields(
        PrincipalType.ROLE,
        basePrincipalId,
        PrincipalModel.ROLE,
        encryptConfigSecretFields({
          'langfuse.enabled': true,
          'langfuse.destination': 'eu',
          'langfuse.publicKey': 'pk-lf-1',
          [secretPath]: SECRET,
        }),
        10,
      );
      return readRawConfig(basePrincipalId);
    }

    it('keeps the stored secret encrypted at rest and redacts it from generic reads', async () => {
      const { overrides: stored } = await seedLangfuseConnection();
      expect(getAtPath(stored, secretPath)).toMatch(/^v3:/);
      expect(decryptV3(getAtPath(stored, secretPath) as string)).toBe(SECRET);
      expect(getAtPath(stored, previewPath)).toBe(getSecretPreview(SECRET));

      const getRes = mockRes();
      await handlers.getConfig(baseReq(), getRes);
      expect(getRes.statusCode).toBe(200);
      expect(JSON.stringify(getRes.body)).not.toContain(SECRET);
      expect(JSON.stringify(getRes.body)).not.toContain('v3:');
      const overrides = (getRes.body!.config as { overrides: Record<string, unknown> }).overrides;
      expect(getAtPath(overrides, secretPath)).toBeUndefined();
      expect(getAtPath(overrides, previewPath)).toBe(getSecretPreview(SECRET));
      expect(getAtPath(overrides, 'langfuse.publicKey')).toBe('pk-lf-1');

      const listRes = mockRes();
      await handlers.listConfigs(mockReq(), listRes);
      expect(listRes.statusCode).toBe(200);
      expect(JSON.stringify(listRes.body)).not.toContain(SECRET);
      expect(JSON.stringify(listRes.body)).not.toContain('v3:');
    });

    it.each<RefusedWrite>([
      [
        'a dotted patch that replaces it',
        'patchConfigField',
        { body: { entries: [{ fieldPath: secretPath, value: 'sk-lf-replacement' }] } },
      ],
      [
        'a dotted patch that clears it',
        'patchConfigField',
        { body: { entries: [{ fieldPath: secretPath, value: '' }] } },
      ],
      ['a field tombstone', 'tombstoneConfigField', { body: { fieldPath: secretPath } }],
      ['a field delete', 'deleteConfigField', { query: { fieldPath: secretPath } }],
    ])('ignores %s without writing the base config', async (_label, handler, request) => {
      const before = await seedLangfuseConnection();
      const res = mockRes();
      await handlers[handler](baseReq(request), res);
      expect(res.statusCode).toBe(200);

      const after = await readRawConfig(basePrincipalId);
      expect(after.configVersion).toBe(before.configVersion);
      expect(after.overrides).toEqual(before.overrides);
    });

    it('carries the stored secret through a full base-config replacement', async () => {
      const before = await seedLangfuseConnection();
      const res = mockRes();
      await handlers.upsertConfigOverrides(
        baseReq({
          body: {
            overrides: {
              interface: { modelSelect: false },
              langfuse: {
                enabled: false,
                publicKey: 'pk-lf-caller',
                secretKey: 'sk-lf-replacement',
              },
            },
          },
        }),
        res,
      );
      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(SECRET);

      const after = await readRawConfig(basePrincipalId);
      expect(after.configVersion).toBe(before.configVersion + 1);
      expect(getAtPath(after.overrides, 'interface.modelSelect')).toBe(false);
      expect(after.overrides.langfuse).toEqual(before.overrides.langfuse);
    });

    it('creates no role config from a Langfuse-only generic write', async () => {
      const principalId = nextPrincipalId();
      const patchRes = mockRes();
      await handlers.patchConfigField(
        mockReq({
          params: { principalType: 'role', principalId },
          body: { entries: [{ fieldPath: secretPath, value: SECRET }] },
        }),
        patchRes,
      );
      const upsertRes = mockRes();
      await handlers.upsertConfigOverrides(
        mockReq({
          params: { principalType: 'role', principalId },
          body: { overrides: { langfuse: { publicKey: 'pk-lf-1', secretKey: SECRET } } },
        }),
        upsertRes,
      );

      expect(patchRes.statusCode).toBe(200);
      expect(upsertRes.statusCode).toBe(200);
      expect(await mongoose.models.Config.exists({ principalId })).toBeNull();
    });
  });

  describe.each(PLACEHOLDER_CASES)('$path env placeholder', ({ path, placeholder }) => {
    it('stores and returns `${ENV_VAR}` references without encryption or redaction', async () => {
      const principalId = nextPrincipalId();
      await handlers.patchConfigField(
        mockReq({
          params: { principalType: 'role', principalId },
          body: { entries: [{ fieldPath: path, value: placeholder }] },
        }),
        mockRes(),
      );

      const overrides = await readRawOverrides(principalId);
      expect(getAtPath(overrides, path)).toBe(placeholder);

      const getRes = mockRes();
      await handlers.getConfig(mockReq({ params: { principalType: 'role', principalId } }), getRes);
      const responseOverrides = (getRes.body!.config as { overrides: Record<string, unknown> })
        .overrides;
      expect(getAtPath(responseOverrides, path)).toBe(placeholder);
    });
  });

  describe('legacy plaintext literals stored before encryption existed', () => {
    const LEGACY_KEENABLE_KEY = 'kn-legacy-plain-0002';

    async function createLegacyConfig(principalId: string): Promise<void> {
      await mongoose.models.Config.create({
        principalType: 'role',
        principalId,
        principalModel: 'Role',
        priority: 10,
        overrides: {
          speech: { tts: { openai: { apiKey: SECRET, model: 'tts-1' } } },
          ocr: { apiKey: SECRET },
          webSearch: {
            serperApiKey: SECRET,
            searchProvider: 'serper',
            keenableApiKey: LEGACY_KEENABLE_KEY,
            keenableApiUrl: 'https://keenable.example.com',
          },
        },
      });
    }

    async function readOverrides(principalId: string): Promise<Record<string, unknown>> {
      const getRes = mockRes();
      await handlers.getConfig(mockReq({ params: { principalType: 'role', principalId } }), getRes);
      expect(getRes.statusCode).toBe(200);
      expect(JSON.stringify(getRes.body)).not.toContain(SECRET);
      expect(JSON.stringify(getRes.body)).not.toContain(LEGACY_KEENABLE_KEY);
      return (getRes.body!.config as { overrides: Record<string, unknown> }).overrides;
    }

    it('shows a plaintext literal stored on the config document as set, never its value', async () => {
      const principalId = nextPrincipalId();
      await createLegacyConfig(principalId);

      const overrides = await readOverrides(principalId);
      expect(getAtPath(overrides, 'speech.tts.openai.model')).toBe('tts-1');
      expect(getAtPath(overrides, 'webSearch.searchProvider')).toBe('serper');
      // The runtime still reads these values, so the read shows the preview their next save writes.
      expect(getAtPath(overrides, 'speech.tts.openai.apiKeyPreview')).toBe(
        getSecretPreview(SECRET),
      );
      expect(getAtPath(overrides, 'ocr.apiKeyPreview')).toBe(getSecretPreview(SECRET));
      expect(getAtPath(overrides, 'webSearch.serperApiKeyPreview')).toBe(getSecretPreview(SECRET));
      expect(getAtPath(overrides, 'webSearch.keenableApiKey')).toBeUndefined();
      expect(getAtPath(overrides, 'webSearch.keenableApiKeyPreview')).toBe('...0002');

      const listRes = mockRes();
      await handlers.listConfigs(mockReq(), listRes);
      expect(JSON.stringify(listRes.body)).not.toContain(SECRET);
      expect(JSON.stringify(listRes.body)).not.toContain(LEGACY_KEENABLE_KEY);
    });

    it('keeps showing a legacy Keenable key after an unrelated patch, and encrypts it on a section save', async () => {
      const principalId = nextPrincipalId();
      await createLegacyConfig(principalId);

      const patchRes = mockRes();
      await handlers.patchConfigField(
        mockReq({
          params: { principalType: 'role', principalId },
          body: { entries: [{ fieldPath: 'webSearch.scraperTimeout', value: 9000 }] },
        }),
        patchRes,
      );
      expect(patchRes.statusCode).toBe(200);
      expect(JSON.stringify(patchRes.body)).not.toContain(LEGACY_KEENABLE_KEY);
      expect(
        getAtPath(
          (patchRes.body!.config as { overrides: Record<string, unknown> }).overrides,
          'webSearch.keenableApiKeyPreview',
        ),
      ).toBe('...0002');
      expect(getAtPath(await readOverrides(principalId), 'webSearch.keenableApiKeyPreview')).toBe(
        '...0002',
      );

      const webSearch = getAtPath(await readOverrides(principalId), 'webSearch');
      const saveRes = mockRes();
      await handlers.patchConfigField(
        mockReq({
          params: { principalType: 'role', principalId },
          body: { entries: [{ fieldPath: 'webSearch', value: webSearch }] },
        }),
        saveRes,
      );
      expect(saveRes.statusCode).toBe(200);

      const raw = await readRawOverrides(principalId);
      expect(getAtPath(raw, 'webSearch.keenableApiKey')).toMatch(/^v3:/);
      expect(decryptV3(getAtPath(raw, 'webSearch.keenableApiKey') as string)).toBe(
        LEGACY_KEENABLE_KEY,
      );
      expect(getAtPath(raw, 'webSearch.keenableApiKeyPreview')).toBe('...0002');
    });
  });

  describe('a write that sends a stored web search key to a new URL', () => {
    const STORED_KEY = 'sx-stored-secret-0001';
    const STORED_URL = 'https://searx.example.com/base';
    const NEW_URL = 'https://collector.example.com';
    const SEARXNG_REENTRY = {
      path: 'webSearch.searxngInstanceUrl',
      segments: ['webSearch', 'searxngInstanceUrl'],
      code: 'secret_reentry_required',
      secretPath: 'webSearch.searxngApiKey',
    };

    type Entry = { fieldPath: string; value: unknown };

    async function patch(principalId: string, entries: Entry[]): Promise<MockRes> {
      const res = mockRes();
      await handlers.patchConfigField(
        mockReq({ params: { principalType: 'role', principalId }, body: { entries } }),
        res,
      );
      return res;
    }

    async function replace(principalId: string, overrides: Record<string, unknown>) {
      const res = mockRes();
      await handlers.upsertConfigOverrides(
        mockReq({ params: { principalType: 'role', principalId }, body: { overrides } }),
        res,
      );
      return res;
    }

    async function storeSearxng(principalId: string): Promise<RawConfig> {
      const res = await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: STORED_URL },
        { fieldPath: 'webSearch.searxngApiKey', value: STORED_KEY },
      ]);
      expect(res.statusCode).toBe(200);
      return readRawConfig(principalId);
    }

    /** The response a rejected write must give: paths and a stable code, never the key or the new URL. */
    function reentryRequired(issues: Array<typeof SEARXNG_REENTRY>) {
      return {
        statusCode: 400,
        body: { error: expect.any(String), code: 'CONFIG_SECRET_REENTRY_REQUIRED', issues },
        payload: expect.not.stringMatching(new RegExp(`${STORED_KEY}|${NEW_URL}`)),
      };
    }

    function response(res: MockRes) {
      return { statusCode: res.statusCode, body: res.body, payload: JSON.stringify(res.body) };
    }

    it('rejects a dotted patch that changes only the URL and writes nothing', async () => {
      const principalId = nextPrincipalId();
      const before = await storeSearxng(principalId);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL },
      ]);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('rejects a section patch that changes the URL and omits the key', async () => {
      const principalId = nextPrincipalId();
      const before = await storeSearxng(principalId);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch', value: { searxngInstanceUrl: NEW_URL, safeSearch: 2 } },
      ]);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('rejects a full replace that changes the URL and omits the key', async () => {
      const principalId = nextPrincipalId();
      const before = await storeSearxng(principalId);

      const res = await replace(principalId, { webSearch: { searxngInstanceUrl: NEW_URL } });

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('rejects adding a URL beside a key the document already stores', async () => {
      const principalId = nextPrincipalId();
      expect(
        (await patch(principalId, [{ fieldPath: 'webSearch.searxngApiKey', value: STORED_KEY }]))
          .statusCode,
      ).toBe(200);
      const before = await readRawConfig(principalId);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL },
      ]);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('names the shared Tavily key once for each URL that changed', async () => {
      const principalId = nextPrincipalId();
      const stored = await patch(principalId, [
        { fieldPath: 'webSearch.tavilySearchUrl', value: 'https://tavily.example.com/search' },
        { fieldPath: 'webSearch.tavilyExtractUrl', value: 'https://tavily.example.com/extract' },
        { fieldPath: 'webSearch.tavilyApiKey', value: STORED_KEY },
      ]);
      expect(stored.statusCode).toBe(200);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.tavilySearchUrl', value: `${NEW_URL}/search` },
        { fieldPath: 'webSearch.tavilyExtractUrl', value: `${NEW_URL}/extract` },
      ]);

      expect(response(res)).toEqual(
        reentryRequired([
          {
            path: 'webSearch.tavilySearchUrl',
            segments: ['webSearch', 'tavilySearchUrl'],
            code: 'secret_reentry_required',
            secretPath: 'webSearch.tavilyApiKey',
          },
          {
            path: 'webSearch.tavilyExtractUrl',
            segments: ['webSearch', 'tavilyExtractUrl'],
            code: 'secret_reentry_required',
            secretPath: 'webSearch.tavilyApiKey',
          },
        ]),
      );
    });

    it('rejects a URL change beside a plaintext key stored before encryption existed', async () => {
      const principalId = nextPrincipalId();
      await mongoose.models.Config.create({
        principalType: 'role',
        principalId,
        principalModel: 'Role',
        priority: 10,
        overrides: {
          webSearch: {
            keenableApiKey: 'kn-legacy-plain-0003',
            keenableApiUrl: 'https://keenable.example.com',
          },
        },
      });
      const before = await readRawConfig(principalId);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.keenableApiUrl', value: NEW_URL },
      ]);

      expect(res.statusCode).toBe(400);
      expect(res.body!.issues).toEqual([
        {
          path: 'webSearch.keenableApiUrl',
          segments: ['webSearch', 'keenableApiUrl'],
          code: 'secret_reentry_required',
          secretPath: 'webSearch.keenableApiKey',
        },
      ]);
      expect(JSON.stringify(res.body)).not.toContain('kn-legacy-plain-0003');
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('stores a new URL with the key entered again in the same write', async () => {
      const principalId = nextPrincipalId();
      await storeSearxng(principalId);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL },
        { fieldPath: 'webSearch.searxngApiKey', value: 'sx-reentered-0002' },
      ]);

      expect(res.statusCode).toBe(200);
      const overrides = await readRawOverrides(principalId);
      expect(getAtPath(overrides, 'webSearch.searxngInstanceUrl')).toBe(NEW_URL);
      expect(decryptV3(getAtPath(overrides, 'webSearch.searxngApiKey') as string)).toBe(
        'sx-reentered-0002',
      );
    });

    it('stores a new URL in a full replace that enters the key again', async () => {
      const principalId = nextPrincipalId();
      await storeSearxng(principalId);

      const res = await replace(principalId, {
        webSearch: { searxngInstanceUrl: NEW_URL, searxngApiKey: 'sx-reentered-0003' },
      });

      expect(res.statusCode).toBe(200);
      const overrides = await readRawOverrides(principalId);
      expect(decryptV3(getAtPath(overrides, 'webSearch.searxngApiKey') as string)).toBe(
        'sx-reentered-0003',
      );
    });

    it.each([
      {
        name: 'points the URL at the environment',
        entries: [{ fieldPath: 'webSearch.searxngInstanceUrl', value: '${SEARXNG_INSTANCE_URL}' }],
      },
      {
        name: 'blanks the URL',
        entries: [{ fieldPath: 'webSearch.searxngInstanceUrl', value: '' }],
      },
      {
        name: 'replaces the section without the URL',
        entries: [{ fieldPath: 'webSearch', value: { safeSearch: 2 } }],
      },
    ])('rejects a write that $name while the key stays', async ({ entries }) => {
      const principalId = nextPrincipalId();
      const before = await storeSearxng(principalId);

      const res = await patch(principalId, entries);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('rejects a full replace whose section drops the URL while the key stays', async () => {
      const principalId = nextPrincipalId();
      const before = await storeSearxng(principalId);

      const res = await replace(principalId, { webSearch: { safeSearch: 2 } });

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('rejects pointing an environment URL at another variable beside a stored key', async () => {
      const principalId = nextPrincipalId();
      await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: '${SEARXNG_INSTANCE_URL}' },
        { fieldPath: 'webSearch.searxngApiKey', value: STORED_KEY },
      ]);
      const before = await readRawConfig(principalId);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: '${OTHER_SERVICE_URL}' },
      ]);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it.each([
      {
        name: 'clears the key',
        entries: [
          { fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL },
          { fieldPath: 'webSearch.searxngApiKey', value: '' },
        ],
      },
      {
        name: 'turns the key into an environment reference',
        entries: [
          { fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL },
          { fieldPath: 'webSearch.searxngApiKey', value: '${SEARXNG_API_KEY}' },
        ],
      },
      {
        name: 'points the URL at the environment and enters the key again',
        entries: [
          { fieldPath: 'webSearch.searxngInstanceUrl', value: '${SEARXNG_INSTANCE_URL}' },
          { fieldPath: 'webSearch.searxngApiKey', value: 'sx-reentered-0004' },
        ],
      },
      {
        name: 'writes the same URL again',
        entries: [{ fieldPath: 'webSearch.searxngInstanceUrl', value: STORED_URL }],
      },
      {
        name: 'replaces the section with the URL and without the key',
        entries: [
          { fieldPath: 'webSearch', value: { searxngInstanceUrl: STORED_URL, safeSearch: 2 } },
        ],
      },
    ])('accepts a write that $name', async ({ entries }) => {
      const principalId = nextPrincipalId();
      await storeSearxng(principalId);

      const res = await patch(principalId, entries);

      expect(res.statusCode).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(STORED_KEY);
    });

    async function removeField(
      principalId: string,
      fieldPath: string,
      tombstone: boolean,
    ): Promise<MockRes> {
      const res = mockRes();
      const params = { principalType: 'role', principalId };
      if (tombstone) {
        await handlers.tombstoneConfigField(mockReq({ params, body: { fieldPath } }), res);
      } else {
        await handlers.deleteConfigField(mockReq({ params, query: { fieldPath } }), res);
      }
      return res;
    }

    it.each([
      { name: 'deleting', tombstone: false },
      { name: 'tombstoning', tombstone: true },
    ])('rejects $name the URL beside a stored key and writes nothing', async ({ tombstone }) => {
      const principalId = nextPrincipalId();
      const before = await storeSearxng(principalId);

      const res = await removeField(principalId, 'webSearch.searxngInstanceUrl', tombstone);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('rejects deleting a URL tombstone, which restores the inherited URL, beside a stored key', async () => {
      const principalId = nextPrincipalId();
      await patch(principalId, [{ fieldPath: 'webSearch.searxngApiKey', value: STORED_KEY }]);
      await configMethods.tombstoneConfigField(
        PrincipalType.ROLE,
        principalId,
        PrincipalModel.ROLE,
        'webSearch.searxngInstanceUrl',
        10,
      );
      const before = await readRawConfig(principalId);

      const res = await removeField(principalId, 'webSearch.searxngInstanceUrl', false);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it('rejects setting a URL the document tombstones beside a stored key', async () => {
      const principalId = nextPrincipalId();
      await configMethods.tombstoneConfigField(
        PrincipalType.ROLE,
        principalId,
        PrincipalModel.ROLE,
        'webSearch.searxngInstanceUrl',
        10,
      );
      expect(
        (await patch(principalId, [{ fieldPath: 'webSearch.searxngApiKey', value: STORED_KEY }]))
          .statusCode,
      ).toBe(200);
      const before = await readRawConfig(principalId);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL },
      ]);

      expect(response(res)).toEqual(reentryRequired([SEARXNG_REENTRY]));
      expect(await readRawConfig(principalId)).toEqual(before);
    });

    it.each([
      { name: 'deletes', tombstone: false },
      { name: 'tombstones', tombstone: true },
    ])('$name the URL once the key is removed first', async ({ tombstone }) => {
      const principalId = nextPrincipalId();
      await storeSearxng(principalId);

      expect((await removeField(principalId, 'webSearch.searxngApiKey', false)).statusCode).toBe(
        200,
      );
      const res = await removeField(principalId, 'webSearch.searxngInstanceUrl', tombstone);

      expect(res.statusCode).toBe(200);
      const overrides = await readRawOverrides(principalId);
      expect(getAtPath(overrides, 'webSearch.searxngInstanceUrl')).toBeUndefined();
      expect(getAtPath(overrides, 'webSearch.searxngApiKey')).toBeUndefined();
    });

    it('removes the whole section with its key', async () => {
      const principalId = nextPrincipalId();
      await storeSearxng(principalId);

      const res = await removeField(principalId, 'webSearch', false);

      expect(res.statusCode).toBe(200);
      expect(getAtPath(await readRawOverrides(principalId), 'webSearch')).toBeUndefined();
    });

    it('accepts a URL change where no key is stored beside it', async () => {
      const principalId = nextPrincipalId();
      await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: STORED_URL },
        { fieldPath: 'webSearch.searxngApiKey', value: '${SEARXNG_API_KEY}' },
      ]);

      const res = await patch(principalId, [
        { fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL },
      ]);

      expect(res.statusCode).toBe(200);
      expect(getAtPath(await readRawOverrides(principalId), 'webSearch.searxngInstanceUrl')).toBe(
        NEW_URL,
      );
    });

    describe('when another admin stores a key between the check and the write', () => {
      const VICTIM_URL = 'https://searx.example.com/victim';
      const VICTIM_KEY = 'sx-victim-key-0005';

      /** Handlers whose next config read is followed by another admin's URL-and-key write. */
      function racedHandlers(principalId: string): AdminConfigHandlers {
        let raced = false;
        return createHandlers(async (...args) => {
          const config = await configMethods.findConfigByPrincipal(...args);
          if (!raced) {
            raced = true;
            await configMethods.patchConfigFields(
              PrincipalType.ROLE,
              principalId,
              PrincipalModel.ROLE,
              encryptConfigSecretFields({
                'webSearch.searxngInstanceUrl': VICTIM_URL,
                'webSearch.searxngApiKey': VICTIM_KEY,
              }),
              10,
            );
          }
          return config;
        });
      }

      /** The response and the stored URL and key once the raced write returned. */
      async function outcome(principalId: string, res: MockRes) {
        const overrides = await readRawOverrides(principalId);
        const key = getAtPath(overrides, 'webSearch.searxngApiKey');
        return {
          statusCode: res.statusCode,
          body: res.body,
          url: getAtPath(overrides, 'webSearch.searxngInstanceUrl'),
          key: typeof key === 'string' ? decryptV3(key) : key,
        };
      }

      const VICTIM_KEPT = {
        statusCode: 409,
        body: { error: expect.any(String), code: 'CONFIG_VERSION_CONFLICT' },
        url: VICTIM_URL,
        key: VICTIM_KEY,
      };

      const params = (principalId: string) => ({ principalType: 'role', principalId });

      it.each([
        { name: 'on an existing document', existing: true },
        { name: 'on a document created meanwhile', existing: false },
      ])('rejects a URL-only patch $name', async ({ existing }) => {
        const principalId = nextPrincipalId();
        if (existing) {
          await patch(principalId, [{ fieldPath: 'webSearch.safeSearch', value: 1 }]);
        }
        const res = mockRes();

        await racedHandlers(principalId).patchConfigField(
          mockReq({
            params: params(principalId),
            body: { entries: [{ fieldPath: 'webSearch.searxngInstanceUrl', value: NEW_URL }] },
          }),
          res,
        );

        expect(await outcome(principalId, res)).toEqual(VICTIM_KEPT);
      });

      it('rejects a full replace that sets only the URL', async () => {
        const principalId = nextPrincipalId();
        await patch(principalId, [{ fieldPath: 'webSearch.safeSearch', value: 1 }]);
        const res = mockRes();

        await racedHandlers(principalId).upsertConfigOverrides(
          mockReq({
            params: params(principalId),
            body: { overrides: { webSearch: { searxngInstanceUrl: NEW_URL } } },
          }),
          res,
        );

        expect(await outcome(principalId, res)).toEqual(VICTIM_KEPT);
      });

      it.each([
        { name: 'deleting', handler: 'deleteConfigField' as const },
        { name: 'tombstoning', handler: 'tombstoneConfigField' as const },
      ])('rejects $name the URL', async ({ handler }) => {
        const principalId = nextPrincipalId();
        await patch(principalId, [{ fieldPath: 'webSearch.safeSearch', value: 1 }]);
        const res = mockRes();
        const fieldPath = 'webSearch.searxngInstanceUrl';

        await racedHandlers(principalId)[handler](
          mockReq({ params: params(principalId), query: { fieldPath }, body: { fieldPath } }),
          res,
        );

        expect(await outcome(principalId, res)).toEqual(VICTIM_KEPT);
      });

      it('lets a write to another section proceed', async () => {
        const principalId = nextPrincipalId();
        await patch(principalId, [{ fieldPath: 'webSearch.safeSearch', value: 1 }]);
        const res = mockRes();

        await racedHandlers(principalId).patchConfigField(
          mockReq({
            params: params(principalId),
            body: { entries: [{ fieldPath: 'webSearch.safeSearch', value: 2 }] },
          }),
          res,
        );

        expect(res.statusCode).toBe(200);
        expect(getAtPath(await readRawOverrides(principalId), 'webSearch.safeSearch')).toBe(2);
      });
    });
  });

  describe('getBaseConfig', () => {
    afterEach(() => {
      delete process.env.WEST_AZURE_API_KEY;
    });

    it('redacts literal secrets sourced from the resolved AppConfig (e.g. YAML literals)', async () => {
      const appConfig = {
        speech: {
          tts: {
            openai: { apiKey: SECRET, apiKeyPreview: getSecretPreview(SECRET), model: 'tts-1' },
          },
        },
        ocr: { apiKey: '${OCR_API_KEY}' },
        webSearch: { serperApiKey: SECRET, searchProvider: 'serper' },
        langfuse: { publicKey: 'pk-lf-1', secretKey: 'v3:stored', secretKeyPreview: 'sk-...ret' },
        paths: { uploads: '/tmp' },
        config: {
          speech: { tts: { openai: { apiKey: SECRET, model: 'tts-1' } } },
        },
      };
      const { createAdminConfigHandlers } = await import('./config');
      const baseHandlers = createAdminConfigHandlers({
        listAllConfigs: async () => [],
        findConfigByPrincipal: async () => null,
        upsertConfig: async () => null,
        patchConfigFields: async () => null,
        tombstoneConfigField: async () => null,
        unsetConfigField: async () => null,
        deleteConfig: async () => null,
        toggleConfigActiveTracked: async () => null,
        hasConfigCapability: async () => true,
        hasAnyConfigReadAccess: async () => true,
        hasCapability: async () => true,
        getAppConfig: async () => appConfig as never,
      });

      const res = mockRes();
      await baseHandlers.getBaseConfig(mockReq(), res);
      expect(res.statusCode).toBe(200);
      const payload = JSON.stringify(res.body);
      expect(payload).not.toContain(SECRET);
      expect(payload).not.toContain('v3:stored');
      const config = res.body!.config as Record<string, unknown>;
      expect(getAtPath(config, 'ocr.apiKey')).toBe('${OCR_API_KEY}');
      expect(getAtPath(config, 'speech.tts.openai.model')).toBe('tts-1');
      expect(getAtPath(config, 'speech.tts.openai.apiKey')).toBeUndefined();
      expect(getAtPath(config, 'speech.tts.openai.apiKeyPreview')).toBe(getSecretPreview(SECRET));
      expect(getAtPath(config, 'webSearch.serperApiKeyPreview')).toBeUndefined();
      expect(getAtPath(config, 'langfuse.secretKeyPreview')).toBe('*********');
      expect(getAtPath(config, 'config.speech.tts.openai.apiKey')).toBeUndefined();
    });

    it('redacts literal Azure group keys and the Vertex service key from what AppService builds', async () => {
      const AZURE_KEY = 'azure-literal-group-key-0123456789';
      const PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----vertex-test-key';
      const { AppService } = await import('@librechat/data-schemas');
      /** `azureConfigSetup` resolves each group's key reference at load, as a deployment would. */
      process.env.WEST_AZURE_API_KEY = 'west-env-value';
      const appConfig = await AppService({
        config: {
          endpoints: {
            azureOpenAI: {
              groups: [
                {
                  group: 'east',
                  apiKey: AZURE_KEY,
                  instanceName: 'east-instance',
                  version: '2024-02-01',
                  models: { 'gpt-4o': { deploymentName: 'gpt-4o' } },
                },
                {
                  group: 'west',
                  apiKey: '${WEST_AZURE_API_KEY}',
                  instanceName: 'west-instance',
                  version: '2024-02-01',
                  models: { 'gpt-4o-mini': { deploymentName: 'gpt-4o-mini' } },
                },
              ],
            },
            anthropic: {
              vertex: {
                region: 'us-east5',
                serviceKeyFile: JSON.stringify({
                  type: 'service_account',
                  private_key: PRIVATE_KEY,
                }),
                models: ['claude-sonnet-4'],
              },
            },
          },
        },
      });
      expect(JSON.stringify(appConfig)).toContain(AZURE_KEY);
      expect(JSON.stringify(appConfig)).toContain(PRIVATE_KEY);

      const { createAdminConfigHandlers } = await import('./config');
      const getAppConfig = jest.fn(async (_options?: { baseOnly?: boolean }) => appConfig);
      const baseHandlers = createAdminConfigHandlers({
        listAllConfigs: async () => [],
        findConfigByPrincipal: async () => null,
        upsertConfig: async () => null,
        patchConfigFields: async () => null,
        tombstoneConfigField: async () => null,
        unsetConfigField: async () => null,
        deleteConfig: async () => null,
        toggleConfigActiveTracked: async () => null,
        hasConfigCapability: async () => true,
        hasAnyConfigReadAccess: async () => true,
        hasCapability: async () => true,
        getAppConfig,
      });

      for (const query of [{}, { baseOnly: 'true' }]) {
        const res = mockRes();
        await baseHandlers.getBaseConfig(mockReq({ query }), res);
        expect(res.statusCode).toBe(200);
        const payload = JSON.stringify(res.body);
        expect(payload).not.toContain(AZURE_KEY);
        expect(payload).not.toContain(PRIVATE_KEY);

        const config = res.body!.config as Record<string, unknown>;
        expect(getAtPath(config, 'endpoints.azureOpenAI.groupMap.east.instanceName')).toBe(
          'east-instance',
        );
        expect(getAtPath(config, 'endpoints.azureOpenAI.groupMap.east.apiKey')).toBeUndefined();
        expect(getAtPath(config, 'endpoints.azureOpenAI.groupMap.west.apiKey')).toBe(
          '${WEST_AZURE_API_KEY}',
        );
        const yamlGroups = getAtPath(config, 'config.endpoints.azureOpenAI.groups') as Array<
          Record<string, unknown>
        >;
        expect(yamlGroups.map((group) => group.apiKey)).toEqual([
          undefined,
          '${WEST_AZURE_API_KEY}',
        ]);
        expect(getAtPath(config, 'endpoints.anthropic.vertexConfig.region')).toBe('us-east5');
        expect(
          getAtPath(config, 'endpoints.anthropic.vertexConfig.serviceKeyFile'),
        ).toBeUndefined();
        expect(getAtPath(config, 'endpoints.anthropic.vertex.serviceKeyFile')).toBeUndefined();
        expect(
          getAtPath(config, 'config.endpoints.anthropic.vertex.serviceKeyFile'),
        ).toBeUndefined();
      }
      expect(getAppConfig.mock.calls.map(([options]) => options?.baseOnly)).toEqual([
        false,
        true,
        true,
      ]);
      expect(JSON.stringify(appConfig)).toContain(AZURE_KEY);
    });
  });
});

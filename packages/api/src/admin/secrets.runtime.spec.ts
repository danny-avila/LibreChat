import http from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { loadWebSearchConfig } from '@librechat/data-schemas';
import { RerankerTypes, SearchProviders, ScraperProviders } from 'librechat-data-provider';
import type { AppConfig, TWebSearchKeys } from '@librechat/data-schemas';
import type { TWebSearchConfigInput } from 'librechat-data-provider';
import type { AddressInfo } from 'node:net';
import type { ArraySecretField } from './secrets';
import {
  getConfigSecretFields,
  encryptConfigSecretFields,
  getConfigArraySecretFields,
} from './secrets';
import { resolveTenantCredentials } from '~/langfuse/utils';
import { uploadMistralOCR } from '~/files/mistral/crud';
import { getCustomEndpointConfig } from '~/app/config';
import { loadWebSearchAuth } from '~/web';

/** Encryption reads `CREDS_KEY` when data-schemas loads, before any spec code runs. */
jest.mock('@librechat/data-schemas', () => {
  process.env.CREDS_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  return jest.requireActual('@librechat/data-schemas');
});

const REPO_ROOT = join(__dirname, '../../../..');
const DECRYPTING_CALL =
  /\b(?:resolveConfigSecret|resolveStoredConfigSecret|decryptConfigSecret|resolveCustomEndpointSecrets)\(/;

interface RuntimeReader {
  /** Repo-relative module that reads the merged config value when the feature runs. */
  module: string;
  /**
   * Runs the real reader on the value the admin config API stores and returns
   * what it would send. Readers under `/api` (TTS and STT) cannot load in this
   * workspace, so for them this spec only checks that the module source calls a
   * decrypting function; their own specs cover each provider's key.
   */
  probe?: (stored: string) => Promise<string | undefined>;
}

const KEYLESS_WEB_SEARCH: TWebSearchConfigInput = {
  searchProvider: SearchProviders.KEENABLE,
  scraperProvider: ScraperProviders.KEENABLE,
  rerankerType: RerankerTypes.NONE,
  keenableApiUrl: '',
};

/** Runs web search auth with one stored credential and the service that reads it selected. */
function webSearchReader(key: TWebSearchKeys, selection: TWebSearchConfigInput): RuntimeReader {
  return {
    module: 'packages/api/src/web/web.ts',
    probe: async (stored) => {
      const { authResult } = await loadWebSearchAuth({
        userId: 'runtime-reader-spec',
        webSearchConfig: loadWebSearchConfig({
          ...KEYLESS_WEB_SEARCH,
          ...selection,
          [key]: stored,
        }),
        loadAuthValues: async () => ({}),
      });
      return authResult[key];
    },
  };
}

/**
 * A local OCR provider that records the bearer token of each request and
 * fails it, so an upload stops after the reader has sent its key.
 */
const ocrProvider = {
  tokens: [] as string[],
  baseURL: '',
  allowedAddress: '',
  server: http.createServer((req, res) => {
    ocrProvider.tokens.push(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    req.resume();
    req.on('end', () => {
      res.statusCode = 503;
      res.end();
    });
  }),
};

/** Uploads a document through the real Mistral OCR reader and returns the key it sent. */
async function sendOCRUpload(stored: string): Promise<string | undefined> {
  const dir = await mkdtemp(join(tmpdir(), 'ocr-runtime-reader-'));
  const path = join(dir, 'document.pdf');
  await writeFile(path, '%PDF-1.4');
  const context = {
    req: {
      user: { id: 'runtime-reader-spec' },
      config: {
        ocr: {
          apiKey: stored,
          baseURL: ocrProvider.baseURL,
          allowedAddresses: [ocrProvider.allowedAddress],
        },
      },
    },
    file: { path, originalname: 'document.pdf', mimetype: 'application/pdf' },
    loadAuthValues: async () => ({}),
  } as unknown as Parameters<typeof uploadMistralOCR>[0];
  try {
    await expect(uploadMistralOCR(context)).rejects.toThrow();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return ocrProvider.tokens.shift();
}

const CUSTOM_ENDPOINT_NAME = 'runtime-reader';

/** Array-item secrets are listed as `<arrayPath>[].<secretKey>`. */
const ARRAY_SECRET_FIELDS = new Map<string, ArraySecretField>(
  getConfigArraySecretFields().map((field) => [`${field.arrayPath}[].${field.secretKey}`, field]),
);

/** The value the admin config API stores for a registered secret. */
function storeSecret(path: string, secret: string): unknown {
  const arrayField = ARRAY_SECRET_FIELDS.get(path);
  if (!arrayField) {
    return encryptConfigSecretFields({ [path]: secret })[path];
  }
  const { arrayPath, identityKey, secretKey } = arrayField;
  const item = { [identityKey]: CUSTOM_ENDPOINT_NAME, [secretKey]: secret };
  const [stored] = encryptConfigSecretFields({ [arrayPath]: [item] })[arrayPath] as Array<
    Record<string, string>
  >;
  return stored[secretKey];
}

const TTS_SERVICE = { module: 'api/server/services/Files/Audio/TTSService.js' };
const STT_SERVICE = { module: 'api/server/services/Files/Audio/STTService.js' };

/**
 * Every registered secret path and the runtime reader that decrypts it. A path
 * the registry encrypts but nothing decrypts silently disables its feature, so
 * a new registry entry needs a row here (or in `UNREAD_SECRET_FIELDS`).
 */
const RUNTIME_READERS: Readonly<Record<string, RuntimeReader>> = {
  'langfuse.secretKey': {
    module: 'packages/api/src/langfuse/utils.ts',
    probe: async (stored) =>
      resolveTenantCredentials({ publicKey: 'pk-lf-runtime', secretKey: stored })?.secretKey,
  },
  'ocr.apiKey': { module: 'packages/api/src/files/mistral/crud.ts', probe: sendOCRUpload },
  'speech.tts.openai.apiKey': TTS_SERVICE,
  'speech.tts.azureOpenAI.apiKey': TTS_SERVICE,
  'speech.tts.elevenlabs.apiKey': TTS_SERVICE,
  'speech.tts.localai.apiKey': TTS_SERVICE,
  'speech.stt.openai.apiKey': STT_SERVICE,
  'speech.stt.azureOpenAI.apiKey': STT_SERVICE,
  'webSearch.serperApiKey': webSearchReader('serperApiKey', {
    searchProvider: SearchProviders.SERPER,
  }),
  'webSearch.searxngApiKey': webSearchReader('searxngApiKey', {
    searchProvider: SearchProviders.SEARXNG,
    searxngInstanceUrl: 'https://searx.example.com',
  }),
  'webSearch.firecrawlApiKey': webSearchReader('firecrawlApiKey', {
    scraperProvider: ScraperProviders.FIRECRAWL,
  }),
  'webSearch.tavilyApiKey': webSearchReader('tavilyApiKey', {
    searchProvider: SearchProviders.TAVILY,
  }),
  'webSearch.keenableApiKey': webSearchReader('keenableApiKey', {}),
  'webSearch.jinaApiKey': webSearchReader('jinaApiKey', { rerankerType: RerankerTypes.JINA }),
  'webSearch.cohereApiKey': webSearchReader('cohereApiKey', {
    rerankerType: RerankerTypes.COHERE,
  }),
  'endpoints.custom[].apiKey': {
    module: 'packages/api/src/app/config.ts',
    probe: async (stored) => {
      const custom = [
        {
          name: CUSTOM_ENDPOINT_NAME,
          apiKey: stored,
          baseURL: 'https://custom.example.com/v1',
          models: { default: ['runtime-model'] },
        },
      ];
      const appConfig = { endpoints: { custom } } as AppConfig;
      return getCustomEndpointConfig({ endpoint: CUSTOM_ENDPOINT_NAME, appConfig })?.apiKey;
    },
  },
};

/**
 * Registered paths that no runtime code reads: they are encrypted and redacted
 * like any secret, but setting them changes nothing. Each needs a reader before
 * an admin UI can present it as working.
 */
const UNREAD_SECRET_FIELDS: Readonly<Record<string, string>> = {
  'endpoints.assistants.apiKey':
    'Assistants initialize from ASSISTANTS_API_KEY; the endpoint config apiKey is never read.',
  'endpoints.azureAssistants.apiKey':
    'Azure Assistants initialize from AZURE_ASSISTANTS_API_KEY or azureOpenAI groups; the endpoint config apiKey is never read.',
};

describe('config secret registry runtime readers', () => {
  beforeAll(async () => {
    await new Promise<void>((resolve) => ocrProvider.server.listen(0, '127.0.0.1', resolve));
    const { port } = ocrProvider.server.address() as AddressInfo;
    ocrProvider.allowedAddress = `127.0.0.1:${port}`;
    ocrProvider.baseURL = `http://${ocrProvider.allowedAddress}/v1`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => ocrProvider.server.close(() => resolve()));
  });

  const registered = [
    ...getConfigSecretFields().map(({ path }) => path),
    ...ARRAY_SECRET_FIELDS.keys(),
  ];

  it('pairs every registered secret path with a runtime reader or a documented gap', () => {
    const listed = [...Object.keys(RUNTIME_READERS), ...Object.keys(UNREAD_SECRET_FIELDS)];

    expect(new Set(listed).size).toBe(listed.length);
    expect([...listed].sort()).toEqual([...registered].sort());
  });

  it.each(Object.entries(RUNTIME_READERS))('%s is read by a module that decrypts', (_, reader) => {
    const source = readFileSync(join(REPO_ROOT, reader.module), 'utf8');

    expect(source).toMatch(DECRYPTING_CALL);
  });

  it.each(
    Object.entries(RUNTIME_READERS).flatMap(([path, { probe }]) => (probe ? [[path, probe]] : [])),
  )('%s reaches its reader as plaintext', async (path, probe) => {
    const secret = `${path}-runtime-secret-0001`;
    const stored = storeSecret(path, secret);

    expect(stored).toMatch(/^v3:/);
    await expect(probe(stored as string)).resolves.toBe(secret);
  });
});

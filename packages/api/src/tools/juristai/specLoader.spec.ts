import type { OpenAPIV3 } from 'openapi-types';
import { loadDjangoSpec, filterSpecForApp, clearSpecCache } from './specLoader';
import type { JuristaiSpecConfig } from './specLoader';

const makeSpec = (): OpenAPIV3.Document => ({
  openapi: '3.0.0',
  info: { title: 'Jurist Hub API', version: '1.0.0' },
  paths: {
    '/api/core/search-case/': {
      post: {
        operationId: 'search-case',
        summary: 'Search cases',
        responses: { '200': { description: 'ok' } },
        ['x-llm-callable']: true,
      } as OpenAPIV3.OperationObject,
    },
    '/api/core/get-case-metadata/': {
      get: {
        operationId: 'get-case-metadata',
        responses: { '200': { description: 'ok' } },
        ['x-llm-callable']: true,
      } as OpenAPIV3.OperationObject,
    },
    '/api/core/generate-motion/': {
      post: {
        operationId: 'generate-motion',
        responses: { '200': { description: 'ok' } },
      } as OpenAPIV3.OperationObject,
    },
  },
});

const config: JuristaiSpecConfig = { djangoBaseUrl: 'https://api-dev.juristai.org' };

const operationIds = (spec: OpenAPIV3.Document): string[] => {
  const ids: string[] = [];
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const op of Object.values(pathItem ?? {})) {
      const operation = op as OpenAPIV3.OperationObject;
      if (operation?.operationId) {
        ids.push(operation.operationId);
      }
    }
  }
  return ids;
};

describe('filterSpecForApp', () => {
  it('keeps only x-llm-callable operations', () => {
    const filtered = filterSpecForApp(makeSpec(), config);
    const ids = operationIds(filtered);
    expect(ids).toContain('search-case');
    expect(ids).toContain('get-case-metadata');
    expect(ids).not.toContain('generate-motion');
  });

  it('narrows to the per-app allowlist when provided', () => {
    const filtered = filterSpecForApp(makeSpec(), { ...config, perAppOperations: { '1': ['search-case'] } }, '1');
    const ids = operationIds(filtered);
    expect(ids).toEqual(['search-case']);
  });

  it('exposes all llm-callable ops when appId has no allowlist entry', () => {
    const filtered = filterSpecForApp(makeSpec(), { ...config, perAppOperations: { '1': ['search-case'] } }, '2');
    expect(operationIds(filtered).sort()).toEqual(['get-case-metadata', 'search-case']);
  });
});

describe('loadDjangoSpec', () => {
  afterEach(() => clearSpecCache());

  it('returns the static spec without fetching when provided', async () => {
    const staticSpec = makeSpec();
    const spec = await loadDjangoSpec({ ...config, staticSpec });
    expect(spec).toBe(staticSpec);
  });
});

import type { OpenAPIV3 } from 'openapi-types';
import { buildJuristaiTools, JURISTAI_TOOL_PREFIX } from './toolBuilder';

const spec: OpenAPIV3.Document = {
  openapi: '3.0.0',
  info: { title: 'Jurist Hub API', version: '1.0.0' },
  paths: {
    '/api/core/search-case/': {
      post: {
        operationId: 'search-case',
        summary: 'Search cases by docket ID or query terms.',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { query: { type: 'string' } },
                required: ['query'],
              },
            },
          },
        },
        responses: { '200': { description: 'ok' } },
      } as OpenAPIV3.OperationObject,
    },
  },
};

describe('buildJuristaiTools', () => {
  it('builds a namespaced tool with a request builder targeting the django base url', () => {
    const tools = buildJuristaiTools(spec, 'https://api-dev.juristai.org/');
    expect(tools).toHaveLength(1);

    const [tool] = tools;
    expect(tool.name).toBe(`${JURISTAI_TOOL_PREFIX}search-case`);
    expect(tool.operationId).toBe('search-case');
    expect(tool.description).toBe('Search cases by docket ID or query terms.');
    expect(tool.requestBuilder.domain).toBe('https://api-dev.juristai.org');
    expect(tool.requestBuilder.method.toLowerCase()).toBe('post');
  });

  it('returns an empty catalog for a spec with no operations', () => {
    const empty: OpenAPIV3.Document = {
      openapi: '3.0.0',
      info: { title: 't', version: '1' },
      paths: {},
    };
    expect(buildJuristaiTools(empty, 'https://x')).toEqual([]);
  });
});

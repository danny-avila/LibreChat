import axios from 'axios';
import { OpenAPIV3 } from 'openapi-types';
import {
  resolveRef,
  ActionRequest,
  openapiToFunction,
  FunctionSignature,
  validateAndParseOpenAPISpec,
} from '../src/actions';
import { getWeatherOpenapiSpec, whimsicalOpenapiSpec, scholarAIOpenapiSpec } from './openapiSpecs';
import { AuthorizationTypeEnum, AuthTypeEnum } from '../src/types/assistants';
import type { FlowchartSchema } from './openapiSpecs';
import type { ParametersSchema } from '../src/actions';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FunctionSignature', () => {
  it('creates a function signature and converts to JSON tool', () => {
    const signature = new FunctionSignature('testFunction', 'A test function', {
      param1: { type: 'string' },
    } as unknown as ParametersSchema);
    expect(signature.name).toBe('testFunction');
    expect(signature.description).toBe('A test function');
    expect(signature.toObjectTool()).toEqual({
      type: 'function',
      function: {
        name: 'testFunction',
        description: 'A test function',
        parameters: {
          param1: { type: 'string' },
        },
      },
    });
  });
});

describe('ActionRequest', () => {
  // Mocking responses for each method
  beforeEach(() => {
    mockedAxios.get.mockResolvedValue({ data: { success: true, method: 'GET' } });
    mockedAxios.post.mockResolvedValue({ data: { success: true, method: 'POST' } });
    mockedAxios.put.mockResolvedValue({ data: { success: true, method: 'PUT' } });
    mockedAxios.delete.mockResolvedValue({ data: { success: true, method: 'DELETE' } });
    mockedAxios.patch.mockResolvedValue({ data: { success: true, method: 'PATCH' } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should make a GET request', async () => {
    const actionRequest = new ActionRequest(
      'https://example.com',
      '/test',
      'GET',
      'testOp',
      false,
      'application/json',
    );
    await actionRequest.setParams({ param1: 'value1' });
    const response = await actionRequest.execute();
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/test', expect.anything());
    expect(response.data).toEqual({ success: true, method: 'GET' });
  });

  describe('ActionRequest', () => {
    beforeEach(() => {
      mockedAxios.get.mockClear();
      mockedAxios.post.mockClear();
      mockedAxios.put.mockClear();
      mockedAxios.delete.mockClear();
      mockedAxios.patch.mockClear();
    });

    it('handles GET requests', async () => {
      mockedAxios.get.mockResolvedValue({ data: { success: true } });
      const actionRequest = new ActionRequest(
        'https://example.com',
        '/get',
        'GET',
        'testGet',
        false,
        'application/json',
      );
      await actionRequest.setParams({ param: 'test' });
      const response = await actionRequest.execute();
      expect(mockedAxios.get).toHaveBeenCalled();
      expect(response.data.success).toBe(true);
    });

    it('handles POST requests', async () => {
      mockedAxios.post.mockResolvedValue({ data: { success: true } });
      const actionRequest = new ActionRequest(
        'https://example.com',
        '/post',
        'POST',
        'testPost',
        false,
        'application/json',
      );
      await actionRequest.setParams({ param: 'test' });
      const response = await actionRequest.execute();
      expect(mockedAxios.post).toHaveBeenCalled();
      expect(response.data.success).toBe(true);
    });

    it('handles PUT requests', async () => {
      mockedAxios.put.mockResolvedValue({ data: { success: true } });
      const actionRequest = new ActionRequest(
        'https://example.com',
        '/put',
        'PUT',
        'testPut',
        false,
        'application/json',
      );
      await actionRequest.setParams({ param: 'test' });
      const response = await actionRequest.execute();
      expect(mockedAxios.put).toHaveBeenCalled();
      expect(response.data.success).toBe(true);
    });

    it('handles DELETE requests', async () => {
      mockedAxios.delete.mockResolvedValue({ data: { success: true } });
      const actionRequest = new ActionRequest(
        'https://example.com',
        '/delete',
        'DELETE',
        'testDelete',
        false,
        'application/json',
      );
      await actionRequest.setParams({ param: 'test' });
      const response = await actionRequest.execute();
      expect(mockedAxios.delete).toHaveBeenCalled();
      expect(response.data.success).toBe(true);
    });

    it('handles PATCH requests', async () => {
      mockedAxios.patch.mockResolvedValue({ data: { success: true } });
      const actionRequest = new ActionRequest(
        'https://example.com',
        '/patch',
        'PATCH',
        'testPatch',
        false,
        'application/json',
      );
      await actionRequest.setParams({ param: 'test' });
      const response = await actionRequest.execute();
      expect(mockedAxios.patch).toHaveBeenCalled();
      expect(response.data.success).toBe(true);
    });

    it('throws an error for unsupported HTTP methods', async () => {
      const actionRequest = new ActionRequest(
        'https://example.com',
        '/invalid',
        'INVALID',
        'testInvalid',
        false,
        'application/json',
      );
      await expect(actionRequest.execute()).rejects.toThrow('Unsupported HTTP method: INVALID');
    });

    it('replaces path parameters with values from toolInput', async () => {
      const actionRequest = new ActionRequest(
        'https://example.com',
        '/stocks/{stocksTicker}/bars/{multiplier}',
        'GET',
        'getAggregateBars',
        false,
        'application/json',
      );

      await actionRequest.setParams({
        stocksTicker: 'AAPL',
        multiplier: 5,
        startDate: '2023-01-01',
        endDate: '2023-12-31',
      });

      expect(actionRequest.path).toBe('/stocks/AAPL/bars/5');
      expect(actionRequest.params).toEqual({
        startDate: '2023-01-01',
        endDate: '2023-12-31',
      });

      await actionRequest.execute();
      expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/stocks/AAPL/bars/5', {
        headers: expect.anything(),
        params: {
          startDate: '2023-01-01',
          endDate: '2023-12-31',
        },
      });
    });
  });

  it('throws an error for unsupported HTTP method', async () => {
    const actionRequest = new ActionRequest(
      'https://example.com',
      '/test',
      'INVALID',
      'testOp',
      false,
      'application/json',
    );
    await expect(actionRequest.execute()).rejects.toThrow('Unsupported HTTP method: INVALID');
  });
});

describe('Authentication Handling', () => {
  it('correctly sets Basic Auth header', async () => {
    const actionRequest = new ActionRequest(
      'https://example.com',
      '/test',
      'GET',
      'testOp',
      false,
      'application/json',
    );

    const api_key = 'user:pass';
    const encodedCredentials = Buffer.from('user:pass').toString('base64');

    actionRequest.setAuth({
      auth: {
        type: AuthTypeEnum.ServiceHttp,
        authorization_type: AuthorizationTypeEnum.Basic,
      },
      api_key,
    });

    await actionRequest.setParams({ param1: 'value1' });
    await actionRequest.execute();
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/test', {
      headers: expect.objectContaining({
        Authorization: `Basic ${encodedCredentials}`,
      }),
      params: expect.anything(),
    });
  });

  it('correctly sets Bearer token', async () => {
    const actionRequest = new ActionRequest(
      'https://example.com',
      '/test',
      'GET',
      'testOp',
      false,
      'application/json',
    );
    actionRequest.setAuth({
      auth: {
        type: AuthTypeEnum.ServiceHttp,
        authorization_type: AuthorizationTypeEnum.Bearer,
      },
      api_key: 'token123',
    });
    await actionRequest.setParams({ param1: 'value1' });
    await actionRequest.execute();
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/test', {
      headers: expect.objectContaining({
        Authorization: 'Bearer token123',
      }),
      params: expect.anything(),
    });
  });

  it('correctly sets API Key', async () => {
    const actionRequest = new ActionRequest(
      'https://example.com',
      '/test',
      'GET',
      'testOp',
      false,
      'application/json',
    );
    // Updated to match ActionMetadata structure
    actionRequest.setAuth({
      auth: {
        type: AuthTypeEnum.ServiceHttp, // Assuming this is a valid enum or value for your context
        authorization_type: AuthorizationTypeEnum.Custom, // Assuming Custom means using a custom header
        custom_auth_header: 'X-API-KEY',
      },
      api_key: 'abc123',
    });
    await actionRequest.setParams({ param1: 'value1' });
    await actionRequest.execute();
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/test', {
      headers: expect.objectContaining({
        'X-API-KEY': 'abc123',
      }),
      params: expect.anything(),
    });
  });
});

describe('resolveRef', () => {
  it('correctly resolves $ref references in the OpenAPI spec', () => {
    const openapiSpec = whimsicalOpenapiSpec;
    const flowchartRequestRef = (
      openapiSpec.paths['/ai.chatgpt.render-flowchart']?.post
        ?.requestBody as OpenAPIV3.RequestBodyObject
    )?.content['application/json'].schema;
    expect(flowchartRequestRef).toBeDefined();
    const resolvedFlowchartRequest = resolveRef(
      flowchartRequestRef as OpenAPIV3.RequestBodyObject,
      openapiSpec.components,
    );

    expect(resolvedFlowchartRequest).toBeDefined();
    expect(resolvedFlowchartRequest.type).toBe('object');
    const properties = resolvedFlowchartRequest.properties as FlowchartSchema;
    expect(properties).toBeDefined();
    expect(properties.mermaid).toBeDefined();
    expect(properties.mermaid.type).toBe('string');
  });
});

describe('openapiToFunction', () => {
  it('converts OpenAPI spec to function signatures and request builders', () => {
    const { functionSignatures, requestBuilders } = openapiToFunction(getWeatherOpenapiSpec);
    expect(functionSignatures.length).toBe(1);
    expect(functionSignatures[0].name).toBe('GetCurrentWeather');

    const parameters = functionSignatures[0].parameters as ParametersSchema & {
      properties: {
        location: {
          type: 'string';
        };
        locations: {
          type: 'array';
          items: {
            type: 'object';
            properties: {
              city: {
                type: 'string';
              };
              state: {
                type: 'string';
              };
              countryCode: {
                type: 'string';
              };
              time: {
                type: 'string';
              };
            };
          };
        };
      };
    };

    expect(parameters).toBeDefined();
    expect(parameters.properties.locations).toBeDefined();
    expect(parameters.properties.locations.type).toBe('array');
    expect(parameters.properties.locations.items.type).toBe('object');

    expect(parameters.properties.locations.items.properties.city.type).toBe('string');
    expect(parameters.properties.locations.items.properties.state.type).toBe('string');
    expect(parameters.properties.locations.items.properties.countryCode.type).toBe('string');
    expect(parameters.properties.locations.items.properties.time.type).toBe('string');

    expect(requestBuilders).toHaveProperty('GetCurrentWeather');
    expect(requestBuilders.GetCurrentWeather).toBeInstanceOf(ActionRequest);
  });

  describe('openapiToFunction with $ref resolution', () => {
    it('correctly converts OpenAPI spec to function signatures and request builders, resolving $ref references', () => {
      const { functionSignatures, requestBuilders } = openapiToFunction(whimsicalOpenapiSpec);

      expect(functionSignatures.length).toBeGreaterThan(0);

      const postRenderFlowchartSignature = functionSignatures.find(
        (sig) => sig.name === 'postRenderFlowchart',
      );
      expect(postRenderFlowchartSignature).toBeDefined();
      expect(postRenderFlowchartSignature?.name).toBe('postRenderFlowchart');
      expect(postRenderFlowchartSignature?.parameters).toBeDefined();

      expect(requestBuilders).toHaveProperty('postRenderFlowchart');
      const postRenderFlowchartRequestBuilder = requestBuilders['postRenderFlowchart'];
      expect(postRenderFlowchartRequestBuilder).toBeDefined();
      expect(postRenderFlowchartRequestBuilder.method).toBe('post');
      expect(postRenderFlowchartRequestBuilder.path).toBe('/ai.chatgpt.render-flowchart');
    });
  });
});

const invalidServerURL = 'Could not find a valid URL in `servers`';

describe('validateAndParseOpenAPISpec', () => {
  it('validates a correct OpenAPI spec successfully', () => {
    const validSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://test.api' }],
      paths: { '/test': {} },
      components: { schemas: {} },
    });

    const result = validateAndParseOpenAPISpec(validSpec);
    expect(result.status).toBe(true);
    expect(result.message).toBe('OpenAPI spec is valid.');
  });

  it('returns an error for spec with no servers', () => {
    const noServerSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: { '/test': {} },
      components: { schemas: {} },
    });

    const result = validateAndParseOpenAPISpec(noServerSpec);
    expect(result.status).toBe(false);
    expect(result.message).toBe(invalidServerURL);
  });

  it('returns an error for spec with empty server URL', () => {
    const emptyURLSpec = `{
      "openapi": "3.1.0",
      "info": {
        "title": "Untitled",
        "description": "Your OpenAPI specification",
        "version": "v1.0.0"
      },
      "servers": [
        {
          "url": ""
        }
      ],
      "paths": {},
      "components": {
        "schemas": {}
      }
    }`;

    const result = validateAndParseOpenAPISpec(emptyURLSpec);
    expect(result.status).toBe(false);
    expect(result.message).toBe(invalidServerURL);
  });

  it('returns an error for spec with no paths', () => {
    const noPathsSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://test.api' }],
      components: { schemas: {} },
    });

    const result = validateAndParseOpenAPISpec(noPathsSpec);
    expect(result.status).toBe(false);
    expect(result.message).toBe('No paths found in the OpenAPI spec.');
  });

  it('detects missing components in spec', () => {
    const missingComponentSpec = JSON.stringify({
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      servers: [{ url: 'https://test.api' }],
      paths: {
        '/test': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/Missing' } },
                },
              },
            },
          },
        },
      },
    });

    const result = validateAndParseOpenAPISpec(missingComponentSpec);
    expect(result.status).toBe(true);
    expect(result.message).toContain('reference to unknown component Missing');
    expect(result.spec).toBeDefined();
  });

  it('handles invalid spec formats', () => {
    const invalidSpec = 'not a valid spec';

    const result = validateAndParseOpenAPISpec(invalidSpec);
    expect(result.status).toBe(false);
    expect(result.message).toBe(invalidServerURL);
  });

  it('handles YAML spec and correctly converts to Function Signatures', () => {
    const result = validateAndParseOpenAPISpec(scholarAIOpenapiSpec);
    expect(result.status).toBe(true);

    const spec = result.spec;
    expect(spec).toBeDefined();

    const { functionSignatures, requestBuilders } = openapiToFunction(spec as OpenAPIV3.Document);
    expect(functionSignatures.length).toBe(3);
    expect(requestBuilders).toHaveProperty('searchAbstracts');
    expect(requestBuilders).toHaveProperty('getFullText');
    expect(requestBuilders).toHaveProperty('saveCitation');
  });
});

import axios from 'axios';
import {
  FunctionSignature,
  ActionRequest,
  openapiToFunction,
  validateAndParseOpenAPISpec,
} from '../src/actions';
import type { ParametersSchema } from '../src/actions';
import type { OpenAPIV3 } from 'openapi-types';

type OpenAPISpec = OpenAPIV3.Document;

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FunctionSignature', () => {
  it('creates a function signature and converts to JSON tool', () => {
    const signature = new FunctionSignature('testFunction', 'A test function', {
      param1: { type: 'string' },
    });
    expect(signature.name).toBe('testFunction');
    expect(signature.description).toBe('A test function');
    expect(signature.toJSONTool()).toEqual({
      type: 'function',
      function: JSON.stringify(signature),
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
    actionRequest.setAuth('Basic', { username: 'user', password: 'pass' });
    await actionRequest.setParams({ param1: 'value1' });
    await actionRequest.execute();
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/test', {
      headers: expect.objectContaining({
        Authorization: expect.stringMatching(/^Basic/),
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
    actionRequest.setAuth('Bearer', { token: 'token123' });
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
    actionRequest.setAuth('ApiKey', { headerName: 'X-API-KEY', apiKey: 'abc123' });
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

describe('openapiToFunction', () => {
  it('converts OpenAPI spec to function signatures and request builders', () => {
    const openapiSpec = {
      openapi: '3.1.0',
      info: {
        title: 'Get weather data',
        description: 'Retrieves current weather data for a location.',
        version: 'v1.0.0',
      },
      servers: [
        {
          url: 'https://weather.example.com',
        },
      ],
      paths: {
        '/location': {
          get: {
            description: 'Get temperature for a specific location',
            operationId: 'GetCurrentWeather',
            parameters: [
              {
                name: 'location',
                in: 'query',
                description: 'The city and state to retrieve the weather for',
                required: true,
                schema: {
                  type: 'string',
                },
              },
            ],
            deprecated: false,
            responses: {},
          },
        },
      },
      components: {
        schemas: {},
      },
    };

    const { functionSignatures, requestBuilders } = openapiToFunction(openapiSpec as OpenAPISpec);

    expect(functionSignatures.length).toBe(1);
    expect(functionSignatures[0].name).toBe('GetCurrentWeather');
    expect(
      (functionSignatures[0].parameters as ParametersSchema).properties.location.description,
    ).toBe(openapiSpec.paths['/location'].get.parameters[0].description);
    expect(requestBuilders).toHaveProperty('GetCurrentWeather');
    expect(requestBuilders.GetCurrentWeather).toBeInstanceOf(ActionRequest);
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
      // Note: 'components' section intentionally omitted or does not contain 'Missing' schema
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
});

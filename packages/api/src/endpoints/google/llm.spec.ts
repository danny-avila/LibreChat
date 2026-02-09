import { Providers } from '@librechat/agents';
import { AuthKeys } from 'librechat-data-provider';
import type * as t from '~/types';
import { getGoogleConfig, getSafetySettings, knownGoogleParams } from './llm';

describe('getGoogleConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_EXCLUDE_SAFETY_SETTINGS;
    delete process.env.GOOGLE_LOC;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Basic Configuration', () => {
    it('should create a basic configuration with API key', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
      });

      expect(result.provider).toBe(Providers.GOOGLE);
      expect(result.llmConfig).toHaveProperty('apiKey', 'test-api-key');
      expect(result.llmConfig).toHaveProperty('model', 'gemini-1.5-flash');
      expect(result.llmConfig).toHaveProperty('maxRetries', 2);
      expect(result.tools).toEqual([]);
    });

    it('should handle JSON string credentials', () => {
      const credentials = JSON.stringify({
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key-from-json',
      });

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-pro',
        },
      });

      expect(result.llmConfig).toHaveProperty('apiKey', 'test-api-key-from-json');
    });

    it('should handle acceptRawApiKey flag', () => {
      const result = getGoogleConfig(
        'raw-api-key-string',
        {
          modelOptions: {
            model: 'gemini-1.5-flash',
          },
        },
        true,
      );

      expect(result.llmConfig).toHaveProperty('apiKey', 'raw-api-key-string');
    });

    it('should handle model options including temperature and topP/topK', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
      expect(result.llmConfig).toHaveProperty('topK', 40);
    });

    it('should handle maxOutputTokens', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          maxOutputTokens: 4096,
        },
      });

      expect(result.llmConfig).toHaveProperty('maxOutputTokens', 4096);
    });
  });

  describe('Empty String Handling (Issue Fix)', () => {
    it('should remove empty string maxOutputTokens from config', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      // Simulating empty string from form - cast to any to bypass TypeScript
      const modelOptions = {
        model: 'gemini-1.5-flash',
        maxOutputTokens: '',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: modelOptions as unknown as t.GoogleParameters,
      });

      expect(result.llmConfig).not.toHaveProperty('maxOutputTokens');
    });

    it('should remove empty string temperature from config', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const modelOptions = {
        model: 'gemini-1.5-flash',
        temperature: '',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: modelOptions as unknown as t.GoogleParameters,
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
    });

    it('should remove empty string topP from config', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const modelOptions = {
        model: 'gemini-1.5-flash',
        topP: '',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: modelOptions as unknown as t.GoogleParameters,
      });

      expect(result.llmConfig).not.toHaveProperty('topP');
    });

    it('should remove empty string topK from config', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const modelOptions = {
        model: 'gemini-1.5-flash',
        topK: '',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: modelOptions as unknown as t.GoogleParameters,
      });

      expect(result.llmConfig).not.toHaveProperty('topK');
    });

    it('should preserve valid numeric values while removing empty strings', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const modelOptions = {
        model: 'gemini-1.5-flash',
        temperature: 0.5,
        maxOutputTokens: '', // Empty string
        topP: 0.9,
        topK: '', // Empty string
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: modelOptions as unknown as t.GoogleParameters,
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.5);
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
      expect(result.llmConfig).not.toHaveProperty('maxOutputTokens');
      expect(result.llmConfig).not.toHaveProperty('topK');
    });

    it('should preserve zero values (not treat them as empty)', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          temperature: 0,
          topK: 0,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0);
      expect(result.llmConfig).toHaveProperty('topK', 0);
    });
  });

  describe('Vertex AI Configuration', () => {
    it('should configure Vertex AI with service account credentials', () => {
      const credentials = {
        [AuthKeys.GOOGLE_SERVICE_KEY]: {
          project_id: 'test-project',
          client_email: 'test@test-project.iam.gserviceaccount.com',
          private_key: 'test-private-key',
        },
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-pro',
        },
      });

      expect(result.provider).toBe(Providers.VERTEXAI);
      expect(result.llmConfig).toHaveProperty('authOptions');
      expect((result.llmConfig as Record<string, unknown>).authOptions).toMatchObject({
        projectId: 'test-project',
        credentials: expect.objectContaining({
          project_id: 'test-project',
        }),
      });
      expect(result.llmConfig).toHaveProperty('location', 'us-central1');
    });

    it('should use GOOGLE_LOC env variable for Vertex AI location', () => {
      process.env.GOOGLE_LOC = 'europe-west1';

      const credentials = {
        [AuthKeys.GOOGLE_SERVICE_KEY]: {
          project_id: 'test-project',
        },
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-pro',
        },
      });

      expect(result.llmConfig).toHaveProperty('location', 'europe-west1');
    });

    it('should handle service key as JSON string', () => {
      const credentials = {
        [AuthKeys.GOOGLE_SERVICE_KEY]: JSON.stringify({
          project_id: 'test-project',
          client_email: 'test@test.iam.gserviceaccount.com',
        }),
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-pro',
        },
      });

      expect(result.provider).toBe(Providers.VERTEXAI);
    });
  });

  describe('Thinking Configuration', () => {
    it('should enable thinking for Google provider with valid budget', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-2.0-flash-thinking-exp',
          thinking: true,
          thinkingBudget: 5000,
        },
      });

      expect(result.llmConfig).toHaveProperty('thinkingConfig');
      expect((result.llmConfig as Record<string, unknown>).thinkingConfig).toMatchObject({
        thinkingBudget: 5000,
        includeThoughts: true,
      });
    });

    it('should enable thinking with dynamic budget (-1)', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-2.0-flash-thinking-exp',
          thinking: true,
          thinkingBudget: -1,
        },
      });

      expect(result.llmConfig).toHaveProperty('thinkingConfig');
      expect((result.llmConfig as Record<string, unknown>).thinkingConfig).toMatchObject({
        thinkingBudget: -1,
        includeThoughts: true,
      });
    });

    it('should not enable thinking when thinking is false', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-2.0-flash',
          thinking: false,
          thinkingBudget: 5000,
        },
      });

      expect(result.llmConfig).not.toHaveProperty('thinkingConfig');
    });

    it('should not enable thinking when budget is 0', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-2.0-flash',
          thinking: true,
          thinkingBudget: 0,
        },
      });

      expect(result.llmConfig).not.toHaveProperty('thinkingConfig');
    });

    it('should enable thinking for Vertex AI provider', () => {
      const credentials = {
        [AuthKeys.GOOGLE_SERVICE_KEY]: {
          project_id: 'test-project',
        },
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-2.0-flash-thinking-exp',
          thinking: true,
          thinkingBudget: 3000,
        },
      });

      expect(result.provider).toBe(Providers.VERTEXAI);
      expect(result.llmConfig).toHaveProperty('thinkingBudget', 3000);
      expect(result.llmConfig).toHaveProperty('includeThoughts', true);
    });
  });

  describe('Web Search Functionality', () => {
    it('should enable web search when web_search is true', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          web_search: true,
        },
      });

      expect(result.tools).toContainEqual({ googleSearch: {} });
    });

    it('should not include web search tools when web_search is false', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          web_search: false,
        },
      });

      expect(result.tools).not.toContainEqual({ googleSearch: {} });
    });

    it('should enable web search via defaultParams', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
        defaultParams: {
          web_search: true,
        },
      });

      expect(result.tools).toContainEqual({ googleSearch: {} });
    });

    it('should enable web search via addParams', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
        addParams: {
          web_search: true,
        },
      });

      expect(result.tools).toContainEqual({ googleSearch: {} });
    });

    it('should disable web search via dropParams', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          web_search: true,
        },
        dropParams: ['web_search'],
      });

      expect(result.tools).not.toContainEqual({ googleSearch: {} });
    });
  });

  describe('Default and Add Parameters', () => {
    it('should apply default parameters when fields are undefined', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
        defaultParams: {
          temperature: 0.5,
          topP: 0.9,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.5);
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
    });

    it('should NOT override existing values with default parameters', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          temperature: 0.8,
        },
        defaultParams: {
          temperature: 0.5,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.8);
    });

    it('should apply addParams and override defaults', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
        defaultParams: {
          temperature: 0.5,
        },
        addParams: {
          temperature: 0.9,
          seed: 42,
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.9);
      expect(result.llmConfig).toHaveProperty('seed', 42);
    });

    it('should only apply known Google params from defaultParams', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
        defaultParams: {
          temperature: 0.7,
          unknown_param: 'should_not_appear',
        },
      });

      expect(result.llmConfig).toHaveProperty('temperature', 0.7);
      expect(result.llmConfig).not.toHaveProperty('unknown_param');
    });
  });

  describe('Drop Parameters', () => {
    it('should drop specified parameters from llmConfig', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          temperature: 0.7,
          topP: 0.9,
        },
        dropParams: ['temperature'],
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
    });

    it('should handle dropping multiple parameters', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
          temperature: 0.7,
          topP: 0.9,
          topK: 40,
        },
        dropParams: ['temperature', 'topK'],
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).not.toHaveProperty('topK');
      expect(result.llmConfig).toHaveProperty('topP', 0.9);
    });
  });

  describe('Reverse Proxy Configuration', () => {
    it('should include reverse proxy URL when provided', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
        reverseProxyUrl: 'https://custom-proxy.example.com',
      });

      expect(result.llmConfig).toHaveProperty('baseUrl', 'https://custom-proxy.example.com');
    });

    it('should include custom auth header when authHeader is true', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {
          model: 'gemini-1.5-flash',
        },
        reverseProxyUrl: 'https://custom-proxy.example.com',
        authHeader: true,
      });

      expect(result.llmConfig).toHaveProperty('customHeaders');
      expect((result.llmConfig as Record<string, unknown>).customHeaders).toMatchObject({
        Authorization: 'Bearer test-api-key',
      });
    });
  });

  describe('Error Handling', () => {
    it('should throw error when missing credentials', () => {
      expect(() => {
        getGoogleConfig(undefined, {
          modelOptions: {
            model: 'gemini-1.5-flash',
          },
        });
      }).toThrow('Invalid credentials provided');
    });

    it('should throw error when credentials are empty object', () => {
      expect(() => {
        getGoogleConfig(
          {},
          {
            modelOptions: {
              model: 'gemini-1.5-flash',
            },
          },
        );
      }).toThrow('Invalid credentials provided');
    });

    it('should throw error when JSON parsing fails', () => {
      expect(() => {
        getGoogleConfig('invalid-json', {
          modelOptions: {
            model: 'gemini-1.5-flash',
          },
        });
      }).toThrow('Error parsing string credentials');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty modelOptions', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: {},
      });

      // Empty string model is removed by removeNullishValues with removeEmptyStrings=true
      expect(result.llmConfig).not.toHaveProperty('model');
      expect(result.llmConfig).toHaveProperty('maxRetries', 2);
    });

    it('should handle undefined modelOptions', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials, {});

      // Empty string model is removed by removeNullishValues with removeEmptyStrings=true
      expect(result.llmConfig).not.toHaveProperty('model');
    });

    it('should handle no options parameter', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const result = getGoogleConfig(credentials);

      // Empty string model is removed by removeNullishValues with removeEmptyStrings=true
      expect(result.llmConfig).not.toHaveProperty('model');
      expect(result.provider).toBe(Providers.GOOGLE);
    });

    it('should handle nullish values removal', () => {
      const credentials = {
        [AuthKeys.GOOGLE_API_KEY]: 'test-api-key',
      };

      const modelOptions = {
        model: 'gemini-1.5-flash',
        temperature: undefined,
        topP: null,
        topK: 0, // Should be preserved
      };

      const result = getGoogleConfig(credentials, {
        modelOptions: modelOptions as unknown as t.GoogleParameters,
      });

      expect(result.llmConfig).not.toHaveProperty('temperature');
      expect(result.llmConfig).not.toHaveProperty('topP');
      expect(result.llmConfig).toHaveProperty('topK', 0);
    });
  });
});

describe('getSafetySettings', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.GOOGLE_EXCLUDE_SAFETY_SETTINGS;
    delete process.env.GOOGLE_SAFETY_SEXUALLY_EXPLICIT;
    delete process.env.GOOGLE_SAFETY_HATE_SPEECH;
    delete process.env.GOOGLE_SAFETY_HARASSMENT;
    delete process.env.GOOGLE_SAFETY_DANGEROUS_CONTENT;
    delete process.env.GOOGLE_SAFETY_CIVIC_INTEGRITY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return default safety settings', () => {
    const settings = getSafetySettings('gemini-1.5-flash');

    expect(settings).toHaveLength(5);
    expect(settings).toContainEqual({
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'HARM_BLOCK_THRESHOLD_UNSPECIFIED',
    });
  });

  it('should return undefined when GOOGLE_EXCLUDE_SAFETY_SETTINGS is enabled', () => {
    process.env.GOOGLE_EXCLUDE_SAFETY_SETTINGS = 'true';

    const settings = getSafetySettings('gemini-1.5-flash');

    expect(settings).toBeUndefined();
  });

  it('should map OFF to BLOCK_NONE for Gemini 1.x models', () => {
    process.env.GOOGLE_SAFETY_SEXUALLY_EXPLICIT = 'OFF';

    const settings = getSafetySettings('gemini-1.5-flash');

    expect(settings).toContainEqual({
      category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
      threshold: 'BLOCK_NONE',
    });
  });

  it('should use custom thresholds from environment variables', () => {
    process.env.GOOGLE_SAFETY_HATE_SPEECH = 'BLOCK_MEDIUM_AND_ABOVE';

    const settings = getSafetySettings('gemini-1.5-flash');

    expect(settings).toContainEqual({
      category: 'HARM_CATEGORY_HATE_SPEECH',
      threshold: 'BLOCK_MEDIUM_AND_ABOVE',
    });
  });
});

describe('knownGoogleParams', () => {
  it('should contain essential Google parameters', () => {
    expect(knownGoogleParams.has('model')).toBe(true);
    expect(knownGoogleParams.has('temperature')).toBe(true);
    expect(knownGoogleParams.has('maxOutputTokens')).toBe(true);
    expect(knownGoogleParams.has('topP')).toBe(true);
    expect(knownGoogleParams.has('topK')).toBe(true);
    expect(knownGoogleParams.has('apiKey')).toBe(true);
    expect(knownGoogleParams.has('safetySettings')).toBe(true);
  });

  it('should not contain non-Google parameters', () => {
    expect(knownGoogleParams.has('max_tokens')).toBe(false);
    expect(knownGoogleParams.has('frequency_penalty')).toBe(false);
    expect(knownGoogleParams.has('presence_penalty')).toBe(false);
  });
});

const axios = require('axios');
const { logger } = require('@librechat/data-schemas');

jest.mock('axios');
jest.mock('@librechat/data-schemas', () => {
  return {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
    },
  };
});

// Mock extractBaseURL from @librechat/api
jest.mock('@librechat/api', () => {
  const actualModule = jest.requireActual('@librechat/api');
  return {
    ...actualModule,
    extractBaseURL: jest.fn((url) => {
      // Simple mock: return the URL as-is, or default if undefined/null
      if (!url) {
        return 'https://openrouter.ai/api/v1';
      }
      return url;
    }),
  };
});

const OpenRouterImageGen = require('../OpenRouterImageGen');
const { extractBaseURL } = require('@librechat/api');

describe('OpenRouterImageGen', () => {
  let originalEnv;
  const mockApiKey = 'mock_openrouter_api_key';
  const mockBaseUrl = 'https://openrouter.ai/api/v1';

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: mockApiKey,
    };
    extractBaseURL.mockImplementation((url) => url || mockBaseUrl);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Constructor', () => {
    it('should throw an error if not used in agent context and override is false', () => {
      expect(() => new OpenRouterImageGen({ override: false })).toThrow(
        'This tool is only available for agents.',
      );
    });

    it('should not throw an error if override is true', () => {
      expect(() => new OpenRouterImageGen({ override: true })).not.toThrow();
    });

    it('should not throw an error if isAgent is true', () => {
      expect(() => new OpenRouterImageGen({ isAgent: true })).not.toThrow();
    });

    it('should throw an error if OPENROUTER_API_KEY is missing and override is false', () => {
      delete process.env.OPENROUTER_API_KEY;
      expect(() => new OpenRouterImageGen({ isAgent: true })).toThrow(
        'Missing OPENROUTER_API_KEY environment variable.',
      );
    });

    it('should use API key from fields if provided', () => {
      const customApiKey = 'custom_api_key';
      const tool = new OpenRouterImageGen({
        isAgent: true,
        OPENROUTER_API_KEY: customApiKey,
      });
      expect(tool.apiKey).toBe(customApiKey);
    });

  });

  describe('supportsAspectRatio', () => {
    it('should return true for known Gemini models', () => {
      expect(
        OpenRouterImageGen.supportsAspectRatio('google/gemini-2.5-flash-image-preview'),
      ).toBe(true);
    });

    it('should return false for known non-Gemini models', () => {
      expect(OpenRouterImageGen.supportsAspectRatio('black-forest-labs/flux.2-pro')).toBe(false);
      expect(OpenRouterImageGen.supportsAspectRatio('black-forest-labs/flux.2-flex')).toBe(false);
    });

    it('should return true for unknown models with "gemini" in name', () => {
      expect(OpenRouterImageGen.supportsAspectRatio('google/gemini-unknown-model')).toBe(true);
      expect(OpenRouterImageGen.supportsAspectRatio('GEMINI-TEST-MODEL')).toBe(true);
    });

    it('should return false for unknown models without "gemini" in name', () => {
      expect(OpenRouterImageGen.supportsAspectRatio('unknown/model-name')).toBe(false);
    });
  });


  describe('_call', () => {
    let tool;

    beforeEach(() => {
      tool = new OpenRouterImageGen({ isAgent: true });
    });

    it('should throw error if prompt is missing', async () => {
      await expect(tool._call({})).rejects.toThrow('Missing required field: prompt');
    });

    it('should make API call with correct parameters for FLUX model', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tool._call({
        prompt: 'A beautiful sunset over mountains',
        model: 'black-forest-labs/flux.2-pro',
      });

      expect(axios.post).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          model: 'black-forest-labs/flux.2-pro',
          messages: [
            {
              role: 'user',
              content: 'A beautiful sunset over mountains',
            },
          ],
          modalities: ['image', 'text'],
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://librechat.ai',
          }),
        }),
      );

      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toBeInstanceOf(Array);
      expect(result[0][0].type).toBe('text');
      expect(result[1].content).toBeDefined();
      expect(result[1].content[0].type).toBe('image_url');
    });

    it('should include image_config for Gemini models with aspect ratio', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await tool._call({
        prompt: 'A wide landscape',
        model: 'google/gemini-2.5-flash-image-preview',
        aspect_ratio: '16:9',
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          image_config: {
            aspect_ratio: '16:9',
          },
        }),
        expect.any(Object),
      );
    });

    it('should warn and ignore aspect ratio for non-Gemini models', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await tool._call({
        prompt: 'A test image',
        model: 'black-forest-labs/flux.2-pro',
        aspect_ratio: '16:9',
      });

      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Aspect ratio is typically only supported for Gemini models'),
      );

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.objectContaining({
          image_config: expect.anything(),
        }),
        expect.any(Object),
      );
    });

    it('should use default model if not provided', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      await tool._call({
        prompt: 'A test image',
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model: 'black-forest-labs/flux.2-pro',
        }),
        expect.any(Object),
      );
    });

    it('should handle API errors gracefully', async () => {
      const errorResponse = {
        response: {
          data: {
            error: {
              message: 'Invalid API key',
            },
          },
        },
      };

      axios.post.mockRejectedValue(errorResponse);

      const result = await tool._call({
        prompt: 'A test image',
      });

      expect(logger.error).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toContain('Something went wrong when trying to generate the image via OpenRouter');
      expect(result[0]).toContain('Invalid API key');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network error');
      axios.post.mockRejectedValue(networkError);

      const result = await tool._call({
        prompt: 'A test image',
      });

      expect(logger.error).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toContain('Network error');
    });

    it('should handle missing image data in response', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {},
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tool._call({
        prompt: 'A test image',
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('No image data returned from OpenRouter'),
        mockResponse.data,
      );

      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toContain('No image data returned from OpenRouter API');
    });

    it('should handle empty images array', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                images: [],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tool._call({
        prompt: 'A test image',
      });

      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toContain('No image data returned from OpenRouter API');
    });

    it('should add data: prefix if image URL does not have it', async () => {
      const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: base64Image,
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tool._call({
        prompt: 'A test image',
      });

      expect(result[1].content[0].image_url.url).toBe(`data:image/png;base64,${base64Image}`);
    });

    it('should handle errors during image processing', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                images: [
                  {
                    image_url: {
                      url: null, // This will cause an error
                    },
                  },
                ],
              },
            },
          ],
        },
      };

      axios.post.mockResolvedValue(mockResponse);

      const result = await tool._call({
        prompt: 'A test image',
      });

      expect(logger.error).toHaveBeenCalled();
      expect(result).toBeInstanceOf(Array);
      expect(result[0]).toContain('Failed to process the image');
    });
  });
});


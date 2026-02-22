const OpenAI = require('openai');
const { logger } = require('@librechat/data-schemas');
const DALLE3 = require('../DALLE3');

jest.mock('openai');
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

jest.mock('tiktoken', () => {
  return {
    encoding_for_model: jest.fn().mockReturnValue({
      encode: jest.fn(),
      decode: jest.fn(),
    }),
  };
});

const processFileURL = jest.fn();

const generate = jest.fn();
OpenAI.mockImplementation(() => ({
  images: {
    generate,
  },
}));

jest.mock('fs', () => {
  return {
    existsSync: jest.fn(),
    mkdirSync: jest.fn(),
    promises: {
      writeFile: jest.fn(),
      readFile: jest.fn(),
      unlink: jest.fn(),
    },
  };
});

jest.mock('path', () => {
  return {
    resolve: jest.fn(),
    join: jest.fn(),
    relative: jest.fn(),
    extname: jest.fn().mockImplementation((filename) => {
      return filename.slice(filename.lastIndexOf('.'));
    }),
  };
});

describe('DALLE3', () => {
  let originalEnv;
  let dalle; // Keep this declaration if you need to use dalle in other tests
  const mockApiKey = 'mock_api_key';

  beforeAll(() => {
    // Save the original process.env
    originalEnv = { ...process.env };
  });

  beforeEach(() => {
    // Reset the process.env before each test
    jest.resetModules();
    process.env = { ...originalEnv, DALLE_API_KEY: mockApiKey };
    // Instantiate DALLE3 for tests that do not depend on DALLE3_SYSTEM_PROMPT
    dalle = new DALLE3({ processFileURL });
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore the original process.env after each test
    process.env = originalEnv;
  });

  it('should throw an error if all potential API keys are missing', () => {
    delete process.env.DALLE3_API_KEY;
    delete process.env.DALLE_API_KEY;
    expect(() => new DALLE3()).toThrow('Missing DALLE_API_KEY environment variable.');
  });

  it('should replace unwanted characters in input string', () => {
    const input = 'This is a test\nstring with "quotes" and new lines.';
    const expectedOutput = 'This is a test string with quotes and new lines.';
    expect(dalle.replaceUnwantedChars(input)).toBe(expectedOutput);
  });

  it('should generate markdown image URL correctly', () => {
    const imageName = 'test.png';
    const markdownImage = dalle.wrapInMarkdown(imageName);
    expect(markdownImage).toBe('![generated image](test.png)');
  });

  it('should call OpenAI API with correct parameters', async () => {
    const mockData = {
      prompt: 'A test prompt',
      quality: 'standard',
      size: '1024x1024',
      style: 'vivid',
    };

    const mockResponse = {
      data: [
        {
          url: 'http://example.com/img-test.png',
        },
      ],
    };

    generate.mockResolvedValue(mockResponse);
    processFileURL.mockResolvedValue({
      filepath: 'http://example.com/img-test.png',
    });

    const result = await dalle._call(mockData);

    expect(generate).toHaveBeenCalledWith({
      model: 'dall-e-3',
      quality: mockData.quality,
      style: mockData.style,
      size: mockData.size,
      prompt: mockData.prompt,
      n: 1,
    });

    expect(result).toContain('![generated image]');
  });

  it('should use the system prompt if provided', () => {
    process.env.DALLE3_SYSTEM_PROMPT = 'System prompt for testing';
    jest.resetModules(); // This will ensure the module is fresh and will read the new env var
    const DALLE3 = require('../DALLE3'); // Re-require after setting the env var
    const dalleWithSystemPrompt = new DALLE3();
    expect(dalleWithSystemPrompt.description_for_model).toBe('System prompt for testing');
  });

  it('should not use the system prompt if not provided', async () => {
    delete process.env.DALLE3_SYSTEM_PROMPT;
    const dalleWithoutSystemPrompt = new DALLE3();
    expect(dalleWithoutSystemPrompt.description_for_model).not.toBe('System prompt for testing');
  });

  it('should throw an error if prompt is missing', async () => {
    const mockData = {
      quality: 'standard',
      size: '1024x1024',
      style: 'vivid',
    };
    await expect(dalle._call(mockData)).rejects.toThrow('Missing required field: prompt');
  });

  it('should log appropriate debug values', async () => {
    const mockData = {
      prompt: 'A test prompt',
    };
    const mockResponse = {
      data: [
        {
          url: 'http://example.com/invalid-url',
        },
      ],
    };

    generate.mockResolvedValue(mockResponse);
    await dalle._call(mockData);
    expect(logger.debug).toHaveBeenCalledWith('[DALL-E-3]', {
      data: { url: 'http://example.com/invalid-url' },
      theImageUrl: 'http://example.com/invalid-url',
      extension: expect.any(String),
      imageBasename: expect.any(String),
      imageExt: expect.any(String),
      imageName: expect.any(String),
    });
  });

  it('should log an error and return the image URL if there is an error saving the image', async () => {
    const mockData = {
      prompt: 'A test prompt',
    };
    const mockResponse = {
      data: [
        {
          url: 'http://example.com/img-test.png',
        },
      ],
    };
    const error = new Error('Error while saving the image');
    generate.mockResolvedValue(mockResponse);
    processFileURL.mockRejectedValue(error);
    const result = await dalle._call(mockData);
    expect(logger.error).toHaveBeenCalledWith('Error while saving the image:', error);
    expect(result).toBe('Failed to save the image locally. Error while saving the image');
  });

  it('should handle error when saving image to Firebase Storage fails', async () => {
    const mockData = {
      prompt: 'A test prompt',
    };
    const mockImageUrl = 'http://example.com/img-test.png';
    const mockResponse = { data: [{ url: mockImageUrl }] };
    const error = new Error('Error while saving to Firebase');
    generate.mockResolvedValue(mockResponse);
    processFileURL.mockRejectedValue(error);

    const result = await dalle._call(mockData);

    expect(logger.error).toHaveBeenCalledWith('Error while saving the image:', error);
    expect(result).toContain('Failed to save the image');
  });
});

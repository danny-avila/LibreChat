const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const DALLE3 = require('../DALLE3');
const {
  getFirebaseStorage,
  saveImageToFirebaseStorage,
} = require('~/server/services/Files/Firebase');
const saveImageFromUrl = require('../../saveImageFromUrl');
const { logger } = require('~/config');

jest.mock('openai');

jest.mock('~/server/services/Files/Firebase', () => ({
  getFirebaseStorage: jest.fn(),
  saveImageToFirebaseStorage: jest.fn(),
  getFirebaseStorageImageUrl: jest.fn(),
}));

jest.mock('~/server/services/Files/images', () => ({
  getImageBasename: jest.fn().mockImplementation((url) => {
    // Split the URL by '/'
    const parts = url.split('/');

    // Get the last part of the URL
    const lastPart = parts.pop();

    // Check if the last part of the URL matches the image extension regex
    const imageExtensionRegex = /\.(jpg|jpeg|png|gif|bmp|tiff|svg)$/i;
    if (imageExtensionRegex.test(lastPart)) {
      return lastPart;
    }

    // If the regex test fails, return an empty string
    return '';
  }),
}));

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
  };
});

jest.mock('../../saveImageFromUrl', () => {
  return jest.fn();
});

jest.mock('path', () => {
  return {
    resolve: jest.fn(),
    join: jest.fn(),
    relative: jest.fn(),
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
    dalle = new DALLE3();
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Restore the original process.env after each test
    process.env = originalEnv;
  });

  it('should throw an error if DALLE_API_KEY is missing', () => {
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
    path.join.mockReturnValue('images/test.png');
    path.relative.mockReturnValue('images/test.png');
    const markdownImage = dalle.getMarkdownImageUrl(imageName);
    expect(markdownImage).toBe('![generated image](/images/test.png)');
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
    saveImageFromUrl.mockResolvedValue(true);
    fs.existsSync.mockReturnValue(true);
    path.resolve.mockReturnValue('/fakepath/images');
    path.join.mockReturnValue('/fakepath/images/img-test.png');
    path.relative.mockReturnValue('images/img-test.png');

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

  it('should log to console if no image name is found in the URL', async () => {
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
    expect(logger.debug).toHaveBeenCalledWith('[DALL-E-3] No image name found in the string.', {
      data: { url: 'http://example.com/invalid-url' },
      theImageUrl: 'http://example.com/invalid-url',
    });
  });

  it('should create the directory if it does not exist', async () => {
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
    generate.mockResolvedValue(mockResponse);
    fs.existsSync.mockReturnValue(false); // Simulate directory does not exist
    await dalle._call(mockData);
    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
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
    saveImageFromUrl.mockRejectedValue(error);
    const result = await dalle._call(mockData);
    expect(logger.error).toHaveBeenCalledWith('Error while saving the image locally:', error);
    expect(result).toBe('Failed to save the image locally. Error while saving the image');
  });

  it('should save image to Firebase Storage if Firebase is initialized', async () => {
    const mockData = {
      prompt: 'A test prompt',
    };
    const mockImageUrl = 'http://example.com/img-test.png';
    const mockResponse = { data: [{ url: mockImageUrl }] };
    generate.mockResolvedValue(mockResponse);
    getFirebaseStorage.mockReturnValue({}); // Simulate Firebase being initialized

    await dalle._call(mockData);

    expect(getFirebaseStorage).toHaveBeenCalled();
    expect(saveImageToFirebaseStorage).toHaveBeenCalledWith(
      undefined,
      mockImageUrl,
      expect.any(String),
    );
  });

  it('should handle error when saving image to Firebase Storage fails', async () => {
    const mockData = {
      prompt: 'A test prompt',
    };
    const mockImageUrl = 'http://example.com/img-test.png';
    const mockResponse = { data: [{ url: mockImageUrl }] };
    const error = new Error('Error while saving to Firebase');
    generate.mockResolvedValue(mockResponse);
    getFirebaseStorage.mockReturnValue({}); // Simulate Firebase being initialized
    saveImageToFirebaseStorage.mockRejectedValue(error);

    const result = await dalle._call(mockData);

    expect(logger.error).toHaveBeenCalledWith(
      'Error while saving the image to Firebase Storage:',
      error,
    );
    expect(result).toBe(
      'Failed to save the image to Firebase Storage. Error while saving to Firebase',
    );
  });
});

const extractBaseURL = require('./extractBaseURL');

describe('extractBaseURL', () => {
  test('should extract base URL up to /v1 for standard endpoints', () => {
    const url = 'https://localhost:8080/v1/chat/completions';
    expect(extractBaseURL(url)).toBe('https://localhost:8080/v1');
  });

  test('should include /openai in the extracted URL when present', () => {
    const url = 'https://localhost:8080/v1/openai';
    expect(extractBaseURL(url)).toBe('https://localhost:8080/v1/openai');
  });

  test('should stop at /openai and not include any additional paths', () => {
    const url = 'https://fake.open.ai/v1/openai/you-are-cool';
    expect(extractBaseURL(url)).toBe('https://fake.open.ai/v1/openai');
  });

  test('should return the correct base URL for official openai endpoints', () => {
    const url = 'https://api.openai.com/v1/chat/completions';
    expect(extractBaseURL(url)).toBe('https://api.openai.com/v1');
  });

  test('should handle URLs with reverse proxy pattern correctly', () => {
    const url = 'https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/openai/completions';
    expect(extractBaseURL(url)).toBe(
      'https://gateway.ai.cloudflare.com/v1/ACCOUNT_TAG/GATEWAY/openai',
    );
  });

  test('should return input if the URL does not match the expected pattern', () => {
    const url = 'https://someotherdomain.com/notv1';
    expect(extractBaseURL(url)).toBe(url);
  });

  // Test our JSDoc examples.
  test('should extract base URL up to /v1 for open.ai standard endpoint', () => {
    const url = 'https://open.ai/v1/chat';
    expect(extractBaseURL(url)).toBe('https://open.ai/v1');
  });

  test('should extract base URL up to /v1 for open.ai standard endpoint with additional path', () => {
    const url = 'https://open.ai/v1/chat/completions';
    expect(extractBaseURL(url)).toBe('https://open.ai/v1');
  });

  test('should handle URLs with ACCOUNT/GATEWAY pattern followed by /openai', () => {
    const url = 'https://open.ai/v1/ACCOUNT/GATEWAY/openai/completions';
    expect(extractBaseURL(url)).toBe('https://open.ai/v1/ACCOUNT/GATEWAY/openai');
  });

  test('should include /openai in the extracted URL with additional segments', () => {
    const url = 'https://open.ai/v1/hi/openai';
    expect(extractBaseURL(url)).toBe('https://open.ai/v1/hi/openai');
  });
});

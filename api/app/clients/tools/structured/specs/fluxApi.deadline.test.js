const axios = require('axios');
const FluxAPI = require('../FluxAPI');

jest.mock('axios', () => {
  const mock = { post: jest.fn(), get: jest.fn(), interceptors: { request: { use: jest.fn() } } };
  mock.create = () => mock;
  mock.default = mock;
  return mock;
});

describe('FluxAPI result polling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gives up once the image generation budget is spent on a status that never becomes Ready', async () => {
    axios.post.mockResolvedValue({ data: { id: 'task-1' } });
    axios.get.mockResolvedValue({ data: { status: 'Content Moderated' } });
    const tool = new FluxAPI({
      FLUX_API_KEY: 'test-key',
      req: { user: { id: 'user-1' }, config: { timeouts: { imageGenerationMs: 2_500 } } },
    });

    const result = await tool._call({ prompt: 'a lighthouse at dusk' });

    expect(result).toBe('No image data received from Flux API.');
    expect(axios.get.mock.calls.length).toBeLessThanOrEqual(2);
    expect(axios.post.mock.calls[0][2]).toMatchObject({ timeout: 2_500 });
  }, 15_000);
});

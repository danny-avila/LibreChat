const axios = require('axios');
const AzureSoraTool = require('~/app/clients/tools/structured/AzureSora');

jest.mock('axios');
jest.mock('@librechat/data-schemas', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('@librechat/api', () => ({
  logAxiosError: jest.fn(),
}));

process.env.AZURE_SORA_POLL_INTERVAL_MS = '10';
jest.setTimeout(20000);

describe('AzureSora Video Generation Tool', () => {
  const baseFields = {
    userId: 'user-1',
    AZURE_SORA_API_KEY: 'test-key',
    AZURE_SORA_ENDPOINT: 'https://test-resource.openai.azure.com',
    fileStrategy: 'local',
    processFileURL: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    axios.post.mockReset();
    axios.get.mockReset();
    processFileDefaults();
  });

  const processFileDefaults = () => {
    baseFields.processFileURL.mockResolvedValue({
      file_id: 'file-1',
      filepath: '/files/vid-job-1.mp4',
    });
  };

  const buildTool = (overrides = {}) =>
    new AzureSoraTool({ ...baseFields, ...overrides });

  test('generates a video end-to-end and returns a video_url artifact', async () => {
    const tool = buildTool();

    axios.post.mockResolvedValueOnce({ data: { id: 'job-1', status: 'queued' } });
    axios.get
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'running' } })
      .mockResolvedValueOnce({ data: { id: 'job-1', status: 'succeeded' } });

    // content download (arraybuffer)
    axios.get.mockResolvedValueOnce({
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    });

    const [textResponse, artifact] = await tool._call({
      prompt: 'a drone shot over a coastline at sunset',
    });

    const submitUrl = axios.post.mock.calls[0][0];
    expect(submitUrl).toBe(
      'https://test-resource.openai.azure.com/openai/v1/video/generations/jobs?api-version=preview',
    );
    expect(axios.post.mock.calls[0][1]).toMatchObject({
      model: 'sora',
      prompt: 'a drone shot over a coastline at sunset',
      size: '1280x720',
      seconds: '4',
    });
    expect(axios.post.mock.calls[0][2].headers['api-key']).toBe('test-key');

    expect(textResponse[0].type).toBe('text');
    expect(artifact.content[0].type).toBe('video_url');
    expect(artifact.content[0].video_url.url).toBe('/files/vid-job-1.mp4');
    expect(artifact.file_ids).toEqual(['file-1']);
  });

  test('throws a descriptive error when the job fails', async () => {
    const tool = buildTool();

    axios.post.mockResolvedValueOnce({ data: { id: 'job-2' } });
    axios.get.mockResolvedValueOnce({
      data: { id: 'job-2', status: 'failed', error: { message: 'content policy' } },
    });

    await expect(
      tool._call({ prompt: 'bad prompt' }),
    ).rejects.toThrow('Azure Sora generation failed: content policy');
  });

  test('throws when credentials are not configured', async () => {
    const tool = new AzureSoraTool({
      userId: 'user-1',
      AZURE_SORA_API_KEY: '',
      AZURE_SORA_ENDPOINT: '',
      processFileURL: baseFields.processFileURL,
    });

    await expect(tool._call({ prompt: 'test' })).rejects.toThrow(
      /Azure Sora is not configured/,
    );
  });

  test('throws when the submission endpoint is unreachable', async () => {
    const tool = buildTool();

    axios.post.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await expect(
      tool._call({ prompt: 'test prompt' }),
    ).rejects.toThrow(/Failed to submit the video generation job/);
  });
});

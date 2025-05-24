const fs = require('fs');

const mockAxios = {
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
  create: jest.fn().mockReturnValue({
    defaults: { proxy: null },
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
  }),
  get: jest.fn().mockResolvedValue({ data: {} }),
  post: jest.fn().mockResolvedValue({ data: {} }),
  put: jest.fn().mockResolvedValue({ data: {} }),
  delete: jest.fn().mockResolvedValue({ data: {} }),
  reset: jest.fn().mockImplementation(function () {
    this.get.mockClear();
    this.post.mockClear();
    this.put.mockClear();
    this.delete.mockClear();
    this.create.mockClear();
  }),
};

jest.mock('axios', () => mockAxios);
jest.mock('fs');
jest.mock('~/config', () => ({
  logger: { error: jest.fn() },
}));

const { uploadAzureDocumentIntelligence } = require('./crud');

describe('AzureDocumentIntelligence Service', () => {
  beforeEach(() => {
    mockAxios.reset();
    fs.readFileSync.mockReset();
  });

  it('should upload and poll until it gets the Markdown result', async () => {
    const mockFileBuffer = Buffer.from('test file content');
    const mockBase64 = mockFileBuffer.toString('base64');
    const mockOpLocation = 'https://azure-ocr-endpoint.com/operations/123';
    const mockResultUrl = 'https://azure-ocr-endpoint.com/results/123';
    const mockFinal = { analyzeResult: { content: 'Final analysis result' } };

    // fs.readFileSync returns our buffer
    fs.readFileSync.mockReturnValue(mockFileBuffer);

    // First axios.post => returns Operation-Location header
    mockAxios.post.mockResolvedValueOnce({
      headers: { 'Operation-Location': mockOpLocation },
    });

    // First axios.get => poll success, returns status + resultUrl
    // Second axios.get => fetch final result
    mockAxios.get
      .mockResolvedValueOnce({ data: { status: 'succeeded', resultUrl: mockResultUrl } })
      .mockResolvedValueOnce({ data: mockFinal });

    const result = await uploadAzureDocumentIntelligence({
      filePath: '/path/to/test.pdf',
      apiKey: 'azure-api-key',
      endpoint: 'https://azure-ocr-endpoint.com/',
      modelId: 'prebuilt-layout',
    });

    // Validate read
    expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/test.pdf');

    // Validate initial POST
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://azure-ocr-endpoint.com/documentModels/prebuilt-layout:analyze?outputContentFormat=markdown',
      { base64Source: mockBase64 },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Ocp-Apim-Subscription-Key': 'azure-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );

    // Validate polling GET
    expect(mockAxios.get).toHaveBeenCalledWith(
      mockOpLocation,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Ocp-Apim-Subscription-Key': 'azure-api-key' }),
      }),
    );

    // Validate final fetch GET
    expect(mockAxios.get).toHaveBeenCalledWith(
      mockResultUrl,
      expect.objectContaining({
        headers: expect.objectContaining({ 'Ocp-Apim-Subscription-Key': 'azure-api-key' }),
      }),
    );

    expect(result).toEqual('Final analysis result');
  });
});

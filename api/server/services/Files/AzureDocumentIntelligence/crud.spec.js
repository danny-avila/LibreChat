const fs = require('fs');

const mockAxios = {
  interceptors: {
    request: { use: jest.fn(), eject: jest.fn() },
    response: { use: jest.fn(), eject: jest.fn() },
  },
  create: jest.fn().mockReturnValue({
    defaults: {
      proxy: null,
    },
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
  logger: {
    error: jest.fn(),
  },
  createAxiosInstance: () => mockAxios,
}));
jest.mock('~/server/services/Tools/credentials', () => ({
  loadAuthValues: jest.fn(),
}));

const { uploadAzureDocumentIntelligence } = require('./crud');

describe('AzureDocumentIntelligence Service', () => {
  it('should upload a document and process the result using Azure Document Intelligence API', async () => {
    const mockFileBuffer = Buffer.from('test file content');
    const mockBase64Source = mockFileBuffer.toString('base64');
    const mockOperationLocation = 'https://azure-ocr-endpoint.com/operation';
    const mockResultUrl = 'https://azure-ocr-endpoint.com/result';
    const mockFinalResult = { analyzeResult: { content: 'Final analysis result' } };

    fs.readFileSync.mockReturnValue(mockFileBuffer);

    mockAxios.post
      .mockResolvedValueOnce({ headers: { 'Operation-Location': mockOperationLocation } }) // Initial upload
      .mockResolvedValueOnce({ data: { status: 'succeeded', resultUrl: mockResultUrl } }); // Polling success

    mockAxios.get
      .mockResolvedValueOnce({ data: { status: 'succeeded', resultUrl: mockResultUrl } }) // Polling
      .mockResolvedValueOnce({ data: mockFinalResult }); // Final result fetch

    const result = await uploadAzureDocumentIntelligence({
      filePath: '/path/to/test.pdf',
      apiKey: 'azure-api-key',
      endpoint: 'https://azure-ocr-endpoint.com',
      modelId: 'prebuilt-layout',
    });

    expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/test.pdf');
    expect(mockAxios.post).toHaveBeenCalledWith(
      'https://azure-ocr-endpoint.com/documentModels/prebuilt-invoice:analyze',
      { base64Source: mockBase64Source },
      expect.objectContaining({
        headers: expect.objectContaining({
          'Ocp-Apim-Subscription-Key': 'azure-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(mockAxios.get).toHaveBeenCalledWith(mockOperationLocation, expect.any(Object));
    expect(mockAxios.get).toHaveBeenCalledWith(mockResultUrl, expect.any(Object));
    expect(result).toEqual(mockFinalResult.analyzeResult.content);
  });
});

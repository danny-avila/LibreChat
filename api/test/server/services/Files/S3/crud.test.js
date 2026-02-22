const { getS3URL } = require('../../../../../server/services/Files/S3/crud');

// Mock AWS SDK
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn(() => ({
    send: jest.fn(),
  })),
  GetObjectCommand: jest.fn(),
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

jest.mock('../../../../../config', () => ({
  logger: {
    error: jest.fn(),
  },
}));

const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { GetObjectCommand } = require('@aws-sdk/client-s3');

describe('S3 crud.js - test only new parameter changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AWS_BUCKET_NAME = 'test-bucket';
  });

  // Test only the new customFilename parameter
  it('should include customFilename in response headers when provided', async () => {
    getSignedUrl.mockResolvedValue('https://test-presigned-url.com');

    await getS3URL({
      userId: 'user123',
      fileName: 'test.pdf',
      customFilename: 'cleaned_filename.pdf',
    });

    // Verify the new ResponseContentDisposition parameter is added to GetObjectCommand
    const commandArgs = GetObjectCommand.mock.calls[0][0];
    expect(commandArgs.ResponseContentDisposition).toBe(
      'attachment; filename="cleaned_filename.pdf"',
    );
  });

  // Test only the new contentType parameter
  it('should include contentType in response headers when provided', async () => {
    getSignedUrl.mockResolvedValue('https://test-presigned-url.com');

    await getS3URL({
      userId: 'user123',
      fileName: 'test.pdf',
      contentType: 'application/pdf',
    });

    // Verify the new ResponseContentType parameter is added to GetObjectCommand
    const commandArgs = GetObjectCommand.mock.calls[0][0];
    expect(commandArgs.ResponseContentType).toBe('application/pdf');
  });

  it('should work without new parameters (backward compatibility)', async () => {
    getSignedUrl.mockResolvedValue('https://test-presigned-url.com');

    const result = await getS3URL({
      userId: 'user123',
      fileName: 'test.pdf',
    });

    expect(result).toBe('https://test-presigned-url.com');
  });
});

const { v4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { saveBufferToAzure, uploadFileToAzure } = require('~/server/services/Files/Azure/crud');
const { getAzureContainerClient } = require('@librechat/api');
const { uploadImageToAzure } = require('~/server/services/Files/Azure/images');

jest.mock('@librechat/api', () => {
  return {
    ...jest.requireActual('@librechat/api'),
    getAzureContainerClient: jest.fn(),
  };
});

describe('Azure CDN', () => {
  const mockGetAzureContainerClient = getAzureContainerClient;
  const mockGetBlockBlobClient = jest.fn();

  const fileName = 'test-file.png';
  let tempDir;
  let testFilePath;

  beforeEach(async () => {
    // Setup Azure mocks
    jest.resetAllMocks();
    mockGetBlockBlobClient.mockReturnValue({
      uploadData: jest.fn(),
      uploadStream: jest.fn(),
      url: 'test-url',
    });
    mockGetAzureContainerClient.mockReturnValue({
      createIfNotExists: async () => {},
      getBlockBlobClient: mockGetBlockBlobClient,
    });

    // Create a test image file (we do this each time because sometimes file uploads
    // delete the source file after upload)
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    const buffer = Buffer.from(base64Data, 'base64');
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jest-test-'));
    testFilePath = path.join(tempDir, fileName);
    await fs.promises.writeFile(testFilePath, buffer);
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  test('uploadFileToAzure() default path', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = { user: { id: v4() } };
    const file_id = v4();
    const basePath = 'my_path';

    await uploadFileToAzure({
      req,
      file,
      file_id,
      basePath,
    });

    const expectedPath = `${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(expectedPath);
  });

  test('uploadFileToAzure() path w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = { user: { id: v4() } };
    const file_id = v4();
    const basePath = 'my_path';

    await uploadFileToAzure({
      req,
      file,
      file_id,
      basePath,
      temporary: true,
    });

    const expectedPath = `tmp/${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(expectedPath);
  });

  test('saveBufferToAzure() default path', async () => {
    const userId = v4();
    const buffer = 'test';
    const basePath = 'my_path';

    await saveBufferToAzure({
      userId,
      buffer,
      fileName,
      basePath,
    });

    const expectedPath = `${basePath}/${userId}/${fileName}`;
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(expectedPath);
  });

  test('saveBufferToAzure() path w/ `temporary` parameter', async () => {
    const userId = v4();
    const buffer = 'test';
    const basePath = 'my_path';
    await saveBufferToAzure({
      userId,
      buffer,
      fileName,
      basePath,
      temporary: true,
    });
    const expectedPath = `tmp/${basePath}/${userId}/${fileName}`;
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(expectedPath);
  });

  test('uploadImageToAzure() default path', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      user: { id: v4() },
      config: { imageOutputType: 'png' },
    };
    const file_id = v4();
    const basePath = 'my_path';

    await uploadImageToAzure({
      req,
      file,
      file_id,
      endpoint: 'custom',
      basePath,
    });

    const expectedPath = `${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(expectedPath);
  });

  test('uploadImageToAzure() path w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      user: { id: v4() },
      config: { imageOutputType: 'png' },
    };
    const file_id = v4();
    const basePath = 'my_path';

    await uploadImageToAzure({
      req,
      file,
      file_id,
      endpoint: 'custom',
      basePath,
      temporary: true,
    });

    const expectedPath = `tmp/${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockGetBlockBlobClient).toHaveBeenCalledWith(expectedPath);
  });
});

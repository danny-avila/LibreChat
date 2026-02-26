const { uploadFileToS3, saveBufferToS3 } = require('~/server/services/Files/S3/crud');
const { v4 } = require('uuid');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { uploadImageToS3 } = require('~/server/services/Files/S3/images');

jest.mock('@aws-sdk/client-s3');
jest.mock('@aws-sdk/s3-request-presigner');

describe('S3 CDN', () => {
  let previousAwsRegion;
  const mockSend = jest.fn();
  const fileName = 'test-file.png';
  let tempDir;
  let testFilePath;

  beforeAll(() => {
    // S3 init requires defining a region
    previousAwsRegion = process.env.AWS_REGION;
    process.env.AWS_REGION = 'fake-region';
  });

  beforeEach(async () => {
    // Setup S3 mocks
    mockSend.mockClear();
    S3Client.mockImplementation(() => ({ send: mockSend }));
    PutObjectCommand.mockImplementation((input) => ({ input }));

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

  afterAll(() => {
    process.env.AWS_REGION = previousAwsRegion;
  });

  test('uploadFileToS3() default key', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = { user: { id: v4() } };
    const file_id = v4();
    const basePath = 'my_path';

    await uploadFileToS3({
      req,
      file,
      file_id,
      basePath,
    });

    const expectedKey = `${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockSend).toHaveBeenCalledWith(
      new PutObjectCommand(
        expect.objectContaining({
          Key: expectedKey,
        }),
      ),
    );
  });

  test('uploadFileToS3() key w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = { user: { id: v4() } };
    const file_id = v4();
    const basePath = 'my_path';

    await uploadFileToS3({
      req,
      file,
      file_id,
      basePath,
      temporary: true,
    });

    const expectedKey = `tmp/${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockSend).toHaveBeenCalledWith(
      new PutObjectCommand(
        expect.objectContaining({
          Key: expectedKey,
        }),
      ),
    );
  });

  test('saveBufferToS3() default key', async () => {
    const userId = v4();
    const buffer = 'test';
    const basePath = 'my_path';

    await saveBufferToS3({
      userId,
      buffer,
      fileName,
      basePath,
    });

    const expectedKey = `${basePath}/${userId}/${fileName}`;
    expect(mockSend).toHaveBeenCalledWith(
      new PutObjectCommand(
        expect.objectContaining({
          Key: expectedKey,
        }),
      ),
    );
  });

  test('saveBufferToS3() key w/ `temporary` parameter', async () => {
    const userId = v4();
    const buffer = 'test';
    const basePath = 'my_path';

    await saveBufferToS3({
      userId,
      buffer,
      fileName,
      basePath,
      temporary: true,
    });

    const expectedKey = `tmp/${basePath}/${userId}/${fileName}`;
    expect(mockSend).toHaveBeenCalledWith(
      new PutObjectCommand(
        expect.objectContaining({
          Key: expectedKey,
        }),
      ),
    );
  });

  test('uploadImageToS3() default key', async () => {
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

    await uploadImageToS3({
      req,
      file,
      file_id,
      endpoint: 'custom',
      basePath,
    });

    const expectedKey = `${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockSend).toHaveBeenCalledWith(
      new PutObjectCommand(
        expect.objectContaining({
          Key: expectedKey,
        }),
      ),
    );
  });

  test('uploadImageToS3() key w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      user: { id: v4() },
      config: {
        imageOutputType: 'png',
      },
    };
    const file_id = v4();
    const basePath = 'my_path';

    await uploadImageToS3({
      req,
      file,
      file_id,
      endpoint: 'custom',
      basePath,
      temporary: true,
    });

    const expectedKey = `tmp/${basePath}/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockSend).toHaveBeenCalledWith(
      new PutObjectCommand(
        expect.objectContaining({
          Key: expectedKey,
        }),
      ),
    );
  });
});

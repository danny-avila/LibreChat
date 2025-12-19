const { v4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  saveBufferToFirebase,
  uploadFileToFirebase,
} = require('~/server/services/Files/Firebase/crud');
const { ref } = require('firebase/storage');
const { uploadImageToFirebase } = require('~/server/services/Files/Firebase/images');

jest.mock('firebase/app', () => ({
  initializeApp: jest.fn().mockReturnValue({}),
}));
jest.mock('firebase/storage', () => ({
  getStorage: jest.fn().mockReturnValue('mockStorage'),
  uploadBytes: jest.fn(),
  ref: jest.fn(),
  getDownloadURL: jest.fn(),
}));

describe('Firebase CDN', () => {
  let originalEnv;

  let mockRef = ref;

  const fileName = 'test-file.png';
  let tempDir;
  let testFilePath;

  beforeAll(() => {
    // Firebase init requires defining some env vars (that will go unused since we mock FB)
    originalEnv = process.env;
    process.env = {
      ...originalEnv,
      FIREBASE_API_KEY: 'test_api_key',
      FIREBASE_AUTH_DOMAIN: 'test_auth_domain',
      FIREBASE_PROJECT_ID: 'test_project_id',
      FIREBASE_STORAGE_BUCKET: 'test_storage_bucket',
      FIREBASE_MESSAGING_SENDER_ID: 'test_messaging_sender_id',
      FIREBASE_APP_ID: 'test_app_id',
    };
  });

  beforeEach(async () => {
    // Setup Firebase mocks
    mockRef.mockClear();

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
    process.env = originalEnv;
  });

  test('uploadFileToFirebase() default path', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = { user: { id: v4() } };
    const file_id = v4();

    await uploadFileToFirebase({
      req,
      file,
      file_id,
    });

    const expectedPath = `images/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockRef).toHaveBeenCalledTimes(2);
    expect(mockRef).toHaveBeenNthCalledWith(1, 'mockStorage', expectedPath);
    expect(mockRef).toHaveBeenNthCalledWith(2, 'mockStorage', expectedPath);
  });

  test('uploadFileToFirebase() path w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = { user: { id: v4() } };
    const file_id = v4();

    await uploadFileToFirebase({
      req,
      file,
      file_id,
      temporary: true,
    });

    const expectedPath = `tmp/images/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockRef).toHaveBeenCalledTimes(2);
    expect(mockRef).toHaveBeenNthCalledWith(1, 'mockStorage', expectedPath);
    expect(mockRef).toHaveBeenNthCalledWith(2, 'mockStorage', expectedPath);
  });

  test('saveBufferToFirebase() default path', async () => {
    const userId = v4();
    const buffer = 'test';
    const basePath = 'my_path';

    await saveBufferToFirebase({
      userId,
      buffer,
      fileName,
      basePath,
    });

    const expectedPath = `${basePath}/${userId}/${fileName}`;
    expect(mockRef).toHaveBeenCalledTimes(2);
    expect(mockRef).toHaveBeenNthCalledWith(1, 'mockStorage', expectedPath);
    expect(mockRef).toHaveBeenNthCalledWith(2, 'mockStorage', expectedPath);
  });

  test('saveBufferToFirebase() path w/ `temporary` parameter', async () => {
    const userId = v4();
    const buffer = 'test';
    const basePath = 'my_path';

    await saveBufferToFirebase({
      userId,
      buffer,
      fileName,
      basePath,
      temporary: true,
    });

    const expectedPath = `tmp/${basePath}/${userId}/${fileName}`;
    expect(mockRef).toHaveBeenCalledTimes(2);
    expect(mockRef).toHaveBeenNthCalledWith(1, 'mockStorage', expectedPath);
    expect(mockRef).toHaveBeenNthCalledWith(2, 'mockStorage', expectedPath);
  });

  test('uploadImageToFirebase() default path', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      user: { id: v4() },
      config: { imageOutputType: 'png' },
    };
    const file_id = v4();

    await uploadImageToFirebase({
      req,
      file,
      file_id,
      endpoint: 'custom',
    });

    const expectedPath = `images/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockRef).toHaveBeenCalledTimes(2);
    expect(mockRef).toHaveBeenNthCalledWith(1, 'mockStorage', expectedPath);
    expect(mockRef).toHaveBeenNthCalledWith(2, 'mockStorage', expectedPath);
  });

  test('uploadImageToFirebase() path w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      user: { id: v4() },
      config: { imageOutputType: 'png' },
    };
    const file_id = v4();

    await uploadImageToFirebase({
      req,
      file,
      file_id,
      endpoint: 'custom',
      temporary: true,
    });

    const expectedPath = `tmp/images/${req.user.id}/${file_id}__${file.originalname}`;
    expect(mockRef).toHaveBeenCalledTimes(2);
    expect(mockRef).toHaveBeenNthCalledWith(1, 'mockStorage', expectedPath);
    expect(mockRef).toHaveBeenNthCalledWith(2, 'mockStorage', expectedPath);
  });
});

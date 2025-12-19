const { v4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { saveLocalBuffer, uploadLocalFile } = require('~/server/services/Files/Local/crud');
const paths = require('~/config/paths');
const { uploadLocalImage } = require('~/server/services/Files/Local/images');

describe('Local files', () => {
  const fileName = 'librechat-test-file.png';
  let tempDir;
  let testFilePath;
  const userId = 'librechat-test';
  const basePath = 'test-base-path';

  beforeEach(async () => {
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
    // Clear out any directories possibly created by these tests
    const opts = { recursive: true, force: true };
    await Promise.all([
      fs.promises.rm(tempDir, opts),
      fs.promises.rm(path.posix.join(paths.imageOutput, userId), opts),
      fs.promises.rm(path.posix.join(paths.imageOutput, 'tmp'), opts),
      fs.promises.rm(path.posix.join(paths.uploads, basePath), opts),
      fs.promises.rm(path.posix.join(paths.uploads, 'tmp'), opts),
    ]);
  });

  test('uploadLocalFile() default path', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      config: {
        paths: {
          uploads: path.posix.join(paths.uploads, basePath),
        },
      },
      user: { id: userId },
    };
    const file_id = v4();

    const { filepath } = await uploadLocalFile({
      req,
      file,
      file_id,
    });
    expect(filepath).toEqual(path.posix.join('/', 'uploads', userId, `${file_id}__${fileName}`));

    const expectedPath = path.posix.join(
      paths.uploads,
      basePath,
      userId,
      `${file_id}__${fileName}`,
    );
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });

  test('uploadLocalFile() path w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      config: {
        paths: {
          uploads: path.posix.join(paths.uploads, basePath),
        },
      },
      user: { id: userId },
    };
    const file_id = v4();

    const { filepath } = await uploadLocalFile({
      req,
      file,
      file_id,
      temporary: true,
    });
    expect(filepath).toEqual(path.posix.join('/', 'uploads', userId, `${file_id}__${fileName}`));

    const expectedPath = path.posix.join(
      paths.uploads,
      basePath,
      'tmp',
      userId,
      `${file_id}__${fileName}`,
    );
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });

  test('saveLocalBuffer() default path', async () => {
    const buffer = 'test';

    const filePath = await saveLocalBuffer({
      userId,
      buffer,
      fileName,
    });
    expect(filePath).toEqual(path.posix.join('/', 'images', userId, fileName));

    const expectedPath = path.posix.join(paths.publicPath, 'images', userId, fileName);
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });

  test('saveLocalBuffer() path w/ `temporary` parameter', async () => {
    const buffer = 'test';

    const filePath = await saveLocalBuffer({
      userId,
      buffer,
      fileName,
      temporary: true,
    });
    expect(filePath).toEqual(path.posix.join('/', 'images', 'tmp', userId, fileName));

    const expectedPath = path.posix.join(paths.publicPath, 'images', 'tmp', userId, fileName);
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });

  test('saveLocalBuffer() path w/ `basePath` parameter', async () => {
    const buffer = 'test';

    const filePath = await saveLocalBuffer({
      userId,
      buffer,
      fileName,
      basePath,
    });
    expect(filePath).toEqual(path.posix.join('/', userId, fileName));

    const expectedPath = path.posix.join(paths.uploads, userId, fileName);
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });

  test('saveLocalBuffer() path w/ `basePath` & `temporary` parameters', async () => {
    const buffer = 'test';

    const filePath = await saveLocalBuffer({
      userId,
      buffer,
      fileName,
      basePath,
      temporary: true,
    });
    expect(filePath).toEqual(path.posix.join('/', 'tmp', userId, fileName));

    const expectedPath = path.posix.join(paths.uploads, 'tmp', userId, fileName);
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });

  test('uploadLocalImage() default path', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      config: {
        paths: {
          imageOutput: paths.imageOutput,
        },
        imageOutputType: 'png',
      },
      user: { id: userId },
    };
    const file_id = v4();

    const { filepath } = await uploadLocalImage({
      req,
      file,
      file_id,
      endpoint: 'custom',
    });
    expect(filepath).toEqual(path.posix.join('/', 'images', userId, `${file_id}__${fileName}`));

    const expectedPath = path.posix.join(paths.imageOutput, userId, `${file_id}__${fileName}`);
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });

  test('uploadLocalImage() w/ `temporary` parameter', async () => {
    const file = {
      path: testFilePath,
      originalname: fileName,
    };
    const req = {
      config: {
        paths: {
          imageOutput: paths.imageOutput,
        },
        imageOutputType: 'png',
      },
      user: { id: userId },
    };
    const file_id = v4();

    const { filepath } = await uploadLocalImage({
      req,
      file,
      file_id,
      endpoint: 'custom',
      temporary: true,
    });
    expect(filepath).toEqual(
      path.posix.join('/', 'images', 'tmp', userId, `${file_id}__${fileName}`),
    );

    const expectedPath = path.posix.join(
      paths.imageOutput,
      'tmp',
      userId,
      `${file_id}__${fileName}`,
    );
    expect(fs.existsSync(expectedPath)).toEqual(true);
  });
});

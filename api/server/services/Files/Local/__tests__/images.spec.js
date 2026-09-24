jest.mock('~/models', () => ({
  updateUser: jest.fn(),
  updateFile: jest.fn(async (doc) => doc),
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const { updateFile } = require('~/models');
const sharp = require('sharp');
const { prepareImagesLocal, uploadLocalImage } = require('../images');

describe('prepareImagesLocal', () => {
  let tmpDir;
  let publicPath;
  let imageOutput;

  beforeEach(() => {
    jest.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-images-local-'));
    publicPath = path.join(tmpDir, 'public');
    imageOutput = path.join(tmpDir, 'images');
    fs.mkdirSync(path.join(publicPath, 'images', 'user-1'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const makeReq = () => ({
    user: { id: 'user-1' },
    config: { paths: { publicPath, imageOutput } },
  });

  it('strips a cache-busting query string before encoding from disk', async () => {
    const relativePath = '/images/user-1/chart.png';
    fs.writeFileSync(path.join(publicPath, relativePath), Buffer.from('fake-png-bytes'));

    const [updated, encoded] = await prepareImagesLocal(makeReq(), {
      file_id: 'file-1',
      filepath: `${relativePath}?v=1789460622697`,
    });

    expect(updateFile).toHaveBeenCalledWith({ file_id: 'file-1' });
    expect(updated).toEqual({ file_id: 'file-1' });
    expect(encoded).toBe(Buffer.from('fake-png-bytes').toString('base64'));
  });

  it('encodes a filepath without a query string', async () => {
    const relativePath = '/images/user-1/chart.png';
    fs.writeFileSync(path.join(publicPath, relativePath), Buffer.from('plain-png-bytes'));

    const [, encoded] = await prepareImagesLocal(makeReq(), {
      file_id: 'file-2',
      filepath: relativePath,
    });

    expect(encoded).toBe(Buffer.from('plain-png-bytes').toString('base64'));
  });
});

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'local-upload-image-'));

afterAll(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

describe('uploadLocalImage', () => {
  it('converts JPEG bytes to the configured PNG output while retaining the original request filename separately', async () => {
    const inputPath = path.join(tempDirectory, 'holiday.jpeg');
    const imageOutput = path.join(tempDirectory, 'images');
    await sharp({
      create: { width: 1, height: 1, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .jpeg()
      .toFile(inputPath);

    const result = await uploadLocalImage({
      req: {
        user: { id: 'image-user' },
        config: { imageOutputType: 'png', paths: { imageOutput } },
      },
      file: { path: inputPath },
      file_id: 'converted-image',
      endpoint: 'openAI',
    });

    const outputPath = path.join(imageOutput, 'image-user', 'converted-image__holiday.png');
    await expect(fs.promises.readFile(outputPath)).resolves.toMatchObject(
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    );
    expect(result.filepath).toBe('/images/image-user/converted-image__holiday.png');
    expect(fs.existsSync(inputPath)).toBe(false);
  });
});

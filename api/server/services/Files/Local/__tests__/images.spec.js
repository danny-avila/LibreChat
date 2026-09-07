jest.mock('~/models', () => ({ updateFile: jest.fn(), updateUser: jest.fn() }));

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { uploadLocalImage } = require('../images');

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

import fs from 'fs';
import type { S3ImageServiceDeps } from '~/storage/s3/images';
import type { ServerRequest } from '~/types';
import { S3ImageService } from '~/storage/s3/images';
import { saveBufferToS3 } from '~/storage/s3/crud';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../crud', () => ({
  saveBufferToS3: jest
    .fn()
    .mockResolvedValue('https://bucket.s3.amazonaws.com/avatar.png?signed=true'),
}));

const mockSaveBufferToS3 = jest.mocked(saveBufferToS3);

jest.mock('sharp', () => {
  return jest.fn(() => ({
    metadata: jest.fn().mockResolvedValue({ format: 'png', width: 100, height: 100 }),
    toFormat: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed')),
  }));
});

describe('S3ImageService', () => {
  let service: S3ImageService;
  let mockDeps: S3ImageServiceDeps;

  beforeEach(() => {
    jest.clearAllMocks();

    mockDeps = {
      resizeImageBuffer: jest.fn().mockResolvedValue({
        buffer: Buffer.from('resized'),
        width: 100,
        height: 100,
      }),
      updateUser: jest.fn().mockResolvedValue(undefined),
      updateFile: jest.fn().mockResolvedValue(undefined),
    };

    service = new S3ImageService(mockDeps);
  });

  describe('processAvatar', () => {
    it('uploads avatar and returns URL', async () => {
      const result = await service.processAvatar({
        buffer: Buffer.from('test'),
        userId: 'user123',
        manual: 'false',
      });

      expect(result).toContain('signed=true');
    });

    it('updates user avatar when manual is true', async () => {
      await service.processAvatar({
        buffer: Buffer.from('test'),
        userId: 'user123',
        manual: 'true',
      });

      expect(mockDeps.updateUser).toHaveBeenCalledWith(
        'user123',
        expect.objectContaining({ avatar: expect.any(String) }),
      );
    });

    it('does not update user when agentId is provided', async () => {
      await service.processAvatar({
        buffer: Buffer.from('test'),
        userId: 'user123',
        manual: 'true',
        agentId: 'agent456',
      });

      expect(mockDeps.updateUser).not.toHaveBeenCalled();
    });

    it('generates agent avatar filename when agentId provided', async () => {
      await service.processAvatar({
        buffer: Buffer.from('test'),
        userId: 'user123',
        manual: 'false',
        agentId: 'agent456',
      });

      expect(mockSaveBufferToS3).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: expect.stringContaining('agent-agent456-avatar-'),
        }),
      );
    });
  });

  describe('prepareImageURL', () => {
    it('returns tuple with resolved promise and filepath', async () => {
      const file = { file_id: 'file123', filepath: 'https://example.com/file.png' };
      const result = await service.prepareImageURL(file);

      expect(Array.isArray(result)).toBe(true);
      expect(result[1]).toBe('https://example.com/file.png');
    });

    it('calls updateFile with file_id', async () => {
      const file = { file_id: 'file123', filepath: 'https://example.com/file.png' };
      await service.prepareImageURL(file);

      expect(mockDeps.updateFile).toHaveBeenCalledWith({ file_id: 'file123' });
    });
  });

  describe('constructor', () => {
    it('requires dependencies to be passed', () => {
      const newService = new S3ImageService(mockDeps);
      expect(newService).toBeInstanceOf(S3ImageService);
    });
  });

  describe('uploadImageToS3', () => {
    const mockReq = {
      user: { id: 'user123' },
      config: { imageOutputType: 'webp' },
    } as unknown as ServerRequest;

    it('deletes temp file on early failure (readFile throws)', async () => {
      (fs.promises.readFile as jest.Mock).mockRejectedValueOnce(
        new Error('ENOENT: no such file or directory'),
      );
      (fs.promises.unlink as jest.Mock).mockResolvedValueOnce(undefined);

      await expect(
        service.uploadImageToS3({
          req: mockReq,
          file: { path: '/tmp/input.jpg' } as Express.Multer.File,
          file_id: 'file123',
          endpoint: 'openai',
        }),
      ).rejects.toThrow('ENOENT: no such file or directory');

      expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/input.jpg');
    });

    it('deletes temp file on resize failure (resizeImageBuffer throws)', async () => {
      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(Buffer.from('raw'));
      (mockDeps.resizeImageBuffer as jest.Mock).mockRejectedValueOnce(new Error('Resize failed'));
      (fs.promises.unlink as jest.Mock).mockResolvedValueOnce(undefined);

      await expect(
        service.uploadImageToS3({
          req: mockReq,
          file: { path: '/tmp/input.jpg' } as Express.Multer.File,
          file_id: 'file123',
          endpoint: 'openai',
        }),
      ).rejects.toThrow('Resize failed');

      expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/input.jpg');
    });

    it('deletes temp file on success', async () => {
      (fs.promises.readFile as jest.Mock).mockResolvedValueOnce(Buffer.from('raw'));
      (fs.promises.unlink as jest.Mock).mockResolvedValueOnce(undefined);

      const result = await service.uploadImageToS3({
        req: mockReq,
        file: { path: '/tmp/input.webp' } as Express.Multer.File,
        file_id: 'file123',
        endpoint: 'openai',
      });

      expect(result.filepath).toContain('signed=true');
      expect(fs.promises.unlink).toHaveBeenCalledWith('/tmp/input.webp');
    });
  });
});

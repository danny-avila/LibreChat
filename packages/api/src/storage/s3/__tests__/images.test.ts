import { S3ImageService } from '../images';
import { saveBufferToS3 } from '../crud';
import type { S3ImageServiceDeps } from '../images';

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
});

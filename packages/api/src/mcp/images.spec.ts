import { resolveImageToolArguments } from './images';

const uploadedImage = {
  file_id: 'file-upload-1',
  filepath: '/images/user-1/upload.png',
};

const imageUrl = 'data:image/png;base64,aW1hZ2U=';

function createDependencies(overrides = {}) {
  return {
    findFiles: jest.fn().mockResolvedValue([uploadedImage]),
    encodeImages: jest.fn().mockResolvedValue({
      image_urls: [{ file_id: uploadedImage.file_id, image_url: { url: imageUrl } }],
    }),
    ...overrides,
  };
}

describe('resolveImageToolArguments', () => {
  it('substitutes only an owned current-request ImageTools upload placeholder', async () => {
    const dependencies = createDependencies();
    const request = {
      body: { files: [{ file_id: uploadedImage.file_id, type: 'image/png' }] },
    };

    await expect(
      resolveImageToolArguments({
        serverName: 'image-generation',
        toolName: 'edit_image',
        toolArguments: { images: ['/mnt/data/0.png'], prompt: 'remove the robot' },
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toEqual({ images: [imageUrl], prompt: 'remove the robot' });

    expect(dependencies.findFiles).toHaveBeenCalledWith({
      file_id: { $in: [uploadedImage.file_id] },
      user: 'user-1',
    });
    expect(dependencies.encodeImages).toHaveBeenCalledWith(request, [uploadedImage]);
  });

  it('preserves request image order and generated-image values in a mixed array', async () => {
    const first = { file_id: 'first', filepath: '/images/first.png' };
    const second = { file_id: 'second', filepath: '/images/second.jpg' };
    const dependencies = createDependencies({
      findFiles: jest.fn().mockResolvedValue([second, first]),
      encodeImages: jest.fn().mockResolvedValue({
        image_urls: [
          { file_id: first.file_id, image_url: { url: 'data:image/png;base64,Zmlyc3Q=' } },
          { file_id: second.file_id, image_url: { url: 'data:image/jpeg;base64,c2Vjb25k' } },
        ],
      }),
    });
    const request = {
      body: {
        files: [
          { file_id: first.file_id, type: 'image/png' },
          { file_id: second.file_id, type: 'image/jpeg' },
        ],
      },
    };

    await expect(
      resolveImageToolArguments({
        serverName: 'image-generation',
        toolName: 'edit_image',
        toolArguments: {
          images: ['/mnt/data/1.jpg', '/app/storage/generated.png', '/mnt/data/0.png'],
        },
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toEqual({
      images: [
        'data:image/jpeg;base64,c2Vjb25k',
        '/app/storage/generated.png',
        'data:image/png;base64,Zmlyc3Q=',
      ],
    });

    expect(dependencies.encodeImages).toHaveBeenCalledWith(request, [first, second]);
  });

  it('leaves a missing request image placeholder unchanged before an owned image', async () => {
    const ownedImage = { file_id: 'owned-second', filepath: '/images/owned-second.png' };
    const dependencies = createDependencies({
      findFiles: jest.fn().mockResolvedValue([ownedImage]),
      encodeImages: jest.fn().mockResolvedValue({
        image_urls: [{ file_id: ownedImage.file_id, image_url: { url: imageUrl } }],
      }),
    });
    const request = {
      body: {
        files: [
          { file_id: 'missing-or-foreign-first', type: 'image/png' },
          { file_id: ownedImage.file_id, type: 'image/png' },
        ],
      },
    };

    await expect(
      resolveImageToolArguments({
        serverName: 'image-generation',
        toolName: 'edit_image',
        toolArguments: { images: ['/mnt/data/0.png', '/mnt/data/1.png'] },
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toEqual({ images: ['/mnt/data/0.png', imageUrl] });

    expect(dependencies.encodeImages).toHaveBeenCalledWith(request, [ownedImage]);
  });

  it('preserves the first owned placeholder when sparse encoder output contains only the second', async () => {
    const first = { file_id: 'first', filepath: '/images/first.png' };
    const second = { file_id: 'second', filepath: '/images/second.png' };
    const secondUrl = 'data:image/png;base64,c2Vjb25k';
    const dependencies = createDependencies({
      findFiles: jest.fn().mockResolvedValue([first, second]),
      encodeImages: jest.fn().mockResolvedValue({
        image_urls: [{ file_id: second.file_id, image_url: { url: secondUrl } }],
      }),
    });
    const request = {
      body: {
        files: [
          { file_id: first.file_id, type: 'image/png' },
          { file_id: second.file_id, type: 'image/png' },
        ],
      },
    };

    await expect(
      resolveImageToolArguments({
        serverName: 'image-generation',
        toolName: 'edit_image',
        toolArguments: { images: ['/mnt/data/0.png', '/mnt/data/1.png'] },
        request,
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toEqual({ images: ['/mnt/data/0.png', secondUrl] });

    expect(dependencies.encodeImages).toHaveBeenCalledWith(request, [first, second]);
  });

  it('leaves non-target MCP calls untouched', async () => {
    const dependencies = createDependencies();
    const otherServerArguments = { images: ['/mnt/data/0.png'] };
    const otherToolArguments = { images: ['/mnt/data/0.png'] };

    await expect(
      resolveImageToolArguments({
        serverName: 'other-server',
        toolName: 'edit_image',
        toolArguments: otherServerArguments,
        request: { body: { files: [{ file_id: uploadedImage.file_id, type: 'image/png' }] } },
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toBe(otherServerArguments);

    await expect(
      resolveImageToolArguments({
        serverName: 'image-generation',
        toolName: 'create_image',
        toolArguments: otherToolArguments,
        request: { body: { files: [{ file_id: uploadedImage.file_id, type: 'image/png' }] } },
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toBe(otherToolArguments);

    expect(dependencies.findFiles).not.toHaveBeenCalled();
    expect(dependencies.encodeImages).not.toHaveBeenCalled();
  });

  it('leaves generated, hostile, and non-placeholder image values untouched', async () => {
    const dependencies = createDependencies();
    const toolArguments = {
      images: [
        '/app/storage/generated.png',
        'file:///mnt/data/0.png',
        '/mnt/data/../0.png',
        '/mnt/data/0.gif',
        '/mnt/data/0.svg',
        'https://example.com/0.png',
      ],
    };

    await expect(
      resolveImageToolArguments({
        serverName: 'image-generation',
        toolName: 'edit_image',
        toolArguments,
        request: { body: { files: [{ file_id: uploadedImage.file_id, type: 'image/png' }] } },
        user: { id: 'user-1' },
        dependencies,
      }),
    ).resolves.toBe(toolArguments);

    expect(dependencies.findFiles).not.toHaveBeenCalled();
    expect(dependencies.encodeImages).not.toHaveBeenCalled();
  });
});
